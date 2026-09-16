import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import Icon from "../components/Icon"
import Stepper from "../components/Stepper"
import PresPicker from "../components/PresPicker"
import { TilesSkeleton } from "../components/Skeleton"
import Select from "../components/Select"
import { SUCURSALES, TIPOS_CONFIG } from "../data"
import { getCatalogo, postNota, crearBorrador, confirmarNota, cancelarBorrador, getClientes, postAbrirCaja, printFolio, getPromos } from "../api"
import { fmtMoney, todayISO, tipoLabel } from "../utils"
import { evaluarPromos } from "../promos"

const STEPS = ["Llenar carrito", "Verificar pedido", "Enviar a caja"]

function FolioBarcode({ value }) {
  if (!value) return null
  return <span className="pf-barcode">{value}</span>
}


export default function VentasPage({ addToast, user, sucursalActiva, preloadedCatalogo, preloadedClientes, sharedCart, clearSharedCart, onIrACaja }) {
  const [step, setStep]           = useState(0)
  // El IVA ya no se suma solo: se decide en cada venta y arranca apagado
  const [conIva, setConIva]       = useState(false)
  const [promos, setPromos]       = useState([])
  // En pantalla chica la nota vive abajo como hoja: esto la despliega
  const [notaAbierta, setNotaAbierta] = useState(false)
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

  useEffect(() => { getPromos().then(setPromos).catch(() => setPromos([])) }, [])

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
    return [
      { id: "all", name: "Todos" },
      // Nombre legible del tipo ("Rollos alta densidad"), no el id interno
      ...[...set]
        .map(t => ({ id: t, name: tipoLabel(t, TIPOS_CONFIG) }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    ]
  }, [productos])

  const sucObj = SUCURSALES.find(s => s.id === suc)

  const filtered = useMemo(() =>
    productos.filter(p => {
      if (cat !== "all" && p.tipo !== cat) return false
      if (search) {
        const q   = search.toLowerCase()
        const raw = search.trim()
        const matchName        = (p.name ?? "").toLowerCase().includes(q)
        const matchSku         = (p.sku ?? "").includes(raw)
        const matchBarcode     = p.codigoBarras && p.codigoBarras === raw
        const matchPresBarcode = Array.isArray(p.presentaciones) && p.presentaciones.some(pr => pr.codigoBarras && pr.codigoBarras === raw)
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
      const presMatch = Array.isArray(p.presentaciones) && p.presentaciones.find(pr => pr.codigoBarras && pr.codigoBarras === q)
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
  // Señal visual de que el producto entró a la nota (el cajero mira el
  // producto, no el panel: el destello es lo que le confirma el registro)
  const [cartPulse, setCartPulse] = useState(false)
  const pulseCart = () => {
    setCartPulse(false)
    requestAnimationFrame(() => setCartPulse(true))
    setTimeout(() => setCartPulse(false), 450)
  }

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
    pulseCart()
    setNotaAbierta(true)

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
  const subtotalBruto  = subtotalFact + subtotalNoFact
  // Reglas de precio: el ahorro se muestra aparte, no se toca el precio de
  // cada línea, y el IVA se calcula ya con el descuento aplicado
  const promo     = useMemo(() => evaluarPromos(cart, promos), [cart, promos])
  const subtotal  = subtotalBruto - promo.total
  const baseIva   = Math.max(0, subtotalFact - promo.totalFacturable)
  const iva       = conIva ? baseIva * 0.16 : 0
  const total     = subtotal + iva

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
        nivel: nuevaPres?.nivel ?? "pieza",
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
    setConIva(false)
    setSearch(""); setCat("all")
    getCatalogo().then(setProductos).catch(() => {})
  }, [borradorId, user?.email])

  // Los descuentos viajan como líneas propias de la nota: Caja no los
  // recalcula, los cobra tal como se acordaron con el cliente
  const promosPayload = () => promo.descuentos.map(d => ({
    tipo: "descuento", reglaId: d.reglaId, nombre: d.nombre,
    veces: d.veces, monto: d.monto, facturable: d.facturable,
  }))

  const itemsPayload = () => cart.map(it => ({
    sku: it.sku, name: it.name, nombre: it.name,
    presId: it.presId, presLabel: it.presLabel,
    precio: it.precio, factor: it.factor,
    nivel: it.nivel ?? "pieza",
    facturable: it.facturable, qty: it.qty,
    iva: conIva && it.facturable !== false,
  }))

  const enviarACaja = async () => {
    setSaving(true)
    try {
      let resultFolio, resultId
      if (borradorId) {
        await confirmarNota(borradorId, {
          cliente, vendedor: user?.name ?? "Vendedor",
          items: [...itemsPayload(), ...promosPayload()], pagos: [], subtotal, iva, total,
        })
        resultFolio = folio
        resultId    = borradorId
      } else {
        const r = await postNota({
          fecha: todayISO(), cliente,
          vendedor: user?.name ?? "Vendedor", sucursal: suc,
          items: [...itemsPayload(), ...promosPayload()], pagos: [], subtotal, iva, total,
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

  // ── Enter avanza el flujo (teclado de PC/laptop) ─────
  // Tres Enter seguidos: verificar → enviar a caja → imprimir folio.
  const imprimirFolio = async () => {
    try {
      await printFolio(notaEnviada.folio, localStorage.getItem("elt_printer") || undefined)
      addToast({ kind: "ok", msg: "Folio enviado a impresora" })
    } catch (e) {
      addToast({ kind: "err", msg: `Error al imprimir: ${e.message}` })
    }
    setFolioImpreso(true)
  }

  const avanzarPaso = () => {
    if (saving) return
    if (step === 0) {
      if (cart.length > 0) setStep(1)
      return
    }
    if (step === 1) { enviarACaja(); return }
    if (step === 2 && notaEnviada) {
      if (!folioImpreso) imprimirFolio()
      else resetVenta()
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Enter" || e.repeat) return
      const t = e.target
      const tag = t?.tagName
      // Los campos y los botones enfocados mandan sobre el atajo
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return
      if (t?.closest?.(".select-wrap")) return
      // Con un menú o el selector de presentación abiertos, Enter es de ellos
      if (document.querySelector(".select-menu")) return
      if (presModal) return
      e.preventDefault()
      avanzarPaso()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  })

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
                  <button className="btn btn-wine" onClick={imprimirFolio}>
                    <Icon name="print" size={13} /> Imprimir folio <kbd className="kbd">Enter</kbd>
                  </button>
                ) : (
                  <button className="btn btn-wine" onClick={resetVenta}>
                    <Icon name="plus" size={13} /> Nueva venta <kbd className="kbd">Enter</kbd>
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
                <Select
                  value={cliente}
                  onChange={e => setCliente(e.target.value)}
                  style={{ flex: 1 }}
                  ariaLabel="Cliente de la nota"
                  options={[
                    { value: "Mostrador", label: "Mostrador" },
                    ...clientes.map(c => ({ value: c.Nombre, label: c.Nombre })),
                  ]}
                />
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
                    {!saving && <kbd className="kbd">Enter</kbd>}
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
        <PresPicker
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
            <Select
              value={suc}
              onChange={e => setSuc(e.target.value)}
              className="select-plano"
              ariaLabel="Sucursal"
              options={SUCURSALES.map(x => ({ value: x.id, label: x.name }))}
            />
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
                onKeyDown={e => {
                  if (e.key !== "Enter") return
                  // El escáner siempre manda texto: solo el campo vacío avanza
                  if (search.trim()) handleSearchEnter()
                  else avanzarPaso()
                }}
              />
              <span title="Listo para escáner" style={{
                position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)",
                opacity: 0.4, pointerEvents: "none", display: "flex",
              }}><Icon name="barcode" size={15} /></span>
            </div>
          </div>
          <div className="cart-cat-tabs">
            {tipos.map(t => (
              <button key={t.id} className={"cat-pill" + (cat === t.id ? " active" : "")} onClick={() => setCat(t.id)}>{t.name}</button>
            ))}
          </div>
          <div className="products-grid">
            {loading
              ? <TilesSkeleton count={8} />
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

        <div className={"sales-cart" + (notaAbierta ? " abierta" : "")}>
          <div className={"cart-card" + (cartPulse ? " pulse" : "")}>
            <div className="cart-header" onClick={() => setNotaAbierta(v => !v)}>
              <h3>Nota actual</h3>
              {/* En pantalla chica la hoja va colapsada: el total tiene que
                  verse sin abrirla, que es lo único que el cajero necesita */}
              <span className="cart-total-movil">{fmtMoney(total)}</span>
              <span className={"count" + (cartPulse ? " bump" : "")}>{cart.reduce((s, it) => s + it.qty, 0)} arts.</span>
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
              {promo.descuentos.map(d => (
                <div className="row promo-row" key={d.reglaId}>
                  <span><Icon name="sparkle" size={11} /> {d.nombre}{d.veces > 1 ? ` ×${d.veces}` : ""}</span>
                  <span className="num">−{fmtMoney(d.monto)}</span>
                </div>
              ))}
              <div className="row"><span>Subtotal</span><span className="num">{fmtMoney(subtotal)}</span></div>
              <label className="iva-toggle">
                <input type="checkbox" checked={conIva} onChange={e => setConIva(e.target.checked)} />
                <span>Para facturar</span>
                <span className={"num" + (conIva ? " on" : "")}>{fmtMoney(iva)}</span>
              </label>
              <div className="row total"><span>Total</span><span key={total} className="num flash">{fmtMoney(total)}</span></div>
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
Verificar pedido <kbd className="kbd">Enter</kbd> <Icon name="chevronRight" size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
