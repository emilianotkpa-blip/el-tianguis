import { useState, useEffect } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { SUCURSALES } from "../data"
import { getCatalogo, postMovimiento } from "../api"

export default function InventariosPage({ addToast }) {
  const [suc, setSuc]               = useState("centro")
  const [search, setSearch]         = useState("")
  const [statusFilter, setStatus]   = useState("todos")
  const [adjustingP, setAdjustingP] = useState(null)
  const [productos, setProductos]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const [movTipo, setMovTipo] = useState("Entrada")
  const [movSuc,  setMovSuc]  = useState("Centro")
  const [movCant, setMovCant] = useState("")
  const [movObs,  setMovObs]  = useState("")
  const [saving,  setSaving]  = useState(false)

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
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.includes(search)) return false
    const v  = p.stock[suc] ?? 0
    const st = v <= 0 ? "agotado" : v < p.min ? "bajo" : "normal"
    if (statusFilter !== "todos" && st !== statusFilter) return false
    return true
  })

  const aplicar = async () => {
    const cant = parseFloat(movCant)
    if (!adjustingP || !cant || cant <= 0) return
    setSaving(true)
    try {
      await postMovimiento({
        tipo:            movTipo,
        producto_codigo: parseInt(adjustingP.sku, 10),
        sucursal:        movSuc,
        cantidad:        cant,
        descripcion:     adjustingP.name,
        observaciones:   movObs,
      })
      addToast({ kind: "ok", msg: "Movimiento registrado" })
      setAdjustingP(null)
      setMovCant("")
      setMovObs("")
      cargar()
    } catch (err) {
      addToast({ kind: "err", msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Inventarios</h1></div>
      <div className="card">
        <div className="card-body" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          Cargando inventario…
        </div>
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
          <button className="btn btn-default btn-sm"><Icon name="download" size={13} /> Exportar inventario</button>
          <button className="btn btn-wine btn-sm"><Icon name="upload" size={13} /> Movimiento de stock</button>
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
        <div className="kpi">
          <div className="kpi-accent"></div>
          <div className="kpi-label">Productos en sucursal</div>
          <div className="kpi-value">{cur.total}</div>
          <div className="kpi-delta"><span className="label">SKUs activos</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--ok)" }}></div>
          <div className="kpi-label">Stock normal</div>
          <div className="kpi-value">{cur.normal}</div>
          <div className="kpi-delta up">▲ Saludable</div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--warn)" }}></div>
          <div className="kpi-label">Stock bajo</div>
          <div className="kpi-value">{cur.bajo}</div>
          <div className="kpi-delta down">⚠ Requiere reposición</div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--err)" }}></div>
          <div className="kpi-label">Agotados</div>
          <div className="kpi-value">{cur.agotado}</div>
          <div className="kpi-delta down">● Reabastecer urgente</div>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="filter-bar">
            <div className="search-input">
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar producto o código…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select value={statusFilter} onChange={(e) => setStatus(e.target.value)}>
              <option value="todos">Todos los estados</option>
              <option value="normal">Normal</option>
              <option value="bajo">Stock bajo</option>
              <option value="agotado">Agotado</option>
            </select>
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{filtered.length} productos</span>
          </div>
        </div>
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>Cód.</th><th>Producto</th><th>Tipo</th>
                <th className="num">{sucObj?.short ?? suc}</th><th className="num">Mínimo</th><th>Cobertura</th>
                <th className="num">Centro</th><th className="num">Repostero</th><th className="num">Bodega</th>
                <th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const v      = p.stock[suc] ?? 0
                const status = v <= 0 ? "agotado" : v < p.min ? "bajo" : "normal"
                const pct    = Math.min(100, (v / (p.min * 2)) * 100)
                const fill   = status === "agotado" ? "var(--err)" : status === "bajo" ? "var(--warn)" : "var(--ok)"
                return (
                  <tr key={p._id}>
                    <td className="tnum" style={{ fontSize: 11.5 }}>{p.sku}</td>
                    <td><strong>{p.name}</strong></td>
                    <td className="muted">{p.tipo}</td>
                    <td className="num"><strong>{v}</strong></td>
                    <td className="num muted">{p.min}</td>
                    <td>
                      <div style={{ width: 90, height: 6, background: "var(--bg-sunken)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: pct + "%", height: "100%", background: fill, borderRadius: 3 }}></div>
                      </div>
                    </td>
                    <td className="num">{p.stock.centro}</td>
                    <td className="num">{p.stock.repostero}</td>
                    <td className="num">{p.stock.bodega}</td>
                    <td>
                      {status === "agotado" && <span className="badge badge-err">● Agotado</span>}
                      {status === "bajo"    && <span className="badge badge-warn">● Bajo</span>}
                      {status === "normal"  && <span className="badge badge-ok">● Normal</span>}
                    </td>
                    <td className="actions-cell">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setAdjustingP(p); setMovSuc("Centro") }}>
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
        footer={
          <>
            <button className="btn btn-default" onClick={() => setAdjustingP(null)}>Cancelar</button>
            <button className="btn btn-wine" onClick={aplicar} disabled={saving || !movCant}>
              <Icon name="check" size={13} /> {saving ? "Guardando…" : "Aplicar movimiento"}
            </button>
          </>
        }
      >
        {adjustingP && (
          <div className="form-grid cols-2">
            <div className="form-row" style={{ gridColumn: "1/-1" }}>
              <label>Tipo de movimiento</label>
              <select value={movTipo} onChange={(e) => setMovTipo(e.target.value)}>
                <option value="Entrada">Entrada por compra</option>
                <option value="Salida">Salida por venta</option>
                <option value="Traspaso">Traspaso entre sucursales</option>
                <option value="Ajuste">Ajuste por inventario físico</option>
                <option value="Merma">Merma / daño</option>
              </select>
            </div>
            <div className="form-row">
              <label>Sucursal</label>
              <select value={movSuc} onChange={(e) => setMovSuc(e.target.value)}>
                {SUCURSALES.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Cantidad</label>
              <input type="number" min="1" value={movCant} onChange={(e) => setMovCant(e.target.value)} placeholder="0" />
            </div>
            <div className="form-row" style={{ gridColumn: "1/-1" }}>
              <label>Observaciones</label>
              <textarea rows="2" value={movObs} onChange={(e) => setMovObs(e.target.value)} placeholder="Opcional…" />
            </div>
            <div style={{ gridColumn: "1/-1", padding: 12, background: "var(--bg-sunken)", borderRadius: 4, fontSize: 12 }}>
              <strong>Stock actual:</strong> Centro {adjustingP.stock.centro} · Repostero {adjustingP.stock.repostero} · Bodega {adjustingP.stock.bodega}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
