import { useState, useEffect } from "react"
import Icon from "../components/Icon"
import { getPerfil, cambiarContrasena } from "../api"
import { SUCURSALES } from "../data"

const MINIMO = 8

// Pantalla de la propia cuenta: los datos se ven, y lo único que cada quien
// puede cambiar por su cuenta es su contraseña. El nombre, el rol y la sucursal
// los lleva dirección en Equipo, que es lo que decide qué puede hacer cada uno.
export default function PerfilPage({ addToast, user }) {
  const [perfil, setPerfil]   = useState(null)
  const [actual, setActual]   = useState("")
  const [nueva, setNueva]     = useState("")
  const [repetir, setRepetir] = useState("")
  const [verActual, setVerActual] = useState(false)
  const [verNueva, setVerNueva]   = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { getPerfil().then(setPerfil).catch(() => setPerfil({ gestionable: false })) }, [])

  const datos = { ...(user ?? {}), ...(perfil ?? {}) }
  const sucursal = SUCURSALES.find(s => s.id === (datos.sucursalDefault || "").toLowerCase())
  const iniciales = (datos.name ?? "?").split(" ").map(p => p[0]).slice(0, 2).join("")

  const problema =
    !actual || !nueva || !repetir ? null
    : nueva.length < MINIMO      ? `La nueva contraseña debe tener al menos ${MINIMO} caracteres`
    : nueva !== repetir          ? "La nueva contraseña y su repetición no coinciden"
    : nueva === actual           ? "La nueva contraseña debe ser distinta de la actual"
    : null
  const completo = actual && nueva && repetir && !problema

  const guardar = async (e) => {
    e.preventDefault()
    if (!completo) return
    setGuardando(true)
    try {
      await cambiarContrasena({ actual, nueva })
      setActual(""); setNueva(""); setRepetir("")
      addToast({ kind: "ok", msg: "Tu contraseña quedó cambiada" })
    } catch (err) {
      addToast({ kind: "err", msg: err.message })
    } finally { setGuardando(false) }
  }

  const ojo = (ver, alternar) => (
    <button type="button" className="perfil-ojo" onClick={alternar}
      aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}>
      <Icon name={ver ? "eyeOff" : "eye"} size={15} />
    </button>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mi perfil</h1>
          <p className="page-subtitle">Tu cuenta y tu contraseña</p>
        </div>
      </div>

      <div className="perfil-grid">
        <div className="card">
          <div className="card-body">
            <div className="perfil-identidad">
              <div className="perfil-avatar">{iniciales}</div>
              <div>
                <div className="perfil-nombre">{datos.name}</div>
                <div className="muted">{datos.email}</div>
              </div>
            </div>
            <div className="perfil-datos">
              <div><span>Rol</span><strong>{datos.puesto || datos.rol || "—"}</strong></div>
              <div><span>Sucursal</span><strong>{sucursal?.name ?? (datos.sucursalDefault || "—")}</strong></div>
            </div>
            <p className="perfil-nota">
              Tu nombre, tu rol y tu sucursal los actualiza dirección. Si algo aquí no está bien, avísale.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <h2 className="perfil-titulo">Cambiar mi contraseña</h2>
            {perfil && perfil.gestionable === false ? (
              <p className="perfil-nota">
                Este panel todavía no tiene el cambio de contraseña activado. Dirección la cambia por ti.
              </p>
            ) : (
              <form className="perfil-form" onSubmit={guardar}>
                <div className="form-row">
                  <label htmlFor="actual">Contraseña actual</label>
                  <div className="perfil-campo">
                    <input id="actual" type={verActual ? "text" : "password"} autoComplete="current-password"
                      value={actual} onChange={e => setActual(e.target.value)} />
                    {ojo(verActual, () => setVerActual(v => !v))}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="nueva">Contraseña nueva</label>
                  <div className="perfil-campo">
                    <input id="nueva" type={verNueva ? "text" : "password"} autoComplete="new-password"
                      value={nueva} onChange={e => setNueva(e.target.value)} placeholder={`Al menos ${MINIMO} caracteres`} />
                    {ojo(verNueva, () => setVerNueva(v => !v))}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="repetir">Repite la contraseña nueva</label>
                  <input id="repetir" type={verNueva ? "text" : "password"} autoComplete="new-password"
                    value={repetir} onChange={e => setRepetir(e.target.value)} />
                </div>

                {problema && <div className="perfil-aviso"><Icon name="alert" size={13} /> {problema}</div>}

                <button type="submit" className="btn btn-wine" disabled={!completo || guardando}>
                  <Icon name="check" size={13} /> {guardando ? "Cambiando…" : "Cambiar contraseña"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
