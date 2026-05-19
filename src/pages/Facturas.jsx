import { useState } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { FACTURAS } from "../data"
import { fmtMoney } from "../utils"

export default function FacturasPage({ addToast }) {
  const [search, setSearch] = useState("")
  const [estado, setEstado] = useState("todas")
  const [viewing, setViewing] = useState(null)

  const filtered = FACTURAS.filter((f) => {
    if (estado !== "todas" && f.estado !== estado) return false
    if (search && !f.cliente.toLowerCase().includes(search.toLowerCase()) && !f.folio.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const stats = {
    pagadas: FACTURAS.filter((f) => f.estado === "pagada").reduce((s, f) => s + f.total, 0),
    pendientes: FACTURAS.filter((f) => f.estado === "pendiente").reduce((s, f) => s + f.total, 0),
    canceladas: FACTURAS.filter((f) => f.estado === "cancelada").length,
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
          <div className="kpi-delta"><span className="label">2 facturas pendientes</span></div>
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
                <tr key={f.folio}>
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
                    <button className="btn btn-ghost btn-sm"><Icon name="download" size={12} /></button>
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
            <button className="btn btn-default"><Icon name="download" size={13} /> Descargar PDF</button>
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
                <tr><td>Bolsa 1kg polpusa <span className="muted">(paq/100)</span></td><td className="num">8</td><td className="num">$22.50</td><td className="num">$180.00</td></tr>
                <tr><td>Vasos Jaguar #8 <span className="muted">(paq/50)</span></td><td className="num">12</td><td className="num">$38.50</td><td className="num">$462.00</td></tr>
                <tr><td>Plato Reyma 855 <span className="muted">(paq/25)</span></td><td className="num">6</td><td className="num">$65.00</td><td className="num">$390.00</td></tr>
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
