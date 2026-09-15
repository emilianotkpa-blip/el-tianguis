import { useState, useEffect, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import Icon from "../components/Icon"
import PresPicker from "../components/PresPicker"
import NotaImpresa from "../components/NotaImpresa"
import Select from "../components/Select"
import { getCatalogo, postNota, cobrarNota, getPromos } from "../api"
import { fmtMoney, todayISO } from "../utils"
import { evaluarPromos } from "../promos"

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
  const [pagos, setPagos]         = useState([{ metodo: "Efectivo", monto: "" }])
  const [folioTerminal, setFolioTerminal] = useState("")
  const [conIva, setConIva]       = useState(false)   // apagado por defecto
  const [promos, setPromos]       = useState([])
  const [cobrando, setCobrando]   = useState(false)
  const [cobrada, setCobrada]     = useState(null)   // { folio, pagos, totals, cambio, items }
  const searchRef = useRef(null)

  const suc = (sucursal || "centro").toLowerCase()

  useEffect(() => {
    getCatalogo()
      .then(c => { setProductos(c); setCargando(false) })
      .catch(err => { addToast({ kind: "err", msg: err.message }); setCargando(false) })
  }, [addToast])

  useEffect(() => { getPromos().then(setPromos).catch(() => setPromos([])) }, [])
  useEffect(() => { searchRef.current?.focus() }, [cobrada])

  // ── Totales (misma regla que el punto de venta) ──────
  const subtotalFact   = cart.filter(it => it.facturable).reduce((s, it) => s + it.precio * it.qty, 0)
  const subtotalNoFact = cart.filter(it => !it.facturable).reduce((s, it) => s + it.precio * it.qty, 0)
  const subtotalBruto = subtotalFact + subtotalNoFact
  const promo    = useMemo(() => evaluarPromos(cart, promos), [cart, promos])
  const subtotal = subtotalBruto - promo.total
  const baseIva  = Math.max(0, subtotalFact - promo.totalFacturable)
  const iva      = conIva ? baseIva * 0.16 : 0
  const total    = subtotal + iva
  // El cobro se puede repartir entre varias formas de pago.
  // Las comparaciones van en centavos enteros: con decimales, 50 + 40.48
  // contra un total de 90.48 dejaba una diferencia de 0.0000000000001 que
  // mostraba "Faltan $0.00" y bloqueaba el cobro.
  const cent      = (n) => Math.round((Number(n) || 0) * 100)
  const pagado    = pagos.reduce((s2, p) => s2 + (parseFloat(p.monto) || 0), 0)
  const cambio    = Math.max(0, cent(pagado) - cent(total)) / 100
  const falta     = Math.max(0, cent(total) - cent(pagado)) / 100
  const tieneTarjeta = pagos.some(p => p.metodo === "Tarjeta" && (parseFloat(p.monto) || 0) > 0)
  // Si nadie puso monto, se cobra el total con la primera forma elegida
  const sinCapturar = pagado === 0
  const puedeCobrar = cart.length > 0 && !cobrando
    && (sinCapturar || falta === 0)
    && (!tieneTarjeta || folioTerminal.trim().length > 0)

  const setPagoField = (i, campo, val) =>
    setPagos(ps => ps.map((p, idx) => idx === i ? { ...p, [campo]: val } : p))
  const addPago = () =>
    // La nueva línea llega con lo que falta, que es lo que casi siempre se cobra
    setPagos(ps => [...ps, { metodo: "Tarjeta", monto: falta > 0 ? falta.toFixed(2) : "" }])
  const removePago = (i) => setPagos(ps => ps.filter((_, idx) => idx !== i))

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
    if (!puedeCobrar) {
      if (tieneTarjeta && !folioTerminal.trim()) {
        return addToast({ kind: "err", msg: "Falta el folio de la terminal" })
      }
      if (falta > 0) return addToast({ kind: "err", msg: `Faltan ${fmtMoney(falta)} por cubrir` })
      return
    }
    setCobrando(true)
    try {
      const items = cart.map(it => ({
        sku: it.sku, name: it.name, nombre: it.name,
        presId: it.presId, presLabel: it.presLabel,
        precio: it.precio, factor: it.factor, nivel: it.nivel,
        facturable: it.facturable, qty: it.qty,
        iva: conIva && it.facturable !== false,
      }))
      const descuentosPayload = promo.descuentos.map(d => ({
        tipo: "descuento", reglaId: d.reglaId, nombre: d.nombre,
        veces: d.veces, monto: d.monto, facturable: d.facturable,
      }))
      // Sin montos capturados se cobra todo con la primera forma elegida;
      // con reparto, cada línea va como la capturó el cajero
      const pagosPayload = sinCapturar
        ? [{ metodo: pagos[0].metodo, monto: total }]
        : pagos
            .filter(pg => (parseFloat(pg.monto) || 0) > 0)
            .map(pg => ({ metodo: pg.metodo, monto: parseFloat(pg.monto) }))

      // Mismo camino que el flujo largo: se crea la nota y se cobra
      const nota = await postNota({
        fecha: todayISO(), cliente: "Mostrador",
        vendedor: user?.name ?? "Caja", sucursal: suc,
        items: [...items, ...descuentosPayload], pagos: pagosPayload, subtotal, iva, total,
        observaciones: "Venta rápida",
      })
      await cobrarNota(nota.id, {
        pagos: pagosPayload,
        sucursal: suc,
        folioTerminal: folioTerminal.trim() || undefined,
      })

      setCobrada({
        folio: nota.folio,
        pagos: pagosPayload,
        totals: { subtotal, iva, total, subtotalFact, subtotalNoFact, descuentos: promo.descuentos },
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
    setCobrada(null); setCart([]); setSearch("")
    setPagos([{ metodo: "Efectivo", monto: "" }]); setFolioTerminal(""); setConIva(false)
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
      // Enter desde un campo de monto cobra si la cuenta ya cuadra
      if (tag === "INPUT" && e.target !== searchRef.current && !puedeCobrar) return
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
              {promo.descuentos.map(d => (
                <div className="vr-row promo-row" key={d.reglaId}>
                  <span>{d.nombre}{d.veces > 1 ? ` ×${d.veces}` : ""}</span>
                  <span className="num">−{fmtMoney(d.monto)}</span>
                </div>
              ))}
              <div className="vr-row"><span>Subtotal</span><span className="num">{fmtMoney(subtotal)}</span></div>
              <label className="iva-toggle">
                <input type="checkbox" checked={conIva} onChange={e => setConIva(e.target.checked)} />
                <span>Agregar IVA (16%)</span>
                <span className={"num" + (conIva ? " on" : "")}>{fmtMoney(iva)}</span>
              </label>
              <div className="vr-row total"><span>Total</span><span key={total} className="num flash">{fmtMoney(total)}</span></div>

              {/* Formas de pago: se puede repartir entre varias */}
              <div className="vr-pagos">
                {pagos.map((pg, i) => (
                  <div key={i} className="vr-pago-fila">
                    <Select
                      value={pg.metodo}
                      onChange={e => setPagoField(i, "metodo", e.target.value)}
                      className="select-filtro"
                      style={{ flex: 1 }}
                      ariaLabel={`Forma de pago ${i + 1}`}
                      options={METODOS.map(m => ({ value: m, label: m }))}
                    />
                    <input
                      type="number" step="0.01" min="0"
                      className="vr-pago-monto"
                      value={pg.monto}
                      onChange={e => setPagoField(i, "monto", e.target.value)}
                      placeholder={i === 0 && total > 0 ? total.toFixed(2) : "0.00"}
                    />
                    {pagos.length > 1 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => removePago(i)} style={{ color: "var(--err)" }}>
                        <Icon name="x" size={12} />
                      </button>
                    )}
                  </div>
                ))}

                <div className="vr-pagos-pie">
                  <button className="btn btn-default btn-sm" onClick={addPago} disabled={!cart.length}>
                    <Icon name="plus" size={12} /> Repartir pago
                  </button>
                  {!sinCapturar && cambio > 0 && <span className="vr-cambio-chip">Cambio {fmtMoney(cambio)}</span>}
                  {!sinCapturar && falta  > 0 && <span className="vr-falta-chip">Faltan {fmtMoney(falta)}</span>}
                  {sinCapturar && cart.length > 0 && (
                    <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                      Sin capturar montos se cobra todo con {pagos[0].metodo.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* Folio de terminal — obligatorio si hay tarjeta, igual que en el cobro normal */}
              {tieneTarjeta && (
                <div className="vr-terminal">
                  <label>Folio de la terminal</label>
                  <input
                    value={folioTerminal}
                    onChange={e => setFolioTerminal(e.target.value)}
                    placeholder="Requerido para cobrar con tarjeta"
                    style={{ borderColor: folioTerminal.trim() ? "var(--border-strong)" : "var(--err)" }}
                  />
                </div>
              )}

              <button
                className="btn btn-wine btn-lg vr-cobrar"
                onClick={cobrar}
                disabled={!puedeCobrar}
              >
                <Icon name="check" size={15} />
                {cobrando ? "Cobrando…" : `Cobrar ${fmtMoney(total)}`}
                {!cobrando && puedeCobrar && <kbd className="kbd">Enter</kbd>}
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
