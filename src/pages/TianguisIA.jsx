import { useState, useRef, useEffect } from "react"
import Icon from "../components/Icon"

const WELCOME = "¡Hola! Soy **Tianguis IA**. Veo el catálogo con las existencias de cada sucursal, las ventas del día y del mes, los pedidos en curso y quién está en el equipo."

// Ejemplos para arrancar. Van aparte del mensaje y se pulsan: si no se dice
// qué sabe, la gente pregunta cualquier cosa, se topa con un "no tengo acceso"
// y no vuelve. Desaparecen en cuanto la conversación empieza.
const SUGERENCIAS = [
  "¿Cuántas cajas de bolsas poliseda quedan en bodega?",
  "¿Qué se agotó en las dos tiendas?",
  "¿Cuánto llevamos vendido hoy?",
  "¿Qué pedidos están en camino?",
]

// El modelo responde en markdown. Se interpreta a JSX (nunca a HTML crudo:
// el texto viene de fuera, así que no se inyecta al DOM sin pasar por React).
function renderInline(texto, prefijo = "") {
  const partes = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let ultimo = 0, m, i = 0
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index))
    const t = m[0]
    partes.push(t.startsWith("**")
      ? <strong key={prefijo + i}>{t.slice(2, -2)}</strong>
      : <code key={prefijo + i} className="ia-code">{t.slice(1, -1)}</code>)
    ultimo = m.index + t.length
    i++
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return partes
}

function renderMarkdown(contenido) {
  const bloques = []
  let lista = null
  contenido.split("\n").forEach((linea) => {
    const item = linea.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/)
    if (item) {
      if (!lista) { lista = []; bloques.push({ tipo: "ul", items: lista }) }
      lista.push(item[1])
      return
    }
    lista = null
    if (linea.trim() === "") bloques.push({ tipo: "gap" })
    else bloques.push({ tipo: "p", texto: linea })
  })
  return bloques.map((b, i) => {
    if (b.tipo === "ul") return (
      <ul key={i} className="ia-list">
        {b.items.map((it, j) => <li key={j}>{renderInline(it, `${i}-${j}-`)}</li>)}
      </ul>
    )
    if (b.tipo === "gap") return <div key={i} className="ia-gap" />
    return <p key={i} className="ia-p">{renderInline(b.texto, `${i}-`)}</p>
  })
}

function Message({ msg, isStreaming }) {
  return (
    <div className={`ia-msg ${msg.role}`}>
      {msg.role === "assistant" && (
        <div className="ia-avatar">
          <Icon name="sparkle" size={13} />
        </div>
      )}
      <div className="ia-bubble">
        {msg.content
          ? renderMarkdown(msg.content)
          : isStreaming
            ? <span className="ia-typing"><span /><span /><span /></span>
            : null}
      </div>
    </div>
  )
}

export default function TianguisIAPage() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: WELCOME },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Acepta el texto ya hecho (de un botón de ejemplo) o lo toma del cuadro.
  // Pasar por setInput y luego leerlo no sirve: el estado aún no se actualiza.
  const send = async (textoDirecto) => {
    const text = String(textoDirecto ?? input).trim()
    if (!text || loading) return

    setInput("")
    setError(null)

    const history = [...messages, { role: "user", content: text }]
    setMessages(history)
    setLoading(true)

    setMessages((m) => [...m, { role: "assistant", content: "" }])

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // La respuesta llega en streaming, así que no pasa por apiFetch:
          // la sesión se manda a mano.
          Authorization: `Bearer ${sessionStorage.getItem("elt_token") ?? ""}`,
        },
        body: JSON.stringify({
          messages: history
            .filter((m) => m.content)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value).split("\n")
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6)
          if (payload === "[DONE]") continue
          try {
            const { text: chunk, error: apiErr } = JSON.parse(payload)
            if (apiErr) throw new Error(apiErr)
            if (chunk) {
              setMessages((m) => {
                const last = m[m.length - 1]
                return [...m.slice(0, -1), { ...last, content: last.content + chunk }]
              })
            }
          } catch (e) {
            if (e.message !== "Unexpected end of JSON input") throw e
          }
        }
      }
    } catch (err) {
      setMessages((m) => m.slice(0, -1))
      setError(err.message.includes("ANTHROPIC_API_KEY")
        ? "Falta configurar el API key. Agrega tu clave en el archivo .env y reinicia el servidor."
        : err.message.includes("fetch") || err.message.includes("servidor")
          ? "No se pudo conectar al servidor proxy. ¿Está corriendo npm run dev?"
          : err.message)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const reset = () => {
    setMessages([{ role: "assistant", content: WELCOME }])
    setError(null)
    inputRef.current?.focus()
  }

  return (
    <div className="page ia-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Tianguis <span className="gold">IA</span>
          </h1>
          <p className="page-subtitle">
            Asistente inteligente · Pregunta sobre inventario, ventas, pedidos y operación
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-default btn-sm" onClick={reset}>
            <Icon name="refresh" size={13} /> Nueva conversación
          </button>
        </div>
      </div>

      <div className="ia-shell">
        <div className="ia-messages">
          {messages.map((m, i) => (
            <Message
              key={i}
              msg={m}
              isStreaming={loading && i === messages.length - 1}
            />
          ))}

          {messages.length === 1 && !loading && (
            <div className="ia-sugerencias">
              {SUGERENCIAS.map(q => (
                <button key={q} className="ia-sugerencia" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="ia-error">
              <Icon name="alert" size={14} />
              <span>{error}</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="ia-input-bar">
          <textarea
            ref={inputRef}
            className="ia-input"
            placeholder="Escribe tu pregunta… (Enter para enviar, Shift+Enter para nueva línea)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            disabled={loading}
          />
          <button
            className="btn btn-wine"
            onClick={() => send()}
            disabled={!input.trim() || loading}
            title="Enviar"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
