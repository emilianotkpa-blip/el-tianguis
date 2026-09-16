import { useState } from "react"
import Icon from "../components/Icon"
import LogoAnimado from "../components/LogoAnimado"
import { postLogin } from "../api"
import logoSvg from "../assets/logo.svg"

// Una sola tarjeta al centro y nada más. Antes había un panel con cifras del
// negocio (sucursales, productos, ventas del mes) a la vista de cualquiera
// que abriera la página sin haber entrado.
export default function Login({ onLogin }) {
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [showPwd, setShowPwd]   = useState(false)
  const [error, setError]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [touched, setTouched]   = useState({ email: false, password: false })

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
      {/* El propio logo, muy ampliado y desenfocado: pone el color de la marca
          sin decir nada ni competir con el formulario */}
      <img src={logoSvg} alt="" aria-hidden="true" className="login-fondo" />
      <div className="login-velo" aria-hidden="true" />

      <main className="login-card">
        <div className="login-logo">
          <LogoAnimado size={150} animar={false} />
        </div>
        <h2>Iniciar sesión</h2>

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

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Verificando…" : "Ingresar"}
          </button>
        </form>
      </main>
    </div>
  )
}
