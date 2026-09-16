import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createPortal } from "react-dom"
import Icon from "./Icon"
import { TarjetaComparar, useComparador, MAX_COMPARAR } from "./Comparador"

// Ficha de un producto en modo lectura: se abre al tocar una fila y desde aquí
// se manda a comparar. Al agregarlo, la tarjeta viaja hasta el ojo (el layoutId
// compartido con el botón flotante es lo que produce ese movimiento).
export default function ProductoVista({ producto, onCerrar, onEditar }) {
  const cmp = useComparador()
  const [volando, setVolando] = useState(false)
  const yaEsta = cmp?.tiene(producto?.sku)

  if (!producto) return null

  // La tarjeta viaja hasta la esquina del ojo antes de guardarse: es lo que
  // hace entender que el producto "se guardó ahí" y no que desapareció.
  const agregar = () => {
    if (volando) return
    setVolando(true)
    cmp?.setModo(true)
  }
  const alTerminarVuelo = () => {
    if (!volando) return
    cmp?.agregar(producto)
    onCerrar()
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="pv-telon"
        initial={{ opacity: 0 }}
        animate={{ opacity: volando ? 0 : 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}
      >
        <motion.div
          className="pv-caja"
          initial={{ opacity: 0, y: 14, scale: .97 }}
          animate={volando
            ? {
                // Hacia donde vive el ojo: esquina inferior derecha
                x: (window.innerWidth / 2) - 70,
                y: (window.innerHeight / 2) - 70,
                scale: .12,
                opacity: 0,
              }
            : { opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: .97 }}
          transition={volando
            ? { duration: .5, ease: [0.4, 0, 0.2, 1] }
            : { type: "spring", stiffness: 380, damping: 30 }}
          onAnimationComplete={alTerminarVuelo}
        >
          <div className="pv-cabeza">
            <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>Vista rápida</span>
            <button className="modal-close" onClick={onCerrar} aria-label="Cerrar">
              <Icon name="x" size={14} />
            </button>
          </div>

          <TarjetaComparar producto={producto} />

          <div className="pv-acciones">
            {yaEsta ? (
              <button className="btn btn-default" onClick={() => cmp.quitar(producto.sku)}>
                <Icon name="x" size={13} /> Sin visualización
              </button>
            ) : cmp?.lleno ? (
              <button className="btn btn-default" disabled title={`Ya hay ${MAX_COMPARAR} productos en la visualización`}>
                <Icon name="eye" size={14} /> Visualización llena
              </button>
            ) : (
              <button className="btn btn-wine" onClick={agregar}>
                <Icon name="eye" size={14} /> Visualizar en conjunto
              </button>
            )}
            {onEditar && (
              <button className="btn btn-default" onClick={() => { onCerrar(); onEditar(producto) }}>
                <Icon name="edit" size={13} /> Editar
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
