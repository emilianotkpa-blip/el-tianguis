import { useState } from "react"
import Icon from "../components/Icon"
import { PRODUCTOS, SUCURSALES, PEDIDOS_MERCANCIA } from "../data"
import { fmtMoney } from "../utils"

export default function PedidosMercanciaPage({ addToast }) {
  const [view, setView] = useState("welcome") // welcome | cart | destino | history
  const [cart, setCart] = useState([])
  const [destino, setDestino] = useState(null)
  const [search, setSearch] = useState("")
  const [proveedor, setProveedor] = useState("Distribuidora Polpusa S.A.")

  const filtered = PRODUCTOS.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  )

  const addToCart = (p) => {
    setCart((c) => {
      const ex = c.find((i) => i.sku === p.sku)
      if (ex) return c.map((i) => i.sku === p.sku ? { ...i, qty: i.qty + 1 } : i)
      return [...c, { sku: p.sku, name: p.name, unidad: p.unidad, costo: p.costo, qty: 1 }]
    })
  }
  const setQty = (sku, qty) => {
    if (qty <= 0) return setCart((c) => c.filter((i) => i.sku !== sku))
    setCart((c) => c.map((i) => i.sku === sku ? { ...i, qty } : i))
  }

  const subtotal = cart.reduce((s, i) => s + i.costo * i.qty, 0)
  const iva = subtotal * 0.16
  const total = subtotal + iva
  const numItems = cart.reduce((s, i) => s + i.qty, 0)

  /* WELCOME */
  if (view === "welcome") {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Pedidos de mercancía</h1>
            <p className="page-subtitle">Solicita reposición de inventario a proveedores</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-default btn-sm" onClick={() => setView("history")}><Icon name="receipt" size={13} /> Historial</button>
          </div>
        </div>

        <div className="card">
          <div className="welcome-mercancia">
            <div className="icon-circle"><Icon name="truck" size={28} /></div>
            <div className="big-q">¿Qué mercancía se necesita llevar?</div>
            <p>Arma una orden de compra agregando productos al carrito.<br />Después indicarás a qué sucursal debe llegar.</p>
            <button className="btn btn-wine btn-lg" onClick={() => setView("cart")} style={{ marginTop: 8 }}>
              <Icon name="plus" size={14} /> Comenzar nueva orden
            </button>
            <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Acceso rápido</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn btn-default btn-sm" onClick={() => setView("history")}>Ver pedidos en tránsito (1)</button>
                <button className="btn btn-default btn-sm">Reordenar última orden</button>
                <button className="btn btn-default btn-sm">Productos con stock bajo</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* HISTORY */
  if (view === "history") {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Historial de pedidos de mercancía</h1>
            <p className="page-subtitle">Órdenes recientes a proveedores</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-default btn-sm" onClick={() => setView("welcome")}><Icon name="chevronLeft" size={13} /> Volver</button>
            <button className="btn btn-wine btn-sm" onClick={() => setView("cart")}><Icon name="plus" size={13} /> Nueva orden</button>
          </div>
        </div>
        <div className="card">
          <div className="card-body flush">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Fecha</th><th>Proveedor</th><th>Destino</th><th className="num">Items</th><th className="num">Total</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {PEDIDOS_MERCANCIA.map((p) => (
                  <tr key={p.id}>
                    <td className="tnum">{p.id}</td>
                    <td className="muted">{p.fecha}</td>
                    <td><strong>{p.proveedor}</strong></td>
                    <td><span className="badge badge-wine">{p.destino}</span></td>
                    <td className="num">{p.items}</td>
                    <td className="num"><strong>{fmtMoney(p.total)}</strong></td>
                    <td>
                      {p.estado === "recibido"    && <span className="badge badge-ok">● Recibido</span>}
                      {p.estado === "en tránsito" && <span className="badge badge-info">● En tránsito</span>}
                    </td>
                    <td className="actions-cell"><button className="btn btn-ghost btn-sm"><Icon name="eye" size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  /* DESTINO */
  if (view === "destino") {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">¿A dónde se entrega?</h1>
            <p className="page-subtitle">Selecciona la sucursal de destino para esta orden de {numItems} artículos · {fmtMoney(total)}</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-default btn-sm" onClick={() => setView("cart")}><Icon name="chevronLeft" size={13} /> Volver al carrito</button>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="destino-picker">
              {SUCURSALES.filter((s) => s.id !== "bodega").map((s) => (
                <button
                  key={s.id}
                  className={"destino-card" + (destino === s.id ? " selected" : "")}
                  onClick={() => setDestino(s.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--wine-700)", color: "#fff", display: "grid", placeItems: "center" }}>
                      <Icon name="building" size={18} />
                    </div>
                    <div className="name">{s.name}</div>
                  </div>
                  <div className="desc">{s.desc}</div>
                  <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>
                    {destino === s.id ? "✓ Seleccionado" : "Click para seleccionar"}
                  </div>
                </button>
              ))}
            </div>
            <div className="form-grid cols-2" style={{ marginTop: 20 }}>
              <div className="form-row">
                <label>Proveedor</label>
                <select value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                  <option>Distribuidora Polpusa S.A.</option>
                  <option>Reyma México</option>
                  <option>Plásticos del Norte</option>
                  <option>Inix S.A. de C.V.</option>
                </select>
              </div>
              <div className="form-row"><label>Fecha estimada de entrega</label><input type="date" defaultValue="2026-04-29" /></div>
              <div className="form-row" style={{ gridColumn: "1/-1" }}>
                <label>Notas / observaciones</label>
                <textarea rows="2" placeholder="Indicaciones especiales para el proveedor o transportista…"></textarea>
              </div>
            </div>
          </div>
          <div className="card-header" style={{ borderTop: "1px solid var(--border)", borderBottom: 0, background: "var(--bg-sunken)" }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Total a ordenar</div>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{fmtMoney(total)}</div>
            </div>
            <button
              className="btn btn-wine btn-lg"
              disabled={!destino}
              onClick={() => {
                const suc = SUCURSALES.find((s) => s.id === destino)
                addToast({ kind: "ok", msg: `Orden enviada a ${suc.name}` })
                setView("welcome")
                setCart([])
                setDestino(null)
              }}
            >
              <Icon name="check" size={14} /> Confirmar y enviar orden
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* CART */
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Nueva orden de mercancía</h1>
          <p className="page-subtitle">Agrega productos para reabastecer · {numItems} artículos en orden</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={() => setView("welcome")}><Icon name="chevronLeft" size={13} /> Volver</button>
        </div>
      </div>

      <div className="sales-shell">
        <div className="sales-products">
          <div className="filter-bar" style={{ marginBottom: 4 }}>
            <div className="search-input" style={{ flex: 1, maxWidth: 360 }}>
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>Mostrando precios de costo</span>
          </div>

          <div className="products-grid">
            {filtered.map((p) => {
              const totalStock = p.stock.centro + p.stock.repostero + p.stock.bodega
              const low = totalStock < p.min * 3
              return (
                <button key={p.sku} className="product-tile" onClick={() => addToCart(p)}>
                  <div className="sku">{p.sku}</div>
                  <div className="name">{p.name}</div>
                  <div className="meta">
                    <span>{p.unidad}</span>
                    <span>{totalStock} total</span>
                  </div>
                  <div className="price">{fmtMoney(p.costo)}</div>
                  {low && <div className="stock-low">⚠ Reabastecer</div>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="sales-cart">
          <div className="cart-card">
            <div className="cart-header">
              <h3>Orden de compra</h3>
              <span className="count">{numItems} arts.</span>
            </div>
            <div className="cart-items">
              {cart.length === 0 ? (
                <div className="cart-empty">
                  <div className="big"><Icon name="truck" size={28} /></div>
                  <div>Agrega productos<br />a la orden</div>
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
                      <span className="price-line">{fmtMoney(it.costo)} c/u</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <button className="remove" onClick={() => setQty(it.sku, 0)}><Icon name="x" size={12} /></button>
                    <span className="line-total">{fmtMoney(it.costo * it.qty)}</span>
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
              <button className="btn btn-default" onClick={() => setCart([])} disabled={cart.length === 0}><Icon name="trash" size={13} /> Vaciar</button>
              <button className="btn btn-wine" onClick={() => setView("destino")} disabled={cart.length === 0}>¿A dónde? <Icon name="chevronRight" size={13} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
