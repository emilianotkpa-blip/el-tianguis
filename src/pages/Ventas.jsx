import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import Icon from "../components/Icon"
import Stepper from "../components/Stepper"
import { SUCURSALES } from "../data"
import { getCatalogo, postNota, crearBorrador, confirmarNota, cancelarBorrador, getClientes, postAbrirCaja, printFolio } from "../api"
import { fmtMoney, todayISO } from "../utils"

const STEPS = ["Llenar carrito", "Verificar pedido", "Enviar a caja"]

function FolioBarcode({ value }) {
  if (!value) return null
  return <span className="pf-barcode">{value}</span>
}


// ── Modal de selección de presentación ─────────────────
function PresModal({ producto, suc, onSelect, onClose, cart }) {
  const isBolsa = producto.tipo === "bolsas"
  const pres    = (producto.presentaciones || []).filter(p =>
    isBolsa ? p.id !== "detalle" : p.id !== "kilo"
  )
  const niveles = producto.stockNiveles?.[suc] ?? {}
  const baseStock = producto.stock?.[suc] ?? 0
  const paqDisp   = niveles.paq   ?? 0
  const piezaDisp = niveles.pieza ?? 0
  const cajasDisp = niveles.caja  ?? 0

  // Calcular disponibles reales descontando lo ya en el carrito
  const cartQty = (presId) => cart
    .filter(it => it.sku === producto.sku && it.presId === presId)
    .reduce((s, it) => s + it.qty, 0)

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg-elev)", borderRadius: 12, padding: 24, minWidth: 320, maxWidth: 440,
        boxShadow: "0 12px 40px rgba(0,0,0,.45), 0 0 0 1px var(--border)",
        backdropFilter: "blur(12px)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{producto.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          {paqDisp > 0 && <span>Paq sueltos: <strong>{paqDisp}</strong> · </span>}
          {piezaDisp > 0 && <span>Piezas: <strong>{piezaDisp}</strong> · </span>}
          {cajasDisp > 0 ? <span>Cajas/Bultos: <strong>{cajasDisp}</strong></span>
            : baseStock > 0 && paqDisp === 0 && piezaDisp === 0
              ? <span>Stock base: <strong>{baseStock}</strong></span>
              : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pres.map((p) => {
            const enCarrito = cartQty(p.id)

            // Siempre calcular desde baseStock/factor (fuente de verdad, siempre actualizada)
            // StockNiveles puede quedar desincronizado; base stock no.
            const factor = p.factor ?? 1
            let dispReal = 0
            let necesitaAbrirCaja = false
            if (p.nivel === "paquete") {
              dispReal = baseStock > 0
                ? Math.floor(baseStock / factor) - enCarrito
                : (paqDisp + Math.floor(piezaDisp / factor)) - enCarrito
              necesitaAbrirCaja = dispReal > 0 && (
                (paqDisp === 0 && cajasDisp > 0) ||
                (paqDisp > 0 && enCarrito >= paqDisp)
              )
            } else if (p.nivel === "caja" || p.nivel === "bulto") {
              dispReal = baseStock > 0
                ? Math.floor(baseStock / factor) - enCarrito
                : cajasDisp - enCarrito
            } else {
              dispReal = baseStock > 0
                ? baseStock - enCarrito
                : piezaDisp - enCarrito
            }

            const insuficiente  = dispReal <= 0
            const precioPza     = p.factor > 0 ? p.precio / p.factor : null
            const mayoreoActivo = p.mayoreo && p.precioMayoreo > 0
            const pctDesc       = mayoreoActivo
              ? Math.round((1 - p.precioMayoreo / p.precio) * 100) : 0
            const mayoreoPza    = (mayoreoActivo && p.factor > 0) ? p.precioMayoreo / p.factor : null

            return (
              <div key={p.id} style={{
                border: `1px solid ${insuficiente ? "var(--err)" : necesitaAbrirCaja ? "var(--gold-500)" : "var(--border)"}`,
                borderRadius: 8, overflow: "hidden",
                background: insuficiente ? "rgba(220,50,50,.05)" : necesitaAbrirCaja ? "rgba(240,191,46,.06)" : "var(--bg-sunken)",
                opacity: insuficiente ? 0.6 : 1,
              }}>
                {/* Precio normal */}
                <button
                  onClick={() => !insuficiente && onSelect(p)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", width: "100%",
                    cursor: insuficiente ? "not-allowed" : "pointer",
                    background: "transparent", border: 0, textAlign: "left",
                  }}
                  className={insuficiente ? "" : "hover-row"}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: insuficiente ? "var(--err)" : necesitaAbrirCaja ? "var(--gold-700)" : "var(--text-muted)", marginTop: 1 }}>
                      {p.factor
                        ? insuficiente
                          ? "⚠ Sin stock disponible"
                          : necesitaAbrirCaja
                            ? `📦 Requiere abrir caja · ${dispReal} disp.`
                            : `${p.factor} pzs · ${dispReal} disp.${enCarrito > 0 ? ` (${enCarrito} en nota)` : ""}`
                        : "Cantidad libre"
                      }
                      {precioPza && !insuficiente && !necesitaAbrirCaja && (
                        <span style={{ marginLeft: 6 }}>${precioPza.toFixed(2)}/pza</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16, color: "var(--wine-700)" }}>
                    {p.precio > 0 ? fmtMoney(p.precio) : <span style={{ fontSize: 12, opacity: .5 }}>Sin precio</span>}
                  </div>
                </button>

                {/* Precio mayoreo */}
                {mayoreoActivo && (
                  <button
                    onClick={() => onSelect({ ...p, precio: p.precioMayoreo, presLabel: p.label + " (Mayoreo)", esMayoreo: true })}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 14px", width: "100%", cursor: "pointer", textAlign: "left",
                      background: "rgba(240,191,46,.08)", border: 0,
                      borderTop: "1px dashed var(--border)",
                    }}
                    className="hover-row"
                  >
                    <div style={{ fontSize: 12 }}>
                      <span style={{
                        background: "var(--gold-500)", color: "#000",
                        borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700, marginRight: 6,
                      }}>MAYOREO</span>
                      {pctDesc > 0 && (
                        <span style={{ color: "var(--ok)", fontWeight: 600 }}>−{pctDesc}%</span>
                      )}
                      {mayoreoPza && (
                        <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                          ${mayoreoPza.toFixed(2)}/pza
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, color: "var(--gold-700)" }}>
                      {fmtMoney(p.precioMayoreo)}
                    </div>
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <button className="btn btn-default" style={{ width: "100%", marginTop: 12 }} onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Modal de precios por presentación (en la nota) ─────
function CartItemPreciosModal({ item, producto, suc, onCambiar, onClose }) {
  const pres = producto?.presentaciones ?? []
  if (!pres.length) return null
  const cfg = producto

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg-elev)", borderRadius: 12, padding: 24, minWidth: 300, maxWidth: 400,
        boxShadow: "0 12px 40px rgba(0,0,0,.45), 0 0 0 1px var(--border)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{producto?.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          Precios por presentación
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pres.map(p => {
            const esActual  = item.presId === p.id || item.presId === p.id + "_may"
            const precioPza = p.factor > 0 ? p.precio / p.factor : null
            return (
              <div key={p.id} style={{
                border: `1px solid ${esActual ? "var(--wine-600)" : "var(--border)"}`,
                borderRadius: 8, overflow: "hidden",
                background: esActual ? "rgba(114,24,42,.07)" : "var(--bg-sunken)",
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 14px",
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                      {p.label}
                      {esActual && <span style={{ fontSize: 10, background: "var(--wine-600)", color: "#fff", borderRadius: 4, padding: "1px 6px" }}>en nota</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                      {p.factor ? `${p.factor} pzs` : "Cantidad libre"}
                      {precioPza && <span style={{ marginLeft: 6 }}>${precioPza.toFixed(2)}/pza</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16, color: "var(--wine-700)" }}>
                      {p.precio > 0 ? fmtMoney(p.precio) : <span style={{ fontSize: 12, opacity: .5 }}>Sin precio</span>}
                    </div>
                    {!esActual && p.precio > 0 && (
                      <button
                        className="btn btn-wine btn-sm"
                        style={{ fontSize: 11, padding: "2px 10px" }}
                        onClick={() => onCambiar(p)}
                      >
                        Cambiar
                      </button>
                    )}
                  </div>
                </div>
                {p.mayoreo && p.precioMayoreo > 0 && (
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "6px 14px", borderTop: "1px dashed var(--border)",
                    background: "rgba(240,191,46,.06)",
                  }}>
                    <div style={{ fontSize: 12 }}>
                      <span style={{ background: "var(--gold-500)", color: "#000", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700, marginRight: 6 }}>MAYOREO</span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {p.factor > 0 && `$${(p.precioMayoreo / p.factor).toFixed(2)}/pza`}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, color: "var(--gold-700)" }}>{fmtMoney(p.precioMayoreo)}</span>
                      {!(item.presId === p.id + "_may") && (
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: "2px 10px", background: "var(--gold-500)", color: "#000", border: "none", borderRadius: 4, cursor: "pointer" }}
                          onClick={() => onCambiar({ ...p, precio: p.precioMayoreo, presLabel: p.label + " (Mayoreo)", esMayoreo: true })}
                        >
                          Cambiar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <button className="btn btn-default" style={{ width: "100%", marginTop: 12 }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}

// ── Modal de abrir caja ─────────────────────────────────
function AbrirCajaModal({ producto, cajaLevel, paqLabel, onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.65)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100
    }}>
      <div style={{
        background: "var(--bg-elev)", borderRadius: 12, padding: 28, maxWidth: 360, width: "90%",
        boxShadow: "0 12px 40px rgba(0,0,0,.5), 0 0 0 1px var(--border)",
        color: "var(--text)",
      }}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 10 }}>📦</div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 10, textAlign: "center", color: "var(--text)" }}>
          ¿Abrir caja?
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, textAlign: "center", lineHeight: 1.5 }}>
          No hay suficiente stock suelto para <strong style={{ color: "var(--text)" }}>{paqLabel}</strong>.
          <br />
          Se abrirá 1 caja de <strong style={{ color: "var(--text)" }}>{cajaLevel.label}</strong> ({cajaLevel.factor} pzs)
          y se descontará del inventario.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-default" style={{ flex: 1, fontSize: 15, padding: "10px 0" }} onClick={onCancel}>
            No
          </button>
          <button className="btn btn-wine" style={{ flex: 1, fontSize: 15, padding: "10px 0" }} onClick={onConfirm}>
            Sí, abrir
          </button>
        </div>
      </div>
    </div>
  )
}

export default function VentasPage({ addToast, user, sucursalActiva, preloadedCatalogo, preloadedClientes, sharedCart, clearSharedCart, onIrACaja }) {
  const [step, setStep]           = useState(0)
  const [folioImpreso, setFolioImpreso] = useState(false)
  const [borradorId, setBorradorId]     = useState(null)
  const creatingRef = useRef(false) // evita crear borrador duplicado
  const [productos, setProductos] = useState(preloadedCatalogo ?? [])
  const [clientes, setClientes]   = useState(preloadedClientes ?? [])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState("")
  const [cat, setCat]             = useState("all")
  const [suc, setSuc]             = useState(sucursalActiva || "centro")
  const [cart, setCart]           = useState([])
  const [cliente, setCliente]     = useState("Mostrador")
  const [saving, setSaving]       = useState(false)
  const [folio, setFolio]         = useState(null)
  const [notaEnviada, setNotaEnviada] = useState(null)

  // Selector de presentación
  const [presModal, setPresModal] = useState(null)

  // Abrir caja
  const [cajaModal, setCajaModal] = useState(null) // { producto, pres, cajaLevel }

  // Precios de ítem en carrito
  const [preciosModal, setPreciosModal] = useState(null) // { item, producto }

  const searchRef = useRef(null)

  useEffect(() => {
    if (preloadedCatalogo) setLoading(false)
    Promise.all([getCatalogo(), getClientes()])
      .then(([p, c]) => { setProductos(p); setClientes(c) })
      .finally(() => setLoading(false))
  }, [])

  // Auto-foco al montar
  useEffect(() => { searchRef.current?.focus() }, [])

  // Restaurar borrador de sessionStorage al montar
  const DRAFT_KEY = `elt_draft_${user?.email ?? "guest"}`
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY)
      if (!saved) return
      const d = JSON.parse(saved)
      if (d.cart?.length && d.folio && d.borradorId) {
        setCart(d.cart)
        setFolio(d.folio)
        setBorradorId(d.borradorId)
        if (d.cliente) setCliente(d.cliente)
        if (d.suc) setSuc(d.suc)
      }
    } catch {}
  }, [])

  // Persistir borrador en sessionStorage cuando cambia el carrito
  useEffect(() => {
    if (cart.length > 0 && borradorId) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ cart, folio, borradorId, cliente, suc }))
    }
  }, [cart, folio, borradorId, cliente, suc])

  // Consumir items enviados desde Báscula
  useEffect(() => {
    if (!sharedCart?.length) return
    const hasDraft = Boolean(sessionStorage.getItem(`elt_draft_${user?.email ?? "guest"}`))
    setCart(c => {
      const next = [...c]
      for (const item of sharedCart) {
        const ex = next.find(it => it.key === item.key)
        if (ex) { ex.qty += item.qty } else { next.push(item) }
      }
      return next
    })
    clearSharedCart?.()
    // Si no hay borrador existente, crear uno para que aparezca el folio
    if (!hasDraft && !creatingRef.current) {
      creatingRef.current = true
      crearBorrador({ sucursal: suc, vendedor: user?.name ?? "" })
        .then(r => { setBorradorId(r.id); setFolio(r.folio) })
        .catch(() => addToast({ kind: "warn", msg: "Sin conexión — folio se generará al enviar" }))
        .finally(() => { creatingRef.current = false })
    }
  }, []) // solo en el montaje — sharedCart es el snapshot de cuando Báscula navegó

  // Cuando el buscador pierde el foco y no fue hacia un input/modal,
  // lo devolvemos al buscador para que el escáner siempre aterrice ahí
  useEffect(() => {
    const el = searchRef.current
    if (!el) return
    const onBlur = () => {
      setTimeout(() => {
        const active = document.activeElement
        const tag = active?.tagName
        const enModal = active?.closest("[data-modal]")
        if (!enModal && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && tag !== "BUTTON") {
          searchRef.current?.focus()
        }
      }, 80)
    }
    el.addEventListener("blur", onBlur)
    return () => el.removeEventListener("blur", onBlur)
  }, [])

  const tipos = useMemo(() => {
    const set = new Set(productos.map(p => p.tipo).filter(Boolean))
    return [{ id: "all", name: "Todos" }, ...[...set].sort().map(t => ({ id: t, name: t }))]
  }, [productos])

  const sucObj = SUCURSALES.find(s => s.id === suc)

  const filtered = useMemo(() =>
    productos.filter(p => {
      if (cat !== "all" && p.tipo !== cat) return false
      if (search) {
        const q   = search.toLowerCase()
        const raw = search.trim()
        const matchName        = p.name.toLowerCase().includes(q)
        const matchSku         = p.sku.includes(raw)
        const matchBarcode     = p.codigoBarras && p.codigoBarras === raw
        const matchPresBarcode = p.presentaciones?.some(pr => pr.codigoBarras && pr.codigoBarras === raw)
        if (!matchName && !matchSku && !matchBarcode && !matchPresBarcode) return false
      }
      return true
    }), [productos, search, cat])

  const handleSearchEnter = () => {
    if (!search.trim()) return
    const q = search.trim()
    setSearch("")

    // 1) Barcode exacto de presentación → agrega directo sin modal
    for (const p of productos) {
      const presMatch = p.presentaciones?.find(pr => pr.codigoBarras && pr.codigoBarras === q)
      if (presMatch) {
        const stock = p.stock[suc] ?? 0
        if (stock <= 0) {
          addToast({ kind: "warn", msg: `Sin stock: ${p.name} (${presMatch.label}) en ${suc}` })
          return
        }
        checkAndAdd(p, presMatch)
        return
      }
    }

    // 2) Barcode/SKU de producto → abre modal o agrega directo
    const exact = productos.find(p => p.codigoBarras === q || p.sku === q.padStart(4, "0"))
    if (!exact) {
      addToast({ kind: "err", msg: `Código no encontrado: ${q}` })
      return
    }
    const stock = exact.stock[suc] ?? 0
    if (stock <= 0) {
      addToast({ kind: "warn", msg: `Sin stock: ${exact.name} en ${suc}` })
      return
    }
    handleProductoClick(exact)
  }

  // ── Agregar al carrito ──────────────────────────────────
  const addToCartWithPres = (p, pres) => {
    const esMayoreo = pres?.esMayoreo ?? false
    const precio    = pres ? pres.precio : p.precio
    const factor    = pres ? (pres.factor ?? 1) : (p.piezasPorUnidad ?? 1)
    const label     = pres ? (pres.presLabel ?? pres.label) : (p.unidad || "Pieza")
    const presId    = pres ? pres.id + (esMayoreo ? "_may" : "") : "pieza"
    const key       = p.sku + "__" + presId

    setCart(c => {
      const ex = c.find(it => it.key === key)
      if (ex) return c.map(it => it.key === key ? { ...it, qty: it.qty + 1 } : it)
      return [...c, {
        key, sku: p.sku, name: p.name,
        presId, presLabel: label, precio, factor,
        nivel: pres?.nivel ?? "pieza",
        facturable: p.facturable !== false,
        esMayoreo,
        qty: 1,
      }]
    })

    // Crear borrador al agregar el primer producto
    if (!borradorId && !creatingRef.current) {
      creatingRef.current = true
      crearBorrador({ sucursal: suc, vendedor: user?.name ?? "" })
        .then(r => { setBorradorId(r.id); setFolio(r.folio) })
        .catch(() => addToast({ kind: "warn", msg: "Sin conexión — folio se generará al enviar" }))
        .finally(() => { creatingRef.current = false })
    }
  }

  const handleProductoClick = (p) => {
    if ((p.stock[suc] ?? 0) <= 0) {
      addToast({ kind: "warn", msg: `Sin stock: ${p.name} en ${suc}` })
      return
    }
    const pres = (p.presentaciones || [])
    if (pres.length === 0) {
      // Sin presentaciones configuradas: usar precio legacy
      addToCartWithPres(p, null)
      return
    }
    if (pres.length === 1) {
      checkAndAdd(p, pres[0])
    } else {
      setPresModal(p)
    }
  }

  const handlePresSelect = (pres) => {
    if (!presModal) return
    setPresModal(null)
    checkAndAdd(presModal, pres)
  }

  // Verifica stock y activa "abrir caja" si es necesario
  const checkAndAdd = (p, pres) => {
    const niveles   = p.stockNiveles?.[suc] ?? {}
    const paqDisp   = niveles.paq   ?? 0
    const piezaDisp = niveles.pieza ?? 0
    const cajasDisp = niveles.caja  ?? 0
    const stockBase = p.stock[suc]  ?? 0

    // Descontar lo que ya está en el carrito para esta presentación
    const enCarrito = cart
      .filter(it => it.sku === p.sku && it.presId === pres.id)
      .reduce((s, it) => s + it.qty, 0)

    // Nivel "paquete" O gramo con factor ≥ 1000 (bolsas 1kg en productos sin migrar)
    const esPaqLevel = pres.nivel === "paquete" ||
      (pres.nivel === "gramo" && pres.factor >= 1000 && pres.id !== "detalle")

    if (esPaqLevel) {
      const factor = pres.factor ?? 1
      // baseStock es la fuente de verdad (incluye cajas cerradas); StockNiveles puede estar desincronizado
      const totalDisp = stockBase > 0
        ? Math.floor(stockBase / factor) - enCarrito
        : paqDisp + Math.floor(piezaDisp / factor) - enCarrito

      if (totalDisp <= 0) {
        addToast({ kind: "warn", msg: `Sin stock: ${p.name} en ${suc}` })
        return
      }
      // Sin paq sueltos pero hay caja/bulto cerrado → preguntar antes de agregar
      if (paqDisp === 0 && cajasDisp > 0) {
        const cajaLevel = (p.presentaciones || []).find(x => x.nivel === "caja" || x.nivel === "bulto")
        if (cajaLevel) { setCajaModal({ producto: p, pres, cajaLevel }); return }
      }
      // Primera vez que se cruza el límite de paq sueltos → avisar que hay que abrir caja/bulto
      if (paqDisp > 0 && enCarrito === paqDisp) {
        addToast({ kind: "warn", msg: `📦 Paq sueltos agotados — necesitas abrir una caja de ${p.name}` })
      }
      addToCartWithPres(p, pres)
      return
    }

    if (pres.nivel === "caja" || pres.nivel === "bulto") {
      if (cajasDisp - enCarrito <= 0) {
        addToast({ kind: "warn", msg: `Sin cajas disponibles: ${p.name} en ${suc}` })
        return
      }
    } else {
      if (stockBase - enCarrito <= 0) {
        addToast({ kind: "warn", msg: `Sin stock: ${p.name} en ${suc}` })
        return
      }
    }

    addToCartWithPres(p, pres)
  }

  const confirmarAbrirCaja = async () => {
    if (!cajaModal) return
    const { producto, pres, cajaLevel } = cajaModal
    setCajaModal(null)
    try {
      const paqFactor = pres.factor ?? 1
      const result = await postAbrirCaja({
        producto_codigo: parseInt(producto.sku, 10),
        sucursal: suc,
        cajaFactor: cajaLevel.factor,
        paqFactor,
      })
      // Actualizar stock local — decrementar caja, incrementar paq
      setProductos(prev => prev.map(p => {
        if (p.sku !== producto.sku) return p
        const niveles = { ...(p.stockNiveles ?? {}), }
        const n = { ...(niveles[suc] ?? {}) }
        n.caja = Math.max(0, (n.caja ?? 0) - 1)
        n.paq  = (n.paq ?? 0) + (result.paqsNuevos ?? 0)
        return { ...p, stockNiveles: { ...niveles, [suc]: n } }
      }))
      addToast({ kind: "ok", msg: `Caja abierta → ${result.paqsNuevos} paquetes disponibles` })
    } catch (err) {
      addToast({ kind: "err", msg: `Error al abrir caja: ${err.message}` })
      return
    }
    addToCartWithPres(producto, pres)
  }

  const setQty = (key, qty) => {
    if (qty <= 0) setCart(c => c.filter(it => it.key !== key))
    else setCart(c => c.map(it => it.key === key ? { ...it, qty } : it))
  }

  const incrementQty = (key) => {
    const item = cart.find(it => it.key === key)
    if (!item) return
    if (item.nivel === "paquete") {
      const p = productos.find(pr => pr.sku === item.sku)
      if (p) {
        const niveles   = p.stockNiveles?.[suc] ?? {}
        const paqDisp   = niveles.paq ?? 0
        const stockBase = p.stock?.[suc] ?? 0
        const factor    = item.factor ?? 1
        const totalDisp = stockBase > 0
          ? Math.floor(stockBase / factor) - item.qty
          : (paqDisp + (niveles.pieza ?? 0)) - item.qty
        if (totalDisp <= 0) {
          addToast({ kind: "warn", msg: `Sin stock: ${item.name} en ${suc}` })
          return
        }
        if (paqDisp > 0 && item.qty === paqDisp) {
          addToast({ kind: "warn", msg: `📦 Paq sueltos agotados — necesitas abrir una caja de ${item.name}` })
        }
      }
    }
    setQty(key, item.qty + 1)
  }

  const subtotalFact   = cart.filter(it => it.facturable).reduce((s, it) => s + it.precio * it.qty, 0)
  const subtotalNoFact = cart.filter(it => !it.facturable).reduce((s, it) => s + it.precio * it.qty, 0)
  const subtotal = subtotalFact + subtotalNoFact
  const iva      = subtotalFact * 0.16
  const total    = subtotal + iva

  const handleCambiarPres = (nuevaPres) => {
    if (!preciosModal) return
    const { item, producto } = preciosModal
    setPreciosModal(null)
    // Quitar el ítem actual del carrito y agregar con la nueva presentación
    setCart(c => c.filter(it => it.key !== item.key))
    // Necesitamos qty actual antes de borrar
    const qty = item.qty
    const esMayoreo = nuevaPres?.esMayoreo ?? false
    const precio    = nuevaPres.precio
    const factor    = nuevaPres.factor ?? 1
    const label     = nuevaPres.presLabel ?? nuevaPres.label
    const presId    = nuevaPres.id + (esMayoreo ? "_may" : "")
    const key       = producto.sku + "__" + presId
    setCart(c => {
      const ex = c.find(it => it.key === key)
      if (ex) return c.map(it => it.key === key ? { ...it, qty: it.qty + qty } : it)
      return [...c, {
        key, sku: producto.sku, name: producto.name,
        presId, presLabel: label, precio, factor,
        facturable: producto.facturable !== false,
        esMayoreo, qty,
      }]
    })
  }

  const resetVenta = useCallback(() => {
    if (borradorId) cancelarBorrador(borradorId).catch(() => {})
    sessionStorage.removeItem(`elt_draft_${user?.email ?? "guest"}`)
    setBorradorId(null)
    creatingRef.current = false
    setCart([]); setStep(0); setFolio(null); setNotaEnviada(null)
    setFolioImpreso(false)
    setCliente("Mostrador")
    setSearch(""); setCat("all")
    getCatalogo().then(setProductos).catch(() => {})
  }, [borradorId, user?.email])

  const itemsPayload = () => cart.map(it => ({
    sku: it.sku, name: it.name, nombre: it.name,
    presId: it.presId, presLabel: it.presLabel,
    precio: it.precio, factor: it.factor,
    nivel: it.nivel ?? "pieza",
    facturable: it.facturable, qty: it.qty,
  }))

  const enviarACaja = async () => {
    setSaving(true)
    try {
      let resultFolio, resultId
      if (borradorId) {
        await confirmarNota(borradorId, {
          cliente, vendedor: user?.name ?? "Vendedor",
          items: itemsPayload(), pagos: [], subtotal, iva, total,
        })
        resultFolio = folio
        resultId    = borradorId
      } else {
        const r = await postNota({
          fecha: todayISO(), cliente,
          vendedor: user?.name ?? "Vendedor", sucursal: suc,
          items: itemsPayload(), pagos: [], subtotal, iva, total,
        })
        resultFolio = r.folio
        resultId    = r.id
      }
      sessionStorage.removeItem(`elt_draft_${user?.email ?? "guest"}`)
      setBorradorId(null)
      setNotaEnviada({ folio: resultFolio, id: resultId })
      setStep(2)
      addToast({ kind: "ok", msg: `Nota ${resultFolio} enviada a Caja` })
    } catch (err) {
      addToast({ kind: "err", msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  // ── STEP 2: Confirmación ─────────────────────────────
  if (step === 2 && notaEnviada) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: 0, paddingLeft: 12, paddingRight: 12 }}>
        {createPortal(
          <div className="print-folio-only">
            <span className="pf-empresa">"EL TIANGUIS"</span>
            <span className="pf-sep">--------------------</span>
            <span className="pf-folio">{notaEnviada.folio}</span>
            <FolioBarcode value={notaEnviada.folio} />
            <span className="pf-sep">--------------------</span>
            <span className="pf-subtitulo">Recibido en caja</span>
          </div>,
          document.body
        )}
        <Stepper steps={STEPS} current={2} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ maxWidth: 480, width: "100%", textAlign: "center", padding: 0 }}>
            <div className="card-body" style={{ padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ok)", marginBottom: 16 }}>Nota enviada a Caja</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>
                El cajero puede buscarla por folio o recibirla automáticamente.
              </div>
              <div style={{ background: "var(--bg-sunken)", borderRadius: 8, padding: "20px 32px", marginBottom: 28 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Folio</div>
                <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--wine-700)", letterSpacing: 2 }}>
                  {notaEnviada.folio}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                {!folioImpreso ? (
                  <button className="btn btn-wine" onClick={async () => {
                    try {
                      await printFolio(notaEnviada.folio, localStorage.getItem("elt_printer") || undefined)
                      addToast({ kind: "ok", msg: "Folio enviado a impresora" })
                    } catch (e) {
                      addToast({ kind: "err", msg: `Error al imprimir: ${e.message}` })
                    }
                    setFolioImpreso(true)
                  }}><Icon name="print" size={13} /> Imprimir folio</button>
                ) : (
                  <button className="btn btn-wine" onClick={resetVenta}>
                    <Icon name="plus" size={13} /> Nueva venta
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 1: Verificar pedido ─────────────────────────
  if (step === 1) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: 0, paddingLeft: 12, paddingRight: 12 }}>
        <Stepper steps={STEPS} current={1} />
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
            {cart.map((it, i) => (
              <div key={i} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ height: 80, background: "var(--bg-sunken)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>
                  📦
                </div>
                <div className="card-body" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{it.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                    {it.presLabel}
                    {!it.facturable && <span style={{ marginLeft: 6, color: "var(--warn)" }}>Sin factura</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" style={{ padding: "0 8px" }} onClick={() => setQty(it.key, it.qty - 1)}>−</button>
                      <span style={{ minWidth: 28, textAlign: "center", fontWeight: 600 }}>{it.qty}</span>
                      <button className="btn btn-ghost btn-sm" style={{ padding: "0 8px" }} onClick={() => incrementQty(it.key)}>+</button>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fmtMoney(it.precio * it.qty)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ position: "sticky", bottom: 0 }}>
            <div className="card-body" style={{ padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Cliente</label>
                <select value={cliente} onChange={e => setCliente(e.target.value)} style={{ flex: 1 }}>
                  <option value="Mostrador">Mostrador</option>
                  {clientes.map(c => <option key={c.Id} value={c.Nombre}>{c.Nombre}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {cart.reduce((s, it) => s + it.qty, 0)} artículos · {cart.length} líneas
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800 }}>{fmtMoney(total)}</div>
                  <button className="btn btn-default" onClick={() => setStep(0)}><Icon name="chevronLeft" size={13} /> Editar carrito</button>
                  <button className="btn btn-wine" onClick={enviarACaja} disabled={saving}>
                    <Icon name="check" size={13} /> {saving ? "Enviando…" : "Enviar a Caja"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 0: Llenar carrito ───────────────────────────
  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: 0, paddingLeft: 12, paddingRight: 12 }}>
      <Stepper steps={STEPS} current={0} />

      {/* Modales */}
      {presModal && (
        <PresModal
          producto={presModal} suc={suc} cart={cart}
          onSelect={handlePresSelect}
          onClose={() => setPresModal(null)}
        />
      )}
      {cajaModal && (
        <AbrirCajaModal
          producto={cajaModal.producto}
          cajaLevel={cajaModal.cajaLevel}
          paqLabel={cajaModal.pres.label}
          onConfirm={confirmarAbrirCaja}
          onCancel={() => setCajaModal(null)}
        />
      )}
      {preciosModal && (
        <CartItemPreciosModal
          item={preciosModal.item}
          producto={preciosModal.producto}
          suc={suc}
          onCambiar={handleCambiarPres}
          onClose={() => setPreciosModal(null)}
        />
      )}

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
            <div className="search-input" style={{ flex: 1, maxWidth: 400, position: "relative" }}>
              <Icon name="search" size={14} className="icon" />
              <input
                ref={searchRef}
                placeholder="Buscar por nombre, código o escanear…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearchEnter()}
              />
              <span title="Listo para escáner" style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                fontSize: 16, opacity: 0.35, pointerEvents: "none", userSelect: "none",
              }}>⌖</span>
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
                const pres = p.presentaciones || []
                // Mostrar precio base (primera presentación activa con precio > 0)
                const precioMostrar = pres.length > 0
                  ? (pres.find(x => x.precio > 0)?.precio ?? 0)
                  : p.precio
                const presLabels = pres.length > 0
                  ? pres.map(x => x.label).join(" · ")
                  : (p.unidad || "")
                return (
                  <button key={p.sku} className={"product-tile" + (out ? " disabled" : "")} onClick={() => !out && handleProductoClick(p)}>
                    <div className="sku">{p.sku}</div>
                    <div className="name">{p.name}</div>
                    <div className="meta">
                      <span style={{ fontSize: 10 }}>{presLabels || "—"}</span>
                      <span>{stock} pzs</span>
                    </div>
                    <div className="price">
                      {pres.length > 1
                        ? <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Desde {precioMostrar > 0 ? fmtMoney(precioMostrar) : "—"}</span>
                        : precioMostrar > 0 ? fmtMoney(precioMostrar) : <span style={{ fontSize: 11, opacity: .5 }}>Sin precio</span>
                      }
                    </div>
                    {pres.length > 1 && <div className="stock-low" style={{ color: "var(--text-muted)", fontSize: 10 }}>Toca para elegir presentación</div>}
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
                  <div key={it.key} className="cart-item">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {it.name}
                        {(() => {
                          const prod = productos.find(p => p.sku === it.sku)
                          return prod?.presentaciones?.length > 1 ? (
                            <button
                              onClick={() => setPreciosModal({ item: it, producto: prod })}
                              title="Ver precios por presentación"
                              style={{
                                background: "var(--bg-sunken)", border: "1px solid var(--border)",
                                borderRadius: 4, padding: "1px 6px", fontSize: 10, cursor: "pointer",
                                color: "var(--text-muted)", flexShrink: 0,
                              }}
                            >$ precios</button>
                          ) : null
                        })()}
                      </div>
                      <div className="sku">
                        {it.sku} · <strong>{it.presLabel}</strong>
                        {it.esMayoreo && (
                          <span style={{
                            marginLeft: 5, fontSize: 9, fontWeight: 700,
                            background: "var(--gold-500)", color: "#000",
                            borderRadius: 3, padding: "1px 5px",
                          }}>MAYOREO</span>
                        )}
                      </div>
                      <div className="line2">
                        <div className="qty-stepper">
                          <button onClick={() => setQty(it.key, it.qty - 1)}>−</button>
                          <input type="number" min="1" value={it.qty} onChange={e => setQty(it.key, parseInt(e.target.value) || 0)} />
                          <button onClick={() => incrementQty(it.key)}>+</button>
                        </div>
                        <span className="price-line">{fmtMoney(it.precio)} c/u</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <button className="remove" onClick={() => setQty(it.key, 0)}><Icon name="x" size={12} /></button>
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
            {folio && (
              <div style={{ padding: "8px 12px", background: "var(--bg-sunken)", borderRadius: 6, margin: "0 0 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Folio reservado</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: "var(--wine-700)" }}>{folio}</span>
              </div>
            )}
            <div className="cart-actions">
              <button className="btn btn-default" onClick={resetVenta} disabled={cart.length === 0} style={{ color: "var(--err)" }}>
                <Icon name="x" size={13} /> Cancelar
              </button>
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
