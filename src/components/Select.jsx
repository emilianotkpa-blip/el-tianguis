import { useState, useRef, useEffect, useLayoutEffect, useId } from "react"
import { createPortal } from "react-dom"
import Icon from "./Icon"

// Desplegable propio. Sustituye al <select> nativo para que el menú siga el
// lenguaje visual del sistema (vidrio, opciones altas, animación).
// Mantiene lo que el nativo daba gratis: teclado completo, lectura por
// lector de pantalla y cierre al tocar fuera.
//
// options: [{ value, label, hint?, disabled? }]
export default function Select({
  value,
  onChange,
  options = [],
  placeholder = "Selecciona…",
  disabled = false,
  className = "",
  style,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const [activo, setActivo] = useState(-1)      // opción resaltada por teclado
  const [pos, setPos] = useState(null)          // posición fija del menú (portal)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const id = useId()

  const seleccionada = options.find((o) => String(o.value) === String(value))
  const idxSeleccionada = options.findIndex((o) => String(o.value) === String(value))

  // Cerrar al tocar fuera o al hacer scroll del contenedor
  useEffect(() => {
    if (!open) return
    // El menú vive en el body (portal), así que "dentro" son las dos piezas:
    // el campo y el menú. Sin esto, el clic en una opción cerraría el menú
    // en el mousedown y la opción se desmontaría antes de recibir el clic.
    const dentro = (t) =>
      (t instanceof Node) && (wrapRef.current?.contains(t) || listRef.current?.contains(t))
    const fuera = (e) => { if (!dentro(e.target)) setOpen(false) }
    const cerrar = () => setOpen(false)
    // El scroll DEL PROPIO menú no debe cerrarlo: al abrirse, la opción
    // seleccionada se desplaza a la vista y eso dispara un scroll aquí dentro.
    const cerrarPorScroll = (e) => {
      if (dentro(e.target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", fuera)
    window.addEventListener("resize", cerrar)
    // capture: atrapa el scroll de cualquier contenedor, no solo el de la ventana
    window.addEventListener("scroll", cerrarPorScroll, true)
    return () => {
      document.removeEventListener("mousedown", fuera)
      window.removeEventListener("resize", cerrar)
      window.removeEventListener("scroll", cerrarPorScroll, true)
    }
  }, [open])

  // El menú se dibuja en el body con posición fija: dentro de un modal o de
  // una tabla con scroll, un menú absoluto se recortaría contra el overflow
  // del contenedor.
  useLayoutEffect(() => {
    if (!open) return
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    const alto = Math.min(options.length * 46 + 10, 280)
    const cabeAbajo = r.bottom + alto <= window.innerHeight - 12
    const arriba = !cabeAbajo && r.top > alto
    setPos({
      left: r.left,
      width: r.width,
      top: arriba ? undefined : r.bottom + 6,
      bottom: arriba ? window.innerHeight - r.top + 6 : undefined,
      maxHeight: arriba ? r.top - 18 : window.innerHeight - r.bottom - 18,
      arriba,
    })
    setActivo(idxSeleccionada >= 0 ? idxSeleccionada : 0)
  }, [open, options.length, idxSeleccionada])

  // Mantener a la vista la opción resaltada.
  // Se mueve el scroll del menú a mano: scrollIntoView arrastraría también a
  // los contenedores padre, y ese scroll cerraba el menú apenas se abría.
  useEffect(() => {
    if (!open || activo < 0) return
    const lista = listRef.current
    const op = lista?.querySelector(`[data-idx="${activo}"]`)
    if (!lista || !op) return
    const arribaDe = op.offsetTop
    const abajoDe = arribaDe + op.offsetHeight
    if (arribaDe < lista.scrollTop) lista.scrollTop = arribaDe
    else if (abajoDe > lista.scrollTop + lista.clientHeight) lista.scrollTop = abajoDe - lista.clientHeight
  }, [activo, open])

  const elegir = (op) => {
    if (op.disabled) return
    onChange?.({ target: { value: op.value } })   // misma forma que el evento nativo
    setOpen(false)
    wrapRef.current?.querySelector(".select-trigger")?.focus()
  }

  const onKeyDown = (e) => {
    if (disabled) return
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); setOpen(true) }
      return
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); return }
    if (e.key === "Tab") { setOpen(false); return }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      if (options[activo]) elegir(options[activo])
      return
    }
    const salto = { ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (salto) {
      e.preventDefault()
      let i = activo
      // Saltar las opciones deshabilitadas
      for (let n = 0; n < options.length; n++) {
        i = (i + salto + options.length) % options.length
        if (!options[i].disabled) break
      }
      setActivo(i)
      return
    }
    if (e.key === "Home") { e.preventDefault(); setActivo(0) }
    if (e.key === "End")  { e.preventDefault(); setActivo(options.length - 1) }
  }

  return (
    <div
      className={"select-wrap" + (className ? " " + className : "")}
      style={style}
      ref={wrapRef}
    >
      <button
        type="button"
        className={"select-trigger" + (open ? " open" : "")}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={open ? `${id}-list` : undefined}
      >
        <span className={"select-value" + (seleccionada ? "" : " placeholder")}>
          {seleccionada ? seleccionada.label : placeholder}
        </span>
        <Icon name="chevronDown" size={14} className="select-arrow" />
      </button>

      {open && pos && createPortal(
        <div
          className={"select-menu" + (pos.arriba ? " up" : "")}
          style={{
            left: pos.left,
            width: pos.width,
            top: pos.top,
            bottom: pos.bottom,
            maxHeight: Math.max(pos.maxHeight, 140),
          }}
          role="listbox"
          id={`${id}-list`}
          ref={listRef}
          aria-activedescendant={activo >= 0 ? `${id}-op-${activo}` : undefined}
        >
          {options.map((op, i) => (
            <div
              key={`${op.value}-${i}`}
              id={`${id}-op-${i}`}
              data-idx={i}
              role="option"
              aria-selected={String(op.value) === String(value)}
              aria-disabled={op.disabled || undefined}
              className={
                "select-option"
                + (i === activo ? " activa" : "")
                + (String(op.value) === String(value) ? " elegida" : "")
                + (op.disabled ? " deshabilitada" : "")
              }
              onMouseEnter={() => setActivo(i)}
              onClick={() => elegir(op)}
            >
              <span className="select-option-text">
                {op.label}
                {op.hint && <span className="select-option-hint">{op.hint}</span>}
              </span>
              {String(op.value) === String(value) && <Icon name="check" size={13} />}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
