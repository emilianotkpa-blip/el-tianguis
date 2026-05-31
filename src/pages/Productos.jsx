import { useState, useEffect, useMemo } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { getCatalogo, patchProducto, postProducto } from "../api"
import { fmtMoney, fmtNum, exportCSV } from "../utils"

const emptyForm = { sku: "", tipo: "", name: "", unidad: "", marca: "", min: 5, costo: "", precio: "", facturable: true, piezasPorUnidad: 1 }

export default function ProductosPage({ addToast }) {
  const [productos, setProductos] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [search, setSearch]       = useState("")
  const [tipo, setTipo]           = useState("all")
  const [factF, setFactF]         = useState("todos")   // "todos" | "si" | "no"
  const [editing, setEditing]     = useState(null)
  const [showNew, setShowNew]     = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)
  const [inline, setInline]       = useState(null)
  const [page, setPage]           = useState(1)
  const PAGE_SIZE = 100

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Inline price/cost edit
  const startInline = (p, field) => setInline({ id: p._id, field, value: String(p[field] ?? "") })
  const commitInline = async () => {
    if (!inline) return
    try {
      await patchProducto(inline.id, { [inline.field]: Number(inline.value) || 0 })
      setProductos((prev) => prev.map((p) => p._id === inline.id ? { ...p, [inline.field]: Number(inline.value) || 0 } : p))
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    setInline(null)
  }
  const inlineCell = (p, field, fmtFn) => {
    if (inline?.id === p._id && inline?.field === field) {
      return (
        <input autoFocus type="number" step="0.01" value={inline.value}
          onChange={(e) => setInline((s) => ({ ...s, value: e.target.value }))}
          onBlur={commitInline}
          onKeyDown={(e) => { if (e.key === "Enter") commitInline(); if (e.key === "Escape") setInline(null) }}
          style={{ width: 80, textAlign: "right", fontSize: 12, padding: "2px 4px" }}
        />
      )
    }
    return (
      <span title="Clic para editar" style={{ cursor: "pointer", borderBottom: "1px dashed var(--border)" }}
        onClick={() => startInline(p, field)}>
        {p[field] > 0 ? fmtFn(p[field]) : <span className="muted">—</span>}
      </span>
    )
  }

  const openEdit = (p) => {
    setEditing(p)
    setForm({ sku: p.sku, tipo: p.tipo, name: p.name, unidad: p.unidad, marca: p.marca,
      min: p.min, costo: p.costo || "", precio: p.precio || "",
      facturable: p.facturable !== false, piezasPorUnidad: p.piezasPorUnidad ?? 1 })
  }
  const openNew    = () => { setShowNew(true); setForm(emptyForm) }
  const closeModal = () => { setEditing(null); setShowNew(false) }

  const cargar = async () => {
    setLoading(true); setError(null)
    try { setProductos(await getCatalogo()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { cargar() }, [])

  const tipos = useMemo(() => {
    const set = new Set(productos.map((p) => p.tipo).filter(Boolean))
    return [{ id: "all", name: "Todos" }, ...[...set].sort().map((t) => ({ id: t, name: t }))]
  }, [productos])

  const filtered = useMemo(() =>
    productos.filter((p) => {
      if (tipo !== "all" && p.tipo !== tipo) return false
      if (factF === "si" && !p.facturable) return false
      if (factF === "no" && p.facturable) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.includes(search)) return false
      return true
    }), [productos, search, tipo, factF])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useMemo(() => setPage(1), [search, tipo, factF])

  const saveModal = async () => {
    if (!form.name || !form.sku) return addToast({ kind: "err", msg: "Código y nombre son obligatorios" })
    setSaving(true)
    try {
      const payload = {
        nombre: form.name, tipo: form.tipo, unidad: form.unidad, marca: form.marca,
        min: form.min, costo: form.costo, precio: form.precio,
        facturable: form.facturable, piezasPorUnidad: form.piezasPorUnidad,
      }
      if (editing) { await patchProducto(editing._id, payload) }
      else         { await postProducto({ sku: form.sku, ...payload }) }
      addToast({ kind: "ok", msg: editing ? "Producto actualizado" : "Producto creado" })
      closeModal(); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Catálogo de productos</h1></div>
      <div className="card"><div className="card-body" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>Cargando catálogo…</div></div>
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
          <p className="page-subtitle">{productos.length} productos · {productos.filter(p => p.facturable).length} facturables · {productos.filter(p => !p.facturable).length} sin factura</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={cargar}><Icon name="refresh" size={13} /> Actualizar</button>
          <button className="btn btn-default btn-sm" onClick={() => exportCSV(filtered.map((p) => ({
            Codigo: p.sku, Nombre: p.name, Tipo: p.tipo, Unidad: p.unidad,
            PiezasPorUnidad: p.piezasPorUnidad, Facturable: p.facturable ? "Sí" : "No",
            Costo: p.costo, Precio: p.precio,
            StockCentro: p.stock.centro, StockRepostero: p.stock.repostero, StockBodega: p.stock.bodega
          })), "catalogo.csv")}>
            <Icon name="download" size={13} /> Exportar CSV
          </button>
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
            <select value={factF} onChange={(e) => setFactF(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="si">Facturables</option>
              <option value="no">Sin factura</option>
            </select>
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{filtered.length} resultados</span>
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                <span className="muted">{page} / {totalPages}</span>
                <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              </div>
            )}
          </div>
        </div>
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>Cód.</th><th>Producto</th><th>Tipo</th><th>Unidad</th><th className="num">Pzas/u</th>
                <th className="num">Costo</th><th className="num">Precio</th><th className="num">Margen</th>
                <th className="num">Stock</th><th>Factura</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const total  = (p.stock.centro ?? 0) + (p.stock.repostero ?? 0) + (p.stock.bodega ?? 0)
                const margen = p.precio > 0 ? ((p.precio - p.costo) / p.precio * 100).toFixed(1) : "—"
                const status = total <= 0 ? "out" : total < p.min ? "low" : "ok"
                return (
                  <tr key={p._id}>
                    <td className="tnum" style={{ fontSize: 11.5 }}>{p.sku}</td>
                    <td><strong>{p.name}</strong></td>
                    <td><span className="badge badge-neutral">{p.tipo || "—"}</span></td>
                    <td className="muted">{p.unidad || "—"}</td>
                    <td className="num muted">{p.piezasPorUnidad ?? 1}</td>
                    <td className="num">{inlineCell(p, "costo",  fmtMoney)}</td>
                    <td className="num">{inlineCell(p, "precio", fmtMoney)}</td>
                    <td className="num">{margen !== "—" ? `${margen}%` : <span className="muted">—</span>}</td>
                    <td className="num">{fmtNum(total)}</td>
                    <td>{p.facturable ? <span className="badge badge-ok">Sí</span> : <span className="badge badge-neutral">No</span>}</td>
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
          <div className="form-row"><label>Unidad de venta</label><input value={form.unidad} onChange={setF("unidad")} placeholder="paq/50, caja/24…" /></div>
          <div className="form-row"><label>Piezas por unidad</label><input type="number" min="1" value={form.piezasPorUnidad} onChange={setF("piezasPorUnidad")} placeholder="1" /></div>
          <div className="form-row"><label>Marca</label><input value={form.marca} onChange={setF("marca")} /></div>
          <div className="form-row"><label>Stock mínimo</label><input type="number" value={form.min} onChange={setF("min")} /></div>
          <div className="form-row"><label>Costo</label><input type="number" step="0.01" value={form.costo} onChange={setF("costo")} placeholder="0.00" /></div>
          <div className="form-row"><label>Precio venta</label><input type="number" step="0.01" value={form.precio} onChange={setF("precio")} placeholder="0.00" /></div>
          <div className="form-row" style={{ gridColumn: "1/-1" }}>
            <label>Facturación</label>
            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                <input type="radio" name="facturable" checked={form.facturable === true || form.facturable === "true"} onChange={() => setForm(f => ({ ...f, facturable: true }))} />
                Facturable (genera factura)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                <input type="radio" name="facturable" checked={form.facturable === false || form.facturable === "false"} onChange={() => setForm(f => ({ ...f, facturable: false }))} />
                Sin factura (solo registro)
              </label>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
