import express from "express"
import Anthropic from "@anthropic-ai/sdk"
import "dotenv/config"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, "../dist")))

// ── Anthropic ──────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `Eres el asistente de inteligencia artificial de "El Tianguis", un negocio familiar de bolsas, vasos y desechables con 3 ubicaciones: Sucursal Centro, Sucursal Repostero y Bodega central. El equipo usa este panel administrativo para gestionar ventas, inventario, pedidos a proveedores y pedidos de clientes.

Tu rol es ayudar al equipo operativo con:
- Dudas sobre inventario y stock por sucursal
- Análisis de ventas y utilidades
- Gestión de pedidos de mercancía y clientes
- Operación general del negocio
- Sugerencias y buenas prácticas comerciales

Responde siempre en español, de manera concisa y profesional. Si necesitas datos en tiempo real que no tienes, indícalo y sugiere dónde encontrarlos en el panel.`

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("Access-Control-Allow-Origin", "*")
  try {
    const stream = anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM,
      messages,
    })
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
      }
    }
    res.write("data: [DONE]\n\n")
    res.end()
  } catch (err) {
    console.error("Error Anthropic:", err.message)
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.write("data: [DONE]\n\n")
    res.end()
  }
})

// ── NocoDB ─────────────────────────────────────────────
const NOCO_URL   = process.env.NOCO_URL
const NOCO_TOKEN = process.env.NOCO_TOKEN

const T = {
  productos:   process.env.NOCO_TABLE_PRODUCTOS,
  stock:       process.env.NOCO_TABLE_STOCK,
  movimientos: process.env.NOCO_TABLE_MOVIMIENTOS,
  ventas:      process.env.NOCO_TABLE_VENTAS,
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

// GET /api/catalogo — productos + stock merged
app.get("/api/catalogo", async (req, res) => {
  try {
    const [prods, stocks] = await Promise.all([
      nocoGet(T.productos),
      nocoGet(T.stock),
    ])
    const stockMap = Object.fromEntries(stocks.map((s) => [s.Producto_Codigo, s]))
    const catalogo = prods.map((p) => {
      const s = stockMap[p.Codigo] ?? {}
      return {
        _id:      p.Id,
        _stockId: s.Id ?? null,
        sku:      String(p.Codigo).padStart(4, "0"),
        name:     p.Descripcion ?? "",
        tipo:     p.Tipo ?? "",
        cat:      p.Tipo ?? "otros",
        unidad:   p.Unidad ?? "",
        color:    p.Color ?? "",
        marca:    p.Marca ?? "",
        min:      p.Stock_Minimo || 5,
        costo:    p.Costo  ?? 0,
        precio:   p.Precio ?? 0,
        stock: {
          centro:    s.Centro    ?? 0,
          repostero: s.Repostero ?? 0,
          bodega:    s.Bodega    ?? 0,
        },
      }
    })
    res.json(catalogo)
  } catch (err) {
    console.error("Error /api/catalogo:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ventas
app.get("/api/ventas", async (req, res) => {
  try {
    const data = await nocoGet(T.ventas, "&sort=-Fecha")
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ventas — registra venta y descuenta stock
app.post("/api/ventas", async (req, res) => {
  const { folio, fecha, cliente, metodoPago, sucursal, items, subtotal, iva, total } = req.body
  try {
    await nocoPost(T.ventas, {
      Folio:      folio,
      Fecha:      fecha,
      Cliente:    cliente,
      MetodoPago: metodoPago,
      Sucursal:   sucursal,
      Subtotal:   subtotal,
      IVA:        iva,
      Total:      total,
      Items_JSON: JSON.stringify(items),
    })
    // Descontar stock por cada item vendido
    for (const item of items) {
      const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${parseInt(item.sku, 10)})`)
      if (!rows.length) continue
      const row   = rows[0]
      const campo = sucursal.toLowerCase() === "centro" ? "Centro" : sucursal.toLowerCase() === "repostero" ? "Repostero" : "Bodega"
      const nuevoSuc   = (row[campo] ?? 0) - item.qty
      const nuevoTotal = (row.Total  ?? 0) - item.qty
      await nocoPatch(T.stock, { Id: row.Id, [campo]: nuevoSuc, Total: nuevoTotal })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error("Error /api/ventas:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/movimientos
app.get("/api/movimientos", async (req, res) => {
  try {
    const data = await nocoGet(T.movimientos, "&sort=-Fecha")
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/movimientos — registra movimiento y actualiza Stock_Sucursal
app.post("/api/movimientos", async (req, res) => {
  const { tipo, producto_codigo, sucursal, cantidad, descripcion, observaciones } = req.body
  try {
    // 1. Guardar movimiento
    await nocoPost(T.movimientos, {
      Fecha:           new Date().toISOString().slice(0, 10),
      Tipo:            tipo,
      Producto_Codigo: producto_codigo,
      Descripcion:     descripcion ?? "",
      Sucursal:        sucursal,
      Cantidad:        Math.abs(cantidad),
      Observaciones:   observaciones ?? "",
    })

    // 2. Obtener fila de stock actual
    const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${producto_codigo})`)
    if (!rows.length) return res.status(404).json({ error: "Producto no encontrado en stock" })

    const row   = rows[0]
    const campo = sucursal.toLowerCase() === "centro"    ? "Centro"
                : sucursal.toLowerCase() === "repostero" ? "Repostero"
                : "Bodega"
    const delta     = tipo === "Entrada" ? Math.abs(cantidad) : -Math.abs(cantidad)
    const nuevoSuc  = (row[campo]  ?? 0) + delta
    const nuevoTotal = (row.Total  ?? 0) + delta

    // 3. Actualizar stock
    await nocoPatch(T.stock, { Id: row.Id, [campo]: nuevoSuc, Total: nuevoTotal })

    res.json({ ok: true })
  } catch (err) {
    console.error("Error /api/movimientos:", err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get("/{*splat}", (req, res) => {
  res.sendFile(join(__dirname, "../dist/index.html"))
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Servidor corriendo en :${PORT}`)
  console.log(`Anthropic: ${process.env.ANTHROPIC_API_KEY ? "OK" : "FALTA clave"}`)
  console.log(`NocoDB:    ${NOCO_URL ? "OK" : "FALTA NOCO_URL"}`)
})
