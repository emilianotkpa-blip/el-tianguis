import { fmtMoney, fmtFecha } from "../utils"
import { sucursalPorId } from "../data"

const EMPRESA = {
  nombre:   '"EL TIANGUIS"',
  titular:  "LORENA BEATRIZ KUYOC KOH",
  rfc:      "RFC: KUKL7908107U9",
  giro:     "Bolsas, Desechables, Insumos de Repostería",
  tel:      "Tel. 986 863 28 18  ·  Cel. 986 112 51 24",
}

export default function NotaImpresa({ folio, fecha, hora, cliente, vendedor, sucursal, items, pagos, totals, cambio }) {
  // Lo que el cliente se ahorró: por llevar paquete o caja en lugar de piezas
  // sueltas, más lo que le quitaron las reglas de precio. Solo se presume si
  // de verdad hubo ahorro; un "$0.00" en el ticket se ve peor que nada.
  const ahorroVolumen = (items ?? []).reduce((s, it) => {
    const ref = Number(it.precioRef) || 0
    const pagado = Number(it.precio) || 0
    return s + (ref > pagado ? (ref - pagado) * (Number(it.qty) || 1) : 0)
  }, 0)
  // Venta rápida no precalcula descTotal, así que se suma de las líneas.
  const descuentoTotal = Number(totals?.descTotal)
    || (totals?.descuentos ?? []).reduce((s, d) => s + (Number(d.monto) || 0), 0)
  const ahorro = ahorroVolumen + descuentoTotal
  const suc = sucursalPorId(sucursal)

  return (
    <div className="nota-copia">
      {/* Encabezado */}
      <div className="nota-header">
        <div className="nh-empresa">{EMPRESA.nombre}</div>
        <div className="nh-titular">{EMPRESA.titular}</div>
        <div className="nh-rfc">{EMPRESA.rfc}</div>
        <div className="nh-giro">{EMPRESA.giro}</div>
        {/* La dirección es la de la sucursal que vendió: un ticket del
            Repostero con la dirección del Centro manda mal al cliente. */}
        {suc && <div className="nh-suc">{suc.name}</div>}
        <div className="nh-dir">{suc?.direccion ?? "Tizimín, Yucatán"}</div>
        <div className="nh-tel">{EMPRESA.tel}</div>
      </div>

      {/* Meta */}
      <div className="nota-meta">
        <span><strong>Folio:</strong> {folio}</span>
        <span><strong>Fecha:</strong> {fmtFecha(fecha)}{hora ? ` · ${hora}` : ""}</span>
      </div>
      <div style={{ fontSize: 8, marginBottom: 3 }}>
        <strong>Cliente:</strong> {cliente ?? "Mostrador"}{vendedor ? `  ·  Vendedor: ${vendedor}` : ""}

      </div>

      {/* Tabla de productos */}
      <table className="nota-table">
        <thead>
          <tr>
            <th style={{ width: "8%" }}>CANT.</th>
            <th>DESCRIPCIÓN</th>
            <th className="num" style={{ width: "18%" }}>P. UNIT.</th>
            <th className="num" style={{ width: "18%" }}>IMPORTE</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((it, i) => (
            <tr key={i}>
              <td className="num">{it.qty}</td>
              <td>{it.nombre ?? it.name} <span className="nota-pres">({it.presLabel})</span></td>
              <td className="num">{fmtMoney(it.precio ?? 0)}</td>
              <td className="num">{fmtMoney((it.precio ?? 0) * (it.qty ?? 1))}</td>
            </tr>
          ))}
          {/* Líneas en blanco hasta completar al menos 8 filas */}
          {Array.from({ length: Math.max(0, 8 - (items?.length ?? 0)) }).map((_, i) => (
            <tr key={`blank-${i}`} className="fila-relleno"><td>&nbsp;</td><td></td><td></td><td></td></tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <div className="nota-totales">
        {(totals?.descuentos ?? []).map((d, i) => (
          <div className="nt-row" key={i}>
            <span>{d.nombre}{d.veces > 1 ? ` x${d.veces}` : ""}</span>
            <span>-{fmtMoney(d.monto)}</span>
          </div>
        ))}
        <div className="nt-row"><span>Subtotal</span><span>{fmtMoney(totals?.subtotal ?? 0)}</span></div>
        {totals?.iva > 0 && (
          <div className="nt-row"><span>IVA 16%</span><span>{fmtMoney(totals.iva)}</span></div>
        )}
        <div className="nt-row nt-total"><span>SALDO</span><span>{fmtMoney(totals?.total ?? 0)}</span></div>
      </div>

      {/* Pagos */}
      {(pagos ?? []).length > 0 && (
        <div style={{ fontSize: 8, marginTop: 4, borderTop: "1px dashed #999", paddingTop: 3 }}>
          {pagos.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{p.metodo}</span><span>{fmtMoney(parseFloat(p.monto) || 0)}</span>
            </div>
          ))}
          {cambio > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>Cambio</span><span>{fmtMoney(cambio)}</span>
            </div>
          )}
        </div>
      )}

      {ahorro > 0 && (
        <div className="nota-ahorro">¡Usted ahorró {fmtMoney(ahorro)} en esta compra!</div>
      )}

      <div className="nota-pie">¡Gracias por su compra!</div>
    </div>
  )
}
