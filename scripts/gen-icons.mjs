import sharp from "sharp"
import { existsSync, mkdirSync } from "fs"

if (!existsSync("public")) mkdirSync("public")

const src = "src/assets/logo.jpeg"

// pwa-192 y pwa-512 — íconos estándar (fondo blanco cuadrado)
await sharp(src)
  .resize(192, 192, { fit: "contain", background: { r: 248, g: 245, b: 242, alpha: 1 } })
  .png()
  .toFile("public/pwa-192.png")
console.log("✓ pwa-192.png")

await sharp(src)
  .resize(512, 512, { fit: "contain", background: { r: 248, g: 245, b: 242, alpha: 1 } })
  .png()
  .toFile("public/pwa-512.png")
console.log("✓ pwa-512.png")

// maskable-512 — para Android (zona segura 80% centro, fondo vino)
await sharp(src)
  .resize(410, 410, { fit: "contain", background: { r: 160, g: 35, b: 64, alpha: 1 } })
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: { r: 160, g: 35, b: 64, alpha: 1 } })
  .png()
  .toFile("public/maskable-512.png")
console.log("✓ maskable-512.png")

// apple-touch-icon — 180×180 para iPhone/iPad (fondo blanco)
await sharp(src)
  .resize(150, 150, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .extend({ top: 15, bottom: 15, left: 15, right: 15, background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png()
  .toFile("public/apple-touch-icon.png")
console.log("✓ apple-touch-icon.png")

console.log("\nÍconos generados en public/")
