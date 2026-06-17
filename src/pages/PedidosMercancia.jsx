import { useState, useEffect, useRef, useCallback } from "react"
import Icon from "../components/Icon"
import { SUCURSALES } from "../data"
import { getCatalogo, getPedidosMercancia, postPedidoMercancia } from "../api"
import { todayISO, fmtDateTime } from "../utils"

// ── ESTADOS ────────────────────────────────────────────
const ESTADOS = {
  solicitado:      { label: "Solicitado",  color: "#9aa3b0" },
  preparando:      { label: "Preparando",  color: "#d4a017" },
  en_curso:        { label: "En camino",   color: "#a02340" },
  entregado:       { label: "Entregado",   color: "#2baa5e" },
  regresando:      { label: "Regresando",  color: "#a02340" },
  finalizado:      { label: "Finalizado",  color: "#2baa5e" },
  "en tránsito":   { label: "En tránsito", color: "#9aa3b0" },
  recibido:        { label: "Recibido",    color: "#2baa5e" },
}
const STEPS = ["solicitado", "preparando", "en_curso", "entregado", "regresando", "finalizado"]

const normEst = (e) =>
  e === "en tránsito" ? "solicitado" : e === "recibido" ? "finalizado" : (e || "solicitado")

const parseMeta  = (s) => { try { return JSON.parse(s || "{}") } catch { return {} } }
const parseItems = (s) => { try { return JSON.parse(s || "[]") } catch { return [] } }

// ── API helpers ────────────────────────────────────────
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${sessionStorage.getItem("elt_token")}`,
})

const avanzarPedido = (id, body) =>
  fetch(`/api/pedidos-mercancia/${id}/avanzar`, {
    method: "POST", headers: authHeaders(), body: JSON.stringify(body),
  }).then(async r => {
    const text = await r.text()
    try { return JSON.parse(text) }
    catch { return { error: `Error del servidor (${r.status}) — reinicia el servidor` } }
  })

const fetchEquipo = () =>
  fetch("/api/equipo/lista", { headers: authHeaders() })
    .then(r => r.json())
    .catch(() => [])

const fetchNextFolio = () =>
  fetch("/api/pedidos-mercancia/next-folio", { headers: authHeaders() })
    .then(async r => { const t = await r.text(); try { return JSON.parse(t) } catch { return {} } })
    .then(d => d.folio ?? ("PM-" + Date.now().toString(36).toUpperCase()))
    .catch(() => "PM-" + Date.now().toString(36).toUpperCase())

// ── TIMER ─────────────────────────────────────────────
function Timer({ startTs, endTs }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (endTs) return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [endTs])
  const ms = (endTs ?? Date.now()) - startTs
  const s  = Math.floor(ms / 1000) % 60
  const m  = Math.floor(ms / 60000) % 60
  const h  = Math.floor(ms / 3600000)
  return <span className="pm-timer-val">{h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`}</span>
}

// ── TRUCK ROUTE ───────────────────────────────────────
const TRIP_MS = 25 * 60 * 1000   // 25 minutos en ms

function TruckRoute({ estado, destinoLabel, timers = {} }) {
  const est = normEst(estado)

  const calcPos = () => {
    if (est === "entregado") return 1
    if (est === "en_curso" && timers.inicio_curso)
      return Math.min(1, (Date.now() - timers.inicio_curso) / TRIP_MS)
    if (est === "regresando" && timers.inicio_regreso)
      return Math.min(1, (Date.now() - timers.inicio_regreso) / TRIP_MS)
    return 0
  }

  const [pos, setPos] = useState(calcPos)

  useEffect(() => {
    setPos(calcPos())
    if (est !== "en_curso" && est !== "regresando") return
    const id = setInterval(() => setPos(calcPos()), 1000)
    return () => clearInterval(id)
  }, [est, timers.inicio_curso, timers.inicio_regreso])

  const going    = est === "en_curso"
  const returning = est === "regresando"
  // going: 0→1 izq→der  |  returning: 1→0 der→izq
  const xPct = going ? pos : returning ? 1 - pos : est === "entregado" ? 1 : 0

  return (
    <div className="tr-route">
      <div className="tr-endpoint">
        <div className="tr-ep-icon"><Icon name="warehouse" size={11} /></div>
        <span>Bodega</span>
      </div>

      <div className="tr-road-wrap">
        <div className="tr-road">
          <div className="tr-road-line" />
          <div
            className="tr-truck-wrap"
            style={{
              left: `calc(${xPct} * (100% - 32px) + 4px)`,
              transform: returning ? "translateY(-50%) scaleX(-1)" : "translateY(-50%)",
            }}
          >
            <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
              <rect x="0" y="3" width="16" height="9" rx="1.5" fill="var(--wine-600)" />
              <path d="M16 6h7l2 4.5V14H16V6z" fill="var(--wine-700)" />
              <rect x="2" y="4.5" width="5" height="3.5" rx="1" fill="rgba(255,255,255,.22)" />
              <circle cx="5"  cy="13.5" r="2.2" fill="#222" stroke="rgba(255,255,255,.45)" strokeWidth=".8" />
              <circle cx="20" cy="13.5" r="2.2" fill="#222" stroke="rgba(255,255,255,.45)" strokeWidth=".8" />
            </svg>
          </div>
        </div>
      </div>

      <div className="tr-endpoint" style={{ textAlign: "right" }}>
        <div className="tr-ep-icon"><Icon name="building" size={11} /></div>
        <span>{destinoLabel}</span>
      </div>
    </div>
  )
}

// ── STEP BAR ──────────────────────────────────────────
function StepBar({ estado }) {
  const cur = STEPS.indexOf(normEst(estado))
  return (
    <div className="pm-steps">
      {STEPS.map((s, i) => (
        <div key={s} className={`pm-step ${i < cur ? "past" : i === cur ? "active" : ""}`}>
          {i < STEPS.length - 1 && (
            <div
              className={`pm-step-line ${i < cur ? "done" : ""}`}
              style={i < cur ? { "--line-delay": `${i * 0.1}s` } : {}}
            />
          )}
          <div className="pm-step-dot">{i < cur ? <Icon name="check" size={9} /> : null}</div>
          <div className="pm-step-lbl">{ESTADOS[s]?.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── CHECKLIST ─────────────────────────────────────────
export function checklistCompleto(checklist) {
  if (!checklist.length) return true
  return checklist.every(it => it.preparado || (it.noHay && it.nota?.trim()))
}

function ChecklistPanel({ checklist, onChange, readOnly }) {
  const total     = checklist.length
  const listos    = checklist.filter(i => i.preparado).length
  const sinStock  = checklist.filter(i => i.noHay).length
  const pendientes = total - listos - sinStock
  const pct       = total ? Math.round(((listos + sinStock) / total) * 100) : 0

  return (
    <div className="pm-checklist">
      <div className="pm-cl-head">
        <span className="pm-cl-title">Lista de empaque</span>
        <span className="pm-cl-prog">
          {listos + sinStock}/{total}
          {pendientes > 0 && <span className="pm-cl-issues"> · {pendientes} pendiente{pendientes > 1 ? "s" : ""}</span>}
          {sinStock > 0 && <span className="pm-cl-nohay-count"> · {sinStock} sin stock</span>}
        </span>
        <div className="pm-cl-bar">
          <div className="pm-cl-bar-fill" style={{ width: pct + "%" }} />
        </div>
      </div>

      <div className="pm-cl-items">
        {checklist.map((it, i) => {
          const notaRequerida = it.noHay && !it.nota?.trim()
          return (
            <div key={it.id} className={`pm-cl-item ${it.preparado ? "ready" : it.noHay ? "nohay" : ""}`}>
              <div className="pm-cl-btns">
                {/* ✓ hay */}
                <button
                  className={`pm-cl-chk ${it.preparado ? "on" : ""}`}
                  disabled={readOnly || it.noHay}
                  title="Hay / listo"
                  onClick={() => !readOnly && onChange(checklist.map((x, j) =>
                    j !== i ? x : { ...x, preparado: !x.preparado, noHay: false }
                  ))}
                >
                  {it.preparado ? <Icon name="check" size={10} /> : null}
                </button>
                {/* ✕ no hay */}
                <button
                  className={`pm-cl-x ${it.noHay ? "on" : ""}`}
                  disabled={readOnly || it.preparado}
                  title="No hay / sin stock"
                  onClick={() => !readOnly && onChange(checklist.map((x, j) =>
                    j !== i ? x : { ...x, noHay: !x.noHay, preparado: false }
                  ))}
                >
                  ✕
                </button>
              </div>

              <div className="pm-cl-info">
                <div className="pm-cl-name">{it.nombre}</div>
                <div className="pm-cl-qty">{it.qty} {it.unidad}</div>
                {/* Nota inline — requerida si noHay, opcional si preparado */}
                {!readOnly && (it.preparado || it.noHay) && (
                  <input
                    className={`pm-cl-nota${notaRequerida ? " required" : ""}`}
                    placeholder={it.noHay ? "Motivo obligatorio…" : "Nota (opcional)…"}
                    value={it.nota ?? ""}
                    onChange={e => onChange(checklist.map((x, j) =>
                      j !== i ? x : { ...x, nota: e.target.value }
                    ))}
                  />
                )}
                {readOnly && it.nota && (
                  <span className="pm-cl-nota-ro">{it.nota}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!readOnly && !checklistCompleto(checklist) && (
        <div className="pm-cl-warning">
          <Icon name="alert" size={12} />
          {checklist.some(it => it.noHay && !it.nota?.trim())
            ? "Agrega el motivo de los productos sin stock para continuar"
            : "Marca cada producto como listo o sin stock para continuar"}
        </div>
      )}
    </div>
  )
}

// ── CONFIRM MODAL ─────────────────────────────────────
function ConfirmModal({ titulo, descripcion, usuarios, onConfirm, onCancel }) {
  const [nombre,  setNombre]  = useState("")
  const [pass,    setPass]    = useState("")
  const [err,     setErr]     = useState("")
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!nombre) { setErr("Selecciona quién confirma"); return }
    if (!pass)   { setErr("Ingresa tu contraseña"); return }
    setErr(""); setLoading(true)
    const res = await onConfirm({ nombre, contrasena: pass })
    if (res?.error) { setErr(res.error); setLoading(false) }
  }

  return (
    <div className="pm-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="pm-modal">
        <h3 className="pm-modal-title">{titulo}</h3>
        {descripcion && <p className="pm-modal-desc">{descripcion}</p>}

        <div className="pm-modal-field">
          <label>¿Quién confirma?</label>
          <div className="pm-user-grid">
            {(usuarios ?? []).map(u => (
              <button
                key={u.nombre}
                className={`pm-user-btn ${nombre === u.nombre ? "sel" : ""}`}
                onClick={() => setNombre(u.nombre)}
              >
                <div className="pm-user-av">{(u.nombre || "?")[0].toUpperCase()}</div>
                <div>
                  <div className="pm-user-nombre">{u.nombre}</div>
                  <div className="pm-user-suc">{u.sucursal}</div>
                </div>
              </button>
            ))}
            {(!usuarios || usuarios.length === 0) && (
              <input
                placeholder="Tu nombre"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                className="pm-modal-input"
              />
            )}
          </div>
        </div>

        <div className="pm-modal-field">
          <label>Contraseña</label>
          <input
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            placeholder="••••••••"
            className="pm-modal-input"
            onKeyDown={e => e.key === "Enter" && submit()}
          />
        </div>

        {err && (
          <div className="pm-modal-err">
            <Icon name="alert" size={13} /> {err}
          </div>
        )}

        <div className="pm-modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-wine" onClick={submit} disabled={loading}>
            {loading ? "Verificando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PEDIDO CARD ───────────────────────────────────────
function PedidoCard({ pedido, esBodega, usuarios, onRefresh, addToast }) {
  const meta   = parseMeta(pedido.Meta_JSON)
  const items  = parseItems(pedido.Items_JSON)
  const estado = pedido.Estado ?? "solicitado"
  const norm   = normEst(estado)
  const cfg    = ESTADOS[norm] ?? ESTADOS.solicitado
  const timers = meta.timers ?? {}

  const [chk,     setChk]     = useState(meta.checklist ?? [])
  const [saving,  setSaving]  = useState(false)
  const [confirm, setConfirm] = useState(null) // { accion }
  const listo = checklistCompleto(chk)
  const [open,    setOpen]    = useState(!["finalizado", "recibido"].includes(estado))
  const saveRef = useRef(null)

  // Sync checklist when meta changes (after refresh)
  useEffect(() => {
    if (meta.checklist) setChk(meta.checklist)
  }, [pedido.Meta_JSON])

  const doAvanzar = async (accion, extra = {}) => {
    setSaving(true)
    try {
      const res = await avanzarPedido(pedido.Id, { accion, ...extra })
      if (res?.error) { addToast({ kind: "err", msg: res.error }); return res }
      addToast({ kind: "ok", msg: "Actualizado" })
      onRefresh()
      return res
    } catch (err) {
      addToast({ kind: "err", msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleChk = (list) => {
    setChk(list)
    clearTimeout(saveRef.current)
    saveRef.current = setTimeout(() => {
      avanzarPedido(pedido.Id, { accion: "checklist", checklist: list })
    }, 900)
  }

  const handleConfirm = async (datos) => {
    const res = await doAvanzar(confirm.accion, datos)
    if (!res?.error) setConfirm(null)
    return res
  }

  const destLabel = pedido.Destino ?? "Sucursal"

  return (
    <div className={`pm-card pm-card-${norm}`}>
      {/* ── header ── */}
      <div className="pm-card-head" onClick={() => setOpen(o => !o)}>
        <div className="pm-card-left">
          <span className="pm-folio">{pedido.Folio}</span>
          <span className="pm-fecha">{fmtDateTime(meta.ts_creado) ?? pedido.Fecha}</span>
        </div>
        <div className="pm-card-dest">
          <Icon name="building" size={11} />
          {destLabel}
        </div>
        <span className="badge pm-estado-badge" style={{ background: cfg.color + "22", color: cfg.color }}>
          ● {cfg.label}
        </span>
        <span className="pm-items-count">{items.length} art.</span>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={13} />
      </div>

      {/* ── body ── */}
      {open && (
        <div className="pm-card-body">
          {pedido.Observaciones && (
            <div className="pm-obs">
              <Icon name="alert" size={12} />
              <span>{pedido.Observaciones}</span>
            </div>
          )}
          <TruckRoute estado={norm} destinoLabel={destLabel} timers={timers} />
          <StepBar estado={norm} />

          {/* Timers */}
          {(timers.inicio_curso || timers.inicio_regreso) && (
            <div className="pm-timers">
              {timers.inicio_curso && (
                <div className="pm-timer-row">
                  <Icon name="truck" size={11} />
                  <span className="pm-timer-lbl">En camino:</span>
                  <Timer startTs={timers.inicio_curso} endTs={timers.fin_curso} />
                </div>
              )}
              {timers.inicio_regreso && (
                <div className="pm-timer-row">
                  <Icon name="refresh" size={11} />
                  <span className="pm-timer-lbl">Regreso:</span>
                  <Timer startTs={timers.inicio_regreso} endTs={timers.fin_regreso} />
                </div>
              )}
            </div>
          )}

          {/* Confirmations */}
          {meta.confirmacion_entrega && (
            <div className="pm-confirm-info">
              <Icon name="check" size={12} />
              Recibido por <strong>{meta.confirmacion_entrega.nombre}</strong> · {meta.confirmacion_entrega.hora}
            </div>
          )}
          {meta.confirmacion_regreso && (
            <div className="pm-confirm-info">
              <Icon name="check" size={12} />
              Regreso confirmado por <strong>{meta.confirmacion_regreso.nombre}</strong>
            </div>
          )}

          {/* Checklist when preparando */}
          {norm === "preparando" && chk.length > 0 && (
            <ChecklistPanel checklist={chk} onChange={handleChk} readOnly={!esBodega} />
          )}

          {/* Items list (other states) */}
          {norm !== "preparando" && items.length > 0 && (
            <div className="pm-items-list">
              {items.map((it, i) => (
                <div key={i} className="pm-item-row">
                  <span className="pm-item-name">{it.name ?? it.nombre}</span>
                  <span className="pm-item-qty">{it.qty} {it.presLabel ?? it.unidad ?? ""}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="pm-card-actions">
            {esBodega && norm === "solicitado" && (
              <button className="btn btn-wine btn-sm" disabled={saving} onClick={() => doAvanzar("aceptar")}>
                <Icon name="box" size={13} /> Aceptar y preparar
              </button>
            )}
            {esBodega && norm === "preparando" && (
              <button
                className="btn btn-wine btn-sm"
                disabled={saving || !listo}
                title={!listo ? "Completa el checklist antes de iniciar" : ""}
                onClick={() => doAvanzar("iniciar")}
              >
                <Icon name="truck" size={13} /> Iniciar envío
              </button>
            )}
            {norm === "en_curso" && (
              <button className="btn btn-wine btn-sm" disabled={saving} onClick={() => setConfirm({ accion: "confirmar_entrega" })}>
                <Icon name="check" size={13} /> Confirmar recepción
              </button>
            )}
            {(esBodega || norm === "entregado") && norm === "entregado" && (
              <button className="btn btn-wine btn-sm" disabled={saving} onClick={() => doAvanzar("iniciar_regreso")}>
                <Icon name="refresh" size={13} /> Iniciar regreso
              </button>
            )}
            {norm === "regresando" && (
              <button className="btn btn-wine btn-sm" disabled={saving} onClick={() => setConfirm({ accion: "confirmar_llegada" })}>
                <Icon name="warehouse" size={13} /> Confirmar llegada
              </button>
            )}
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          titulo={confirm.accion === "confirmar_entrega" ? "Confirmar recepción de mercancía" : "Confirmar llegada a bodega"}
          descripcion={confirm.accion === "confirmar_entrega"
            ? `Confirma que la mercancía llegó a ${destLabel}. El stock se actualizará automáticamente.`
            : "Confirma que el repartidor regresó a bodega."}
          usuarios={usuarios}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

// ── BODEGA VIEW ───────────────────────────────────────
function BodegaView({ user, usuarios, pedidos, onRefresh, addToast }) {
  const active  = pedidos.filter(p => !["finalizado", "recibido"].includes(p.Estado ?? ""))
  const history = pedidos.filter(p => ["finalizado", "recibido"].includes(p.Estado ?? ""))
  const nuevos  = active.filter(p => ["solicitado", "en tránsito"].includes(p.Estado ?? "solicitado")).length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pedidos de Mercancía</h1>
          <p className="page-subtitle">Gestión de envíos · Bodega</p>
        </div>
        {nuevos > 0 && (
          <div className="pm-nuevos-badge">
            <Icon name="bell" size={13} />
            {nuevos} solicitud{nuevos > 1 ? "es" : ""} nueva{nuevos > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {active.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: "center", padding: 56, color: "var(--text-muted)" }}>
            <Icon name="truck" size={36} />
            <div style={{ marginTop: 12, fontSize: 14 }}>Sin pedidos activos</div>
          </div>
        </div>
      ) : (
        <div className="pm-list">
          {active.map(p => (
            <PedidoCard key={p.Id} pedido={p} esBodega usuarios={usuarios} onRefresh={onRefresh} addToast={addToast} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <details className="pm-history">
          <summary>Historial — {history.length} finalizados</summary>
          <div className="pm-list" style={{ marginTop: 10 }}>
            {history.slice(0, 30).map(p => (
              <PedidoCard key={p.Id} pedido={p} esBodega usuarios={usuarios} onRefresh={onRefresh} addToast={addToast} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ── SUCURSAL VIEW ─────────────────────────────────────
function SucursalView({ user, sucursal, usuarios, pedidos, onRefresh, addToast }) {
  const [mode,     setMode]     = useState("active")
  const [cart,     setCart]     = useState([])
  const [prods,    setProds]    = useState([])
  const [search,   setSearch]   = useState("")
  const [obs,      setObs]      = useState("")
  const [saving,   setSaving]   = useState(false)
  const [loadProds, setLoadProds] = useState(false)

  const sucObj = SUCURSALES.find(s => s.id === sucursal)
  // Match by sucursal id OR by any part of the name (e.g. "centro" matches "Tianguis Centro")
  const myPedidos = pedidos.filter(p => {
    const d = (p.Destino ?? "").toLowerCase()
    return d.includes((sucursal ?? "").toLowerCase()) ||
           (sucObj?.name && d.includes(sucObj.name.toLowerCase())) ||
           (sucObj?.short && d.includes(sucObj.short.toLowerCase()))
  })
  const active  = myPedidos.filter(p => !["finalizado", "recibido"].includes(p.Estado ?? ""))
  const history = myPedidos.filter(p => ["finalizado", "recibido"].includes(p.Estado ?? ""))

  useEffect(() => {
    if (mode === "new" && prods.length === 0) {
      setLoadProds(true)
      getCatalogo().then(setProds).finally(() => setLoadProds(false))
    }
  }, [mode])

  const filtered = prods.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search)
  )

  const addToCart = (p) =>
    setCart(c => {
      const ex = c.find(i => i.sku === p.sku)
      if (ex) return c.map(i => i.sku === p.sku ? { ...i, qty: i.qty + 1 } : i)
      return [...c, { sku: p.sku, name: p.name, unidad: p.unidad, qty: 1 }]
    })

  const setQty = (sku, qty) => {
    if (qty <= 0) return setCart(c => c.filter(i => i.sku !== sku))
    setCart(c => c.map(i => i.sku === sku ? { ...i, qty } : i))
  }

  const numItems = cart.reduce((s, i) => s + i.qty, 0)

  const enviar = async () => {
    if (!cart.length) return
    setSaving(true)
    try {
      const folio = await fetchNextFolio()
      await postPedidoMercancia({
        folio,
        fecha: todayISO(),
        proveedor: "",
        destino: sucObj?.name ?? sucursal,
        estado: "solicitado",
        fechaEntrega: null,
        total: 0,
        items: cart,
        observaciones: obs,
      })
      addToast({ kind: "ok", msg: "Solicitud enviada a bodega" })
      setMode("active"); setCart([]); setObs("")
      onRefresh()
    } catch (err) {
      addToast({ kind: "err", msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  /* ── new order form ── */
  if (mode === "new") {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden", paddingBottom: 0, paddingLeft: 12, paddingRight: 12 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Nueva solicitud de mercancía</h1>
            <p className="page-subtitle">{numItems} artículo{numItems !== 1 ? "s" : ""} · irá a bodega para preparación</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-default btn-sm" onClick={() => setMode("active")}>
              <Icon name="chevronLeft" size={13} /> Volver
            </button>
          </div>
        </div>

        <div className="sales-shell">
          <div className="sales-products">
            <div className="filter-bar" style={{ marginBottom: 4 }}>
              <div className="search-input" style={{ flex: 1, maxWidth: 360 }}>
                <Icon name="search" size={14} className="icon" />
                <input placeholder="Buscar producto…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="products-grid">
              {loadProds && <div style={{ gridColumn: "1/-1", padding: 48, textAlign: "center", color: "var(--text-muted)" }}>Cargando…</div>}
              {filtered.map(p => (
                <button key={p.sku} className="product-tile" onClick={() => addToCart(p)}>
                  <div className="sku">{p.sku}</div>
                  <div className="name">{p.name}</div>
                  <div className="meta"><span>{p.unidad}</span></div>
                </button>
              ))}
            </div>
          </div>

          <div className="sales-cart">
            <div className="cart-card">
              <div className="cart-header">
                <h3>Solicitud</h3>
                <span className="count">{numItems} arts.</span>
              </div>
              <div className="cart-items">
                {cart.length === 0 ? (
                  <div className="cart-empty">
                    <div className="big"><Icon name="box" size={28} /></div>
                    <div>Agrega los productos<br />que necesitas</div>
                  </div>
                ) : cart.map(it => (
                  <div key={it.sku} className="cart-item">
                    <div style={{ flex: 1 }}>
                      <div className="name">{it.name}</div>
                      <div className="sku">{it.sku}</div>
                      <div className="line2">
                        <div className="qty-stepper">
                          <button onClick={() => setQty(it.sku, it.qty - 1)}>−</button>
                          <input type="number" min="1" value={it.qty} onChange={e => setQty(it.sku, parseInt(e.target.value) || 0)} />
                          <button onClick={() => setQty(it.sku, it.qty + 1)}>+</button>
                        </div>
                      </div>
                    </div>
                    <button className="remove" onClick={() => setQty(it.sku, 0)}><Icon name="x" size={12} /></button>
                  </div>
                ))}
              </div>
              {obs !== undefined && (
                <div style={{ padding: "0 12px 10px" }}>
                  <textarea
                    rows={2}
                    value={obs}
                    onChange={e => setObs(e.target.value)}
                    placeholder="Notas / observaciones (opcional)"
                    style={{ width: "100%", fontSize: 12, borderRadius: 6, border: "1px solid var(--border)", padding: "6px 8px", background: "var(--bg-sunken)", color: "var(--text-primary)", resize: "none" }}
                  />
                </div>
              )}
              <div className="cart-actions">
                <button className="btn btn-default" onClick={() => setCart([])} disabled={!cart.length}>
                  <Icon name="trash" size={13} /> Vaciar
                </button>
                <button className="btn btn-wine" onClick={enviar} disabled={!cart.length || saving}>
                  {saving ? "Enviando…" : <><Icon name="upload" size={13} /> Enviar a bodega</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── active orders view ── */
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mis pedidos de mercancía</h1>
          <p className="page-subtitle">{sucObj?.name ?? sucursal}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-wine btn-sm" onClick={() => setMode("new")}>
            <Icon name="plus" size={13} /> Nueva solicitud
          </button>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: "center", padding: 56, color: "var(--text-muted)" }}>
            <Icon name="truck" size={36} />
            <div style={{ marginTop: 12, fontSize: 14 }}>Sin pedidos activos</div>
            <button className="btn btn-wine btn-sm" style={{ marginTop: 16 }} onClick={() => setMode("new")}>
              <Icon name="plus" size={13} /> Crear solicitud
            </button>
          </div>
        </div>
      ) : (
        <div className="pm-list">
          {active.map(p => (
            <PedidoCard key={p.Id} pedido={p} esBodega={false} usuarios={usuarios} onRefresh={onRefresh} addToast={addToast} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <details className="pm-history">
          <summary>Historial — {history.length} finalizados</summary>
          <div className="pm-list" style={{ marginTop: 10 }}>
            {history.slice(0, 20).map(p => (
              <PedidoCard key={p.Id} pedido={p} esBodega={false} usuarios={usuarios} onRefresh={onRefresh} addToast={addToast} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ── PAGE ──────────────────────────────────────────────
export default function PedidosMercanciaPage({ addToast, user }) {
  const [pedidos,  setPedidos]  = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading,  setLoading]  = useState(true)

  const sucursal = user?.sucursal
  const esBodega = sucursal === "bodega"

  const cargar = useCallback(() =>
    Promise.all([
      getPedidosMercancia(),
      fetchEquipo(), // already .catch(() => []) — never rejects
    ])
      .then(([peds, eqs]) => {
        setPedidos(Array.isArray(peds) ? peds : [])
        setUsuarios(Array.isArray(eqs) ? eqs : [])
      })
      .catch(() => {}) // ignore network failures silently
      .finally(() => setLoading(false)),
  [])

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 15000)
    return () => clearInterval(t)
  }, [cargar])

  if (loading)
    return (
      <div className="page">
        <div style={{ padding: 56, textAlign: "center", color: "var(--text-muted)" }}>
          <Icon name="truck" size={28} />
          <div style={{ marginTop: 12 }}>Cargando pedidos…</div>
        </div>
      </div>
    )

  if (esBodega)
    return <BodegaView user={user} usuarios={usuarios} pedidos={pedidos} onRefresh={cargar} addToast={addToast} />

  return <SucursalView user={user} sucursal={sucursal} usuarios={usuarios} pedidos={pedidos} onRefresh={cargar} addToast={addToast} />
}
