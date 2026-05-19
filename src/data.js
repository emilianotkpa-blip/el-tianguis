export const SUCURSALES = [
  { id: "centro", name: "Tianguis Centro", short: "Centro", desc: "Sucursal principal · Av. Hidalgo 245" },
  { id: "repostero", name: "Tianguis Repostero", short: "Repostero", desc: "Sucursal repostería · Calle Morelos 88" },
  { id: "bodega", name: "Bodega", short: "Bodega", desc: "Almacén central · Parque Industrial Norte" },
]

export const CATEGORIAS = [
  { id: "all", name: "Todos" },
  { id: "vasos", name: "Vasos" },
  { id: "platos", name: "Platos" },
  { id: "bolsas", name: "Bolsas" },
  { id: "rollos", name: "Rollos" },
  { id: "servilletas", name: "Servilletas" },
  { id: "cubiertos", name: "Cubiertos" },
]

export const PRODUCTOS = [
  { sku: "VAS-JAG-08", name: "Vasos Jaguar #8",       cat: "vasos",       precio: 38.50, costo: 24.00, unidad: "paq/50",  stock: { centro: 142, repostero: 64, bodega: 480 }, min: 30 },
  { sku: "VAS-INX-16", name: "Vaso Inix #16",         cat: "vasos",       precio: 52.00, costo: 33.20, unidad: "paq/50",  stock: { centro: 18,  repostero: 22, bodega: 220 }, min: 25 },
  { sku: "VAS-JAG-12", name: "Vasos Jaguar #12",      cat: "vasos",       precio: 46.00, costo: 29.50, unidad: "paq/50",  stock: { centro: 88,  repostero: 41, bodega: 340 }, min: 30 },
  { sku: "VAS-INX-08", name: "Vaso Inix #8",          cat: "vasos",       precio: 36.00, costo: 22.80, unidad: "paq/50",  stock: { centro: 0,   repostero: 12, bodega: 90  }, min: 25 },
  { sku: "PLT-RYM-855", name: "Plato Reyma 855",      cat: "platos",      precio: 65.00, costo: 42.00, unidad: "paq/25",  stock: { centro: 56,  repostero: 80, bodega: 410 }, min: 30 },
  { sku: "PLT-RYM-715", name: "Plato Reyma 715",      cat: "platos",      precio: 48.00, costo: 31.00, unidad: "paq/25",  stock: { centro: 92,  repostero: 33, bodega: 280 }, min: 30 },
  { sku: "PLT-FOAM-9", name: 'Plato Foam 9"',         cat: "platos",      precio: 42.00, costo: 26.50, unidad: "paq/25",  stock: { centro: 11,  repostero: 5,  bodega: 165 }, min: 20 },
  { sku: "SRV-GRA-100", name: "Servilletas grandes",  cat: "servilletas", precio: 28.00, costo: 17.50, unidad: "paq/100", stock: { centro: 210, repostero: 124, bodega: 720 }, min: 50 },
  { sku: "SRV-COC-50", name: "Servilletas cocteleras",cat: "servilletas", precio: 18.00, costo: 11.00, unidad: "paq/100", stock: { centro: 88,  repostero: 60, bodega: 410 }, min: 40 },
  { sku: "BOL-PLP-1K", name: "Bolsa 1kg polpusa",     cat: "bolsas",      precio: 22.50, costo: 14.00, unidad: "paq/100", stock: { centro: 320, repostero: 110, bodega: 1240 }, min: 80 },
  { sku: "BOL-PLP-2K", name: "Bolsa 2kg polpusa",     cat: "bolsas",      precio: 32.00, costo: 20.50, unidad: "paq/100", stock: { centro: 245, repostero: 88, bodega: 980 }, min: 60 },
  { sku: "BOL-PLP-5K", name: "Bolsa 5kg polpusa",     cat: "bolsas",      precio: 58.00, costo: 38.00, unidad: "paq/50",  stock: { centro: 95,  repostero: 24, bodega: 410 }, min: 40 },
  { sku: "BOL-CAM-2",  name: "Bolsa camiseta #2",     cat: "bolsas",      precio: 75.00, costo: 48.00, unidad: "paq/100", stock: { centro: 55,  repostero: 19, bodega: 320 }, min: 30 },
  { sku: "ROL-15X25",  name: "Rollo 15×25 polpusa",   cat: "rollos",      precio: 145.00, costo: 92.00, unidad: "rollo",  stock: { centro: 14,  repostero: 6,  bodega: 78  }, min: 8  },
  { sku: "ROL-20X30",  name: "Rollo 20×30 polpusa",   cat: "rollos",      precio: 195.00, costo: 124.00, unidad: "rollo", stock: { centro: 22,  repostero: 9,  bodega: 64  }, min: 8  },
  { sku: "CUB-TEN-50", name: "Tenedor desechable",    cat: "cubiertos",   precio: 26.00, costo: 16.50, unidad: "paq/50",  stock: { centro: 78,  repostero: 92, bodega: 510 }, min: 40 },
  { sku: "CUB-CUC-50", name: "Cuchara desechable",    cat: "cubiertos",   precio: 26.00, costo: 16.50, unidad: "paq/50",  stock: { centro: 65,  repostero: 4,  bodega: 380 }, min: 40 },
  { sku: "CUB-CUH-50", name: "Cuchillo desechable",   cat: "cubiertos",   precio: 26.00, costo: 16.50, unidad: "paq/50",  stock: { centro: 42,  repostero: 25, bodega: 290 }, min: 40 },
]

export const CLIENTES = [
  { id: "C-001", name: "Repostería Doña Lupe",      rfc: "RDL850412AB1", tipo: "Mayorista", saldo: 4250.00, ult: "2026-04-22" },
  { id: "C-002", name: "Taquería El Buen Sabor",    rfc: "TBS920301KL5", tipo: "Mayorista", saldo: 0,       ult: "2026-04-24" },
  { id: "C-003", name: "Cafetería Aroma",           rfc: "CAR011215XY9", tipo: "Frecuente", saldo: 1180.00, ult: "2026-04-23" },
  { id: "C-004", name: "Eventos María",             rfc: "EMA780625PQ3", tipo: "Mayorista", saldo: 6800.00, ult: "2026-04-19" },
  { id: "C-005", name: "Cocina Económica López",    rfc: "CEL940818MN7", tipo: "Frecuente", saldo: 320.00,  ult: "2026-04-25" },
  { id: "C-006", name: "Mostrador",                 rfc: "XAXX010101000",tipo: "Público",   saldo: 0,       ult: "2026-04-25" },
]

export const FACTURAS = [
  { folio: "F-2026-0488", fecha: "2026-04-25", cliente: "Repostería Doña Lupe",   subtotal: 2120.00, iva: 339.20, total: 2459.20, estado: "pagada",    metodo: "Transferencia" },
  { folio: "F-2026-0487", fecha: "2026-04-25", cliente: "Cocina Económica López", subtotal: 480.00,  iva: 76.80,  total: 556.80,  estado: "pagada",    metodo: "Efectivo" },
  { folio: "F-2026-0486", fecha: "2026-04-24", cliente: "Taquería El Buen Sabor", subtotal: 1320.00, iva: 211.20, total: 1531.20, estado: "pagada",    metodo: "Tarjeta" },
  { folio: "F-2026-0485", fecha: "2026-04-24", cliente: "Eventos María",          subtotal: 5840.00, iva: 934.40, total: 6774.40, estado: "pendiente", metodo: "Crédito 15d" },
  { folio: "F-2026-0484", fecha: "2026-04-23", cliente: "Cafetería Aroma",        subtotal: 1018.00, iva: 162.88, total: 1180.88, estado: "pendiente", metodo: "Crédito 8d" },
  { folio: "F-2026-0483", fecha: "2026-04-23", cliente: "Repostería Doña Lupe",   subtotal: 1546.00, iva: 247.36, total: 1793.36, estado: "pagada",    metodo: "Transferencia" },
  { folio: "F-2026-0482", fecha: "2026-04-22", cliente: "Mostrador",              subtotal: 256.00,  iva: 40.96,  total: 296.96,  estado: "pagada",    metodo: "Efectivo" },
  { folio: "F-2026-0481", fecha: "2026-04-22", cliente: "Eventos María",          subtotal: 3220.00, iva: 515.20, total: 3735.20, estado: "cancelada", metodo: "—" },
  { folio: "F-2026-0480", fecha: "2026-04-21", cliente: "Taquería El Buen Sabor", subtotal: 880.00,  iva: 140.80, total: 1020.80, estado: "pagada",    metodo: "Efectivo" },
  { folio: "F-2026-0479", fecha: "2026-04-21", cliente: "Repostería Doña Lupe",   subtotal: 2415.00, iva: 386.40, total: 2801.40, estado: "pagada",    metodo: "Transferencia" },
]

export const PEDIDOS_CLIENTES = [
  { id: "PC-1042", fecha: "2026-04-25", cliente: "Eventos María",          items: 12, total: 6774.40, estado: "preparando", entrega: "2026-04-27", sucursal: "Centro" },
  { id: "PC-1041", fecha: "2026-04-25", cliente: "Repostería Doña Lupe",   items: 6,  total: 2459.20, estado: "listo",      entrega: "2026-04-25", sucursal: "Repostero" },
  { id: "PC-1040", fecha: "2026-04-24", cliente: "Cafetería Aroma",        items: 4,  total: 1180.88, estado: "entregado",  entrega: "2026-04-24", sucursal: "Centro" },
  { id: "PC-1039", fecha: "2026-04-24", cliente: "Cocina Económica López", items: 3,  total: 556.80,  estado: "entregado",  entrega: "2026-04-24", sucursal: "Centro" },
  { id: "PC-1038", fecha: "2026-04-23", cliente: "Taquería El Buen Sabor", items: 8,  total: 1531.20, estado: "entregado",  entrega: "2026-04-24", sucursal: "Centro" },
  { id: "PC-1037", fecha: "2026-04-23", cliente: "Eventos María",          items: 5,  total: 1820.00, estado: "cancelado",  entrega: "—",         sucursal: "—" },
  { id: "PC-1036", fecha: "2026-04-22", cliente: "Repostería Doña Lupe",   items: 9,  total: 1793.36, estado: "entregado",  entrega: "2026-04-23", sucursal: "Repostero" },
]

export const PEDIDOS_MERCANCIA = [
  { id: "PM-0312", fecha: "2026-04-24", proveedor: "Distribuidora Polpusa S.A.", destino: "Tianguis Centro",    items: 8, total: 18420.00, estado: "en tránsito" },
  { id: "PM-0311", fecha: "2026-04-23", proveedor: "Reyma México",               destino: "Bodega",             items: 5, total: 12380.00, estado: "recibido" },
  { id: "PM-0310", fecha: "2026-04-22", proveedor: "Plásticos del Norte",        destino: "Tianguis Repostero", items: 6, total: 8640.00,  estado: "recibido" },
  { id: "PM-0309", fecha: "2026-04-21", proveedor: "Distribuidora Polpusa S.A.", destino: "Tianguis Centro",    items: 4, total: 5240.00,  estado: "recibido" },
  { id: "PM-0308", fecha: "2026-04-19", proveedor: "Inix S.A. de C.V.",          destino: "Bodega",             items: 7, total: 14680.00, estado: "recibido" },
]

export const VENTAS_DIARIAS_30D = [
  4820, 5210, 4980, 6150, 7240, 8120, 6840,
  5320, 4980, 5640, 6120, 7480, 8420, 7120,
  5840, 6210, 6480, 7240, 8140, 8920, 7820,
  6420, 6840, 7220, 7980, 8640, 9120, 8420,
  7640, 8120,
]

export const VENTAS_MENSUALES = [
  { mes: "Nov '25", ingresos: 184200, costos: 122100, utilidad: 62100 },
  { mes: "Dic '25", ingresos: 246800, costos: 162400, utilidad: 84400 },
  { mes: "Ene '26", ingresos: 198400, costos: 131800, utilidad: 66600 },
  { mes: "Feb '26", ingresos: 212600, costos: 140600, utilidad: 72000 },
  { mes: "Mar '26", ingresos: 234800, costos: 154100, utilidad: 80700 },
  { mes: "Abr '26", ingresos: 218400, costos: 142800, utilidad: 75600 },
]

export const UTIL_POR_CATEGORIA = [
  { cat: "Bolsas",      pct: 32, color: "#72182a" },
  { cat: "Vasos",       pct: 26, color: "#e0a91a" },
  { cat: "Platos",      pct: 18, color: "#e84a8a" },
  { cat: "Servilletas", pct: 12, color: "#1cb6a6" },
  { cat: "Rollos",      pct: 8,  color: "#f08737" },
  { cat: "Cubiertos",   pct: 4,  color: "#b07cd6" },
]

export const TOP_PRODUCTOS = [
  { name: "Bolsa 1kg polpusa",   ventas: 28400 },
  { name: "Vasos Jaguar #8",     ventas: 24180 },
  { name: "Plato Reyma 855",     ventas: 19620 },
  { name: "Bolsa 2kg polpusa",   ventas: 16840 },
  { name: "Servilletas grandes", ventas: 12400 },
  { name: "Rollo 15×25 polpusa", ventas: 9620 },
]

export const VENTAS_POR_SUCURSAL = [
  { sucursal: "Centro",    pct: 54, monto: 117936 },
  { sucursal: "Repostero", pct: 38, monto: 82992 },
  { sucursal: "Bodega",    pct: 8,  monto: 17472 },
]

export const NOTIFICATIONS = [
  { type: "err",  title: "Stock agotado: Vaso Inix #8 (Centro)",       time: "Hace 12 min" },
  { type: "warn", title: "Stock bajo: Cuchara desechable (Repostero)",  time: "Hace 32 min" },
  { type: "warn", title: 'Stock bajo: Plato Foam 9" (Repostero)',       time: "Hace 1 h" },
  { type: "ok",   title: "Pedido PM-0311 recibido en Bodega",           time: "Hace 2 h" },
  { type: "info", title: "Factura F-2026-0485 vence en 14 días",        time: "Hace 4 h" },
]
