import { useState, useEffect, useMemo } from "react"
import Icon from "../components/Icon"
import { TableSkeleton } from "../components/Skeleton"
import Modal from "../components/Modal"
import Confirm from "../components/Confirm"
import { getProveedores, postProveedor, patchProveedor, deleteProveedor, getDepositos } from "../api"
import { exportCSV, fmtMoney, fmtFecha, hoyLocal } from "../utils"

const vacio = { nombre: "", contacto: "", telefono: "", correo: "", rfc: "", banco: "", cuenta: "", notas: "" }

// En la tabla basta con los últimos 4 dígitos para reconocer la cuenta, sin
// dejar la CLABE completa a la vista de quien pase por la pantalla
const cuentaCorta = (c) => {
  const d = String(c || "").replace(/\s/g, "")
  return d.length > 4 ? "··" + d.slice(-4) : d
}

export default function ProveedoresPage({ addToast }) {
  const [proveedores, setProveedores] = useState([])
  const [depositos, setDepositos]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState("")
  const [editing, setEditing]         = useState(null)
  const [showNew, setShowNew]         = useState(false)
  const [form, setForm]               = useState(vacio)
  const [saving, setSaving]           = useState(false)
  const [confirmDel, setConfirmDel]   = useState(null)

  const cargar = async () => {
    setLoading(true)
    try {
      const [p, d] = await Promise.all([getProveedores(), getDepositos()])
      setProveedores(p)
      setDepositos(d)
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { cargar() }, [])

  // Cuánto se le ha depositado a cada proveedor y cuándo fue la última vez
  const resumen = useMemo(() => {
    const r = {}
    for (const d of depositos) {
      const k = d.proveedorId
      if (!r[k]) r[k] = { total: 0, n: 0, ultimo: "" }
      r[k].total += d.monto
      r[k].n++
      if (d.fecha > r[k].ultimo) r[k].ultimo = d.fecha
    }
    return r
  }, [depositos])

  const hoy = hoyLocal()
  const kpis = useMemo(() => ({
    proveedores: proveedores.length,
    mes:  depositos.filter(d => d.fecha.startsWith(hoy.slice(0, 7))).reduce((s, d) => s + d.monto, 0),
    anio: depositos.filter(d => d.fecha.startsWith(hoy.slice(0, 4))).reduce((s, d) => s + d.monto, 0),
  }), [proveedores, depositos, hoy])

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const openEdit = (p) => {
    setEditing(p)
    setForm({ nombre: p.nombre, contacto: p.contacto, telefono: p.telefono, correo: p.correo,
              rfc: p.rfc, banco: p.banco, cuenta: p.cuenta, notas: p.notas })
  }
  const openNew    = () => { setShowNew(true); setForm(vacio) }
  const closeModal = () => { setEditing(null); setShowNew(false) }

  const saveModal = async () => {
    if (!form.nombre.trim()) return addToast({ kind: "err", msg: "El nombre del proveedor es obligatorio" })
    setSaving(true)
    try {
      if (editing) await patchProveedor(editing.id, form)
      else         await postProveedor(form)
      addToast({ kind: "ok", msg: editing ? "Proveedor actualizado" : "Proveedor registrado" })
      closeModal(); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  const eliminar = async () => {
    if (!confirmDel) return
    try {
      await deleteProveedor(confirmDel.id)
      addToast({ kind: "ok", msg: `${confirmDel.nombre} eliminado` })
      setConfirmDel(null); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
  }

  const q = search.trim().toLowerCase()
  const filtered = proveedores.filter(p =>
    !q || [p.nombre, p.contacto, p.rfc, p.telefono, p.banco].some(v => (v || "").toLowerCase().includes(q)))

  const depositosDe = editing ? depositos.filter(d => d.proveedorId === editing.id) : []
  const totalDe     = depositosDe.reduce((s, d) => s + d.monto, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Proveedores</h1>
          <p className="page-subtitle">{kpis.proveedores} proveedores registrados</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={cargar}><Icon name="refresh" size={13} /> Actualizar</button>
          <button className="btn btn-default btn-sm" onClick={() => exportCSV(proveedores.map(p => ({
            Proveedor: p.nombre, Contacto: p.contacto, Telefono: p.telefono, Correo: p.correo, RFC: p.rfc,
            Banco: p.banco, Cuenta: p.cuenta,
            Depositado: (resumen[p.id]?.total ?? 0).toFixed(2), UltimoDeposito: resumen[p.id]?.ultimo ?? "",
          })), "proveedores.csv")}>
            <Icon name="download" size={13} /> Exportar CSV
          </button>
          <button className="btn btn-wine btn-sm" onClick={openNew}><Icon name="plus" size={13} /> Nuevo proveedor</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi">
          <div className="kpi-accent"></div>
          <div className="kpi-label">Proveedores</div>
          <div className="kpi-value">{kpis.proveedores}</div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--wine-700)" }}></div>
          <div className="kpi-label">Depositado este mes</div>
          <div className="kpi-value">{fmtMoney(kpis.mes)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--ok)" }}></div>
          <div className="kpi-label">Depositado en el año</div>
          <div className="kpi-value">{fmtMoney(kpis.anio)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="filter-bar">
            <div className="search-input">
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar por nombre, contacto, RFC o banco…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{filtered.length} resultados</span>
          </div>
        </div>
        <div className="card-body flush">
          {loading
            ? <TableSkeleton rows={6} cols={6} />
            : <table className="table tarjetas-movil">
                <thead>
                  <tr>
                    <th>Proveedor</th><th>Teléfono</th><th>Banco</th>
                    <th className="num">Depositado</th><th>Último depósito</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const r = resumen[p.id]
                    return (
                      <tr key={p.id} onClick={() => openEdit(p)} style={{ cursor: "pointer" }}>
                        <td className="td-titulo" data-label="Proveedor">
                          <strong>{p.nombre}</strong>
                          {p.contacto && <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{p.contacto}</div>}
                        </td>
                        <td className="muted" data-label="Teléfono">{p.telefono || "—"}</td>
                        <td className="muted" data-label="Banco">
                          {p.banco || p.cuenta ? <>{p.banco}{p.cuenta && <span className="tnum"> {cuentaCorta(p.cuenta)}</span>}</> : "—"}
                        </td>
                        <td className="num" data-label="Depositado">
                          {r ? <><strong>{fmtMoney(r.total)}</strong><div className="muted" style={{ fontSize: "var(--fs-2xs)" }}>{r.n} depósito{r.n !== 1 ? "s" : ""}</div></> : <span className="muted">—</span>}
                        </td>
                        <td className="muted" data-label="Último depósito">{r ? fmtFecha(r.ultimo) : "—"}</td>
                        <td className="actions-cell" onClick={e => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => openEdit(p)}><Icon name="edit" size={12} /></button>
                          <button className="btn btn-ghost btn-sm" title="Eliminar" onClick={() => setConfirmDel(p)} style={{ color: "var(--err)" }}><Icon name="trash" size={12} /></button>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                      {proveedores.length ? "Ningún proveedor coincide con la búsqueda" : "Aún no hay proveedores. Registra el primero con «Nuevo proveedor»."}
                    </td></tr>
                  )}
                </tbody>
              </table>
          }
        </div>
      </div>

      <Confirm
        open={!!confirmDel}
        title="¿Eliminar proveedor?"
        message={confirmDel ? `Se eliminará "${confirmDel.nombre}". Los depósitos que ya se le hicieron se conservan en el historial con su nombre.` : ""}
        confirmLabel="Sí, eliminar"
        danger
        onConfirm={eliminar}
        onCancel={() => setConfirmDel(null)}
      />

      <Modal
        open={!!editing || showNew}
        onClose={closeModal}
        title={editing ? `Editar: ${editing.nombre}` : "Nuevo proveedor"}
        footer={
          <>
            <button className="btn btn-default" onClick={closeModal} disabled={saving}>Cancelar</button>
            <button className="btn btn-wine" onClick={saveModal} disabled={saving}>
              <Icon name="check" size={13} /> {saving ? "Guardando…" : "Guardar"}
            </button>
          </>
        }
      >
        <div className="form-grid cols-2">
          <div className="form-row" style={{ gridColumn: "1/-1" }}><label>Nombre *</label><input value={form.nombre} onChange={setF("nombre")} placeholder="Distribuidora Polpusa" /></div>
          <div className="form-row"><label>Contacto</label><input value={form.contacto} onChange={setF("contacto")} placeholder="Con quién se trata" /></div>
          <div className="form-row"><label>Teléfono</label><input value={form.telefono} onChange={setF("telefono")} /></div>
          <div className="form-row"><label>Correo</label><input type="email" value={form.correo} onChange={setF("correo")} /></div>
          <div className="form-row"><label>RFC</label><input value={form.rfc} onChange={setF("rfc")} /></div>
          <div className="form-row"><label>Banco</label><input value={form.banco} onChange={setF("banco")} placeholder="BBVA, Banorte…" /></div>
          <div className="form-row"><label>Cuenta o CLABE</label><input value={form.cuenta} onChange={setF("cuenta")} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></div>
          <div className="form-row" style={{ gridColumn: "1/-1" }}><label>Notas</label><textarea rows="2" value={form.notas} onChange={setF("notas")} /></div>
        </div>

        {/* Lo depositado a este proveedor, para no tener que ir a buscarlo */}
        {editing && (
          <div className="prov-depositos">
            <div className="prov-depositos-cabeza">
              <span>Depósitos a este proveedor</span>
              {depositosDe.length > 0 && <strong>{fmtMoney(totalDe)}</strong>}
            </div>
            {depositosDe.length === 0
              ? <p className="muted" style={{ margin: 0, fontSize: "var(--fs-xs)" }}>Todavía no se le ha registrado ningún depósito.</p>
              : <ul>
                  {depositosDe.slice(0, 8).map(d => (
                    <li key={d.id}>
                      <span className="muted">{fmtFecha(d.fecha)}</span>
                      <span>{d.llevo}</span>
                      <strong className="tnum">{fmtMoney(d.monto)}</strong>
                    </li>
                  ))}
                  {depositosDe.length > 8 && (
                    <li className="muted" style={{ justifyContent: "center" }}>y {depositosDe.length - 8} más en Depósitos</li>
                  )}
                </ul>
            }
          </div>
        )}
      </Modal>
    </div>
  )
}
