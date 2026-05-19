import { useState } from "react"
import Icon from "../components/Icon"
import { PEDIDOS_CLIENTES } from "../data"
import { fmtMoney } from "../utils"

function badge(e) {
  if (e === "preparando") return <span className="badge badge-info">● Preparando</span>
  if (e === "listo")      return <span className="badge badge-warn">● Listo p/entrega</span>
  if (e === "entregado")  return <span className="badge badge-ok">● Entregado</span>
  if (e === "cancelado")  return <span className="badge badge-err">● Cancelado</span>
  return <span className="badge badge-neutral">{e}</span>
}

export default function PedidosClientesPage({ addToast }) {
  const [search, setSearch] = useState("")
  const [estado, setEstado] = useState("todos")

  const filtered = PEDIDOS_CLIENTES.filter((p) => {
    if (estado !== "todos" && p.estado !== estado) return false
    if (search && !p.cliente.toLowerCase().includes(search.toLowerCase()) && !p.id.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pedidos de clientes</h1>
          <p className="page-subtitle">Órdenes pendientes de surtir y entregar</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm"><Icon name="download" size={13} /> Exportar</button>
          <button className="btn btn-wine btn-sm"><Icon name="plus" size={13} /> Nuevo pedido</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="filter-bar">
            <div className="search-input">
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar por ID o cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="todos">Todos los estados</option>
              <option value="preparando">Preparando</option>
              <option value="listo">Listos</option>
              <option value="entregado">Entregados</option>
              <option value="cancelado">Cancelados</option>
            </select>
          </div>
        </div>
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th><th>Fecha</th><th>Cliente</th><th>Sucursal</th>
                <th className="num">Items</th><th className="num">Total</th><th>Entrega</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="tnum">{p.id}</td>
                  <td className="muted">{p.fecha}</td>
                  <td><strong>{p.cliente}</strong></td>
                  <td>{p.sucursal}</td>
                  <td className="num">{p.items}</td>
                  <td className="num"><strong>{fmtMoney(p.total)}</strong></td>
                  <td className="muted">{p.entrega}</td>
                  <td>{badge(p.estado)}</td>
                  <td className="actions-cell">
                    <button className="btn btn-ghost btn-sm"><Icon name="eye" size={12} /></button>
                    <button className="btn btn-ghost btn-sm"><Icon name="edit" size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
