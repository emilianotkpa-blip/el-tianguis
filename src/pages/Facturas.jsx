import { useState, useEffect } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { getVentas, patchVenta } from "../api"
import { fmtMoney } from "../utils"

export default function FacturasPage({ addToast }) {
  const [ventas, setVentas]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState("")
  const [estado, setEstado]     = useState("todas")
  const [viewing, setViewing]   = useState(null)
  const [updating, setUpdating] = useState(false)

  const cargar = async () => {
    setLoading(true)
    try { setVentas(await getVentas()) }
    catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { cargar() }, [])

  const toFactura = (v) => ({
    _id: v.Id, folio: v.Folio, fecha: v.Fecha,
    cliente: v.Cliente, metodo: v.MetodoPago,
    subtotal: v.Subtotal ?? 0, iva: v.IVA ?? 0, total: v.Total ?? 0,
    estado: v.Estado ?? "pagada",
    items: (() => { try { return JSON.parse(v.Items_JSON ?? "[]") } catch { return [] } })(),
  })

  const facturas = ventas.map(toFactura)

  const filtered = facturas.filter((f) => {
    if (estado !== "todas" && f.estado !== estado) return false
    if (search && !f.cliente.toLowerCase().includes(search.toLowerCase()) && !f.folio.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const stats = {
    pagadas:   facturas.filter((f) => f.estado === "pagada").reduce((s, f) => s + f.total, 0),
    pendientes: facturas.filter((f) => f.estado === "pendiente").reduce((s, f) => s + f.total, 0),
    canceladas: facturas.filter((f) => f.estado === "cancelada").length,
  }

  const cambiarEstado = async (id, nuevoEstado) => {
    setUpdating(true)
    try {
      await patchVenta(id, { Estado: nuevoEstado })
      addToast({ kind: "ok", msg: "Estado actualizado" })
      setViewing(null); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setUpdating(false) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Facturas</h1>
          <p className="page-subtitle">Emisión, seguimiento y CFDI</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm"><Icon name="download" size={13} /> Descargar CFDIs</button>
          <button className="btn btn-wine btn-sm"><Icon name="plus" size={13} /> Emitir factura</button>
        </div>
      </div>

      {loading && <div style={{ padding: "12px 0", color: "var(--text-muted)", fontSize: 13 }}>Cargando ventas…</div>}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--ok)" }}></div>
          <div className="kpi-label">Cobrado este mes</div>
          <div className="kpi-value">{fmtMoney(stats.pagadas)}</div>
          <div className="kpi-delta up">▲ 12.4% <span className="label">vs. mes anterior</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--warn)" }}></div>
          <div className="kpi-label">Por cobrar</div>
          <div className="kpi-value">{fmtMoney(stats.pendientes)}</div>
          <div className="kpi-delta"><span className="label">{facturas.filter(f=>f.estado==="pendiente").length} facturas pendientes</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--err)" }}></div>
          <div className="kpi-label">Canceladas</div>
          <div className="kpi-value">{stats.canceladas}</div>
          <div className="kpi-delta"><span className="label">Este mes</span></div>
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
              <option value="todas">Todos los estados</option>
              <option value="pagada">Pagadas</option>
              <option value="pendiente">Pendientes</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
        </div>
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>Folio</th><th>Fecha</th><th>Cliente</th><th>Método</th>
                <th className="num">Subtotal</th><th className="num">IVA</th><th className="num">Total</th>
                <th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f._id ?? f.folio}>
                  <td className="tnum">{f.folio}</td>
                  <td className="muted">{f.fecha}</td>
                  <td><strong>{f.cliente}</strong></td>
                  <td className="muted">{f.metodo}</td>
                  <td className="num">{fmtMoney(f.subtotal)}</td>
                  <td className="num">{fmtMoney(f.iva)}</td>
                  <td className="num"><strong>{fmtMoney(f.total)}</strong></td>
                  <td>
                    {f.estado === "pagada"    && <span className="badge badge-ok">● Pagada</span>}
                    {f.estado === "pendiente" && <span className="badge badge-warn">● Pendiente</span>}
                    {f.estado === "cancelada" && <span className="badge badge-err">● Cancelada</span>}
                  </td>
                  <td className="actions-cell">
                    <button className="btn btn-ghost btn-sm" onClick={() => setViewing(f)}><Icon name="eye" size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={`Factura ${viewing?.folio}`}
        large
        footer={
          <>
            <button className="btn btn-default" onClick={() => setViewing(null)}>Cerrar</button>
            {viewing?.estado === "pendiente" && (
              <button className="btn btn-ok btn-sm" disabled={updating} onClick={() => cambiarEstado(viewing._id, "pagada")}>
                <Icon name="check" size={13} /> Marcar pagada
              </button>
            )}
            {viewing?.estado !== "cancelada" && (
              <button className="btn btn-default btn-sm" disabled={updating} onClick={() => cambiarEstado(viewing._id, "cancelada")}>
                Cancelar factura
              </button>
            )}
            <button className="btn btn-wine"><Icon name="print" size={13} /> Imprimir</button>
          </>
        }
      >
        {viewing && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20 }}>
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Emisor</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>El Tianguis S.A. de C.V.</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>RFC: ETI920512K11<br />Av. Hidalgo 245, Centro</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Receptor</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{viewing.cliente}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Fecha: {viewing.fecha}<br />Método: {viewing.metodo}</div>
              </div>
            </div>
            <table className="table" style={{ border: "1px solid var(--border)" }}>
              <thead><tr><th>Concepto</th><th className="num">Cant.</th><th className="num">P. unit.</th><th className="num">Importe</th></tr></thead>
              <tbody>
                {viewing.items.length > 0
                  ? viewing.items.map((it, i) => (
                    <tr key={i}>
                      <td>{it.name} <span className="muted">({it.unidad})</span></td>
                      <td className="num">{it.qty}</td>
                      <td className="num">{fmtMoney(it.precio)}</td>
                      <td className="num">{fmtMoney(it.precio * it.qty)}</td>
                    </tr>
                  ))
                  : <tr><td colSpan={4} className="muted" style={{ textAlign: "center" }}>Sin detalle de productos</td></tr>
                }
              </tbody>
            </table>
            <div style={{ marginTop: 16, marginLeft: "auto", maxWidth: 280 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span>Subtotal</span><span className="tnum">{fmtMoney(viewing.subtotal)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span>IVA 16%</span><span className="tnum">{fmtMoney(viewing.iva)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", borderTop: "1px solid var(--border)", fontWeight: 600, fontSize: 16 }}>
                <span>Total</span><span className="tnum">{fmtMoney(viewing.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
