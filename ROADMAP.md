# Roadmap — El Tianguis

Lo que sigue, en orden de lo pedido. Lo terminado no se anota aquí: vive en el
historial de commits.

> Los tres puntos que había (paquetes al vender, efecto en vivo al editar una
> regla y el comparador de productos) ya están hechos. Esta lista quedó solo
> con lo descartado y los pendientes de configuración.

---

## Descartado

- **Canvas tipo n8n para las reglas de precio.** Se evaluó y se descartó: para
  la cantidad de reglas que maneja el negocio, la tabla se opera más rápido que
  arrastrando nodos. El esfuerzo se fue a mejorar la pantalla actual, que ya
  muestra el efecto de cada regla mientras se edita.

---

## Pendiente menor, ya identificado

- ~~**Rol de Dirección**~~ — resuelto. Los roles reales en la tabla Equipo son
  "Directivo" y "Empleado"; el menú exigía la cadena exacta `gerente`, así que
  Reglas de precio no la veía nadie. Ahora `src/App.jsx` compara por nivel
  (`NIVEL_ROL`) y la ruta también está protegida, no solo el menú.
- **`NOCO_TABLE_PROMOS`**: la tabla `ReglasPrecio` ya existe en NocoDB
  (`mwwyc4tgm81emyn`); falta poner la variable en el entorno del servidor
  desplegado para que las reglas se guarden.
