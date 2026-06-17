import sharp from "sharp"
import { existsSync, mkdirSync } from "fs"

if (!existsSync("public")) mkdirSync("public")

const src = "src/assets/logo.jpeg"

// fit: "cover" recorta al centro usando el fondo natural del logo (morado)
await sharp(src).resize(192, 192, { fit: "cover" }).png().toFile("public/pwa-192.png")
console.log("✓ pwa-192.png")

await sharp(src).resize(512, 512, { fit: "cover" }).png().toFile("public/pwa-512.png")
console.log("✓ pwa-512.png")

await sharp(src).resize(512, 512, { fit: "cover" }).png().toFile("public/maskable-512.png")
console.log("✓ maskable-512.png")

await sharp(src).resize(180, 180, { fit: "cover" }).png().toFile("public/apple-touch-icon.png")
console.log("✓ apple-touch-icon.png")

console.log("\nÍconos generados en public/")
