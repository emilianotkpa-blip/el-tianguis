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

// Los depósitos son dinero que sale del negocio: de gerente para abajo cada
// quien ve solo los que registró. Dirección los ve todos.
export const veTodosLosDepositos = (user) => puedeVer(user, "directivo")
