import { useState, useEffect, useRef, useMemo } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { SUCURSALES, TIPOS_CONFIG } from "../data"
import { getCatalogo } from "../api"
import { exportCSV, tipoLabel, fmtBase } from "../utils"
import { TableSkeleton } from "../components/Skeleton"
import ProductoVista from "../components/ProductoVista"
import { useComparador, MAX_COMPARAR } from "../components/Comparador"
import Select from "../components/Select"
import CountUp from "../components/CountUp"
import AjusteStock from "../components/AjusteStock"

// ── Modal Recepción masiva ─────────────────────────────
function RecepcionModal({ productos, onClose, onDone, addToast }) {
  const [tab, setTab]           = useState("manual")
  const [skuInput, setSkuInput] = useState("")
  const [qtyInput, setQtyInput] = useState("1")
  const [items, setItems]       = useState([])
  const [csvText, setCsvText]   = useState("")
  const [csvItems, setCsvItems] = useState([])
  const [csvError, setCsvError] = useState("")
  const [saving, setSaving]     = useState(false)
  const skuRef = useRef(null)

  const resolveProducto = (raw) =>
    productos.find(p => p.sku === raw || p.codigoBarras === raw)

  const addItem = () => {
    const raw = skuInput.trim()
    const qty = parseInt(qtyInput, 10) || 0
    if (!raw || qty <= 0) return
    const prod = resolveProducto(raw)
    if (!prod) { addToast({ kind: "err", msg: `No encontrado: ${raw}` }); return }
    setItems(prev => {
      const ex = prev.find(it => it.sku === prod.sku)
      if (ex) return prev.map(it => it.sku === prod.sku ? { ...it, qty: it.qty + qty } : it)
      return [...prev, { sku: prod.sku, name: prod.name, qty }]
    })
    setSkuInput("")
    setQtyInput("1")
    setTimeout(() => skuRef.current?.focus(), 0)
  }

  const parseCsv = (text) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean)
    if (!lines.length) { setCsvItems([]); setCsvError(""); return }
    const firstParts = lines[0].split(",")
    const hasHeader  = isNaN(Number(firstParts[1]?.trim()))
    const data = hasHeader ? lines.slice(1) : lines
    const result = []; const errs = []
    data.forEach((line, i) => {
      const [rawSku, rawQty] = line.split(",")
      const sku = rawSku?.trim(); const qty = parseInt(rawQty?.trim(), 10)
      if (!sku || isNaN(qty) || qty <= 0) { errs.push(`Línea ${i + (hasHeader ? 2 : 1)}: inválida`); return }
      const prod = resolveProducto(sku)
      result.push({ sku: prod?.sku ?? sku, name: prod?.name ?? `SKU ${sku}`, qty, found: !!prod })
    })
    setCsvItems(result); setCsvError(errs.join(" · "))
  }

  const confirm = async (list) => {
    const valid = list.filter(it => it.found !== false)
    if (!valid.length) return
    setSaving(true)
    try {
      const r = await fetch("/api/inventarios/recepcion-masiva", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("elt_token")}` },
        body: JSON.stringify({ items: valid }),
      }).then(r => r.json())
      const ok = (r.results ?? []).filter(x => x.ok).length
      const err = (r.results ?? []).filter(x => !x.ok).length
      addToast({ kind: "ok", msg: `${ok} producto(s) sumados a Bodega${err > 0 ? ` · ${err} no encontrados` : ""}` })
      onDone()
    } catch (e) { addToast({ kind: "err", msg: e.message }) }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title="Recepción de mercancía → Bodega" large>
      {/* Pestañas */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        {[["manual","Escaneo / Manual"],["csv","Subir CSV / Factura"]].map(([t, lbl]) => (
          <button key={t} onClick={() => setTab(t)}
            className={"btn btn-sm " + (tab === t ? "btn-wine" : "btn-ghost")}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── Pestaña Manual ── */}
      {tab === "manual" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input ref={skuRef} value={skuInput} autoFocus
              onChange={e => setSkuInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addItem()}
              placeholder="SKU o código de barras…" style={{ flex: 1 }} />
            <input type="number" min="1" value={qtyInput}
              onChange={e => setQtyInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addItem()}
              placeholder="Cant." style={{ width: 72, textAlign: "right" }} />
            <button className="btn btn-wine btn-sm" onClick={addItem}>
              <Icon name="plus" size={12} /> Agregar
            </button>
          </div>
          {items.length === 0
            ? <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px 0", fontSize: 13 }}>
                Escanea o escribe el SKU de cada producto y su cantidad, luego Enter
              </div>
            : <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 4 }}>
                <table className="table">
                  <thead><tr><th>SKU</th><th>Producto</th><th className="num">Cant.</th><th></th></tr></thead>
                  <tbody>{items.map(it => (
                    <tr key={it.sku}>
                      <td className="tnum" style={{ fontSize: 11 }}>{it.sku}</td>
                      <td>{it.name}</td>
                      <td className="num"><strong>{it.qty}</strong></td>
                      <td><button className="btn btn-ghost btn-sm" style={{ color: "var(--err)" }}
                        onClick={() => setItems(p => p.filter(x => x.sku !== it.sku))}>
                        <Icon name="x" size={11} /></button></td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
          }
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 8 }}>
            <button className="btn btn-default" onClick={onClose}>Cancelar</button>
            <button className="btn btn-wine" disabled={!items.length || saving} onClick={() => confirm(items)}>
              <Icon name="check" size={13} /> {saving ? "Aplicando…" : `Confirmar ${items.length} producto(s) a Bodega`}
            </button>
          </div>
        </>
      )}

      {/* ── Pestaña CSV ── */}
      {tab === "csv" && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}>
            Formato: <code style={{ background: "var(--bg-sunken)", padding: "1px 5px", borderRadius: 4 }}>SKU,CANTIDAD</code> — una línea por producto. La primera fila puede ser encabezado.
          </div>
          <textarea value={csvText}
            onChange={e => { setCsvText(e.target.value); parseCsv(e.target.value) }}
            placeholder={"SKU,CANTIDAD\n0001,50\n0002,100"}
            style={{ width: "100%", minHeight: 100, fontFamily: "var(--font-mono)", fontSize: 12,
              padding: 8, boxSizing: "border-box", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--bg-sunken)", color: "var(--text)", resize: "vertical" }} />
          <div style={{ marginTop: 6, marginBottom: 8 }}>
            <label className="btn btn-default btn-sm" style={{ cursor: "pointer" }}>
              Cargar archivo .csv
              <input type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => {
                const f = e.target.files?.[0]; if (!f) return
                const reader = new FileReader()
                reader.onload = ev => { const t = ev.target.result; setCsvText(t); parseCsv(t) }
                reader.readAsText(f)
              }} />
            </label>
          </div>
          {csvError && <div style={{ fontSize: 11, color: "var(--err)", marginBottom: 6 }}>{csvError}</div>}
          {csvItems.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 4 }}>
              <table className="table">
                <thead><tr><th>SKU</th><th>Producto</th><th className="num">Cant.</th><th>Estado</th></tr></thead>
                <tbody>{csvItems.map((it, i) => (
                  <tr key={i}>
                    <td className="tnum" style={{ fontSize: 11 }}>{it.sku}</td>
                    <td>{it.name}</td>
                    <td className="num"><strong>{it.qty}</strong></td>
                    <td>{it.found
                      ? <span className="badge badge-ok">OK</span>
                      : <span className="badge badge-err">No encontrado</span>}
                    </td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 8 }}>
            <button className="btn btn-default" onClick={onClose}>Cancelar</button>
            <button className="btn btn-wine"
              disabled={!csvItems.filter(it => it.found).length || saving}
              onClick={() => confirm(csvItems)}>
              <Icon name="check" size={13} />
              {saving ? "Aplicando…" : `Confirmar ${csvItems.filter(it => it.found).length} producto(s) a Bodega`}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

export default function InventariosPage({ addToast, sucursalActiva }) {
  const initSuc = sucursalActiva ?? "centro"
  const initSucShort = SUCURSALES.find(s => s.id === initSuc)?.short ?? "Centro"

  const [suc, setSuc]               = useState(initSuc)
  const [search, setSearch]         = useState("")
  const [statusFilter, setStatus]   = useState("todos")
  const [tipoFiltro, setTipoFiltro] = useState("all")
  const [adjustingP, setAdjustingP] = useState(null)
  const [vistaRapida, setVista]     = useState(null)
  const cmp = useComparador()
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 250
  const [productos, setProductos]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const [recepcionOpen, setRecepcionOpen] = useState(false)

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

  const sucObj = SUCURSALES.find((s) => s.id === suc)

  // Solo los tipos que de verdad existen en el catálogo, no la lista completa
  const tipos = useMemo(() => {
    const set = new Set(productos.map(p => p.tipo).filter(Boolean))
    return [{ id: "all", name: "Todos los tipos" }, ...[...set]
      .map(t => ({ id: t, name: tipoLabel(t, TIPOS_CONFIG) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))]
  }, [productos])

  const stockTotals = SUCURSALES.map((s) => {
    let normal = 0, bajo = 0, agotado = 0
    productos.forEach((p) => {
      const v = p.stock[s.id] ?? 0
      if (v <= 0) agotado++
      else if (v < p.min) bajo++
      else normal++
    })
    return { ...s, normal, bajo, agotado, total: normal + bajo + agotado }
  })
  const cur = stockTotals.find((s) => s.id === suc) ?? { normal: 0, bajo: 0, agotado: 0, total: 0 }

  const filtered = productos.filter((p) => {
    if (tipoFiltro !== "all" && p.tipo !== tipoFiltro) return false
    if (search) {
      const q = search.toLowerCase()
      const matchName    = p.name.toLowerCase().includes(q)
      const matchSku     = p.sku.includes(search)
      const matchBarcode = p.codigoBarras && p.codigoBarras.toLowerCase().includes(q)
      if (!matchName && !matchSku && !matchBarcode) return false
    }
    const v  = p.stock[suc] ?? 0
    const st = v <= 0 ? "agotado" : v < p.min ? "bajo" : "normal"
    if (statusFilter !== "todos" && st !== statusFilter) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Inventarios</h1></div>
      <div className="card">
        <div className="card-body flush"><TableSkeleton rows={8} cols={6} /></div>
      </div>
    </div>
  )

  if (error) return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Inventarios</h1></div>
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
          <h1 className="page-title">Inventarios</h1>
          <p className="page-subtitle">Stock por sucursal · {sucObj?.desc}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={cargar}><Icon name="refresh" size={13} /> Sincronizar</button>
          <button className="btn btn-default btn-sm" onClick={() => exportCSV(productos.map((p) => ({ CodigoBarras: p.codigoBarras || p.sku, SKU: p.sku, Nombre: p.name, Tipo: p.tipo, Centro: p.stock.centro, Repostero: p.stock.repostero, Bodega: p.stock.bodega, Total: (p.stock.centro + p.stock.repostero + p.stock.bodega), Minimo: p.min })), "inventario.csv")}>
            <Icon name="download" size={13} /> Exportar CSV
          </button>
          <button className="btn btn-wine btn-sm" onClick={() => setRecepcionOpen(true)}>
            <Icon name="upload" size={13} /> Recepción de mercancía
          </button>
        </div>
      </div>

      <div className="sucursal-tabs">
        {stockTotals.map((s) => (
          <button key={s.id} className={"sucursal-tab" + (suc === s.id ? " active" : "")} onClick={() => setSuc(s.id)}>
            <Icon name={s.id === "bodega" ? "warehouse" : "building"} size={14} />
            {s.name}
            <span className="stock-mini">{s.bajo + s.agotado > 0 ? `${s.bajo + s.agotado} alertas` : "OK"}</span>
          </button>
        ))}
      </div>

      <div className="kpi-grid">
        {[
          { key: "todos",   accent: "",                         label: "Productos en sucursal", value: cur.total,   delta: <span className="label">SKUs activos</span>,    deltaUp: null },
          { key: "normal",  accent: "var(--ok)",                label: "Stock normal",           value: cur.normal,  delta: "▲ Saludable",                                   deltaUp: true },
          { key: "bajo",    accent: "var(--warn)",              label: "Stock bajo",             value: cur.bajo,    delta: "⚠ Requiere reposición",                          deltaUp: false },
          { key: "agotado", accent: "var(--err)",               label: "Agotados",               value: cur.agotado, delta: "● Reabastecer urgente",                          deltaUp: false },
        ].map(({ key, accent, label, value, delta, deltaUp }) => (
          <div
            key={key}
            className="kpi"
            onClick={() => { setStatus(key); setPage(1) }}
            style={{ cursor: "pointer", outline: statusFilter === key ? "2px solid var(--wine-500)" : "none", outlineOffset: 2 }}
          >
            <div className="kpi-accent" style={accent ? { background: accent } : {}}></div>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{typeof value === "number" ? <CountUp value={value} format={(n) => Math.round(n).toLocaleString("es-MX")} /> : value}</div>
            <div className={`kpi-delta${deltaUp === true ? " up" : deltaUp === false ? " down" : ""}`}>{delta}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="filter-bar">
            <div className="search-input">
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar por nombre, SKU o código de barras…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select
              value={tipoFiltro}
              onChange={(e) => { setTipoFiltro(e.target.value); setPage(1) }}
              className="select-filtro"
              ariaLabel="Filtrar por tipo de producto"
              options={tipos.map(t => ({ value: t.id, label: t.name }))}
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatus(e.target.value)}
              className="select-filtro"
              ariaLabel="Filtrar por estado de stock"
              options={[
                { value: "todos",   label: "Todos los estados" },
                { value: "normal",  label: "Normal" },
                { value: "bajo",    label: "Stock bajo" },
                { value: "agotado", label: "Agotado" },
              ]}
            />
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{filtered.length} productos</span>
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                <span className="muted">{page} / {totalPages}</span>
                <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              </div>
            )}
          </div>
        </div>
        <div className="card-body flush" style={{ overflowX: "auto" }}>
          <table className="table tarjetas-movil" style={{ tableLayout: "fixed", minWidth: 980 }}>
            <colgroup>
              <col style={{ width: 42 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: "26%" }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 62 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 44 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    type="checkbox"
                    aria-label="Comparar todos los visibles"
                    checked={paged.length > 0 && paged.every(x => cmp?.tiene(x.sku))}
                    onChange={e => {
                      if (!e.target.checked) return paged.forEach(x => cmp?.quitar(x.sku))
                      const nuevos = paged.filter(x => !cmp?.tiene(x.sku))
                      const caben  = MAX_COMPARAR - (cmp?.seleccion.length ?? 0)
                      nuevos.slice(0, caben).forEach(x => cmp?.agregar(x))
                      if (nuevos.length > caben) addToast({
                        kind: "warn",
                        msg: `El comparador admite ${MAX_COMPARAR} productos a la vez; se agregaron ${Math.max(0, caben)}`,
                      })
                    }}
                  />
                </th>
                <th>Cód.</th><th>Producto</th><th>Tipo</th>
                <th className="num">{sucObj?.short ?? suc}</th><th className="num">Mínimo</th><th>Cobertura</th>
                <th className="num">Centro</th><th className="num">Repostero</th><th className="num">Bodega</th>
                <th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const v      = p.stock[suc] ?? 0
                const status = v <= 0 ? "agotado" : v < p.min ? "bajo" : "normal"
                const pct    = Math.min(100, (v / (p.min * 2)) * 100)
                const fill   = status === "agotado" ? "var(--err)" : status === "bajo" ? "var(--warn)" : "var(--ok)"
                return (
                  <tr key={p._id} className={cmp?.tiene(p.sku) ? "fila-comparando" : ""} onClick={() => setVista(p)} style={{ cursor: "pointer" }}>
                    <td className="col-check" data-label="Comparar" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Comparar ${p.name}`}
                        checked={!!cmp?.tiene(p.sku)}
                        onChange={e => e.target.checked ? cmp?.agregar(p) : cmp?.quitar(p.sku)}
                      />
                    </td>
                    <td className="tnum" data-label="Código" style={{ fontSize: 11, overflow: "hidden" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.codigoBarras || p.sku}</div>
                      {p.codigoBarras && p.codigoBarras !== p.sku && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.sku}</div>
                      )}
                    </td>
                    <td data-label="Producto" className="td-titulo" style={{ overflow: "hidden" }} title={p.name}>
                      <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</strong>
                    </td>
                    <td className="muted" data-label="Tipo" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tipoLabel(p.tipo, TIPOS_CONFIG)}</td>
                    <td className="num" data-label="En sucursal"><strong>{fmtBase(v, p.unidadBase)}</strong></td>
                    <td className="num muted" data-label="Mínimo">{p.min}</td>
                    <td data-label="Cobertura">
                      <div className="cov-track" style={{ width: 90 }}>
                        <div className="cov-fill" style={{ width: pct + "%", background: fill }}></div>
                      </div>
                    </td>
                    <td className="num" data-label="Centro">{fmtBase(p.stock.centro, p.unidadBase)}</td>
                    <td className="num" data-label="Repostero">{fmtBase(p.stock.repostero, p.unidadBase)}</td>
                    <td className="num" data-label="Bodega">{fmtBase(p.stock.bodega, p.unidadBase)}</td>
                    <td data-label="Estado">
                      {status === "agotado" && <span className="badge badge-err">● Agotado</span>}
                      {status === "bajo"    && <span className="badge badge-warn">● Bajo</span>}
                      {status === "normal"  && <span className="badge badge-ok">● Normal</span>}
                    </td>
                    <td className="actions-cell" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setAdjustingP(p)} title="Ajustar stock">
                        <Icon name="edit" size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!adjustingP}
        onClose={() => setAdjustingP(null)}
        title={`Ajustar stock: ${adjustingP?.name}`}
        footer={<button className="btn btn-default" onClick={() => setAdjustingP(null)}>Cerrar</button>}
      >
        {adjustingP && (
          <AjusteStock
            key={adjustingP._id}
            producto={adjustingP}
            sucursalInicial={sucObj?.short ?? initSucShort}
            addToast={addToast}
            onAplicado={() => { setAdjustingP(null); cargar() }}
          />
        )}
      </Modal>

      {vistaRapida && (
        <ProductoVista producto={vistaRapida} onCerrar={() => setVista(null)} />
      )}

      {recepcionOpen && (
        <RecepcionModal
          productos={productos}
          addToast={addToast}
          onClose={() => setRecepcionOpen(false)}
          onDone={() => { setRecepcionOpen(false); cargar() }}
        />
      )}
    </div>
  )
}
