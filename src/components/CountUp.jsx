import { useState, useEffect, useRef } from "react"

// Número que sube hasta su valor. Se usa en los KPIs: da una lectura de
// "esto se acaba de calcular" y hace que la cifra se note al cambiar de
// período. Respeta prefers-reduced-motion (salta directo al valor).
export default function CountUp({ value, format = (n) => n, duration = 650 }) {
  const target = Number(value) || 0
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)

  useEffect(() => {
    const from = fromRef.current
    if (from === target) return

    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (quieto) {
      fromRef.current = target
      setDisplay(target)
      return
    }

    let raf, inicio
    const paso = (ts) => {
      if (!inicio) inicio = ts
      const p = Math.min((ts - inicio) / duration, 1)
      const suave = 1 - Math.pow(1 - p, 3)   // desacelera al final
      setDisplay(from + (target - from) * suave)
      if (p < 1) raf = requestAnimationFrame(paso)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return <>{format(display)}</>
}
