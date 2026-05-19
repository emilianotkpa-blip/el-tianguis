import { useState, useEffect } from "react"
import Icon from "../components/Icon"
import {
  VENTAS_DIARIAS_30D, VENTAS_MENSUALES, UTIL_POR_CATEGORIA,
  TOP_PRODUCTOS, VENTAS_POR_SUCURSAL
} from "../data"
import { fmtMoney, fmtMoneyShort } from "../utils"

function useCountUp(target, duration = 800) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    const start = performance.now()
    let raf
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return val
}

function LineChart({ data, height = 180, color = "var(--wine-700)" }) {
  const w = 600
  const h = height
  const padL = 40, padR = 12, padT = 12, padB = 26
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const max = Math.max(...data) * 1.1
  const stepX = innerW / (data.length - 1)
  const points = data.map((v, i) => [padL + i * stepX, padT + innerH - (v / max) * innerH])
  const path = points.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" ")
  const area = path + ` L ${padL + innerW},${padT + innerH} L ${padL},${padT + innerH} Z`
  const yTicks = [0, .25, .5, .75, 1].map((t) => ({ v: max * t, y: padT + innerH - t * innerH }))
  const [hover, setHover] = useState(null)

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * w
        const idx = Math.round((x - padL) / stepX)
        if (idx >= 0 && idx < data.length) setHover(idx)
      }}
    >
      <defs>
        <linearGradient id="grad-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={t.y} y2={t.y} className="chart-grid-line" />
          <text x={padL - 6} y={t.y + 3} className="chart-axis-label" textAnchor="end">{fmtMoneyShort(t.v)}</text>
        </g>
      ))}
      <path d={area} fill="url(#grad-area)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {hover !== null && points[hover] && (
        <g>
          <line x1={points[hover][0]} x2={points[hover][0]} y1={padT} y2={padT + innerH} stroke="var(--text-muted)" strokeDasharray="3 3" />
          <circle cx={points[hover][0]} cy={points[hover][1]} r="4" fill={color} stroke="#fff" strokeWidth="2" />
          <g transform={`translate(${Math.min(points[hover][0] + 8, w - 110)}, ${Math.max(points[hover][1] - 30, padT)})`}>
            <rect width="100" height="32" rx="3" fill="var(--gray-800)" />
            <text x="8" y="13" fill="#fff" fontSize="10" opacity=".7">Día {hover + 1}</text>
            <text x="8" y="26" fill="#fff" fontSize="12" fontWeight="600">{fmtMoney(data[hover])}</text>
          </g>
        </g>
      )}
      <text x={padL} y={h - 8} className="chart-axis-label">Día 1</text>
      <text x={w - padR} y={h - 8} className="chart-axis-label" textAnchor="end">Día {data.length}</text>
    </svg>
  )
}

function GroupedBars({ data, height = 220 }) {
  const w = 600
  const h = height
  const padL = 50, padR = 10, padT = 14, padB = 32
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const max = Math.max(...data.map((d) => d.ingresos)) * 1.15
  const grpW = innerW / data.length
  const barW = (grpW - 12) / 2
  const yTicks = [0, .25, .5, .75, 1].map((t) => ({ v: max * t, y: padT + innerH - t * innerH }))

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={t.y} y2={t.y} className="chart-grid-line" />
          <text x={padL - 6} y={t.y + 3} className="chart-axis-label" textAnchor="end">{fmtMoneyShort(t.v)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + i * grpW + 6
        const hI = (d.ingresos / max) * innerH
        const hC = (d.costos / max) * innerH
        return (
          <g key={i}>
            <rect x={x} y={padT + innerH - hI} width={barW} height={hI} fill="var(--wine-700)" rx="2">
              <title>{d.mes} · Ingresos {fmtMoney(d.ingresos)}</title>
            </rect>
            <rect x={x + barW + 4} y={padT + innerH - hC} width={barW} height={hC} fill="var(--gray-400)" rx="2">
              <title>{d.mes} · Costos {fmtMoney(d.costos)}</title>
            </rect>
            <text x={x + barW + 2} y={h - 12} className="chart-axis-label" textAnchor="middle">{d.mes}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Donut({ data, size = 160, label = "" }) {
  const total = data.reduce((s, d) => s + d.pct, 0)
  const r = size / 2 - 12
  const cx = size / 2, cy = size / 2
  let angle = -Math.PI / 2
  const arcs = data.map((d) => {
    const a = (d.pct / total) * Math.PI * 2
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    const x2 = cx + r * Math.cos(angle + a)
    const y2 = cy + r * Math.sin(angle + a)
    const large = a > Math.PI ? 1 : 0
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
    angle += a
    return { path, color: d.color, ...d }
  })
  return (
    <svg width={size} height={size} className="donut-svg">
      {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color}><title>{a.cat}: {a.pct}%</title></path>)}
      <circle cx={cx} cy={cy} r={r * .58} fill="var(--bg-elev)" />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="11" fill="var(--text-muted)" style={{ textTransform: "uppercase", letterSpacing: 1 }}>Mix</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--text)">{label || "100%"}</text>
    </svg>
  )
}

export default function UtilidadesPage() {
  const [range, setRange] = useState("30d")

  const totalMes = VENTAS_MENSUALES[VENTAS_MENSUALES.length - 1]
  const prevMes  = VENTAS_MENSUALES[VENTAS_MENSUALES.length - 2]
  const margenPct = ((totalMes.utilidad / totalMes.ingresos) * 100).toFixed(1)
  const deltaIngresos = (((totalMes.ingresos - prevMes.ingresos) / prevMes.ingresos) * 100).toFixed(1)
  const deltaUtilidad = (((totalMes.utilidad - prevMes.utilidad) / prevMes.utilidad) * 100).toFixed(1)

  const ingresos = useCountUp(totalMes.ingresos)
  const utilidad = useCountUp(totalMes.utilidad)
  const margen   = useCountUp(parseFloat(margenPct))
  const tickets  = useCountUp(486)
  const maxVentas = Math.max(...TOP_PRODUCTOS.map((p) => p.ventas))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Utilidades &amp; análisis</h1>
          <p className="page-subtitle">Reportes de rentabilidad, ventas y desempeño · Periodo: Abril 2026</p>
        </div>
        <div className="page-actions">
          <div className="range-toggle">
            {["7d", "30d", "90d", "ytd"].map((r) => (
              <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
                {r === "ytd" ? "Año" : r}
              </button>
            ))}
          </div>
          <button className="btn btn-default btn-sm"><Icon name="download" size={13} /> Exportar reporte</button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-accent"></div>
          <div className="kpi-label">Ingresos del mes</div>
          <div className="kpi-value">{fmtMoney(Math.round(ingresos))}</div>
          <div className="kpi-delta up">▲ {deltaIngresos}% <span className="label">vs. marzo</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--ok)" }}></div>
          <div className="kpi-label">Utilidad neta</div>
          <div className="kpi-value">{fmtMoney(Math.round(utilidad))}</div>
          <div className="kpi-delta up">▲ {deltaUtilidad}% <span className="label">vs. marzo</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--info)" }}></div>
          <div className="kpi-label">Margen promedio</div>
          <div className="kpi-value">{margen.toFixed(1)}%</div>
          <div className="kpi-delta up">▲ 1.2 pts</div>
        </div>
        <div className="kpi">
          <div className="kpi-accent" style={{ background: "var(--warn)" }}></div>
          <div className="kpi-label">Tickets emitidos</div>
          <div className="kpi-value">{Math.round(tickets)}</div>
          <div className="kpi-delta up">▲ 8.3% <span className="label">vs. marzo</span></div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card col-8">
          <div className="card-header">
            <div>
              <h3 className="card-title">Ingresos diarios — últimos 30 días</h3>
              <div className="card-subtitle">Tendencia de ventas brutas (sin IVA)</div>
            </div>
            <div className="legend">
              <span><span className="swatch" style={{ background: "var(--wine-700)" }}></span>Ingresos</span>
            </div>
          </div>
          <div className="card-body">
            <LineChart data={VENTAS_DIARIAS_30D} height={220} />
          </div>
        </div>

        <div className="card col-4">
          <div className="card-header">
            <h3 className="card-title">Mix por categoría</h3>
          </div>
          <div className="card-body">
            <div className="donut-wrap">
              <Donut data={UTIL_POR_CATEGORIA} size={160} label="100%" />
              <div className="donut-legend">
                {UTIL_POR_CATEGORIA.map((d) => (
                  <div className="item" key={d.cat}>
                    <div className="left"><span className="swatch" style={{ background: d.color }}></span>{d.cat}</div>
                    <span className="pct">{d.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="card col-8">
          <div className="card-header">
            <div>
              <h3 className="card-title">Ingresos vs. costos · 6 meses</h3>
              <div className="card-subtitle">Desempeño mensual comparado</div>
            </div>
            <div className="legend">
              <span><span className="swatch" style={{ background: "var(--wine-700)" }}></span>Ingresos</span>
              <span><span className="swatch" style={{ background: "var(--gray-400)" }}></span>Costos</span>
            </div>
          </div>
          <div className="card-body">
            <GroupedBars data={VENTAS_MENSUALES} height={240} />
          </div>
        </div>

        <div className="card col-4">
          <div className="card-header">
            <h3 className="card-title">Top productos</h3>
            <span className="muted" style={{ fontSize: 11 }}>Por ingresos</span>
          </div>
          <div className="card-body">
            <div className="bar-list">
              {TOP_PRODUCTOS.map((p, i) => (
                <div key={i} className="bar-row">
                  <div className="row-top">
                    <span className="name">{p.name}</span>
                    <span className="val">{fmtMoney(p.ventas)}</span>
                  </div>
                  <div className="track">
                    <div className="fill" style={{ width: ((p.ventas / maxVentas) * 100) + "%" }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card col-6">
          <div className="card-header">
            <h3 className="card-title">Desempeño por sucursal</h3>
          </div>
          <div className="card-body">
            <div className="bar-list">
              {VENTAS_POR_SUCURSAL.map((s, i) => (
                <div key={i} className="bar-row">
                  <div className="row-top">
                    <span className="name">{s.sucursal}</span>
                    <span className="val">{fmtMoney(s.monto)} <span className="muted">({s.pct}%)</span></span>
                  </div>
                  <div className="track"><div className="fill" style={{ width: s.pct + "%" }}></div></div>
                </div>
              ))}
            </div>
            <div className="divider"></div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--text)" }}>Tianguis Centro</strong> sigue siendo la sucursal de mayor volumen. Repostero creció 6.4 pts vs. mes anterior.
            </div>
          </div>
        </div>

        <div className="card col-6">
          <div className="card-header">
            <h3 className="card-title">Resumen ejecutivo</h3>
          </div>
          <div className="card-body">
            <table className="table" style={{ fontSize: 12 }}>
              <tbody>
                <tr><td className="muted">Ticket promedio</td><td className="num"><strong>$586.40</strong></td><td className="num" style={{ color: "var(--ok)" }}>+4.2%</td></tr>
                <tr><td className="muted">Cobranza pendiente</td><td className="num"><strong>$8,506</strong></td><td className="num" style={{ color: "var(--warn)" }}>2 facturas</td></tr>
                <tr><td className="muted">Rotación inventario</td><td className="num"><strong>4.2x</strong></td><td className="num" style={{ color: "var(--ok)" }}>+0.3</td></tr>
                <tr><td className="muted">Días promedio cobro</td><td className="num"><strong>11.4 d</strong></td><td className="num" style={{ color: "var(--ok)" }}>−1.2 d</td></tr>
                <tr><td className="muted">SKUs con stock bajo</td><td className="num"><strong>9</strong></td><td className="num" style={{ color: "var(--err)" }}>+3</td></tr>
                <tr><td className="muted">Margen bruto</td><td className="num"><strong>{margenPct}%</strong></td><td className="num" style={{ color: "var(--ok)" }}>+1.2 pts</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
