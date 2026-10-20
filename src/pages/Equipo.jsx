import { useState, useEffect } from "react"
import Icon from "../components/Icon"
import Select from "../components/Select"
import { getEquipo, editarEquipo } from "../api"
import { SUCURSALES } from "../data"
import { nivelDe, puedeElegirSucursal, necesitaSucursalAsignada } from "../../shared/roles"

// Dirección asigna aquí dónde trabaja cada quien. El rol no se toca desde el
// panel a propósito: desde aquí cualquiera con nivel de dirección podría
// ascenderse solo. Eso sigue en NocoDB.
const OPCIONES = [
  { value: "", label: "Sin asignar" },
  ...SUCURSALES.map(s => ({ value: s.id, label: s.name })),
]

export default function EquipoPage({ addToast }) {
  const [gente, setGente]     = useState([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(null)

  const cargar = () => {
    setLoading(true)
    getEquipo()
      .then(setGente)
      .catch(err => addToast({ kind: "err", msg: err.message }))
      .finally(() => setLoading(false))
  }
  useEffect(cargar, [])

  // Se pinta el cambio de inmediato y se deshace si el servidor lo rechaza:
  // en una tabla, esperar a cada guardado se siente trabado.
  const guardar = async (persona, cambios, mensaje) => {
    setGuardando(persona.id)
    const antes = { ...persona }
    setGente(g => g.map(p => p.id === persona.id ? { ...p, ...cambios } : p))
    try {
      await editarEquipo(persona.id, cambios)
      addToast({ kind: "ok", msg: mensaje })
    } catch (err) {
      setGente(g => g.map(p => p.id === persona.id ? antes : p))
      addToast({ kind: "err", msg: err.message })
    } finally { setGuardando(null) }
  }

  const cambiarSucursal = (p, sucursal) => {
    const donde = SUCURSALES.find(s => s.id === sucursal)?.name
    // Quitarle la sucursal a alguien con candado lo dejaría sin poder entrar.
    const cambios = sucursal ? { sucursal } : { sucursal: "", sucursalFija: false }
    guardar(p, cambios, sucursal ? `${p.nombre}: ${donde}` : `${p.nombre} quedó sin sucursal`)
  }

  const cambiarCandado = (p) => {
    if (!p.sucursalFija && !p.sucursal) {
      return addToast({ kind: "err", msg: "Primero elige en qué sucursal se queda" })
    }
    guardar(p, { sucursalFija: !p.sucursalFija },
      p.sucursalFija
        ? `${p.nombre} vuelve a elegir su sucursal al entrar`
        : `${p.nombre} queda fijo en ${SUCURSALES.find(s => s.id === p.sucursal)?.name}`)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Equipo</h1>
          <p className="page-subtitle">Quién es quién y desde qué sucursal trabaja</p>
        </div>
        <button className="btn btn-default btn-sm" onClick={cargar}>
          <Icon name="refresh" size={13} /> Actualizar
        </button>
      </div>

      <div className="card">
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th><th>Rol</th><th>Sucursal</th><th style={{ width: 150 }}>¿Puede cambiarla?</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="muted" style={{ padding: 20 }}>Cargando…</td></tr>}
              {!loading && gente.length === 0 && (
                <tr><td colSpan={4} className="muted" style={{ padding: 20 }}>No hay nadie dado de alta.</td></tr>
              )}
              {gente.map(p => {
                const nivel = nivelDe(p.rol)
                const puedeElegirPorNivel = puedeElegirSucursal({ rol: p.rol })
                const fijaPorNivel = necesitaSucursalAsignada({ rol: p.rol })  // nivel 1 y 2: siempre asignada
                return (
                  <tr key={p.id} style={{ opacity: p.activo ? 1 : .5 }}>
                    <td data-label="Nombre">
                      <strong>{p.nombre}</strong>
                      <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{p.correo}</div>
                      {!p.activo && <div style={{ fontSize: "var(--fs-xs)", color: "var(--warn)" }}>Inactivo · no puede entrar</div>}
                    </td>
                    <td data-label="Rol">
                      {p.rol || "—"} <span className="muted">· nivel {nivel}</span>
                      {p.puesto && <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{p.puesto}</div>}
                    </td>
                    <td data-label="Sucursal" style={{ minWidth: 190 }}>
                      <Select
                        value={p.sucursal ?? ""}
                        onChange={(e) => cambiarSucursal(p, e.target.value)}
                        options={OPCIONES}
                        disabled={guardando === p.id}
                        ariaLabel={`Sucursal de ${p.nombre}`}
                      />
                      {!fijaPorNivel && !p.sucursalFija && (
                        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 4 }}>
                          Es solo la que le aparece marcada al entrar
                        </div>
                      )}
                    </td>
                    <td data-label="¿Puede cambiarla?">
                      {fijaPorNivel ? (
                        <span className="eq-fijo"><Icon name="lock" size={12} /> No, por su nivel</span>
                      ) : (
                        <button
                          className={"eq-candado" + (p.sucursalFija ? " cerrado" : "")}
                          onClick={() => cambiarCandado(p)}
                          disabled={guardando === p.id}
                          title={p.sucursalFija
                            ? "Quitar el candado: podrá elegir sucursal al entrar"
                            : "Fijarlo a esta sucursal: dejará de poder cambiarla"}
                        >
                          <Icon name={p.sucursalFija ? "lock" : "lockOpen"} size={12} />
                          {p.sucursalFija ? "Fijo" : "Sí, elige"}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 12, lineHeight: 1.6, maxWidth: 760 }}>
        De gerencia para arriba cada quien elige su sucursal al entrar; ahí la de esta tabla es solo
        la que le aparece marcada. Si alguien va a estar siempre en la misma, ciérrale el candado y
        dejará de poder cambiarla — se abre cuando haga falta moverlo. De nivel 2 para abajo la
        sucursal siempre la asigna dirección, y sin ella no pueden entrar al panel. El rol se cambia
        en NocoDB, no desde aquí.
      </p>
    </div>
  )
}
