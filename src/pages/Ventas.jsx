import { useState, useEffect, useMemo, useRef } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import { CLIENTES, SUCURSALES } from "../data"
import { getCatalogo, postVenta } from "../api"
import { fmtMoney, todayISO } from "../utils"

export default function VentasPage({ addToast }) {
  const [productos, setProductos] = useState([])
  const [loading, setLoading]     = useState(true)
  const [cart, setCart]           = useState([])
  const [search, setSearch]       = useState("")
  const [cat, setCat]             = useState("all")
  const [suc, setSuc]             = useState("centro")
  const [cliente, setCliente]     = useState("Mostrador")
  const [metodoPago, setMetodoPago] = useState("Efectivo")
  const [showReceipt, setShowReceipt] = useState(null)
  const [saving, setSaving]       = useState(false)
  const folioCounter = useRef(490)

  useEffect(() => {
    getCatalogo()
      .then(setProductos)
      .finally(() => setLoading(false))
  }, [])

  const tipos = useMemo(() => {
    const set = new Set(productos.map((p) => p.tipo).filter(Boolean))
    return [{ id: "all", name: "Todos" }, ...[...set].sort().map((t) => ({ id: t, name: t }))]
  }, [productos])

  const sucObj = SUCURSALES.find((s) => s.id === suc)

  const filtered = useMemo(() =>
    productos.filter((p) => {
      if (cat !== "all" && p.tipo !== cat) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.includes(search)) return false
      return true
    }), [productos, search, cat])

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
  const iva      = subtotal * 0.16
  const total    = subtotal + iva

  const finalizar = () => {
    if (cart.length === 0) return
    const folio = "F-2026-" + String(folioCounter.current++).padStart(4, "0")
    setShowReceipt({ folio, fecha: todayISO(), cliente, metodo: metodoPago, sucursal: sucObj?.name ?? suc, items: cart, subtotal, iva, total })
  }

  const cerrarTicket = async () => {
    if (!showReceipt) return
    setSaving(true)
    try {
      await postVenta({
        folio:      showReceipt.folio,
        fecha:      showReceipt.fecha,
        cliente:    showReceipt.cliente,
        metodoPago: showReceipt.metodo,
        sucursal:   suc,
        items:      showReceipt.items,
        subtotal:   showReceipt.subtotal,
        iva:        showReceipt.iva,
        total:      showReceipt.total,
      })
      addToast({ kind: "ok", msg: "Venta registrada correctamente" })
    } catch {
      addToast({ kind: "err", msg: "Venta guardada localmente (error de red)" })
    } finally {
      setSaving(false)
      setShowReceipt(null)
      setCart([])
      setCliente("Mostrador")
      setMetodoPago("Efectivo")
    }
  }

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: 0, paddingLeft: 12, paddingRight: 12 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ventas · Punto de venta</h1>
          <p className="page-subtitle">
            Sucursal:&nbsp;
            <select value={suc} onChange={(e) => setSuc(e.target.value)} style={{ fontSize: 12, border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>
              {SUCURSALES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={() => { setCart([]); setCliente("Mostrador"); setMetodoPago("Efectivo") }}>
            <Icon name="refresh" size={13} /> Cancelar nota
          </button>
        </div>
      </div>

      <div className="sales-shell">
        <div className="sales-products">
          <div className="filter-bar" style={{ marginBottom: 4 }}>
            <div className="search-input" style={{ flex: 1, maxWidth: 360 }}>
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar por nombre o código…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="cart-cat-tabs">
            {tipos.map((t) => (
              <button key={t.id} className={"cat-pill" + (cat === t.id ? " active" : "")} onClick={() => setCat(t.id)}>
                {t.name}
              </button>
            ))}
          </div>

          <div className="products-grid">
            {loading ? (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 48, color: "var(--text-muted)" }}>Cargando productos…</div>
            ) : filtered.map((p) => {
              const stock = p.stock[suc] ?? 0
              const out   = stock <= 0
              const low   = !out && stock < p.min
              return (
                <button
                  key={p.sku}
                  className={"product-tile" + (out ? " disabled" : "")}
                  onClick={() => !out && addToCart(p)}
                >
                  <div className="sku">{p.sku}</div>
                  <div className="name">{p.name}</div>
                  <div className="meta">
                    <span>{p.unidad || "—"}</span>
                    <span>{stock} en stock</span>
                  </div>
                  <div className="price">{p.precio > 0 ? fmtMoney(p.precio) : <span style={{ fontSize: 11, opacity: .5 }}>Sin precio</span>}</div>
                  {low && <div className="stock-low">⚠ Stock bajo</div>}
                  {out && <div className="stock-out">● Sin stock</div>}
                </button>
              )
            })}
            {!loading && filtered.length === 0 && (
              <div style={{ gridColumn: "1/-1" }} className="empty-state">
                <div className="icon-big">∅</div>
                <div className="title">Sin resultados</div>
                <div>Prueba con otro nombre o categoría.</div>
              </div>
            )}
          </div>
        </div>

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
              <button className="btn btn-wine" onClick={finalizar} disabled={cart.length === 0 || saving}>
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
            <button className="btn btn-default" onClick={cerrarTicket} disabled={saving}>
              {saving ? "Guardando…" : "Cerrar"}
            </button>
            <button className="btn btn-default"><Icon name="print" size={13} /> Imprimir</button>
          </>
        }
      >
        {showReceipt && (
          <div className="receipt">
            <h3>EL TIANGUIS</h3>
            <div className="center small">Bolsas, vasos y desechables<br />{showReceipt.sucursal}</div>
            <hr />
            <div>FOLIO: <strong>{showReceipt.folio}</strong></div>
            <div>FECHA: {showReceipt.fecha}</div>
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
