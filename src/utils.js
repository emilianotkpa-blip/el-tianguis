export const fmtMoney = (n) =>
  "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtMoneyShort = (n) => {
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M"
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K"
  return "$" + n.toFixed(0)
}

export const fmtNum = (n) => Number(n).toLocaleString("es-MX")

export const todayISO = () => new Date().toISOString().slice(0, 10)

export function stockStatus(p, suc) {
  const s = suc === "all"
    ? Object.values(p.stock).reduce((a, b) => a + b, 0)
    : p.stock[suc]
  if (s === 0) return { kind: "out", label: "Sin stock", value: s }
  if (s < p.min) return { kind: "low", label: "Stock bajo", value: s }
  return { kind: "ok", label: "Disponible", value: s }
}
