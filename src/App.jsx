import { useState, useEffect, useRef, useCallback } from "react"
import { SUCURSALES } from "./data"
import Icon from "./components/Icon"
import Toast from "./components/Toast"
import ErrorBoundary from "./components/ErrorBoundary"
import Login from "./pages/Login"
import VentasPage from "./pages/Ventas"
import ProductosPage from "./pages/Productos"
import FacturasPage from "./pages/Facturas"
import PedidosMercanciaPage from "./pages/PedidosMercancia"
import PedidosClientesPage from "./pages/PedidosClientes"
import InventariosPage from "./pages/Inventarios"
import UtilidadesPage from "./pages/Utilidades"
import TianguisIAPage from "./pages/TianguisIA"
import ClientesPage from "./pages/Clientes"
import CajaPage from "./pages/Caja"
import BásculaPage from "./pages/Balanza"
import { getStats, getAlertas, getCatalogo, getClientes } from "./api"
import logoUrl from "./assets/logo.jpeg"

function SplashScreen({ progress = 0, statusText = "Cargando negocio…", onDone }) {
  const [fading, setFading] = useState(false)
  const [displayPct, setDisplayPct] = useState(0)

  // Suavizar el progreso para que no salte bruscamente
  useEffect(() => {
    if (progress <= displayPct) return
    let frame
    const animate = () => {
      setDisplayPct(prev => {
        const next = Math.min(prev + 1, progress)
        if (next < progress) frame = requestAnimationFrame(animate)
        return next
      })
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [progress])

  // Cuando llega a 100, esperar un momento y hacer fade-out
  useEffect(() => {
    if (displayPct < 100) return
    const t1 = setTimeout(() => setFading(true), 300)
    const t2 = setTimeout(() => onDone(), 800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [displayPct, onDone])

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#5e1220",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 24,
        opacity: fading ? 0 : 1,
        transition: "opacity 0.5s ease",
      }}
    >
      <img
        src={logoUrl}
        alt="El Tianguis"
        style={{
          width: 110, height: 110, borderRadius: "50%",
          objectFit: "cover",
          boxShadow: "0 0 0 4px #f0bf2e, 0 8px 32px rgba(0,0,0,.5)",
          animation: "splashPulse 2s ease-in-out infinite",
        }}
      />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#f0bf2e", letterSpacing: 1 }}>
          El <span style={{ color: "#fff" }}>Tianguis</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 6, letterSpacing: 2 }}>
          {statusText.toUpperCase()}
        </div>
      </div>
      <div style={{ width: 240, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{
          width: "100%", height: 6, borderRadius: 99,
          background: "rgba(255,255,255,0.15)", overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 99,
            background: "linear-gradient(90deg, #c89417, #f0bf2e)",
            width: `${displayPct}%`,
            transition: "width 0.08s linear",
            boxShadow: "0 0 8px #f0bf2e88",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          <span>{statusText}</span>
          <span>{displayPct}%</span>
        </div>
      </div>

      <style>{`
        @keyframes splashPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 4px #f0bf2e, 0 8px 32px rgba(0,0,0,.5); }
          50%        { transform: scale(1.04); box-shadow: 0 0 0 7px #f0bf2e99, 0 12px 40px rgba(0,0,0,.6); }
        }
      `}</style>
    </div>
  )
}

const SUC_ICONS = { centro: "🏪", repostero: "🍰", bodega: "📦" }

function SucursalPicker({ user, onSelect }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "var(--bg)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 32, padding: 24,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
          Bienvenido, <strong>{user.name}</strong>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>¿Desde dónde estás trabajando hoy?</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
          Todas las ventas y cobros se registrarán en la sucursal seleccionada.
        </p>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", maxWidth: 700 }}>
        {SUCURSALES.map(s => {
          const isDefault = user.sucursalDefault === s.id
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 10, padding: "28px 32px", minWidth: 180,
                background: isDefault ? "var(--wine-800)" : "var(--bg-elev)",
                border: isDefault ? "2px solid var(--gold-500)" : "2px solid var(--border)",
                borderRadius: 14, cursor: "pointer",
                transition: "all .15s ease",
                color: isDefault ? "#fff" : "var(--text)",
              }}
              className="suc-card"
            >
              <span style={{ fontSize: 40 }}>{SUC_ICONS[s.id] ?? "🏬"}</span>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                <div style={{ fontSize: 11, opacity: .65, marginTop: 3 }}>{s.desc}</div>
              </div>
              {isDefault && (
                <span style={{
                  fontSize: 10, background: "var(--gold-500)", color: "#000",
                  borderRadius: 99, padding: "2px 8px", fontWeight: 600,
                }}>Tu sucursal</span>
              )}
            </button>
          )
        })}
      </div>

      <style>{`
        .suc-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.15); }
      `}</style>
    </div>
  )
}

const NAV = [
  { section: "Operación" },
  { id: "ventas",            label: "Ventas",           icon: "cart" },
  { id: "balanza",           label: "Báscula",          icon: "scale" },
  { id: "caja",              label: "Caja",             icon: "receipt",  rolMin: "cajero" },
  { id: "productos",         label: "Productos",        icon: "box" },
  { id: "facturas",          label: "Facturas",         icon: "receipt" },
  { section: "Logística" },
  { id: "pedidos-mercancia", label: "Pedidos Mercancía",icon: "truck" },
  { id: "pedidos-clientes",  label: "Pedidos Clientes", icon: "users" },
  { id: "clientes",          label: "Clientes",         icon: "user" },
  { id: "inventarios",       label: "Inventarios",      icon: "warehouse" },
  { section: "Reportes" },
  { id: "utilidades",        label: "Utilidades",       icon: "chart" },
  { section: "Inteligencia" },
  { id: "ia",                label: "Tianguis IA",      icon: "sparkle" },
]

const PAGE_INFO = {
  ventas:            { title: "Ventas",           parent: "Operación" },
  balanza:           { title: "Báscula",          parent: "Operación" },
  productos:         { title: "Productos",        parent: "Operación" },
  facturas:          { title: "Facturas",         parent: "Operación" },
  "pedidos-mercancia": { title: "Pedidos Mercancía", parent: "Logística" },
  "pedidos-clientes":  { title: "Pedidos Clientes",  parent: "Logística" },
  clientes:          { title: "Clientes",          parent: "Logística" },
  inventarios:       { title: "Inventarios",       parent: "Logística" },
  caja:              { title: "Caja",              parent: "Operación" },
  utilidades:        { title: "Utilidades",       parent: "Reportes" },
  ia:                { title: "Tianguis IA",      parent: "Inteligencia" },
}

function AppShell({ user, onLogout, theme, setTheme, onCambiarSucursal, preloadedData }) {
  const [page, setPage]         = useState(() => sessionStorage.getItem("elt_page") || "ventas")
  const [sharedCart, setSharedCart] = useState([])

  const navTo = (p) => { setPage(p); sessionStorage.setItem("elt_page", p) }

  const addToSharedCart = useCallback((item) => {
    setSharedCart(c => {
      const ex = c.find(it => it.key === item.key)
      if (ex) return c.map(it => it.key === item.key ? { ...it, qty: it.qty + item.qty } : it)
      return [...c, item]
    })
  }, [])
  const [notifOpen, setNotifOpen] = useState(false)
  const [toasts, setToasts]     = useState([])
  const [stats, setStats]       = useState(() => preloadedData?.stats ?? { alertasStock: 0, pedidosPendientes: 0 })
  const [alertas, setAlertas]   = useState(() => preloadedData?.alertas ?? [])
  const [notasCaja, setNotasCaja] = useState(0)
  const [globalSearch, setGlobalSearch] = useState("")
  const searchRef = useRef(null)

  useEffect(() => {
    // Si ya vienen del splash, no volvemos a fetchear al montar
    if (!preloadedData?.stats)   getStats().then(setStats).catch(() => {})
    if (!preloadedData?.alertas) getAlertas().then(setAlertas).catch(() => {})
  }, [])

  useEffect(() => {
    if (user?.rol === "vendedor") return
    const refresh = () => import("./api").then(({ getCaja }) => getCaja().then(n => setNotasCaja(n.length))).catch(() => {})
    refresh()
    const t = setInterval(refresh, 20000)
    return () => clearInterval(t)
  }, [user?.rol])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      if (e.key === "Escape") setGlobalSearch("")
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const addToast = (t) => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts, { ...t, id }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3500)
  }
  const dismissToast = (id) => setToasts((ts) => ts.filter((x) => x.id !== id))

  const renderPage = () => {
    switch (page) {
      case "ventas":             return <VentasPage addToast={addToast} user={user} sucursalActiva={user.sucursal} preloadedCatalogo={preloadedData?.catalogo} preloadedClientes={preloadedData?.clientes} sharedCart={sharedCart} clearSharedCart={() => setSharedCart([])} onIrACaja={() => setPage("caja")} />
      case "productos":          return <ProductosPage addToast={addToast} />
      case "facturas":           return <FacturasPage addToast={addToast} />
      case "pedidos-mercancia":  return <PedidosMercanciaPage addToast={addToast} />
      case "pedidos-clientes":   return <PedidosClientesPage addToast={addToast} />
      case "clientes":           return <ClientesPage addToast={addToast} />
      case "inventarios":        return <InventariosPage addToast={addToast} sucursalActiva={user.sucursal} />
      case "caja":               return <CajaPage addToast={addToast} sucursalActiva={user.sucursal} />
      case "balanza":            return <BásculaPage addToast={addToast} user={user} sucursalActiva={user.sucursal} sharedCartCount={sharedCart.length} onAddToVentas={(item) => { addToSharedCart(item); navTo("ventas") }} />
      case "utilidades":         return <UtilidadesPage />
      case "ia":                 return <TianguisIAPage />
      default:                   return <VentasPage addToast={addToast} />
    }
  }

  return (
    <div className="app">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <img src={logoUrl} alt="El Tianguis" className="sidebar-logo-img" />
          <div className="name">El <span className="gold">Tianguis</span></div>
        </div>

        {user.sucursal && (
          <button
            onClick={onCambiarSucursal}
            title="Cambiar sucursal"
            style={{
              display: "flex", alignItems: "center", gap: 8,
              margin: "0 10px 4px", padding: "7px 10px",
              background: "rgba(240,191,46,.12)", border: "1px solid rgba(240,191,46,.3)",
              borderRadius: 8, cursor: "pointer", width: "calc(100% - 20px)",
            }}
          >
            <span style={{ fontSize: 16 }}>{SUC_ICONS[user.sucursal] ?? "🏬"}</span>
            <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-500)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {SUCURSALES.find(s => s.id === user.sucursal)?.name ?? user.sucursal}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,.4)", marginTop: 1 }}>toca para cambiar</div>
            </div>
          </button>
        )}

        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            if (item.section) return <div key={i} className="sidebar-section">{item.section}</div>
            // Ocultar items que requieren rol mínimo
            if (item.rolMin === "cajero" && user?.rol === "vendedor") return null
            if (item.rolMin === "gerente" && user?.rol !== "gerente") return null
            const dynBadge = item.id === "pedidos-clientes" ? stats.pedidosPendientes
                           : item.id === "inventarios"      ? stats.alertasStock
                           : item.id === "caja"             ? notasCaja
                           : 0
            return (
              <button
                key={item.id}
                className={"sidebar-item" + (page === item.id ? " active" : "")}
                onClick={() => navTo(item.id)}
              >
                <Icon name={item.icon} size={15} className="icon" />
                <span>{item.label}</span>
                {dynBadge > 0 && item.id === "inventarios" && <span className="badge alert">{dynBadge}</span>}
                {dynBadge > 0 && item.id !== "inventarios" && <span className="badge">{dynBadge}</span>}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <span>v{__APP_VERSION__}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3fcc6e" }}></span>
            En línea
          </span>
        </div>
      </aside>

      <header className="app-header">
        <div className="breadcrumb">
          <span>{PAGE_INFO[page]?.parent}</span>
          <span className="sep">›</span>
          <span className="current">{PAGE_INFO[page]?.title}</span>
        </div>
        <div className="header-spacer"></div>

        <div className="header-search" style={{ position: "relative" }}>
          <Icon name="search" size={14} className="icon" />
          <input
            ref={searchRef}
            placeholder="Buscar… (Ctrl+K)"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
          {globalSearch && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,.15)", zIndex: 100, maxHeight: 280, overflowY: "auto" }}>
              {[
                { label: "Productos",        page: "productos",        key: "productos" },
                { label: "Clientes",          page: "clientes",         key: "clientes" },
                { label: "Inventarios",       page: "inventarios",      key: "inventarios" },
                { label: "Ventas",            page: "ventas",           key: "ventas" },
                { label: "Pedidos Clientes",  page: "pedidos-clientes", key: "pedidos-clientes" },
                { label: "Pedidos Mercancía", page: "pedidos-mercancia",key: "pedidos-mercancia" },
                { label: "Facturas",          page: "facturas",         key: "facturas" },
                { label: "Utilidades",        page: "utilidades",       key: "utilidades" },
                { label: "Tianguis IA",       page: "ia",               key: "ia" },
              ]
                .filter((r) => r.label.toLowerCase().includes(globalSearch.toLowerCase()))
                .map((r) => (
                  <div
                    key={r.key}
                    style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border)" }}
                    onMouseDown={() => { navTo(r.page); setGlobalSearch("") }}
                  >
                    {r.label}
                  </div>
                ))
              }
            </div>
          )}
        </div>

        <div className="header-actions" style={{ position: "relative" }}>
          <button className="header-icon-btn" onClick={() => window.location.reload()} title="Recargar página">
            <Icon name="refresh" size={16} />
          </button>
          <button
            className="header-icon-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
          </button>
          <button className="header-icon-btn" onClick={() => setNotifOpen(!notifOpen)} title="Notificaciones">
            <Icon name="bell" size={16} />
            {alertas.length > 0 && <span className="dot"></span>}
          </button>
          {notifOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setNotifOpen(false)}></div>
              <div className="notif-pop">
                <div className="notif-head">
                  <span>Notificaciones</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setNotifOpen(false)}>Cerrar</button>
                </div>
                <div className="notif-list">
                  {alertas.length === 0
                    ? <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Sin alertas activas</div>
                    : alertas.map((n, i) => (
                      <div key={i} className={"notif-item " + n.type}>
                        <div className="icon-wrap">
                          <Icon name={n.type === "err" || n.type === "warn" ? "alert" : n.type === "ok" ? "check" : "info"} size={14} />
                        </div>
                        <div className="body">
                          <div className="title">{n.title}</div>
                          <div className="time">{n.time}</div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }}></div>

        <div className="header-user">
          <div className="avatar">{user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div>
          <div className="who">
            <div className="name">{user.name}</div>
            <div className="role">{user.role}</div>
          </div>
        </div>
        <button className="header-icon-btn" onClick={onLogout} title="Cerrar sesión">
          <Icon name="logout" size={16} />
        </button>
      </header>

      <main className="app-main">
        <ErrorBoundary key={page} title={PAGE_INFO[page]?.title}>
          {renderPage()}
        </ErrorBoundary>
      </main>

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

export default function App() {
  const _storedUser = (() => { try { return JSON.parse(sessionStorage.getItem("elt_user")) } catch { return null } })()
  const [user, setUser]               = useState(null)
  const [pendingUser, setPendingUser] = useState(_storedUser)
  const [splash, setSplash]           = useState(!!_storedUser)
  const [splashProgress, setSplashProgress] = useState(0)
  const [splashStatus, setSplashStatus]     = useState("Conectando…")
  const [showSucPicker, setShowSucPicker]   = useState(false)
  const [theme, setTheme]             = useState(() => localStorage.getItem("elt_theme") || "light")

  // Datos precargados durante el splash
  const [preloadedData, setPreloadedData] = useState(null)

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("elt_theme", theme)
  }, [theme])

  // Cuando splash está activo, arrancar las fetches reales
  useEffect(() => {
    if (!splash) return
    let cancelled = false

    const load = async () => {
      setSplashProgress(8)
      setSplashStatus("Conectando al servidor…")
      await new Promise(r => setTimeout(r, 200))

      if (cancelled) return
      setSplashProgress(15)
      setSplashStatus("Cargando catálogo de productos…")

      const [catalogo, clientes] = await Promise.all([
        getCatalogo().then(data => {
          if (!cancelled) setSplashProgress(80)
          return data
        }).catch(() => []),
        getClientes().then(data => {
          if (!cancelled) setSplashProgress(prev => Math.max(prev, 85))
          return data
        }).catch(() => []),
      ])

      if (cancelled) return
      setSplashProgress(90)
      setSplashStatus("Cargando estadísticas…")

      const [stats, alertas] = await Promise.all([
        getStats().catch(() => ({})),
        getAlertas().catch(() => []),
      ])

      if (cancelled) return
      setSplashProgress(97)
      setSplashStatus("¡Listo!")
      setPreloadedData({ catalogo, clientes, stats, alertas })

      await new Promise(r => setTimeout(r, 150))
      if (!cancelled) setSplashProgress(100)
    }

    load()
    return () => { cancelled = true }
  }, [splash])

  const handleLogin = (u) => {
    setPendingUser(u)
    setSplashProgress(0)
    setSplashStatus("Verificando credenciales…")
    setSplash(true)
  }

  const handleSplashDone = () => {
    const u = pendingUser
    setSplash(false)
    setPendingUser(null)
    if (u?.sucursal) {
      setUser(u)
    } else {
      setShowSucPicker(true)
      setUser(u)
    }
  }

  const handleSucursalSelect = useCallback((sucId) => {
    setUser(prev => {
      const updated = { ...prev, sucursal: sucId }
      sessionStorage.setItem("elt_user", JSON.stringify(updated))
      return updated
    })
    setShowSucPicker(false)
  }, [])

  const handleLogout = () => {
    sessionStorage.removeItem("elt_token")
    sessionStorage.removeItem("elt_user")
    sessionStorage.removeItem("elt_page")
    setUser(null)
    setShowSucPicker(false)
  }

  return (
    <>
      {splash && <SplashScreen progress={splashProgress} statusText={splashStatus} onDone={handleSplashDone} />}
      {!splash && !user && <Login onLogin={handleLogin} />}
      {!splash && user && showSucPicker && (
        <SucursalPicker user={user} onSelect={handleSucursalSelect} />
      )}
      {!splash && user && !showSucPicker && (
        <AppShell
          user={user} onLogout={handleLogout}
          theme={theme} setTheme={setTheme}
          onCambiarSucursal={() => setShowSucPicker(true)}
          preloadedData={preloadedData}
        />
      )}
    </>
  )
}
