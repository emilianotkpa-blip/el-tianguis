import { useState } from "react"
import Icon from "./Icon"
import Select from "./Select"
import { SUCURSALES } from "../data"
import { postMovimiento } from "../api"
import { fmtBase } from "../utils"

const TIPOS_MOV = [
  { value: "Entrada",  label: "Entrada por compra" },
  { value: "Salida",   label: "Salida por venta" },
  { value: "Traspaso", label: "Traspaso entre sucursales" },
  { value: "Ajuste",   label: "Ajuste por inventario físico" },
  { value: "Merma",    label: "Merma / daño" },
]

// Formulario de movimiento de stock. Vive aparte porque se usa en dos lugares:
// el modal de Inventarios y la edición de un producto, donde evita tener que
// salir de la pantalla solo para cargar mercancía.
export default function AjusteStock({
  producto,
  sucursalInicial,
  addToast,
  onAplicado,
  mostrarStock = true,
  notaIdle = "El movimiento se aplica al instante",
}) {
  const [tipo, setTipo]   = useState("Entrada")
  const [suc, setSuc]     = useState(sucursalInicial ?? SUCURSALES[0].short)
  const [nivel, setNivel] = useState("pieza")
  const [cant, setCant]   = useState("")
  const [obs, setObs]     = useState("")
  const [guardando, setGuardando] = useState(false)

  if (!producto) return null

  const esGramo = producto.unidadBase === "gramo"
  const pres    = producto.presentaciones ?? []

  // Presentaciones de referencia: el paquete y la caja del producto.
  // El fallback de "paquete" cubre las bolsas de 1 kg que aún no se migran.
  const paqP = pres.find(p => p.nivel === "paquete")
    || pres.find(p => p.nivel === "gramo" && p.factor >= 1000)
  const cajP = pres.find(p => p.nivel === "caja" || p.nivel === "bulto")

  // Unidades en las que se puede capturar: la suelta y cada empaque real
  const unidades = (() => {
    const ops = [{
      value: "pieza",
      label: esGramo ? "Gramo / unidad suelta" : "Pieza / unidad suelta",
    }]
    pres.filter(p =>
      p.nivel === "paquete" || (p.nivel === "gramo" && p.factor >= 1000 && p.id !== "detalle")
    ).forEach(p => {
      const u = esGramo
        ? (p.factor >= 1000 ? `${p.factor / 1000} kg` : `${p.factor} g`) + " c/u"
        : `${p.factor} pzs c/u`
      ops.push({ value: "paq", label: p.label, hint: u })
    })
    pres.filter(p => p.nivel === "caja" || p.nivel === "bulto").forEach(p => {
      let u
      if (p.contieneN && p.contienePres) {
        const dentro = pres.find(x => x.id === p.contienePres)
        u = `${p.contieneN} ${dentro ? dentro.label : "paq"} c/u`
      } else {
        u = esGramo
          ? (p.factor >= 1000 ? `${p.factor / 1000} kg` : `${p.factor} g`) + " c/u"
          : `${p.factor} pzs c/u`
      }
      ops.push({ value: "caja", label: p.label, hint: u })
    })
    return ops
  })()

  const factorDe = (nv) =>
    nv === "caja" ? (cajP?.factor ?? 1)
    : nv === "paq" ? (paqP?.factor ?? 1)
    : 1

  // Cuánto suma o resta de verdad, para decirlo antes de aplicar.
  // Ojo: el servidor solo SUMA en "Entrada"; cualquier otro tipo resta.
  const enBase = (parseFloat(cant) || 0) * factorDe(nivel)
  const resta  = tipo !== "Entrada"

  const aplicar = async () => {
    const n = parseFloat(cant)
    if (!n || n <= 0) return addToast?.({ kind: "err", msg: "Escribe una cantidad" })
    setGuardando(true)
    try {
      await postMovimiento({
        tipo,
        producto_codigo: parseInt(producto.sku, 10),
        sucursal:        suc,
        cantidad:        n,
        nivel,
        factor:          factorDe(nivel),
        descripcion:     producto.name,
        observaciones:   obs,
      })
      addToast?.({ kind: "ok", msg: "Movimiento registrado" })
      setCant(""); setObs("")
      onAplicado?.()
    } catch (err) {
      addToast?.({ kind: "err", msg: err.message })
    } finally {
      setGuardando(false)
    }
  }

  // ── Stock actual de la sucursal elegida ─────────────────
  const sucId      = suc.toLowerCase()
  const niveles    = producto.stockNiveles?.[sucId] ?? {}
  const baseStock  = producto.stock?.[sucId] ?? 0
  const paqFac     = paqP?.factor ?? 0
  const cajFac     = cajP?.factor ?? 0
  const paqEquiv   = paqFac > 0 ? Math.floor(baseStock / paqFac) : 0
  const cajEquiv   = cajFac > 0 ? Math.floor(baseStock / cajFac) : 0

  return (
    <div className="ajuste-stock">
      <div className="form-grid cols-2">
        <div className="form-row" style={{ gridColumn: "1/-1" }}>
          <label>Tipo de movimiento</label>
          <Select value={tipo} onChange={e => setTipo(e.target.value)} options={TIPOS_MOV} />
        </div>
        <div className="form-row">
          <label>Sucursal</label>
          <Select
            value={suc}
            onChange={e => setSuc(e.target.value)}
            options={SUCURSALES.map(s => ({ value: s.short, label: s.name, hint: s.desc }))}
          />
        </div>
        <div className="form-row">
          <label>Unidad de entrada</label>
          <Select value={nivel} onChange={e => setNivel(e.target.value)} options={unidades} />
        </div>
        <div className="form-row">
          <label>Cantidad{nivel !== "pieza" ? ` (en ${nivel === "caja" ? "cajas" : "paquetes"})` : ""}</label>
          <input
            type="number" min="0" step="any"
            value={cant}
            onChange={e => setCant(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); aplicar() } }}
            placeholder="0"
          />
        </div>
        <div className="form-row">
          <label>Observaciones</label>
          <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional…" />
        </div>

        {mostrarStock && (
          <div className="stock-panel" style={{ gridColumn: "1/-1" }}>
            <div className="stock-panel-title">Stock actual · {suc}</div>
            <div className="stock-chips">
              {cajFac > 0 && (
                <div className="stock-chip">
                  <span className="sc-label">{cajP.label}</span>
                  <span className="sc-value">{niveles.caja ?? 0}</span>
                  {paqFac > 0 && <span className="sc-hint">equiv. {cajEquiv}</span>}
                </div>
              )}
              {paqFac > 0 && (
                <div className="stock-chip">
                  <span className="sc-label">{paqP.label}</span>
                  <span className="sc-value">{paqEquiv}</span>
                  {(niveles.paq ?? 0) > 0 && <span className="sc-hint">{niveles.paq} sueltos</span>}
                </div>
              )}
              <div className="stock-chip destacado">
                <span className="sc-label">{esGramo ? "Total" : "Piezas"}</span>
                <span className="sc-value">{fmtBase(baseStock, producto.unidadBase)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="ajuste-pie">
        <span className="ajuste-equiv">
          {enBase > 0
            ? <>{resta ? "Resta" : "Suma"} <strong>{fmtBase(enBase, producto.unidadBase)}</strong> en {suc}</>
            : <span className="muted">{notaIdle}</span>}
        </span>
        <button
          className="btn btn-wine"
          onClick={aplicar}
          disabled={guardando || !(parseFloat(cant) > 0)}
        >
          <Icon name="check" size={13} /> {guardando ? "Aplicando…" : "Aplicar movimiento"}
        </button>
      </div>
    </div>
  )
}
