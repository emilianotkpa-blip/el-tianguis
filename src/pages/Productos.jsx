import { useState, useEffect, useMemo } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { getCatalogo, patchProducto, postProducto, getNextCodigo, deleteProducto } from "../api"
import { fmtMoney, fmtNum, exportCSV } from "../utils"
import { TIPOS_CONFIG, TIPOS_LISTA } from "../data"

const emptyForm = {
  sku: "", tipo: "", name: "", marca: "", min: 5,
  costo: "", facturable: true, proveedor: "", invMaximo: "", codigoBarras: "",
}

// Genera un id único para presentaciones adicionales (multiPaq)
function genPresId(base, presentaciones) {
  let n = 2
  while (presentaciones.find(p => p.id === `${base}_${n}`)) n++
  return `${base}_${n}`
}

function buildPresFromTipo(tipoId) {
  const cfg = TIPOS_CONFIG[tipoId]
  if (!cfg) return []
  return cfg.presentaciones.map(p => ({ ...p, precio: "", codigoBarras: "" }))
}

export default function ProductosPage({ addToast }) {
  const [productos, setProductos] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [search, setSearch]       = useState("")
  const [tipoFiltro, setTipoFiltro] = useState("all")
  const [factF, setFactF]         = useState("todos")
  const [editing, setEditing]     = useState(null)
  const [showNew, setShowNew]     = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [presentaciones, setPresentaciones] = useState([])
  const [saving, setSaving]       = useState(false)
  const [inline, setInline]       = useState(null)
  const [page, setPage]           = useState(1)
  const PAGE_SIZE = 100

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // ── Inline price edit ─────────────────────────────────
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

  // ── Abrir modal ───────────────────────────────────────
  const openEdit = (p) => {
    setEditing(p)
    setForm({
      sku: p.sku, tipo: p.tipo, name: p.name, marca: p.marca,
      min: p.min, costo: p.costo || "", facturable: p.facturable !== false,
      proveedor: p.proveedor || "", invMaximo: p.invMaximo || "",
      codigoBarras: p.codigoBarras || "",
    })
    const pres = p.presentaciones?.length
      ? p.presentaciones.map(x => ({
          ...x,
          activo:        x.activo !== false ? true : false,
          precio:        String(x.precio ?? ""),
          codigoBarras:  x.codigoBarras ?? "",
          mayoreo:       x.mayoreo ?? false,
          precioMayoreo: x.precioMayoreo ? String(x.precioMayoreo) : "",
          contieneN:     x.contieneN || "",
          contienePres:  x.contienePres || "",
        }))
      : buildPresFromTipo(p.tipo)
    setPresentaciones(pres)
  }

  const openNew = async () => {
    setShowNew(true)
    setForm(emptyForm)
    setPresentaciones([])
    try {
      const { next } = await getNextCodigo()
      setForm(f => ({ ...f, sku: String(next).padStart(4, "0") }))
    } catch {}
  }
  const closeModal = () => { setEditing(null); setShowNew(false) }

  const handleDelete = async (p) => {
    if (!window.confirm(`¿Eliminar "${p.name}"?\nEsta acción no se puede deshacer.`)) return
    try {
      await deleteProducto(p._id)
      addToast({ kind: "ok", msg: `"${p.name}" eliminado` })
      setProductos(prev => prev.filter(x => x._id !== p._id))
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
  }

  // ── Cargar ────────────────────────────────────────────
  const cargar = async () => {
    setLoading(true); setError(null)
    try { setProductos(await getCatalogo()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { cargar() }, [])

  // ── Filtros ───────────────────────────────────────────
  const tipos = useMemo(() => {
    const set = new Set(productos.map((p) => p.tipo).filter(Boolean))
    return [{ id: "all", name: "Todos" }, ...[...set].sort().map((t) => ({ id: t, name: t }))]
  }, [productos])

  const filtered = useMemo(() =>
    productos.filter((p) => {
      if (tipoFiltro !== "all" && p.tipo !== tipoFiltro) return false
      if (factF === "si" && !p.facturable) return false
      if (factF === "no" && p.facturable) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.includes(search)) return false
      return true
    }), [productos, search, tipoFiltro, factF])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useMemo(() => setPage(1), [search, tipoFiltro, factF])

  // ── Cambio de tipo ────────────────────────────────────
  const handleTipoChange = (nuevoTipo) => {
    const cfg = TIPOS_CONFIG[nuevoTipo]
    setForm(f => ({
      ...f,
      tipo: nuevoTipo,
      name: cfg ? (cfg.prefijo ? cfg.prefijo + " " : "") : f.name,
    }))
    setPresentaciones(cfg ? cfg.presentaciones.map(p => ({ ...p, precio: "" })) : [])
  }

  // ── Nombre con prefijo forzado ────────────────────────
  const handleNameChange = (e) => {
    const cfg = TIPOS_CONFIG[form.tipo]
    if (!cfg?.prefijo) { setForm(f => ({ ...f, name: e.target.value })); return }
    const prefijo = cfg.prefijo + " "
    const val = e.target.value
    if (!val.startsWith(prefijo)) {
      setForm(f => ({ ...f, name: prefijo }))
    } else {
      setForm(f => ({ ...f, name: val }))
    }
  }

  // ── Gestión de presentaciones ─────────────────────────
  const togglePres = (idx) => {
    setPresentaciones(prev => prev.map((p, i) => i === idx ? { ...p, activo: !p.activo } : p))
  }
  const setPresPrecio = (idx, val) => {
    setPresentaciones(prev => prev.map((p, i) => i === idx ? { ...p, precio: val } : p))
  }
  const setPresFactor = (idx, val) => {
    const num = parseInt(val, 10) || 1
    setPresentaciones(prev => prev.map((p, i) => i !== idx ? p : { ...p, factor: num }))
  }
  const setPresLabel = (idx, val) => {
    setPresentaciones(prev => prev.map((p, i) => i === idx ? { ...p, label: val } : p))
  }
  const setPresCodigoBarras = (idx, val) => {
    setPresentaciones(prev => prev.map((p, i) => i === idx ? { ...p, codigoBarras: val } : p))
  }
  const setPresMayoreo = (idx, val) => {
    setPresentaciones(prev => prev.map((p, i) => i === idx ? { ...p, precioMayoreo: val } : p))
  }
  const toggleMayoreo = (idx) => {
    setPresentaciones(prev => prev.map((p, i) => {
      if (i !== idx) return p
      const next = !p.mayoreo
      return { ...p, mayoreo: next, precioMayoreo: next ? (p.precioMayoreo || "") : "" }
    }))
  }

  // ── Caja/bulto: definir en términos de paquetes ───────
  const setPresContieneN = (idx, n) => {
    setPresentaciones(prev => prev.map((p, i) => {
      if (i !== idx) return p
      const paqPres  = prev.find(x => x.id === p.contienePres)
      const paqFac   = paqPres?.factor ?? 0
      const newN     = parseInt(n) || 0
      return { ...p, contieneN: newN || "", factor: newN > 0 && paqFac > 0 ? newN * paqFac : p.factor }
    }))
  }
  const setPresContienePres = (idx, presId) => {
    setPresentaciones(prev => prev.map((p, i) => {
      if (i !== idx) return p
      const paqPres = prev.find(x => x.id === presId)
      const paqFac  = paqPres?.factor ?? 0
      const n       = parseInt(p.contieneN) || 0
      return { ...p, contienePres: presId, factor: n > 0 && paqFac > 0 ? n * paqFac : p.factor }
    }))
  }

  const addPresType = (nivel) => {
    const DEFAULTS = {
      pieza:   { id: "pza",  label: "Pieza",   factor: 1  },
      paquete: { id: "paq",  label: "Paquete", factor: 50 },
      caja:    { id: "caja", label: "Caja",    factor: 100 },
      bulto:   { id: "bul",  label: "Bulto",   factor: 100 },
    }
    const d = DEFAULTS[nivel] ?? DEFAULTS.pieza
    const newId = genPresId(d.id, presentaciones)
    setPresentaciones(prev => {
      const newPres = {
        id: newId, label: d.label, factor: d.factor, nivel,
        activo: true, opcional: true, descuento: false, precio: "",
        libre: true, codigoBarras: "",
      }
      // Insertar antes de caja si es paquete
      if (nivel === "paquete") {
        const idxCaja = prev.findIndex(p => p.nivel === "caja" || p.nivel === "bulto")
        if (idxCaja >= 0) {
          const copy = [...prev]; copy.splice(idxCaja, 0, newPres); return copy
        }
      }
      return [...prev, newPres]
    })
  }

  const removePres = (idx) => {
    setPresentaciones(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Guardar ───────────────────────────────────────────
  const saveModal = async () => {
    if (!form.name) return addToast({ kind: "err", msg: "El nombre es obligatorio" })
    if (!editing && !form.codigoBarras?.trim()) return addToast({ kind: "err", msg: "El código de barras es obligatorio" })
    const presActivas = presentaciones.filter(p => p.activo)
    if (presActivas.length === 0) return addToast({ kind: "err", msg: "Configura al menos una presentación activa" })
    setSaving(true)
    try {
      const presPayload = presActivas.map(p => ({
        id: p.id, label: p.label, factor: p.factor ?? null,
        nivel: p.nivel, precio: parseFloat(p.precio) || 0,
        activo: true,
        descuento: p.descuento || false,
        codigoBarras: p.codigoBarras?.trim() || "",
        mayoreo: p.mayoreo || false,
        precioMayoreo: p.mayoreo ? (parseFloat(p.precioMayoreo) || 0) : 0,
        ...(p.contieneN && p.contienePres
          ? { contieneN: parseInt(p.contieneN), contienePres: p.contienePres }
          : {}),
      }))
      const payload = {
        nombre: form.name, tipo: form.tipo, marca: form.marca,
        min: form.min, costo: form.costo,
        facturable: form.facturable,
        proveedor: form.proveedor || "",
        invMaximo: form.invMaximo ? Number(form.invMaximo) : 0,
        codigoBarras: form.codigoBarras?.trim() || "",
        presentaciones: presPayload,
        // precio legacy = primera presentación activa con factor > 0
        precio: presActivas.find(p => p.factor)?.precio ? parseFloat(presActivas.find(p => p.factor).precio) : 0,
        piezasPorUnidad: presActivas.find(p => p.nivel === "pieza")?.factor ?? 1,
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

  const cfg = TIPOS_CONFIG[form.tipo]
  // Presentaciones que pueden ser referenciadas por caja/bulto como "contiene N × paq"
  const availablePaqs = presentaciones.filter(p =>
    p.nivel === "paquete" || (p.nivel === "gramo" && p.factor >= 1000)
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
            Codigo: p.sku, Nombre: p.name, Tipo: p.tipo,
            Facturable: p.facturable ? "Sí" : "No", Costo: p.costo,
            StockCentro: p.stock.centro, StockRepostero: p.stock.repostero, StockBodega: p.stock.bodega,
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
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
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
                <th>Cód.</th><th>Producto</th><th>Tipo</th><th>Presentaciones activas</th>
                <th className="num">Costo</th><th className="num">Stock</th><th>Factura</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const total  = (p.stock.centro ?? 0) + (p.stock.repostero ?? 0) + (p.stock.bodega ?? 0)
                const status = total <= 0 ? "out" : total < p.min ? "low" : "ok"
                const presLabels = p.presentaciones?.length
                  ? p.presentaciones.map(x => x.label).join(" · ")
                  : (p.unidad || "—")
                return (
                  <tr key={p._id}>
                    <td className="tnum" style={{ fontSize: 11.5 }}>{p.sku}</td>
                    <td><strong>{p.name}</strong></td>
                    <td><span className="badge badge-neutral">{p.tipo || "—"}</span></td>
                    <td style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{presLabels}</td>
                    <td className="num">{inlineCell(p, "costo", fmtMoney)}</td>
                    <td className="num">{fmtNum(total)}</td>
                    <td>{p.facturable ? <span className="badge badge-ok">Sí</span> : <span className="badge badge-neutral">No</span>}</td>
                    <td>
                      {status === "out" && <span className="badge badge-err">● Agotado</span>}
                      {status === "low" && <span className="badge badge-warn">● Bajo</span>}
                      {status === "ok"  && <span className="badge badge-ok">● Normal</span>}
                    </td>
                    <td className="actions-cell">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} title="Editar"><Icon name="edit" size={12} /></button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--err)" }} onClick={() => handleDelete(p)} title="Eliminar producto"><Icon name="trash" size={12} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal ────────────────────────────────────────── */}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

          {/* Datos generales */}
          <div className="form-grid cols-2">
            <div className="form-row">
              <label>Código</label>
              <input
                value={form.sku || "…"}
                readOnly
                style={{ background: "var(--bg-sunken)", color: "var(--text-muted)", cursor: "default", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <div className="form-row">
              <label>⌖ Código de barras *</label>
              <input
                value={form.codigoBarras}
                onChange={setF("codigoBarras")}
                placeholder="Escanea o escribe el código"
                style={{ fontFamily: "var(--font-mono)" }}
              />
            </div>
            <div className="form-row">
              <label>Tipo *</label>
              <select value={form.tipo} onChange={e => handleTipoChange(e.target.value)} disabled={!!editing}>
                <option value="">— Selecciona tipo —</option>
                {TIPOS_LISTA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-row" style={{ gridColumn: "1/-1" }}>
              <label>Nombre del producto *</label>
              <input
                value={form.name}
                onChange={handleNameChange}
                placeholder={cfg?.prefijo ? `${cfg.prefijo} …` : "Nombre del producto"}
              />
              {cfg?.prefijo && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  Debe comenzar con "{cfg.prefijo}"
                </span>
              )}
            </div>
            <div className="form-row"><label>Marca</label><input value={form.marca} onChange={setF("marca")} /></div>
            <div className="form-row"><label>Proveedor</label><input value={form.proveedor} onChange={setF("proveedor")} placeholder="Nombre del proveedor" /></div>
            <div className="form-row"><label>Stock mínimo</label><input type="number" value={form.min} onChange={setF("min")} /></div>
            <div className="form-row"><label>Stock máximo</label><input type="number" value={form.invMaximo} onChange={setF("invMaximo")} placeholder="0 = sin límite" /></div>
            <div className="form-row"><label>Costo base (por pieza/gramo)</label><input type="number" step="0.01" value={form.costo} onChange={setF("costo")} placeholder="0.00" /></div>
            <div className="form-row">
              <label>Facturación</label>
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                  <input type="radio" name="facturable" checked={form.facturable === true || form.facturable === "true"} onChange={() => setForm(f => ({ ...f, facturable: true }))} />
                  Facturable
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                  <input type="radio" name="facturable" checked={form.facturable === false || form.facturable === "false"} onChange={() => setForm(f => ({ ...f, facturable: false }))} />
                  Sin factura
                </label>
              </div>
            </div>
          </div>

          {/* Presentaciones */}
          {presentaciones.length > 0 && (
            <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                Presentaciones y precios
                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8, fontSize: 11 }}>
                  {cfg?.unidadBase === "gramo" ? "Stock en gramos" : "Stock en piezas"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {presentaciones.map((pres, idx) => {
                  return (
                    <div key={pres.id} style={{
                      background: pres.activo ? "var(--bg-sunken)" : "transparent",
                      borderRadius: 6,
                      opacity: pres.activo ? 1 : 0.45,
                      border: "1px solid var(--border)",
                      padding: "6px 8px",
                    }}>
                      {/* Fila principal */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "28px 1fr 80px 90px 52px auto",
                        alignItems: "center",
                        gap: 6,
                      }}>
                        {/* Toggle */}
                        <input
                          type="checkbox"
                          checked={pres.activo}
                          onChange={() => togglePres(idx)}
                          style={{ cursor: "pointer" }}
                        />

                        {/* Label — siempre editable */}
                        <input
                          value={pres.label}
                          onChange={e => setPresLabel(idx, e.target.value)}
                          style={{ fontSize: 13, width: "100%" }}
                          placeholder="Nombre"
                        />

                        {/* Factor: libre para pieza/paquete, derivado para caja/bulto con paqs */}
                        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          {(pres.nivel === "caja" || pres.nivel === "bulto") && availablePaqs.length > 0
                            ? (
                              <span style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: pres.factor ? "normal" : "italic" }}>
                                {pres.factor > 0
                                  ? (cfg?.unidadBase === "gramo"
                                      ? (pres.factor >= 1000 ? `${pres.factor / 1000} kg` : `${pres.factor} g`)
                                      : `${pres.factor} pzs`)
                                  : "define abajo"}
                              </span>
                            )
                            : pres.factor === null
                              ? <span style={{ fontSize: 11, fontStyle: "italic", color: "var(--text-muted)" }}>libre</span>
                              : <input
                                  type="number" min="1"
                                  value={pres.factor}
                                  onChange={e => setPresFactor(idx, e.target.value)}
                                  style={{ width: 54, fontSize: 12, textAlign: "right" }}
                                />
                          }
                          {!((pres.nivel === "caja" || pres.nivel === "bulto") && availablePaqs.length > 0) && (
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                              {cfg?.unidadBase === "gramo" ? "g" : "pzs"}
                            </span>
                          )}
                        </div>

                        {/* Precio */}
                        <input
                          type="number" step="0.01" min="0"
                          value={pres.precio}
                          onChange={e => setPresPrecio(idx, e.target.value)}
                          placeholder="$0.00"
                          style={{ width: "100%", textAlign: "right", fontSize: 13 }}
                          disabled={!pres.activo}
                        />

                        {/* Margen sobre costo */}
                        {(() => {
                          const costo  = parseFloat(form.costo)
                          const precio = parseFloat(pres.precio)
                          const fac    = pres.factor
                          if (!costo || !precio || !fac || fac <= 0) return <span />
                          const precioUnit = precio / fac
                          const m = ((precioUnit - costo) / costo) * 100
                          return (
                            <span style={{
                              fontSize: 10, fontWeight: 700, textAlign: "center",
                              whiteSpace: "nowrap",
                              color: m >= 0 ? "var(--ok)" : "var(--err)",
                            }}>
                              {m >= 0 ? "+" : ""}{m.toFixed(0)}%
                            </span>
                          )
                        })()}

                        {/* Quitar — siempre disponible */}
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: "0 4px", color: "var(--err)" }}
                          onClick={() => removePres(idx)}
                          title="Eliminar presentación"
                        >
                          <Icon name="x" size={11} />
                        </button>
                      </div>

                      {/* Fila "Contiene" — solo para caja/bulto cuando hay paquetes definidos */}
                      {pres.activo && (pres.nivel === "caja" || pres.nivel === "bulto") && availablePaqs.length > 0 && (
                        <div style={{ paddingLeft: 34, marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Contiene:</span>
                          <input
                            type="number" min="1"
                            value={pres.contieneN || ""}
                            onChange={e => setPresContieneN(idx, e.target.value)}
                            placeholder="0"
                            style={{ width: 52, fontSize: 12, textAlign: "right", padding: "2px 6px" }}
                          />
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>×</span>
                          <select
                            value={pres.contienePres || ""}
                            onChange={e => setPresContienePres(idx, e.target.value)}
                            style={{ fontSize: 12, padding: "2px 6px", minWidth: 100 }}
                          >
                            <option value="">— tipo de paq —</option>
                            {availablePaqs.map(pq => (
                              <option key={pq.id} value={pq.id}>{pq.label}</option>
                            ))}
                          </select>
                          {pres.contieneN && pres.contienePres && pres.factor > 0 && (
                            <span style={{ fontSize: 10, color: "var(--ok)", fontWeight: 600 }}>
                              = {cfg?.unidadBase === "gramo"
                                ? (pres.factor >= 1000 ? `${pres.factor / 1000} kg total` : `${pres.factor} g total`)
                                : `${pres.factor} pzs total`}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Fila código de barras + mayoreo */}
                      {pres.activo && (
                        <div style={{ paddingLeft: 34, marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                          {/* Barcode */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>⌖ Cód. barra:</span>
                            <input
                              value={pres.codigoBarras || ""}
                              onChange={e => setPresCodigoBarras(idx, e.target.value)}
                              placeholder={`${form.sku}${idx + 1}`}
                              style={{ fontSize: 11, width: 130, padding: "2px 6px", fontFamily: "var(--font-mono)" }}
                            />
                          </div>

                          {/* Mayoreo toggle + precio */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, cursor: "pointer", color: "var(--text-muted)" }}>
                              <input
                                type="checkbox"
                                checked={pres.mayoreo || false}
                                onChange={() => toggleMayoreo(idx)}
                              />
                              Precio mayoreo (clientes especiales)
                            </label>

                            {pres.mayoreo && (
                              <>
                                <input
                                  type="number" step="0.01" min="0"
                                  value={pres.precioMayoreo || ""}
                                  onChange={e => setPresMayoreo(idx, e.target.value)}
                                  placeholder="$0.00"
                                  style={{ width: 80, fontSize: 11, textAlign: "right", padding: "2px 6px" }}
                                />
                                {/* Comparativa por pieza */}
                                {pres.factor > 1 && parseFloat(pres.precio) > 0 && parseFloat(pres.precioMayoreo) > 0 && (() => {
                                  const pzaNormal  = parseFloat(pres.precio)      / pres.factor
                                  const pzaMayoreo = parseFloat(pres.precioMayoreo) / pres.factor
                                  const pct = Math.round((1 - pzaMayoreo / pzaNormal) * 100)
                                  const esDesc = pzaMayoreo < pzaNormal
                                  return (
                                    <span style={{
                                      display: "inline-flex", alignItems: "center", gap: 4,
                                      fontSize: 10, background: "var(--bg-sunken)",
                                      border: "1px solid var(--border)", borderRadius: 5,
                                      padding: "2px 7px",
                                    }}>
                                      <span style={{ color: "var(--text-muted)" }}>
                                        Normal: <strong>${pzaNormal.toFixed(2)}/pza</strong>
                                      </span>
                                      <span style={{ color: "var(--text-muted)" }}>→</span>
                                      <span style={{ color: esDesc ? "var(--ok)" : "var(--err)" }}>
                                        Mayoreo: <strong>${pzaMayoreo.toFixed(2)}/pza</strong>
                                      </span>
                                      <span style={{
                                        fontWeight: 700,
                                        color: esDesc ? "var(--ok)" : "var(--err)",
                                      }}>
                                        ({esDesc ? "−" : "+"}{Math.abs(pct)}%)
                                      </span>
                                    </span>
                                  )
                                })()}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Botones de agregar */}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button className="btn btn-default btn-sm" onClick={() => addPresType("pieza")}>
                  <Icon name="plus" size={12} /> Pieza
                </button>
                <button className="btn btn-default btn-sm" onClick={() => addPresType("paquete")}>
                  <Icon name="plus" size={12} /> Paquete
                </button>
                <button className="btn btn-default btn-sm" onClick={() => addPresType("caja")}>
                  <Icon name="plus" size={12} /> Caja
                </button>
              </div>

              {/* Resumen visual */}
              {presentaciones.some(p => p.activo && parseFloat(p.precio) > 0) && (
                <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)" }}>
                  <strong>Resumen:</strong>{" "}
                  {presentaciones.filter(p => p.activo && parseFloat(p.precio) > 0).map(p =>
                    `${p.label}: ${fmtMoney(parseFloat(p.precio))}`
                  ).join(" · ")}
                </div>
              )}
            </div>
          )}

          {/* Si no tiene tipo seleccionado */}
          {!form.tipo && (
            <div style={{ marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "16px 0", borderTop: "1px solid var(--border)" }}>
              Selecciona un tipo para configurar las presentaciones y precios
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
