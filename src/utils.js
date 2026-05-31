export const fmtMoney = (n) =>
  "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtMoneyShort = (n) => {
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M"
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K"
  return "$" + n.toFixed(0)
}

export const fmtNum = (n) => Number(n).toLocaleString("es-MX")

export const todayISO = () => new Date().toISOString().slice(0, 10)

export function exportCSV(rows, filename) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const escape = (v) => {
    const s = v == null ? "" : String(v)
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => escape(r[k])).join(","))].join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function stockStatus(p, suc) {
  const s = suc === "all"
    ? Object.values(p.stock).reduce((a, b) => a + b, 0)
    : p.stock[suc]
  if (s === 0) return { kind: "out", label: "Sin stock", value: s }
  if (s < p.min) return { kind: "low", label: "Stock bajo", value: s }
  return { kind: "ok", label: "Disponible", value: s }
}
