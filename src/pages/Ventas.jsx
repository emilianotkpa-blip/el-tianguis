import { useState, useMemo, useRef } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { PRODUCTOS, CATEGORIAS, CLIENTES } from "../data"
import { stockStatus, fmtMoney, todayISO } from "../utils"

export default function VentasPage({ addToast }) {
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState("")
  const [cat, setCat] = useState("all")
  const [cliente, setCliente] = useState("Mostrador")
  const [metodoPago, setMetodoPago] = useState("Efectivo")
  const [showReceipt, setShowReceipt] = useState(null)
  const folioCounter = useRef(490)

  const filtered = useMemo(() =>
    PRODUCTOS.filter((p) => {
      if (cat !== "all" && p.cat !== cat) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false
      return true
    }), [search, cat])

  const addToCart = (p) => {
    setCart((c) => {
      const existing = c.find((it) => it.sku === p.sku)
      if (existing) return c.map((it) => it.sku === p.sku ? { ...it, qty: it.qty + 1 } : it)
      return [...c, { sku: p.sku, name: p.name, unidad: p.unidad, precio: p.precio, qty: 1 }]
    })
  }
  const setQty = (sku, qty) => {
    if (qty <= 0) return removeItem(sku)
    setCart((c) => c.map((it) => it.sku === sku ? { ...it, qty } : it))
  }
  const removeItem = (sku) => setCart((c) => c.filter((it) => it.sku !== sku))

  const subtotal = cart.reduce((s, it) => s + it.precio * it.qty, 0)
  const iva = subtotal * 0.16
  const total = subtotal + iva

  const finalizar = () => {
    if (cart.length === 0) return
    const folio = "F-2026-" + String(folioCounter.current++).padStart(4, "0")
    setShowReceipt({ folio, fecha: todayISO(), cliente, metodo: metodoPago, items: cart, subtotal, iva, total })
  }

  const cerrarTicket = () => {
    setShowReceipt(null)
    setCart([])
    setCliente("Mostrador")
    addToast({ kind: "ok", msg: "Venta registrada correctamente" })
  }

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", paddingBottom: 0 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ventas · Punto de venta</h1>
          <p className="page-subtitle">Selecciona productos para armar la nota. Caja: <strong>Tianguis Centro</strong> · Cajero: Roberto M.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm"><Icon name="receipt" size={13} /> Ver ventas del día</button>
          <button className="btn btn-default btn-sm" onClick={() => { setCart([]); setCliente("Mostrador"); setMetodoPago("Efectivo") }}><Icon name="refresh" size={13} /> Cancelar nota</button>
        </div>
      </div>

      <div className="sales-shell">
        {/* Productos */}
        <div className="sales-products">
          <div className="filter-bar" style={{ marginBottom: 4 }}>
            <div className="search-input" style={{ flex: 1, maxWidth: 360 }}>
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar por nombre o SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="cart-cat-tabs">
            {CATEGORIAS.map((c) => (
              <button key={c.id} className={"cat-pill" + (cat === c.id ? " active" : "")} onClick={() => setCat(c.id)}>
                {c.name}
              </button>
            ))}
          </div>

          <div className="products-grid">
            {filtered.map((p) => {
              const st = stockStatus(p, "centro")
              return (
                <button
                  key={p.sku}
                  className={"product-tile" + (st.kind === "out" ? " disabled" : "")}
                  onClick={() => st.kind !== "out" && addToCart(p)}
                >
                  <div className="sku">{p.sku}</div>
                  <div className="name">{p.name}</div>
                  <div className="meta">
                    <span>{p.unidad}</span>
                    <span>{st.value} en stock</span>
                  </div>
                  <div className="price">{fmtMoney(p.precio)}</div>
                  {st.kind === "low" && <div className="stock-low">⚠ Stock bajo</div>}
                  {st.kind === "out" && <div className="stock-out">● Sin stock</div>}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ gridColumn: "1/-1" }} className="empty-state">
                <div className="icon-big">∅</div>
                <div className="title">Sin resultados</div>
                <div>Prueba con otro nombre o categoría.</div>
              </div>
            )}
          </div>
        </div>

        {/* Carrito */}
        <div className="sales-cart">
          <div className="cart-card">
            <div className="cart-header">
              <h3>Nota actual</h3>
              <span className="count">{cart.reduce((s, it) => s + it.qty, 0)} arts.</span>
            </div>
            <div className="cart-meta">
              <div className="form-row">
                <label>Cliente</label>
                <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
                  {CLIENTES.map((c) => <option key={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>Método de pago</label>
                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                  <option>Efectivo</option>
                  <option>Tarjeta</option>
                  <option>Transferencia</option>
                  <option>Crédito 8d</option>
                  <option>Crédito 15d</option>
                </select>
              </div>
            </div>

            <div className="cart-items">
              {cart.length === 0 ? (
                <div className="cart-empty">
                  <div className="big"><Icon name="cart" size={28} /></div>
                  <div>Selecciona productos<br />para armar la nota</div>
                </div>
              ) : cart.map((it) => (
                <div key={it.sku} className="cart-item">
                  <div>
                    <div className="name">{it.name}</div>
                    <div className="sku">{it.sku} · {it.unidad}</div>
                    <div className="line2">
                      <div className="qty-stepper">
                        <button onClick={() => setQty(it.sku, it.qty - 1)}>−</button>
                        <input type="number" min="1" value={it.qty} onChange={(e) => setQty(it.sku, parseInt(e.target.value) || 0)} />
                        <button onClick={() => setQty(it.sku, it.qty + 1)}>+</button>
                      </div>
                      <span className="price-line">{fmtMoney(it.precio)} c/u</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <button className="remove" onClick={() => removeItem(it.sku)} aria-label="Eliminar">
                      <Icon name="x" size={12} />
                    </button>
                    <span className="line-total">{fmtMoney(it.precio * it.qty)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-summary">
              <div className="row"><span>Subtotal</span><span className="num">{fmtMoney(subtotal)}</span></div>
              <div className="row"><span>IVA (16%)</span><span className="num">{fmtMoney(iva)}</span></div>
              <div className="row total"><span>Total</span><span className="num">{fmtMoney(total)}</span></div>
            </div>
            <div className="cart-actions">
              <button className="btn btn-default" onClick={() => setCart([])} disabled={cart.length === 0}>
                <Icon name="trash" size={13} /> Vaciar
              </button>
              <button className="btn btn-wine" onClick={finalizar} disabled={cart.length === 0}>
                <Icon name="check" size={13} /> Cobrar y emitir
              </button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={!!showReceipt}
        onClose={cerrarTicket}
        title="Nota generada"
        footer={
          <>
            <button className="btn btn-default" onClick={cerrarTicket}>Cerrar</button>
            <button className="btn btn-default"><Icon name="print" size={13} /> Imprimir</button>
            <button className="btn btn-wine"><Icon name="receipt" size={13} /> Generar factura</button>
          </>
        }
      >
        {showReceipt && (
          <div className="receipt">
            <h3>EL TIANGUIS</h3>
            <div className="center small">Bolsas, vasos y desechables<br />Av. Hidalgo 245, Centro · RFC: ETI920512K11</div>
            <hr />
            <div>FOLIO: <strong>{showReceipt.folio}</strong></div>
            <div>FECHA: {showReceipt.fecha} 14:32</div>
            <div>CLIENTE: {showReceipt.cliente}</div>
            <div>PAGO: {showReceipt.metodo}</div>
            <hr />
            <table>
              <tbody>
                {showReceipt.items.map((it) => (
                  <tr key={it.sku}>
                    <td>{it.qty} × {it.name}<br /><span style={{ fontSize: 10, opacity: .6 }}>{it.sku}</span></td>
                    <td style={{ textAlign: "right" }}>{fmtMoney(it.precio * it.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <hr />
            <table>
              <tbody>
                <tr><td>Subtotal</td><td style={{ textAlign: "right" }}>{fmtMoney(showReceipt.subtotal)}</td></tr>
                <tr><td>IVA 16%</td><td style={{ textAlign: "right" }}>{fmtMoney(showReceipt.iva)}</td></tr>
                <tr className="total-line"><td>TOTAL</td><td style={{ textAlign: "right" }}>{fmtMoney(showReceipt.total)}</td></tr>
              </tbody>
            </table>
            <hr />
            <div className="center small">¡Gracias por su compra!<br />Conserve esta nota para cualquier aclaración</div>
          </div>
        )}
      </Modal>
    </div>
  )
}
