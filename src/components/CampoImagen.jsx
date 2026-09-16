import { useRef, useState } from "react"
import Icon from "./Icon"
import { subirImagenProducto, quitarImagenProducto } from "../api"

// Lado mayor con el que se guarda la foto. Una foto de celular trae 3-5 MB y
// 4000 px; para verla en una tarjeta sobran 900 px y queda en ~100 KB.
const LADO_MAXIMO = 900

async function reducirImagen(archivo) {
  let fuente = await createImageBitmap(archivo).catch(() => null)
  if (!fuente) {
    // Navegadores sin createImageBitmap para este formato
    fuente = await new Promise((ok, mal) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => mal(new Error("No se pudo leer la imagen"))
      i.src = URL.createObjectURL(archivo)
    })
  }
  const k = Math.min(1, LADO_MAXIMO / Math.max(fuente.width, fuente.height))
  const lienzo = document.createElement("canvas")
  lienzo.width  = Math.round(fuente.width * k)
  lienzo.height = Math.round(fuente.height * k)
  const ctx = lienzo.getContext("2d")
  // Fondo blanco: un PNG transparente pasado a JPEG quedaría con fondo negro
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height)
  const webp = lienzo.toDataURL("image/webp", 0.82)
  return webp.startsWith("data:image/webp") ? webp : lienzo.toDataURL("image/jpeg", 0.85)
}

// Foto de un producto. Con producto ya guardado se sube al instante, igual que
// el ajuste de stock; en un producto nuevo todavía no hay dónde colgarla, así
// que se queda pendiente y se sube al crear el producto.
export default function CampoImagen({ productoId, imagen, pendiente, onCambio, onPendiente, addToast }) {
  const entrada = useRef(null)
  const [local, setLocal]           = useState(null)   // lo que se ve mientras sube
  const [subiendo, setSubiendo]     = useState(false)
  const [arrastrando, setArrastra]  = useState(false)

  const vista = local ?? pendiente ?? imagen

  const recibir = async (archivo) => {
    if (!archivo) return
    if (!archivo.type.startsWith("image/")) {
      return addToast?.({ kind: "err", msg: "Ese archivo no es una imagen" })
    }
    let dataUrl
    try { dataUrl = await reducirImagen(archivo) }
    catch (err) { return addToast?.({ kind: "err", msg: err.message }) }

    if (!productoId) { onPendiente?.(dataUrl); return }

    setLocal(dataUrl)
    setSubiendo(true)
    try {
      const r = await subirImagenProducto(productoId, dataUrl)
      onCambio?.(r.imagen)
      addToast?.({ kind: "ok", msg: "Imagen guardada" })
      // Se precarga la del servidor y hasta entonces se deja la local: así el
      // cambio de una a otra no parpadea
      const pre = new Image()
      pre.onload = pre.onerror = () => setLocal(null)
      pre.src = r.imagen
    } catch (err) {
      setLocal(null)
      addToast?.({ kind: "err", msg: err.message })
    } finally {
      setSubiendo(false)
    }
  }

  const quitar = async () => {
    if (!productoId) { onPendiente?.(null); return }
    setSubiendo(true)
    try {
      await quitarImagenProducto(productoId)
      setLocal(null)
      onCambio?.(null)
    } catch (err) {
      addToast?.({ kind: "err", msg: err.message })
    } finally {
      setSubiendo(false)
    }
  }

  const soltar = (e) => {
    e.preventDefault()
    setArrastra(false)
    recibir(e.dataTransfer.files?.[0])
  }

  return (
    <div
      className={"campo-imagen" + (arrastrando ? " arrastrando" : "")}
      onDragOver={e => { e.preventDefault(); setArrastra(true) }}
      onDragLeave={() => setArrastra(false)}
      onDrop={soltar}
    >
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={e => { recibir(e.target.files?.[0]); e.target.value = "" }}
      />

      {vista ? (
        <>
          <button type="button" className="ci-vista" onClick={() => entrada.current?.click()} title="Cambiar imagen">
            <img src={vista} alt="Imagen del producto" />
            {subiendo && <span className="ci-cargando"><span className="ci-giro" /></span>}
          </button>
          <div className="ci-info">
            <span className="ci-estado">
              {subiendo ? "Guardando…" : !productoId ? "Se sube al crear el producto" : "Imagen guardada"}
            </span>
            <div className="ci-acciones">
              <button type="button" className="btn btn-default btn-sm" disabled={subiendo} onClick={() => entrada.current?.click()}>
                <Icon name="upload" size={12} /> Cambiar
              </button>
              <button type="button" className="btn btn-ghost btn-sm ci-quitar" disabled={subiendo} onClick={quitar}>
                <Icon name="trash" size={12} /> Quitar
              </button>
            </div>
          </div>
        </>
      ) : (
        <button type="button" className="ci-vacio" onClick={() => entrada.current?.click()}>
          <span className="ci-icono"><Icon name="upload" size={18} /></span>
          <span>
            <strong>Agregar imagen</strong>
            <small>Arrastra una foto o haz clic · JPG, PNG o WebP</small>
          </span>
        </button>
      )}
    </div>
  )
}
