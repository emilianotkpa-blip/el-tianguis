export default function Stepper({ steps, current }) {
  return (
    <div className="stepper">
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
