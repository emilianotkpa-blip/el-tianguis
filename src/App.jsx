import { useState, useEffect } from "react"
import Icon from "./components/Icon"
import Toast from "./components/Toast"
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
import { NOTIFICATIONS } from "./data"
import logoUrl from "./assets/logo.jpeg"

const NAV = [
  { section: "Operación" },
  { id: "ventas",            label: "Ventas",           icon: "cart" },
  { id: "productos",         label: "Productos",        icon: "box" },
  { id: "facturas",          label: "Facturas",         icon: "receipt" },
  { section: "Logística" },
  { id: "pedidos-mercancia", label: "Pedidos Mercancía",icon: "truck",    badge: "1" },
  { id: "pedidos-clientes",  label: "Pedidos Clientes", icon: "users",    badge: "2" },
  { id: "clientes",          label: "Clientes",         icon: "user" },
  { id: "inventarios",       label: "Inventarios",      icon: "warehouse", alert: 3 },
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
  const [page, setPage] = useState("ventas")
  const [notifOpen, setNotifOpen] = useState(false)
  const [toasts, setToasts] = useState([])

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
            return (
              <button
                key={item.id}
                className={"sidebar-item" + (page === item.id ? " active" : "")}
                onClick={() => setPage(item.id)}
              >
                <Icon name={item.icon} size={15} className="icon" />
                <span>{item.label}</span>
                {item.alert && <span className="badge alert">{item.alert}</span>}
                {item.badge && !item.alert && <span className="badge">{item.badge}</span>}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <span>v4.2.0</span>
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

        <div className="header-search">
          <Icon name="search" size={14} className="icon" />
          <input placeholder="Buscar productos, clientes, facturas… (Ctrl+K)" />
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
            <span className="dot"></span>
          </button>
          {notifOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setNotifOpen(false)}></div>
              <div className="notif-pop">
                <div className="notif-head">
                  <span>Notificaciones</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setNotifOpen(false)}>Marcar leídas</button>
                </div>
                <div className="notif-list">
                  {NOTIFICATIONS.map((n, i) => (
                    <div key={i} className={"notif-item " + n.type}>
                      <div className="icon-wrap">
                        <Icon name={n.type === "err" ? "alert" : n.type === "warn" ? "alert" : n.type === "ok" ? "check" : "info"} size={14} />
                      </div>
                      <div className="body">
                        <div className="title">{n.title}</div>
                        <div className="time">{n.time}</div>
                      </div>
                    </div>
                  ))}
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
        {renderPage()}
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
