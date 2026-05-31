import { useState, useEffect, useMemo } from "react"
import Icon from "../components/Icon"
import Stepper from "../components/Stepper"
import { SUCURSALES } from "../data"
import { getCatalogo, postNota, getClientes } from "../api"
import { fmtMoney, todayISO } from "../utils"

const STEPS = ["Llenar carrito", "Verificar pedido", "Forma de pago", "Verificar nota", "Enviar a caja"]
const METODOS = ["Efectivo", "Tarjeta", "Transferencia", "Crédito 8d", "Crédito 15d"]

let folioCounter = 500

function genFolio() {
  return "F-2026-" + String(folioCounter++).padStart(4, "0")
}

export default function VentasPage({ addToast, user }) {
  const [step, setStep]           = useState(0)
  const [productos, setProductos] = useState([])
  const [clientes, setClientes]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState("")
  const [cat, setCat]             = useState("all")
  const [suc, setSuc]             = useState("centro")
  const [cart, setCart]           = useState([])
  const [cliente, setCliente]     = useState("Mostrador")
  const [pagos, setPagos]         = useState([{ metodo: "Efectivo", monto: "" }])
  const [saving, setSaving]       = useState(false)
  const [folio, setFolio]         = useState(null)
  const [notaEnviada, setNotaEnviada] = useState(null)

  useEffect(() => {
    Promise.all([getCatalogo(), getClientes()])
      .then(([p, c]) => { setProductos(p); setClientes(c) })
      .finally(() => setLoading(false))
  }, [])

  const tipos = useMemo(() => {
    const set = new Set(productos.map(p => p.tipo).filter(Boolean))
    return [{ id: "all", name: "Todos" }, ...[...set].sort().map(t => ({ id: t, name: t }))]
  }, [productos])

  const sucObj = SUCURSALES.find(s => s.id === suc)

  const filtered = useMemo(() =>
    productos.filter(p => {
      if (cat !== "all" && p.tipo !== cat) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.includes(search)) return false
      return true
    }), [productos, search, cat])

  const addToCart = (p) => {
    setCart(c => {
      const ex = c.find(it => it.sku === p.sku)
      if (ex) return c.map(it => it.sku === p.sku ? { ...it, qty: it.qty + 1 } : it)
      return [...c, { sku: p.sku, name: p.name, unidad: p.unidad, precio: p.precio, facturable: p.facturable !== false, piezasPorUnidad: p.piezasPorUnidad ?? 1, qty: 1 }]
    })
  }
  const setQty = (sku, qty) => {
    if (qty <= 0) setCart(c => c.filter(it => it.sku !== sku))
    else setCart(c => c.map(it => it.sku === sku ? { ...it, qty } : it))
  }

  const subtotalFact   = cart.filter(it => it.facturable).reduce((s, it) => s + it.precio * it.qty, 0)
  const subtotalNoFact = cart.filter(it => !it.facturable).reduce((s, it) => s + it.precio * it.qty, 0)
  const subtotal = subtotalFact + subtotalNoFact
  const iva      = subtotalFact * 0.16
  const total    = subtotal + iva

  const totalPagado  = pagos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0)
  const cambio       = Math.max(0, totalPagado - total)
  const pendientePago = Math.max(0, total - totalPagado)

  const addPago  = ()       => setPagos(p => [...p, { metodo: "Efectivo", monto: "" }])
  const setPagoField = (i, field, val) => setPagos(p => p.map((x, idx) => idx === i ? { ...x, [field]: val } : x))
  const removePago = (i) => setPagos(p => p.filter((_, idx) => idx !== i))

  const resetVenta = () => {
    setCart([]); setStep(0); setFolio(null); setNotaEnviada(null)
    setCliente("Mostrador"); setPagos([{ metodo: "Efectivo", monto: "" }])
    setSearch(""); setCat("all")
  }

  const enviarACaja = async () => {
    setSaving(true)
    try {
      const f = genFolio()
      setFolio(f)
      const result = await postNota({
        folio: f,
        fecha: todayISO(),
        cliente,
        vendedor: user?.name ?? "Vendedor",
        sucursal: suc,
        items: cart,
        pagos: pagos.map(p => ({ metodo: p.metodo, monto: parseFloat(p.monto) || 0 })),
        subtotal, iva, total,
      })
      setNotaEnviada({ folio: f, id: result.id })
      setStep(4)
      addToast({ kind: "ok", msg: `Nota ${f} enviada a Caja` })
    } catch (err) {
      addToast({ kind: "err", msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  // ── STEP 4: Confirmación enviada ──────────────────────
  if (step === 4 && notaEnviada) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: 0, paddingLeft: 12, paddingRight: 12 }}>
        <Stepper steps={STEPS} current={4} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ maxWidth: 480, width: "100%", textAlign: "center", padding: 0 }}>
            <div className="card-body" style={{ padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ok)", marginBottom: 16 }}>Nota enviada a Caja</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>
                El cajero puede buscarla por el folio o recibirla automáticamente en la sección Caja.
              </div>
              <div style={{ background: "var(--bg-sunken)", borderRadius: 8, padding: "20px 32px", marginBottom: 28 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Folio</div>
                <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--wine-700)", letterSpacing: 2 }}>
                  {notaEnviada.folio}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="btn btn-default" onClick={() => window.print()}>
                  <Icon name="print" size={13} /> Imprimir ticket
                </button>
                <button className="btn btn-wine" onClick={resetVenta}>
                  <Icon name="plus" size={13} /> Nueva venta
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 3: Verificar nota ────────────────────────────
  if (step === 3) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: 0, paddingLeft: 12, paddingRight: 12 }}>
        <Stepper steps={STEPS} current={3} />
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <div className="card">
              <div className="card-body" style={{ fontFamily: "var(--font-mono)", lineHeight: 1.8 }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>EL TIANGUIS</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Bolsas, vasos y desechables</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{sucObj?.name}</div>
                </div>
                <div style={{ borderTop: "1px dashed var(--border)", borderBottom: "1px dashed var(--border)", padding: "8px 0", marginBottom: 12, fontSize: 12 }}>
                  <div><strong>Folio:</strong> (pendiente asignación)</div>
                  <div><strong>Fecha:</strong> {todayISO()}</div>
                  <div><strong>Cliente:</strong> {cliente}</div>
                  <div><strong>Vendedor:</strong> {user?.name ?? "—"}</div>
                </div>
                <table style={{ width: "100%", fontSize: 13, marginBottom: 12 }}>
                  <tbody>
                    {cart.map((it, i) => (
                      <tr key={i}>
                        <td>{it.qty}× {it.name}</td>
                        <td style={{ textAlign: "right" }}>{fmtMoney(it.precio * it.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 8, fontSize: 13 }}>
                  {subtotalNoFact > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-muted)" }}>Sin factura</span><span>{fmtMoney(subtotalNoFact)}</span></div>}
                  {subtotalFact > 0   && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-muted)" }}>Facturable</span><span>{fmtMoney(subtotalFact)}</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{fmtMoney(subtotal)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>IVA 16%</span><span>{fmtMoney(iva)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 4 }}><span>TOTAL</span><span>{fmtMoney(total)}</span></div>
                </div>
                <div style={{ borderTop: "1px dashed var(--border)", marginTop: 10, paddingTop: 8, fontSize: 12 }}>
                  {pagos.map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{p.metodo}:</span><span>{fmtMoney(parseFloat(p.monto) || 0)}</span>
                    </div>
                  ))}
                  {cambio > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ok)", fontWeight: 600 }}><span>Cambio:</span><span>{fmtMoney(cambio)}</span></div>}
                </div>
                <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "var(--text-muted)" }}>¡Gracias por su compra!</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
              <button className="btn btn-default" onClick={() => setStep(2)}><Icon name="chevronLeft" size={13} /> Editar pago</button>
              <button className="btn btn-wine" onClick={enviarACaja} disabled={saving}>
                <Icon name="check" size={13} /> {saving ? "Enviando…" : "Enviar a Caja"}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 2: Forma de pago ─────────────────────────────
  if (step === 2) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: 0, paddingLeft: 12, paddingRight: 12 }}>
        <Stepper steps={STEPS} current={2} />
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ maxWidth: 520, margin: "0 auto" }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <div style={{ fontWeight: 700 }}>Forma de pago</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Puedes dividir en múltiples métodos</div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: "var(--wine-700)" }}>
                  {fmtMoney(total)}
                </div>
              </div>
              <div className="card-body">
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Cliente</label>
                  <select value={cliente} onChange={e => setCliente(e.target.value)} style={{ width: "100%" }}>
                    <option value="Mostrador">Mostrador</option>
                    {clientes.map(c => <option key={c.Id} value={c.Nombre}>{c.Nombre}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pagos.map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <select value={p.metodo} onChange={e => setPagoField(i, "metodo", e.target.value)} style={{ flex: 1 }}>
                        {METODOS.map(m => <option key={m}>{m}</option>)}
                      </select>
                      <input
                        type="number" step="0.01" placeholder="Monto"
                        value={p.monto}
                        onChange={e => setPagoField(i, "monto", e.target.value)}
                        style={{ width: 120, textAlign: "right" }}
                      />
                      {pagos.length > 1 && (
                        <button className="btn btn-ghost btn-sm" onClick={() => removePago(i)} style={{ color: "var(--err)" }}>
                          <Icon name="x" size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button className="btn btn-default btn-sm" style={{ marginTop: 10 }} onClick={addPago}>
                  <Icon name="plus" size={12} /> Agregar forma de pago
                </button>
              </div>
              <div className="card-body" style={{ background: "var(--bg-sunken)", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                  <span>Total a cobrar</span><span style={{ fontWeight: 600 }}>{fmtMoney(total)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                  <span>Total pagado</span><span style={{ fontWeight: 600 }}>{fmtMoney(totalPagado)}</span>
                </div>
                {pendientePago > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--err)", fontWeight: 600 }}>
                    <span>Pendiente</span><span>{fmtMoney(pendientePago)}</span>
                  </div>
                )}
                {cambio > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--ok)", fontWeight: 700 }}>
                    <span>Cambio a devolver</span><span>{fmtMoney(cambio)}</span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
              <button className="btn btn-default" onClick={() => setStep(1)}><Icon name="chevronLeft" size={13} /> Volver</button>
              <button className="btn btn-wine" disabled={pendientePago > 0} onClick={() => setStep(3)}>
                Verificar nota <Icon name="chevronRight" size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 1: Verificar pedido (galería) ────────────────
  if (step === 1) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: 0, paddingLeft: 12, paddingRight: 12 }}>
        <Stepper steps={STEPS} current={1} />
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
            {cart.map((it, i) => (
              <div key={i} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ height: 100, background: "var(--bg-sunken)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>
                  📦 imagen próximamente
                </div>
                <div className="card-body" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{it.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                    {it.unidad}{it.piezasPorUnidad > 1 ? ` · ${it.piezasPorUnidad} pzas/u` : ""}
                    {!it.facturable && <span style={{ marginLeft: 6, color: "var(--warn)" }}>Sin factura</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" style={{ padding: "0 8px" }} onClick={() => setQty(it.sku, it.qty - 1)}>−</button>
                      <span style={{ minWidth: 28, textAlign: "center", fontWeight: 600 }}>{it.qty}</span>
                      <button className="btn btn-ghost btn-sm" style={{ padding: "0 8px" }} onClick={() => setQty(it.sku, it.qty + 1)}>+</button>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fmtMoney(it.precio * it.qty)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ position: "sticky", bottom: 0 }}>
            <div className="card-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {cart.reduce((s, it) => s + it.qty, 0)} artículos · {cart.length} productos
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800 }}>{fmtMoney(total)}</div>
                <button className="btn btn-default" onClick={() => setStep(0)}><Icon name="chevronLeft" size={13} /> Editar carrito</button>
                <button className="btn btn-wine" onClick={() => setStep(2)}>
                  Forma de pago <Icon name="chevronRight" size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 0: Llenar carrito ────────────────────────────
  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: 0, paddingLeft: 12, paddingRight: 12 }}>
      <Stepper steps={STEPS} current={0} />
      <div className="page-header" style={{ marginBottom: 8, paddingBottom: 8 }}>
        <div>
          <h1 className="page-title">Ventas · Punto de venta</h1>
          <p className="page-subtitle">
            Sucursal:&nbsp;
            <select value={suc} onChange={e => setSuc(e.target.value)} style={{ fontSize: 12, border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>
              {SUCURSALES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={() => { setCart([]); setCliente("Mostrador"); setPagos([{ metodo: "Efectivo", monto: "" }]) }}>
            <Icon name="refresh" size={13} /> Cancelar nota
          </button>
        </div>
      </div>

      <div className="sales-shell">
        <div className="sales-products">
          <div className="filter-bar" style={{ marginBottom: 4 }}>
            <div className="search-input" style={{ flex: 1, maxWidth: 360 }}>
              <Icon name="search" size={14} className="icon" />
              <input placeholder="Buscar por nombre o código…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="cart-cat-tabs">
            {tipos.map(t => (
              <button key={t.id} className={"cat-pill" + (cat === t.id ? " active" : "")} onClick={() => setCat(t.id)}>{t.name}</button>
            ))}
          </div>
          <div className="products-grid">
            {loading
              ? <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 48, color: "var(--text-muted)" }}>Cargando productos…</div>
              : filtered.map(p => {
                const stock = p.stock[suc] ?? 0
                const out = stock <= 0, low = !out && stock < p.min
                return (
                  <button key={p.sku} className={"product-tile" + (out ? " disabled" : "")} onClick={() => !out && addToCart(p)}>
                    <div className="sku">{p.sku}</div>
                    <div className="name">{p.name}</div>
                    <div className="meta">
                      <span>{p.unidad || "—"}</span>
                      <span>{stock} en stock</span>
                    </div>
                    <div className="price">{p.precio > 0 ? fmtMoney(p.precio) : <span style={{ fontSize: 11, opacity: .5 }}>Sin precio</span>}</div>
                    {p.piezasPorUnidad > 1 && <div className="stock-low" style={{ color: "var(--text-muted)" }}>📦 {p.piezasPorUnidad} pzas/u</div>}
                    {!p.facturable && <div className="stock-low" style={{ color: "var(--text-muted)" }}>Sin factura</div>}
                    {low && <div className="stock-low">⚠ Stock bajo</div>}
                    {out && <div className="stock-out">● Sin stock</div>}
                  </button>
                )
              })}
          </div>
        </div>

        <div className="sales-cart">
          <div className="cart-card">
            <div className="cart-header">
              <h3>Nota actual</h3>
              <span className="count">{cart.reduce((s, it) => s + it.qty, 0)} arts.</span>
            </div>
            <div className="cart-items">
              {cart.length === 0
                ? <div className="cart-empty"><div className="big"><Icon name="cart" size={28} /></div><div>Selecciona productos<br />para armar la nota</div></div>
                : cart.map(it => (
                  <div key={it.sku} className="cart-item">
                    <div>
                      <div className="name">{it.name}</div>
                      <div className="sku">{it.sku} · {it.unidad}</div>
                      <div className="line2">
                        <div className="qty-stepper">
                          <button onClick={() => setQty(it.sku, it.qty - 1)}>−</button>
                          <input type="number" min="1" value={it.qty} onChange={e => setQty(it.sku, parseInt(e.target.value) || 0)} />
                          <button onClick={() => setQty(it.sku, it.qty + 1)}>+</button>
                        </div>
                        <span className="price-line">{fmtMoney(it.precio)} c/u</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <button className="remove" onClick={() => setQty(it.sku, 0)}><Icon name="x" size={12} /></button>
                      <span className="line-total">{fmtMoney(it.precio * it.qty)}</span>
                    </div>
                  </div>
                ))
              }
            </div>
            <div className="cart-summary">
              {subtotalNoFact > 0 && <div className="row"><span style={{ fontSize: 11, color: "var(--text-muted)" }}>Sin factura</span><span className="num" style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtMoney(subtotalNoFact)}</span></div>}
              {subtotalFact > 0   && <div className="row"><span style={{ fontSize: 11, color: "var(--text-muted)" }}>Facturable</span><span className="num" style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtMoney(subtotalFact)}</span></div>}
              <div className="row"><span>Subtotal</span><span className="num">{fmtMoney(subtotal)}</span></div>
              <div className="row"><span>IVA (16%) fact.</span><span className="num">{fmtMoney(iva)}</span></div>
              <div className="row total"><span>Total</span><span className="num">{fmtMoney(total)}</span></div>
            </div>
            <div className="cart-actions">
              <button className="btn btn-default" onClick={() => setCart([])} disabled={cart.length === 0}><Icon name="trash" size={13} /> Vaciar</button>
              <button className="btn btn-wine" onClick={() => setStep(1)} disabled={cart.length === 0}>
                Verificar pedido <Icon name="chevronRight" size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
