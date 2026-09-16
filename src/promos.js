// Motor de reglas de precio: combos y proporciones.
//
// Dos casos del negocio:
//   combo      → vaso + tapa juntos cuestan menos que por separado
//   proporcion → 1 tapa por cada N vasos lleva descuento
//
// Reglas de la casa:
//   · El precio de cada línea NO se toca. El ahorro sale como línea aparte,
//     para que el cliente vea de dónde viene y el ticket cuadre.
//   · Cada unidad se descuenta una sola vez: una regla consume las unidades
//     que usa, así dos reglas sobre el mismo vaso no se suman dos veces.
//   · Se evalúan por prioridad (menor número, primero).

const clave = (sku, presId) => `${sku}__${presId ?? "*"}`

// Cuántas unidades del carrito coinciden con un requisito.
// presId nulo o "*" = cualquier presentación de ese producto.
function lineasQueCoinciden(disponibles, req) {
  return disponibles.filter(l =>
    String(l.sku) === String(req.sku) &&
    (!req.presId || req.presId === "*" || l.presId === req.presId)
  )
}

const totalDisponible = (lineas) => lineas.reduce((s, l) => s + l.libres, 0)

// Consume `cantidad` unidades de las líneas dadas, de la más cara a la más
// barata: si el combo se puede armar con distintas presentaciones, conviene
// al cliente que se gaste primero la de mayor precio.
function consumir(lineas, cantidad) {
  let resta = cantidad
  const usadas = []
  for (const l of [...lineas].sort((a, b) => b.precio - a.precio)) {
    if (resta <= 0) break
    const toma = Math.min(l.libres, resta)
    if (toma > 0) {
      l.libres -= toma
      resta -= toma
      usadas.push({ linea: l, cantidad: toma })
    }
  }
  return usadas
}

export function montoDelEfecto(efecto, precioNormal) {
  if (!efecto) return 0
  if (efecto.tipo === "precio_paquete") return Math.max(0, precioNormal - (Number(efecto.valor) || 0))
  if (efecto.tipo === "descuento_monto") return Math.min(precioNormal, Number(efecto.valor) || 0)
  if (efecto.tipo === "descuento_pct") return precioNormal * (Math.min(100, Number(efecto.valor) || 0) / 100)
  return 0
}

function evaluarCombo(regla, disponibles) {
  const items = regla.config?.items ?? []
  if (items.length < 2) return null

  // Cuántas veces se puede armar el combo completo
  let veces = Infinity
  for (const req of items) {
    const lineas = lineasQueCoinciden(disponibles, req)
    veces = Math.min(veces, Math.floor(totalDisponible(lineas) / (req.cant || 1)))
    if (veces <= 0) return null
  }
  if (!veces || veces === Infinity) return null

  // Precio normal de un combo, tomando las unidades que realmente se usarían
  let precioNormalUno = 0
  let todoFacturable = true
  const aConsumir = []
  for (const req of items) {
    const lineas = lineasQueCoinciden(disponibles, req)
    const usadas = consumir(lineas, (req.cant || 1) * veces)
    for (const u of usadas) {
      precioNormalUno += u.linea.precio * u.cantidad
      if (u.linea.facturable === false) todoFacturable = false
    }
    aConsumir.push(...usadas)
  }
  precioNormalUno = precioNormalUno / veces

  const ahorroUno = montoDelEfecto(regla.config?.efecto, precioNormalUno)
  if (ahorroUno <= 0) return null

  return {
    reglaId: regla.id,
    nombre: regla.nombre,
    veces,
    monto: +(ahorroUno * veces).toFixed(2),
    facturable: todoFacturable,
  }
}

function evaluarProporcion(regla, disponibles) {
  const { porCada, aplicaA, efecto } = regla.config ?? {}
  if (!porCada || !aplicaA) return null

  const lineasBase = lineasQueCoinciden(disponibles, porCada)
  const lineasDesc = lineasQueCoinciden(disponibles, aplicaA)
  const cantBase = porCada.cant || 1
  const cantDesc = aplicaA.cant || 1

  const veces = Math.min(
    Math.floor(totalDisponible(lineasBase) / cantBase),
    Math.floor(totalDisponible(lineasDesc) / cantDesc),
  )
  if (veces <= 0) return null

  // La base solo habilita el descuento; se consume para que no la reutilice
  // otra regla, pero el ahorro se calcula sobre el producto beneficiado.
  consumir(lineasBase, cantBase * veces)
  const usadasDesc = consumir(lineasDesc, cantDesc * veces)

  let precioDesc = 0
  let facturable = true
  for (const u of usadasDesc) {
    precioDesc += u.linea.precio * u.cantidad
    if (u.linea.facturable === false) facturable = false
  }

  const ahorro = montoDelEfecto(efecto, precioDesc)
  if (ahorro <= 0) return null

  return {
    reglaId: regla.id,
    nombre: regla.nombre,
    veces,
    monto: +ahorro.toFixed(2),
    facturable,
  }
}

// cart: [{ key, sku, presId, precio, qty, facturable }]
// reglas: [{ id, nombre, tipo, activo, prioridad, config }]
// → { descuentos: [{ reglaId, nombre, veces, monto, facturable }], total, totalFacturable }
export function evaluarPromos(cart = [], reglas = []) {
  const activas = (reglas || [])
    .filter(r => r && r.activo !== false)
    .sort((a, b) => (a.prioridad ?? 100) - (b.prioridad ?? 100))

  // Copia de trabajo: cada línea lleva las unidades que aún nadie usó
  const disponibles = cart.map(l => ({
    key: l.key ?? clave(l.sku, l.presId),
    sku: l.sku,
    presId: l.presId,
    precio: Number(l.precio) || 0,
    facturable: l.facturable,
    libres: Number(l.qty) || 0,
  }))

  const descuentos = []
  for (const regla of activas) {
    const r = regla.tipo === "proporcion"
      ? evaluarProporcion(regla, disponibles)
      : evaluarCombo(regla, disponibles)
    if (r && r.monto > 0) descuentos.push(r)
  }

  const total = +descuentos.reduce((s, d) => s + d.monto, 0).toFixed(2)
  const totalFacturable = +descuentos
    .filter(d => d.facturable)
    .reduce((s, d) => s + d.monto, 0)
    .toFixed(2)

  return { descuentos, total, totalFacturable, restantes: disponibles }
}

// Qué le falta al carrito para activar una regla que todavía no aplica.
// Solo sugiere cuando el cliente YA lleva parte del paquete: proponer los dos
// productos de la nada sería publicidad, no ayuda.
export function sugerenciasPromos(restantes = [], reglas = [], catalogo = [], maxFaltante = 3) {
  const activas = (reglas || [])
    .filter(r => r && r.activo !== false)
    .sort((a, b) => (a.prioridad ?? 100) - (b.prioridad ?? 100))

  const libres = (req) => restantes
    .filter(l => String(l.sku) === String(req.sku) && (!req.presId || req.presId === "*" || l.presId === req.presId))
    .reduce((s, l) => s + l.libres, 0)

  const nombreDe = (sku) => catalogo.find(p => String(p.sku) === String(sku))?.name ?? sku

  const out = []
  for (const regla of activas) {
    const c = regla.config ?? {}
    const requisitos = regla.tipo === "proporcion"
      ? [c.porCada, c.aplicaA].filter(Boolean)
      : (c.items ?? []).filter(i => i.sku)
    if (requisitos.length < 2) continue

    let tieneAlgo = false
    let faltanTotal = 0
    const faltan = []
    for (const req of requisitos) {
      const hay = libres(req)
      if (hay > 0) tieneAlgo = true
      const falta = Math.max(0, (req.cant || 1) - hay)
      if (falta > 0) {
        faltanTotal += falta
        faltan.push({ sku: req.sku, presId: req.presId, cant: falta, nombre: nombreDe(req.sku) })
      }
    }
    // Ya aplica (no falta nada) o el cliente no lleva nada del paquete
    if (!faltan.length || !tieneAlgo || faltanTotal > maxFaltante) continue

    const sim = simularRegla(regla, catalogo)
    if (!sim || sim.incompleta || !(sim.ahorro > 0)) continue
    out.push({ reglaId: regla.id, nombre: regla.nombre, faltan, ahorro: sim.ahorro })
  }
  return out
}

// Texto corto para mostrar la regla en pantalla
export function describirRegla(regla, catalogo = []) {
  const nombreDe = (sku) => catalogo.find(p => String(p.sku) === String(sku))?.name ?? sku
  const c = regla.config ?? {}
  if (regla.tipo === "proporcion") {
    if (!c.porCada || !c.aplicaA) return "Regla incompleta"
    return `Por cada ${c.porCada.cant || 1} × ${nombreDe(c.porCada.sku)} → ${describirEfecto(c.efecto)} en ${nombreDe(c.aplicaA.sku)}`
  }
  const items = c.items ?? []
  if (items.length < 2) return "Regla incompleta"
  return `${items.map(i => `${i.cant || 1} × ${nombreDe(i.sku)}`).join(" + ")} → ${describirEfecto(c.efecto)}`
}

export function describirEfecto(efecto) {
  if (!efecto) return "sin efecto"
  const v = Number(efecto.valor) || 0
  if (efecto.tipo === "precio_paquete")  return `precio de paquete $${v.toFixed(2)}`
  if (efecto.tipo === "descuento_monto") return `descuento de $${v.toFixed(2)}`
  if (efecto.tipo === "descuento_pct")   return `${v}% de descuento`
  return "sin efecto"
}

// Los descuentos viajan dentro de Items_JSON como líneas marcadas, para no
// depender de una columna nueva en la base. Todo lo que recorra los items de
// una nota debe separar unas de otras con estos dos helpers.
export const soloProductos  = (items) => (items || []).filter(i => i && i.tipo !== "descuento")
export const soloDescuentos = (items) => (items || []).filter(i => i && i.tipo === "descuento")
export const sumaDescuentos = (items, soloFacturables = false) =>
  soloDescuentos(items)
    .filter(d => !soloFacturables || d.facturable)
    .reduce((s, d) => s + (Number(d.monto) || 0), 0)

// Precio unitario de un requisito de regla ({ sku, presId, cant }), leyendo el
// catálogo. presId "*" = la primera presentación activa con precio.
export function precioDeRequisito(req, catalogo = []) {
  if (!req?.sku) return null
  const prod = catalogo.find(p => String(p.sku) === String(req.sku))
  if (!prod) return null
  const pres = (prod.presentaciones ?? []).filter(x => x.activo !== false)
  if (req.presId && req.presId !== "*") {
    const elegida = pres.find(x => x.id === req.presId)
    return elegida?.precio > 0 ? elegida.precio : null
  }
  const conPrecio = pres.find(x => x.precio > 0)
  if (conPrecio) return conPrecio.precio
  return prod.precio > 0 ? prod.precio : null
}

// Qué pasaría con una regla tal como está capturada, para mostrarlo mientras
// se edita: cuánto cuesta normal, en cuánto queda y cuánto se ahorra.
// Devuelve null si todavía falta información.
export function simularRegla(regla, catalogo = []) {
  const c = regla?.config ?? {}
  const efecto = c.efecto
  if (!efecto || !(Number(efecto.valor) > 0)) return null

  let normal = 0
  let faltanPrecios = false

  if (regla.tipo === "proporcion") {
    // El beneficio cae sobre el producto que lleva descuento, no sobre la base
    const precio = precioDeRequisito(c.aplicaA, catalogo)
    if (precio == null) return { incompleta: true }
    normal = precio * (c.aplicaA?.cant || 1)
  } else {
    const items = (c.items ?? []).filter(i => i.sku)
    if (items.length < 2) return { incompleta: true }
    for (const it of items) {
      const precio = precioDeRequisito(it, catalogo)
      if (precio == null) { faltanPrecios = true; break }
      normal += precio * (it.cant || 1)
    }
    if (faltanPrecios) return { incompleta: true }
  }

  if (!(normal > 0)) return { incompleta: true }

  const ahorro = montoDelEfecto(efecto, normal)
  const queda  = normal - ahorro
  return {
    normal: +normal.toFixed(2),
    queda: +queda.toFixed(2),
    ahorro: +ahorro.toFixed(2),
    pct: normal > 0 ? Math.round((ahorro / normal) * 100) : 0,
    // Un paquete que cuesta más que comprar suelto casi siempre es un dedazo
    sinBeneficio: ahorro <= 0,
    masCaro: efecto.tipo === "precio_paquete" && Number(efecto.valor) > normal,
  }
}
