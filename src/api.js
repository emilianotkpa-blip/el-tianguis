async function apiFetch(path, options = {}) {
  const token = sessionStorage.getItem("elt_token")
  const headers = { ...(options.headers ?? {}) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch(path, { ...options, headers })
  if (res.status === 401 && path !== "/api/login") {
    sessionStorage.removeItem("elt_token")
    sessionStorage.removeItem("elt_user")
    window.location.reload()
    return
  }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
  return data
}

const json  = (body) => ({ method: "POST",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const patch = (body) => ({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

export const postLogin   = (b) => apiFetch("/api/login", json(b))
export const getStats    = ()  => apiFetch("/api/stats")
export const getAlertas  = ()  => apiFetch("/api/alertas")

export const getCatalogo        = ()       => apiFetch("/api/catalogo").then(prods =>
  prods.map(p => ({ ...p, presentaciones: Array.isArray(p.presentaciones) ? p.presentaciones : [] }))
)
export const getNextCodigo      = ()       => apiFetch("/api/catalogo/next-codigo")
export const patchProducto      = (id, b)  => apiFetch(`/api/catalogo/${id}`, patch(b))
export const postProducto       = (b)      => apiFetch("/api/catalogo", json(b))
export const deleteProducto     = (id)     => apiFetch(`/api/catalogo/${id}`, { method: "DELETE" })

export const getVentas          = ()       => apiFetch("/api/ventas")
export const postVenta          = (b)      => apiFetch("/api/ventas", json(b))
export const patchVenta         = (id, b)  => apiFetch(`/api/ventas/${id}`, patch(b))

export const getMovimientos     = ()       => apiFetch("/api/movimientos")
export const postMovimiento     = (b)      => apiFetch("/api/movimientos", json(b))
export const postAbrirCaja      = (b)      => apiFetch("/api/abrir-caja", json(b))

export const getPedidosClientes  = ()      => apiFetch("/api/pedidos-clientes")
export const postPedidoCliente   = (b)     => apiFetch("/api/pedidos-clientes", json(b))
export const patchPedidoCliente  = (id, b) => apiFetch(`/api/pedidos-clientes/${id}`, patch(b))

export const getPedidosMercancia  = ()      => apiFetch("/api/pedidos-mercancia")
export const postPedidoMercancia  = (b)     => apiFetch("/api/pedidos-mercancia", json(b))
export const patchPedidoMercancia = (id, b) => apiFetch(`/api/pedidos-mercancia/${id}`, patch(b))

export const printFolio        = (folio, printerName) => apiFetch("/api/print/folio", json({ folio, printerName }))
export const getPrinters       = ()       => fetch("/api/print/printers").then(r => r.json())

export const postNota          = (b)      => apiFetch("/api/notas", json(b))
export const crearBorrador     = (b)      => apiFetch("/api/notas/borrador", json(b))
export const confirmarNota     = (id, b)  => apiFetch(`/api/notas/${id}/confirmar`, patch(b))
export const cancelarBorrador  = (id)     => apiFetch(`/api/notas/${id}/cancelar-borrador`, patch({}))
export const getCaja           = ()       => apiFetch("/api/caja")
export const getHistorialCaja  = (rango)  => apiFetch(`/api/caja/historial?rango=${rango ?? "1d"}`)
export const getCajaPorFolio   = (folio)  => apiFetch(`/api/caja/${folio}`)
export const editarNotaCaja    = (id, b)  => apiFetch(`/api/caja/${id}/editar`, patch(b))
export const cobrarNota        = (id, b)  => apiFetch(`/api/caja/${id}/cobrar`, patch(b))
export const cancelarNota      = (id)     => apiFetch(`/api/caja/${id}/cancelar`, patch({}))

export const getFacturas          = ()       => apiFetch("/api/facturas")
export const solicitarFactura     = (id, b)  => apiFetch(`/api/facturas/${id}/solicitar`, patch(b))
export const cancelarFactura      = (id)     => apiFetch(`/api/facturas/${id}/cancelar`, patch({}))

export const getClientes    = ()      => apiFetch("/api/clientes")
export const postCliente    = (b)     => apiFetch("/api/clientes", json(b))
export const patchCliente   = (id, b) => apiFetch(`/api/clientes/${id}`, patch(b))
export const deleteCliente  = (id)    => apiFetch(`/api/clientes/${id}`, { method: "DELETE" })
