// Quién puede ver qué. Se compara por NIVEL, no por el nombre exacto del rol:
// en la tabla Equipo conviven etiquetas distintas para el mismo peso ("Cajero"
// y "Empleado", "Dirección" y "Directivo"), y comparar cadenas dejaba pantallas
// escondidas para quien sí debía verlas.
export const NIVEL_ROL = {
  vendedor:       1,
  empleado:       2,
  cajero:         2,
  administrativo: 2,
  gerente:        3,
  directivo:      4,
  direccion:      4,
  dueño:          4,
  dueña:          4,
  duena:          4,
  admin:          5,
}

// Un rol que no esté en la lista cae al nivel más bajo a propósito: si alguien
// se escribe mal en NocoDB, se queda sin ver de más, no al revés.
export const nivelDe = (rol) => NIVEL_ROL[String(rol ?? "").toLowerCase().trim()] ?? 1
export const puedeVer = (user, rolMin) => !rolMin || nivelDe(user?.rol) >= nivelDe(rolMin)

// Admin es el único que puede mirar el sistema con los ojos de otra cuenta.
export const esAdmin = (user) => nivelDe(user?.rol) >= NIVEL_ROL.admin

// De gerencia para arriba cada quien elige desde qué sucursal trabaja, porque
// se mueven entre ellas. De ahí para abajo no se elige: quien atiende una caja
// trabaja donde lo pusieron, y eso lo decide dirección.
//
// El candado es la excepción: a quien de gerencia para arriba vaya a estar
// siempre en la misma sucursal, dirección se la fija y deja de poder cambiarla.
// Se quita para una ocasión especial y se vuelve a poner.
export const tieneSucursalFija    = (user) => Boolean(user?.sucursalFija)
export const puedeElegirSucursal  = (user) => puedeVer(user, "gerente") && !tieneSucursalFija(user)
export const puedeAsignarSucursal = (user) => puedeVer(user, "directivo")

// Las sucursales se escriben de varias formas según de dónde venga el dato:
// "centro", "Centro", "Tianguis Centro"… Se comparan siempre normalizadas.
export function normalizaSucursal(v) {
  const s = String(v ?? "").toLowerCase()
  if (s.includes("repostero")) return "repostero"
  if (s.includes("bodega"))    return "bodega"
  if (s.includes("centro"))    return "centro"
  return ""
}

// Dónde puede OPERAR cada quien (vender, cobrar, mover inventario). Mirar el
// inventario de las otras sucursales sigue permitido para todos: lo que se
// cierra es escribir. Quien elige sucursal al entrar puede trabajar en
// cualquiera; a quien la tiene asignada o con candado, solo en la suya.
export function puedeOperarEn(user, sucursal) {
  if (puedeVer(user, "directivo")) return true
  if (puedeElegirSucursal(user)) return true
  const suya = normalizaSucursal(user?.sucursal ?? user?.sucursalDefault)
  // Sin sucursal asignada no debería ni haber entrado al panel.
  if (!suya) return false
  return normalizaSucursal(sucursal) === suya
}

// A quién hay que asignarle sucursal desde Equipo: a los de nivel bajo
// siempre, y a los de gerencia solo si les pusieron candado.
export const necesitaSucursalAsignada = (user) => !puedeElegirSucursal(user)

// Dinero que sale del negocio: los proveedores (con sus datos bancarios) y el
// historial completo de depósitos son de dirección.
export const veTodosLosDepositos = (user) => puedeVer(user, "directivo")
export const veProveedores       = (user) => puedeVer(user, "directivo")

// De gerente para abajo, cada quien ve sus propios depósitos y solo unos días:
// lo justo para revisar o corregir lo que acaba de registrar, no para repasar
// el movimiento del negocio. La cuenta corre desde que se registró el depósito
// (no desde su fecha), para que nadie pierda de vista lo que acaba de capturar.
export const DIAS_DEPOSITO_VISIBLE = 3

const nombreDe = (user) => String(user?.name ?? user?.nombre ?? "").trim().toLowerCase()

export function depositoVisible(dep, user, ahora = Date.now()) {
  if (veTodosLosDepositos(user)) return true
  if (String(dep?.registro ?? "").trim().toLowerCase() !== nombreDe(user)) return false
  const creado = Date.parse(dep?.creado ?? "")
  // Un registro viejo sin marca de tiempo no se esconde: mejor de más que
  // hacer desaparecer algo por un dato que falta.
  if (!Number.isFinite(creado)) return true
  return ahora - creado <= DIAS_DEPOSITO_VISIBLE * 86_400_000
}
