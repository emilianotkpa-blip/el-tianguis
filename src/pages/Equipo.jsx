import { useState, useEffect } from "react"
import Icon from "../components/Icon"
import Select from "../components/Select"
import { getEquipo, asignarSucursal } from "../api"
import { SUCURSALES } from "../data"
import { nivelDe, puedeElegirSucursal } from "../../shared/roles"

// Dirección asigna aquí la sucursal de quien no puede elegirla. El rol no se
// toca desde el panel a propósito: desde aquí cualquiera con nivel de
// dirección podría ascenderse solo. Eso sigue en NocoDB.
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

  const cambiar = async (persona, sucursal) => {
    setGuardando(persona.id)
    const antes = persona.sucursal
    setGente(g => g.map(p => p.id === persona.id ? { ...p, sucursal } : p))
    try {
      await asignarSucursal(persona.id, sucursal)
      const donde = SUCURSALES.find(s => s.id === sucursal)?.name
      addToast({ kind: "ok", msg: sucursal ? `${persona.nombre} trabaja en ${donde}` : `${persona.nombre} quedó sin sucursal` })
    } catch (err) {
      setGente(g => g.map(p => p.id === persona.id ? { ...p, sucursal: antes } : p))
      addToast({ kind: "err", msg: err.message })
    } finally { setGuardando(null) }
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
                <th>Nombre</th><th>Rol</th><th>Correo</th><th>Sucursal</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="muted" style={{ padding: 20 }}>Cargando…</td></tr>}
              {!loading && gente.length === 0 && (
                <tr><td colSpan={4} className="muted" style={{ padding: 20 }}>No hay nadie dado de alta.</td></tr>
              )}
              {gente.map(p => {
                const elige = puedeElegirSucursal({ rol: p.rol })
                return (
                  <tr key={p.id} style={{ opacity: p.activo ? 1 : .5 }}>
                    <td data-label="Nombre">
                      <strong>{p.nombre}</strong>
                      {p.puesto && <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{p.puesto}</div>}
                      {!p.activo && <div style={{ fontSize: "var(--fs-xs)", color: "var(--warn)" }}>Inactivo · no puede entrar</div>}
                    </td>
                    <td data-label="Rol">{p.rol || "—"} <span className="muted">· nivel {nivelDe(p.rol)}</span></td>
                    <td data-label="Correo" className="muted" style={{ fontSize: "var(--fs-xs)" }}>{p.correo || "—"}</td>
                    <td data-label="Sucursal" style={{ minWidth: 190 }}>
                      {elige ? (
                        <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                          La elige al entrar
                        </span>
                      ) : (
                        <Select
                          value={p.sucursal ?? ""}
                          onChange={(v) => cambiar(p, v)}
                          options={OPCIONES}
                          disabled={guardando === p.id}
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 12, lineHeight: 1.6 }}>
        De gerencia para arriba cada quien elige su sucursal al entrar, así que no hay nada que
        asignar. De ahí para abajo, sin sucursal no pueden entrar al panel. El rol se cambia en
        NocoDB, no desde aquí.
      </p>
    </div>
  )
}
