import { fmtMoney } from "../utils"

const EMPRESA = {
  nombre:   '"EL TIANGUIS"',
  titular:  "LORENA BEATRIZ KUYOC KOH",
  rfc:      "RFC: KUKL7908107U9",
  giro:     "Bolsas, Desechables, Insumos de Repostería",
  dir1:     "Calle 47 # 393-B x 48 y 50",
  dir2:     "Col. Centro, Frente a Coppel",
  tel:      "Tel. 986 863 28 18  ·  Cel. 986 112 51 24",
}

export default function NotaImpresa({ folio, fecha, cliente, vendedor, sucursal, items, pagos, totals, cambio }) {
  return (
    <div className="nota-copia">
      {/* Encabezado */}
      <div className="nota-header">
        <div className="nh-empresa">{EMPRESA.nombre}</div>
        <div className="nh-titular">{EMPRESA.titular}</div>
        <div className="nh-rfc">{EMPRESA.rfc}</div>
        <div className="nh-giro">{EMPRESA.giro}</div>
        <div className="nh-dir">{EMPRESA.dir1}</div>
        <div className="nh-dir">{EMPRESA.dir2}</div>
        <div className="nh-tel">{EMPRESA.tel}</div>
      </div>

      {/* Meta */}
      <div className="nota-meta">
        <span><strong>Folio:</strong> {folio}</span>
        <span><strong>Fecha:</strong> {fecha}</span>
      </div>
      <div style={{ fontSize: 8, marginBottom: 3 }}>
        <strong>Cliente:</strong> {cliente ?? "Mostrador"}{vendedor ? `  ·  Vendedor: ${vendedor}` : ""}
        {sucursal ? `  ·  Suc: ${sucursal}` : ""}
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
              <td>{it.nombre ?? it.name} <span style={{ opacity: .7 }}>({it.presLabel})</span></td>
              <td className="num">{fmtMoney(it.precio ?? 0)}</td>
              <td className="num">{fmtMoney((it.precio ?? 0) * (it.qty ?? 1))}</td>
            </tr>
          ))}
          {/* Líneas en blanco hasta completar al menos 8 filas */}
          {Array.from({ length: Math.max(0, 8 - (items?.length ?? 0)) }).map((_, i) => (
            <tr key={`blank-${i}`}><td>&nbsp;</td><td></td><td></td><td></td></tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <div className="nota-totales">
        {totals?.subtotalNoFact > 0 && (
          <div className="nt-row"><span>Sin factura</span><span>{fmtMoney(totals.subtotalNoFact)}</span></div>
        )}
        {totals?.subtotalFact > 0 && (
          <div className="nt-row"><span>Facturable</span><span>{fmtMoney(totals.subtotalFact)}</span></div>
        )}
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

      <div className="nota-pie">¡Gracias por su compra!</div>
    </div>
  )
}
