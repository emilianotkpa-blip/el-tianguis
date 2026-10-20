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
