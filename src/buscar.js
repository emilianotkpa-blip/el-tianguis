// Buscar por PALABRAS, no por la frase entera.
//
// Antes se buscaba el texto tal cual: escribir "vaso 8" no encontraba nada,
// porque en "Vasos Jaguar #8" esas dos palabras ni van pegadas ni en ese
// orden. Nadie escribe el nombre completo de un producto; se escriben dos o
// tres pedazos de lo que uno recuerda.
//
// También se ignoran acentos y signos: "pinata" encuentra "Piñata" y "vaso 8"
// encuentra "Vasos Jaguar #8" aunque lleve almohadilla.

const sinAdornos = (v) => String(v ?? "")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")   // acentos: é → e, ñ → n
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")       // #, guiones, puntos, comas…
  .trim()

export const palabrasDe = (consulta) => sinAdornos(consulta).split(" ").filter(Boolean)

// Cierto si TODAS las palabras de la consulta aparecen en alguno de los
// campos. Sin consulta, todo pasa: filtrar por nada no es filtrar.
export function coincide(consulta, ...campos) {
  const palabras = palabrasDe(consulta)
  if (!palabras.length) return true
  const texto = campos.map(sinAdornos).join(" ")
  return palabras.every(p => texto.includes(p))
}
