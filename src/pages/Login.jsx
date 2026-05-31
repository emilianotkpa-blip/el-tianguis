import { useState, useEffect } from "react"
import Icon from "../components/Icon"
import { postLogin } from "../api"
import { fmtMoney } from "../utils"
import logoUrl from "../assets/logo.jpeg"

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [showPwd, setShowPwd]   = useState(false)
  const [error, setError]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [touched, setTouched]   = useState({ email: false, password: false })
  const [stats, setStats]       = useState({ numProductos: "…", totalVentasMes: null })

  useEffect(() => {
    fetch("/api/stats-publicas").then((r) => r.json()).then(setStats).catch(() => {})
  }, [])

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const isPwdValid   = password.length >= 6

  const handleSubmit = async (e) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    if (!isEmailValid || !isPwdValid) {
      setError("Verifica que el correo y la contraseña sean correctos.")
      return
    }
    setError("")
    setLoading(true)
    try {
      const result = await postLogin({ email: email.trim().toLowerCase(), password })
      sessionStorage.setItem("elt_token", result.token)
      sessionStorage.setItem("elt_user", JSON.stringify(result.user))
      onLogin(result.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <aside className="login-hero">
        <div className="login-brandmark">
          <img src={logoUrl} alt="El Tianguis" className="logo-img-full" />
        </div>

        <div className="login-hero-content">
          <div className="eyebrow">Sistema Administrativo · v4.2</div>
          <h1>Tu negocio bajo control, en tiempo real.</h1>
          <p>Gestiona ventas, inventarios, pedidos y utilidades de tus tres sucursales desde un solo lugar. Diseñado para mayoristas de bolsas, vasos y desechables.</p>
        </div>

        <div className="login-hero-stats">
          <div>
            <div className="stat-num">3</div>
            <div className="stat-label">Sucursales</div>
          </div>
          <div>
            <div className="stat-num">{stats.numProductos}</div>
            <div className="stat-label">Productos</div>
          </div>
          <div>
            <div className="stat-num">{stats.totalVentasMes != null ? fmtMoney(stats.totalVentasMes) : "…"}</div>
            <div className="stat-label">Ventas este mes</div>
          </div>
        </div>
      </aside>

      <main className="login-panel">
        <h2>Iniciar sesión</h2>
        <p className="login-subtitle">Ingresa tus credenciales para acceder al panel.</p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="login-error">
              <Icon name="alert" size={14} /> &nbsp; {error}
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="tucorreo@eltianguis.mx"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              className={touched.email && !isEmailValid ? "invalid" : ""}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                className={touched.password && !isPwdValid ? "invalid" : ""}
                style={{ width: "100%", paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "transparent", border: 0, color: "var(--text-muted)",
                  width: 28, height: 28, borderRadius: 4, display: "grid", placeItems: "center"
                }}
                aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                <Icon name={showPwd ? "eyeOff" : "eye"} size={15} />
              </button>
            </div>
          </div>

          <div className="login-row">
            <label className="checkbox-line">
              <input type="checkbox" defaultChecked />
              Recordar mi sesión
            </label>
            <a href="#" onClick={(e) => e.preventDefault()}>¿Olvidaste tu contraseña?</a>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Verificando…" : "Ingresar al panel"}
          </button>
        </form>
      </main>
    </div>
  )
}
