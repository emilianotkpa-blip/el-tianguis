// Esqueletos de carga: en vez de un "Cargando…" centrado, la pantalla
// muestra la forma de lo que va a llegar. El salto al contenido real se
// siente más corto aunque tarde lo mismo.

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="skel-table" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }).map((_, r) => (
        <div className="skel-row" key={r} style={{ animationDelay: `${r * 60}ms` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <span
              key={c}
              className="skel-cell"
              /* La primera columna más ancha: imita código + nombre */
              style={{ flex: c === 0 ? 2 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function TilesSkeleton({ count = 8 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div className="skel-tile" key={i} style={{ animationDelay: `${i * 50}ms` }} aria-hidden="true">
          <span className="skel-cell" style={{ width: "38%", height: 9 }} />
          <span className="skel-cell" style={{ width: "76%", height: 13 }} />
          <span className="skel-cell" style={{ width: "58%", height: 9 }} />
          <span className="skel-cell" style={{ width: "44%", height: 15, marginTop: 4 }} />
        </div>
      ))}
    </>
  )
}
