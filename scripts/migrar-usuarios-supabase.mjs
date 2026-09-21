// Crea en Supabase Auth una cuenta por cada persona activa de la tabla Equipo
// de NocoDB, con una contraseña inicial que cada quien cambia después desde
// "Mi perfil". No borra nada ni toca a quien ya tenga cuenta.
//
//   node scripts/migrar-usuarios-supabase.mjs              → solo dice qué haría
//   node scripts/migrar-usuarios-supabase.mjs --aplicar    → la crea de verdad
//
// Necesita en el entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE, NOCO_URL,
// NOCO_TOKEN, NOCO_TABLE_EQUIPO y CLAVE_INICIAL.
import "dotenv/config"

const SUPA    = (process.env.SUPABASE_URL || "").replace(/\/$/, "")
const SERVICE = process.env.SUPABASE_SERVICE_ROLE
const NOCO    = (process.env.NOCO_URL || "").replace(/\/$/, "")
const TOKEN   = process.env.NOCO_TOKEN
const EQUIPO  = process.env.NOCO_TABLE_EQUIPO
const CLAVE   = process.env.CLAVE_INICIAL
const aplicar = process.argv.includes("--aplicar")

const falta = Object.entries({ SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE: SERVICE, NOCO_URL: NOCO, NOCO_TOKEN: TOKEN, NOCO_TABLE_EQUIPO: EQUIPO, CLAVE_INICIAL: CLAVE })
  .filter(([, v]) => !v).map(([k]) => k)
if (falta.length) { console.error("Faltan variables:", falta.join(", ")); process.exit(1) }
if (CLAVE.length < 8) { console.error("CLAVE_INICIAL debe tener al menos 8 caracteres"); process.exit(1) }

const supa = (ruta, opts = {}) => fetch(SUPA + ruta, {
  ...opts,
  headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
})

const equipo = await fetch(`${NOCO}/api/v2/tables/${EQUIPO}/records?limit=200`, {
  headers: { "xc-token": TOKEN },
}).then(r => r.json())

const gente = (equipo.list ?? []).filter(u => u.Activo !== false && u.Activo !== 0 && u.Gmail)
const yaHay = await supa("/auth/v1/admin/users?per_page=200").then(r => r.json())
const existentes = new Set(((yaHay.users ?? yaHay) || []).map(u => (u.email || "").toLowerCase()))

console.log(aplicar ? "Creando cuentas\n" : "Prueba en seco (nada se escribe)\n")
let creadas = 0, saltadas = 0
for (const u of gente) {
  const correo = u.Gmail.trim().toLowerCase()
  if (existentes.has(correo)) { console.log("  ya tenía cuenta :", correo); saltadas++; continue }
  if (!aplicar) { console.log("  se crearía      :", correo, `(${u.Nombre}, ${u.Rol})`); creadas++; continue }
  const r = await supa("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email: correo, password: CLAVE, email_confirm: true, user_metadata: { nombre: u.Nombre } }),
  })
  if (r.ok) { console.log("  creada          :", correo); creadas++ }
  else { const d = await r.text(); console.log("  FALLÓ           :", correo, r.status, d.slice(0, 160)) }
}
console.log(`\n${creadas} cuenta(s) ${aplicar ? "creadas" : "por crear"}, ${saltadas} ya existían.`)
if (aplicar) {
  console.log("\nSiguiente paso, una vez que todos entren bien:")
  console.log("  borrar la columna Contrasena de la tabla Equipo en NocoDB.")
}
