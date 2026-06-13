import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import Icon from "../components/Icon"
import Stepper from "../components/Stepper"
import NotaImpresa from "../components/NotaImpresa"
import { getCaja, getCajaPorFolio, editarNotaCaja, cobrarNota, cancelarNota, getCatalogo, getHistorialCaja } from "../api"
import { fmtMoney, todayISO } from "../utils"

const RANGOS = [
  { id: "1h",  label: "Última hora" },
  { id: "8h",  label: "Últimas 8h"  },
  { id: "1d",  label: "Hoy"         },
  { id: "7d",  label: "7 días"      },
  { id: "30d", label: "30 días"     },
]

const METODOS = ["Efectivo", "Tarjeta", "Transferencia", "Crédito 8d", "Crédito 15d"]

function RelativeTime({ fecha }) {
  if (!fecha) return null
  const diff = Math.round((Date.now() - new Date(fecha)) / 60000)
  if (diff < 1)  return <span>Ahora</span>
  if (diff < 60) return <span>Hace {diff} min</span>
  return <span>Hace {Math.round(diff / 60)} h</span>
}

// ── Wizard de cobro (overlay pantalla completa) ─────────
function CobrarWizard({ nota, getItems, calcTotals, onExito, onCancelar, addToast }) {
  const [step, setStep] = useState(0)
  const [pagos, setPagos] = useState(() => {
    try {
      const ps = JSON.parse(nota.Pagos_JSON || "[]")
      return ps.length ? ps.map(p => ({ ...p })) : [{ metodo: "Efectivo", monto: String(nota.Total ?? 0) }]
    } catch { return [{ metodo: "Efectivo", monto: String(nota.Total ?? 0) }] }
  })
  const [folioTerminal, setFolioTerminal] = useState("")
  const [saving, setSaving]   = useState(false)
  const [cobradaLocal, setCobradaLocal] = useState(null)
  const [notaImpresa, setNotaImpresa] = useState(false)

  const items  = getItems(nota)
  const totals = calcTotals(items)
  const totalPagado = pagos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0)
  const cambio      = Math.max(0, totalPagado - totals.total)
  const pendiente   = Math.max(0, totals.total - totalPagado)
  const tieneTarjeta = pagos.some(p => p.metodo === "Tarjeta" && parseFloat(p.monto) > 0)
  const puedeAvanzarPago = pendiente === 0 && (!tieneTarjeta || folioTerminal.trim().length > 0)

  const setPagoField = (i, f, v) => setPagos(p => p.map((x, idx) => idx === i ? { ...x, [f]: v } : x))
  const addPago      = () => setPagos(p => [...p, { metodo: "Efectivo", monto: "" }])
  const removePago   = (i) => setPagos(p => p.filter((_, idx) => idx !== i))

  const ejecutarCobro = async () => {
    setSaving(true)
    try {
      await cobrarNota(nota.Id, {
        pagos: pagos.map(p => ({ metodo: p.metodo, monto: parseFloat(p.monto) || 0 })),
        sucursal: nota.Sucursal,
        folioTerminal: folioTerminal || undefined,
      })
      setCobradaLocal({ pagos, cambio, totals })
      setStep(3)
    } catch (err) {
      addToast({ kind: "err", msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  const notaImpresaProps = cobradaLocal ? {
    folio: nota.Folio, fecha: nota.Fecha ?? todayISO(),
    cliente: nota.Cliente, vendedor: nota.Vendedor, sucursal: nota.Sucursal,
    items, pagos: cobradaLocal.pagos, totals: cobradaLocal.totals, cambio: cobradaLocal.cambio,
  } : null

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 200, display: "flex", flexDirection: "column" }}>

      {/* Portal para imprimir nota — directo en body */}
      {notaImpresaProps && createPortal(
        <div className="print-nota-wrapper">
          <NotaImpresa {...notaImpresaProps} />
          <NotaImpresa {...notaImpresaProps} />
        </div>,
        document.body
      )}

      {/* Header */}
      <div style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--border)", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Cobrar nota</div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text-muted)" }}>{nota.Folio}</span>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>— {nota.Cliente}</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: "var(--wine-700)" }}>
          {fmtMoney(totals.total)}
        </div>
      </div>

      {/* Stepper */}
      <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
        <Stepper steps={["Revisar nota", "Forma de pago", "Verificación", "Cobrar"]} current={step} />
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px 32px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 620 }}>

          {/* ── STEP 0: Revisar nota ── */}
          {step === 0 && (
            <div>
              <div className="card">
                <div className="card-header">
                  <div style={{ fontWeight: 700 }}>Productos</div>
                  <span className="muted" style={{ fontSize: 12 }}>{items.length} líneas</span>
                </div>
                <div className="card-body">
                  {items.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{it.nombre ?? it.name}</div>
                        {it.presLabel && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{it.presLabel}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{it.qty}×</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, minWidth: 80, textAlign: "right" }}>{fmtMoney((it.precio ?? 0) * it.qty)}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12 }}>
                    {totals.subtotalNoFact > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}><span>Sin factura</span><span>{fmtMoney(totals.subtotalNoFact)}</span></div>}
                    {totals.subtotalFact > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}><span>Facturable</span><span>{fmtMoney(totals.subtotalFact)}</span></div>}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 2 }}><span>Subtotal</span><span>{fmtMoney(totals.subtotal)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 2 }}><span>IVA (16%)</span><span>{fmtMoney(totals.iva)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 20, marginTop: 8 }}><span>Total</span><span style={{ color: "var(--wine-700)" }}>{fmtMoney(totals.total)}</span></div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "space-between" }}>
                <button className="btn btn-ghost" style={{ color: "var(--err)" }} onClick={onCancelar}>Cancelar</button>
                <button className="btn btn-wine" onClick={() => setStep(1)}>
                  Continuar <Icon name="chevronRight" size={13} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 1: Forma de pago ── */}
          {step === 1 && (
            <div>
              <div className="card">
                <div className="card-header">
                  <div style={{ fontWeight: 700 }}>Forma de pago</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 20, color: "var(--wine-700)" }}>{fmtMoney(totals.total)}</div>
                </div>
                <div className="card-body">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {pagos.map((p, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <select value={p.metodo} onChange={e => setPagoField(i, "metodo", e.target.value)} style={{ flex: 1 }}>
                          {METODOS.map(m => <option key={m}>{m}</option>)}
                        </select>
                        <input type="number" step="0.01" value={p.monto}
                          onChange={e => setPagoField(i, "monto", e.target.value)}
                          style={{ width: 130, textAlign: "right" }} />
                        {pagos.length > 1 && (
                          <button className="btn btn-ghost btn-sm" onClick={() => removePago(i)} style={{ color: "var(--err)" }}>
                            <Icon name="x" size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button className="btn btn-default btn-sm" onClick={addPago}>
                      <Icon name="plus" size={12} /> Agregar forma de pago
                    </button>
                  </div>

                  {/* Folio de terminal — obligatorio si hay tarjeta */}
                  {tieneTarjeta && (
                    <div style={{ marginTop: 16, padding: 16, background: "var(--warn-bg)", borderRadius: 8, border: "1px solid rgba(178,93,0,.35)" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--warn)", marginBottom: 8 }}>
                        Pago con tarjeta — folio de terminal obligatorio
                      </div>
                      <input
                        placeholder="Ingresa el folio de la terminal"
                        value={folioTerminal}
                        onChange={e => setFolioTerminal(e.target.value)}
                        style={{ width: "100%", borderColor: folioTerminal.trim() ? "var(--border-strong)" : "var(--err)" }}
                      />
                      {!folioTerminal.trim() && (
                        <div style={{ fontSize: 11, color: "var(--err)", marginTop: 4 }}>Requerido para continuar</div>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span>Total a cobrar</span><span style={{ fontWeight: 600 }}>{fmtMoney(totals.total)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span>Total recibido</span><span style={{ fontWeight: 600 }}>{fmtMoney(totalPagado)}</span></div>
                    {pendiente > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--err)", fontWeight: 700 }}><span>Pendiente</span><span>{fmtMoney(pendiente)}</span></div>}
                    {cambio > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: "var(--ok)", fontWeight: 700 }}><span>Cambio a devolver</span><span>{fmtMoney(cambio)}</span></div>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "space-between" }}>
                <button className="btn btn-default" onClick={() => setStep(0)}><Icon name="chevronLeft" size={13} /> Volver</button>
                <button className="btn btn-wine" disabled={!puedeAvanzarPago} onClick={() => setStep(2)}>
                  Verificar <Icon name="chevronRight" size={13} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Verificación ── */}
          {step === 2 && (
            <div>
              <div className="card">
                <div className="card-body" style={{ fontFamily: "var(--font-mono)", lineHeight: 1.8 }}>
                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>EL TIANGUIS</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{nota.Sucursal}</div>
                  </div>
                  <div style={{ borderTop: "1px dashed var(--border)", borderBottom: "1px dashed var(--border)", padding: "8px 0", marginBottom: 12, fontSize: 12 }}>
                    <div><strong>Folio:</strong> {nota.Folio}</div>
                    <div><strong>Fecha:</strong> {todayISO()}</div>
                    <div><strong>Cliente:</strong> {nota.Cliente}</div>
                    <div><strong>Vendedor:</strong> {nota.Vendedor}</div>
                  </div>
                  <table style={{ width: "100%", fontSize: 13, marginBottom: 12 }}>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td>{it.qty}× {it.nombre ?? it.name} {it.presLabel && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({it.presLabel})</span>}</td>
                          <td style={{ textAlign: "right" }}>{fmtMoney((it.precio ?? 0) * it.qty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 8, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{fmtMoney(totals.subtotal)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>IVA</span><span>{fmtMoney(totals.iva)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 4 }}><span>TOTAL</span><span>{fmtMoney(totals.total)}</span></div>
                  </div>
                  <div style={{ borderTop: "1px dashed var(--border)", marginTop: 10, paddingTop: 8, fontSize: 12 }}>
                    {pagos.map((p, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{p.metodo}:</span><span>{fmtMoney(parseFloat(p.monto) || 0)}</span>
                      </div>
                    ))}
                    {folioTerminal && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Folio terminal: {folioTerminal}</div>}
                    {cambio > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ok)", fontWeight: 700, fontSize: 16, marginTop: 4 }}><span>Cambio:</span><span>{fmtMoney(cambio)}</span></div>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "space-between" }}>
                <button className="btn btn-default" onClick={() => setStep(1)}><Icon name="chevronLeft" size={13} /> Editar pago</button>
                <button className="btn btn-wine" onClick={ejecutarCobro} disabled={saving}>
                  <Icon name="check" size={13} /> {saving ? "Procesando…" : "Confirmar y cobrar"}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Cobrado ── */}
          {step === 3 && cobradaLocal && (
            <div style={{ textAlign: "center" }}>
              <div className="card">
                <div className="card-body" style={{ padding: 48 }}>
                  <div style={{ fontSize: 56, marginBottom: 10 }}>✓</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ok)", marginBottom: 12 }}>¡Cobrado!</div>
                  <div style={{ fontSize: 28, fontFamily: "var(--font-mono)", fontWeight: 800, marginBottom: 4 }}>{nota.Folio}</div>
                  <div style={{ fontSize: 24, fontFamily: "var(--font-mono)", color: "var(--wine-700)", fontWeight: 700, marginBottom: 24 }}>{fmtMoney(totals.total)}</div>
                  {cobradaLocal.cambio > 0 && (
                    <div style={{ background: "var(--ok-bg)", borderRadius: 10, padding: "16px 28px", marginBottom: 24, fontSize: 26, fontWeight: 700, color: "var(--ok)" }}>
                      Cambio: {fmtMoney(cobradaLocal.cambio)}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    {!notaImpresa ? (
                      <button className="btn btn-wine" onClick={() => {
                        document.body.classList.add("print-nota")
                        window.print()
                        document.body.classList.remove("print-nota")
                        setNotaImpresa(true)
                      }}><Icon name="print" size={13} /> Imprimir nota</button>
                    ) : (
                      <button className="btn btn-wine" onClick={onExito}>
                        <Icon name="chevronLeft" size={13} /> Volver a Caja
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default function CajaPage({ addToast, sucursalActiva }) {
  const [notas, setNotas]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState(null)
  const [folioInput, setFolioInput] = useState("")
  const [editando, setEditando]   = useState(false)
  const [catalogo, setCatalogo]   = useState([])
  const [addSearch, setAddSearch] = useState("")
  const [saving, setSaving]       = useState(false)
  const [confirmCancelar, setConfirmCancelar] = useState(false)
  const [wizardNota, setWizardNota]     = useState(null)
  const [previewNota, setPreviewNota]   = useState(null)
  // Historial
  const [vista, setVista]         = useState("cola")
  const [rango, setRango]         = useState("1d")
  const [historial, setHistorial] = useState([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [selectedHist, setSelectedHist] = useState(null)

  const cargarCola = useCallback(async () => {
    try {
      const n = await getCaja()
      setNotas(n)
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    cargarCola()
    getCatalogo().then(setCatalogo).catch(() => {})
    const timer = setInterval(cargarCola, 20000)
    return () => clearInterval(timer)
  }, [cargarCola])

  const cargarHistorial = useCallback(() => {
    setLoadingHist(true)
    setSelectedHist(null)
    getHistorialCaja(rango)
      .then(setHistorial)
      .catch(err => addToast({ kind: "err", msg: err.message }))
      .finally(() => setLoadingHist(false))
  }, [rango, addToast])

  useEffect(() => {
    if (vista !== "historial") return
    cargarHistorial()
  }, [vista, rango])

  const abrirNota = (nota) => {
    setSelected(nota)
    setEditando(false)
    setAddSearch("")
  }

  // Scanner global: acumula teclas cuando ningún input está enfocado y busca en Enter
  useEffect(() => {
    let buffer = ""
    let timer = null
    const onKey = (e) => {
      const active = document.activeElement
      const tag = active?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (e.key === "Enter") {
        clearTimeout(timer)
        if (buffer.length > 2) {
          const folio = buffer.replace(/\//g, "-").toUpperCase()
          buffer = ""
          getCajaPorFolio(folio)
            .then(nota => setPreviewNota(nota))
            .catch(() => addToast({ kind: "err", msg: `Folio ${folio} no encontrado` }))
        }
      } else if (e.key.length === 1) {
        buffer += e.key
        clearTimeout(timer)
        timer = setTimeout(() => { buffer = "" }, 400)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [addToast])

  const buscarPorFolio = async () => {
    if (!folioInput.trim()) return
    const folio = folioInput.trim().replace(/\//g, "-").toUpperCase()
    try {
      const nota = await getCajaPorFolio(folio)
      setFolioInput("")
      setPreviewNota(nota)
    } catch { addToast({ kind: "err", msg: `Folio ${folio} no encontrado` }) }
  }

  const getItems = (nota) => {
    try { return JSON.parse(nota?.Items_JSON || "[]") } catch { return [] }
  }

  const calcTotals = (items) => {
    const subtotalFact   = items.filter(it => it.facturable !== false).reduce((s, it) => s + (it.precio ?? 0) * (it.qty ?? 1), 0)
    const subtotalNoFact = items.filter(it => it.facturable === false).reduce((s, it) => s + (it.precio ?? 0) * (it.qty ?? 1), 0)
    const subtotal = subtotalFact + subtotalNoFact
    const iva      = subtotalFact * 0.16
    return { subtotalFact, subtotalNoFact, subtotal, iva, total: subtotal + iva }
  }

  // ── Edición de items ────────────────────────────────────
  const [editItems, setEditItems] = useState([])
  const [presCajaModal, setPresCajaModal] = useState(null)

  useEffect(() => {
    if (!editando || !selected) return
    const parsed = getItems(selected)
    const enriched = parsed.map(it => {
      const presId = it.presId ?? it.key?.split("__")[1]
      const prod   = catalogo.find(p => p.sku === it.sku)
      const pres   = prod ? (prod.presentaciones || []).find(p => p.id === presId) : null
      const precioNormal  = pres?.precio ?? it.precio
      const precioMayData = pres?.mayoreo && pres?.precioMayoreo > 0 ? pres.precioMayoreo : null
      const esMayoreo     = precioMayData ? Math.abs(it.precio - precioMayData) < 0.001 : false
      return {
        ...it, presId,
        precioNormal, precioMayoreo: precioMayData,
        mayoreoDisp: !!precioMayData, esMayoreo,
      }
    })
    setEditItems(enriched)
  }, [editando, selected])

  const setEditQty = (keyOrSku, qty) => {
    if (qty <= 0) setEditItems(it => it.filter(x => (x.key ?? x.sku) !== keyOrSku))
    else setEditItems(it => it.map(x => (x.key ?? x.sku) === keyOrSku ? { ...x, qty } : x))
  }

  const addProducto = (p) => {
    const pres = p.presentaciones || []
    if (pres.length > 1) { setPresCajaModal(p); return }
    addProductoConPres(p, pres[0] ?? null)
  }

  const addProductoConPres = (p, presElegida, usarMayoreo = false) => {
    const precioNormal  = presElegida ? (presElegida.precio ?? p.precio) : p.precio
    const precioMayData = presElegida?.mayoreo && presElegida?.precioMayoreo > 0 ? presElegida.precioMayoreo : null
    const precio        = usarMayoreo && precioMayData ? precioMayData : precioNormal
    const factor        = presElegida ? (presElegida.factor ?? 1) : (p.piezasPorUnidad ?? 1)
    const label         = presElegida ? presElegida.label : (p.unidad || "Pieza")
    const presId        = presElegida ? presElegida.id : "pieza"
    const key           = p.sku + "__" + presId
    setEditItems(it => {
      const ex = it.find(x => x.key === key)
      if (ex) return it.map(x => x.key === key ? { ...x, qty: x.qty + 1 } : x)
      return [...it, {
        key, sku: p.sku, nombre: p.name, name: p.name, presId,
        presLabel: label, precio, precioNormal, precioMayoreo: precioMayData,
        mayoreoDisp: !!precioMayData, esMayoreo: usarMayoreo && !!precioMayData,
        factor, facturable: p.facturable, qty: 1,
      }]
    })
    setAddSearch("")
    setPresCajaModal(null)
  }

  const toggleMayoreoItem = (key) => {
    setEditItems(it => it.map(x => {
      if ((x.key ?? x.sku) !== key || !x.mayoreoDisp) return x
      const next = !x.esMayoreo
      return { ...x, esMayoreo: next, precio: next ? x.precioMayoreo : x.precioNormal }
    }))
  }

  const guardarEdicion = async () => {
    const totals = calcTotals(editItems)
    setSaving(true)
    try {
      await editarNotaCaja(selected.Id, {
        items: editItems, ...totals,
        pagos: [{ metodo: "Efectivo", monto: totals.total }],
      })
      const updated = { ...selected, Items_JSON: JSON.stringify(editItems), Total: totals.total, Subtotal: totals.subtotal, IVA: totals.iva }
      setSelected(updated)
      setNotas(n => n.map(x => x.Id === selected.Id ? updated : x))
      setEditando(false)
      addToast({ kind: "ok", msg: "Nota actualizada" })
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  const cancelar = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await cancelarNota(selected.Id)
      setNotas(n => n.filter(x => x.Id !== selected.Id))
      setSelected(null)
      addToast({ kind: "ok", msg: "Nota cancelada" })
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  const items  = selected ? getItems(selected) : []
  const totals = calcTotals(items)

  const filteredCatalogo = catalogo.filter(p =>
    addSearch && (p.name.toLowerCase().includes(addSearch.toLowerCase()) || p.sku.includes(addSearch))
  ).slice(0, 8)

  return (
    <>
      {/* Modal de previsualización de nota (al escanear/buscar folio) */}
      {previewNota && (() => {
        const pvItems  = getItems(previewNota)
        const pvTotals = calcTotals(pvItems)
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150 }}
            onClick={() => setPreviewNota(null)}>
            <div style={{ background: "var(--bg-elev)", borderRadius: 12, padding: 28, maxWidth: 440, width: "90%", boxShadow: "0 12px 40px rgba(0,0,0,.4)" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)", marginBottom: 4 }}>Nota encontrada</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-mono)", marginBottom: 2 }}>{previewNota.Folio}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                {previewNota.Cliente} · {previewNota.Vendedor} · {pvItems.length} prod.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                {pvItems.map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span>{it.qty}× {it.nombre ?? it.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{fmtMoney((it.precio ?? 0) * it.qty)}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 20, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 20 }}>
                <span>Total</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--wine-700)" }}>{fmtMoney(pvTotals.total)}</span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-default" style={{ flex: 1 }} onClick={() => setPreviewNota(null)}>Cancelar</button>
                <button className="btn btn-wine" style={{ flex: 1 }} onClick={() => { setWizardNota(previewNota); setPreviewNota(null) }}>
                  <Icon name="check" size={13} /> Sí, cobrar esta nota
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Wizard de cobro — overlay pantalla completa */}
      {wizardNota && (
        <CobrarWizard
          nota={wizardNota}
          getItems={getItems}
          calcTotals={calcTotals}
          addToast={addToast}
          onExito={() => {
            setNotas(n => n.filter(x => x.Id !== wizardNota.Id))
            setSelected(null)
            setWizardNota(null)
          }}
          onCancelar={() => setWizardNota(null)}
        />
      )}

      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Caja</h1>
            <p className="page-subtitle">
              {vista === "cola"
                ? `${notas.length} nota${notas.length !== 1 ? "s" : ""} pendiente${notas.length !== 1 ? "s" : ""}`
                : `Historial · ${RANGOS.find(r => r.id === rango)?.label}`}
            </p>
          </div>
          <div className="page-actions">
            <div className="range-toggle">
              <button className={vista === "cola"      ? "active" : ""} onClick={() => { setVista("cola"); setSelected(null) }}>Cola</button>
              <button className={vista === "historial" ? "active" : ""} onClick={() => setVista("historial")}>Historial</button>
            </div>

            {vista === "historial" && (
              <div className="range-toggle">
                {RANGOS.map(r => (
                  <button key={r.id} className={rango === r.id ? "active" : ""} onClick={() => setRango(r.id)}>{r.label}</button>
                ))}
              </div>
            )}

            <button className="btn btn-default btn-sm" onClick={() => vista === "historial" ? cargarHistorial() : cargarCola()}>
              <Icon name="refresh" size={13} /> Actualizar
            </button>

            {vista === "cola" && (
              <div style={{ display: "flex", gap: 6 }}>
                <input placeholder="Buscar folio…" value={folioInput} onChange={e => setFolioInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && buscarPorFolio()} style={{ width: 160 }} />
                <button className="btn btn-wine btn-sm" onClick={buscarPorFolio}><Icon name="search" size={13} /></button>
              </div>
            )}
          </div>
        </div>

        {/* ── Vista Historial ────────────────────────── */}
        {vista === "historial" && (
          <div style={{ display: "grid", gridTemplateColumns: selectedHist ? "1fr 400px" : "1fr", gap: 16 }}>
            <div className="card">
              <div className="card-body flush">
                {loadingHist
                  ? <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>Cargando historial…</div>
                  : historial.length === 0
                    ? <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>Sin cobros en este período</div>
                    : <table className="table">
                        <thead>
                          <tr><th>Folio</th><th>Cobrada</th><th>Vendedor</th><th>Cliente</th><th>Método</th><th className="num">Total</th><th></th></tr>
                        </thead>
                        <tbody>
                          {historial.map(n => (
                            <tr key={n.Id} style={{ cursor: "pointer" }} onClick={() => setSelectedHist(selectedHist?.Id === n.Id ? null : n)}>
                              <td className="tnum" style={{ fontWeight: 700 }}>{n.Folio}</td>
                              <td className="muted" style={{ fontSize: 12 }}>{n.UpdatedAt ? new Date(n.UpdatedAt).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "—"}</td>
                              <td>{n.Vendedor || "—"}</td>
                              <td>{n.Cliente}</td>
                              <td><span className="badge badge-neutral">{n.MetodoPago}</span></td>
                              <td className="num"><strong>{fmtMoney(n.Total ?? 0)}</strong></td>
                              <td className="actions-cell"><span className="badge badge-ok">● Cobrado</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                }
              </div>
              {historial.length > 0 && (
                <div className="card-body" style={{ background: "var(--bg-sunken)", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span className="muted">{historial.length} cobros</span>
                  <strong>{fmtMoney(historial.reduce((s, n) => s + (n.Total ?? 0), 0))}</strong>
                </div>
              )}
            </div>

            {selectedHist && (() => {
              let items = []
              try { items = JSON.parse(selectedHist.Items_JSON || "[]") } catch {}
              let pagosHist = []
              try { pagosHist = JSON.parse(selectedHist.Pagos_JSON || "[]") } catch {}
              return (
                <div className="card" style={{ alignSelf: "start" }}>
                  <div className="card-header">
                    <div>
                      <div style={{ fontWeight: 700 }}>{selectedHist.Folio}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{selectedHist.Cliente} · {selectedHist.Vendedor}</div>
                    </div>
                    <span className="badge badge-ok">● Cobrado</span>
                  </div>
                  <div className="card-body">
                    {items.map((it, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                        <span>{it.qty}× {it.nombre ?? it.name}</span>
                        <span style={{ fontFamily: "var(--font-mono)" }}>{fmtMoney((it.precio ?? 0) * it.qty)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                        <span>Total</span><span>{fmtMoney(selectedHist.Total ?? 0)}</span>
                      </div>
                      {pagosHist.map((p, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                          <span>{p.metodo}</span><span>{fmtMoney(p.monto)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Vista Cola ─────────────────────────────── */}
        {vista === "cola" && (
          <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 440px" : "1fr", gap: 16 }}>
            {/* Cola de notas */}
            <div className="card">
              <div className="card-body flush">
                {loading
                  ? <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>Cargando…</div>
                  : notas.length === 0
                    ? <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                        <Icon name="check" size={32} />
                        <div style={{ marginTop: 8 }}>Sin notas pendientes</div>
                      </div>
                    : <table className="table">
                        <thead>
                          <tr><th>Folio</th><th>Hora</th><th>Vendedor</th><th>Cliente</th><th>Items</th><th className="num">Total</th><th></th></tr>
                        </thead>
                        <tbody>
                          {notas.map(n => {
                            const its = getItems(n)
                            return (
                              <tr key={n.Id} className={selected?.Id === n.Id ? "selected" : ""} style={{ cursor: "pointer" }} onClick={() => abrirNota(n)}>
                                <td className="tnum" style={{ fontWeight: 700 }}>{n.Folio}</td>
                                <td className="muted" style={{ fontSize: 12 }}><RelativeTime fecha={n.CreatedAt} /></td>
                                <td>{n.Vendedor || "—"}</td>
                                <td>{n.Cliente}</td>
                                <td className="muted">{its.length} prod.</td>
                                <td className="num"><strong>{fmtMoney(n.Total ?? 0)}</strong></td>
                                <td className="actions-cell">
                                  <button className="btn btn-wine btn-sm" onClick={e => { e.stopPropagation(); setWizardNota(n) }}>
                                    Cobrar
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                }
              </div>
            </div>

            {/* Panel de nota seleccionada */}
            {selected && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.Folio}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{selected.Cliente} · {selected.Vendedor}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-default btn-sm" onClick={() => setEditando(!editando)}>
                        <Icon name="edit" size={12} /> {editando ? "Cancelar edición" : "Editar"}
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--err)" }} onClick={() => setConfirmCancelar(true)} disabled={saving}>
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-body" style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Productos</div>
                    {(editando ? editItems : items).map((it, i) => (
                      <div key={it.key ?? i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{ flex: 1, fontSize: 13 }}>
                          <div>{it.nombre ?? it.name}</div>
                          {it.presLabel && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{it.presLabel}</div>}
                        </div>
                        {editando
                          ? <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              {it.mayoreoDisp && (
                                <button
                                  onClick={() => toggleMayoreoItem(it.key ?? it.sku)}
                                  style={{
                                    fontSize: 9, fontWeight: 700, padding: "2px 5px",
                                    borderRadius: 4, border: "1px solid",
                                    cursor: "pointer",
                                    background: it.esMayoreo ? "var(--gold-500)" : "transparent",
                                    color: it.esMayoreo ? "#000" : "var(--text-muted)",
                                    borderColor: it.esMayoreo ? "var(--gold-500)" : "var(--border)",
                                  }}
                                  title={it.esMayoreo
                                    ? `Mayoreo $${it.precioMayoreo} → Normal $${it.precioNormal}`
                                    : `Normal $${it.precioNormal} → Mayoreo $${it.precioMayoreo}`}
                                >MAY</button>
                              )}
                              <button className="btn btn-ghost btn-sm" style={{ padding: "0 6px" }} onClick={() => setEditQty(it.key ?? it.sku, it.qty - 1)}>−</button>
                              <span style={{ minWidth: 24, textAlign: "center" }}>{it.qty}</span>
                              <button className="btn btn-ghost btn-sm" style={{ padding: "0 6px" }} onClick={() => setEditQty(it.key ?? it.sku, it.qty + 1)}>+</button>
                            </div>
                          : <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{it.qty}×</span>
                        }
                        <div style={{ textAlign: "right", fontSize: 13, fontFamily: "var(--font-mono)" }}>
                          {editando && it.esMayoreo && (
                            <div style={{ fontSize: 9, color: "var(--gold-700)", fontWeight: 700 }}>MAY</div>
                          )}
                          {fmtMoney((it.precio ?? 0) * it.qty)}
                        </div>
                      </div>
                    ))}

                    {editando && (
                      <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Agregar producto</div>
                        <input placeholder="Buscar producto…" value={addSearch} onChange={e => setAddSearch(e.target.value)}
                          style={{ width: "100%", marginBottom: 6 }} />
                        {filteredCatalogo.map(p => (
                          <div key={p.sku} onClick={() => addProducto(p)}
                            style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", cursor: "pointer", borderRadius: 4, fontSize: 13 }}
                            className="hover-row">
                            <div>
                              <div>{p.name}</div>
                              {p.presentaciones?.length > 1 && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.presentaciones.map(x => x.label).join(" · ")}</div>}
                            </div>
                            <span style={{ color: "var(--text-muted)" }}>
                              {p.presentaciones?.length > 0 ? `Desde ${fmtMoney(p.presentaciones.find(x => x.precio > 0)?.precio ?? 0)}` : fmtMoney(p.precio)}
                            </span>
                          </div>
                        ))}
                        {presCajaModal && (
                          <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10, marginTop: 8, background: "var(--bg-sunken)" }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Elegir presentación: {presCajaModal.name}</div>
                            {(presCajaModal.presentaciones || []).map(pres => (
                              <div key={pres.id} style={{ marginBottom: 4 }}>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button
                                    onClick={() => addProductoConPres(presCajaModal, pres, false)}
                                    style={{ flex: 1, display: "flex", justifyContent: "space-between", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", background: "var(--bg-card)", fontSize: 13 }}
                                    className="hover-row">
                                    <span>{pres.label}</span>
                                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmtMoney(pres.precio)}</span>
                                  </button>
                                  {pres.mayoreo && pres.precioMayoreo > 0 && (
                                    <button
                                      onClick={() => addProductoConPres(presCajaModal, pres, true)}
                                      style={{ padding: "6px 8px", border: "1px solid var(--gold-500)", borderRadius: 4, cursor: "pointer", background: "rgba(240,191,46,.12)", fontSize: 11, fontWeight: 700, color: "var(--gold-700)", whiteSpace: "nowrap" }}
                                      title={`Precio mayoreo: ${fmtMoney(pres.precioMayoreo)}`}>
                                      MAY {fmtMoney(pres.precioMayoreo)}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                            <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 4 }} onClick={() => setPresCajaModal(null)}>Cancelar</button>
                          </div>
                        )}
                        <button className="btn btn-wine btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={guardarEdicion} disabled={saving}>
                          <Icon name="check" size={12} /> Guardar cambios
                        </button>
                      </div>
                    )}

                    {!editando && (
                      <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 8, fontSize: 13 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Subtotal</span><span>{fmtMoney(totals.subtotal)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">IVA</span><span>{fmtMoney(totals.iva)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 4 }}><span>Total</span><span style={{ color: "var(--wine-700)" }}>{fmtMoney(totals.total)}</span></div>
                      </div>
                    )}
                  </div>
                </div>

                {!editando && (
                  <button
                    className="btn btn-wine"
                    style={{ fontSize: 16, padding: "14px 0", borderRadius: 8 }}
                    onClick={() => setWizardNota(selected)}
                  >
                    <Icon name="check" size={16} /> Cobrar {fmtMoney(totals.total)}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmación cancelar nota */}
      {confirmCancelar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}
          onClick={() => setConfirmCancelar(false)}>
          <div style={{ background: "var(--bg-elev)", borderRadius: 12, padding: 28, maxWidth: 360, width: "90%", boxShadow: "0 12px 40px rgba(0,0,0,.4)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>¿Cancelar nota?</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
              La nota <strong style={{ fontFamily: "var(--font-mono)" }}>{selected?.Folio}</strong> quedará como cancelada y no se podrá cobrar.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-default" style={{ flex: 1 }} onClick={() => setConfirmCancelar(false)}>
                No, regresar
              </button>
              <button
                className="btn btn-wine"
                style={{ flex: 1 }}
                disabled={saving}
                onClick={async () => { setConfirmCancelar(false); await cancelar() }}
              >
                Sí, cancelar nota
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
