import { useState, useEffect } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { SUCURSALES } from "../data"
import { getCatalogo, postMovimiento } from "../api"
import { exportCSV } from "../utils"

export default function InventariosPage({ addToast, sucursalActiva }) {
  const initSuc = sucursalActiva ?? "centro"
  const initSucShort = SUCURSALES.find(s => s.id === initSuc)?.short ?? "Centro"

  const [suc, setSuc]               = useState(initSuc)
  const [search, setSearch]         = useState("")
  const [statusFilter, setStatus]   = useState("todos")
  const [adjustingP, setAdjustingP] = useState(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 250
  const [productos, setProductos]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const [movTipo,  setMovTipo]  = useState("Entrada")
  const [movSuc,   setMovSuc]   = useState(initSucShort)
  const [movCant,  setMovCant]  = useState("")
  const [movNivel, setMovNivel] = useState("pieza")
  const [movObs,   setMovObs]   = useState("")
  const [saving,   setSaving]   = useState(false)

  const cargar = async () => {
    setLoading(true)
    setError(null)
    try {
      setProductos(await getCatalogo())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const sucObj = SUCURSALES.find((s) => s.id === suc)

  const stockTotals = SUCURSALES.map((s) => {
    let normal = 0, bajo = 0, agotado = 0
    productos.forEach((p) => {
      const v = p.stock[s.id] ?? 0
      if (v <= 0) agotado++
      else if (v < p.min) bajo++
      else normal++
    })
    return { ...s, normal, bajo, agotado, total: normal + bajo + agotado }
  })
  const cur = stockTotals.find((s) => s.id === suc) ?? { normal: 0, bajo: 0, agotado: 0, total: 0 }

  const filtered = productos.filter((p) => {
    if (search) {
      const q = search.toLowerCase()
      const matchName    = p.name.toLowerCase().includes(q)
      const matchSku     = p.sku.includes(search)
      const matchBarcode = p.codigoBarras && p.codigoBarras.toLowerCase().includes(q)
      if (!matchName && !matchSku && !matchBarcode) return false
    }
    const v  = p.stock[suc] ?? 0
    const st = v <= 0 ? "agotado" : v < p.min ? "bajo" : "normal"
    if (statusFilter !== "todos" && st !== statusFilter) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const aplicar = async () => {
    const cant = parseFloat(movCant)
    if (!adjustingP || !cant || cant <= 0) return
    setSaving(true)
    try {
      // Buscar el factor de la presentación seleccionada
      const pres     = adjustingP.presentaciones ?? []
      const nivelKeys = movNivel === "caja" ? ["caja"] : movNivel === "paq" ? ["paquete", "bulto"] : null
      const presObj   = nivelKeys ? pres.find(p => nivelKeys.includes(p.nivel)) : null
      const factor    = presObj?.factor ?? 1

      await postMovimiento({
        tipo:            movTipo,
        producto_codigo: parseInt(adjustingP.sku, 10),
        sucursal:        movSuc,
        cantidad:        cant,
        nivel:           movNivel,
        factor,
        descripcion:     adjustingP.name,
        observaciones:   movObs,
      })
      addToast({ kind: "ok", msg: "Movimiento registrado" })
      setAdjustingP(null)
      setMovCant("")
      setMovObs("")
      cargar()
    } catch (err) {
      addToast({ kind: "err", msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Inventarios</h1></div>
      <div className="card">
        <div className="card-body" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          Cargando inventario…
        </div>
      </div>
    </div>
  )

  if (error) return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Inventarios</h1></div>
      <div className="ia-error" style={{ margin: 24 }}>
        <Icon name="alert" size={14} /> {error}
        <button className="btn btn-default btn-sm" style={{ marginLeft: 12 }} onClick={cargar}>Reintentar</button>
      </div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventarios</h1>
          <p className="page-subtitle">Stock por sucursal · {sucObj?.desc}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={cargar}><Icon name="refresh" size={13} /> Sincronizar</button>
          <button className="btn btn-default btn-sm" onClick={() => exportCSV(productos.map((p) => ({ CodigoBarras: p.codigoBarras || p.sku, SKU: p.sku, Nombre: p.name, Tipo: p.tipo, Centro: p.stock.centro, Repostero: p.stock.repostero, Bodega: p.stock.bodega, Total: (p.stock.centro + p.stock.repostero + p.stock.bodega), Minimo: p.min })), "inventario.csv")}>
            <Icon name="download" size={13} /> Exportar CSV
          </button>
          <button className="btn btn-wine btn-sm"><Icon name="upload" size={13} /> Movimiento de stock</button>
        </div>
      </div>

      <div className="sucursal-tabs">
        {stockTotals.map((s) => (
          <button key={s.id} className={"sucursal-tab" + (suc === s.id ? " active" : "")} onClick={() => setSuc(s.id)}>
            <Icon name={s.id === "bodega" ? "warehouse" : "building"} size={14} />
            {s.name}
            <span className="stock-mini">{s.bajo + s.agotado > 0 ? `${s.bajo + s.agotado} alertas` : "OK"}</span>
          </button>
        ))}
      </div>

      <div className="kpi-grid">
        {[
          { key: "todos",   accent: "",                         label: "Productos en sucursal", value: cur.total,   delta: <span className="label">SKUs activos</span>,    deltaUp: null },
          { key: "normal",  accent: "var(--ok)",                label: "Stock normal",           value: cur.normal,  delta: "▲ Saludable",                                   deltaUp: true },
          { key: "bajo",    accent: "var(--warn)",              label: "Stock bajo",             value: cur.bajo,    delta: "⚠ Requiere reposición",                          deltaUp: false },
          { key: "agotado", accent: "var(--err)",               label: "Agotados",               value: cur.agotado, delta: "● Reabastecer urgente",                          deltaUp: false },
        ].map(({ key, accent, label, value, delta, deltaUp }) => (
          <div
            key={key}
            className="kpi"
            onClick={() => { setStatus(key); setPage(1) }}
            style={{ cursor: "pointer", outline: statusFilter === key ? "2px solid var(--wine-500)" : "none", outlineOffset: 2 }}
          >
            <div className="kpi-accent" style={accent ? { background: accent } : {}}></div>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{value}</div>
            <div className={`kpi-delta${deltaUp === true ? " up" : deltaUp === false ? " down" : ""}`}>{delta}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="filter-bar">
            <div className="search-input">
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar por nombre, SKU o código de barras…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select value={statusFilter} onChange={(e) => setStatus(e.target.value)}>
              <option value="todos">Todos los estados</option>
              <option value="normal">Normal</option>
              <option value="bajo">Stock bajo</option>
              <option value="agotado">Agotado</option>
            </select>
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{filtered.length} productos</span>
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                <span className="muted">{page} / {totalPages}</span>
                <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              </div>
            )}
          </div>
        </div>
        <div className="card-body flush" style={{ overflowX: "auto" }}>
          <table className="table" style={{ tableLayout: "fixed", minWidth: 900 }}>
            <colgroup>
              <col style={{ width: 130 }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 44 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Cód.</th><th>Producto</th><th>Tipo</th>
                <th className="num">{sucObj?.short ?? suc}</th><th className="num">Mínimo</th><th>Cobertura</th>
                <th className="num">Centro</th><th className="num">Repostero</th><th className="num">Bodega</th>
                <th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const v      = p.stock[suc] ?? 0
                const status = v <= 0 ? "agotado" : v < p.min ? "bajo" : "normal"
                const pct    = Math.min(100, (v / (p.min * 2)) * 100)
                const fill   = status === "agotado" ? "var(--err)" : status === "bajo" ? "var(--warn)" : "var(--ok)"
                return (
                  <tr key={p._id}>
                    <td className="tnum" style={{ fontSize: 11, overflow: "hidden" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.codigoBarras || p.sku}</div>
                      {p.codigoBarras && p.codigoBarras !== p.sku && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.sku}</div>
                      )}
                    </td>
                    <td style={{ overflow: "hidden" }} title={p.name}>
                      <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</strong>
                    </td>
                    <td className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.tipo}</td>
                    <td className="num"><strong>{v}</strong></td>
                    <td className="num muted">{p.min}</td>
                    <td>
                      <div style={{ width: 90, height: 6, background: "var(--bg-sunken)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: pct + "%", height: "100%", background: fill, borderRadius: 3 }}></div>
                      </div>
                    </td>
                    <td className="num">{p.stock.centro}</td>
                    <td className="num">{p.stock.repostero}</td>
                    <td className="num">{p.stock.bodega}</td>
                    <td>
                      {status === "agotado" && <span className="badge badge-err">● Agotado</span>}
                      {status === "bajo"    && <span className="badge badge-warn">● Bajo</span>}
                      {status === "normal"  && <span className="badge badge-ok">● Normal</span>}
                    </td>
                    <td className="actions-cell">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setAdjustingP(p); setMovSuc(SUCURSALES.find(s => s.id === suc)?.short ?? "Centro"); setMovNivel("pieza"); setMovCant("") }}>
                        <Icon name="edit" size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!adjustingP}
        onClose={() => setAdjustingP(null)}
        title={`Ajustar stock: ${adjustingP?.name}`}
        footer={
          <>
            <button className="btn btn-default" onClick={() => setAdjustingP(null)}>Cancelar</button>
            <button className="btn btn-wine" onClick={aplicar} disabled={saving || !movCant}>
              <Icon name="check" size={13} /> {saving ? "Guardando…" : "Aplicar movimiento"}
            </button>
          </>
        }
      >
        {adjustingP && (
          <div className="form-grid cols-2">
            <div className="form-row" style={{ gridColumn: "1/-1" }}>
              <label>Tipo de movimiento</label>
              <select value={movTipo} onChange={(e) => setMovTipo(e.target.value)}>
                <option value="Entrada">Entrada por compra</option>
                <option value="Salida">Salida por venta</option>
                <option value="Traspaso">Traspaso entre sucursales</option>
                <option value="Ajuste">Ajuste por inventario físico</option>
                <option value="Merma">Merma / daño</option>
              </select>
            </div>
            <div className="form-row">
              <label>Sucursal</label>
              <select value={movSuc} onChange={(e) => setMovSuc(e.target.value)}>
                {SUCURSALES.map((s) => <option key={s.id} value={s.short}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Unidad de entrada</label>
              <select value={movNivel} onChange={e => setMovNivel(e.target.value)}>
                <option value="pieza">{adjustingP.unidadBase === "gramo" ? "Gramo / unidad suelta" : "Pieza / unidad suelta"}</option>
                {adjustingP.presentaciones?.filter(p => p.nivel === "paquete" || p.nivel === "bulto").map(p => {
                  const u = adjustingP.unidadBase === "gramo"
                    ? (p.factor >= 1000 ? `${p.factor / 1000} kg` : `${p.factor} g`) + " c/u"
                    : `${p.factor} pzs c/u`
                  return <option key={p.id} value="paq">{p.label} ({u})</option>
                })}
                {adjustingP.presentaciones?.filter(p => p.nivel === "caja").map(p => {
                  const u = adjustingP.unidadBase === "gramo"
                    ? (p.factor >= 1000 ? `${p.factor / 1000} kg` : `${p.factor} g`) + " c/u"
                    : `${p.factor} pzs c/u`
                  return <option key={p.id} value="caja">{p.label} ({u})</option>
                })}
              </select>
            </div>
            <div className="form-row">
              <label>Cantidad{movNivel !== "pieza" ? ` (en ${movNivel === "caja" ? "cajas" : "paquetes"})` : ""}</label>
              <input type="number" min="1" value={movCant} onChange={(e) => setMovCant(e.target.value)} placeholder="0" />
            </div>
            <div className="form-row" style={{ gridColumn: "1/-1" }}>
              <label>Observaciones</label>
              <textarea rows="2" value={movObs} onChange={(e) => setMovObs(e.target.value)} placeholder="Opcional…" />
            </div>
            {/* Mostrar stock con equivalencias (base stock como fuente de verdad) */}
            <div style={{ gridColumn: "1/-1", padding: 12, background: "var(--bg-sunken)", borderRadius: 6, fontSize: 12 }}>
              <strong>Stock actual ({movSuc.toLowerCase()}):</strong>
              {(() => {
                const sucId    = movSuc.toLowerCase()
                const n        = adjustingP.stockNiveles?.[sucId] ?? {}
                const pres     = adjustingP.presentaciones ?? []
                const paqP     = pres.find(p => p.nivel === "paquete" || p.nivel === "bulto")
                const cajP     = pres.find(p => p.nivel === "caja")
                const cajFac   = cajP?.factor ?? 0
                const paqFac   = paqP?.factor ?? 0
                const esGramo  = adjustingP.unidadBase === "gramo"

                // Helpers para formato de unidad base
                const fmtBase = (g) => esGramo
                  ? (g >= 1000 ? `${(g / 1000).toLocaleString()} kg` : `${g} g`)
                  : g.toLocaleString() + " pzs"

                // Stock base = fuente de verdad
                const baseStock  = adjustingP.stock?.[sucId] ?? 0
                const cajasN     = n.caja ?? 0
                const paqSueltos = n.paq ?? 0

                const paqEquiv = paqFac > 0 ? Math.floor(baseStock / paqFac) : 0
                const cajEquiv = cajFac > 0 ? Math.floor(baseStock / cajFac) : 0

                return (
                  <div style={{ marginTop: 6, display: "flex", gap: 20, flexWrap: "wrap" }}>
                    {cajFac > 0 && (
                      <span>
                        {cajP.label}: <strong>{cajasN}</strong>
                        {paqFac > 0 && (
                          <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>(equiv. {cajEquiv})</span>
                        )}
                      </span>
                    )}
                    {paqFac > 0 && (
                      <span>
                        {paqP.label}: <strong>{paqEquiv}</strong>
                        {paqSueltos > 0 && (
                          <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>({paqSueltos} sueltos)</span>
                        )}
                      </span>
                    )}
                    <span>
                      {esGramo ? "Total:" : "Piezas:"} <strong>{fmtBase(baseStock)}</strong>
                    </span>
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
