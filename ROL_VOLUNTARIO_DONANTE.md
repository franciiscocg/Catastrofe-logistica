# Rol: Voluntario/Donante - Proveedor de Productos

## Descripción General

El rol de **Voluntario/Donante** es el usuario principal que aporta productos y suministros a las zonas afectadas por catástrofes. Este rol permite a los ciudadanos solidarios llevar ayuda de manera organizada y eficiente a los puntos de distribución más necesitados.

## Tipos de Catástrofes Soportadas

- Inundaciones
- DANA (Depresión Aislada en Niveles Altos)
- Terremotos
- Incendios forestales
- Otros eventos catastróficos

## Flujo de Trabajo Principal

### 1. Búsqueda y Selección de Catástrofe

**Funcionalidad:**
- El usuario abre la aplicación y busca catástrofes cercanas
- El sistema muestra catástrofes activas ordenadas por proximidad geográfica
- Visualización en mapa de las zonas afectadas
- Información de cada catástrofe:
  - Tipo de evento
  - Fecha de inicio
  - Ubicación
  - Nivel de urgencia
  - Distancia desde ubicación actual

**Interacción del Usuario:**
```
Usuario → Busca catástrofe cercana
Sistema → Muestra lista de catástrofes activas
Usuario → Selecciona una catástrofe (ej: Inundación en Valencia)
```

### 2. Consulta de Productos Necesitados

**Funcionalidad:**
- Visualización de productos más necesitados en tiempo real
- Categorización de productos:
  - Alimentos no perecederos
  - Agua embotellada
  - Ropa y mantas
  - Productos de higiene
  - Medicamentos básicos
  - Herramientas
  - Productos de limpieza
  
**Información Mostrada:**
- Nombre del producto
- Cantidad necesaria
- Nivel de prioridad (Crítico, Alto, Medio, Bajo)
- Puntos de distribución que lo necesitan
- Stock actual en cada punto

**Ejemplo Visual:**
```
┌─────────────────────────────────────┐
│ Productos Más Necesitados           │
├─────────────────────────────────────┤
│ 🔴 Agua (5L) - CRÍTICO              │
│    200 unidades necesarias          │
│    3 puntos de distribución         │
├─────────────────────────────────────┤
│ 🟠 Alimentos enlatados - ALTO       │
│    150 unidades necesarias          │
│    5 puntos de distribución         │
└─────────────────────────────────────┘
```

### 3. Registro y Verificación del Voluntario

**Proceso de Inscripción:**

#### 3.1. Datos Personales
- Nombre completo
- DNI/NIE
- Teléfono de contacto
- Email
- Dirección de origen

#### 3.2. Información del Vehículo
- Tipo de vehículo (coche, furgoneta, camión)
- Matrícula
- Capacidad de carga (kg/m³)
- **Fotografías obligatorias:**
  - Foto frontal del vehículo
  - Foto lateral del vehículo
  - Foto del maletero/zona de carga vacío
  - Foto del maletero/zona de carga con los productos

#### 3.3. Declaración de Productos
- Lista de productos que transporta
- Cantidad de cada producto
- Estado de los productos (nuevo, buen estado)
- Fotografías de los productos empaquetados

**Validación:**
- El sistema verifica los datos
- Genera un perfil de voluntario con ID único
- Crea un QR personalizado para el viaje
- Asigna prioridad según necesidad de productos

### 4. Seguimiento en Tiempo Real

**Funcionalidades de Tracking:**

#### 4.1. Geolocalización
- GPS activo durante todo el trayecto
- Actualización de posición cada 30 segundos
- Visualización en mapa tanto para:
  - El voluntario (su propia ruta)
  - Los puntos de distribución (próximos voluntarios)
  - Coordinadores de la catástrofe

#### 4.2. Estimación de Tiempos
- ETA (Estimated Time of Arrival) para cada punto
- Cálculo dinámico según:
  - Tráfico actual
  - Condiciones de las carreteras
  - Información de calles cortadas
  - Velocidad promedio del voluntario

#### 4.3. Panel de Información en Tránsito
```
┌─────────────────────────────────────┐
│ Tu Viaje                            │
├─────────────────────────────────────┤
│ 📍 Destino Actual:                  │
│    Punto de Distribución #3         │
│                                      │
│ ⏱️ Tiempo Estimado: 15 min          │
│ 📏 Distancia: 8.3 km                │
│                                      │
│ 📦 Productos a Entregar:            │
│    - Agua: 20 unidades              │
│    - Alimentos: 15 unidades         │
│                                      │
│ 🚗 Estado: En camino                │
└─────────────────────────────────────┘
```

### 5. Sistema de Priorización de Puntos de Distribución

**Algoritmo de Asignación:**

El sistema asigna puntos de distribución basándose en:

1. **Nivel de necesidad:**
   - Stock crítico (< 10% capacidad)
   - Stock bajo (10-30% capacidad)
   - Stock medio (30-60% capacidad)

2. **Coincidencia de productos:**
   - Productos que el voluntario lleva
   - Productos que el punto necesita
   - Porcentaje de coincidencia

3. **Distancia y ruta:**
   - Proximidad desde ubicación actual
   - Calles accesibles
   - Ruta óptima entre múltiples puntos

4. **Capacidad del punto:**
   - Espacio disponible para recibir productos
   - Personal disponible para atención

**Ejemplo de Priorización:**
```
Voluntario con: 20 Aguas, 15 Alimentos

Punto A: Necesita 50 Aguas (stock: 2%) - Distancia: 5km
→ Prioridad: ALTA (necesidad crítica + cercanía)

Punto B: Necesita 10 Alimentos (stock: 25%) - Distancia: 3km
→ Prioridad: MEDIA (necesidad moderada + más cercano)

Punto C: Necesita 5 Mantas (stock: 40%) - Distancia: 2km
→ Prioridad: BAJA (no tiene lo que necesitan)

Orden de visita: Punto A → Punto B
```

### 6. Llegada al Punto de Distribución

**Proceso de Verificación:**

#### 6.1. Presentación de QR
- El voluntario muestra su QR único en la app
- QR contiene:
  - ID del voluntario
  - Lista de productos declarados
  - Timestamp del viaje
  - Punto de distribución asignado

#### 6.2. Escaneo por Personal del Punto
- El personal del punto escanea el QR con la app
- El sistema verifica:
  - Identidad del voluntario
  - Autorización para este punto
  - Productos esperados

#### 6.3. Confirmación de Entrega
- El sistema muestra al personal:
  - Productos declarados por el voluntario
  - Cantidades esperadas
  
- El personal marca:
  - ✅ Productos recibidos (con cantidad real)
  - ❌ Productos rechazados (razón)
  - 📝 Observaciones

**Razones para Rechazo:**
- Ya no se necesita (stock suficiente)
- Producto en mal estado
- Producto no adecuado
- Capacidad del punto completa

#### 6.4. Actualización de Inventario
- El sistema actualiza automáticamente:
  - Stock del punto de distribución
  - Estado del voluntario (productos entregados)
  - Estadísticas de la catástrofe
  - Necesidades recalculadas

### 7. Navegación al Siguiente Punto

**Funcionalidades:**

#### 7.1. Asignación del Siguiente Destino
- El sistema calcula automáticamente el siguiente punto más necesitado
- Considera:
  - Productos restantes del voluntario
  - Necesidades actualizadas de todos los puntos
  - Distancia y accesibilidad
  - Tiempo estimado

#### 7.2. Integración con Mapas
- Ruta optimizada con:
  - Google Maps / OpenStreetMap
  - Navegación paso a paso
  - Alertas de tráfico
  - **Información de calles cortadas** (reportada por ciudadanos)

#### 7.3. Visualización de Ruta
```
┌─────────────────────────────────────┐
│ Próximo Destino                     │
├─────────────────────────────────────┤
│ 📍 Punto de Distribución #7         │
│    Calle Mayor, 45                  │
│                                      │
│ 🗺️ Ver Ruta en Mapa                │
│                                      │
│ ⚠️ Alertas de Ruta:                 │
│    • Calle Libertad: CORTADA        │
│    • Av. Principal: Tráfico lento   │
│                                      │
│ 📦 Productos pendientes:            │
│    - Alimentos: 8 unidades          │
└─────────────────────────────────────┘
```

### 8. Finalización del Viaje

**Proceso de Cierre:**

1. **Entrega Completa:**
   - Todos los productos entregados
   - Sistema registra:
     - Puntos visitados
     - Productos entregados
     - Tiempo total del viaje
     - Distancia recorrida

2. **Resumen del Viaje:**
```
┌─────────────────────────────────────┐
│ ¡Viaje Completado!                  │
├─────────────────────────────────────┤
│ 🎉 Gracias por tu ayuda             │
│                                      │
│ 📊 Resumen:                         │
│    • Puntos visitados: 3            │
│    • Productos entregados: 43       │
│    • Tiempo total: 2h 15min         │
│    • Distancia: 25.8 km             │
│                                      │
│ 🏆 Impacto:                         │
│    • Personas ayudadas: ~120        │
│    • Contribución: ALTA             │
│                                      │
│ 📝 Valoración opcional              │
│ 🔄 Realizar otro viaje              │
└─────────────────────────────────────┘
```

3. **Feedback:**
   - Valoración de la experiencia
   - Comentarios sobre el proceso
   - Sugerencias de mejora

## Integración con Otros Roles

### Interacción con Rol "Ciudadano Informador"

**Información de Calles Cortadas:**
- Los ciudadanos pueden reportar:
  - Calles bloqueadas
  - Calles inundadas
  - Calles inaccesibles
  - Peligros en la ruta

**Uso por Voluntarios:**
- El sistema de navegación integra esta información
- Recalcula rutas evitando zonas problemáticas
- Muestra alertas en tiempo real
- Permite al voluntario reportar también

**Ejemplo de Reporte:**
```
⚠️ ALERTA DE RUTA
Calle Libertad está CORTADA
Reportado por: 12 ciudadanos
Última actualización: Hace 5 min

Ruta alternativa disponible (+3 min)
```

### Interacción con Rol "Personal de Punto de Distribución"

- Escaneo de QR del voluntario
- Confirmación de productos
- Aceptación/rechazo de entregas
- Actualización de inventario
- Coordinación de llegadas

## Características de Seguridad

### Verificación de Identidad
- Registro con documento oficial
- Fotos del vehículo verificables
- QR único por viaje (no reutilizable)
- Tracking GPS para validar recorrido

### Protección de Datos
- Datos personales encriptados
- Ubicación compartida solo durante viaje activo
- Fotos almacenadas de forma segura
- RGPD/LOPD compliant

### Seguridad del Voluntario
- Rutas verificadas y seguras
- Alertas de zonas peligrosas
- Botón de emergencia
- Contacto con coordinadores

## Beneficios del Sistema

### Para los Voluntarios:
- ✅ Organización clara del proceso
- ✅ Saben exactamente dónde se necesitan
- ✅ Navegación optimizada
- ✅ Reconocimiento de su ayuda
- ✅ Certeza de que su ayuda llega donde hace falta

### Para los Puntos de Distribución:
- ✅ Conocen qué voluntarios vienen y cuándo
- ✅ Pueden prepararse para las llegadas
- ✅ Control de inventario en tiempo real
- ✅ Reducción de productos no necesitados

### Para los Afectados:
- ✅ Reciben productos más rápido
- ✅ Mejor distribución de recursos
- ✅ Productos llegan donde más se necesitan
- ✅ Transparencia en el proceso

## Métricas y Análisis

El sistema registra y analiza:
- Número de voluntarios activos
- Productos transportados por categoría
- Tiempo promedio de entrega
- Eficiencia de rutas
- Puntos de distribución más visitados
- Satisfacción de voluntarios
- Impacto por voluntario

## Futuras Mejoras

### Fase 2:
- Gamificación (puntos, badges, rankings)
- Sistema de reputación de voluntarios
- Coordinación entre voluntarios (caravanas)
- Chat entre voluntarios y coordinadores

### Fase 3:
- Predicción de necesidades con IA
- Optimización multi-voluntario
- Integración con empresas de logística
- Sistema de recompensas/incentivos

## Casos de Uso Reales

### Caso 1: DANA en Valencia
```
María tiene agua y alimentos en su furgoneta.
1. Abre la app y ve la DANA de Valencia
2. Se registra con fotos de su furgoneta y productos
3. El sistema le asigna 3 puntos prioritarios
4. Llega al Punto A, escanean su QR, entrega 15 aguas
5. Navega al Punto B evitando calle inundada
6. Entrega resto de productos
7. Recibe agradecimiento y resumen de su impacto
```

### Caso 2: Inundación, Producto Rechazado
```
Pedro lleva mantas pero llega a un punto que ya las tiene.
1. El personal escanea su QR
2. Marcan mantas como "rechazadas - stock suficiente"
3. El sistema busca otro punto que SÍ necesite mantas
4. Pedro recibe nueva ruta al Punto C
5. Allí sí las aceptan y completa su entrega
```

## Requisitos Técnicos

### Para el Voluntario:
- Smartphone con GPS
- Cámara para fotos
- Conexión a internet (datos móviles)
- Espacio mínimo: 50MB
- Android 8+ / iOS 12+

### Permisos Necesarios:
- 📍 Ubicación (GPS)
- 📷 Cámara
- 📂 Almacenamiento (para fotos)
- 🌐 Internet

## Preguntas Frecuentes

**¿Puedo ir sin registrarme previamente?**
No. El registro asegura orden, seguridad y eficiencia en las entregas.

**¿Qué pasa si me quedo sin batería?**
Se recomienda llevar cargador de coche. El sistema guarda el último estado.

**¿Puedo cambiar la ruta sugerida?**
Sí, pero se recomienda seguir las sugerencias del sistema para máxima eficiencia.

**¿Qué hago si un producto es rechazado?**
El sistema automáticamente buscará otro punto que lo necesite.

**¿Hay compensación económica?**
No, es voluntariado. Solo se busca ayudar eficientemente.

---

## Documento de Trabajo

Este es un **documento vivo** que se irá mejorando y refinando conforme se desarrolle la aplicación y se reciba feedback de usuarios y coordinadores.

**Versión:** 1.0  
**Fecha:** Enero 2026  
**Próxima Revisión:** Se actualizará según feedback y desarrollo
