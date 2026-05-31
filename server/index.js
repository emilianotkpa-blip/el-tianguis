import express from "express"
import OpenAI from "openai"
import "dotenv/config"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, "../dist")))

// ── OpenAI ─────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM = `Eres el asistente de inteligencia artificial de "El Tianguis", un negocio familiar de bolsas, vasos y desechables con 3 ubicaciones: Sucursal Centro, Sucursal Repostero y Bodega central. El equipo usa este panel administrativo para gestionar ventas, inventario, pedidos a proveedores y pedidos de clientes.

Tu rol es ayudar al equipo operativo con:
- Dudas sobre inventario y stock por sucursal
- Análisis de ventas y utilidades
- Gestión de pedidos de mercancía y clientes
- Operación general del negocio
- Sugerencias y buenas prácticas comerciales

Responde siempre en español, de manera concisa y profesional. Si necesitas datos en tiempo real que no tienes, indícalo y sugiere dónde encontrarlos en el panel.`

// ── NocoDB ─────────────────────────────────────────────
const NOCO_URL   = process.env.NOCO_URL
const NOCO_TOKEN = process.env.NOCO_TOKEN

const T = {
  productos:        process.env.NOCO_TABLE_PRODUCTOS,
  stock:            process.env.NOCO_TABLE_STOCK,
  movimientos:      process.env.NOCO_TABLE_MOVIMIENTOS,
  ventas:           process.env.NOCO_TABLE_VENTAS,
  pedidosClientes:  process.env.NOCO_TABLE_PEDIDOS_CLIENTES,
  pedidosMercancia: process.env.NOCO_TABLE_PEDIDOS_MERCANCIA,
  clientes:         process.env.NOCO_TABLE_CLIENTES,
}

async function nocoGet(tableId, params = "") {
  const res = await fetch(
    `${NOCO_URL}/api/v2/tables/${tableId}/records?limit=1000${params}`,
    { headers: { "xc-token": NOCO_TOKEN } }
  )
  if (!res.ok) throw new Error(`NocoDB error ${res.status}`)
  const data = await res.json()
  return data.list ?? []
}

async function nocoPost(tableId, body) {
  const res = await fetch(`${NOCO_URL}/api/v2/tables/${tableId}/records`, {
    method: "POST",
    headers: { "xc-token": NOCO_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`NocoDB error ${res.status}`)
  return res.json()
}

async function nocoPatch(tableId, body) {
  const res = await fetch(`${NOCO_URL}/api/v2/tables/${tableId}/records`, {
    method: "PATCH",
    headers: { "xc-token": NOCO_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`NocoDB error ${res.status}`)
  return res.json()
}

// ── Contexto IA ────────────────────────────────────────
async function buildContexto() {
  try {
    const [prods, stocks, ventas, pedCli, pedMer] = await Promise.all([
      nocoGet(T.productos),
      nocoGet(T.stock),
      nocoGet(T.ventas, "&sort=-Fecha&limit=20"),
      nocoGet(T.pedidosClientes, "&sort=-Fecha&limit=10"),
      nocoGet(T.pedidosMercancia, "&sort=-Fecha&limit=10"),
    ])
    const stockMap = Object.fromEntries(stocks.map((s) => [s.Producto_Codigo, s]))
    const resumen = { centro: { ok: 0, bajo: 0, agotado: 0 }, repostero: { ok: 0, bajo: 0, agotado: 0 }, bodega: { ok: 0, bajo: 0, agotado: 0 } }
    const alertas = []
    prods.forEach((p) => {
      const s = stockMap[p.Codigo] ?? {}
      const min = p.Stock_Minimo || 5
      ;["Centro", "Repostero", "Bodega"].forEach((campo) => {
        const v = s[campo] ?? 0
        const key = campo.toLowerCase()
        if      (v <= 0)  { resumen[key].agotado++; alertas.push(`${p.Descripcion} — ${campo}: AGOTADO`) }
        else if (v < min) { resumen[key].bajo++;    alertas.push(`${p.Descripcion} — ${campo}: BAJO (${v}, mín ${min})`) }
        else              { resumen[key].ok++ }
      })
    })
    const totalVentas = ventas.reduce((s, v) => s + (v.Total ?? 0), 0)
    return `
=== DATOS EN TIEMPO REAL (${new Date().toLocaleDateString("es-MX")}) ===

INVENTARIO — ${prods.length} productos totales
  Centro:    ${resumen.centro.ok} normales, ${resumen.centro.bajo} bajos, ${resumen.centro.agotado} agotados
  Repostero: ${resumen.repostero.ok} normales, ${resumen.repostero.bajo} bajos, ${resumen.repostero.agotado} agotados
  Bodega:    ${resumen.bodega.ok} normales, ${resumen.bodega.bajo} bajos, ${resumen.bodega.agotado} agotados

ALERTAS DE STOCK (primeras 30):
${alertas.slice(0, 30).map((a) => "  • " + a).join("\n") || "  Sin alertas."}

ÚLTIMAS VENTAS (${ventas.length} registros, total $${totalVentas.toFixed(2)}):
${ventas.slice(0, 10).map((v) => `  ${v.Fecha} | ${v.Cliente} | ${v.MetodoPago} | $${v.Total} | ${v.Estado ?? "pagada"}`).join("\n") || "  Sin ventas registradas."}

PEDIDOS DE CLIENTES RECIENTES:
${pedCli.slice(0, 5).map((p) => `  ${p.Folio} | ${p.Cliente} | ${p.Estado} | $${p.Total}`).join("\n") || "  Sin pedidos."}

PEDIDOS DE MERCANCÍA RECIENTES:
${pedMer.slice(0, 5).map((p) => `  ${p.Folio} | ${p.Proveedor} | ${p.Estado} | $${p.Total}`).join("\n") || "  Sin pedidos."}
`
  } catch (err) {
    return `(No se pudieron cargar datos en tiempo real: ${err.message})`
  }
}

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("Access-Control-Allow-Origin", "*")
  try {
    const contexto = await buildContexto()
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [{ role: "system", content: SYSTEM + "\n\n" + contexto }, ...messages],
      stream: true,
    })
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? ""
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`)
    }
    res.write("data: [DONE]\n\n")
    res.end()
  } catch (err) {
    console.error("Error OpenAI:", err.message)
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.write("data: [DONE]\n\n")
    res.end()
  }
})

// ── Auth ───────────────────────────────────────────────
const SESSION_TOKEN = process.env.SESSION_TOKEN || "dev-insecure-token"

app.post("/api/login", (req, res) => {
  const { email, password } = req.body ?? {}
  if (
    email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase() &&
    password === process.env.ADMIN_PASSWORD
  ) {
    res.json({ ok: true, token: SESSION_TOKEN, user: { name: "Roberto Mendoza", role: "Gerente General", email: email.toLowerCase() } })
  } else {
    res.status(401).json({ error: "Credenciales incorrectas" })
  }
})

app.get("/api/stats-publicas", async (req, res) => {
  try {
    const [prods, ventas] = await Promise.all([
      nocoGet(T.productos),
      nocoGet(T.ventas, "&sort=-Fecha&limit=500"),
    ])
    const now = new Date()
    const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const totalMes = ventas
      .filter((v) => (v.Fecha ?? "").startsWith(mesActual))
      .reduce((s, v) => s + (v.Total ?? 0), 0)
    res.json({ numProductos: prods.length, totalVentasMes: totalMes })
  } catch { res.json({ numProductos: 0, totalVentasMes: 0 }) }
})

app.use("/api", (req, res, next) => {
  const token = req.headers["authorization"]?.replace("Bearer ", "")
  if (!token || token !== SESSION_TOKEN) return res.status(401).json({ error: "No autorizado" })
  next()
})

// ── Stats y alertas ───────────────────────────────────
app.get("/api/stats", async (req, res) => {
  try {
    const [prods, stocks, pedCli, ventas] = await Promise.all([
      nocoGet(T.productos),
      nocoGet(T.stock),
      nocoGet(T.pedidosClientes),
      nocoGet(T.ventas, "&sort=-Fecha&limit=200"),
    ])
    const stockMap = Object.fromEntries(stocks.map((s) => [s.Producto_Codigo, s]))
    let alertasStock = 0
    prods.forEach((p) => {
      const s = stockMap[p.Codigo] ?? {}
      const min = p.Stock_Minimo || 5
      if ((s.Centro ?? 0) < min || (s.Repostero ?? 0) < min || (s.Bodega ?? 0) < min) alertasStock++
    })
    const pedidosPendientes = pedCli.filter((p) => p.Estado === "preparando" || p.Estado === "listo").length
    const now = new Date()
    const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const ventasMes = ventas.filter((v) => (v.Fecha ?? "").startsWith(mesActual))
    const totalMes = ventasMes.reduce((s, v) => s + (v.Total ?? 0), 0)
    res.json({ alertasStock, pedidosPendientes, totalVentasMes: totalMes, numProductos: prods.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get("/api/alertas", async (req, res) => {
  try {
    const [prods, stocks, pedCli, pedMer] = await Promise.all([
      nocoGet(T.productos),
      nocoGet(T.stock),
      nocoGet(T.pedidosClientes, "&sort=-Fecha&limit=5"),
      nocoGet(T.pedidosMercancia, "&sort=-Fecha&limit=5"),
    ])
    const stockMap = Object.fromEntries(stocks.map((s) => [s.Producto_Codigo, s]))
    const alertas = []
    prods.forEach((p) => {
      const s = stockMap[p.Codigo] ?? {}
      const min = p.Stock_Minimo || 5
      const nombre = p.Descripcion ?? "Producto"
      ;["Centro","Repostero","Bodega"].forEach((suc) => {
        const v = s[suc] ?? 0
        if (v <= 0) alertas.push({ type: "err",  title: `Agotado: ${nombre} (${suc})`,   time: "Stock" })
        else if (v < min) alertas.push({ type: "warn", title: `Stock bajo: ${nombre} (${suc})`, time: "Stock" })
      })
    })
    pedCli.forEach((p) => {
      if (p.Estado === "preparando") alertas.push({ type: "info", title: `Pedido ${p.Folio} — ${p.Cliente} en preparación`, time: p.Fecha ?? "" })
    })
    pedMer.forEach((p) => {
      if (p.Estado === "recibido") alertas.push({ type: "ok", title: `Orden ${p.Folio} recibida en ${p.Destino}`, time: p.Fecha ?? "" })
    })
    res.json(alertas.slice(0, 20))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Catálogo ───────────────────────────────────────────
app.get("/api/catalogo", async (req, res) => {
  try {
    const [prods, stocks] = await Promise.all([nocoGet(T.productos), nocoGet(T.stock)])
    const stockMap = Object.fromEntries(stocks.map((s) => [s.Producto_Codigo, s]))
    res.json(prods.map((p) => {
      const s = stockMap[p.Codigo] ?? {}
      return {
        _id: p.Id, _stockId: s.Id ?? null,
        sku: String(p.Codigo).padStart(4, "0"),
        name: p.Descripcion ?? "", tipo: p.Tipo ?? "", cat: p.Tipo ?? "otros",
        unidad: p.Unidad ?? "", color: p.Color ?? "", marca: p.Marca ?? "",
        min: p.Stock_Minimo || 5, costo: p.Costo ?? 0, precio: p.Precio ?? 0,
        facturable: p.Facturable !== false && p.Facturable !== 0,
        piezasPorUnidad: p.PiezasPorUnidad ?? 1,
        stock: { centro: s.Centro ?? 0, repostero: s.Repostero ?? 0, bodega: s.Bodega ?? 0 },
      }
    }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch("/api/catalogo/:id", async (req, res) => {
  const { nombre, tipo, unidad, marca, min, costo, precio, facturable, piezasPorUnidad } = req.body
  try {
    const update = { Id: parseInt(req.params.id) }
    if (nombre          !== undefined) update.Descripcion     = nombre
    if (tipo            !== undefined) update.Tipo             = tipo
    if (unidad          !== undefined) update.Unidad           = unidad
    if (marca           !== undefined) update.Marca            = marca
    if (min             !== undefined) update.Stock_Minimo     = Number(min)
    if (costo           !== undefined) update.Costo            = Number(costo)
    if (precio          !== undefined) update.Precio           = Number(precio)
    if (facturable      !== undefined) update.Facturable       = facturable === true || facturable === 1 || facturable === "true"
    if (piezasPorUnidad !== undefined) update.PiezasPorUnidad  = Number(piezasPorUnidad) || 1
    await nocoPatch(T.productos, update)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post("/api/catalogo", async (req, res) => {
  const { sku, nombre, tipo, unidad, marca, min, costo, precio, facturable, piezasPorUnidad } = req.body
  try {
    const prod = await nocoPost(T.productos, {
      Codigo: parseInt(sku, 10), Descripcion: nombre,
      Tipo: tipo ?? "", Unidad: unidad ?? "", Marca: marca ?? "",
      Stock_Minimo: Number(min) || 5, Costo: Number(costo) || 0, Precio: Number(precio) || 0,
      Facturable: facturable !== false,
      PiezasPorUnidad: Number(piezasPorUnidad) || 1,
    })
    await nocoPost(T.stock, {
      Producto_Codigo: parseInt(sku, 10), Descripcion: nombre,
      Centro: 0, Repostero: 0, Bodega: 0, Total: 0,
    })
    res.json({ ok: true, id: prod.Id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Ventas ─────────────────────────────────────────────
app.get("/api/ventas", async (req, res) => {
  try {
    res.json(await nocoGet(T.ventas, "&sort=-Fecha"))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post("/api/ventas", async (req, res) => {
  const { folio, fecha, cliente, metodoPago, sucursal, items, subtotal, iva, total } = req.body
  try {
    await nocoPost(T.ventas, {
      Folio: folio, Fecha: fecha, Cliente: cliente,
      MetodoPago: metodoPago, Sucursal: sucursal,
      Subtotal: subtotal, IVA: iva, Total: total,
      Items_JSON: JSON.stringify(items), Estado: "pagada",
    })
    for (const item of items) {
      const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${parseInt(item.sku, 10)})`)
      if (!rows.length) continue
      const row = rows[0]
      const campo = sucursal === "centro" ? "Centro" : sucursal === "repostero" ? "Repostero" : "Bodega"
      const ppu   = item.piezasPorUnidad ?? 1
      const delta = item.qty * ppu
      await nocoPatch(T.stock, { Id: row.Id, [campo]: (row[campo] ?? 0) - delta, Total: (row.Total ?? 0) - delta })
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch("/api/ventas/:id", async (req, res) => {
  try {
    await nocoPatch(T.ventas, { Id: parseInt(req.params.id), ...req.body })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Movimientos ────────────────────────────────────────
app.get("/api/movimientos", async (req, res) => {
  try {
    res.json(await nocoGet(T.movimientos, "&sort=-Fecha"))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post("/api/movimientos", async (req, res) => {
  const { tipo, producto_codigo, sucursal, cantidad, descripcion, observaciones } = req.body
  try {
    await nocoPost(T.movimientos, {
      Fecha: new Date().toISOString().slice(0, 10),
      Tipo: tipo, Producto_Codigo: producto_codigo,
      Descripcion: descripcion ?? "", Sucursal: sucursal,
      Cantidad: Math.abs(cantidad), Observaciones: observaciones ?? "",
    })
    const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${producto_codigo})`)
    if (!rows.length) return res.status(404).json({ error: "Producto no encontrado en stock" })
    const row = rows[0]
    const campo = sucursal.toLowerCase() === "centro" ? "Centro" : sucursal.toLowerCase() === "repostero" ? "Repostero" : "Bodega"
    const delta = tipo === "Entrada" ? Math.abs(cantidad) : -Math.abs(cantidad)
    await nocoPatch(T.stock, { Id: row.Id, [campo]: (row[campo] ?? 0) + delta, Total: (row.Total ?? 0) + delta })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Pedidos de clientes ────────────────────────────────
app.get("/api/pedidos-clientes", async (req, res) => {
  try {
    res.json(await nocoGet(T.pedidosClientes, "&sort=-Fecha"))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post("/api/pedidos-clientes", async (req, res) => {
  const { folio, fecha, cliente, sucursal, estado, fechaEntrega, total, items, observaciones } = req.body
  try {
    await nocoPost(T.pedidosClientes, {
      Folio: folio, Fecha: fecha, Cliente: cliente, Sucursal: sucursal,
      Estado: estado ?? "preparando", FechaEntrega: fechaEntrega ?? null,
      Total: total, Items_JSON: JSON.stringify(items ?? []),
      Observaciones: observaciones ?? "",
    })
    const campo = sucursal === "Repostero" ? "Repostero" : sucursal === "Bodega" ? "Bodega" : "Centro"
    for (const item of (items ?? [])) {
      const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${parseInt(item.sku, 10)})`)
      if (!rows.length) continue
      const row   = rows[0]
      const ppu   = item.piezasPorUnidad ?? 1
      const delta = item.qty * ppu
      await nocoPatch(T.stock, { Id: row.Id, [campo]: (row[campo] ?? 0) - delta, Total: (row.Total ?? 0) - delta })
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch("/api/pedidos-clientes/:id", async (req, res) => {
  try {
    await nocoPatch(T.pedidosClientes, { Id: parseInt(req.params.id), ...req.body })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Pedidos de mercancía ───────────────────────────────
app.get("/api/pedidos-mercancia", async (req, res) => {
  try {
    res.json(await nocoGet(T.pedidosMercancia, "&sort=-Fecha"))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post("/api/pedidos-mercancia", async (req, res) => {
  const { folio, fecha, proveedor, destino, estado, fechaEntrega, total, items, observaciones } = req.body
  try {
    await nocoPost(T.pedidosMercancia, {
      Folio: folio, Fecha: fecha, Proveedor: proveedor, Destino: destino,
      Estado: estado ?? "en tránsito", FechaEntrega: fechaEntrega ?? null,
      Total: total, Items_JSON: JSON.stringify(items ?? []),
      Observaciones: observaciones ?? "",
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch("/api/pedidos-mercancia/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (req.body.Estado === "recibido") {
      const rows = await nocoGet(T.pedidosMercancia, `&where=(Id,eq,${id})`)
      if (rows.length) {
        const pedido = rows[0]
        const items = JSON.parse(pedido.Items_JSON || "[]")
        const destino = (pedido.Destino ?? "").toLowerCase()
        const campo = destino.includes("repostero") ? "Repostero" : destino.includes("bodega") ? "Bodega" : "Centro"
        for (const item of items) {
          const stockRows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${parseInt(item.sku, 10)})`)
          if (!stockRows.length) continue
          const row = stockRows[0]
          await nocoPatch(T.stock, { Id: row.Id, [campo]: (row[campo] ?? 0) + item.qty, Total: (row.Total ?? 0) + item.qty })
        }
      }
    }
    await nocoPatch(T.pedidosMercancia, { Id: id, ...req.body })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Clientes ───────────────────────────────────────────
app.get("/api/clientes", async (req, res) => {
  try { res.json(await nocoGet(T.clientes, "&sort=Nombre")) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post("/api/clientes", async (req, res) => {
  const { nombre, rfc, tipo, telefono, email, direccion, limiteCredito, saldo, notas } = req.body
  try {
    const r = await nocoPost(T.clientes, {
      Nombre: nombre, RFC: rfc ?? "", Tipo: tipo ?? "General",
      Telefono: telefono ?? "", Email: email ?? "", Direccion: direccion ?? "",
      LimiteCredito: Number(limiteCredito) || 0, Saldo: Number(saldo) || 0,
      Notas: notas ?? "",
    })
    res.json({ ok: true, id: r.Id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch("/api/clientes/:id", async (req, res) => {
  try {
    await nocoPatch(T.clientes, { Id: parseInt(req.params.id), ...req.body })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete("/api/clientes/:id", async (req, res) => {
  try {
    const res2 = await fetch(`${NOCO_URL}/api/v2/tables/${T.clientes}/records`, {
      method: "DELETE",
      headers: { "xc-token": NOCO_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ Id: parseInt(req.params.id) }),
    })
    if (!res2.ok) throw new Error(`NocoDB error ${res2.status}`)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get("/{*splat}", (req, res) => {
  res.sendFile(join(__dirname, "../dist/index.html"))
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Servidor corriendo en :${PORT}`)
  console.log(`OpenAI:  ${process.env.OPENAI_API_KEY ? "OK" : "FALTA clave"}`)
  console.log(`NocoDB:  ${NOCO_URL ? "OK" : "FALTA NOCO_URL"}`)
})
