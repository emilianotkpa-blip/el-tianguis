import { useState, useEffect } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { getClientes, postCliente, patchCliente } from "../api"
import { fmtMoney, exportCSV } from "../utils"

const TIPOS = ["Mayorista", "Frecuente", "Público", "General"]
const emptyForm = { nombre: "", rfc: "", tipo: "General", telefono: "", email: "", direccion: "", limiteCredito: "", saldo: "", notas: "" }

export default function ClientesPage({ addToast }) {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState("")
  const [tipoF, setTipoF]       = useState("todos")
  const [editing, setEditing]   = useState(null)
  const [showNew, setShowNew]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)

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
    setForm({ nombre: c.Nombre ?? "", rfc: c.RFC ?? "", tipo: c.Tipo ?? "General", telefono: c.Telefono ?? "", email: c.Email ?? "", direccion: c.Direccion ?? "", limiteCredito: c.LimiteCredito ?? "", saldo: c.Saldo ?? "", notas: c.Notas ?? "" })
  }
  const openNew    = () => { setShowNew(true); setForm(emptyForm) }
  const closeModal = () => { setEditing(null); setShowNew(false) }

  const saveModal = async () => {
    if (!form.nombre) return addToast({ kind: "err", msg: "Nombre es obligatorio" })
    setSaving(true)
    try {
      if (editing) {
        await patchCliente(editing.Id, { Nombre: form.nombre, RFC: form.rfc, Tipo: form.tipo, Telefono: form.telefono, Email: form.email, Direccion: form.direccion, LimiteCredito: Number(form.limiteCredito) || 0, Saldo: Number(form.saldo) || 0, Notas: form.notas })
      } else {
        await postCliente({ nombre: form.nombre, rfc: form.rfc, tipo: form.tipo, telefono: form.telefono, email: form.email, direccion: form.direccion, limiteCredito: form.limiteCredito, saldo: form.saldo, notas: form.notas })
      }
      addToast({ kind: "ok", msg: editing ? "Cliente actualizado" : "Cliente creado" })
      closeModal(); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
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
    porCobrar:  clientes.reduce((s, c) => s + (c.Saldo ?? 0), 0),
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
          <button className="btn btn-default btn-sm" onClick={() => exportCSV(clientes.map((c) => ({ Nombre: c.Nombre, RFC: c.RFC, Tipo: c.Tipo, Telefono: c.Telefono, Email: c.Email, LimiteCredito: c.LimiteCredito, Saldo: c.Saldo })), "clientes.csv")}>
            <Icon name="download" size={13} /> Exportar CSV
          </button>
          <button className="btn btn-wine btn-sm" onClick={openNew}><Icon name="plus" size={13} /> Nuevo cliente</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi"><div className="kpi-accent"></div><div className="kpi-label">Total clientes</div><div className="kpi-value">{stats.total}</div></div>
        <div className="kpi"><div className="kpi-accent" style={{ background: "var(--wine-700)" }}></div><div className="kpi-label">Mayoristas</div><div className="kpi-value">{stats.mayoristas}</div></div>
        <div className="kpi"><div className="kpi-accent" style={{ background: "var(--ok)" }}></div><div className="kpi-label">Frecuentes</div><div className="kpi-value">{stats.frecuentes}</div></div>
        <div className="kpi"><div className="kpi-accent" style={{ background: "var(--warn)" }}></div><div className="kpi-label">Por cobrar</div><div className="kpi-value">{fmtMoney(stats.porCobrar)}</div></div>
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
                  <tr><th>Nombre</th><th>RFC</th><th>Tipo</th><th>Teléfono</th><th>Email</th><th className="num">Límite crédito</th><th className="num">Saldo</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.Id}>
                      <td><strong>{c.Nombre}</strong></td>
                      <td className="tnum" style={{ fontSize: 11.5 }}>{c.RFC || "—"}</td>
                      <td><span className="badge badge-neutral">{c.Tipo || "General"}</span></td>
                      <td className="muted">{c.Telefono || "—"}</td>
                      <td className="muted">{c.Email || "—"}</td>
                      <td className="num">{c.LimiteCredito > 0 ? fmtMoney(c.LimiteCredito) : <span className="muted">—</span>}</td>
                      <td className="num">{c.Saldo > 0 ? <span style={{ color: "var(--warn)" }}>{fmtMoney(c.Saldo)}</span> : <span className="muted">$0</span>}</td>
                      <td className="actions-cell">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}><Icon name="edit" size={12} /></button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && !loading && (
                    <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Sin clientes registrados</td></tr>
                  )}
                </tbody>
              </table>
          }
        </div>
      </div>

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
          <div className="form-row"><label>Límite de crédito</label><input type="number" step="0.01" value={form.limiteCredito} onChange={setF("limiteCredito")} placeholder="0.00" /></div>
          <div className="form-row"><label>Saldo pendiente</label><input type="number" step="0.01" value={form.saldo} onChange={setF("saldo")} placeholder="0.00" /></div>
          <div className="form-row" style={{ gridColumn: "1/-1" }}><label>Dirección</label><input value={form.direccion} onChange={setF("direccion")} /></div>
          <div className="form-row" style={{ gridColumn: "1/-1" }}><label>Notas</label><textarea rows="2" value={form.notas} onChange={setF("notas")} /></div>
        </div>
      </Modal>
    </div>
  )
}
