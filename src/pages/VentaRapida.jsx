import { useState, useEffect, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import Icon from "../components/Icon"
import PresPicker from "../components/PresPicker"
import NotaImpresa from "../components/NotaImpresa"
import Select from "../components/Select"
import { getCatalogo, postNota, cobrarNota } from "../api"
import { fmtMoney, todayISO } from "../utils"

const METODOS = ["Efectivo", "Tarjeta", "Transferencia"]

// Venta rápida: el mostrador cobra sin pasar por el flujo de tres pasos.
// Escanea o toca, cobra e imprime el ticket en la misma pantalla.
// Por dentro hace lo mismo que el camino largo (crear la nota y cobrarla),
// así que el stock y los reportes salen idénticos.
export default function VentaRapida({ sucursal, user, addToast, onClose, onCobrada }) {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando]   = useState(true)
  const [cart, setCart]           = useState([])
  const [search, setSearch]       = useState("")
  const [presProducto, setPres]   = useState(null)
  const [metodo, setMetodo]       = useState("Efectivo")
  const [recibido, setRecibido]   = useState("")
  const [cobrando, setCobrando]   = useState(false)
  const [cobrada, setCobrada]     = useState(null)   // { folio, pagos, totals, cambio, items }
  const searchRef = useRef(null)

  const suc = (sucursal || "centro").toLowerCase()

  useEffect(() => {
    getCatalogo()
      .then(c => { setProductos(c); setCargando(false) })
      .catch(err => { addToast({ kind: "err", msg: err.message }); setCargando(false) })
  }, [addToast])

  useEffect(() => { searchRef.current?.focus() }, [cobrada])

  // ── Totales (misma regla que el punto de venta) ──────
  const subtotalFact   = cart.filter(it => it.facturable).reduce((s, it) => s + it.precio * it.qty, 0)
  const subtotalNoFact = cart.filter(it => !it.facturable).reduce((s, it) => s + it.precio * it.qty, 0)
  const subtotal = subtotalFact + subtotalNoFact
  const iva      = subtotalFact * 0.16
  const total    = subtotal + iva
  const pagado   = parseFloat(recibido) || 0
  const cambio   = metodo === "Efectivo" ? Math.max(0, pagado - total) : 0
  const falta    = metodo === "Efectivo" && pagado > 0 ? Math.max(0, total - pagado) : 0

  // ── Carrito ──────────────────────────────────────────
  const agregar = (p, pres) => {
    const precio = pres ? pres.precio : p.precio
    const factor = pres ? (pres.factor ?? 1) : (p.piezasPorUnidad ?? 1)
    const label  = pres ? (pres.presLabel ?? pres.label) : (p.unidad || "Pieza")
    const presId = pres ? pres.id + (pres.esMayoreo ? "_may" : "") : "pieza"
    const key    = p.sku + "__" + presId
    setCart(c => {
      const ex = c.find(it => it.key === key)
      if (ex) return c.map(it => it.key === key ? { ...it, qty: it.qty + 1 } : it)
      return [...c, {
        key, sku: p.sku, name: p.name, presId, presLabel: label,
        precio, factor, nivel: pres?.nivel ?? "pieza",
        facturable: p.facturable !== false, qty: 1,
      }]
    })
  }

  const setQty = (key, q) =>
    setCart(c => q <= 0 ? c.filter(it => it.key !== key) : c.map(it => it.key === key ? { ...it, qty: q } : it))

  const elegirProducto = (p) => {
    if ((p.stock?.[suc] ?? 0) <= 0) return addToast({ kind: "warn", msg: `Sin stock: ${p.name}` })
    const activas = (p.presentaciones || []).filter(x => x.activo !== false)
    if (activas.length > 1) setPres(p)
    else agregar(p, activas[0] ?? null)
  }

  // Escáner: código de presentación primero, luego código de producto
  const onEnterBusqueda = () => {
    const q = search.trim()
    if (!q) return
    setSearch("")
    for (const p of productos) {
      const pres = (p.presentaciones || []).find(pr => pr.codigoBarras && pr.codigoBarras === q)
      if (pres) {
        if ((p.stock?.[suc] ?? 0) <= 0) return addToast({ kind: "warn", msg: `Sin stock: ${p.name}` })
        return agregar(p, pres)
      }
    }
    const exacto = productos.find(p => p.codigoBarras === q || p.sku === q.padStart(4, "0"))
    if (!exacto) return addToast({ kind: "err", msg: `Código no encontrado: ${q}` })
    elegirProducto(exacto)
  }

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = productos.filter(p => (p.stock?.[suc] ?? 0) > 0)
    if (!q) return base.slice(0, 24)
    return base.filter(p => p.name.toLowerCase().includes(q) || p.sku.includes(q)).slice(0, 24)
  }, [productos, search, suc])

  // ── Cobro ────────────────────────────────────────────
  const cobrar = async () => {
    if (!cart.length || cobrando) return
    if (metodo === "Efectivo" && pagado > 0 && pagado < total) {
      return addToast({ kind: "err", msg: "El monto recibido no cubre el total" })
    }
    setCobrando(true)
    try {
      const items = cart.map(it => ({
        sku: it.sku, name: it.name, nombre: it.name,
        presId: it.presId, presLabel: it.presLabel,
        precio: it.precio, factor: it.factor, nivel: it.nivel,
        facturable: it.facturable, qty: it.qty,
      }))
      const pagos = [{ metodo, monto: metodo === "Efectivo" && pagado > 0 ? pagado : total }]

      // Mismo camino que el flujo largo: se crea la nota y se cobra
      const nota = await postNota({
        fecha: todayISO(), cliente: "Mostrador",
        vendedor: user?.name ?? "Caja", sucursal: suc,
        items, pagos, subtotal, iva, total,
        observaciones: "Venta rápida",
      })
      await cobrarNota(nota.id, { pagos, sucursal: suc })

      setCobrada({
        folio: nota.folio,
        pagos,
        totals: { subtotal, iva, total, subtotalFact, subtotalNoFact },
        cambio,
        items,
      })
      addToast({ kind: "ok", msg: `Cobrado ${fmtMoney(total)} · ${nota.folio}` })
      onCobrada?.()
    } catch (err) {
      addToast({ kind: "err", msg: err.message })
    } finally {
      setCobrando(false)
    }
  }

  const nuevaVenta = () => {
    setCobrada(null); setCart([]); setRecibido(""); setMetodo("Efectivo"); setSearch("")
  }

  const imprimir = () => {
    document.body.classList.add("print-nota")
    window.print()
    document.body.classList.remove("print-nota")
  }

  // Enter cobra cuando hay carrito y el buscador está vacío
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !cobrada) return onClose()
      if (e.key !== "Enter" || e.repeat) return
      const tag = e.target?.tagName
      if (tag === "TEXTAREA" || tag === "BUTTON") return
      if (e.target?.closest?.(".select-wrap") || document.querySelector(".select-menu")) return
      if (presProducto) return
      if (tag === "INPUT" && e.target !== searchRef.current) return   // el campo de recibido manda
      if (cobrada) { e.preventDefault(); nuevaVenta(); return }
      if (search.trim()) return                                        // lo maneja el buscador
      e.preventDefault()
      cobrar()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  })

  const notaProps = cobrada ? {
    folio: cobrada.folio, fecha: todayISO(), cliente: "Mostrador",
    vendedor: user?.name ?? "Caja", sucursal: suc,
    items: cobrada.items, pagos: cobrada.pagos, totals: cobrada.totals, cambio: cobrada.cambio,
  } : null

  return (
    <div className="vr-overlay">
      {notaProps && createPortal(
        <div className="print-nota-wrapper">
          <NotaImpresa {...notaProps} />
          <NotaImpresa {...notaProps} />
        </div>,
        document.body
      )}

      <div className="vr-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Icon name="cart" size={18} />
          <div style={{ fontWeight: 700, fontSize: "var(--fs-md)" }}>Venta rápida</div>
          <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>Cobro directo · {sucursal}</span>
        </div>
        <button className="btn btn-ghost" onClick={onClose}>
          <Icon name="x" size={14} /> Cerrar
        </button>
      </div>

      {cobrada ? (
        // ── Cobrada: ticket y siguiente venta ──
        <div className="vr-exito">
          <div className="cobro-check"><span>✓</span></div>
          <div className="vr-exito-titulo">Cobrado</div>
          <div className="vr-exito-folio">{cobrada.folio}</div>
          <div className="vr-exito-total">{fmtMoney(cobrada.totals.total)}</div>
          {cobrada.cambio > 0 && (
            <div className="vr-cambio">Cambio: {fmtMoney(cobrada.cambio)}</div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
            <button className="btn btn-default btn-lg" onClick={imprimir}>
              <Icon name="print" size={14} /> Imprimir ticket
            </button>
            <button className="btn btn-wine btn-lg" onClick={nuevaVenta}>
              <Icon name="plus" size={14} /> Otra venta <kbd className="kbd">Enter</kbd>
            </button>
          </div>
        </div>
      ) : (
        <div className="vr-body">
          {/* Productos */}
          <div className="vr-productos">
            <div className="search-input vr-search">
              <Icon name="search" size={15} className="icon" />
              <input
                ref={searchRef}
                placeholder="Escanea o busca por nombre o código…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") onEnterBusqueda() }}
              />
              <span className="vr-search-scan"><Icon name="barcode" size={15} /></span>
            </div>

            <div className="vr-grid">
              {cargando
                ? <div className="muted" style={{ padding: 20 }}>Cargando productos…</div>
                : filtrados.map(p => {
                  const pres = (p.presentaciones || []).filter(x => x.activo !== false)
                  const desde = pres.find(x => x.precio > 0)?.precio ?? p.precio
                  return (
                    <button key={p.sku} className="vr-tile" onClick={() => elegirProducto(p)}>
                      <span className="vr-tile-sku">{p.sku}</span>
                      <span className="vr-tile-name">{p.name}</span>
                      <span className="vr-tile-precio">
                        {pres.length > 1 ? "Desde " : ""}{fmtMoney(desde)}
                      </span>
                    </button>
                  )
                })
              }
            </div>
          </div>

          {/* Cobro */}
          <div className="vr-cobro">
            <div className="vr-items">
              {cart.length === 0
                ? <div className="vr-vacio">Escanea un producto para empezar</div>
                : cart.map(it => (
                  <div key={it.key} className="vr-item">
                    <div style={{ minWidth: 0 }}>
                      <div className="vr-item-name">{it.name}</div>
                      <div className="vr-item-pres">{it.presLabel} · {fmtMoney(it.precio)}</div>
                    </div>
                    <div className="vr-item-acciones">
                      <div className="qty-stepper">
                        <button onClick={() => setQty(it.key, it.qty - 1)}>−</button>
                        <input
                          type="number" min="1" value={it.qty}
                          onChange={e => setQty(it.key, parseInt(e.target.value) || 0)}
                        />
                        <button onClick={() => setQty(it.key, it.qty + 1)}>+</button>
                      </div>
                      <div className="vr-item-total">{fmtMoney(it.precio * it.qty)}</div>
                    </div>
                  </div>
                ))
              }
            </div>

            <div className="vr-resumen">
              <div className="vr-row"><span>Subtotal</span><span className="num">{fmtMoney(subtotal)}</span></div>
              <div className="vr-row"><span>IVA (16%) fact.</span><span className="num">{fmtMoney(iva)}</span></div>
              <div className="vr-row total"><span>Total</span><span key={total} className="num flash">{fmtMoney(total)}</span></div>

              <div className="vr-metodos">
                {METODOS.map(m => (
                  <button
                    key={m}
                    className={"vr-metodo" + (metodo === m ? " activo" : "")}
                    onClick={() => setMetodo(m)}
                  >{m}</button>
                ))}
              </div>

              {metodo === "Efectivo" && (
                <div className="vr-efectivo">
                  <label>Recibido</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={recibido}
                    onChange={e => setRecibido(e.target.value)}
                    placeholder={total > 0 ? fmtMoney(total).replace("$", "") : "0.00"}
                  />
                  {cambio > 0 && <div className="vr-cambio-chip">Cambio {fmtMoney(cambio)}</div>}
                  {falta > 0 && <div className="vr-falta-chip">Faltan {fmtMoney(falta)}</div>}
                </div>
              )}

              <button
                className="btn btn-wine btn-lg vr-cobrar"
                onClick={cobrar}
                disabled={!cart.length || cobrando}
              >
                <Icon name="check" size={15} />
                {cobrando ? "Cobrando…" : `Cobrar ${fmtMoney(total)}`}
                {!cobrando && cart.length > 0 && <kbd className="kbd">Enter</kbd>}
              </button>
            </div>
          </div>
        </div>
      )}

      {presProducto && (
        <PresPicker
          producto={presProducto}
          suc={suc}
          cart={cart}
          onSelect={(pres) => { agregar(presProducto, pres); setPres(null); searchRef.current?.focus() }}
          onClose={() => setPres(null)}
        />
      )}
    </div>
  )
}
