import Icon from "./Icon"
import { fmtMoney } from "../utils"

// ── Modal de selección de presentación ─────────────────
export default function PresPicker({ producto, suc, onSelect, onClose, cart }) {
  const isBolsa = producto.tipo === "bolsas"
  const pres    = (producto.presentaciones || []).filter(p =>
    isBolsa ? p.id !== "detalle" : p.id !== "kilo"
  )
  const niveles = producto.stockNiveles?.[suc] ?? {}
  const baseStock = producto.stock?.[suc] ?? 0
  const paqDisp   = niveles.paq   ?? 0
  const piezaDisp = niveles.pieza ?? 0
  const cajasDisp = niveles.caja  ?? 0

  // Calcular disponibles reales descontando lo ya en el carrito
  const cartQty = (presId) => cart
    .filter(it => it.sku === producto.sku && it.presId === presId)
    .reduce((s, it) => s + it.qty, 0)

  return (
    <div className="pres-backdrop" onClick={onClose}>
      <div className="pres-sheet" onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2, color: "var(--text)" }}>{producto.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          {paqDisp > 0 && <span>Paq sueltos: <strong>{paqDisp}</strong> · </span>}
          {piezaDisp > 0 && <span>Piezas: <strong>{piezaDisp}</strong> · </span>}
          {cajasDisp > 0 ? <span>Cajas/Bultos: <strong>{cajasDisp}</strong></span>
            : baseStock > 0 && paqDisp === 0 && piezaDisp === 0
              ? <span>Stock base: <strong>{baseStock}</strong></span>
              : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pres.map((p) => {
            const enCarrito = cartQty(p.id)

            // Siempre calcular desde baseStock/factor (fuente de verdad, siempre actualizada)
            // StockNiveles puede quedar desincronizado; base stock no.
            const factor = p.factor ?? 1
            let dispReal = 0
            let necesitaAbrirCaja = false
            const esPaqNivel = p.nivel === "paquete" ||
              (p.nivel === "gramo" && p.factor >= 1000 && p.id !== "detalle")
            if (esPaqNivel) {
              dispReal = baseStock > 0
                ? Math.floor(baseStock / factor) - enCarrito
                : (paqDisp + Math.floor(piezaDisp / factor)) - enCarrito
              necesitaAbrirCaja = dispReal > 0 && (
                (paqDisp === 0 && cajasDisp > 0) ||
                (paqDisp > 0 && enCarrito >= paqDisp)
              )
            } else if (p.nivel === "caja" || p.nivel === "bulto") {
              dispReal = baseStock > 0
                ? Math.floor(baseStock / factor) - enCarrito
                : cajasDisp - enCarrito
            } else {
              dispReal = baseStock > 0
                ? baseStock - enCarrito
                : piezaDisp - enCarrito
            }

            const insuficiente  = dispReal <= 0
            const precioPza     = p.factor > 0 ? p.precio / p.factor : null
            const mayoreoActivo = p.mayoreo && p.precioMayoreo > 0
            const pctDesc       = mayoreoActivo
              ? Math.round((1 - p.precioMayoreo / p.precio) * 100) : 0
            const mayoreoPza    = (mayoreoActivo && p.factor > 0) ? p.precioMayoreo / p.factor : null

            return (
              <div key={p.id} style={{
                border: `1px solid ${insuficiente ? "var(--err)" : necesitaAbrirCaja ? "var(--gold-500)" : "var(--border)"}`,
                borderRadius: 8, overflow: "hidden",
                background: insuficiente ? "rgba(220,50,50,.05)" : necesitaAbrirCaja ? "rgba(240,191,46,.06)" : "var(--bg-sunken)",
                opacity: insuficiente ? 0.6 : 1,
              }}>
                {/* Precio normal */}
                <button
                  onClick={() => !insuficiente && onSelect(p)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 14px", width: "100%", minHeight: 52,
                    cursor: insuficiente ? "not-allowed" : "pointer",
                    background: "transparent", border: 0, textAlign: "left",
                    color: "var(--text)",
                  }}
                  className={insuficiente ? "" : "hover-row"}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: insuficiente ? "var(--err)" : necesitaAbrirCaja ? "var(--gold-700)" : "var(--text-muted)", marginTop: 1 }}>
                      {p.factor
                        ? insuficiente
                          ? "⚠ Sin stock disponible"
                          : necesitaAbrirCaja
                            ? `📦 Requiere abrir caja · ${dispReal} disp.`
                            : `${p.factor} pzs · ${dispReal} disp.${enCarrito > 0 ? ` (${enCarrito} en nota)` : ""}`
                        : "Cantidad libre"
                      }
                      {precioPza && !insuficiente && !necesitaAbrirCaja && (
                        <span style={{ marginLeft: 6 }}>${precioPza.toFixed(2)}/pza</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16, color: "var(--wine-700)" }}>
                    {p.precio > 0 ? fmtMoney(p.precio) : <span style={{ fontSize: 12, opacity: .5 }}>Sin precio</span>}
                  </div>
                </button>

                {/* Precio mayoreo */}
                {mayoreoActivo && (
                  <button
                    onClick={() => onSelect({ ...p, precio: p.precioMayoreo, presLabel: p.label + " (Mayoreo)", esMayoreo: true })}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 14px", width: "100%", cursor: "pointer", textAlign: "left",
                      background: "rgba(240,191,46,.13)", border: 0,
                      borderTop: "2px solid var(--gold-500)",
                    }}
                    className="hover-row"
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        background: "var(--gold-500)", color: "#000",
                        borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 800,
                      }}>MAYOREO</span>
                      <div>
                        {pctDesc > 0 && (
                          <span style={{ color: "var(--ok)", fontWeight: 700, fontSize: 12 }}>−{pctDesc}% descuento</span>
                        )}
                        {mayoreoPza && (
                          <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                            ${mayoreoPza.toFixed(2)}/pza
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 17, color: "var(--gold-700)" }}>
                      {fmtMoney(p.precioMayoreo)}
                    </div>
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <button className="btn btn-default" style={{ width: "100%", marginTop: 12 }} onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Modal de precios por presentación (en la nota) ─────
export function CartItemPreciosModal({ item, producto, suc, onCambiar, onClose }) {
  const pres = producto?.presentaciones ?? []
  if (!pres.length) return null
  const cfg = producto

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg-elev)", borderRadius: 12, padding: 24, minWidth: 300, maxWidth: 400,
        boxShadow: "0 12px 40px rgba(0,0,0,.45), 0 0 0 1px var(--border)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{producto?.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          Precios por presentación
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pres.map(p => {
            const esActual  = item.presId === p.id || item.presId === p.id + "_may"
            const precioPza = p.factor > 0 ? p.precio / p.factor : null
            return (
              <div key={p.id} style={{
                border: `1px solid ${esActual ? "var(--wine-600)" : "var(--border)"}`,
                borderRadius: 8, overflow: "hidden",
                background: esActual ? "rgba(114,24,42,.07)" : "var(--bg-sunken)",
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 14px",
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                      {p.label}
                      {esActual && <span style={{ fontSize: 10, background: "var(--wine-600)", color: "#fff", borderRadius: 4, padding: "1px 6px" }}>en nota</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                      {p.factor ? `${p.factor} pzs` : "Cantidad libre"}
                      {precioPza && <span style={{ marginLeft: 6 }}>${precioPza.toFixed(2)}/pza</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16, color: "var(--wine-700)" }}>
                      {p.precio > 0 ? fmtMoney(p.precio) : <span style={{ fontSize: 12, opacity: .5 }}>Sin precio</span>}
                    </div>
                    {!esActual && p.precio > 0 && (
                      <button
                        className="btn btn-wine btn-sm"
                        style={{ fontSize: 11, padding: "2px 10px" }}
                        onClick={() => onCambiar(p)}
                      >
                        Cambiar
                      </button>
                    )}
                  </div>
                </div>
                {p.mayoreo && p.precioMayoreo > 0 && (
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "6px 14px", borderTop: "1px dashed var(--border)",
                    background: "rgba(240,191,46,.06)",
                  }}>
                    <div style={{ fontSize: 12 }}>
                      <span style={{ background: "var(--gold-500)", color: "#000", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700, marginRight: 6 }}>MAYOREO</span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {p.factor > 0 && `$${(p.precioMayoreo / p.factor).toFixed(2)}/pza`}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, color: "var(--gold-700)" }}>{fmtMoney(p.precioMayoreo)}</span>
                      {!(item.presId === p.id + "_may") && (
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: "2px 10px", background: "var(--gold-500)", color: "#000", border: "none", borderRadius: 4, cursor: "pointer" }}
                          onClick={() => onCambiar({ ...p, precio: p.precioMayoreo, presLabel: p.label + " (Mayoreo)", esMayoreo: true })}
                        >
                          Cambiar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <button className="btn btn-default" style={{ width: "100%", marginTop: 12 }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}

// ── Modal de abrir caja ─────────────────────────────────
export function AbrirCajaModal({ producto, cajaLevel, paqLabel, onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.65)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100
    }}>
      <div style={{
        background: "var(--bg-elev)", borderRadius: 12, padding: 28, maxWidth: 360, width: "90%",
        boxShadow: "0 12px 40px rgba(0,0,0,.5), 0 0 0 1px var(--border)",
        color: "var(--text)",
      }}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 10 }}>📦</div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 10, textAlign: "center", color: "var(--text)" }}>
          ¿Abrir caja?
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, textAlign: "center", lineHeight: 1.5 }}>
          No hay suficiente stock suelto para <strong style={{ color: "var(--text)" }}>{paqLabel}</strong>.
          <br />
          Se abrirá 1 caja de <strong style={{ color: "var(--text)" }}>{cajaLevel.label}</strong> ({cajaLevel.factor} pzs)
          y se descontará del inventario.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-default" style={{ flex: 1, fontSize: 15, padding: "10px 0" }} onClick={onCancel}>
            No
          </button>
          <button className="btn btn-wine" style={{ flex: 1, fontSize: 15, padding: "10px 0" }} onClick={onConfirm}>
            Sí, abrir
          </button>
        </div>
      </div>
    </div>
  )
}
