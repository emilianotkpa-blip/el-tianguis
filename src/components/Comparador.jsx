import { createContext, useContext, useState, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import Icon from "./Icon"
import Confirm from "./Confirm"
import { SUCURSALES } from "../data"
import { fmtNum } from "../utils"

// Comparador de productos: se van guardando productos en un "ojo" y luego se
// ven todos juntos para comparar inventario de un vistazo.
// El estado vive aquí arriba para que sobreviva al cambio de página: se puede
// juntar un producto desde Productos y otro desde Inventarios.

const Ctx = createContext(null)

export function ComparadorProvider({ children }) {
  const [seleccion, setSeleccion] = useState([])   // productos completos
  const [abierto, setAbierto]     = useState(false)
  const [modoAgregar, setModo]    = useState(true) // "Agregar a visualización" vs "Sin visualización"

  const agregar = useCallback((producto) => {
    setSeleccion(s => s.some(p => p.sku === producto.sku) ? s : [...s, producto])
  }, [])
  const quitar = useCallback((sku) => {
    setSeleccion(s => s.filter(p => p.sku !== sku))
  }, [])
  const vaciar = useCallback(() => { setSeleccion([]); setAbierto(false) }, [])
  const tiene  = useCallback((sku) => seleccion.some(p => p.sku === sku), [seleccion])

  const valor = useMemo(() => ({
    seleccion, agregar, quitar, vaciar, tiene,
    abierto, setAbierto, modoAgregar, setModo,
  }), [seleccion, agregar, quitar, vaciar, tiene, abierto, modoAgregar])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export const useComparador = () => useContext(Ctx)

// ── Barra de stock de una sucursal ────────────────────
function BarraStock({ etiqueta, valor, maximo, minimo }) {
  const pct = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0
  const color = valor <= 0 ? "var(--err)" : valor < minimo ? "var(--warn)" : "var(--ok)"
  return (
    <div className="cmp-barra">
      <div className="cmp-barra-top">
        <span>{etiqueta}</span>
        <span className="num">{fmtNum(valor)}</span>
      </div>
      <div className="cov-track">
        <div className="cov-fill" style={{ width: pct + "%", background: color }} />
      </div>
    </div>
  )
}

// ── Tarjeta comparativa ───────────────────────────────
export function TarjetaComparar({ producto, onQuitar, compacta = false }) {
  const stock = producto.stock ?? {}
  const total = (stock.centro ?? 0) + (stock.repostero ?? 0) + (stock.bodega ?? 0)
  const maximo = Math.max(stock.centro ?? 0, stock.repostero ?? 0, stock.bodega ?? 0, 1)
  const esGramo = producto.unidadBase === "gramo"
  const pres = (producto.presentaciones ?? []).filter(p => p.activo !== false)

  return (
    <motion.div layout className={"cmp-tarjeta" + (compacta ? " compacta" : "")}>
      <div className="cmp-cabeza">
        <div>
          <div className="cmp-sku">{producto.sku}</div>
          <div className="cmp-nombre">{producto.name}</div>
        </div>
        {onQuitar && (
          <button className="cmp-quitar" onClick={() => onQuitar(producto.sku)} title="Quitar de la comparación">
            <Icon name="x" size={13} />
          </button>
        )}
      </div>

      {/* Stock general: la referencia contra la que se leen las sucursales */}
      <div className="cmp-total">
        <span>Stock total</span>
        <strong>{esGramo ? `${fmtNum(total)} g` : `${fmtNum(total)} pzs`}</strong>
      </div>

      <div className="cmp-barras">
        {SUCURSALES.map(s => (
          <BarraStock
            key={s.id}
            etiqueta={s.short}
            valor={stock[s.id] ?? 0}
            maximo={maximo}
            minimo={producto.min ?? 5}
          />
        ))}
      </div>

      {/* Cuánto es eso en cada presentación que existe */}
      {pres.length > 0 && (
        <div className="cmp-pres">
          {pres.map(p => {
            const factor = p.factor ?? 1
            const equiv = factor > 0 ? Math.floor(total / factor) : 0
            return (
              <div className="cmp-pres-fila" key={p.id}>
                <span>{p.label}</span>
                <span className="num">{factor > 0 ? fmtNum(equiv) : "—"}</span>
              </div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}

// ── Botón flotante (el ojo) + vista de conjunto ───────
export function ComparadorFlotante() {
  const cmp = useComparador()
  const [confirmarVaciar, setConfirmar] = useState(false)
  if (!cmp) return null
  const { seleccion, abierto, setAbierto, quitar, vaciar } = cmp

  return (
    <>
      <AnimatePresence>
        {seleccion.length > 0 && (
          <motion.div
            className="cmp-flotante"
            initial={{ opacity: 0, scale: .6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: .6, y: 10 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
          >
            <button className="cmp-ojo" onClick={() => setAbierto(true)} title="Ver en conjunto">
              <Icon name="eye" size={18} />
              {/* El número salta cada vez que entra otro producto */}
              <motion.span
                key={seleccion.length}
                className="cmp-contador"
                initial={{ scale: .5 }}
                animate={{ scale: [1.5, 1] }}
                transition={{ duration: .32, ease: "easeOut" }}
              >
                {seleccion.length}
              </motion.span>
            </button>
            <button className="cmp-vaciar" onClick={() => setConfirmar(true)} title="Vaciar comparación">
              <Icon name="x" size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {createPortal(
        <AnimatePresence>
          {abierto && (
            <motion.div
              className="cmp-telon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}
            >
              <div className="cmp-vista">
                <div className="cmp-vista-cabeza">
                  <div>
                    <h3>Comparando {seleccion.length} producto{seleccion.length !== 1 ? "s" : ""}</h3>
                    <p>Stock por sucursal y su equivalencia en cada presentación</p>
                  </div>
                  <button className="modal-close" onClick={() => setAbierto(false)} aria-label="Cerrar">
                    <Icon name="x" size={16} />
                  </button>
                </div>
                <div className="cmp-rejilla">
                  <LayoutGroup>
                    <AnimatePresence mode="popLayout">
                      {seleccion.map(p => (
                        <motion.div
                          key={p.sku}
                          layout
                          initial={{ opacity: 0, y: 18, scale: .96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: .9 }}
                          transition={{ type: "spring", stiffness: 360, damping: 30 }}
                        >
                          <TarjetaComparar producto={p} onQuitar={quitar} compacta />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </LayoutGroup>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <Confirm
        open={confirmarVaciar}
        title="Vaciar comparación"
        message={`Se quitan los ${seleccion.length} productos y hay que volver a elegirlos.`}
        confirmLabel="Sí, vaciar"
        danger
        onConfirm={() => { vaciar(); setConfirmar(false) }}
        onCancel={() => setConfirmar(false)}
      />
    </>
  )
}
