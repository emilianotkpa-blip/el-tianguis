# Roadmap — El Tianguis

Lo que sigue, en orden de lo pedido. Lo terminado no se anota aquí: vive en el
historial de commits.

---

## 1. Ver paquetes disponibles al vender

En el punto de venta, una forma de consultar las reglas de precio activas y
**cuánto se ahorra** con cada una, sin tener que armar el carrito a ciegas.

La idea: que el vendedor pueda decirle al cliente "si te llevas también la
tapa, te sale en X" en lugar de descubrirlo por accidente.

Por definir: si va como panel lateral, como pestaña junto a los filtros de
tipo, o como aviso que aparece cuando el carrito está a un producto de
completar un combo ("agrega 1 tapa y ahorras $5.50"). Esta última es la más
útil pero también la más invasiva.

Ya existe: el motor (`src/promos.js`) y las reglas activas se cargan en la
página de ventas, así que la información está disponible sin pedir nada nuevo
al servidor.

---

## 2. Reglas de precio: ver el efecto mientras se edita

Al crear o editar una regla, mostrar **el precio normal y en cuánto queda**
con el beneficio elegido, para los tres tipos: precio de paquete, descuento en
pesos y descuento en porcentaje.

Hoy la pantalla describe la regla en palabras ("1 × Vasos + 1 × Domos → precio
de paquete $48.00") pero no dice que lo normal serían $53.50 ni que el ahorro
es de $5.50. Sin eso, quien configura no sabe si el número que puso tiene
sentido hasta que vende.

Necesita: leer los precios del catálogo de los productos elegidos y calcular en
vivo dentro del modal.

---

## 3. Comparador de productos (ambicioso)

Poder comparar el inventario de varios productos a la vez, sin salir de la
pantalla.

**Cómo se arma la selección**
- Al hacer clic en un producto (en Productos) se abre una tarjeta en modo
  **solo lectura** —como la de editar, pero sin campos— con: stock en todas
  las sucursales, desglosado por cada presentación que exista (pieza, paquete,
  caja).
- Esa tarjeta ofrece **"Visualizar en conjunto"**. Al activarla, la tarjeta
  *se desplaza en pantalla* hasta guardarse en un botón con forma de **ojo**,
  como quien echa algo al carrito.
- El ojo aparece **debajo de "Recepción de mercancía"** y solo existe cuando
  hay algo dentro. Muestra el número de productos guardados y **sube con una
  animación** cada vez que entra otro (1, 2, 3…).
- Mientras el modo está activo, cada producto que se abra ofrece **"Agregar a
  visualización"** o **"Sin visualización"**.

**La vista de conjunto**
- Al tocar el ojo se abren todas las tarjetas juntas, **más pequeñas y
  repartidas por la pantalla**, con el fondo difuminado (igual que hoy se ve
  al editar un producto).
- Si hay muchas, la vista baja con scroll.
- Cada tarjeta trae lo esencial para comparar: **barras de cobertura por
  sucursal** y una **barra del stock general** del producto.
- Cada tarjeta tiene su propia **tacha para cerrarla** (por si se agregó por
  error o ya se terminó con ese producto), y la vista tiene botón de cerrar.

**Vaciar la selección**
- Junto al ojo va una tacha. Al tocarla **pide confirmación**; al confirmar se
  quitan todos y hay que volver a armar la selección desde cero.

**Por clasificación**
- Si se filtra por tipo, aparece un botón **"Visualizar todos"** que abre en
  conjunto todos los productos de esa clasificación, con la misma vista.

**Animación**
- Con Framer Motion. Lo importante es que **se vea el movimiento**: la primera
  tarjeta viajando hasta el ojo, y las siguientes igual.

Nota: Framer Motion todavía no es dependencia del proyecto; habría que
instalarlo.

---

## Descartado

- **Canvas tipo n8n para las reglas de precio.** Se evaluó y se descartó: para
  la cantidad de reglas que maneja el negocio, la tabla se opera más rápido que
  arrastrando nodos. El esfuerzo va a mejorar la pantalla actual (punto 2).

---

## Pendiente menor, ya identificado

- **Rol de Dirección**: la pantalla de Reglas de precio está restringida a
  `gerente`, el rol más alto que existe hoy. Si se crea "Dirección" en la tabla
  de usuarios, hay que cambiar el `rolMin` en `src/App.jsx`.
- **`NOCO_TABLE_PROMOS`**: la tabla `ReglasPrecio` ya existe en NocoDB
  (`mwwyc4tgm81emyn`); falta poner la variable en el entorno del servidor
  desplegado para que las reglas se guarden.
