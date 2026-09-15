import { useState, useEffect, useMemo } from "react"
import Icon from "../components/Icon"
import Modal from "../components/Modal"
import Select from "../components/Select"
import Confirm from "../components/Confirm"
import { TableSkeleton } from "../components/Skeleton"
import { getPromos, postPromo, patchPromo, deletePromo, getCatalogo } from "../api"
import { describirRegla, describirEfecto } from "../promos"
import { fmtMoney } from "../utils"

const TIPOS = [
  { value: "combo",      label: "Combo",      hint: "Dos o más productos juntos llevan precio de paquete" },
  { value: "proporcion", label: "Proporción", hint: "Por cada N de un producto, otro lleva descuento" },
]

const EFECTOS = [
  { value: "precio_paquete",  label: "Precio de paquete", hint: "El conjunto cuesta este monto" },
  { value: "descuento_monto", label: "Descuento en pesos" },
  { value: "descuento_pct",   label: "Descuento en porcentaje" },
]

const reglaVacia = () => ({
  nombre: "",
  tipo: "combo",
  activo: true,
  prioridad: 10,
  config: {
    items: [{ sku: "", presId: "*", cant: 1 }, { sku: "", presId: "*", cant: 1 }],
    porCada: { sku: "", presId: "*", cant: 10 },
    aplicaA: { sku: "", presId: "*", cant: 1 },
    efecto: { tipo: "precio_paquete", valor: "" },
  },
})

// Selector de producto + presentación + cantidad, la pieza que se repite
function SelectorProducto({ valor, onChange, catalogo, etiqueta }) {
  const producto = catalogo.find(p => String(p.sku) === String(valor.sku))
  const presentaciones = [
    { value: "*", label: "Cualquier presentación" },
    ...(producto?.presentaciones ?? [])
      .filter(p => p.activo !== false)
      .map(p => ({ value: p.id, label: p.label, hint: p.precio > 0 ? fmtMoney(p.precio) : undefined })),
  ]
  return (
    <div className="regla-selector">
      {etiqueta && <label className="regla-selector-label">{etiqueta}</label>}
      <div className="regla-selector-campos">
        <input
          type="number" min="1" className="regla-cant"
          value={valor.cant}
          onChange={e => onChange({ ...valor, cant: parseInt(e.target.value) || 1 })}
          aria-label="Cantidad"
        />
        <span className="regla-por">×</span>
        <Select
          value={valor.sku}
          onChange={e => onChange({ ...valor, sku: e.target.value, presId: "*" })}
          placeholder="— Producto —"
          style={{ flex: 2 }}
          options={catalogo.map(p => ({ value: p.sku, label: p.name, hint: p.sku }))}
        />
        <Select
          value={valor.presId ?? "*"}
          onChange={e => onChange({ ...valor, presId: e.target.value })}
          style={{ flex: 1 }}
          disabled={!producto}
          options={presentaciones}
        />
      </div>
    </div>
  )
}

export default function ReglasPage({ addToast }) {
  const [reglas, setReglas]   = useState([])
  const [catalogo, setCat]    = useState([])
  const [cargando, setCarga]  = useState(true)
  const [editando, setEdit]   = useState(null)   // regla en edición (o nueva)
  const [guardando, setGuard] = useState(false)
  const [porBorrar, setBorrar] = useState(null)
  const [sinTabla, setSinTabla] = useState(false)

  const cargar = () => {
    setCarga(true)
    Promise.all([getPromos(), getCatalogo()])
      .then(([r, c]) => { setReglas(r); setCat(c) })
      .catch(err => addToast({ kind: "err", msg: err.message }))
      .finally(() => setCarga(false))
  }
  useEffect(cargar, [])

  const ordenadas = useMemo(
    () => [...reglas].sort((a, b) => (a.prioridad ?? 100) - (b.prioridad ?? 100)),
    [reglas],
  )

  const guardar = async () => {
    const r = editando
    if (!r.nombre.trim()) return addToast({ kind: "err", msg: "Ponle nombre a la regla" })

    // Validación por tipo: una regla a medias no descuenta nada y confunde
    if (r.tipo === "combo") {
      const items = (r.config.items || []).filter(i => i.sku)
      if (items.length < 2) return addToast({ kind: "err", msg: "Un combo necesita al menos dos productos" })
    } else {
      if (!r.config.porCada?.sku || !r.config.aplicaA?.sku) {
        return addToast({ kind: "err", msg: "Elige el producto base y el que lleva descuento" })
      }
    }
    if (!(Number(r.config.efecto?.valor) > 0)) {
      return addToast({ kind: "err", msg: "Falta el valor del descuento" })
    }

    // Se guarda solo lo que usa el tipo elegido
    const config = r.tipo === "combo"
      ? { items: r.config.items.filter(i => i.sku), efecto: r.config.efecto }
      : { porCada: r.config.porCada, aplicaA: r.config.aplicaA, efecto: r.config.efecto }

    setGuard(true)
    try {
      const payload = { nombre: r.nombre, tipo: r.tipo, activo: r.activo, prioridad: r.prioridad, config }
      if (r.id) await patchPromo(r.id, payload)
      else await postPromo(payload)
      addToast({ kind: "ok", msg: r.id ? "Regla actualizada" : "Regla creada" })
      setEdit(null)
      cargar()
    } catch (err) {
      if (/NOCO_TABLE_PROMOS/.test(err.message)) setSinTabla(true)
      addToast({ kind: "err", msg: err.message })
    } finally { setGuard(false) }
  }

  const alternarActivo = async (r) => {
    try {
      await patchPromo(r.id, { activo: !r.activo })
      setReglas(rs => rs.map(x => x.id === r.id ? { ...x, activo: !x.activo } : x))
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
  }

  const borrar = async () => {
    try {
      await deletePromo(porBorrar.id)
      setReglas(rs => rs.filter(x => x.id !== porBorrar.id))
      addToast({ kind: "ok", msg: "Regla eliminada" })
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    setBorrar(null)
  }

  const setCfg = (campo, valor) =>
    setEdit(e => ({ ...e, config: { ...e.config, [campo]: valor } }))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reglas de precio</h1>
          <p className="page-subtitle">
            Combos y descuentos por combinación · {reglas.length} regla{reglas.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default" onClick={cargar}>
            <Icon name="refresh" size={13} /> Actualizar
          </button>
          <button className="btn btn-wine" onClick={() => setEdit(reglaVacia())}>
            <Icon name="plus" size={14} /> Nueva regla
          </button>
        </div>
      </div>

      {sinTabla && (
        <div className="regla-aviso">
          <Icon name="alert" size={14} />
          <div>
            <strong>Falta crear la tabla de reglas en NocoDB.</strong> Crea una tabla con las
            columnas <code>Nombre</code>, <code>Tipo</code>, <code>Config_JSON</code>,
            <code> Activo</code> y <code>Prioridad</code>, y pon su id en la variable
            <code> NOCO_TABLE_PROMOS</code> del servidor.
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body flush">
          {cargando ? <TableSkeleton rows={4} cols={4} /> : reglas.length === 0 ? (
            <div className="empty-state" style={{ padding: 48 }}>
              <div className="muted">Todavía no hay reglas.</div>
              <div className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 6 }}>
                Sirven para que un vaso con su tapa cueste menos que por separado.
              </div>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Orden</th>
                  <th>Regla</th>
                  <th>Qué hace</th>
                  <th style={{ width: 90 }}>Activa</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map(r => (
                  <tr key={r.id} className={r.activo ? "" : "regla-off"}>
                    <td className="num">{r.prioridad ?? 100}</td>
                    <td>
                      <strong>{r.nombre}</strong>
                      <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                        {r.tipo === "proporcion" ? "Proporción" : "Combo"}
                      </div>
                    </td>
                    <td className="muted">{describirRegla(r, catalogo)}</td>
                    <td>
                      <label className="regla-switch">
                        <input type="checkbox" checked={r.activo !== false} onChange={() => alternarActivo(r)} />
                        <span>{r.activo !== false ? "Sí" : "No"}</span>
                      </label>
                    </td>
                    <td className="actions-cell">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEdit(JSON.parse(JSON.stringify({ ...reglaVacia(), ...r, config: { ...reglaVacia().config, ...r.config } })))}>
                        <Icon name="edit" size={12} />
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--err)" }} onClick={() => setBorrar(r)}>
                        <Icon name="trash" size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {reglas.length > 1 && (
        <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 10 }}>
          El orden manda: la regla de arriba se aplica primero y aparta los productos que usa,
          así ninguno recibe dos descuentos. Pon primero la que más conviene al cliente.
        </p>
      )}

      {/* ── Alta y edición ── */}
      <Modal
        open={!!editando}
        onClose={() => setEdit(null)}
        large
        title={editando?.id ? "Editar regla" : "Nueva regla de precio"}
        footer={
          <>
            <button className="btn btn-default" onClick={() => setEdit(null)} disabled={guardando}>Cancelar</button>
            <button className="btn btn-wine" onClick={guardar} disabled={guardando}>
              <Icon name="check" size={13} /> {guardando ? "Guardando…" : "Guardar regla"}
            </button>
          </>
        }
      >
        {editando && (
          <div className="form-grid cols-2">
            <div className="form-row" style={{ gridColumn: "1/-1" }}>
              <label>Nombre de la regla</label>
              <input
                value={editando.nombre}
                onChange={e => setEdit({ ...editando, nombre: e.target.value })}
                placeholder="Ej. Vaso 12 oz con su tapa"
              />
            </div>

            <div className="form-row">
              <label>Tipo</label>
              <Select
                value={editando.tipo}
                onChange={e => setEdit({ ...editando, tipo: e.target.value })}
                options={TIPOS}
              />
            </div>
            <div className="form-row">
              <label>Orden de aplicación</label>
              <input
                type="number" min="1"
                value={editando.prioridad}
                onChange={e => setEdit({ ...editando, prioridad: parseInt(e.target.value) || 10 })}
              />
            </div>

            <div style={{ gridColumn: "1/-1" }}>
              {editando.tipo === "combo" ? (
                <>
                  <div className="regla-seccion">Productos del combo</div>
                  {(editando.config.items ?? []).map((it, i) => (
                    <div key={i} className="regla-fila">
                      <SelectorProducto
                        valor={it}
                        catalogo={catalogo}
                        onChange={(v) => setCfg("items", editando.config.items.map((x, j) => j === i ? v : x))}
                      />
                      {editando.config.items.length > 2 && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--err)" }}
                          onClick={() => setCfg("items", editando.config.items.filter((_, j) => j !== i))}
                        ><Icon name="x" size={12} /></button>
                      )}
                    </div>
                  ))}
                  <button
                    className="btn btn-default btn-sm"
                    onClick={() => setCfg("items", [...editando.config.items, { sku: "", presId: "*", cant: 1 }])}
                  ><Icon name="plus" size={12} /> Agregar producto</button>
                </>
              ) : (
                <>
                  <div className="regla-seccion">Por cada…</div>
                  <SelectorProducto
                    valor={editando.config.porCada}
                    catalogo={catalogo}
                    onChange={(v) => setCfg("porCada", v)}
                  />
                  <div className="regla-seccion" style={{ marginTop: 14 }}>…lleva descuento</div>
                  <SelectorProducto
                    valor={editando.config.aplicaA}
                    catalogo={catalogo}
                    onChange={(v) => setCfg("aplicaA", v)}
                  />
                </>
              )}
            </div>

            <div className="form-row">
              <label>Tipo de beneficio</label>
              <Select
                value={editando.config.efecto?.tipo ?? "precio_paquete"}
                onChange={e => setCfg("efecto", { ...editando.config.efecto, tipo: e.target.value })}
                options={EFECTOS}
              />
            </div>
            <div className="form-row">
              <label>
                {editando.config.efecto?.tipo === "descuento_pct" ? "Porcentaje" : "Monto"}
              </label>
              <input
                type="number" step="0.01" min="0"
                value={editando.config.efecto?.valor ?? ""}
                onChange={e => setCfg("efecto", { ...editando.config.efecto, valor: e.target.value })}
                placeholder={editando.config.efecto?.tipo === "descuento_pct" ? "50" : "0.00"}
              />
            </div>

            <div style={{ gridColumn: "1/-1" }}>
              <div className="regla-preview">
                <Icon name="sparkle" size={13} />
                <span>{describirRegla(editando, catalogo)}</span>
              </div>
              <label className="iva-toggle" style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={editando.activo !== false}
                  onChange={e => setEdit({ ...editando, activo: e.target.checked })}
                />
                <span>Regla activa</span>
              </label>
            </div>
          </div>
        )}
      </Modal>

      <Confirm
        open={!!porBorrar}
        title="Eliminar regla"
        message={`¿Eliminar "${porBorrar?.nombre}"? Las ventas ya cobradas no cambian.`}
        confirmLabel="Eliminar"
        onConfirm={borrar}
        onCancel={() => setBorrar(null)}
      />
    </div>
  )
}
