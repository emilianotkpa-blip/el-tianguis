import { useState, useEffect, useRef } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { CLIENTES, SUCURSALES } from "../data"
import { getPedidosClientes, postPedidoCliente, patchPedidoCliente } from "../api"
import { fmtMoney, todayISO } from "../utils"

function badge(e) {
  if (e === "preparando") return <span className="badge badge-info">● Preparando</span>
  if (e === "listo")      return <span className="badge badge-warn">● Listo p/entrega</span>
  if (e === "entregado")  return <span className="badge badge-ok">● Entregado</span>
  if (e === "cancelado")  return <span className="badge badge-err">● Cancelado</span>
  return <span className="badge badge-neutral">{e}</span>
}

export default function PedidosClientesPage({ addToast }) {
  const [pedidos, setPedidos]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState("")
  const [estado, setEstado]     = useState("todos")
  const [showNew, setShowNew]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState({ cliente: "Mostrador", sucursal: "Centro", fechaEntrega: "", total: "", observaciones: "" })
  const folioRef = useRef(1043)
  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const cargar = async () => {
    setLoading(true)
    try { setPedidos(await getPedidosClientes()) }
    catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { cargar() }, [])

  const filtered = pedidos.filter((p) => {
    if (estado !== "todos" && (p.Estado ?? "").toLowerCase() !== estado) return false
    if (search && !(p.Cliente ?? "").toLowerCase().includes(search.toLowerCase()) && !(p.Folio ?? "").toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const crearPedido = async () => {
    if (!form.cliente) return
    setSaving(true)
    try {
      await postPedidoCliente({
        folio: "PC-" + String(folioRef.current++).padStart(4, "0"),
        fecha: todayISO(), cliente: form.cliente, sucursal: form.sucursal,
        estado: "preparando", fechaEntrega: form.fechaEntrega || null,
        total: Number(form.total) || 0, observaciones: form.observaciones,
      })
      addToast({ kind: "ok", msg: "Pedido creado" })
      setShowNew(false); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      await patchPedidoCliente(id, { Estado: nuevoEstado })
      addToast({ kind: "ok", msg: "Estado actualizado" }); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pedidos de clientes</h1>
          <p className="page-subtitle">{pedidos.length} pedidos registrados</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={cargar}><Icon name="refresh" size={13} /> Actualizar</button>
          <button className="btn btn-wine btn-sm" onClick={() => setShowNew(true)}><Icon name="plus" size={13} /> Nuevo pedido</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="filter-bar">
            <div className="search-input">
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar por folio o cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="todos">Todos los estados</option>
              <option value="preparando">Preparando</option>
              <option value="listo">Listos</option>
              <option value="entregado">Entregados</option>
              <option value="cancelado">Cancelados</option>
            </select>
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{filtered.length} resultados</span>
          </div>
        </div>
        <div className="card-body flush">
          {loading
            ? <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>Cargando pedidos…</div>
            : <table className="table">
                <thead>
                  <tr>
                    <th>Folio</th><th>Fecha</th><th>Cliente</th><th>Sucursal</th>
                    <th className="num">Total</th><th>Entrega</th><th>Estado</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.Id}>
                      <td className="tnum">{p.Folio}</td>
                      <td className="muted">{p.Fecha}</td>
                      <td><strong>{p.Cliente}</strong></td>
                      <td>{p.Sucursal}</td>
                      <td className="num"><strong>{fmtMoney(p.Total ?? 0)}</strong></td>
                      <td className="muted">{p.FechaEntrega ?? "—"}</td>
                      <td>{badge((p.Estado ?? "").toLowerCase())}</td>
                      <td className="actions-cell">
                        {p.Estado === "preparando" && (
                          <button className="btn btn-ghost btn-sm" title="Marcar listo" onClick={() => cambiarEstado(p.Id, "listo")}>
                            <Icon name="check" size={12} />
                          </button>
                        )}
                        {p.Estado === "listo" && (
                          <button className="btn btn-ghost btn-sm" title="Marcar entregado" onClick={() => cambiarEstado(p.Id, "entregado")}>
                            <Icon name="check" size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Sin pedidos</td></tr>
                  )}
                </tbody>
              </table>
          }
        </div>
      </div>

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Nuevo pedido de cliente"
        footer={
          <>
            <button className="btn btn-default" onClick={() => setShowNew(false)} disabled={saving}>Cancelar</button>
            <button className="btn btn-wine" onClick={crearPedido} disabled={saving}>
              <Icon name="check" size={13} /> {saving ? "Guardando…" : "Crear pedido"}
            </button>
          </>
        }
      >
        <div className="form-grid cols-2">
          <div className="form-row">
            <label>Cliente</label>
            <select value={form.cliente} onChange={setF("cliente")}>
              {CLIENTES.map((c) => <option key={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Sucursal</label>
            <select value={form.sucursal} onChange={setF("sucursal")}>
              {SUCURSALES.map((s) => <option key={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Fecha de entrega</label>
            <input type="date" value={form.fechaEntrega} onChange={setF("fechaEntrega")} />
          </div>
          <div className="form-row">
            <label>Total estimado</label>
            <input type="number" step="0.01" value={form.total} onChange={setF("total")} placeholder="0.00" />
          </div>
          <div className="form-row" style={{ gridColumn: "1/-1" }}>
            <label>Observaciones</label>
            <textarea rows="2" value={form.observaciones} onChange={setF("observaciones")} placeholder="Indicaciones especiales…" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
