import { useState, useEffect } from "react"
import Icon from "./Icon"
import { getEquipoLista } from "../api"
import { nivelDe } from "../../shared/roles"

// Solo para admin: mirar el panel con los ojos de otra cuenta, para comprobar
// qué ve cada quien sin pedirle su contraseña a nadie. Es una vista, no un
// cambio de sesión: el servidor sigue sabiendo quién entró de verdad, así que
// cualquier cosa que se registre queda a nombre del admin.
export default function VerComo({ usuarioReal, verComo, onElegir, onCerrar }) {
  const [equipo, setEquipo] = useState(null)
  const [error, setError]   = useState(null)

  useEffect(() => {
    getEquipoLista()
      .then(lista => setEquipo(lista.filter(u => u.nombre && u.nombre !== usuarioReal?.name)))
      .catch(err => setError(err.message))
  }, [usuarioReal?.name])

  return (
    <>
      <div className="vercomo-telon" onClick={onCerrar} />
      <div className="vercomo-caja">
        <div className="vercomo-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="eye" size={17} style={{ color: "var(--gold-500)" }} />
            <h3>Ver el panel como…</h3>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onCerrar}>✕</button>
        </div>

        <p className="vercomo-nota">
          Verás exactamente las pantallas y los datos que ve esa persona. No cambia tu sesión:
          lo que registres sigue quedando a tu nombre.
        </p>

        {error && <div className="vercomo-vacio">No se pudo leer el equipo: {error}</div>}
        {!equipo && !error && <div className="vercomo-vacio">Cargando equipo…</div>}
        {equipo?.length === 0 && <div className="vercomo-vacio">No hay nadie más activo en Equipo.</div>}

        <div className="vercomo-lista">
          {(equipo ?? []).map(u => {
            const activo = verComo?.name === u.nombre
            return (
              <button key={u.nombre} className={"vercomo-item" + (activo ? " activo" : "")}
                onClick={() => onElegir({ name: u.nombre, rol: u.rol, puesto: u.rol })}>
                <span className="vercomo-avatar">
                  {u.nombre.split(" ").map(p => p[0]).slice(0, 2).join("")}
                </span>
                <span className="vercomo-datos">
                  <strong>{u.nombre}</strong>
                  <small>{u.rol || "Sin rol"} · nivel {nivelDe(u.rol)}</small>
                </span>
                {activo && <Icon name="check" size={14} />}
              </button>
            )
          })}
        </div>

        {verComo && (
          <button className="btn btn-default vercomo-volver" onClick={() => onElegir(null)}>
            <Icon name="chevronLeft" size={13} /> Volver a mi cuenta
          </button>
        )}
      </div>
    </>
  )
}
