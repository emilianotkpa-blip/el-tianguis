import { useState, useEffect, useCallback } from "react"
import Icon from "../components/Icon"
import { getCaja, getCajaPorFolio, editarNotaCaja, cobrarNota, cancelarNota, getCatalogo } from "../api"
import { fmtMoney, todayISO } from "../utils"

const METODOS = ["Efectivo", "Tarjeta", "Transferencia", "Crédito 8d", "Crédito 15d"]

function RelativeTime({ fecha }) {
  if (!fecha) return null
  const diff = Math.round((Date.now() - new Date(fecha)) / 60000)
  if (diff < 1)  return <span>Ahora</span>
  if (diff < 60) return <span>Hace {diff} min</span>
  return <span>Hace {Math.round(diff / 60)} h</span>
}

export default function CajaPage({ addToast }) {
  const [notas, setNotas]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)   // nota abierta
  const [folioInput, setFolioInput] = useState("")
  const [editando, setEditando] = useState(false)
  const [catalogo, setCatalogo] = useState([])
  const [addSearch, setAddSearch] = useState("")
  const [pagos, setPagos]       = useState([])
  const [saving, setSaving]     = useState(false)
  const [cobrada, setCobrada]   = useState(null)   // nota recién cobrada

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

  const abrirNota = (nota) => {
    setSelected(nota)
    setCobrada(null)
    setEditando(false)
    setAddSearch("")
    try {
      const ps = JSON.parse(nota.Pagos_JSON || "[]")
      setPagos(ps.length ? ps : [{ metodo: "Efectivo", monto: nota.Total ?? 0 }])
    } catch { setPagos([{ metodo: "Efectivo", monto: nota.Total ?? 0 }]) }
  }

  const buscarPorFolio = async () => {
    if (!folioInput.trim()) return
    try {
      const nota = await getCajaPorFolio(folioInput.trim())
      abrirNota(nota)
    } catch { addToast({ kind: "err", msg: `Folio ${folioInput} no encontrado` }) }
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

  // ── Edición de items ───────────────────────────────────
  const [editItems, setEditItems] = useState([])
  useEffect(() => {
    if (editando && selected) setEditItems(getItems(selected))
  }, [editando, selected])

  const setEditQty = (sku, qty) => {
    if (qty <= 0) setEditItems(it => it.filter(x => x.sku !== sku))
    else setEditItems(it => it.map(x => x.sku === sku ? { ...x, qty } : x))
  }
  const addProducto = (p) => {
    setEditItems(it => {
      const ex = it.find(x => x.sku === p.sku)
      if (ex) return it.map(x => x.sku === p.sku ? { ...x, qty: x.qty + 1 } : x)
      return [...it, { sku: p.sku, nombre: p.name, name: p.name, precio: p.precio, facturable: p.facturable, piezasPorUnidad: p.piezasPorUnidad, qty: 1 }]
    })
    setAddSearch("")
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
      setPagos([{ metodo: "Efectivo", monto: totals.total }])
      setEditando(false)
      addToast({ kind: "ok", msg: "Nota actualizada" })
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  // ── Cobro ──────────────────────────────────────────────
  const setPagoField = (i, field, val) => setPagos(p => p.map((x, idx) => idx === i ? { ...x, [field]: val } : x))
  const addPago  = () => setPagos(p => [...p, { metodo: "Efectivo", monto: "" }])
  const removePago = (i) => setPagos(p => p.filter((_, idx) => idx !== i))

  const items       = selected ? getItems(selected) : []
  const totals      = calcTotals(items)
  const totalPagado = pagos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0)
  const cambio      = Math.max(0, totalPagado - totals.total)
  const pendiente   = Math.max(0, totals.total - totalPagado)

  const cobrar = async () => {
    if (pendiente > 0) return addToast({ kind: "err", msg: `Faltan ${fmtMoney(pendiente)} por pagar` })
    setSaving(true)
    try {
      await cobrarNota(selected.Id, {
        pagos: pagos.map(p => ({ metodo: p.metodo, monto: parseFloat(p.monto) || 0 })),
        sucursal: selected.Sucursal,
      })
      setCobrada({ ...selected, pagos, cambio, totals })
      setNotas(n => n.filter(x => x.Id !== selected.Id))
      setSelected(null)
      addToast({ kind: "ok", msg: `Nota ${selected.Folio} cobrada` })
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

  const filteredCatalogo = catalogo.filter(p =>
    addSearch && (p.name.toLowerCase().includes(addSearch.toLowerCase()) || p.sku.includes(addSearch))
  ).slice(0, 8)

  // ── Pantalla de cobro exitoso ──────────────────────────
  if (cobrada) {
    const { totals: t, pagos: ps, cambio: c } = cobrada
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Caja</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <div className="card" style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
            <div className="card-body" style={{ padding: 32 }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ok)", marginBottom: 8 }}>¡Cobrado!</div>
              <div style={{ fontSize: 28, fontFamily: "var(--font-mono)", fontWeight: 800, marginBottom: 4 }}>{cobrada.Folio}</div>
              <div style={{ fontSize: 22, fontFamily: "var(--font-mono)", color: "var(--wine-700)", fontWeight: 700, marginBottom: 16 }}>{fmtMoney(t.total)}</div>
              {c > 0 && (
                <div style={{ background: "var(--bg-sunken)", borderRadius: 8, padding: "12px 20px", marginBottom: 16, fontSize: 20, fontWeight: 700, color: "var(--ok)" }}>
                  Cambio: {fmtMoney(c)}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8 }}>
                <button className="btn btn-default" onClick={() => window.print()}><Icon name="print" size={13} /> Imprimir</button>
                <button className="btn btn-wine" onClick={() => setCobrada(null)}>Nueva nota</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Caja</h1>
          <p className="page-subtitle">{notas.length} nota{notas.length !== 1 ? "s" : ""} pendiente{notas.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={cargarCola}><Icon name="refresh" size={13} /> Actualizar</button>
          <div style={{ display: "flex", gap: 6 }}>
            <input placeholder="Buscar folio…" value={folioInput} onChange={e => setFolioInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && buscarPorFolio()}
              style={{ width: 160 }} />
            <button className="btn btn-wine btn-sm" onClick={buscarPorFolio}><Icon name="search" size={13} /></button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 480px" : "1fr", gap: 16 }}>
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
                              <button className="btn btn-wine btn-sm" onClick={e => { e.stopPropagation(); abrirNota(n) }}>
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
            {/* Header */}
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
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--err)" }} onClick={cancelar} disabled={saving}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="card">
              <div className="card-body" style={{ padding: "12px 16px" }}>
                <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Productos</div>
                {(editando ? editItems : items).map((it, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1, fontSize: 13 }}>{it.nombre ?? it.name}</div>
                    {editando
                      ? <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: "0 6px" }} onClick={() => setEditQty(it.sku, it.qty - 1)}>−</button>
                          <span style={{ minWidth: 24, textAlign: "center" }}>{it.qty}</span>
                          <button className="btn btn-ghost btn-sm" style={{ padding: "0 6px" }} onClick={() => setEditQty(it.sku, it.qty + 1)}>+</button>
                        </div>
                      : <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{it.qty}×</span>
                    }
                    <div style={{ width: 72, textAlign: "right", fontSize: 13, fontFamily: "var(--font-mono)" }}>{fmtMoney((it.precio ?? 0) * it.qty)}</div>
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
                        <span>{p.name}</span>
                        <span style={{ color: "var(--text-muted)" }}>{fmtMoney(p.precio)}</span>
                      </div>
                    ))}
                    <button className="btn btn-wine btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={guardarEdicion} disabled={saving}>
                      <Icon name="check" size={12} /> Guardar cambios
                    </button>
                  </div>
                )}

                {/* Totales */}
                {!editando && (
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 8, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Subtotal</span><span>{fmtMoney(totals.subtotal)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">IVA</span><span>{fmtMoney(totals.iva)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 4 }}><span>Total</span><span style={{ color: "var(--wine-700)" }}>{fmtMoney(totals.total)}</span></div>
                  </div>
                )}
              </div>
            </div>

            {/* Pago */}
            {!editando && (
              <div className="card">
                <div className="card-body">
                  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Cobro</div>
                  {pagos.map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                      <select value={p.metodo} onChange={e => setPagoField(i, "metodo", e.target.value)} style={{ flex: 1 }}>
                        {METODOS.map(m => <option key={m}>{m}</option>)}
                      </select>
                      <input type="number" step="0.01" value={p.monto} onChange={e => setPagoField(i, "monto", e.target.value)}
                        style={{ width: 110, textAlign: "right" }} />
                      {pagos.length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => removePago(i)} style={{ color: "var(--err)" }}><Icon name="x" size={11} /></button>}
                    </div>
                  ))}
                  <button className="btn btn-default btn-sm" onClick={addPago} style={{ marginBottom: 10 }}>
                    <Icon name="plus" size={12} /> Agregar forma de pago
                  </button>
                  <div style={{ fontSize: 13, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                    {pendiente > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "var(--err)", fontWeight: 600 }}><span>Pendiente</span><span>{fmtMoney(pendiente)}</span></div>}
                    {cambio   > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ok)", fontWeight: 700, fontSize: 16 }}><span>Cambio</span><span>{fmtMoney(cambio)}</span></div>}
                  </div>
                  <button className="btn btn-wine" style={{ width: "100%", marginTop: 12 }} onClick={cobrar} disabled={saving || pendiente > 0}>
                    <Icon name="check" size={14} /> {saving ? "Cobrando…" : `Cobrar ${fmtMoney(totals.total)}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
