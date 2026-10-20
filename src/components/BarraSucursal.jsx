import { useState, useRef, useEffect } from "react"
import { SUCURSALES } from "../data"

const ICONOS = { centro: "🏪", repostero: "🍰", bodega: "📦" }

// Cambiar de sucursal desde el teléfono obligaba a abrir el menú lateral. Esta
// barra vive encima del contenido, muestra en cuál estás y se abre al
// mantenerla presionada: así no se cambia de sucursal por un roce, que ahí se
// registran las ventas.
const MS_PARA_ABRIR = 380

export default function BarraSucursal({ actual, onElegir }) {
  const [abierta, setAbierta] = useState(false)
  const [cargando, setCargando] = useState(false)   // dibuja el aro mientras se mantiene
  const temporizador = useRef(null)

  const suc = SUCURSALES.find(s => s.id === actual)

  const cancelar = () => {
    clearTimeout(temporizador.current)
    setCargando(false)
  }

  const empezar = () => {
    if (abierta) return
    setCargando(true)
    temporizador.current = setTimeout(() => {
      setCargando(false)
      setAbierta(true)
      // Un toque corto en el móvil no se siente; esto sí avisa que ya abrió.
      navigator.vibrate?.(12)
    }, MS_PARA_ABRIR)
  }

  useEffect(() => () => clearTimeout(temporizador.current), [])

  useEffect(() => {
    if (!abierta) return
    const fuera = () => setAbierta(false)
    // Se cierra sola: en un teléfono no hay a dónde "hacer clic fuera" sin
    // tocar otra cosa, así que también se va al desplazar.
    document.addEventListener("pointerdown", fuera)
    document.addEventListener("scroll", fuera, true)
    return () => {
      document.removeEventListener("pointerdown", fuera)
      document.removeEventListener("scroll", fuera, true)
    }
  }, [abierta])

  if (!suc) return null
  const otras = SUCURSALES.filter(s => s.id !== actual)

  return (
    <div className={"barra-suc" + (abierta ? " abierta" : "")} onPointerDown={e => e.stopPropagation()}>
      {abierta && otras.map(s => (
        <button key={s.id} className="barra-suc-op" onClick={() => { setAbierta(false); onElegir(s.id) }}>
          <span className="bs-icono">{ICONOS[s.id] ?? "🏬"}</span>
          <span className="bs-texto">
            <strong>{s.name}</strong>
            <small>{s.direccion ?? s.desc}</small>
          </span>
        </button>
      ))}

      <button
        className={"barra-suc-actual" + (cargando ? " cargando" : "")}
        onPointerDown={empezar}
        onPointerUp={cancelar}
        onPointerLeave={cancelar}
        onPointerCancel={cancelar}
        onContextMenu={e => e.preventDefault()}
        onClick={() => abierta && setAbierta(false)}
        aria-label={`Sucursal ${suc.name}. Mantén presionado para cambiar`}
      >
        <span className="bs-icono">{ICONOS[suc.id] ?? "🏬"}</span>
        <span className="bs-texto">
          <strong>{suc.name}</strong>
          <small>{abierta ? "elige una" : "mantén presionado"}</small>
        </span>
      </button>
    </div>
  )
}
