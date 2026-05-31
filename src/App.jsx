import { useState, useEffect, useRef } from "react"
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
import { getStats, getAlertas } from "./api"
import logoUrl from "./assets/logo.jpeg"

const NAV = [
  { section: "Operación" },
  { id: "ventas",            label: "Ventas",           icon: "cart" },
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
  productos:         { title: "Productos",        parent: "Operación" },
  facturas:          { title: "Facturas",         parent: "Operación" },
  "pedidos-mercancia": { title: "Pedidos Mercancía", parent: "Logística" },
  "pedidos-clientes":  { title: "Pedidos Clientes",  parent: "Logística" },
  clientes:          { title: "Clientes",          parent: "Logística" },
  inventarios:       { title: "Inventarios",       parent: "Logística" },
  utilidades:        { title: "Utilidades",       parent: "Reportes" },
  ia:                { title: "Tianguis IA",      parent: "Inteligencia" },
}

function AppShell({ user, onLogout, theme, setTheme }) {
  const [page, setPage]         = useState("ventas")
  const [notifOpen, setNotifOpen] = useState(false)
  const [toasts, setToasts]     = useState([])
  const [stats, setStats]       = useState({ alertasStock: 0, pedidosPendientes: 0 })
  const [alertas, setAlertas]   = useState([])
  const [globalSearch, setGlobalSearch] = useState("")
  const searchRef = useRef(null)

  useEffect(() => {
    getStats().then(setStats).catch(() => {})
    getAlertas().then(setAlertas).catch(() => {})
  }, [])

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
      case "ventas":             return <VentasPage addToast={addToast} />
      case "productos":          return <ProductosPage addToast={addToast} />
      case "facturas":           return <FacturasPage addToast={addToast} />
      case "pedidos-mercancia":  return <PedidosMercanciaPage addToast={addToast} />
      case "pedidos-clientes":   return <PedidosClientesPage addToast={addToast} />
      case "clientes":           return <ClientesPage addToast={addToast} />
      case "inventarios":        return <InventariosPage addToast={addToast} />
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

        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            if (item.section) return <div key={i} className="sidebar-section">{item.section}</div>
            const dynBadge = item.id === "pedidos-clientes" ? stats.pedidosPendientes
                           : item.id === "inventarios"      ? stats.alertasStock
                           : 0
            return (
              <button
                key={item.id}
                className={"sidebar-item" + (page === item.id ? " active" : "")}
                onClick={() => setPage(item.id)}
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
                    onMouseDown={() => { setPage(r.page); setGlobalSearch("") }}
                  >
                    {r.label}
                  </div>
                ))
              }
            </div>
          )}
        </div>

        <div className="header-actions" style={{ position: "relative" }}>
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
          <button className="header-icon-btn" title="Configuración"><Icon name="settings" size={16} /></button>
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
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("elt_user")) } catch { return null }
  })
  const [theme, setTheme] = useState("light")

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

  const handleLogin = (u) => setUser(u)
  const handleLogout = () => {
    sessionStorage.removeItem("elt_token")
    sessionStorage.removeItem("elt_user")
    setUser(null)
  }

  if (!user) return <Login onLogin={handleLogin} />
  return <AppShell user={user} onLogout={handleLogout} theme={theme} setTheme={setTheme} />
}
