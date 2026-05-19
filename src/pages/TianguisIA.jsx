import { useState, useRef, useEffect } from "react"
import Icon from "../components/Icon"

const WELCOME = "¡Hola! Soy el asistente de **El Tianguis**. Puedo ayudarte con inventario, ventas, pedidos y cualquier duda sobre la operación del negocio. ¿En qué te puedo ayudar?"

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
          ? msg.content.split("\n").map((line, i) => (
              <span key={i}>{line}{i < msg.content.split("\n").length - 1 && <br />}</span>
            ))
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

  const send = async () => {
    const text = input.trim()
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
        headers: { "Content-Type": "application/json" },
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
            onClick={send}
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
