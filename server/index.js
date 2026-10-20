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
import { nivelDe, NIVEL_ROL, depositoVisible, puedeOperarEn, normalizaSucursal } from "../shared/roles.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
// Las fotos de producto llegan en base64 y rebasan los 100 KB por defecto:
// esa ruta trae su propio parser con más margen, el resto sigue igual.
const RUTA_IMAGEN = /^\/api\/catalogo\/\d+\/imagen$/
app.use((req, res, next) => RUTA_IMAGEN.test(req.path) ? next() : express.json()(req, res, next))
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

// El prompt se arma con quién está preguntando: no es lo mismo contestarle a
// dirección que a alguien de mostrador, y conviene que sepa desde qué sucursal
// le hablan. Lo que lo hacía inútil era no saber nada concreto del negocio ni
// de cómo se cuenta la mercancía.
const promptSistema = (quien) => `Eres "Tianguis IA", el asistente del panel administrativo de EL TIANGUIS, un negocio familiar en Yucatán que vende bolsas, desechables e insumos de repostería, al mayoreo y al menudeo.

## Con quién estás hablando
${quien?.nombre ? `${quien.nombre}, ${quien.rol ?? "del equipo"}${quien.sucursal ? `, trabajando desde ${quien.sucursal}` : ""}.` : "Alguien del equipo."}
Háblale de tú y por su nombre de pila cuando venga al caso.

## Cómo está armado el negocio
- Tres ubicaciones: **Tianguis Centro** y **Tianguis Repostero** son las tiendas; **Bodega** surte a las dos y no vende al público.
- Cuando una tienda necesita mercancía le hace un pedido a bodega. El inventario se mueve cuando la tienda confirma que el pedido LLEGÓ, no antes.
- Estados de un pedido: solicitado → preparando → en camino → entregado → regresando → finalizado.
- Una venta nace como nota (borrador), pasa a caja y se cierra al cobrarse.

## Cómo se cuenta la mercancía (esto importa, no lo confundas)
- El stock se guarda en **unidad base**: piezas, o gramos en lo que se vende por kilo.
- Cada producto tiene **presentaciones** con un factor: una "Caja" puede ser 3,000 piezas y un "Paq. 50 pzs" son 50. Una caja NO es una pieza.
- Si preguntan cuántas cajas hay, divide las piezas entre el factor de esa caja y redondea hacia abajo.
- El precio "desde" es el más barato por pieza, normalmente el de la presentación más grande.

## Reglas al responder
1. **Solo cifras del bloque de datos de abajo.** Si algo no está ahí, dilo claro y di en qué pantalla se ve: Inventarios, Ventas, Caja, Pedidos Mercancía, Pedidos Clientes, Utilidades, Equipo, Depósitos o Proveedores.
2. **No inventes** productos, folios, personas, precios ni cantidades. Si no estás seguro, dilo.
3. Tú no ejecutas nada: no mueves inventario ni creas pedidos. Cuando la pregunta implique una acción, explica dónde hacerla en el panel.
4. Dinero en pesos mexicanos, con separador de miles y dos decimales: $1,234.50.
5. Español de México, directo. Nada de "como modelo de lenguaje" ni rodeos.
6. **Breve**: de dos a cinco líneas. Lista solo si son tres o más puntos; tabla solo si de verdad comparas varias cosas.
7. Si en los datos ves algo que huele mal y viene al caso —stock en negativo, algo agotado en las dos tiendas, un producto sin precio— menciónalo aunque no te lo pregunten.
8. Los datos son una foto del momento, no una consulta en vivo. Si piden algo de hace un rato, sugiere abrir una conversación nueva.`

// ── NocoDB ─────────────────────────────────────────────
// El negocio está en Yucatán y el servidor corre en UTC: con toISOString(),
// toda venta después de las 6 de la tarde quedaba fechada al día siguiente.
// La fecha y la hora del negocio salen siempre de su propio huso.
const TZ_NEGOCIO = process.env.TZ_NEGOCIO || "America/Merida"

// Si la imagen viniera sin los datos de husos horarios, Intl devuelve UTC en
// silencio: por eso se comprueba una vez al arrancar y, si falla, se usa el
// desfase fijo de Yucatán (-6, sin horario de verano desde 2022).
const HAY_HUSOS = (() => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ_NEGOCIO }).format(new Date(Date.UTC(2026, 0, 1, 3))) === "2025-12-31"
  } catch { return false }
})()
if (!HAY_HUSOS) console.warn(`Sin datos del huso ${TZ_NEGOCIO}: las fechas se calculan con -6 fijo`)

const enNegocio = () => HAY_HUSOS ? new Date() : new Date(Date.now() - 6 * 3600e3)
const fechaNegocio = () => HAY_HUSOS
  ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ_NEGOCIO, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  : enNegocio().toISOString().slice(0, 10)
const horaNegocio = () => HAY_HUSOS
  ? new Intl.DateTimeFormat("es-MX", { timeZone: TZ_NEGOCIO, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date())
  : enNegocio().toISOString().slice(11, 16)

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
  promos:           process.env.NOCO_TABLE_PROMOS,
  // Con valor por omisión: las tablas ya existen en la base Tianguis y así
  // no hace falta tocar el entorno del servidor para que funcionen. La
  // variable sigue mandando si se define.
  proveedores:      process.env.NOCO_TABLE_PROVEEDORES || "m9h0qmsves61a8n",
  depositos:        process.env.NOCO_TABLE_DEPOSITOS   || "m1yd40e8ax31pls",
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

async function nocoDelete(tableId, id) {
  const res = await fetch(`${NOCO_URL}/api/v2/tables/${tableId}/records`, {
    method: "DELETE",
    headers: { "xc-token": NOCO_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ Id: id }),
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

// Antes de tocar el inventario: ¿alcanza? El stock apartado avisa mientras se
// captura, pero se refresca cada 10 s y entre apartar y cobrar puede pasar
// cualquier cosa. Este es el último punto donde se puede decir que no, y el
// único donde el inventario todavía no quedó en negativo.
async function faltantesDe(items, campo) {
  const necesita = new Map()
  for (const it of items) {
    const sku = parseInt(it.sku, 10)
    if (!sku) continue
    const base = (Number(it.qty) || 0) * (Number(it.factor ?? it.piezasPorUnidad) || 1)
    const ya = necesita.get(sku) ?? { pide: 0, nombre: it.name ?? it.descripcion ?? `SKU ${sku}` }
    necesita.set(sku, { ...ya, pide: ya.pide + base })
  }
  const faltan = []
  for (const [sku, { pide, nombre }] of necesita) {
    const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${sku})`)
    const hay = rows.length ? (rows[0][campo] ?? 0) : 0
    if (hay < pide) faltan.push({ sku: String(sku), nombre, pide, hay })
  }
  return faltan
}

// ── Contexto IA ────────────────────────────────────────
// Lo que el asistente sabe del negocio. Antes solo recibía un conteo ("120
// normales, 8 bajos") y por eso no podía contestar nada concreto: ni cuánto
// hay de un producto, ni quién trabaja ahí. Ahora recibe el catálogo producto
// por producto, el equipo y las cifras del día, en un formato apretado para
// que quepa sin costar una fortuna.
const NL = String.fromCharCode(10)   // salto de línea
const PRODUCTOS_EN_CONTEXTO = 400
const num = (n) => Number(n ?? 0).toLocaleString("es-MX")
const pesos = (n) => "$" + Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function buildContexto(quien) {
  try {
    const [prods, stocks, ventas, pedCli, pedMer, equipo] = await Promise.all([
      nocoGet(T.productos, "&where=(Activo,neq,false)"),
      nocoGet(T.stock),
      nocoGet(T.ventas, "&sort=-Fecha&limit=60"),
      nocoGet(T.pedidosClientes, "&sort=-Fecha&limit=10"),
      nocoGet(T.pedidosMercancia, "&sort=-Id&limit=12"),
      nocoGet(T.equipo, "&sort=Nombre"),
    ])
    const stockMap = Object.fromEntries(stocks.map((s) => [s.Producto_Codigo, s]))

    const resumen = { centro: { ok: 0, bajo: 0, agotado: 0 }, repostero: { ok: 0, bajo: 0, agotado: 0 }, bodega: { ok: 0, bajo: 0, agotado: 0 } }
    const agotadoEnTiendas = []
    const negativos = []
    const sinPrecio = []
    const conStock = []
    const enCero = []

    for (const p of prods) {
      const st = stockMap[p.Codigo] ?? {}
      const min = p.Stock_Minimo || 5
      const c = st.Centro ?? 0, r = st.Repostero ?? 0, b = st.Bodega ?? 0
      for (const [clave, v] of [["centro", c], ["repostero", r], ["bodega", b]]) {
        if (v <= 0) resumen[clave].agotado++
        else if (v < min) resumen[clave].bajo++
        else resumen[clave].ok++
        if (v < 0) negativos.push(`${p.Descripcion} — ${clave}: ${v}`)
      }
      if (c <= 0 && r <= 0) agotadoEnTiendas.push(`${p.Descripcion} (bodega: ${num(b)})`)
      if (!(p.Precio > 0)) sinPrecio.push(p.Descripcion ?? String(p.Codigo))

      // Alguna ficha vieja guarda ahí algo que no es una lista: si se asume
      // que siempre lo es, el contexto entero se cae y la IA se queda ciega.
      let pres = []
      try { pres = JSON.parse(p.Presentaciones || "[]") } catch {}
      if (!Array.isArray(pres)) pres = []
      const tamanos = pres.filter(x => x && x.activo !== false)
        .map(x => `${x.label} ${x.factor ? `x${x.factor}` : ""}${x.precio > 0 ? ` ${pesos(x.precio)}` : ""}`.trim())
        .join(", ")
      const linea = `${String(p.Codigo).padStart(4, "0")} ${p.Descripcion} | C ${num(c)} · R ${num(r)} · B ${num(b)}${tamanos ? ` | ${tamanos}` : ""}`
      // El catálogo no cabe entero, así que primero va lo que de verdad hay:
      // de nada sirve llenar el contexto con cientos de productos en cero y
      // dejar fuera los que sí están en el anaquel.
      ;(c + r + b > 0 ? conStock : enCero).push(linea)
    }

    // Ventas: el total del día y del mes, no solo "las últimas 20"
    const hoy = fechaNegocio()
    const mes = hoy.slice(0, 7)
    const delDia = ventas.filter(v => String(v.Fecha ?? "").slice(0, 10) === hoy)
    const delMes = ventas.filter(v => String(v.Fecha ?? "").slice(0, 7) === mes)
    const suma = (lista) => lista.reduce((s, v) => s + (v.Total ?? 0), 0)

    const nivelesEquipo = equipo
      .filter(u => u.Activo !== false && u.Activo !== 0)
      .map(u => `${u.Nombre} — ${u.Rol ?? "sin rol"} (nivel ${nivelDe(u.Rol)})${u.Puesto ? `, ${u.Puesto}` : ""}${u.Sucursal ? ` · ${u.Sucursal}` : " · sin sucursal asignada"}`)

    return [
      `=== DATOS DEL NEGOCIO · ${hoy} ${horaNegocio()} ===`,
      quien?.nombre ? `Quien pregunta: ${quien.nombre} (${quien.rol}).` : "",
      "",
      `VENTAS`,
      `  Hoy: ${delDia.length} nota(s), ${pesos(suma(delDia))}`,
      `  En lo que va del mes: ${delMes.length} nota(s), ${pesos(suma(delMes))}`,
      `  Últimas: ${ventas.slice(0, 8).map(v => `${v.Folio ?? "s/f"} ${v.Fecha} ${v.Cliente ?? "Mostrador"} ${pesos(v.Total)}`).join(" | ") || "ninguna"}`,
      "",
      `INVENTARIO · ${prods.length} productos activos`,
      `  Centro:    ${resumen.centro.ok} con stock, ${resumen.centro.bajo} bajos, ${resumen.centro.agotado} agotados`,
      `  Repostero: ${resumen.repostero.ok} con stock, ${resumen.repostero.bajo} bajos, ${resumen.repostero.agotado} agotados`,
      `  Bodega:    ${resumen.bodega.ok} con stock, ${resumen.bodega.bajo} bajos, ${resumen.bodega.agotado} agotados`,
      negativos.length ? `  OJO, stock en negativo (algo se registró mal): ${negativos.slice(0, 10).join(" | ")}` : "",
      agotadoEnTiendas.length ? `  Agotado en LAS DOS tiendas (${agotadoEnTiendas.length}): ${agotadoEnTiendas.slice(0, 15).join(" | ")}` : "",
      sinPrecio.length ? `  Sin precio capturado (${sinPrecio.length}): ${sinPrecio.slice(0, 10).join(" | ")}` : "",
      "",
      `CATÁLOGO — código, nombre, piezas en cada lugar (C=Centro, R=Repostero, B=Bodega) y tamaños con su precio`,
      conStock.join(NL) || "  (ningún producto con existencias)",
      enCero.length ? `  --- sin existencias en ningún lado (${enCero.length}) ---` : "",
      enCero.slice(0, Math.max(0, PRODUCTOS_EN_CONTEXTO - conStock.length)).join(NL),
      enCero.length > PRODUCTOS_EN_CONTEXTO - conStock.length
        ? `  …y ${enCero.length - Math.max(0, PRODUCTOS_EN_CONTEXTO - conStock.length)} productos más, todos en cero; búscalos en Inventarios.`
        : "",
      "",
      `PEDIDOS DE MERCANCÍA (bodega → tienda)`,
      pedMer.slice(0, 8).map(p => `  ${p.Folio} · ${p.Destino} · ${p.Estado ?? "solicitado"}`).join(NL) || "  ninguno",
      "",
      `PEDIDOS DE CLIENTES`,
      pedCli.slice(0, 6).map(p => `  ${p.Folio} · ${p.Cliente} · ${p.Estado} · ${pesos(p.Total)}`).join(NL) || "  ninguno",
      "",
      `EQUIPO (quién puede entrar al panel)`,
      nivelesEquipo.map(l => "  " + l).join(NL) || "  nadie dado de alta",
      `  Niveles: 1 vendedor · 2 empleado/cajero · 3 gerente · 4 dirección · 5 admin.`,
    ].filter(Boolean).join(NL)
  } catch (err) {
    return `(No se pudieron cargar los datos del negocio: ${err.message}. Dilo si te preguntan cifras.)`
  }
}

app.post("/api/chat", async (req, res) => {
  // Esta ruta se declara antes del portero general, así que se cuida sola.
  // La IA cuesta dinero y responde con cifras del negocio: pide sesión y
  // nivel de dirección.
  const credencial = req.headers["authorization"]?.replace("Bearer ", "")
  if (!credencial) return res.status(401).json({ error: "No autorizado" })
  let quienPregunta = null
  if (conSupabase()) {
    const quien = await quienEs(credencial).catch(() => null)
    if (!quien) return res.status(401).json({ error: "No autorizado" })
    if (nivelDe(quien.rol) < NIVEL_ROL.directivo) {
      return res.status(403).json({ error: "Tu cuenta no tiene acceso a Tianguis IA" })
    }
    quienPregunta = quien
  } else if (credencial !== SESSION_TOKEN) {
    return res.status(401).json({ error: "No autorizado" })
  }

  const { messages } = req.body
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("Access-Control-Allow-Origin", "*")
  try {
    const contexto = await buildContexto(quienPregunta)
    // Útil para vigilar lo que cuesta cada pregunta; VER_CONTEXTO=1 lo vuelca entero.
    console.log(`IA · contexto ${contexto.length} caracteres · pregunta ${quienPregunta?.nombre ?? "sin identificar"}`)
    if (process.env.VER_CONTEXTO) console.log(contexto)
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [{ role: "system", content: promptSistema(quienPregunta) + "\n\n" + contexto }, ...messages],
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
// Con Supabase configurado, cada persona recibe su propio token y el servidor
// sabe quién es. Sin configurar, sigue el login viejo contra NocoDB: así se
// puede desplegar y comprobar antes de mover a nadie.
const SESSION_TOKEN = process.env.SESSION_TOKEN || "dev-insecure-token"
const SUPA_URL     = (process.env.SUPABASE_URL || "").replace(/\/$/, "")
const SUPA_ANON    = process.env.SUPABASE_ANON_KEY
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE
const conSupabase  = () => Boolean(SUPA_URL && SUPA_ANON)

const supa = (ruta, opts = {}, llave = SUPA_ANON) => fetch(SUPA_URL + ruta, {
  ...opts,
  headers: {
    apikey: llave,
    authorization: opts.authorization ?? `Bearer ${llave}`,
    "content-type": "application/json",
    ...(opts.headers ?? {}),
  },
})

// El perfil (rol, sucursal, nombre) sigue viviendo en NocoDB; Supabase solo
// guarda la identidad y la contraseña
async function perfilDe(email) {
  const equipo = await nocoGet(T.equipo, `&where=(Gmail,eq,${encodeURIComponent(email)})&limit=1`)
  return equipo.find(u => u.Gmail?.toLowerCase() === email) ?? null
}
const usuarioPublico = (fila, email) => ({
  name: fila?.Nombre ?? email,
  rol: (fila?.Rol ?? "vendedor").toLowerCase(),
  puesto: fila?.Puesto ?? "",
  email,
  sucursalDefault: fila?.Sucursal ?? "",
  // Candado: aunque su nivel le dejaría elegir, trabaja siempre en la suya
  sucursalFija: fila?.SucursalFija === true || fila?.SucursalFija === 1,
})

// Una entrega la firma quien la recibe, que no es necesariamente quien tiene
// la sesión abierta: hay que comprobar SU contraseña. Con Supabase encendido
// se comprueba contra él; si no, contra la columna vieja de NocoDB, que es lo
// único que había antes.
// Devuelve { ok } y, si falla, por qué: una contraseña equivocada y un
// tropiezo de red no son lo mismo, y quien está en el mostrador con la
// mercancía enfrente merece saber cuál de las dos le pasó.
async function verificarPersona(nombre, contrasena) {
  if (!nombre || !contrasena) return { ok: false, motivo: "credenciales" }
  const equipo = await nocoGet(T.equipo, "")
  const fila = equipo.find(u =>
    (u.Nombre ?? "").trim() === String(nombre).trim() && u.Activo !== false && u.Activo !== 0)
  if (!fila) return { ok: false, motivo: "credenciales" }
  if (!conSupabase()) {
    return fila.Contrasena === contrasena ? { ok: true, fila } : { ok: false, motivo: "credenciales" }
  }
  const correo = (fila.Gmail ?? "").trim().toLowerCase()
  if (!correo) return { ok: false, motivo: "credenciales" }
  try {
    const r = await supa("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: correo, password: contrasena }),
    })
    return r.ok ? { ok: true, fila } : { ok: false, motivo: "credenciales" }
  } catch {
    return { ok: false, motivo: "red" }
  }
}

const rechazoDeVerificacion = (res, v) => v.motivo === "red"
  ? res.status(503).json({ error: "No se pudo comprobar la contraseña ahora mismo. Inténtalo de nuevo." })
  : res.status(401).json({ error: "Nombre o contraseña incorrectos" })

// Comprobar el token contra Supabase en cada llamada sería una ida y vuelta por
// petición; se recuerda un minuto, que es poco para un token de una hora.
const sesiones = new Map()   // token → { email, id, nombre, rol, hasta }
const MS_RECORDAR = 60_000

async function quienEs(token) {
  const guardado = sesiones.get(token)
  if (guardado && guardado.hasta > Date.now()) return guardado
  const r = await supa("/auth/v1/user", { authorization: `Bearer ${token}` })
  if (!r.ok) { sesiones.delete(token); return null }
  const u = await r.json()
  const email = (u.email ?? "").toLowerCase()
  // Supabase sabe quién es, pero no qué puede hacer: el rol vive en Equipo.
  // Sin traerlo aquí, el servidor veía a todo el mundo como el nivel más bajo
  // y cerraba la puerta hasta a dirección. Se recuerda junto con la sesión,
  // así que es una consulta por minuto, no una por petición.
  const fila = await perfilDe(email).catch(() => null)
  const dato = {
    email, id: u.id,
    nombre: fila?.Nombre ?? "",
    rol: (fila?.Rol ?? "vendedor").toLowerCase(),
    sucursal: fila?.Sucursal ?? "",
    sucursalFija: fila?.SucursalFija === true || fila?.SucursalFija === 1,
    hasta: Date.now() + MS_RECORDAR,
  }
  if (sesiones.size > 500) sesiones.clear()
  sesiones.set(token, dato)
  return dato
}

// Renovar el token: el de acceso dura una hora y la jornada es más larga
app.post("/api/auth/refresh", async (req, res) => {
  if (!conSupabase()) return res.status(400).json({ error: "Sin Supabase configurado" })
  const { refresh_token } = req.body ?? {}
  if (!refresh_token) return res.status(400).json({ error: "Falta el refresh token" })
  const r = await supa("/auth/v1/token?grant_type=refresh_token", {
    method: "POST", body: JSON.stringify({ refresh_token }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) return res.status(401).json({ error: "La sesión expiró" })
  res.json({ ok: true, token: d.access_token, refresh_token: d.refresh_token })
})

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: "Faltan credenciales" })

  if (conSupabase()) {
    const correo = email.trim().toLowerCase()
    try {
      const r = await supa("/auth/v1/token?grant_type=password", {
        method: "POST", body: JSON.stringify({ email: correo, password }),
      })
      if (!r.ok) return res.status(401).json({ error: "Credenciales incorrectas" })
      const d = await r.json()

      // La cuenta existe en Supabase pero quien manda sobre el acceso es Equipo:
      // dar de baja a alguien ahí lo deja fuera aunque su contraseña sirva
      const fila = await perfilDe(correo)
      if (!fila || fila.Activo === false || fila.Activo === 0) {
        return res.status(403).json({ error: "Tu cuenta no está activa. Habla con dirección." })
      }
      return res.json({
        ok: true,
        token: d.access_token,
        refresh_token: d.refresh_token,
        user: usuarioPublico(fila, correo),
      })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

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
        user: usuarioPublico(user, email.trim().toLowerCase())
      })
    } else {
      res.status(401).json({ error: "Credenciales incorrectas" })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
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

// Solo Windows sabe de impresoras, y nada mas de las suyas: si el panel corre
// en un contenedor Linux no hay nada que listar. Devolvemos el motivo, porque
// una lista vacia a secas se lee como "no tienes impresoras" y no es eso.
const SERVIDOR_IMPRIME = process.platform === "win32"

// Listar impresoras disponibles (sin auth, solo lectura)
app.get("/api/print/printers", (req, res) => {
  if (!SERVIDOR_IMPRIME) return res.json({ printers: [], motivo: "remoto" })
  execFile("powershell", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-Command", "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress",
  ], (err, stdout) => {
    if (err) return res.json({ printers: [], motivo: "error", detalle: err.message })
    try {
      const raw = JSON.parse(stdout.trim())
      const lista = (Array.isArray(raw) ? raw : [raw]).filter(Boolean)
      res.json({ printers: lista, motivo: lista.length ? null : "ninguna" })
    } catch { res.json({ printers: [], motivo: "error", detalle: "Windows no devolvio la lista" }) }
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

// ── Imagen de producto ─────────────────────────────────
// NocoDB guarda la foto como adjunto. Se sirve desde aquí y no con la URL de
// NocoDB para que el navegador nunca conozca ese host ni el token, igual que
// con todo lo demás. Va antes del candado porque un <img> no puede mandar el
// encabezado de autorización; solo entrega la foto, nada más del producto.
const adjuntoDe = (valor) => {
  let v = valor
  if (typeof v === "string") { try { v = JSON.parse(v) } catch { return null } }
  return Array.isArray(v) && v[0]?.path ? v[0] : null
}

app.get("/api/media/producto/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!id) return res.status(400).end()
  try {
    const filas = await nocoGet(T.productos, `&where=(Id,eq,${id})`)
    const img = adjuntoDe(filas[0]?.Imagen)
    if (!img) return res.status(404).end()
    const r = await fetch(`${NOCO_URL}/${img.path}`, { headers: { "xc-token": NOCO_TOKEN } })
    if (!r.ok) return res.status(404).end()
    res.setHeader("Content-Type", img.mimetype || r.headers.get("content-type") || "image/jpeg")
    // La URL cambia con cada foto nueva (?v=), así que se puede guardar sin miedo
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable")
    res.send(Buffer.from(await r.arrayBuffer()))
  } catch {
    res.status(500).end()
  }
})

app.use("/api", async (req, res, next) => {
  const token = req.headers["authorization"]?.replace("Bearer ", "")
  if (!token) return res.status(401).json({ error: "No autorizado" })

  if (!conSupabase()) {
    if (token !== SESSION_TOKEN) return res.status(401).json({ error: "No autorizado" })
    return next()
  }
  try {
    const quien = await quienEs(token)
    if (!quien) return res.status(401).json({ error: "No autorizado" })
    req.usuario = quien        // a partir de aquí el servidor sabe de quién es la petición
    next()
  } catch (err) {
    res.status(503).json({ error: "No se pudo verificar la sesión" })
  }
})

// Esconder una pantalla en el menú no es impedir el acceso: sin esto,
// cualquiera con sesión podía pedirle los datos a la API directamente. Si el
// login todavía es el viejo (sin Supabase), el servidor no sabe de quién es la
// sesión y no puede decidir nada: en ese caso deja pasar, como hasta ahora.
const exigeNivel = (rolMin) => (req, res, next) => {
  if (!req.usuario) return next()
  if (nivelDe(req.usuario.rol) >= NIVEL_ROL[rolMin]) return next()
  res.status(403).json({ error: "Tu cuenta no tiene acceso a esta sección" })
}

// Mirar el inventario de otra sucursal está bien; escribir en ella no. Quien
// tiene sucursal asignada (o candado) solo puede vender, cobrar y mover
// inventario donde trabaja. Dirección y quien elige sucursal al entrar pasan
// sin más. Sin sesión identificada (login viejo) no se sabe, y se deja pasar.
const exigeSucursal = (campo = "sucursal") => (req, res, next) => {
  if (!req.usuario) return next()
  const pedida = req.body?.[campo]
  if (pedida === undefined || pedida === null || pedida === "") return next()
  if (puedeOperarEn(req.usuario, pedida)) return next()
  const suya = normalizaSucursal(req.usuario.sucursal)
  res.status(403).json({
    error: suya
      ? `Tu cuenta solo puede operar en ${suya}`
      : "Tu cuenta no tiene sucursal asignada",
  })
}

// ── Perfil de quien entró ──────────────────────────────
app.get("/api/perfil", async (req, res) => {
  if (!conSupabase()) return res.json({ gestionable: false })
  try {
    const fila = await perfilDe(req.usuario.email)
    res.json({ gestionable: true, ...usuarioPublico(fila, req.usuario.email) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Cambiar la propia contraseña. Se comprueba la actual iniciando sesión con
// ella: sin eso, quien tomara prestada una sesión abierta podría cambiarla.
app.post("/api/perfil/contrasena", async (req, res) => {
  if (!conSupabase()) return res.status(400).json({ error: "El cambio de contraseña requiere Supabase" })
  const { actual, nueva } = req.body ?? {}
  if (!actual || !nueva) return res.status(400).json({ error: "Faltan la contraseña actual y la nueva" })
  if (String(nueva).length < 8) return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres" })
  if (actual === nueva) return res.status(400).json({ error: "La nueva contraseña debe ser distinta de la actual" })
  try {
    const prueba = await supa("/auth/v1/token?grant_type=password", {
      method: "POST", body: JSON.stringify({ email: req.usuario.email, password: actual }),
    })
    if (!prueba.ok) return res.status(400).json({ error: "La contraseña actual no coincide" })

    const r = await supa(`/auth/v1/admin/users/${req.usuario.id}`, {
      method: "PUT", body: JSON.stringify({ password: nueva }),
    }, SUPA_SERVICE)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      return res.status(500).json({ error: d.msg || d.error_description || "No se pudo cambiar la contraseña" })
    }
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
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

// ── Reglas de precio (combos y proporciones) ───────────
// La tabla es opcional: mientras no exista NOCO_TABLE_PROMOS el sistema
// funciona igual, solo que sin reglas. Así se puede desplegar antes de
// crearla en NocoDB.
const promosListas = () => Boolean(T.promos)

app.get("/api/promos", async (req, res) => {
  if (!promosListas()) return res.json([])
  try {
    const filas = await nocoGet(T.promos)
    res.json(filas.map(f => {
      let config = {}
      try { config = f.Config_JSON ? JSON.parse(f.Config_JSON) : {} } catch {}
      return {
        id: f.Id,
        nombre: f.Nombre ?? "",
        tipo: f.Tipo ?? "combo",
        activo: f.Activo !== false && f.Activo !== 0,
        // Las reglas de antes de este campo vienen sin él: se asumen visibles,
        // que es como se venían comportando.
        visible: f.Visible !== false && f.Visible !== 0,
        prioridad: f.Prioridad ?? 100,
        config,
      }
    }))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post("/api/promos", exigeNivel("gerente"), async (req, res) => {
  if (!promosListas()) return res.status(503).json({ error: "Falta configurar la tabla de reglas (NOCO_TABLE_PROMOS)" })
  const { nombre, tipo, activo, visible, prioridad, config } = req.body
  try {
    const fila = await nocoPost(T.promos, {
      Nombre: nombre ?? "Regla sin nombre",
      Tipo: tipo ?? "combo",
      Activo: activo !== false,
      Visible: visible !== false,
      Prioridad: Number(prioridad) || 100,
      Config_JSON: JSON.stringify(config ?? {}),
    })
    res.json({ ok: true, id: fila.Id ?? fila.id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch("/api/promos/:id", exigeNivel("gerente"), async (req, res) => {
  if (!promosListas()) return res.status(503).json({ error: "Falta configurar la tabla de reglas (NOCO_TABLE_PROMOS)" })
  const { nombre, tipo, activo, visible, prioridad, config } = req.body
  try {
    const update = { Id: parseInt(req.params.id) }
    if (nombre    !== undefined) update.Nombre      = nombre
    if (tipo      !== undefined) update.Tipo        = tipo
    if (activo    !== undefined) update.Activo      = activo !== false
    if (visible   !== undefined) update.Visible     = visible !== false
    if (prioridad !== undefined) update.Prioridad   = Number(prioridad) || 100
    if (config    !== undefined) update.Config_JSON = JSON.stringify(config)
    await nocoPatch(T.promos, update)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete("/api/promos/:id", exigeNivel("gerente"), async (req, res) => {
  if (!promosListas()) return res.status(503).json({ error: "Falta configurar la tabla de reglas (NOCO_TABLE_PROMOS)" })
  try {
    await fetch(`${NOCO_URL}/api/v2/tables/${T.promos}/records`, {
      method: "DELETE",
      headers: { "xc-token": NOCO_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ Id: parseInt(req.params.id) }),
    })
    res.json({ ok: true })
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

// El nombre del archivo en NocoDB es único por subida: sirve de versión para
// que el navegador pida la foto nueva en cuanto se cambia
const urlImagen = (p) => {
  const img = adjuntoDe(p.Imagen)
  return img ? `/api/media/producto/${p.Id}?v=${encodeURIComponent(img.path.split("/").pop())}` : null
}

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
        imagen: urlImagen(p),
      }
    }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Subir la foto de un producto. Llega ya reducida desde el navegador; aquí
// solo se valida que sea imagen y que no se haya colado un archivo enorme.
const TIPOS_IMAGEN = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }

app.post("/api/catalogo/:id/imagen", express.json({ limit: "6mb" }), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(req.body?.dataUrl ?? "")
  if (!id || !m || !TIPOS_IMAGEN[m[1]]) return res.status(400).json({ error: "El archivo no es una imagen válida" })
  const datos = Buffer.from(m[2], "base64")
  if (datos.length > 3 * 1024 * 1024) return res.status(413).json({ error: "La imagen pesa más de 3 MB" })
  try {
    const fd = new FormData()
    fd.append("files", new Blob([datos], { type: m[1] }), `producto-${id}.${TIPOS_IMAGEN[m[1]]}`)
    const r = await fetch(`${NOCO_URL}/api/v2/storage/upload?path=el-tianguis/productos`, {
      method: "POST", headers: { "xc-token": NOCO_TOKEN }, body: fd,
    })
    const subida = await r.json()
    if (!r.ok || !Array.isArray(subida) || !subida[0]?.path) {
      return res.status(502).json({ error: "No se pudo guardar la imagen" })
    }
    await nocoPatch(T.productos, { Id: id, Imagen: subida })
    res.json({ ok: true, imagen: urlImagen({ Id: id, Imagen: subida }) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete("/api/catalogo/:id/imagen", async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!id) return res.status(400).json({ error: "Producto no válido" })
  try {
    await nocoPatch(T.productos, { Id: id, Imagen: null })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
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
app.get("/api/ventas", exigeNivel("directivo"), async (req, res) => {
  try {
    res.json(await nocoGet(T.ventas, "&sort=-Fecha"))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post("/api/ventas", exigeSucursal(), async (req, res) => {
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

// Traspaso entre sucursales. Antes era un tipo de movimiento más: restaba de
// la sucursal elegida y no sumaba en ninguna otra, o sea que la mercancía
// desaparecía. Ahora pide las dos puntas y mueve de verdad.
app.post("/api/traspasos", async (req, res) => {
  const { producto_codigo, origen, destino, cantidad, nivel, factor, observaciones } = req.body ?? {}
  const org = columnaSucursal(origen)
  const dst = columnaSucursal(destino)
  if (!normalizaSucursal(origen) || !normalizaSucursal(destino)) {
    return res.status(400).json({ error: "Falta decir de dónde sale y a dónde va" })
  }
  if (org === dst) return res.status(400).json({ error: "El origen y el destino son la misma sucursal" })

  const qty = Number(cantidad) || 0
  if (qty <= 0) return res.status(400).json({ error: "La cantidad debe ser mayor a cero" })

  // Un traspaso toca las dos sucursales, así que hay que poder operar en las
  // dos: quien tiene su sucursal fija no mueve mercancía ajena.
  if (req.usuario && !(puedeOperarEn(req.usuario, origen) && puedeOperarEn(req.usuario, destino))) {
    return res.status(403).json({ error: "Tu cuenta no puede mover mercancía entre esas sucursales" })
  }

  try {
    const codigo = parseInt(producto_codigo, 10)
    const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${codigo})`)
    if (!rows.length) return res.status(404).json({ error: "Producto no encontrado en stock" })
    const row = rows[0]
    const f = Number(factor) || 1
    const base = qty * f
    const hay = row[org] ?? 0
    if (base > hay) {
      return res.status(409).json({
        error: `${org} solo tiene ${Math.floor(hay / f)} de esa presentación`,
        hay: Math.floor(hay / f), pide: qty,
      })
    }
    const prod = await nocoGet(T.productos, `&where=(Codigo,eq,${codigo})&limit=1`)
    await traspasarStock({
      row, origen: org, destino: dst, qty, factor: f,
      nivel: nivel || (f > 1 ? "paq" : "pieza"),
      nombre: prod[0]?.Descripcion ?? String(codigo), codigo,
      detalle: `Traspaso · ${qty}${observaciones ? ` · ${observaciones}` : ""}`,
    })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post("/api/movimientos", exigeSucursal(), async (req, res) => {
  const { tipo, producto_codigo, sucursal, cantidad, descripcion, observaciones, nivel, factor } = req.body
  // Un traspaso tiene dos puntas y aquí solo llega una: iba a restar de esta
  // sucursal sin sumar en ninguna otra.
  if (tipo === "Traspaso") {
    return res.status(400).json({ error: "Un traspaso se registra en /api/traspasos, con origen y destino" })
  }
  try {
    await nocoPost(T.movimientos, {
      Fecha: fechaNegocio(),
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
app.post("/api/abrir-caja", exigeSucursal(), async (req, res) => {
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
      Fecha: fechaNegocio(),
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

app.post("/api/pedidos-clientes", exigeSucursal(), async (req, res) => {
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

app.post("/api/pedidos-mercancia", exigeSucursal("destino"), async (req, res) => {
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
    // Aquí vivía un segundo traspaso de stock, el que se disparaba al marcar
    // el pedido como "recibido": SUMABA en la sucursal destino sin restar en
    // bodega, o sea inventario salido de la nada. Ninguna pantalla lo usa (el
    // traspaso bueno lo hace "confirmar_entrega"), pero la ruta estaba abierta
    // y bastaba un PATCH con Estado "recibido" para inflar el inventario.
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

// Equipo completo, para que dirección vea quién es quién y le asigne sucursal.
// El rol se sigue tocando en NocoDB a propósito: desde aquí cualquiera con
// nivel de dirección podría ascenderse solo.
app.get("/api/equipo", exigeNivel("directivo"), async (req, res) => {
  try {
    const rows = await nocoGet(T.equipo, "&sort=Nombre")
    res.json(rows.map(u => ({
      id: u.Id, nombre: u.Nombre ?? "", correo: u.Gmail ?? "",
      rol: u.Rol ?? "", puesto: u.Puesto ?? "", sucursal: u.Sucursal ?? "",
      sucursalFija: u.SucursalFija === true || u.SucursalFija === 1,
      activo: u.Activo !== false && u.Activo !== 0,
    })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Mueve mercancía de una sucursal a otra: el stock base, el conteo por
// presentación y los dos renglones del historial. La usan los pedidos y los
// traspasos a mano, para que las dos formas de mover cuadren igual y ninguna
// se quede sin dejar rastro.
async function traspasarStock({ row, origen, destino, qty, factor, nivel, nombre, codigo, detalle }) {
  const base = qty * factor
  const patch = { Id: row.Id }
  const saldo = { Centro: row.Centro ?? 0, Repostero: row.Repostero ?? 0, Bodega: row.Bodega ?? 0 }
  if (origen)  saldo[origen]  -= base
  if (destino) saldo[destino] += base
  patch.Centro = saldo.Centro
  patch.Repostero = saldo.Repostero
  patch.Bodega = saldo.Bodega
  patch.Total = saldo.Centro + saldo.Repostero + saldo.Bodega

  // El conteo por presentación también se mueve: si no, la pantalla de ventas
  // sigue creyendo que las cajas están donde ya no están.
  let niveles = { centro: {}, repostero: {}, bodega: {} }
  try { if (row.StockNiveles) niveles = JSON.parse(row.StockNiveles) } catch {}
  const mueveNivel = (campo, delta) => {
    if (!campo) return
    const k = campo.toLowerCase()
    niveles[k] = { ...(niveles[k] ?? {}) }
    niveles[k][nivel] = Math.max(0, (niveles[k][nivel] ?? 0) + delta)
  }
  mueveNivel(origen, -qty)
  mueveNivel(destino, qty)
  patch.StockNiveles = JSON.stringify(niveles)
  await nocoPatch(T.stock, patch)

  if (origen) {
    await nocoPost(T.movimientos, {
      Fecha: fechaNegocio(), Tipo: "Salida", Producto_Codigo: codigo,
      Descripcion: nombre, Sucursal: origen.toLowerCase(), Cantidad: base,
      Observaciones: `${detalle}${destino ? ` → ${destino}` : ""}`,
    })
  }
  if (destino) {
    await nocoPost(T.movimientos, {
      Fecha: fechaNegocio(), Tipo: "Entrada", Producto_Codigo: codigo,
      Descripcion: nombre, Sucursal: destino.toLowerCase(), Cantidad: base,
      Observaciones: `${detalle}${origen ? ` ← ${origen}` : ""}`,
    })
  }
}

// "Tianguis Repostero" → la columna Repostero de la tabla de stock.
const columnaSucursal = (v) => {
  const n = normalizaSucursal(v)
  return n === "repostero" ? "Repostero" : n === "bodega" ? "Bodega" : "Centro"
}

const SUCURSALES_VALIDAS = ["centro", "repostero", "bodega"]

app.patch("/api/equipo/:id", exigeNivel("directivo"), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!id) return res.status(400).json({ error: "Falta el id" })
  const campos = { Id: id }
  if (req.body?.sucursal !== undefined) {
    const suc = String(req.body.sucursal ?? "").trim().toLowerCase()
    if (suc && !SUCURSALES_VALIDAS.includes(suc)) {
      return res.status(400).json({ error: "Esa sucursal no existe" })
    }
    campos.Sucursal = suc
  }
  if (req.body?.sucursalFija !== undefined) campos.SucursalFija = req.body.sucursalFija === true

  // Un candado sin sucursal deja a esa persona sin poder entrar: o se fija a
  // una sucursal concreta, o no se fija.
  if (campos.SucursalFija === true) {
    const actual = campos.Sucursal ?? (await nocoGet(T.equipo, `&where=(Id,eq,${id})&limit=1`))[0]?.Sucursal
    if (!actual) return res.status(400).json({ error: "Para fijar la sucursal hay que elegir cuál" })
  }
  try {
    await nocoPatch(T.equipo, campos)
    // La sesión recuerda el rol y la sucursal un minuto: se olvida ya, para
    // que el cambio se note al recargar y no diez llamadas después.
    sesiones.clear()
    res.json({ ok: true })
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
      const usu = await verificarPersona(nombre, contrasena)
      if (!usu.ok) return rechazoDeVerificacion(res, usu)
      nuevoEstado = "entregado"
      meta.timers = { ...(meta.timers ?? {}), fin_curso: Date.now() }
      meta.confirmacion_entrega = {
        nombre,
        hora: horaNegocio(),
        fecha: fechaNegocio(),
      }
      // Traspaso bodega → sucursal destino.
      //
      // La cantidad del pedido viene en unidades de SU presentación ("3
      // cajas"), y el stock se guarda en unidades base: hay que multiplicar
      // por el factor. Antes se movían 3 piezas cuando se habían pedido 3
      // cajas, y el inventario quedaba mal en las dos sucursales.
      const campoDest = columnaSucursal(pedido.Destino)
      const plan = []
      const faltantes = []
      for (const item of items) {
        const codigo = parseInt(item.sku, 10)
        if (!codigo) continue
        const stockRows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${codigo})`)
        const nombreIt  = item.name ?? item.nombre ?? String(item.sku)
        if (!stockRows.length) {
          faltantes.push({ sku: item.sku, nombre: nombreIt, pide: 0, hay: 0, unidad: "", motivo: "sin registro de stock" })
          continue
        }
        const row    = stockRows[0]
        const factor = Number(item.factor) || 1
        const base   = (Number(item.qty) || 0) * factor
        if (base <= 0) continue
        // Restar de bodega solo si el destino no es la propia bodega
        const deBodega = campoDest !== "Bodega"
        if (deBodega && base > (row.Bodega ?? 0)) {
          faltantes.push({
            sku: item.sku, nombre: nombreIt,
            pide: Number(item.qty) || 0, unidad: item.presLabel ?? item.unidad ?? "",
            hay: Math.floor((row.Bodega ?? 0) / factor), base, enBodega: row.Bodega ?? 0,
          })
        }
        plan.push({ row, item, factor, base, deBodega, nombreIt })
      }

      // Si bodega no alcanza no se inventa inventario: se avisa qué falta y
      // quien recibe decide si la mercancía llegó de todos modos.
      if (faltantes.length && req.body?.forzar !== true) {
        return res.status(409).json({ error: "Bodega no tiene todo lo que trae el pedido", faltantes })
      }

      for (const { row, item, factor, deBodega, nombreIt } of plan) {
        await traspasarStock({
          row,
          origen:  deBodega ? "Bodega" : null,
          destino: campoDest,
          qty:     Number(item.qty) || 0,
          factor,
          nivel:   item.nivel ?? (factor > 1 ? "paq" : "pieza"),
          nombre:  nombreIt,
          codigo:  parseInt(item.sku, 10),
          detalle: `Pedido ${pedido.Folio ?? id} · ${item.qty} ${item.presLabel ?? "pza"}`,
        })
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
      const usu = await verificarPersona(nombre, contrasena)
      if (!usu.ok) return rechazoDeVerificacion(res, usu)
      nuevoEstado = "finalizado"
      meta.timers = { ...(meta.timers ?? {}), fin_regreso: Date.now() }
      meta.confirmacion_regreso = {
        nombre,
        hora: horaNegocio(),
        fecha: fechaNegocio(),
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

// ── Recepción masiva de mercancía ─────────────────────
// POST { items: [{sku, qty}] } → suma qty a Bodega de cada producto
app.post("/api/inventarios/recepcion-masiva", async (req, res) => {
  const { items } = req.body
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "items requerido" })
  const results = []
  for (const { sku, qty } of items) {
    const n = parseInt(qty, 10)
    if (!sku || n <= 0) { results.push({ sku, ok: false, error: "qty inválido" }); continue }
    const rows = await nocoGet(T.stock, `&where=(Producto_Codigo,eq,${parseInt(sku, 10)})`)
    if (!rows.length) { results.push({ sku, ok: false, error: "Producto no encontrado" }); continue }
    const row       = rows[0]
    const nuevaBodega = (row.Bodega ?? 0) + n
    const total       = (row.Centro ?? 0) + (row.Repostero ?? 0) + nuevaBodega
    await nocoPatch(T.stock, { Id: row.Id, Bodega: nuevaBodega, Total: total })
    results.push({ sku, ok: true, nuevaBodega })
  }
  res.json({ ok: true, results })
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

// ── Proveedores ────────────────────────────────────────
// Los campos se nombran uno por uno (no se pasa el cuerpo tal cual a NocoDB):
// aquí viven la cuenta bancaria y la CLABE de cada proveedor.
const proveedorDe = (f) => ({
  id: f.Id,
  nombre: f.Nombre ?? "", contacto: f.Contacto ?? "", telefono: f.Telefono ?? "",
  correo: f.Correo ?? "", rfc: f.RFC ?? "", banco: f.Banco ?? "", cuenta: f.Cuenta ?? "",
  notas: f.Notas ?? "", activo: f.Activo !== false && f.Activo !== 0,
})
const camposProveedor = (b) => {
  const out = {}
  const mapa = { nombre: "Nombre", contacto: "Contacto", telefono: "Telefono", correo: "Correo",
                 rfc: "RFC", banco: "Banco", cuenta: "Cuenta", notas: "Notas" }
  for (const [k, col] of Object.entries(mapa)) if (b[k] !== undefined) out[col] = String(b[k] ?? "").trim()
  if (b.activo !== undefined) out.Activo = b.activo !== false
  return out
}

app.get("/api/proveedores", exigeNivel("gerente"), async (req, res) => {
  try {
    const todos = (await nocoGet(T.proveedores, "&sort=Nombre")).map(proveedorDe)
    // Gerencia no entra a Proveedores, pero sí necesita la lista de nombres
    // para registrar un depósito: se le manda eso y nada más. El banco, la
    // cuenta y el RFC son de dirección.
    if (req.usuario && nivelDe(req.usuario.rol) < NIVEL_ROL.directivo) {
      return res.json(todos.map(p => ({ id: p.id, nombre: p.nombre, activo: p.activo })))
    }
    res.json(todos)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post("/api/proveedores", exigeNivel("directivo"), async (req, res) => {
  const campos = camposProveedor(req.body ?? {})
  if (!campos.Nombre) return res.status(400).json({ error: "El nombre del proveedor es obligatorio" })
  try {
    const r = await nocoPost(T.proveedores, { Activo: true, ...campos })
    res.json({ ok: true, id: r.Id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch("/api/proveedores/:id", exigeNivel("directivo"), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const campos = camposProveedor(req.body ?? {})
  if (!id) return res.status(400).json({ error: "Proveedor no válido" })
  if (campos.Nombre === "") return res.status(400).json({ error: "El nombre del proveedor es obligatorio" })
  try {
    await nocoPatch(T.proveedores, { Id: id, ...campos })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Los depósitos guardan el nombre del proveedor al momento de registrarse,
// así que borrar un proveedor no deja su historial sin nombre
app.delete("/api/proveedores/:id", exigeNivel("directivo"), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!id) return res.status(400).json({ error: "Proveedor no válido" })
  try { await nocoDelete(T.proveedores, id); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Depósitos a proveedores ────────────────────────────
const depositoDe = (f) => ({
  id: f.Id,
  fecha: (f.Fecha ?? "").slice(0, 10),
  proveedorId: f.ProveedorId ?? null,
  proveedor: f.Proveedor ?? "",
  monto: Number(f.Monto) || 0,
  llevo: f.Llevo ?? "", referencia: f.Referencia ?? "",
  notas: f.Notas ?? "", registro: f.Registro ?? "",
  creado: f.CreatedAt ?? null,
})

// Valida y arma el registro. El nombre del proveedor se toma de su tabla y
// no del cliente, para que quede escrito como está dado de alta.
async function camposDeposito(b, parcial = false) {
  const out = {}
  if (!parcial || b.fecha !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha ?? "")) throw new Error("La fecha no es válida")
    out.Fecha = b.fecha
  }
  if (!parcial || b.monto !== undefined) {
    const monto = Math.round(Number(b.monto) * 100) / 100
    if (!(monto > 0)) throw new Error("El monto debe ser mayor a cero")
    out.Monto = monto
  }
  if (!parcial || b.proveedorId !== undefined) {
    const pid = parseInt(b.proveedorId, 10)
    const filas = pid ? await nocoGet(T.proveedores, `&where=(Id,eq,${pid})`) : []
    if (!filas.length) throw new Error("Elige un proveedor de la lista")
    out.ProveedorId = pid
    out.Proveedor = filas[0].Nombre ?? ""
  }
  if (!parcial || b.llevo !== undefined) {
    out.Llevo = String(b.llevo ?? "").trim()
    if (!out.Llevo) throw new Error("Anota quién llevó el depósito")
  }
  if (b.referencia !== undefined) out.Referencia = String(b.referencia ?? "").trim()
  if (b.notas !== undefined) out.Notas = String(b.notas ?? "").trim()
  if (!parcial && b.registro !== undefined) out.Registro = String(b.registro ?? "").trim()
  return out
}

// Dinero que sale del negocio: dirección lo ve todo, de gerente para abajo
// cada quien ve solo los depósitos que registró. Se recorta aquí y no solo en
// la pantalla, para que pedirlo a mano a la API tampoco los muestre.
app.get("/api/depositos", exigeNivel("gerente"), async (req, res) => {
  try {
    const todos = (await nocoGet(T.depositos, "&sort=-Fecha,-Id")).map(depositoDe)
    const quien = req.usuario
    if (!quien) return res.json(todos)
    res.json(todos.filter(d => depositoVisible(d, quien)))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post("/api/depositos", exigeNivel("gerente"), async (req, res) => {
  let campos
  try { campos = await camposDeposito(req.body ?? {}) }
  catch (err) { return res.status(400).json({ error: err.message }) }
  try {
    const r = await nocoPost(T.depositos, campos)
    res.json({ ok: true, id: r.Id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch("/api/depositos/:id", exigeNivel("gerente"), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!id) return res.status(400).json({ error: "Depósito no válido" })
  let campos
  try { campos = await camposDeposito(req.body ?? {}, true) }
  catch (err) { return res.status(400).json({ error: err.message }) }
  try {
    await nocoPatch(T.depositos, { Id: id, ...campos })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete("/api/depositos/:id", exigeNivel("gerente"), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!id) return res.status(400).json({ error: "Depósito no válido" })
  try { await nocoDelete(T.depositos, id); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Notas (POS → Caja) ────────────────────────────────

// Crear borrador — reserva folio único; reutiliza cancelados del año actual
app.post("/api/notas/borrador", exigeSucursal(), async (req, res) => {
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
        Fecha: fechaNegocio(),
        Cliente: "Mostrador", Observaciones: "",
        Items_JSON: "[]", Pagos_JSON: "[]",
        Subtotal: 0, IVA: 0, Total: 0,
      })
      return res.json({ ok: true, id: nota.Id, folio: nota.Folio })
    }
    // Sin cancelados — crear nuevo
    const nota   = await nocoPost(T.ventas, {
      Fecha: fechaNegocio(),
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

// Guardar lo que el vendedor lleva capturado, sin cambiar de estado.
// Sin esto el borrador existe pero vacío: nadie más se entera de que esa
// mercancía ya está apartada, y dos vendedores venden la misma pieza.
app.patch("/api/notas/:id/items", async (req, res) => {
  try {
    await nocoPatch(T.ventas, {
      Id: parseInt(req.params.id),
      Items_JSON: JSON.stringify(req.body?.items ?? []),
    })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Mercancía apartada en notas que todavía no se cobran: borradores que alguien
// está capturando ahora mismo y notas esperando en caja. El stock real no baja
// hasta el cobro, así que esto es lo que separa el stock que hay del que queda.
// Un borrador que alguien dejó abierto y olvidó no puede apartar para siempre:
// pasados estos minutos sin tocarlo, deja de contar.
const MINUTOS_BORRADOR_VIVO = 30

app.get("/api/stock-comprometido", async (req, res) => {
  const { sucursal, excluir } = req.query
  try {
    const [borradores, enCaja] = await Promise.all([
      nocoGet(T.ventas, "&where=(EstadoNota,eq,borrador)&limit=500"),
      nocoGet(T.ventas, "&where=(EstadoNota,eq,en_caja)&limit=500"),
    ])
    const corte  = Date.now() - MINUTOS_BORRADOR_VIVO * 60000
    const porSku = {}

    for (const n of [...borradores, ...enCaja]) {
      if (excluir && String(n.Id) === String(excluir)) continue
      if (sucursal && String(n.Sucursal ?? "").toLowerCase() !== String(sucursal).toLowerCase()) continue
      if (n.EstadoNota === "borrador") {
        const tocado = Date.parse(n.UpdatedAt ?? n.CreatedAt ?? "")
        if (!tocado || tocado < corte) continue
      }
      let items = []
      try { items = JSON.parse(n.Items_JSON || "[]") } catch {}
      for (const it of items) {
        if (!it || it.tipo === "descuento" || !it.sku) continue
        const base = (Number(it.qty) || 0) * (Number(it.factor) || 1)
        if (base > 0) porSku[it.sku] = (porSku[it.sku] ?? 0) + base
      }
    }
    res.json(porSku)
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
app.post("/api/notas", exigeSucursal(), async (req, res) => {
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
app.patch("/api/caja/:id/cobrar", exigeSucursal(), async (req, res) => {
  const { pagos, sucursal, forzar, forzadoPor } = req.body
  try {
    // Fetch the nota to get items
    const notas = await nocoGet(T.ventas, `&where=(Id,eq,${parseInt(req.params.id)})`)
    if (!notas.length) return res.status(404).json({ error: "Nota no encontrada" })
    const nota  = notas[0]
    const items = JSON.parse(nota.Items_JSON || "[]")
    const suc   = (sucursal ?? nota.Sucursal ?? "centro").toLowerCase()
    const campo = suc.includes("repostero") ? "Repostero" : suc.includes("bodega") ? "Bodega" : "Centro"

    // Las líneas de descuento viajan en el mismo array pero no son productos.
    const productos = items.filter(i => i && i.tipo !== "descuento")

    // Se revisa antes de descontar nada. Si no alcanza se devuelve qué falta,
    // para que en caja se decida: no siempre el sistema tiene la razón contra
    // lo que hay en el anaquel, y bloquear la venta con el cliente enfrente
    // sería peor que el negativo. Por eso se puede seguir dejando constancia.
    const faltan = await faltantesDe(productos, campo)
    if (faltan.length && !forzar) {
      return res.status(409).json({ error: "No alcanza el stock", faltantes: faltan })
    }

    for (const item of productos) {
      await descontarNiveles(item, campo)
    }

    // Cobrar con faltante no se pierde: queda escrito en la nota quién lo
    // autorizó y de qué producto, que es lo que después se revisa.
    const marca = faltan.length
      ? `[Sin stock, cobrado por ${forzadoPor || "sin identificar"}: ` +
        faltan.map(x => `${x.nombre} pedía ${x.pide}, había ${x.hay}`).join("; ") + "]"
      : ""

    await nocoPatch(T.ventas, {
      Id: parseInt(req.params.id),
      EstadoNota: "pagada",
      Estado: "pagada",
      Pagos_JSON: JSON.stringify(pagos ?? []),
      MetodoPago: pagos?.[0]?.metodo ?? nota.MetodoPago,
      FechaPago: new Date().toISOString(),
      ...(marca ? { Observaciones: [nota.Observaciones, marca].filter(Boolean).join(" ") } : {}),
    })
    res.json({ ok: true, faltantes: faltan })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Imprimir folio ESC/POS
app.post("/api/print/folio", async (req, res) => {
  const { folio, printerName: bodyPrinter } = req.body
  if (!folio) return res.status(400).json({ error: "Falta folio" })
  if (!SERVIDOR_IMPRIME) return res.status(501).json({ error: "El servidor no manda a imprimir directo", motivo: "remoto" })
  const printerName = bodyPrinter || process.env.PRINTER_NAME
  if (!printerName) return res.status(400).json({ error: "No hay impresora configurada. Selecciónala en Ajustes.", motivo: "sin-impresora" })
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
app.get("/api/facturas", exigeNivel("gerente"), async (req, res) => {
  try {
    const ventas = await nocoGet(T.ventas, "&where=(Estado,eq,pagada)&sort=-Fecha")
    res.json(ventas)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch("/api/facturas/:id/solicitar", exigeNivel("gerente"), async (req, res) => {
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

app.patch("/api/facturas/:id/cancelar", exigeNivel("gerente"), async (req, res) => {
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
