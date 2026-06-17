import { useState, useEffect } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import Confirm from "../components/Confirm"
import { getClientes, postCliente, patchCliente, deleteCliente } from "../api"
import { exportCSV } from "../utils"

const TIPOS = ["Mayorista", "Frecuente", "Público", "General"]
const emptyForm = { nombre: "", rfc: "", tipo: "General", telefono: "", email: "", direccion: "", notas: "" }

export default function ClientesPage({ addToast }) {
  const [clientes, setClientes]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState("")
  const [tipoF, setTipoF]         = useState("todos")
  const [editing, setEditing]     = useState(null)
  const [showNew, setShowNew]     = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)   // cliente a eliminar

  const cargar = async () => {
    setLoading(true)
    try { setClientes(await getClientes()) }
    catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { cargar() }, [])

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const openEdit = (c) => {
    setEditing(c)
    setForm({ nombre: c.Nombre ?? "", rfc: c.RFC ?? "", tipo: c.Tipo ?? "General", telefono: c.Telefono ?? "", email: c.Email ?? "", direccion: c.Direccion ?? "", notas: c.Notas ?? "" })
  }
  const openNew    = () => { setShowNew(true); setForm(emptyForm) }
  const closeModal = () => { setEditing(null); setShowNew(false) }

  const saveModal = async () => {
    if (!form.nombre) return addToast({ kind: "err", msg: "Nombre es obligatorio" })
    setSaving(true)
    try {
      if (editing) {
        await patchCliente(editing.Id, { Nombre: form.nombre, RFC: form.rfc, Tipo: form.tipo, Telefono: form.telefono, Email: form.email, Direccion: form.direccion, Notas: form.notas })
      } else {
        await postCliente({ nombre: form.nombre, rfc: form.rfc, tipo: form.tipo, telefono: form.telefono, email: form.email, direccion: form.direccion, limiteCredito: form.limiteCredito, saldo: form.saldo, notas: form.notas })
      }
      addToast({ kind: "ok", msg: editing ? "Cliente actualizado" : "Cliente creado" })
      closeModal(); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  const eliminar = async () => {
    if (!confirmDel) return
    try {
      await deleteCliente(confirmDel.Id)
      addToast({ kind: "ok", msg: `${confirmDel.Nombre} eliminado` })
      setConfirmDel(null); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
  }

  const filtered = clientes.filter((c) => {
    if (tipoF !== "todos" && (c.Tipo ?? "General") !== tipoF) return false
    if (search && !(c.Nombre ?? "").toLowerCase().includes(search.toLowerCase()) && !(c.RFC ?? "").includes(search)) return false
    return true
  })

  const stats = {
    total:      clientes.length,
    mayoristas: clientes.filter((c) => c.Tipo === "Mayorista").length,
    frecuentes: clientes.filter((c) => c.Tipo === "Frecuente").length,
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">{stats.total} clientes registrados</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={cargar}><Icon name="refresh" size={13} /> Actualizar</button>
          <button className="btn btn-default btn-sm" onClick={() => exportCSV(clientes.map((c) => ({ Nombre: c.Nombre, RFC: c.RFC, Tipo: c.Tipo, Telefono: c.Telefono, Email: c.Email, Direccion: c.Direccion })), "clientes.csv")}>
            <Icon name="download" size={13} /> Exportar CSV
          </button>
          <button className="btn btn-wine btn-sm" onClick={openNew}><Icon name="plus" size={13} /> Nuevo cliente</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {[
          { key: "todos",     accent: "",                label: "Total clientes", value: stats.total },
          { key: "Mayorista", accent: "var(--wine-700)", label: "Mayoristas",     value: stats.mayoristas },
          { key: "Frecuente", accent: "var(--ok)",       label: "Frecuentes",     value: stats.frecuentes },
        ].map(({ key, accent, label, value }) => (
          <div
            key={key}
            className="kpi"
            onClick={() => setTipoF(key)}
            style={{ cursor: "pointer", outline: tipoF === key ? "2px solid var(--wine-500)" : "none", outlineOffset: 2 }}
          >
            <div className="kpi-accent" style={accent ? { background: accent } : {}}></div>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="filter-bar">
            <div className="search-input">
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar por nombre o RFC…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select value={tipoF} onChange={(e) => setTipoF(e.target.value)}>
              <option value="todos">Todos los tipos</option>
              {TIPOS.map((t) => <option key={t}>{t}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{filtered.length} resultados</span>
          </div>
        </div>
        <div className="card-body flush">
          {loading
            ? <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>Cargando clientes…</div>
            : <table className="table">
                <thead>
                  <tr><th>Nombre</th><th>RFC</th><th>Tipo</th><th>Teléfono</th><th>Email</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.Id}>
                      <td><strong>{c.Nombre}</strong></td>
                      <td className="tnum" style={{ fontSize: 11.5 }}>{c.RFC || "—"}</td>
                      <td><span className="badge badge-neutral">{c.Tipo || "General"}</span></td>
                      <td className="muted">{c.Telefono || "—"}</td>
                      <td className="muted">{c.Email || "—"}</td>
                      <td className="actions-cell">
                        <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => openEdit(c)}><Icon name="edit" size={12} /></button>
                        <button className="btn btn-ghost btn-sm" title="Eliminar" onClick={() => setConfirmDel(c)} style={{ color: "var(--err)" }}><Icon name="trash" size={12} /></button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && !loading && (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Sin clientes registrados</td></tr>
                  )}
                </tbody>
              </table>
          }
        </div>
      </div>

      <Confirm
        open={!!confirmDel}
        title="¿Eliminar cliente?"
        message={confirmDel ? `Se eliminará "${confirmDel.Nombre}" permanentemente. Esta acción no se puede revertir.` : ""}
        confirmLabel="Sí, eliminar"
        danger
        onConfirm={eliminar}
        onCancel={() => setConfirmDel(null)}
      />

      <Modal
        open={!!editing || showNew}
        onClose={closeModal}
        title={editing ? `Editar: ${editing.Nombre}` : "Nuevo cliente"}
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
          <div className="form-row" style={{ gridColumn: "1/-1" }}><label>Nombre *</label><input value={form.nombre} onChange={setF("nombre")} /></div>
          <div className="form-row"><label>RFC</label><input value={form.rfc} onChange={setF("rfc")} placeholder="XAXX010101000" /></div>
          <div className="form-row"><label>Tipo</label>
            <select value={form.tipo} onChange={setF("tipo")}>
              {TIPOS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-row"><label>Teléfono</label><input value={form.telefono} onChange={setF("telefono")} /></div>
          <div className="form-row"><label>Email</label><input type="email" value={form.email} onChange={setF("email")} /></div>
          <div className="form-row" style={{ gridColumn: "1/-1" }}><label>Dirección</label><input value={form.direccion} onChange={setF("direccion")} /></div>
          <div className="form-row" style={{ gridColumn: "1/-1" }}><label>Notas</label><textarea rows="2" value={form.notas} onChange={setF("notas")} /></div>
        </div>
      </Modal>
    </div>
  )
}
