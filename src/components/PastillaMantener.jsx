import { useState, useRef, useEffect } from "react"

// Selector de una sola pastilla: enseña la opción activa y, al MANTENERLA
// presionada, despliega las demás. Se mantiene en vez de tocarse a propósito:
// cambiar de sucursal decide dónde se registra lo que haces, y un roce no
// debería moverlo.
const MS_PARA_ABRIR = 380

export default function PastillaMantener({
  opciones,
  valor,
  onElegir,
  pista = "mantén presionado",
}) {
  const [abierta, setAbierta] = useState(false)
  const [manteniendo, setManteniendo] = useState(false)
  const temporizador = useRef(null)
  const caja = useRef(null)

  const activa = opciones.find(o => o.id === valor) ?? opciones[0]
  const otras = opciones.filter(o => o.id !== activa?.id)

  const cancelar = () => { clearTimeout(temporizador.current); setManteniendo(false) }

  const empezar = () => {
    if (abierta) return
    setManteniendo(true)
    temporizador.current = setTimeout(() => {
      setManteniendo(false)
      setAbierta(true)
      navigator.vibrate?.(12)   // en el teléfono, avisa que ya abrió
    }, MS_PARA_ABRIR)
  }

  useEffect(() => () => clearTimeout(temporizador.current), [])

  useEffect(() => {
    if (!abierta) return
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setAbierta(false) }
    document.addEventListener("pointerdown", fuera)
    return () => document.removeEventListener("pointerdown", fuera)
  }, [abierta])

  if (!activa) return null

  const Fila = (o, esActiva) => (
    <button
      key={o.id}
      className={"pm-op" + (esActiva ? " activa" : "") + (esActiva && manteniendo ? " manteniendo" : "")}
      onPointerDown={esActiva ? empezar : undefined}
      onPointerUp={esActiva ? cancelar : undefined}
      onPointerLeave={esActiva ? cancelar : undefined}
      onPointerCancel={esActiva ? cancelar : undefined}
      onContextMenu={e => e.preventDefault()}
      onClick={() => {
        if (esActiva) { if (abierta) setAbierta(false); return }
        setAbierta(false)
        onElegir(o.id)
      }}
      aria-label={esActiva ? `${o.titulo}. Mantén presionado para cambiar` : `Cambiar a ${o.titulo}`}
    >
      {o.icono}
      <span className="pm-texto">
        <strong>{o.titulo}</strong>
        {esActiva && <small>{abierta ? "elige una" : pista}</small>}
      </span>
      {o.insignia && <span className="pm-insignia">{o.insignia}</span>}
    </button>
  )

  return (
    <div className={"pastilla-mantener" + (abierta ? " abierta" : "")} ref={caja}>
      {/* Telón: sin él, lo que queda debajo se transparenta y las opciones se
          leen como si estuvieran dentro de la tarjeta de atrás. */}
      {abierta && <div className="pm-telon" onClick={() => setAbierta(false)} />}
      {Fila(activa, true)}
      {abierta && <div className="pm-otras">{otras.map(o => Fila(o, false))}</div>}
    </div>
  )
}
