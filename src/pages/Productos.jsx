import { useState, useEffect, useMemo } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { getCatalogo, patchProducto, postProducto } from "../api"

const emptyForm = { sku: "", tipo: "", name: "", unidad: "", marca: "", min: 5, costo: "", precio: "" }
import { fmtMoney, fmtNum } from "../utils"

export default function ProductosPage({ addToast }) {
  const [productos, setProductos] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [search, setSearch]       = useState("")
  const [tipo, setTipo]           = useState("all")
  const [editing, setEditing]     = useState(null)
  const [showNew, setShowNew]     = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const openEdit = (p) => {
    setEditing(p)
    setForm({ sku: p.sku, tipo: p.tipo, name: p.name, unidad: p.unidad, marca: p.marca, min: p.min, costo: p.costo || "", precio: p.precio || "" })
  }
  const openNew = () => { setShowNew(true); setForm(emptyForm) }

  const cargar = async () => {
    setLoading(true)
    setError(null)
    try {
      setProductos(await getCatalogo())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  // Tipos únicos para el filtro
  const tipos = useMemo(() => {
    const set = new Set(productos.map((p) => p.tipo).filter(Boolean))
    return [{ id: "all", name: "Todos" }, ...[...set].sort().map((t) => ({ id: t, name: t }))]
  }, [productos])

  const filtered = useMemo(() =>
    productos.filter((p) => {
      if (tipo !== "all" && p.tipo !== tipo) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.includes(search)) return false
      return true
    }), [productos, search, tipo])

  const closeModal = () => { setEditing(null); setShowNew(false) }

  const saveModal = async () => {
    if (!form.name || !form.sku) return addToast({ kind: "err", msg: "Código y nombre son obligatorios" })
    setSaving(true)
    try {
      if (editing) {
        await patchProducto(editing._id, { nombre: form.name, tipo: form.tipo, unidad: form.unidad, marca: form.marca, min: form.min, costo: form.costo, precio: form.precio })
      } else {
        await postProducto({ sku: form.sku, nombre: form.name, tipo: form.tipo, unidad: form.unidad, marca: form.marca, min: form.min, costo: form.costo, precio: form.precio })
      }
      addToast({ kind: "ok", msg: editing ? "Producto actualizado" : "Producto creado" })
      closeModal(); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Catálogo de productos</h1></div>
      <div className="card">
        <div className="card-body" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          Cargando catálogo…
        </div>
      </div>
    </div>
  )

  if (error) return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Catálogo de productos</h1></div>
      <div className="ia-error" style={{ margin: 24 }}>
        <Icon name="alert" size={14} /> {error}
        <button className="btn btn-default btn-sm" style={{ marginLeft: 12 }} onClick={cargar}>Reintentar</button>
      </div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Catálogo de productos</h1>
          <p className="page-subtitle">{productos.length} productos registrados · {tipos.length - 1} tipos</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={cargar}><Icon name="refresh" size={13} /> Actualizar</button>
          <button className="btn btn-default btn-sm"><Icon name="download" size={13} /> Exportar</button>
          <button className="btn btn-wine btn-sm" onClick={openNew}><Icon name="plus" size={13} /> Nuevo producto</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="filter-bar">
            <div className="search-input">
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar por código o nombre…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{filtered.length} resultados</span>
          </div>
        </div>
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>Cód.</th><th>Producto</th><th>Tipo</th><th>Unidad</th>
                <th className="num">Costo</th><th className="num">Precio</th><th className="num">Margen</th>
                <th className="num">Stock total</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const total  = (p.stock.centro ?? 0) + (p.stock.repostero ?? 0) + (p.stock.bodega ?? 0)
                const margen = p.precio > 0 ? ((p.precio - p.costo) / p.precio * 100).toFixed(1) : "—"
                const status = total <= 0 ? "out" : total < p.min ? "low" : "ok"
                return (
                  <tr key={p._id}>
                    <td className="tnum" style={{ fontSize: 11.5 }}>{p.sku}</td>
                    <td><strong>{p.name}</strong></td>
                    <td><span className="badge badge-neutral">{p.tipo || "—"}</span></td>
                    <td className="muted">{p.unidad || "—"}</td>
                    <td className="num">{p.costo > 0 ? fmtMoney(p.costo) : <span className="muted">—</span>}</td>
                    <td className="num">{p.precio > 0 ? fmtMoney(p.precio) : <span className="muted">—</span>}</td>
                    <td className="num">{margen !== "—" ? `${margen}%` : <span className="muted">—</span>}</td>
                    <td className="num">{fmtNum(total)}</td>
                    <td>
                      {status === "out" && <span className="badge badge-err">● Agotado</span>}
                      {status === "low" && <span className="badge badge-warn">● Bajo</span>}
                      {status === "ok"  && <span className="badge badge-ok">● Normal</span>}
                    </td>
                    <td className="actions-cell">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}><Icon name="edit" size={12} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!editing || showNew}
        onClose={closeModal}
        title={editing ? `Editar: ${editing.name}` : "Nuevo producto"}
        footer={
          <>
            <button className="btn btn-default" onClick={closeModal} disabled={saving}>Cancelar</button>
            <button className="btn btn-wine" onClick={saveModal} disabled={saving}><Icon name="check" size={13} /> {saving ? "Guardando…" : "Guardar"}</button>
          </>
        }
      >
        <div className="form-grid cols-2">
          <div className="form-row"><label>Código *</label><input value={form.sku} onChange={setF("sku")} placeholder="0001" disabled={!!editing} /></div>
          <div className="form-row"><label>Tipo</label><input value={form.tipo} onChange={setF("tipo")} placeholder="vaso, bolsa…" /></div>
          <div className="form-row" style={{ gridColumn: "1/-1" }}><label>Nombre del producto *</label><input value={form.name} onChange={setF("name")} /></div>
          <div className="form-row"><label>Unidad de venta</label><input value={form.unidad} onChange={setF("unidad")} placeholder="paq/50" /></div>
          <div className="form-row"><label>Marca</label><input value={form.marca} onChange={setF("marca")} /></div>
          <div className="form-row"><label>Stock mínimo</label><input type="number" value={form.min} onChange={setF("min")} /></div>
          <div className="form-row"><label>Costo</label><input type="number" step="0.01" value={form.costo} onChange={setF("costo")} placeholder="0.00" /></div>
          <div className="form-row"><label>Precio venta</label><input type="number" step="0.01" value={form.precio} onChange={setF("precio")} placeholder="0.00" /></div>
        </div>
      </Modal>
    </div>
  )
}
