import { useState, useEffect } from "react"
import Icon from "../components/Icon"
import { getFacturas, solicitarFactura, cancelarFactura } from "../api"
import { fmtMoney } from "../utils"

const USOS_CFDI = [
  { id: "G01", label: "G01 – Adquisición de mercancias" },
  { id: "G03", label: "G03 – Gastos en general" },
  { id: "I01", label: "I01 – Construcciones" },
  { id: "D01", label: "D01 – Honorarios médicos y hospitalarios" },
  { id: "S01", label: "S01 – Sin efectos fiscales" },
  { id: "CP01", label: "CP01 – Pagos" },
  { id: "CN01", label: "CN01 – Nómina" },
]

const REGIMENES = [
  { id: "601", label: "601 – General de Ley Personas Morales" },
  { id: "603", label: "603 – Personas Morales con fines no lucrativos" },
  { id: "605", label: "605 – Sueldos y Salarios" },
  { id: "606", label: "606 – Arrendamiento" },
  { id: "607", label: "607 – Régimen de Enajenación o Adquisición de Bienes" },
  { id: "608", label: "608 – Demás ingresos" },
  { id: "610", label: "610 – Residentes en el Extranjero" },
  { id: "611", label: "611 – Ingresos por Dividendos" },
  { id: "612", label: "612 – Personas Físicas con Actividades Empresariales" },
  { id: "614", label: "614 – Ingresos por intereses" },
  { id: "615", label: "615 – Régimen de los ingresos por obtención de premios" },
  { id: "616", label: "616 – Sin obligaciones fiscales" },
  { id: "620", label: "620 – Sociedades Cooperativas de Producción" },
  { id: "621", label: "621 – Incorporación Fiscal" },
  { id: "622", label: "622 – Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras" },
  { id: "623", label: "623 – Opcional para Grupos de Sociedades" },
  { id: "624", label: "624 – Coordinados" },
  { id: "625", label: "625 – Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas" },
  { id: "626", label: "626 – Régimen Simplificado de Confianza" },
]

function parseFactura(v) {
  let cfdi = null
  try { if (v.Factura_JSON) cfdi = JSON.parse(v.Factura_JSON) } catch {}
  const items = (() => { try { return JSON.parse(v.Items_JSON ?? "[]") } catch { return [] } })()
  return {
    _id: v.Id, folio: v.Folio, fecha: v.Fecha ?? "",
    cliente: v.Cliente ?? "Mostrador", vendedor: v.Vendedor ?? "",
    sucursal: v.Sucursal ?? "", metodo: v.MetodoPago ?? "",
    subtotal: v.Subtotal ?? 0, iva: v.IVA ?? 0, total: v.Total ?? 0,
    items, cfdi,
    estadoCfdi: cfdi?.estado ?? "sin_factura",
  }
}

const ESTADO_CFDI = {
  sin_factura: { label: "Sin factura",  cls: "badge-default" },
  solicitada:  { label: "Solicitada",   cls: "badge-warn"    },
  timbrada:    { label: "Timbrada",     cls: "badge-ok"      },
  enviada:     { label: "Enviada",      cls: "badge-ok"      },
  cancelada:   { label: "Cancelada",    cls: "badge-err"     },
}

const emptyForm = { rfc: "", nombreFiscal: "", usoCfdi: "G03", regimenReceptor: "626", email: "" }

export default function FacturasPage({ addToast }) {
  const [ventas, setVentas]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState("")
  const [filtroEstado, setFiltro] = useState("todas")
  const [selected, setSelected]   = useState(null)
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)

  const cargar = async () => {
    setLoading(true)
    try { setVentas((await getFacturas()).map(parseFactura)) }
    catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { cargar() }, [])

  const abrir = (v) => {
    setSelected(v)
    setForm(v.cfdi
      ? { rfc: v.cfdi.rfc ?? "", nombreFiscal: v.cfdi.nombreFiscal ?? "",
          usoCfdi: v.cfdi.usoCfdi ?? "G03", regimenReceptor: v.cfdi.regimenReceptor ?? "626",
          email: v.cfdi.email ?? "" }
      : emptyForm)
  }

  const cerrar = () => { setSelected(null); setForm(emptyForm) }

  const guardar = async () => {
    if (!form.rfc.trim()) return addToast({ kind: "warn", msg: "El RFC es obligatorio" })
    if (!form.nombreFiscal.trim()) return addToast({ kind: "warn", msg: "El nombre fiscal es obligatorio" })
    setSaving(true)
    try {
      await solicitarFactura(selected._id, form)
      addToast({ kind: "ok", msg: "Solicitud de factura guardada" })
      cerrar(); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  const quitar = async () => {
    setSaving(true)
    try {
      await cancelarFactura(selected._id)
      addToast({ kind: "ok", msg: "Datos de factura eliminados" })
      cerrar(); cargar()
    } catch (err) { addToast({ kind: "err", msg: err.message }) }
    finally { setSaving(false) }
  }

  const filtered = ventas.filter(v => {
    if (filtroEstado !== "todas" && v.estadoCfdi !== filtroEstado) return false
    const q = search.toLowerCase()
    if (q && !v.folio.toLowerCase().includes(q) && !v.cliente.toLowerCase().includes(q)) return false
    return true
  })

  const stats = {
    totalMes: ventas.reduce((s, v) => s + v.total, 0),
    sinFactura: ventas.filter(v => v.estadoCfdi === "sin_factura").length,
    solicitadas: ventas.filter(v => v.estadoCfdi === "solicitada").length,
    timbradas: ventas.filter(v => v.estadoCfdi === "timbrada" || v.estadoCfdi === "enviada").length,
  }

  const f = (key, val) => setForm(p => ({ ...p, [key]: val }))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Facturas CFDI</h1>
          <p className="page-subtitle">Solicitudes de facturación de ventas cobradas</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={cargar}>
            <Icon name="refresh-cw" size={13} /> Actualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--wine-600)" }}></div>
          <div className="kpi-label">Total ventas cobradas</div>
          <div className="kpi-value">{fmtMoney(stats.totalMes)}</div>
          <div className="kpi-delta"><span className="label">{ventas.length} notas</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--text-muted)" }}></div>
          <div className="kpi-label">Sin factura</div>
          <div className="kpi-value">{stats.sinFactura}</div>
          <div className="kpi-delta"><span className="label">notas sin CFDI</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--warn)" }}></div>
          <div className="kpi-label">Solicitadas</div>
          <div className="kpi-value">{stats.solicitadas}</div>
          <div className="kpi-delta"><span className="label">pendientes de timbrar</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--ok)" }}></div>
          <div className="kpi-label">Timbradas</div>
          <div className="kpi-value">{stats.timbradas}</div>
          <div className="kpi-delta"><span className="label">CFDI emitidos</span></div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

        {/* Lista */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card">
            <div className="card-body" style={{ paddingBottom: 0 }}>
              <div className="filter-bar">
                <div className="search-input">
                  <Icon name="search" size={14} className="icon" />
                  <input placeholder="Buscar folio o cliente…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select value={filtroEstado} onChange={e => setFiltro(e.target.value)}>
                  <option value="todas">Todas</option>
                  <option value="sin_factura">Sin factura</option>
                  <option value="solicitada">Solicitadas</option>
                  <option value="timbrada">Timbradas</option>
                  <option value="enviada">Enviadas</option>
                </select>
              </div>
            </div>
            <div className="card-body flush">
              {loading
                ? <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>Cargando…</div>
                : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Folio</th><th>Fecha</th><th>Cliente</th>
                        <th className="num">Total</th><th>CFDI</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0
                        ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>Sin resultados</td></tr>
                        : filtered.map(v => {
                          const est = ESTADO_CFDI[v.estadoCfdi] ?? ESTADO_CFDI.sin_factura
                          return (
                            <tr key={v._id} style={{ cursor: "pointer", background: selected?._id === v._id ? "var(--bg-sunken)" : undefined }}
                              onClick={() => abrir(v)}>
                              <td className="tnum">{v.folio}</td>
                              <td className="muted">{v.fecha}</td>
                              <td><strong>{v.cliente}</strong></td>
                              <td className="num">{fmtMoney(v.total)}</td>
                              <td><span className={`badge ${est.cls}`}>● {est.label}</span></td>
                              <td className="actions-cell">
                                <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); abrir(v) }}>
                                  <Icon name="file-text" size={12} />
                                </button>
                              </td>
                            </tr>
                          )
                        })
                      }
                    </tbody>
                  </table>
                )
              }
            </div>
          </div>
        </div>

        {/* Panel lateral */}
        {selected && (
          <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Resumen nota */}
            <div className="card">
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{selected.folio}</span>
                <button className="btn btn-ghost btn-sm" onClick={cerrar}><Icon name="x" size={13} /></button>
              </div>
              <div className="card-body" style={{ padding: "10px 16px" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                  {selected.fecha} · {selected.cliente} · {selected.sucursal}
                </div>
                {selected.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span>{it.qty}× {it.nombre ?? it.name} <span style={{ color: "var(--text-muted)" }}>({it.presLabel})</span></span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{fmtMoney((it.precio ?? 0) * it.qty)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                  <span>Total</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--wine-700)" }}>{fmtMoney(selected.total)}</span>
                </div>
              </div>
            </div>

            {/* Formulario CFDI */}
            <div className="card">
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Datos CFDI</span>
                {selected.cfdi && (
                  <span className={`badge ${ESTADO_CFDI[selected.estadoCfdi]?.cls ?? "badge-default"}`}>
                    ● {ESTADO_CFDI[selected.estadoCfdi]?.label}
                  </span>
                )}
              </div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>RFC Receptor *</label>
                  <input value={form.rfc} onChange={e => f("rfc", e.target.value.toUpperCase())}
                    placeholder="XAXX010101000" style={{ width: "100%", fontFamily: "var(--font-mono)", textTransform: "uppercase" }} />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Nombre o razón social *</label>
                  <input value={form.nombreFiscal} onChange={e => f("nombreFiscal", e.target.value)}
                    placeholder="Nombre fiscal del receptor" style={{ width: "100%" }} />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Uso CFDI</label>
                  <select value={form.usoCfdi} onChange={e => f("usoCfdi", e.target.value)} style={{ width: "100%" }}>
                    {USOS_CFDI.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Régimen fiscal receptor</label>
                  <select value={form.regimenReceptor} onChange={e => f("regimenReceptor", e.target.value)} style={{ width: "100%" }}>
                    {REGIMENES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Email (para enviar XML/PDF)</label>
                  <input type="email" value={form.email} onChange={e => f("email", e.target.value)}
                    placeholder="cliente@empresa.com" style={{ width: "100%" }} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  <button className="btn btn-wine" onClick={guardar} disabled={saving}>
                    <Icon name="save" size={13} />
                    {selected.cfdi ? "Actualizar solicitud" : "Solicitar factura"}
                  </button>

                  {/* Placeholder timbrado — se conectará al PAC */}
                  {selected.cfdi && selected.estadoCfdi === "solicitada" && (
                    <button className="btn btn-default" disabled title="Se habilitará al configurar el PAC (Facturapi / SAT)">
                      <Icon name="zap" size={13} /> Timbrar CFDI (pendiente PAC)
                    </button>
                  )}

                  {selected.cfdi && (
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--err)" }} onClick={quitar} disabled={saving}>
                      Quitar datos de factura
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
