async function apiFetch(path, options = {}) {
  const res = await fetch(path, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
  return data
}

export const getCatalogo = () => apiFetch("/api/catalogo")

export const getMovimientos = () => apiFetch("/api/movimientos")

export const postMovimiento = (body) =>
  apiFetch("/api/movimientos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
