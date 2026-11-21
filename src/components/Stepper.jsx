// `compacto` es para cuando la barra va en una columna angosta (la de la
// nota): mismos pasos, círculos y letra más chicos, para que los tres quepan
// sin partirse.
export default function Stepper({ steps, current, compacto = false }) {
  return (
    <div className={"stepper" + (compacto ? " compacto" : "")}>
      {steps.map((step, i) => {
        const done    = i < current
        const active  = i === current
        const pending = i > current
        return (
          <div key={i} className={`stepper-item${done ? " done" : active ? " active" : " pending"}`}>
            <div className="stepper-circle">
              {done ? "✓" : i + 1}
            </div>
            <div className="stepper-label">{step}</div>
            {i < steps.length - 1 && <div className="stepper-line" />}
          </div>
        )
      })}
    </div>
  )
}
