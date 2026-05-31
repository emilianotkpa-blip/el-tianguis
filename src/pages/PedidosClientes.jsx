import { useState, useEffect, useMemo } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import Confirm from "../components/Confirm"
import { getPedidosClientes, postPedidoCliente, patchPedidoCliente, getCatalogo, getClientes, postCliente } from "../api"
import { fmtMoney, todayISO } from "../utils"

const SUCURSALES = ["Centro", "Repostero", "Bodega"]
const TIPOS_CLIENTE = ["Mayorista", "Frecuente", "Público", "General"]

function badge(e) {
  if (e === "preparando") return <span className="badge badge-info">● Preparando</span>
  if (e === "listo")      return <span className="badge badge-warn">● Listo p/entrega</span>
  if (e === "entregado")  return <span className="badge badge-ok">● Entregado</span>
  if (e === "cancelado")  return <span className="badge badge-err">● Cancelado</span>
  return <span className="badge badge-neutral">{e}</span>
}

export default function PedidosClientesPage({ addToast }) {
  const [view, setView]             = useState("list")
  const [pedidos, setPedidos]       = useState([])
  const [catalogo, setCatalogo]     = useState([])
  const [clientes, setClientes]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState("")
  const [prodSearch, setProdSearch] = useState("")
  const [estado, setEstado]         = useState("todos")
  const [saving, setSaving]         = useState(false)
  const [detalle, setDetalle]       = useState(null)
  const [confirm, setConfirm]       = useState(null)   // { id, estado }

  // Cart state
  const [cart, setCart]                   = useState([])
  const [clienteId, setClienteId]         = useState("")
  const [sucursal, setSucursal]           = useState("Centro")
  const [fechaEntrega, setFechaEntrega]   = useState("")
  const [observaciones, setObservaciones] = useState("")

  // Quick-create client
  const [showNuevoCliente, setShowNuevoCliente] = useState(false)
  const [ncForm, setNcForm] = useState({ nombre: "", rfc: "", tipo: "General", telefono: "" })
  const [ncSaving, setNcSaving] = useState(false)
  const setNcF = (k) => (e) => setNcForm((f) => ({ ...f, [k]: e.target.value }))

  const cargar = async () => {
    setLoading(true)
    try {
      const [p, c, cl] = await Promise.all([getPedidosClientes(), getCatalogo(), getClientes()])
      setPedidos(p); setCatalogo(c); setClientes(cl)
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { cargar() }, [])

  const filtered = pedidos.filter((p) => {
    if (estado !== "todos" && (p.Estado ?? "").toLowerCase() !== estado) return false
    if (search && !(p.Cliente ?? "").toLowerCase().includes(search.toLowerCase()) && !(p.Folio ?? "").toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const prodFiltered = useMemo(
    () => catalogo.filter((p) => !prodSearch || (p.name ?? "").toLowerCase().includes(prodSearch.toLowerCase())),
    [catalogo, prodSearch]
  )

  const addToCart = (prod) => {
    setCart((prev) => {
      const existing = prev.find((x) => x.id === prod._id)
      if (existing) return prev.map((x) => x.id === prod._id ? { ...x, qty: x.qty + 1 } : x)
      return [...prev, { id: prod._id, sku: prod.sku, nombre: prod.name, precio: prod.precio ?? 0, qty: 1 }]
    })
  }
  const removeFromCart = (id) => setCart((prev) => prev.filter((x) => x.id !== id))
  const setQty = (id, qty) => {
    if (qty <= 0) { removeFromCart(id); return }
    setCart((prev) => prev.map((x) => x.id === id ? { ...x, qty } : x))
  }

  const cartTotal = cart.reduce((s, x) => s + x.precio * x.qty, 0)
  const clienteSeleccionado = clientes.find((c) => String(c.Id) === String(clienteId))

  const resetCart = () => {
    setCart([]); setClienteId(""); setSucursal("Centro")
    setFechaEntrega(""); setObservaciones(""); setProdSearch("")
  }

  const confirmarPedido = async () => {
    if (cart.length === 0) return addToast({ kind: "err", msg: "Agrega al menos un producto" })
    setSaving(true)
    try {
      const folio = "PC-" + String(Date.now()).slice(-6)
      await postPedidoCliente({
        folio, fecha: todayISO(),
        cliente: clienteSeleccionado?.Nombre ?? "Mostrador",
        sucursal, estado: "preparando",
        fechaEntrega: fechaEntrega || null,
        total: cartTotal, observaciones,
        items: cart.map((x) => ({ id: x.id, sku: x.sku, nombre: x.nombre, precio: x.precio, qty: x.qty })),
      })
      addToast({ kind: "ok", msg: "Pedido creado correctamente" })
      resetCart(); setView("list"); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      await patchPedidoCliente(id, { Estado: nuevoEstado })
      addToast({ kind: "ok", msg: "Estado actualizado" }); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
  }

  const crearNuevoCliente = async () => {
    if (!ncForm.nombre) return addToast({ kind: "err", msg: "Nombre es obligatorio" })
    setNcSaving(true)
    try {
      await postCliente({ nombre: ncForm.nombre, rfc: ncForm.rfc, tipo: ncForm.tipo, telefono: ncForm.telefono, email: "", direccion: "", limiteCredito: 0, saldo: 0, notas: "" })
      addToast({ kind: "ok", msg: "Cliente creado" })
      const cl = await getClientes()
      setClientes(cl)
      const creado = [...cl].reverse().find((c) => c.Nombre === ncForm.nombre)
      if (creado) setClienteId(String(creado.Id))
      setShowNuevoCliente(false)
      setNcForm({ nombre: "", rfc: "", tipo: "General", telefono: "" })
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setNcSaving(false) }
  }

  // ── Cart View ──────────────────────────────────────────────────────────────
  if (view === "cart") {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: 0 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Nuevo pedido de cliente</h1>
            <p className="page-subtitle">Selecciona productos y asigna al cliente</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-default btn-sm" onClick={() => { resetCart(); setView("list") }}>
              <Icon name="x" size={13} /> Cancelar
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Product grid */}
          <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            <div className="card-body" style={{ paddingBottom: 0, flexShrink: 0 }}>
              <div className="filter-bar">
                <div className="search-input">
                  <Icon name="search" size={14} className="icon" />
                  <input placeholder="Buscar producto…" value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} />
                </div>
                <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{prodFiltered.length} productos</span>
              </div>
            </div>
            <div className="card-body flush" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              <table className="table">
                <thead>
                  <tr><th>Producto</th><th className="num">Precio</th><th></th></tr>
                </thead>
                <tbody>
                  {prodFiltered.map((p) => {
                    const inCart = cart.find((x) => x.id === p._id)
                    return (
                      <tr key={p._id}>
                        <td>{p.name}</td>
                        <td className="num">{p.precio > 0 ? fmtMoney(p.precio) : <span className="muted">Sin precio</span>}</td>
                        <td className="actions-cell">
                          {inCart
                            ? <span className="badge badge-ok">{inCart.qty} en carrito</span>
                            : <button className="btn btn-ghost btn-sm" onClick={() => addToCart(p)}><Icon name="plus" size={12} /></button>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cart + order panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", minHeight: 0 }}>
            <div className="card">
              <div className="card-body">
                <div style={{ fontWeight: 600, marginBottom: 10 }}>Carrito</div>
                {cart.length === 0
                  ? <p className="muted" style={{ fontSize: 13, textAlign: "center", padding: "12px 0" }}>Sin productos agregados</p>
                  : cart.map((x) => (
                    <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.3 }}>{x.nombre}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: "0 6px" }} onClick={() => setQty(x.id, x.qty - 1)}>−</button>
                        <span style={{ minWidth: 22, textAlign: "center", fontSize: 13 }}>{x.qty}</span>
                        <button className="btn btn-ghost btn-sm" style={{ padding: "0 6px" }} onClick={() => setQty(x.id, x.qty + 1)}>+</button>
                      </div>
                      <div style={{ width: 60, textAlign: "right", fontSize: 13 }}>{fmtMoney(x.precio * x.qty)}</div>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeFromCart(x.id)}><Icon name="x" size={11} /></button>
                    </div>
                  ))
                }
                {cart.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span>Total</span><span>{fmtMoney(cartTotal)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-body">
                <div style={{ fontWeight: 600, marginBottom: 10 }}>Datos del pedido</div>
                <div className="form-grid" style={{ gap: 8 }}>
                  <div className="form-row">
                    <label>Cliente</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={{ flex: 1 }}>
                        <option value="">Mostrador</option>
                        {clientes.map((c) => <option key={c.Id} value={String(c.Id)}>{c.Nombre}</option>)}
                      </select>
                      <button className="btn btn-default btn-sm" title="Nuevo cliente" onClick={() => setShowNuevoCliente(true)}>
                        <Icon name="plus" size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="form-row">
                    <label>Sucursal</label>
                    <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
                      {SUCURSALES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Fecha de entrega</label>
                    <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
                  </div>
                  <div className="form-row">
                    <label>Observaciones</label>
                    <textarea rows="2" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Indicaciones especiales…" />
                  </div>
                </div>
              </div>
            </div>

            <button className="btn btn-wine" style={{ width: "100%" }} onClick={confirmarPedido} disabled={saving || cart.length === 0}>
              <Icon name="check" size={13} /> {saving ? "Guardando…" : `Confirmar pedido · ${fmtMoney(cartTotal)}`}
            </button>
          </div>
        </div>

        <Modal
          open={showNuevoCliente}
          onClose={() => setShowNuevoCliente(false)}
          title="Nuevo cliente"
          footer={
            <>
              <button className="btn btn-default" onClick={() => setShowNuevoCliente(false)} disabled={ncSaving}>Cancelar</button>
              <button className="btn btn-wine" onClick={crearNuevoCliente} disabled={ncSaving}>
                <Icon name="check" size={13} /> {ncSaving ? "Guardando…" : "Crear"}
              </button>
            </>
          }
        >
          <div className="form-grid cols-2">
            <div className="form-row" style={{ gridColumn: "1/-1" }}><label>Nombre *</label><input value={ncForm.nombre} onChange={setNcF("nombre")} /></div>
            <div className="form-row"><label>RFC</label><input value={ncForm.rfc} onChange={setNcF("rfc")} placeholder="XAXX010101000" /></div>
            <div className="form-row"><label>Tipo</label>
              <select value={ncForm.tipo} onChange={setNcF("tipo")}>
                {TIPOS_CLIENTE.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-row" style={{ gridColumn: "1/-1" }}><label>Teléfono</label><input value={ncForm.telefono} onChange={setNcF("telefono")} /></div>
          </div>
        </Modal>
      </div>
    )
  }

  // ── List View ──────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pedidos de clientes</h1>
          <p className="page-subtitle">{pedidos.length} pedidos registrados</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={cargar}><Icon name="refresh" size={13} /> Actualizar</button>
          <button className="btn btn-wine btn-sm" onClick={() => setView("cart")}><Icon name="plus" size={13} /> Nuevo pedido</button>
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
              <option value="todos">Todos los estados</option>
              <option value="preparando">Preparando</option>
              <option value="listo">Listos</option>
              <option value="entregado">Entregados</option>
              <option value="cancelado">Cancelados</option>
            </select>
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{filtered.length} resultados</span>
          </div>
        </div>
        <div className="card-body flush">
          {loading
            ? <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>Cargando pedidos…</div>
            : <table className="table">
                <thead>
                  <tr>
                    <th>Folio</th><th>Fecha</th><th>Cliente</th><th>Sucursal</th>
                    <th className="num">Total</th><th>Entrega</th><th>Estado</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.Id}>
                      <td className="tnum">{p.Folio}</td>
                      <td className="muted">{p.Fecha}</td>
                      <td><strong>{p.Cliente}</strong></td>
                      <td>{p.Sucursal}</td>
                      <td className="num"><strong>{fmtMoney(p.Total ?? 0)}</strong></td>
                      <td className="muted">{p.FechaEntrega ?? "—"}</td>
                      <td>{badge((p.Estado ?? "").toLowerCase())}</td>
                      <td className="actions-cell">
                        <button className="btn btn-ghost btn-sm" title="Ver detalle" onClick={() => setDetalle(p)}>
                          <Icon name="eye" size={12} />
                        </button>
                        {p.Estado === "preparando" && (
                          <button className="btn btn-ghost btn-sm" title="Marcar listo" onClick={() => setConfirm({ id: p.Id, estado: "listo" })}>
                            <Icon name="check" size={12} />
                          </button>
                        )}
                        {p.Estado === "listo" && (
                          <button className="btn btn-ghost btn-sm" title="Marcar entregado" onClick={() => setConfirm({ id: p.Id, estado: "entregado" })}>
                            <Icon name="check" size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Sin pedidos</td></tr>
                  )}
                </tbody>
              </table>
          }
        </div>
      </div>

      <Confirm
        open={!!confirm}
        title={confirm?.estado === "entregado" ? "¿Marcar como entregado?" : "¿Marcar como listo?"}
        message={confirm?.estado === "entregado" ? "Esta acción no se puede revertir." : "El pedido pasará a estado 'Listo para entrega'."}
        confirmLabel={confirm?.estado === "entregado" ? "Sí, entregar" : "Sí, marcar listo"}
        onConfirm={() => { cambiarEstado(confirm.id, confirm.estado); setConfirm(null) }}
        onCancel={() => setConfirm(null)}
      />

      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle ? `${detalle.Folio} — ${detalle.Cliente}` : ""}
        footer={<button className="btn btn-default" onClick={() => setDetalle(null)}>Cerrar</button>}
      >
        {detalle && (() => {
          let items = []
          try { items = JSON.parse(detalle.Items_JSON || "[]") } catch {}
          return (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13, marginBottom: 16 }}>
                <div><span className="muted">Sucursal:</span> {detalle.Sucursal}</div>
                <div><span className="muted">Fecha:</span> {detalle.Fecha}</div>
                <div><span className="muted">Entrega:</span> {detalle.FechaEntrega ?? "—"}</div>
                <div><span className="muted">Estado:</span> {badge((detalle.Estado ?? "").toLowerCase())}</div>
                {detalle.Observaciones && <div style={{ gridColumn: "1/-1" }}><span className="muted">Obs:</span> {detalle.Observaciones}</div>}
              </div>
              {items.length > 0
                ? <table className="table">
                    <thead><tr><th>Producto</th><th className="num">Precio</th><th className="num">Cant.</th><th className="num">Subtotal</th></tr></thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td>{it.nombre}</td>
                          <td className="num">{fmtMoney(it.precio)}</td>
                          <td className="num">{it.qty}</td>
                          <td className="num"><strong>{fmtMoney(it.precio * it.qty)}</strong></td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={3} style={{ textAlign: "right", fontWeight: 600 }}>Total</td>
                        <td className="num"><strong>{fmtMoney(detalle.Total ?? 0)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                : <p className="muted" style={{ textAlign: "center", padding: 16 }}>Sin detalle de productos registrado</p>
              }
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
