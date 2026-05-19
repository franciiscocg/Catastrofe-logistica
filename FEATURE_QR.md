# Feature QR: solicitudes y donaciones en puesto

## Objetivo

Implementar dos flujos QR diferenciados para que el puesto pueda validar movimientos de productos sin introducirlos a mano.

## Flujo 1: ciudadano solicita productos

1. El ciudadano entra en la app con rol Ciudadano.
2. Usa Buscar producto.
3. Selecciona el producto y el puesto donde quiere retirarlo.
4. Indica las cantidades de los productos disponibles que necesita.
5. La app genera un QR de tipo `SOLICITUD_CIUDADANO`.
6. El ayudante del puesto escanea el QR.
7. El puesto ve el detalle de productos solicitados y confirma la entrega.
8. Al confirmar, el inventario disponible del puesto se reduce con esas cantidades.

## Flujo 2: voluntario entrega una donacion

1. El voluntario registra una donacion indicando que productos lleva y a que puesto va.
2. Cuando la donacion esta en camino, genera un QR de tipo `DONACION_ENTREGA`.
3. El ayudante del puesto escanea el QR.
4. El puesto ve el detalle de la donacion esperada.
5. Al confirmar, el inventario disponible del puesto aumenta con esas cantidades.

## Informacion minima del QR

- `type`: diferencia entre `SOLICITUD_CIUDADANO` y `DONACION_ENTREGA`.
- `version`: version del formato.
- `puestoId`: puesto destino.
- `productos`: lista de productos, cantidad y unidad.
- `generatedAt`: fecha de generacion.

## Reglas principales

- Un QR de solicitud de ciudadano solo puede descontar stock del puesto indicado.
- Un QR de donacion solo puede sumar stock al puesto indicado.
- Si el QR pertenece a otro puesto, debe rechazarse.
- Si no hay stock suficiente para una solicitud, no debe confirmarse.
- La vista de puesto debe mostrar el detalle antes de confirmar.
