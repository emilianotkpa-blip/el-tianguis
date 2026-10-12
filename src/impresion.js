// Tipo de hoja con el que imprime este dispositivo. Se guarda aquí y no en el
// servidor porque es del equipo: la caja tiene el rollo térmico y la
// computadora de dirección, una impresora de hojas.
export const HOJAS = {
  rollo: {
    valor: "rollo",
    nombre: "Rollo de 5.5 cm",
    detalle: "Ticket térmico, una nota debajo de la otra",
    // auto de alto: el rollo corta donde termina el contenido
    pagina: "@page { size: 55mm auto; margin: 2mm 2mm 6mm; }",
  },
  carta: {
    valor: "carta",
    nombre: "Hoja normal (carta)",
    detalle: "Las dos copias lado a lado en la misma hoja",
    pagina: "@page { size: letter; margin: 8mm; }",
  },
}

const LLAVE = "elt_hoja"

export const hojaGuardada = () => {
  const v = localStorage.getItem(LLAVE)
  return HOJAS[v] ? v : "rollo"     // lo que se usa hoy
}

// El tamaño de página no se puede cambiar con una clase: @page no entiende de
// selectores. Se reescribe una etiqueta <style> propia.
export function aplicarHoja(hoja) {
  const elegida = HOJAS[hoja] ? hoja : "rollo"
  localStorage.setItem(LLAVE, elegida)
  document.documentElement.setAttribute("data-hoja", elegida)
  let etiqueta = document.getElementById("elt-pagina")
  if (!etiqueta) {
    etiqueta = document.createElement("style")
    etiqueta.id = "elt-pagina"
    document.head.appendChild(etiqueta)
  }
  etiqueta.textContent = HOJAS[elegida].pagina
  return elegida
}
