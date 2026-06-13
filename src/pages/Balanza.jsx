import { useState, useEffect, useRef } from "react"
import Icon from "../components/Icon"
import { getCatalogo } from "../api"
import { fmtMoney } from "../utils"
import { SUCURSALES } from "../data"

export default function BalanzaPage({ addToast, user, sucursalActiva, sharedCartCount, onAddToVentas }) {
  const [bolsas, setBolsas]       = useState([])
  const [bolsaSel, setBolsaSel]   = useState(null)
  const [gramos, setGramos]       = useState(0)
  const [gramosManual, setGramosManual] = useState("")
  const [conectada, setConectada] = useState(false)
  const [suc, setSuc]             = useState(sucursalActiva || "centro")
  const esRef = useRef(null)

  // Cargar bolsas del catálogo
  useEffect(() => {
    getCatalogo()
      .then(cat => setBolsas(cat.filter(p => p.tipo === "bolsas")))
      .catch(() => {})
  }, [])

  // Conectar SSE con la báscula
  useEffect(() => {
    const es = new EventSource("/api/balanza/stream")
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.conectada !== undefined) setConectada(data.conectada)
        if (data.gramos !== undefined && data.conectada) {
          setGramos(data.gramos)
          setGramosManual("")
        }
      } catch {}
    }

    es.onerror = () => setConectada(false)

    return () => es.close()
  }, [])

  // Precio calculado
  const pesoActivo = conectada ? gramos : (parseFloat(gramosManual) || 0)

  const precioGramo = (bolsa) => {
    if (!bolsa) return 0
    const pKilo = bolsa.presentaciones?.find(p => p.id === "kilo")
    if (pKilo?.precio > 0) return pKilo.precio / 1000
    // Fallback: buscar cualquier presentación con factor y precio
    const conFactor = bolsa.presentaciones?.find(p => p.factor > 0 && p.precio > 0)
    return conFactor ? conFactor.precio / conFactor.factor : 0
  }

  const pgCentavo  = precioGramo(bolsaSel)
  const precioTotal = pgCentavo * pesoActivo

  const stockDisp = bolsaSel ? (bolsaSel.stock[suc] ?? 0) : 0

  const agregar = () => {
    if (!bolsaSel) return addToast({ kind: "err", msg: "Selecciona una bolsa" })
    if (pesoActivo <= 0) return addToast({ kind: "err", msg: "El peso debe ser mayor a 0" })
    if (precioTotal <= 0) return addToast({ kind: "err", msg: "Esta bolsa no tiene precio al detalle configurado" })

    const ts   = Date.now()
    const item = {
      key:       `${bolsaSel.sku}__detalle_${ts}`,
      sku:       bolsaSel.sku,
      name:      bolsaSel.name,
      presId:    `detalle_${ts}`,
      presLabel: `Al detalle (${pesoActivo} g)`,
      precio:    precioTotal,
      factor:    pesoActivo,
      nivel:     "gramo",
      facturable: bolsaSel.facturable !== false,
      esMayoreo: false,
      qty:       1,
    }
    onAddToVentas(item)
    // Limpiar peso manual para la siguiente pesada
    setGramosManual("")
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Báscula — Bolsas al detalle
            {sharedCartCount > 0 && (
              <span style={{
                marginLeft: 12, fontSize: 12, fontWeight: 600,
                background: "var(--wine-600)", color: "#fff",
                borderRadius: 12, padding: "2px 10px", verticalAlign: "middle",
              }}>
                Nota activa: {sharedCartCount} {sharedCartCount === 1 ? "item" : "items"}
              </span>
            )}
          </h1>
          <p className="page-subtitle">
            Sucursal:&nbsp;
            <select value={suc} onChange={e => setSuc(e.target.value)} style={{ fontSize: 12, border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>
              {SUCURSALES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </p>
        </div>
        {/* Indicador de conexión */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: conectada ? "var(--ok)" : "var(--warn)",
            display: "inline-block",
          }} />
          <span style={{ color: "var(--text-muted)" }}>
            {conectada ? "Báscula conectada" : "Modo manual"}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 900, margin: "0 auto" }}>

        {/* Panel izquierdo: selector de bolsa */}
        <div className="card">
          <div className="card-header"><div style={{ fontWeight: 700 }}>Tipo de bolsa</div></div>
          <div className="card-body">
            {bolsas.length === 0
              ? <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No hay bolsas en catálogo. Agrega productos de tipo "Bolsas" primero.</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {bolsas.map(b => {
                    const pKilo = b.presentaciones?.find(p => p.id === "kilo")
                    const pg    = precioGramo(b)
                    const sel   = bolsaSel?.sku === b.sku
                    return (
                      <button
                        key={b.sku}
                        onClick={() => setBolsaSel(b)}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "10px 14px", borderRadius: 8, border: `1px solid ${sel ? "var(--wine-600)" : "var(--border)"}`,
                          background: sel ? "rgba(114,24,42,.08)" : "var(--bg-sunken)",
                          cursor: "pointer", textAlign: "left",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            Cód. {b.sku} · Stock: {b.stock[suc] ?? 0} g
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          {pKilo?.precio > 0
                            ? <>
                                <div style={{ fontWeight: 700, color: "var(--wine-700)" }}>{fmtMoney(pKilo.precio)}/kg</div>
                                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>${pg.toFixed(4)}/g</div>
                              </>
                            : <span style={{ fontSize: 11, color: "var(--err)" }}>Sin precio</span>
                          }
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            }
          </div>
        </div>

        {/* Panel derecho: peso y precio */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Peso */}
          <div className="card">
            <div className="card-header"><div style={{ fontWeight: 700 }}>Peso</div></div>
            <div className="card-body" style={{ textAlign: "center" }}>
              {conectada
                ? (
                  <div>
                    <div style={{ fontSize: 72, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--wine-700)", lineHeight: 1 }}>
                      {gramos}
                    </div>
                    <div style={{ fontSize: 18, color: "var(--text-muted)", marginBottom: 8 }}>gramos</div>
                    <div style={{ fontSize: 12, color: "var(--ok)" }}>Leyendo báscula en tiempo real</div>
                  </div>
                )
                : (
                  <div>
                    <div style={{ fontSize: 12, color: "var(--warn)", marginBottom: 12 }}>
                      Báscula no detectada — ingresa el peso manualmente
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                      <input
                        type="number" min="0" step="1"
                        value={gramosManual}
                        onChange={e => setGramosManual(e.target.value)}
                        placeholder="0"
                        style={{ width: 120, fontSize: 32, textAlign: "center", fontFamily: "var(--font-mono)", fontWeight: 700 }}
                        autoFocus
                      />
                      <span style={{ fontSize: 18, color: "var(--text-muted)" }}>g</span>
                    </div>
                  </div>
                )
              }
            </div>
          </div>

          {/* Precio calculado */}
          <div className="card" style={{ background: bolsaSel && pesoActivo > 0 ? "var(--bg-card)" : "var(--bg-sunken)" }}>
            <div className="card-body" style={{ textAlign: "center", padding: 24 }}>
              {bolsaSel && pesoActivo > 0 && pgCentavo > 0
                ? (
                  <>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                      {pesoActivo} g × ${pgCentavo.toFixed(4)}/g
                    </div>
                    <div style={{ fontSize: 52, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--ok)", lineHeight: 1 }}>
                      {fmtMoney(precioTotal)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      {bolsaSel.name} · {pesoActivo} g
                    </div>
                    {stockDisp < pesoActivo && (
                      <div style={{ fontSize: 12, color: "var(--warn)", marginTop: 8 }}>
                        ⚠ Stock disponible: {stockDisp} g
                      </div>
                    )}
                  </>
                )
                : (
                  <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>
                    {!bolsaSel ? "Selecciona una bolsa" : pesoActivo <= 0 ? "Esperando peso…" : "Esta bolsa no tiene precio al kilo configurado"}
                  </div>
                )
              }
            </div>
          </div>

          {/* Botón agregar a nota */}
          <button
            className="btn btn-wine"
            style={{ fontSize: 16, padding: "14px 0", borderRadius: 10 }}
            disabled={!bolsaSel || pesoActivo <= 0 || precioTotal <= 0}
            onClick={agregar}
          >
            <Icon name="cart" size={16} />
            {sharedCartCount > 0 ? "Agregar a nota y volver" : "Agregar a Ventas"}
          </button>
        </div>
      </div>
    </div>
  )
}
