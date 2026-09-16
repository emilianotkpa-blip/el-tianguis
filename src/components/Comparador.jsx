import { createContext, useContext, useState, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import Icon from "./Icon"
import Confirm from "./Confirm"
import { SUCURSALES } from "../data"
import { fmtNum, fmtBase } from "../utils"

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
function BarraStock({ etiqueta, valor, maximo, minimo, texto }) {
  const pct = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0
  const color = valor <= 0 ? "var(--err)" : valor < minimo ? "var(--warn)" : "var(--ok)"
  return (
    <div className="cmp-barra">
      <div className="cmp-barra-top">
        <span>{etiqueta}</span>
        <span className="num">{texto}</span>
      </div>
      <div className="cov-track">
        <div className="cov-fill" style={{ width: pct + "%", background: color }} />
      </div>
    </div>
  )
}

// Cuánto cabe de verdad: 1.6 cajas son 1.6. Truncar a 1 esconde más de media
// caja de mercancía, que es justo lo que se viene a consultar aquí.
const fmtCant = (n) => {
  if (!isFinite(n)) return "—"
  return (Math.round(n * 10) / 10).toLocaleString("es-MX", { maximumFractionDigits: 1 })
}

// "Al detalle" y las presentaciones de cantidad libre vienen con factor null:
// son la unidad suelta, es decir factor 1.
const factorDe = (p) => p?.factor ?? 1

// Cuánto es una unidad de esa presentación, en unidad base
const enBaseDe = (factor, esGramo) => esGramo
  ? (factor >= 1000 ? `${fmtCant(factor / 1000)} kg` : `${fmtNum(factor)} g`)
  : `${fmtNum(factor)} pzs`

// De qué está hecha una presentación. Una caja no dice nada por sí sola: lo
// que se necesita saber es cuántos paquetes trae y cuántas piezas son en total.
function composicion(p, pres, esGramo) {
  const f = factorDe(p)
  if (f <= 1) return null                 // la unidad suelta se explica sola
  const total = enBaseDe(f, esGramo)

  let dentro = null, cuantos = null
  if (p.contieneN && p.contienePres) {
    dentro  = pres.find(x => x.id === p.contienePres)
    cuantos = p.contieneN
  }
  // Casi ningún producto declara qué trae dentro, pero en una caja se deduce
  // del paquete: 500 pzs de caja entre 50 del paquete son 10 paquetes. Solo
  // para cajas: en las bolsas, 1 kg no es "dos medios kilos empacados".
  if (!dentro && (p.nivel === "caja" || p.nivel === "bulto")) {
    dentro = pres
      .filter(x => x.id !== p.id && x.nivel === "paquete" && factorDe(x) > 1 && factorDe(x) < f)
      .sort((a, b) => factorDe(b) - factorDe(a))[0] ?? null
    if (dentro) cuantos = f / factorDe(dentro)
  }
  const limpio = (t) => (t ?? "").replace(/s+/g, "").toLowerCase()

  if (dentro && cuantos > 1) {
    // Si el nombre del paquete ya trae su tamaño ("Paq. 100 pzs"), no se repite
    const tam = enBaseDe(factorDe(dentro), esGramo)
    const nombre = limpio(dentro.label).includes(limpio(tam))
      ? dentro.label
      : `${dentro.label} de ${tam}`
    return `${fmtCant(cuantos)} × ${nombre} · ${total}`
  }
  // Si el nombre ya lo dice ("1 kg"), repetirlo debajo solo hace ruido
  return limpio(total) === limpio(p.label) ? null : total
}

// ── Tarjeta comparativa ───────────────────────────────
export function TarjetaComparar({ producto, onQuitar, compacta = false }) {
  const stock   = producto.stock ?? {}
  const total   = (stock.centro ?? 0) + (stock.repostero ?? 0) + (stock.bodega ?? 0)
  const maximo  = Math.max(stock.centro ?? 0, stock.repostero ?? 0, stock.bodega ?? 0, 1)
  const esGramo = producto.unidadBase === "gramo"
  const pres    = (producto.presentaciones ?? []).filter(p => p.activo !== false && factorDe(p) > 0)

  // La unidad suelta arranca abierta porque es la lectura de siempre. Las
  // demás se abren aparte y pueden quedar todas abiertas a la vez.
  const base = pres.find(p => factorDe(p) === 1) ?? pres[0]
  const [abiertas, setAbiertas] = useState(() => new Set(base ? [base.id] : []))
  const alternar = (id) => setAbiertas(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // Cuánto hay, leído en las unidades de una presentación
  const cantidadEn = (p, valor) => factorDe(p) === 1
    ? fmtBase(valor, producto.unidadBase)
    : fmtCant(valor / factorDe(p))

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
        <strong>{fmtBase(total, producto.unidadBase)}</strong>
      </div>

      {/* Cada presentación se abre y muestra lo mismo por sucursal, pero
          contado en sus propias unidades */}
      {pres.length > 0 ? (
        <div className="cmp-pres">
          {pres.map(p => {
            const abierta = abiertas.has(p.id)
            const hint    = composicion(p, pres, esGramo)
            return (
              <div className={"cmp-pres-bloque" + (abierta ? " abierta" : "")} key={p.id}>
                <button
                  className="cmp-pres-fila"
                  onClick={() => alternar(p.id)}
                  aria-expanded={abierta}
                >
                  <Icon name={abierta ? "chevronDown" : "chevronRight"} size={11} />
                  <span className="cmp-pres-label">
                    {p.label}
                    {hint && <span className="cmp-pres-hint">{hint}</span>}
                  </span>
                  <span className="num">{cantidadEn(p, total)}</span>
                </button>

                <AnimatePresence initial={false}>
                  {abierta && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: .22, ease: [0.4, 0, 0.2, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="cmp-pres-desglose">
                        {SUCURSALES.map(s => (
                          <BarraStock
                            key={s.id}
                            etiqueta={s.short}
                            valor={stock[s.id] ?? 0}
                            maximo={maximo}
                            minimo={producto.min ?? 5}
                            texto={cantidadEn(p, stock[s.id] ?? 0)}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      ) : (
        // Productos sin presentaciones cargadas: al menos el stock por sucursal
        <div className="cmp-barras">
          {SUCURSALES.map(s => (
            <BarraStock
              key={s.id}
              etiqueta={s.short}
              valor={stock[s.id] ?? 0}
              maximo={maximo}
              minimo={producto.min ?? 5}
              texto={fmtBase(stock[s.id] ?? 0, producto.unidadBase)}
            />
          ))}
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
