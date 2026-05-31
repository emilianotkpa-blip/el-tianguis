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

export const postLogin = (b) => apiFetch("/api/login", json(b))

export const getCatalogo        = ()       => apiFetch("/api/catalogo")
export const patchProducto      = (id, b)  => apiFetch(`/api/catalogo/${id}`, patch(b))
export const postProducto       = (b)      => apiFetch("/api/catalogo", json(b))

export const getVentas          = ()       => apiFetch("/api/ventas")
export const postVenta          = (b)      => apiFetch("/api/ventas", json(b))
export const patchVenta         = (id, b)  => apiFetch(`/api/ventas/${id}`, patch(b))

export const getMovimientos     = ()       => apiFetch("/api/movimientos")
export const postMovimiento     = (b)      => apiFetch("/api/movimientos", json(b))

export const getPedidosClientes  = ()      => apiFetch("/api/pedidos-clientes")
export const postPedidoCliente   = (b)     => apiFetch("/api/pedidos-clientes", json(b))
export const patchPedidoCliente  = (id, b) => apiFetch(`/api/pedidos-clientes/${id}`, patch(b))

export const getPedidosMercancia  = ()      => apiFetch("/api/pedidos-mercancia")
export const postPedidoMercancia  = (b)     => apiFetch("/api/pedidos-mercancia", json(b))
export const patchPedidoMercancia = (id, b) => apiFetch(`/api/pedidos-mercancia/${id}`, patch(b))

export const getClientes  = ()      => apiFetch("/api/clientes")
export const postCliente  = (b)     => apiFetch("/api/clientes", json(b))
export const patchCliente = (id, b) => apiFetch(`/api/clientes/${id}`, patch(b))
