import express from "express"
import OpenAI from "openai"
import "dotenv/config"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { SerialPort } from "serialport"
import { ReadlineParser } from "@serialport/parser-readline"
import { execFile } from "child_process"
import { writeFileSync, unlinkSync } from "fs"
import { tmpdir } from "os"

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, "../dist"), {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".webmanifest"))
      res.setHeader("Content-Type", "application/manifest+json")
    if (filePath.endsWith("sw.js") || filePath.endsWith("workbox-") || filePath.includes("workbox-")) {
      res.setHeader("Cache-Control", "no-cache")
      res.setHeader("Service-Worker-Allowed", "/")
    }
  },
}))

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
  equipo:           process.env.NOCO_TABLE_EQUIPO,
}

async function nocoGet(tableId, params = "") {
  const all = []
  let offset = 0
  while (true) {
    const res = await fetch(
      `${NOCO_URL}/api/v2/tables/${tableId}/records?limit=200&offset=${offset}${params}`,
      { headers: { "xc-token": NOCO_TOKEN } }
    )
    if (!res.ok) throw new Error(`NocoDB error ${res.status}`)
    const data = await res.json()
    const chunk = data.list ?? []
    all.push(...chunk)
    if (chunk.length < 200) break
    offset += 200
  }
  return all
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

// ── StockNiveles helper ───────────────────────────────
// Dado un item de venta {sku, qty, nivel, factor}, descuenta StockNiveles y stock base
async function descontarNiveles(item, campo) {
  const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${parseInt(item.sku, 10)})`)
  if (!rows.length) return
  const row = rows[0]

  // Stock base (piezas)
  const deltaBase = item.qty * (item.factor ?? item.piezasPorUnidad ?? 1)
  const nuevoBase  = (row[campo] ?? 0) - deltaBase

  // StockNiveles
  const suc = campo.toLowerCase()
  let niveles = { centro: {}, repostero: {}, bodega: {} }
  try { if (row.StockNiveles) niveles = JSON.parse(row.StockNiveles) } catch {}
  const nivelSuc = niveles[suc] ?? {}
  // Mapear nivel de presentación → clave de StockNiveles
  const NIVEL_KEY = { paquete: "paq", bulto: "caja", caja: "caja", pieza: "pieza" }
  const nivelId = NIVEL_KEY[item.nivel] ?? item.nivel ?? "pieza"
  nivelSuc[nivelId] = Math.max(0, (nivelSuc[nivelId] ?? 0) - item.qty)
  niveles[suc] = nivelSuc

  await nocoPatch(T.stock, {
    Id: row.Id,
    [campo]:       nuevoBase,
    Total:         (row.Total ?? 0) - deltaBase,
    StockNiveles:  JSON.stringify(niveles),
  })
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

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: "Faltan credenciales" })
  try {
    // Buscar en tabla Equipo de NocoDB
    const equipo = await nocoGet(
      process.env.NOCO_TABLE_EQUIPO,
      `&where=(Gmail,eq,${encodeURIComponent(email.trim().toLowerCase())})&limit=1`
    )
    const user = equipo.find(u =>
      u.Gmail?.toLowerCase() === email.trim().toLowerCase() &&
      u.Contrasena === password &&
      u.Activo !== false
    )
    if (user) {
      res.json({
        ok: true,
        token: SESSION_TOKEN,
        user: {
          name: user.Nombre, rol: (user.Rol ?? "vendedor").toLowerCase(),
          puesto: user.Puesto ?? "", email: email.trim().toLowerCase(),
          sucursalDefault: user.Sucursal ?? "",
        }
      })
    } else {
      res.status(401).json({ error: "Credenciales incorrectas" })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
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

// ── ESC/POS raw printing ──────────────────────────────
const PRINT_SCRIPT = join(__dirname, "print-raw.ps1")

function buildFolioEscPos(folio) {
  const ESC = 0x1B, GS = 0x1D
  const folioBytes    = Buffer.from(folio, "ascii")
  const barcodeData   = Buffer.concat([Buffer.from([0x7B, 0x42]), folioBytes]) // {B + data
  return Buffer.concat([
    Buffer.from([ESC, 0x40]),                           // init
    Buffer.from([ESC, 0x61, 0x01]),                     // center
    Buffer.from([ESC, 0x45, 0x01, ESC, 0x21, 0x10]),    // bold + 2x height
    Buffer.from('"EL TIANGUIS"\n', "ascii"),
    Buffer.from([ESC, 0x45, 0x00, ESC, 0x21, 0x00]),    // reset
    Buffer.from("--------------------\n", "ascii"),
    Buffer.from([ESC, 0x21, 0x30]),                     // 2x width + 2x height
    Buffer.from(folio + "\n", "ascii"),
    Buffer.from([ESC, 0x21, 0x00]),                     // reset
    Buffer.from("\n", "ascii"),
    Buffer.from([GS, 0x68, 0x50]),                      // barcode height 80px
    Buffer.from([GS, 0x77, 0x02]),                      // module width 2
    Buffer.from([GS, 0x48, 0x02]),                      // HRI below barcode
    Buffer.from([GS, 0x6B, 0x49, barcodeData.length]),  // GS k CODE128 + len
    barcodeData,
    Buffer.from("\n--------------------\n", "ascii"),
    Buffer.from("Recibido en caja\n", "ascii"),
    Buffer.from([ESC, 0x64, 0x06]),                     // feed 6 lines
    Buffer.from([GS, 0x56, 0x41, 0x00]),                // partial cut
  ])
}

function rawPrint(printerName, data) {
  return new Promise((resolve, reject) => {
    const tmp = join(tmpdir(), `escpos_${Date.now()}.bin`)
    writeFileSync(tmp, data)
    execFile("powershell", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", PRINT_SCRIPT,
      "-PrinterName", printerName,
      "-DataFile", tmp,
    ], (err, stdout, stderr) => {
      try { unlinkSync(tmp) } catch {}
      if (err) return reject(new Error(stderr || err.message))
      if (!stdout.trim().startsWith("OK")) return reject(new Error(stdout.trim() || "Sin respuesta"))
      resolve()
    })
  })
}

// Listar impresoras disponibles (sin auth, solo lectura)
app.get("/api/print/printers", (req, res) => {
  execFile("powershell", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-Command", "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress",
  ], (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message })
    try {
      const raw = JSON.parse(stdout.trim())
      res.json(Array.isArray(raw) ? raw : [raw])
    } catch { res.json([]) }
  })
})

// ── Báscula (SSE, sin auth para evitar preflight issues) ──
app.get("/api/balanza/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.flushHeaders()

  const portPath = process.env.BALANZA_PORT ?? "COM3"
  const baudRate = Number(process.env.BALANZA_BAUD) || 9600

  let port
  try {
    port = new SerialPort({ path: portPath, baudRate, autoOpen: true })
  } catch (err) {
    res.write(`data: ${JSON.stringify({ gramos: 0, conectada: false, error: err.message })}\n\n`)
    res.end()
    return
  }

  const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }))

  // Notificar conexión exitosa
  port.on("open", () => {
    res.write(`data: ${JSON.stringify({ gramos: 0, conectada: true })}\n\n`)
  })

  parser.on("data", (line) => {
    // La mayoría de básculas emiten: "  1.234 kg" o "   234 g" o "0.234KG"
    const match = line.trim().match(/([\d]+\.?[\d]*)\s*(kg|g)/i)
    if (!match) return
    const valor  = parseFloat(match[1])
    const unidad = match[2].toLowerCase()
    const gramos = unidad === "kg" ? Math.round(valor * 1000) : Math.round(valor)
    res.write(`data: ${JSON.stringify({ gramos, conectada: true })}\n\n`)
  })

  port.on("error", (err) => {
    res.write(`data: ${JSON.stringify({ gramos: 0, conectada: false, error: err.message })}\n\n`)
  })

  req.on("close", () => {
    try { port.close() } catch {}
  })
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
      const s      = stockMap[p.Codigo] ?? {}
      const min    = p.Stock_Minimo || 5
      const max    = p.InvMaximo || 0
      const nombre = p.Descripcion ?? "Producto"
      ;["Centro","Repostero","Bodega"].forEach((suc) => {
        const v = s[suc] ?? 0
        if (v <= 0)       alertas.push({ type: "err",  title: `Agotado: ${nombre} (${suc})`,              time: "Stock" })
        else if (v < min) alertas.push({ type: "warn", title: `Stock bajo: ${nombre} (${suc})`,            time: "Stock" })
        else if (max > 0 && v > max) alertas.push({ type: "info", title: `Exceso: ${nombre} (${suc}) — ${v} > máx ${max}`, time: "Stock" })
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
app.get("/api/catalogo/next-codigo", async (req, res) => {
  try {
    const prods = await nocoGet(T.productos)
    const max   = prods.reduce((m, p) => Math.max(m, parseInt(p.Codigo, 10) || 0), 0)
    res.json({ next: max + 1 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get("/api/catalogo", async (req, res) => {
  try {
    const [prods, stocks] = await Promise.all([
      nocoGet(T.productos, "&where=(Activo,neq,false)"),
      nocoGet(T.stock),
    ])
    const stockMap = Object.fromEntries(stocks.map((s) => [s.Producto_Codigo, s]))
    res.json(prods.map((p) => {
      const s = stockMap[p.Codigo] ?? {}
      let presentaciones = []
      let stockNiveles   = { centro: {}, repostero: {}, bodega: {} }
      try { presentaciones = p.Presentaciones ? JSON.parse(p.Presentaciones) : [] } catch {}
      try { if (s.StockNiveles) stockNiveles = JSON.parse(s.StockNiveles) } catch {}
      return {
        _id: p.Id, _stockId: s.Id ?? null,
        sku: String(p.Codigo).padStart(4, "0"),
        name: p.Descripcion ?? "", tipo: p.Tipo ?? "", cat: p.Tipo ?? "otros",
        unidad: p.Unidad ?? "", color: p.Color ?? "", marca: p.Marca ?? "",
        min: p.Stock_Minimo || 5, costo: p.Costo ?? 0, precio: p.Precio ?? 0,
        facturable: p.Facturable !== false && p.Facturable !== 0,
        piezasPorUnidad: p.PiezasPorUnidad ?? 1,
        activo: p.Activo !== false,
        codigoBarras:   p.CodigoBarras ?? String(p.Codigo).padStart(4, "0"),
        precioMayoreo:  p.PrecioMayoreo ?? 0,
        proveedor:      p.Proveedor ?? "",
        invMaximo:      p.InvMaximo ?? 0,
        presentaciones,
        stock: { centro: s.Centro ?? 0, repostero: s.Repostero ?? 0, bodega: s.Bodega ?? 0 },
        stockNiveles,
      }
    }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch("/api/catalogo/:id", async (req, res) => {
  const { nombre, tipo, unidad, marca, min, costo, precio, facturable, piezasPorUnidad, presentaciones, codigoBarras, precioMayoreo, proveedor, invMaximo } = req.body
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
    if (presentaciones  !== undefined) update.Presentaciones   = JSON.stringify(presentaciones)
    if (codigoBarras    !== undefined) update.CodigoBarras     = codigoBarras
    if (precioMayoreo   !== undefined) update.PrecioMayoreo    = Number(precioMayoreo) || 0
    if (proveedor       !== undefined) update.Proveedor        = proveedor
    if (invMaximo       !== undefined) update.InvMaximo        = Number(invMaximo) || 0
    await nocoPatch(T.productos, update)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post("/api/catalogo", async (req, res) => {
  const { sku, nombre, tipo, unidad, marca, min, costo, precio, facturable, piezasPorUnidad, presentaciones, codigoBarras, proveedor, invMaximo } = req.body
  try {
    const codigo = parseInt(sku, 10)

    // NocoDB ignora algunos campos en POST — creamos primero, luego fijamos con PATCH
    const prod = await nocoPost(T.productos, {
      Descripcion: nombre,
      Tipo: tipo ?? "", Unidad: unidad ?? "", Marca: marca ?? "",
      Stock_Minimo: Number(min) || 5, Costo: Number(costo) || 0, Precio: Number(precio) || 0,
      Facturable: facturable !== false,
      PiezasPorUnidad: Number(piezasPorUnidad) || 1,
      Presentaciones: presentaciones ? JSON.stringify(presentaciones) : null,
    })
    // PATCH para campos que NocoDB ignora en POST
    await nocoPatch(T.productos, {
      Id: prod.Id,
      Codigo: codigo,
      CodigoBarras: codigoBarras?.trim() || "",
      Proveedor: proveedor || "",
      InvMaximo: Number(invMaximo) || 0,
    })

    const stockRow = await nocoPost(T.stock, {
      Descripcion: nombre,
      Centro: 0, Repostero: 0, Bodega: 0, Total: 0,
    })
    await nocoPatch(T.stock, { Id: stockRow.Id, Producto_Codigo: codigo })

    res.json({ ok: true, id: prod.Id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete("/api/catalogo/:id", async (req, res) => {
  try {
    const res2 = await fetch(`${NOCO_URL}/api/v2/tables/${T.productos}/records`, {
      method: "DELETE",
      headers: { "xc-token": NOCO_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ Id: parseInt(req.params.id) }),
    })
    if (!res2.ok) throw new Error(`NocoDB error ${res2.status}`)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
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
    const campo = sucursal === "centro" ? "Centro" : sucursal === "repostero" ? "Repostero" : "Bodega"
    for (const item of items) {
      await descontarNiveles({ ...item, sku: item.sku }, campo)
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
  const { tipo, producto_codigo, sucursal, cantidad, descripcion, observaciones, nivel, factor } = req.body
  try {
    await nocoPost(T.movimientos, {
      Fecha: new Date().toISOString().slice(0, 10),
      Tipo: tipo, Producto_Codigo: producto_codigo,
      Descripcion: descripcion ?? "", Sucursal: sucursal,
      Cantidad: Math.abs(cantidad), Observaciones: observaciones ?? "",
    })
    const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${producto_codigo})`)
    if (!rows.length) return res.status(404).json({ error: "Producto no encontrado en stock" })
    const row        = rows[0]
    const campo      = sucursal.toLowerCase() === "centro" ? "Centro" : sucursal.toLowerCase() === "repostero" ? "Repostero" : "Bodega"
    const factorN    = parseFloat(factor) || 1
    const nivelDelta = tipo === "Entrada" ? Math.abs(cantidad) : -Math.abs(cantidad)
    const baseDelta  = nivelDelta * factorN   // stock base siempre en piezas

    // Actualizar StockNiveles si se especifica nivel
    const update = {
      Id: row.Id,
      [campo]: (row[campo] ?? 0) + baseDelta,
      Total:   (row.Total ?? 0) + baseDelta,
    }
    if (nivel) {
      const suc = campo.toLowerCase()
      let niveles = { centro: {}, repostero: {}, bodega: {} }
      try { if (row.StockNiveles) niveles = JSON.parse(row.StockNiveles) } catch {}
      const nivelSuc = niveles[suc] ?? {}
      nivelSuc[nivel] = Math.max(0, (nivelSuc[nivel] ?? 0) + nivelDelta)  // en unidades del nivel
      niveles[suc] = nivelSuc
      update.StockNiveles = JSON.stringify(niveles)
    }
    await nocoPatch(T.stock, update)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Abrir caja: -1 caja + N paquetes en StockNiveles
app.post("/api/abrir-caja", async (req, res) => {
  const { producto_codigo, sucursal, cajaFactor, paqFactor } = req.body
  try {
    const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${producto_codigo})`)
    if (!rows.length) return res.status(404).json({ error: "Producto no encontrado" })
    const row   = rows[0]
    const campo = sucursal.toLowerCase() === "centro" ? "Centro" : sucursal.toLowerCase() === "repostero" ? "Repostero" : "Bodega"
    const suc   = campo.toLowerCase()

    let niveles = { centro: {}, repostero: {}, bodega: {} }
    try { if (row.StockNiveles) niveles = JSON.parse(row.StockNiveles) } catch {}
    const n = niveles[suc] ?? {}

    const cajasActuales = n.caja ?? 0
    if (cajasActuales <= 0) return res.status(400).json({ error: "Sin cajas disponibles" })

    const paqsNuevos = paqFactor ? Math.floor(cajaFactor / paqFactor) : 0

    n.caja = cajasActuales - 1
    n.paq  = (n.paq ?? 0) + paqsNuevos
    niveles[suc] = n

    await nocoPatch(T.stock, {
      Id: row.Id,
      StockNiveles: JSON.stringify(niveles),
    })

    await nocoPost(T.movimientos, {
      Fecha: new Date().toISOString().slice(0, 10),
      Tipo: "Apertura de caja",
      Producto_Codigo: producto_codigo,
      Descripcion: `Apertura de caja → ${paqsNuevos} paquetes`,
      Sucursal: campo,
      Cantidad: cajaFactor,
      Observaciones: `${cajasActuales - 1} cajas restantes`,
    })

    res.json({ ok: true, cajasRestantes: cajasActuales - 1, paqsNuevos })
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
      Meta_JSON: JSON.stringify({ ts_creado: Date.now() }),
    })
    const campo = sucursal === "Repostero" ? "Repostero" : sucursal === "Bodega" ? "Bodega" : "Centro"
    for (const item of (items ?? [])) {
      const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${parseInt(item.sku, 10)})`)
      if (!rows.length) continue
      const row   = rows[0]
      const delta = item.qty * (item.factor ?? item.piezasPorUnidad ?? 1)
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
    res.json(await nocoGet(T.pedidosMercancia, "&sort=-Id"))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Siguiente folio para pedido de mercancía (PM-XXXX)
app.get("/api/pedidos-mercancia/next-folio", async (req, res) => {
  try {
    const rows = await nocoGet(T.pedidosMercancia, "&fields=Folio")
    const nums = rows
      .map(r => r.Folio?.match(/PM-(\d+)/i)?.[1])
      .filter(Boolean)
      .map(Number)
    const next = nums.length ? Math.max(...nums) + 1 : 1
    res.json({ folio: `PM-${String(next).padStart(4, "0")}` })
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
      Meta_JSON: JSON.stringify({ ts_creado: Date.now() }),
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

// Lista de equipo activo (para confirmaciones de entrega)
app.get("/api/equipo/lista", async (req, res) => {
  try {
    const rows = await nocoGet(T.equipo, "&sort=Nombre")
    res.json(rows
      .filter(u => u.Activo !== false && u.Activo !== 0)
      .map(u => ({ nombre: u.Nombre, sucursal: u.Sucursal, rol: u.Rol }))
    )
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Avanzar estado de pedido de mercancía
app.post("/api/pedidos-mercancia/:id/avanzar", async (req, res) => {
  const id = parseInt(req.params.id)
  const { accion, nombre, contrasena, checklist } = req.body
  try {
    const rows = await nocoGet(T.pedidosMercancia, `&where=(Id,eq,${id})`)
    if (!rows.length) return res.status(404).json({ error: "Pedido no encontrado" })
    const pedido = rows[0]
    const estado = pedido.Estado ?? "solicitado"
    const items  = (() => { try { return JSON.parse(pedido.Items_JSON || "[]") } catch { return [] } })()
    let meta = (() => { try { return JSON.parse(pedido.Meta_JSON || "{}") } catch { return {} } })()

    let nuevoEstado = estado

    if (accion === "aceptar") {
      // solicitado → preparando: inicializa checklist desde items
      if (!["solicitado", "en tránsito"].includes(estado))
        return res.status(400).json({ error: "El pedido no está en estado solicitado" })
      nuevoEstado = "preparando"
      meta.checklist = items.map((it, i) => ({
        id: `${it.sku}__${i}`,
        sku: it.sku,
        nombre: it.name ?? it.nombre ?? "",
        qty: it.qty,
        unidad: it.presLabel ?? it.unidad ?? "pza",
        preparado: false,
        pendiente: false,
        nota: "",
      }))

    } else if (accion === "iniciar") {
      // preparando → en_curso
      if (estado !== "preparando")
        return res.status(400).json({ error: "El pedido no está en preparación" })
      nuevoEstado = "en_curso"
      meta.timers = { ...(meta.timers ?? {}), inicio_curso: Date.now() }

    } else if (accion === "confirmar_entrega") {
      // en_curso → entregado (requiere verificación de usuario)
      if (estado !== "en_curso")
        return res.status(400).json({ error: "El pedido no está en camino" })
      if (!nombre || !contrasena)
        return res.status(400).json({ error: "Se requiere nombre y contraseña" })
      const equipo = await nocoGet(T.equipo, "")
      const usu = equipo.find(u => u.Nombre === nombre && u.Contrasena === contrasena && u.Activo !== false && u.Activo !== 0)
      if (!usu) return res.status(401).json({ error: "Nombre o contraseña incorrectos" })
      nuevoEstado = "entregado"
      meta.timers = { ...(meta.timers ?? {}), fin_curso: Date.now() }
      meta.confirmacion_entrega = {
        nombre,
        hora: new Date().toTimeString().slice(0, 5),
        fecha: new Date().toISOString().slice(0, 10),
      }
      // Actualizar stock en la sucursal de destino
      const destStr = (pedido.Destino ?? "").toLowerCase()
      const campoStock = destStr.includes("repostero") ? "Repostero" : destStr.includes("bodega") ? "Bodega" : "Centro"
      for (const item of items) {
        const stockRows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${parseInt(item.sku, 10)})`)
        if (!stockRows.length) continue
        const row = stockRows[0]
        await nocoPatch(T.stock, { Id: row.Id, [campoStock]: (row[campoStock] ?? 0) + item.qty, Total: (row.Total ?? 0) + item.qty })
      }

    } else if (accion === "iniciar_regreso") {
      // entregado → regresando
      if (estado !== "entregado")
        return res.status(400).json({ error: "El pedido no ha sido entregado" })
      nuevoEstado = "regresando"
      meta.timers = { ...(meta.timers ?? {}), inicio_regreso: Date.now() }

    } else if (accion === "confirmar_llegada") {
      // regresando → finalizado (requiere verificación de usuario)
      if (estado !== "regresando")
        return res.status(400).json({ error: "El pedido no está en camino de regreso" })
      if (!nombre || !contrasena)
        return res.status(400).json({ error: "Se requiere nombre y contraseña" })
      const equipo = await nocoGet(T.equipo, "")
      const usu = equipo.find(u => u.Nombre === nombre && u.Contrasena === contrasena && u.Activo !== false && u.Activo !== 0)
      if (!usu) return res.status(401).json({ error: "Nombre o contraseña incorrectos" })
      nuevoEstado = "finalizado"
      meta.timers = { ...(meta.timers ?? {}), fin_regreso: Date.now() }
      meta.confirmacion_regreso = {
        nombre,
        hora: new Date().toTimeString().slice(0, 5),
        fecha: new Date().toISOString().slice(0, 10),
      }

    } else if (accion === "checklist") {
      // actualizar checklist sin cambiar estado
      if (estado !== "preparando")
        return res.status(400).json({ error: "Solo se puede actualizar checklist en preparación" })
      meta.checklist = checklist

    } else {
      return res.status(400).json({ error: `Acción desconocida: ${accion}` })
    }

    await nocoPatch(T.pedidosMercancia, {
      Id: id,
      Estado: nuevoEstado,
      Meta_JSON: JSON.stringify(meta),
    })
    res.json({ ok: true, estado: nuevoEstado, meta })
  } catch (err) { res.status(500).json({ error: err.message }) }
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

// ── Notas (POS → Caja) ────────────────────────────────

// Crear borrador — reserva folio único; reutiliza cancelados del año actual
app.post("/api/notas/borrador", async (req, res) => {
  const { sucursal, vendedor } = req.body
  try {
    const anio   = new Date().getFullYear()
    const prefijo = `F-${anio}-`
    // Intentar reusar el folio cancelado más bajo del año
    const canceladas = await nocoGet(T.ventas,
      `&where=(EstadoNota,eq,cancelada)&where=(Folio,like,${prefijo}%)&sort=Folio&limit=1`)
    if (canceladas.length) {
      const nota = canceladas[0]
      await nocoPatch(T.ventas, {
        Id: nota.Id, EstadoNota: "borrador", Estado: "borrador",
        Sucursal: sucursal, Vendedor: vendedor ?? "",
        Fecha: new Date().toISOString().slice(0, 10),
        Cliente: "Mostrador", Observaciones: "",
        Items_JSON: "[]", Pagos_JSON: "[]",
        Subtotal: 0, IVA: 0, Total: 0,
      })
      return res.json({ ok: true, id: nota.Id, folio: nota.Folio })
    }
    // Sin cancelados — crear nuevo
    const nota   = await nocoPost(T.ventas, {
      Fecha: new Date().toISOString().slice(0, 10),
      Sucursal: sucursal, Vendedor: vendedor ?? "",
      EstadoNota: "borrador", Estado: "borrador",
      Subtotal: 0, IVA: 0, Total: 0, Items_JSON: "[]", Pagos_JSON: "[]",
    })
    const notaId = nota.Id ?? nota.id
    const folio  = `${prefijo}${String(notaId).padStart(4, "0")}`
    await nocoPatch(T.ventas, { Id: notaId, Folio: folio })
    res.json({ ok: true, id: notaId, folio })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Confirmar borrador → pasa a en_caja con items y totales finales
app.patch("/api/notas/:id/confirmar", async (req, res) => {
  const { cliente, vendedor, items, pagos, subtotal, iva, total, observaciones } = req.body
  try {
    await nocoPatch(T.ventas, {
      Id: parseInt(req.params.id),
      Cliente: cliente ?? "Mostrador", Vendedor: vendedor ?? "",
      Items_JSON: JSON.stringify(items ?? []),
      Pagos_JSON: JSON.stringify(pagos ?? []),
      MetodoPago: (pagos?.[0]?.metodo) ?? "Efectivo",
      Subtotal: subtotal, IVA: iva, Total: total,
      EstadoNota: "en_caja", Estado: "pendiente",
      Observaciones: observaciones ?? "",
    })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Cancelar borrador — folio queda disponible para reutilizar
app.patch("/api/notas/:id/cancelar-borrador", async (req, res) => {
  try {
    await nocoPatch(T.ventas, {
      Id: parseInt(req.params.id),
      EstadoNota: "cancelada", Estado: "cancelada",
    })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Crear nota con estado en_caja — folio = F-YYYY-{Id}
app.post("/api/notas", async (req, res) => {
  const { fecha, cliente, vendedor, sucursal, items, pagos, subtotal, iva, total, observaciones } = req.body
  try {
    const nota = await nocoPost(T.ventas, {
      Fecha: fecha, Cliente: cliente ?? "Mostrador",
      Vendedor: vendedor ?? "", Sucursal: sucursal,
      MetodoPago: (pagos?.[0]?.metodo) ?? "Efectivo",
      Subtotal: subtotal, IVA: iva, Total: total,
      Items_JSON: JSON.stringify(items ?? []),
      Pagos_JSON: JSON.stringify(pagos ?? []),
      EstadoNota: "en_caja", Estado: "pendiente",
      Observaciones: observaciones ?? "",
    })
    const notaId = nota.Id ?? nota.id ?? nota.rowId ?? Object.values(nota ?? {})[0]
    const folio = `F-${new Date().getFullYear()}-${String(notaId).padStart(4, "0")}`
    await nocoPatch(T.ventas, { Id: notaId, Folio: folio })
    res.json({ ok: true, id: notaId, folio })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Listar notas en caja (estado en_caja)
app.get("/api/caja", async (req, res) => {
  try {
    const notas = await nocoGet(T.ventas, "&where=(EstadoNota,eq,en_caja)&sort=-Fecha")
    res.json(notas)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Historial de notas cobradas por rango de tiempo
// NocoDB no soporta filtros de rango en UpdatedAt, así que filtramos en Node
app.get("/api/caja/historial", async (req, res) => {
  const rango = req.query.rango ?? "1d"
  const mins  = { "1h": 60, "8h": 480, "1d": 1440, "7d": 10080, "30d": 43200 }
  const desdeMs = Date.now() - (mins[rango] ?? 1440) * 60000
  try {
    const notas = await nocoGet(T.ventas, "&where=(EstadoNota,eq,pagada)&sort=-UpdatedAt")
    const filtradas = notas.filter(n => {
      if (!n.UpdatedAt) return false
      return new Date(n.UpdatedAt).getTime() >= desdeMs
    })
    res.json(filtradas)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Buscar nota por folio
app.get("/api/caja/:folio", async (req, res) => {
  try {
    const notas = await nocoGet(T.ventas, `&where=(Folio,eq,${req.params.folio})`)
    if (!notas.length) return res.status(404).json({ error: "Nota no encontrada" })
    res.json(notas[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Editar items de nota pendiente en caja
app.patch("/api/caja/:id/editar", async (req, res) => {
  const { items, subtotal, iva, total, pagos } = req.body
  try {
    await nocoPatch(T.ventas, {
      Id: parseInt(req.params.id),
      Items_JSON: JSON.stringify(items ?? []),
      Pagos_JSON: JSON.stringify(pagos ?? []),
      Subtotal: subtotal, IVA: iva, Total: total,
    })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Cobrar nota: marcar como pagada y decrementar stock
app.patch("/api/caja/:id/cobrar", async (req, res) => {
  const { pagos, sucursal } = req.body
  try {
    // Fetch the nota to get items
    const notas = await nocoGet(T.ventas, `&where=(Id,eq,${parseInt(req.params.id)})`)
    if (!notas.length) return res.status(404).json({ error: "Nota no encontrada" })
    const nota  = notas[0]
    const items = JSON.parse(nota.Items_JSON || "[]")
    const suc   = (sucursal ?? nota.Sucursal ?? "centro").toLowerCase()
    const campo = suc.includes("repostero") ? "Repostero" : suc.includes("bodega") ? "Bodega" : "Centro"

    // Decrement stock por nivel
    for (const item of items) {
      await descontarNiveles(item, campo)
    }

    // Mark as paid
    await nocoPatch(T.ventas, {
      Id: parseInt(req.params.id),
      EstadoNota: "pagada",
      Estado: "pagada",
      Pagos_JSON: JSON.stringify(pagos ?? []),
      MetodoPago: pagos?.[0]?.metodo ?? nota.MetodoPago,
      FechaPago: new Date().toISOString(),
    })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Imprimir folio ESC/POS
app.post("/api/print/folio", async (req, res) => {
  const { folio, printerName: bodyPrinter } = req.body
  if (!folio) return res.status(400).json({ error: "Falta folio" })
  const printerName = bodyPrinter || process.env.PRINTER_NAME
  if (!printerName) return res.status(500).json({ error: "No hay impresora configurada. Selecciónala en Ajustes." })
  try {
    await rawPrint(printerName, buildFolioEscPos(folio))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Cancelar nota
app.patch("/api/caja/:id/cancelar", async (req, res) => {
  try {
    await nocoPatch(T.ventas, { Id: parseInt(req.params.id), EstadoNota: "cancelada", Estado: "cancelada" })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Facturas CFDI ──────────────────────────────────────────
app.get("/api/facturas", async (req, res) => {
  try {
    const ventas = await nocoGet(T.ventas, "&where=(Estado,eq,pagada)&sort=-Fecha")
    res.json(ventas)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch("/api/facturas/:id/solicitar", async (req, res) => {
  const { rfc, nombreFiscal, usoCfdi, regimenReceptor, email } = req.body
  try {
    await nocoPatch(T.ventas, {
      Id: parseInt(req.params.id),
      Factura_JSON: JSON.stringify({
        rfc, nombreFiscal, usoCfdi, regimenReceptor, email,
        estado: "solicitada",
        fechaSolicitud: new Date().toISOString(),
      }),
    })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch("/api/facturas/:id/cancelar", async (req, res) => {
  try {
    await nocoPatch(T.ventas, { Id: parseInt(req.params.id), Factura_JSON: "" })
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
