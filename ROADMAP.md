# Roadmap — El Tianguis

Lo que sigue, en orden de lo pedido. Lo terminado no se anota aquí: vive en el
historial de commits.

> Los tres puntos que había (paquetes al vender, efecto en vivo al editar una
> regla y el comparador de productos) ya están hechos. Esta lista quedó solo
> con lo descartado y los pendientes de configuración.

---

## Vender sin stock, con permiso

Pedido de la junta de septiembre. Hoy un producto agotado queda inerte: no se
puede ni tocar para ver qué presentaciones y precios tiene. Se quiere lo
contrario, y en este orden:

1. ~~**Que se pueda abrir aunque no haya.**~~ Hecho. La tarjeta agotada se
   toca, se marca con borde rojo en vez de apagarse, y abre el selector con
   todas sus presentaciones y precios. Cada una dice "Sin stock disponible" y
   no se puede elegir: ver no es lo mismo que poder vender. El escáner
   tampoco rebota ya: deja consultar.

2. **Agregarlo igual, con autorización.** Un empleado puede meterlo a la nota,
   pero el sistema pide la contraseña de un superior. No una contraseña
   genérica: la de quien esté a cargo **en ese momento**.

3. **Saber quién está a cargo.** Para lo anterior hace falta una pantalla de
   turnos: horarios, encargado de cada turno y quién está activo. El sistema
   propone a esa persona para autorizar.

4. **Jerarquía de roles de verdad.** Hoy `NIVEL_ROL` en `src/App.jsx` es un
   mapa fijo de cuatro niveles. Para esto hace falta que los roles y quién
   puede autorizar a quién vivan en datos, no en el código.

5. **Login a Supabase Auth.** El login lee la tabla Equipo de NocoDB y compara
   la contraseña en texto plano (`server/index.js`, `/api/login`). Cualquiera
   con acceso de lectura a esa tabla ve las contraseñas del equipo. Para pedir
   la contraseña de un superior en caja, eso no se sostiene: hay que mover la
   autenticación a Supabase Auth y dejar en NocoDB solo el perfil.

El orden importa: 1 y 2 sin 3 y 4 sería pedir una contraseña sin saber de
quién, y sin 5 esa contraseña viaja y se compara en claro.

---

## ~~Candado final de stock~~ — hecho

`/api/caja/:id/cobrar` revisa el stock antes de descontar nada. Si no alcanza
devuelve 409 con qué producto falta y cuánto, y caja lo muestra con las dos
salidas reales: revisar la nota, o cobrar dejando constancia.

Se hizo con esa válvula a propósito. Rechazar sin excepción habría bloqueado
la venta con el cliente enfrente cada vez que el inventario del sistema no
coincide con el anaquel, que pasa seguido, y eso es peor que el negativo que
se quería evitar. Cobrar con faltante queda escrito en las Observaciones de la
nota: quién lo autorizó, qué producto y cuánto faltaba.

**Lo que falta aquí** es quién puede accionar esa válvula: hoy la acciona
quien esté cobrando. Se endurece con los puntos 2, 3 y 4 de arriba, que es
donde esto se convierte en una autorización de verdad.

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
