import { useState, useEffect, useMemo } from "react"
import Icon from "../components/Icon"
import { TableSkeleton } from "../components/Skeleton"
import Modal from "../components/Modal"
import Confirm from "../components/Confirm"
import Select from "../components/Select"
import { getDepositos, postDeposito, patchDeposito, deleteDeposito, getProveedores, getEquipoLista } from "../api"
import { exportCSV, fmtMoney, fmtFecha, hoyLocal } from "../utils"

const PERIODOS = [
  { value: "mes",      label: "Este mes" },
  { value: "anterior", label: "Mes anterior" },
  { value: "90",       label: "Últimos 90 días" },
  { value: "anio",     label: "Este año" },
  { value: "todo",     label: "Todo" },
]

// Los periodos se calculan con la fecha local: los depósitos se guardan como
// "2026-09-18" y así se comparan, sin pasar por UTC
const mesAnterior = (hoy) => {
  const [a, m] = hoy.split("-").map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`
}
const haceDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const enPeriodo = (fecha, periodo, hoy) => {
  if (periodo === "mes")      return fecha.startsWith(hoy.slice(0, 7))
  if (periodo === "anterior") return fecha.startsWith(mesAnterior(hoy))
  if (periodo === "90")       return fecha >= haceDias(90)
  if (periodo === "anio")     return fecha.startsWith(hoy.slice(0, 4))
  return true
}

const vacio = () => ({ fecha: hoyLocal(), proveedorId: "", monto: "", llevo: "", referencia: "", notas: "" })

export default function DepositosPage({ addToast, user }) {
  const [depositos, setDepositos]     = useState([])
  const [proveedores, setProveedores] = useState([])
  const [equipo, setEquipo]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState("")
  const [provF, setProvF]             = useState("todos")
  const [periodo, setPeriodo]         = useState("mes")
  const [editing, setEditing]         = useState(null)
  const [showNew, setShowNew]         = useState(false)
  const [form, setForm]               = useState(vacio)
  const [saving, setSaving]           = useState(false)
  const [confirmDel, setConfirmDel]   = useState(null)

  const cargar = async () => {
    setLoading(true)
    try {
      const [d, p] = await Promise.all([getDepositos(), getProveedores()])
      setDepositos(d)
      setProveedores(p)
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    cargar()
    // Solo para sugerir nombres en "Quién lo llevó": si falla, se escribe a mano
    getEquipoLista().then(setEquipo).catch(() => {})
  }, [])

  const hoy = hoyLocal()
  const kpis = useMemo(() => {
    const deMes   = depositos.filter(d => enPeriodo(d.fecha, "mes", hoy))
    const antMes  = depositos.filter(d => enPeriodo(d.fecha, "anterior", hoy))
    return {
      mes:      deMes.reduce((s, d) => s + d.monto, 0),
      anterior: antMes.reduce((s, d) => s + d.monto, 0),
      cuantos:  deMes.length,
    }
  }, [depositos, hoy])

  const q = search.trim().toLowerCase()
  const filtered = depositos.filter(d => {
    if (!enPeriodo(d.fecha, periodo, hoy)) return false
    if (provF !== "todos" && String(d.proveedorId) !== provF) return false
    if (q && ![d.proveedor, d.llevo, d.referencia, d.notas].some(v => (v || "").toLowerCase().includes(q))) return false
    return true
  })
  const totalFiltrado = filtered.reduce((s, d) => s + d.monto, 0)

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const openNew = () => { setForm(vacio()); setShowNew(true) }
  const openEdit = (d) => {
    setEditing(d)
    setForm({ fecha: d.fecha, proveedorId: String(d.proveedorId ?? ""), monto: String(d.monto),
              llevo: d.llevo, referencia: d.referencia, notas: d.notas })
  }
  const closeModal = () => { setEditing(null); setShowNew(false) }

  const saveModal = async () => {
    if (!form.proveedorId)           return addToast({ kind: "err", msg: "Elige a qué proveedor fue el depósito" })
    if (!(parseFloat(form.monto) > 0)) return addToast({ kind: "err", msg: "Escribe el monto del depósito" })
    if (!form.llevo.trim())          return addToast({ kind: "err", msg: "Anota quién llevó el depósito" })
    setSaving(true)
    try {
      const datos = { ...form, monto: parseFloat(form.monto) }
      if (editing) await patchDeposito(editing.id, datos)
      else         await postDeposito({ ...datos, registro: user?.name ?? "" })
      addToast({ kind: "ok", msg: editing ? "Depósito actualizado" : "Depósito registrado" })
      closeModal(); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  const eliminar = async () => {
    if (!confirmDel) return
    try {
      await deleteDeposito(confirmDel.id)
      addToast({ kind: "ok", msg: "Depósito eliminado" })
      setConfirmDel(null); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
  }

  const opcionesProveedor = proveedores
    .filter(p => p.activo || String(p.id) === form.proveedorId)
    .map(p => ({ value: String(p.id), label: p.nombre, hint: p.banco || undefined }))

  const etiquetaPeriodo = PERIODOS.find(p => p.value === periodo)?.label.toLowerCase()

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Depósitos a proveedores</h1>
          <p className="page-subtitle">A quién se le pagó, cuánto, cuándo y quién lo llevó</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={cargar}><Icon name="refresh" size={13} /> Actualizar</button>
          <button className="btn btn-default btn-sm" onClick={() => exportCSV(filtered.map(d => ({
            Fecha: d.fecha, Proveedor: d.proveedor, Monto: d.monto.toFixed(2), Llevo: d.llevo,
            Referencia: d.referencia, Notas: d.notas, Registro: d.registro,
          })), "depositos.csv")}>
            <Icon name="download" size={13} /> Exportar CSV
          </button>
          <button className="btn btn-wine btn-sm" onClick={openNew}><Icon name="plus" size={13} /> Registrar depósito</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {[
          { key: "mes",      label: "Depositado este mes", value: fmtMoney(kpis.mes),      accent: "var(--wine-700)" },
          { key: "anterior", label: "Mes anterior",        value: fmtMoney(kpis.anterior), accent: "" },
          { key: "mes",      label: "Depósitos este mes",  value: kpis.cuantos,            accent: "var(--ok)", id: "cuantos" },
        ].map(k => (
          <div
            key={k.id ?? k.key}
            className="kpi"
            onClick={() => setPeriodo(k.key)}
            style={{ cursor: "pointer", outline: periodo === k.key && !k.id ? "2px solid var(--wine-500)" : "none", outlineOffset: 2 }}
          >
            <div className="kpi-accent" style={k.accent ? { background: k.accent } : {}}></div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="filter-bar">
            <div className="search-input">
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar por proveedor, quién llevó o referencia…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select
              value={provF}
              onChange={e => setProvF(e.target.value)}
              className="select-filtro"
              ariaLabel="Filtrar por proveedor"
              options={[{ value: "todos", label: "Todos los proveedores" }, ...proveedores.map(p => ({ value: String(p.id), label: p.nombre }))]}
            />
            <Select
              value={periodo}
              onChange={e => setPeriodo(e.target.value)}
              className="select-filtro"
              ariaLabel="Periodo"
              options={PERIODOS}
            />
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
              {filtered.length} depósito{filtered.length !== 1 ? "s" : ""} · <strong style={{ color: "var(--text)" }}>{fmtMoney(totalFiltrado)}</strong>
            </span>
          </div>
        </div>
        <div className="card-body flush">
          {loading
            ? <TableSkeleton rows={6} cols={6} />
            : <table className="table tarjetas-movil">
                <thead>
                  <tr>
                    <th>Fecha</th><th>Proveedor</th><th className="num">Monto</th>
                    <th>Quién lo llevó</th><th>Referencia</th><th>Registró</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => (
                    <tr key={d.id} onClick={() => openEdit(d)} style={{ cursor: "pointer" }}>
                      <td data-label="Fecha" style={{ whiteSpace: "nowrap" }}>{fmtFecha(d.fecha)}</td>
                      <td className="td-titulo" data-label="Proveedor"><strong>{d.proveedor}</strong></td>
                      <td className="num" data-label="Monto"><strong>{fmtMoney(d.monto)}</strong></td>
                      <td data-label="Quién lo llevó">{d.llevo}</td>
                      <td className="muted tnum" data-label="Referencia">{d.referencia || "—"}</td>
                      <td className="muted" data-label="Registró" style={{ fontSize: "var(--fs-xs)" }}>{d.registro || "—"}</td>
                      <td className="actions-cell" onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => openEdit(d)}><Icon name="edit" size={12} /></button>
                        <button className="btn btn-ghost btn-sm" title="Eliminar" onClick={() => setConfirmDel(d)} style={{ color: "var(--err)" }}><Icon name="trash" size={12} /></button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                      {depositos.length
                        ? `No hay depósitos en ${etiquetaPeriodo}${provF !== "todos" ? " para ese proveedor" : ""}`
                        : "Aún no hay depósitos registrados"}
                    </td></tr>
                  )}
                </tbody>
              </table>
          }
        </div>
      </div>

      <Confirm
        open={!!confirmDel}
        title="¿Eliminar depósito?"
        message={confirmDel ? `Se eliminará el depósito de ${fmtMoney(confirmDel.monto)} a ${confirmDel.proveedor} del ${fmtFecha(confirmDel.fecha)}.` : ""}
        confirmLabel="Sí, eliminar"
        danger
        onConfirm={eliminar}
        onCancel={() => setConfirmDel(null)}
      />

      <Modal
        open={!!editing || showNew}
        onClose={closeModal}
        title={editing ? "Editar depósito" : "Registrar depósito"}
        footer={
          <>
            <button className="btn btn-default" onClick={closeModal} disabled={saving}>Cancelar</button>
            <button className="btn btn-wine" onClick={saveModal} disabled={saving || !opcionesProveedor.length}>
              <Icon name="check" size={13} /> {saving ? "Guardando…" : "Guardar"}
            </button>
          </>
        }
      >
        {!opcionesProveedor.length ? (
          <div className="deposito-sin-proveedores">
            <Icon name="building" size={18} />
            <p>Primero da de alta al proveedor en <strong>Proveedores</strong>; luego ya puedes registrarle depósitos.</p>
          </div>
        ) : (
          <div className="form-grid cols-2">
            <div className="form-row" style={{ gridColumn: "1/-1" }}>
              <label>Proveedor *</label>
              <Select
                value={form.proveedorId}
                onChange={setF("proveedorId")}
                placeholder="— A quién fue el depósito —"
                ariaLabel="Proveedor"
                options={opcionesProveedor}
              />
            </div>
            <div className="form-row">
              <label>Monto *</label>
              <input type="number" min="0" step="0.01" inputMode="decimal" value={form.monto} onChange={setF("monto")} placeholder="0.00" style={{ fontFamily: "var(--font-mono)" }} />
            </div>
            <div className="form-row">
              <label>Fecha *</label>
              <input type="date" value={form.fecha} max={hoy} onChange={setF("fecha")} />
            </div>
            <div className="form-row" style={{ gridColumn: "1/-1" }}>
              <label>Quién lo llevó *</label>
              <input list="deposito-equipo" value={form.llevo} onChange={setF("llevo")} placeholder="Nombre de quien lo entregó o depositó" />
              <datalist id="deposito-equipo">
                {equipo.map(e => <option key={e.nombre} value={e.nombre} />)}
              </datalist>
            </div>
            <div className="form-row">
              <label>Referencia</label>
              <input value={form.referencia} onChange={setF("referencia")} placeholder="Folio o número de operación" style={{ fontFamily: "var(--font-mono)" }} />
            </div>
            <div className="form-row">
              <label>Notas</label>
              <input value={form.notas} onChange={setF("notas")} placeholder="Opcional" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
