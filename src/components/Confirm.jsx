export default function Confirm({ open, title, message, onConfirm, onCancel, confirmLabel = "Confirmar", danger = false }) {
  if (!open) return null
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)" }} onClick={onCancel} />
      <div className="card" style={{ position: "relative", zIndex: 1, width: 360, margin: 0, padding: 0 }}>
        <div className="card-body">
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{title}</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{message}</p>
        </div>
        <div className="card-body" style={{ paddingTop: 0, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-default" onClick={onCancel}>Cancelar</button>
          <button className={danger ? "btn btn-err" : "btn btn-wine"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
