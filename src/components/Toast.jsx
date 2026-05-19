import Icon from "./Icon"

export default function Toast({ toasts, onDismiss }) {
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={"toast " + (t.kind || "")} onClick={() => onDismiss(t.id)}>
          <Icon name={t.kind === "ok" ? "check" : t.kind === "err" ? "alert" : "info"} size={14} />
          {t.msg}
        </div>
      ))}
    </div>
  )
}
