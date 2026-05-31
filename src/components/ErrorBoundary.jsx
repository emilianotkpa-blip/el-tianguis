import { Component } from "react"
import Icon from "./Icon"

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <div className="page-header"><h1 className="page-title">{this.props.title ?? "Error"}</h1></div>
          <div className="card">
            <div className="card-body" style={{ textAlign: "center", padding: 48 }}>
              <Icon name="alert" size={32} style={{ color: "var(--err)", marginBottom: 12 }} />
              <div style={{ color: "var(--err)", fontWeight: 600, marginBottom: 8 }}>No se pudo cargar esta sección</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>{this.state.error.message}</div>
              <button className="btn btn-default" onClick={() => this.setState({ error: null })}>Reintentar</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
