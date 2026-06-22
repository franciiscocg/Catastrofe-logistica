# Implementación Tecnológica - Catástrofe Logística

## Índice

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Decisiones de Diseño del MVP](#decisiones-de-diseño-del-mvp)
3. [Arquitectura del Sistema](#arquitectura-del-sistema)
4. [Stack Tecnológico del MVP](#stack-tecnológico-del-mvp)
5. [Diseño Offline-First](#diseño-offline-first)
6. [Limitaciones del PWA y Mitigaciones](#limitaciones-del-pwa-y-mitigaciones)
7. [Funcionalidades Específicas para Catástrofes](#funcionalidades-específicas-para-catástrofes)
8. [Estrategia de Testing](#estrategia-de-testing)
9. [Infraestructura y Despliegue](#infraestructura-y-despliegue)
10. [Seguridad y Protección de Datos](#seguridad-y-protección-de-datos)
11. [Roadmap de Implementación](#roadmap-de-implementación)
12. [Arquitectura Objetivo (Post-MVP)](#arquitectura-objetivo-post-mvp)
13. [Consideraciones de Costos](#consideraciones-de-costos)

---

## Resumen Ejecutivo

La aplicación **Catástrofe Logística** es una solución tecnológica diseñada para coordinar la ayuda humanitaria durante situaciones de emergencia. El sistema debe funcionar de manera óptima incluso en condiciones adversas típicas de catástrofes:

- ❌ Sin conexión a internet o conexión intermitente
- ❌ Infraestructura de telecomunicaciones dañada
- ❌ Cortes de energía eléctrica
- ❌ Alto volumen de tráfico de red
- ❌ Dispositivos con baja batería

### Principios de Diseño

1. **Offline-First**: La aplicación debe funcionar primero sin conexión
2. **Resiliente**: Capaz de operar con infraestructura degradada
3. **Ligera**: Consumo mínimo de recursos (batería, datos, almacenamiento)
4. **Sincronización Inteligente**: Datos críticos primero
5. **Progresiva**: Funcionalidad básica siempre disponible

---

## Decisiones de Diseño del MVP

Esta sección documenta las decisiones clave sobre qué entra en el MVP y por qué, diferenciando explícitamente entre lo que es adecuado para el MVP del TFM y lo que pertenece a fases posteriores.

### Una sola PWA con cambio de rol, no cuatro aplicaciones separadas

**Decisión:** Se construye una única PWA que adapta su navegación y funcionalidades según el rol del usuario autenticado (Ciudadano, Voluntario/Donante, Puesto de Emergencia, Coordinador).

**Por qué para MVP:**
- Desarrollar y mantener cuatro aplicaciones separadas cuadruplica el esfuerzo de desarrollo, diseño y despliegue.
- La autenticación con RBAC (control de acceso por rol) ya gestiona qué ve y hace cada usuario.
- Facilita que un mismo usuario pueda actuar con distintos roles según el contexto (un coordinador también puede ser ciudadano).
- Es la decisión correcta para demostrar el sistema completo en el TFM con recursos limitados.

**Cómo se implementa:** Al iniciar sesión, el sistema detecta el rol del usuario y carga el módulo de navegación correspondiente. Los componentes compartidos (mapa, QR, inventario) se reutilizan entre roles.

### Monolito primero, microservicios después

**Decisión:** El backend del MVP es una única aplicación Node.js (monolito modular), no microservicios.

**Por qué para MVP:**
- Los microservicios introducen complejidad operacional enorme: service discovery, comunicación entre servicios, trazabilidad distribuida, despliegues coordinados. Todo esto requiere tiempo de ingeniería que no está disponible en un TFM.
- Un monolito bien estructurado en módulos (auth, geo, inventario, notificaciones) permite separarlo en microservicios en el futuro sin reescribir la lógica de negocio.
- El propio roadmap contempla la migración a microservicios en Fase 2, lo que confirma que no deben estar en el MVP.
- Para el volumen de usuarios de un piloto o demostración, un único proceso Node.js es más que suficiente.

**Cuándo migrar a microservicios:** Cuando el sistema esté en producción real, con equipos independientes por dominio y cuellos de botella identificados por métricas.

### Sin API Gateway externo en MVP

**Decisión:** No se usa Kong ni AWS API Gateway en el MVP. Las responsabilidades del gateway (autenticación JWT, rate limiting, compresión) las asume middleware del propio servidor Node.js.

**Por qué para MVP:**
- Kong requiere su propio proceso, base de datos (PostgreSQL o Cassandra), configuración declarativa y conocimiento específico. Es un producto completo, no una librería.
- Las mismas funcionalidades se consiguen con librerías estándar de Node.js: `express-rate-limit`, `helmet`, `compression`, `jsonwebtoken`. Son una línea de código cada una.
- Añadir un API Gateway externo en MVP añade un punto de fallo sin aportar valor diferencial a escala pequeña.

**Cuándo añadir API Gateway:** En Fase 2, cuando haya múltiples servicios que enrutar, o cuando el volumen de tráfico justifique capacidades avanzadas de balanceo y caching a nivel de gateway.

### Sin broker de mensajes externo en MVP

**Decisión:** No se usa RabbitMQ en el MVP. Si se necesitan colas de trabajo (procesamiento de imágenes, notificaciones asíncronas), se usa BullMQ, que funciona sobre Redis ya incluido en el stack.

**Por qué para MVP:**
- RabbitMQ es un broker independiente con su propio protocolo (AMQP), panel de administración y configuración de exchanges/queues. Añadirlo al stack del MVP añade complejidad de despliegue y operación sin justificación a esta escala.
- BullMQ es una librería Node.js que usa Redis (que ya está en el stack para caché y sesiones) como backend de colas. No requiere infraestructura adicional.
- Para el MVP, muchas operaciones que en producción serían asíncronas pueden hacerse síncronas o diferirse de forma más simple.

**Cuándo añadir RabbitMQ:** En Fase 2/3, si la arquitectura de microservicios requiere comunicación entre servicios desacoplada mediante eventos.

### Sin base de datos de logs separada en MVP

**Decisión:** No se usa MongoDB para logs en el MVP. Los logs de aplicación van a la salida estándar (gestionados por Docker) y los logs de auditoría críticos (accesos, transacciones) van a PostgreSQL.

**Por qué para MVP:**
- MongoDB como base de datos exclusiva para logs implica mantener una tercera base de datos sin aportar funcionalidad de negocio.
- PostgreSQL con una tabla de auditoría es perfectamente capaz de gestionar los logs necesarios para el MVP, con la ventaja de poder relacionarlos con los datos del negocio mediante JOINs.
- Para agregación y análisis de logs a escala, herramientas como Loki o Elastic tienen sentido. Para MVP, no.

**Cuándo añadir un sistema de logs dedicado:** En Fase 2, cuando el volumen de eventos y la necesidad de análisis en tiempo real lo justifiquen.

### Sin ElasticSearch en MVP

**Decisión:** No se usa ElasticSearch en el MVP. La búsqueda de texto completo se implementa con `tsvector` y `tsquery` de PostgreSQL.

**Por qué para MVP:**
- ElasticSearch es un servicio independiente con su propio proceso, configuración de índices, y modelo de datos diferente al relacional. Sincronizar datos entre PostgreSQL y ElasticSearch añade complejidad (doble escritura, consistencia eventual).
- PostgreSQL tiene búsqueda de texto completo nativa con soporte para español, indexación GIN, y rendimiento más que suficiente para los volúmenes del MVP.
- Las búsquedas del sistema (puestos de emergencia, productos, voluntarios) son sobre dominios pequeños y bien definidos, no sobre terabytes de texto libre.

**Cuándo añadir ElasticSearch:** Si en producción aparecen búsquedas complejas (facetas, relevancia personalizada, autocompletado avanzado) que PostgreSQL FTS no cubra satisfactoriamente.

### Docker Compose en lugar de Kubernetes para el MVP

**Decisión:** El despliegue del MVP usa Docker Compose, no Kubernetes.

**Por qué para MVP:**
- Kubernetes es una plataforma de orquestación diseñada para gestionar decenas de servicios a escala, con autoescalado, self-healing, rolling updates, etc. Configurarlo correctamente (manifests YAML, Ingress, ConfigMaps, Secrets, PersistentVolumes, RBAC) requiere conocimiento especializado y días de trabajo.
- Docker Compose permite levantar todo el stack (Node.js + PostgreSQL + Redis) con un único archivo de configuración y un solo comando. Es suficiente para desarrollo, demos y pilotos.
- Para un TFM, la complejidad de Kubernetes no añade valor académico al trabajo en sí; es infraestructura que distrae del problema central.

**Cuándo migrar a Kubernetes:** En Fase 2, si el sistema pasa a producción real con múltiples servicios y necesidad de alta disponibilidad horizontal.

---

## Arquitectura del Sistema

### Arquitectura MVP

La arquitectura del MVP es intencionalmente simple: tres capas con responsabilidades claras.

```
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE CLIENTE                       │
├─────────────────────────────────────────────────────────┤
│                PWA (Progressive Web App)                 │
│  React 18 + TypeScript + Vite                           │
│  Service Workers (Workbox)  │  IndexedDB (Dexie.js)     │
│  Leaflet + OpenStreetMap    │  QR (html5-qrcode)        │
│  Una sola app, navegación por rol (RBAC)                │
└─────────────────────────────────────────────────────────┘
                            ↕
                  HTTPS + WebSocket
                            ↕
┌─────────────────────────────────────────────────────────┐
│               CAPA DE BACKEND (Monolito)                 │
├─────────────────────────────────────────────────────────┤
│  Node.js + Express/Fastify + TypeScript                 │
│  Módulos: Auth | Geo | Inventario | Notificaciones      │
│  Prisma ORM  │  JWT + RBAC  │  BullMQ (colas opcionales)│
│  Rate limiting + Helmet + Compresión (middleware local) │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE DATOS                         │
├─────────────────────────────────────────────────────────┤
│  PostgreSQL 15+ con PostGIS  │  Redis                   │
│  (Datos + Auditoría + FTS)   │  (Sesiones + Caché       │
│                              │   + Colas BullMQ)        │
│  MinIO / S3                                             │
│  (Imágenes: vehículos, productos, puestos)              │
└─────────────────────────────────────────────────────────┘
```

### Flujo de Datos Offline-First

```
1. Usuario interactúa con la app
   ↓
2. Datos se guardan PRIMERO en almacenamiento local (IndexedDB)
   ↓
3. App intenta sincronizar con servidor
   ↓
4. ¿Hay conexión?
   │
   ├─ SÍ → Sincroniza y marca como enviado
   │
   └─ NO → Queda en cola de pendientes persistente
              ↓
              Se reintenta al detectar reconexión (evento 'online')
              ↓
              Cuando hay conexión: sincroniza con resolución de conflictos
```

---

## Stack Tecnológico del MVP

### Frontend (PWA)

**Núcleo:**
- React 18+ con TypeScript
- Vite (build tool rápido, HMR eficiente)
- TailwindCSS (estilos utilitarios, bundle pequeño)
- React Router v6 (navegación con rutas protegidas por rol)
- Zustand (estado global ligero, sin boilerplate de Redux)
- React Query / TanStack Query (caché de servidor, sincronización de estado remoto)

**PWA y Offline:**
- Workbox (abstracción sobre Service Workers; estrategias Network-First y Cache-First preconstruidas)
- Dexie.js (wrapper ergonómico sobre IndexedDB; soporta transacciones, índices, migraciones de schema)
- LocalForage (fallback de almacenamiento para entornos con IndexedDB limitado)

**Mapas y Geolocalización:**
- Leaflet (librería de mapas ligera, ~40KB)
- OpenStreetMap (tiles gratuitos, descargables para uso offline)
- Geolocation API nativa del navegador

**QR:**
- html5-qrcode (scanner usando cámara)
- qrcode.react (generación de QR)

**Comunicación:**
- Axios (cliente HTTP con interceptores para retry y manejo de errores)
- Socket.io-client (WebSockets para actualizaciones en tiempo real cuando hay conexión)

### Backend (Monolito Node.js)

**Framework y lenguaje:**
- Node.js 20 LTS + TypeScript
- Express.js o Fastify (Fastify preferido por su rendimiento y tipado nativo)
- Prisma ORM (migraciones, type-safety, soporte PostGIS vía extensión)

**Validación y seguridad:**
- Zod (validación de schemas con inferencia de tipos TypeScript)
- jsonwebtoken (emisión y verificación de JWT)
- bcrypt o argon2 (hashing de contraseñas)
- helmet (cabeceras de seguridad HTTP)
- express-rate-limit (rate limiting por IP, sin infraestructura externa)
- compression (compresión gzip/brotli de respuestas)

**Colas (opcional en MVP):**
- BullMQ (colas de trabajo sobre Redis; para procesamiento asíncrono de imágenes y notificaciones)

### Base de Datos

**Principal:**
- PostgreSQL 15+ con extensión PostGIS
  * Datos relacionales de negocio
  * Capacidades geoespaciales (búsquedas por proximidad con PostGIS)
  * JSONB para datos flexibles
  * `tsvector` / `tsquery` para búsqueda de texto completo en español
  * Tabla de auditoría para logs críticos (accesos, transacciones de inventario)

**Caché y sesiones:**
- Redis
  * Sesiones y refresh tokens
  * Caché de consultas frecuentes (puestos activos, inventarios)
  * Rate limiting distribuido
  * Backend de colas BullMQ (si se usa)

**Almacenamiento de objetos:**
- MinIO (self-hosted) o AWS S3
  * Fotos de vehículos de voluntarios
  * Fotos de productos
  * Imágenes de puestos de emergencia

---

## Diseño Offline-First

### 1. Service Workers con Workbox

Se implementarán Service Workers gestionados con Workbox para caché y peticiones de red:

- **Pre-caching**: Descarga inicial del shell de la aplicación (HTML, CSS, JS) para carga instantánea en visitas posteriores.
- **Estrategia Network-First**: Para datos dinámicos críticos (inventarios, alertas). Intenta obtener datos frescos del servidor; si falla, sirve la última versión cacheada.
- **Estrategia Cache-First**: Para recursos estáticos e imágenes de interfaz.
- **Background Sync**: Para enviar acciones realizadas offline cuando se recupere la conexión. *Nota: tiene limitaciones en iOS/Safari (ver sección de limitaciones).*

### 2. Almacenamiento Local con IndexedDB (Dexie.js)

IndexedDB actúa como base de datos completa en el cliente. No se usa `localStorage` por su límite de ~5MB y su API síncrona.

**Esquema de datos local:**
- **Catástrofes y Alertas**: Solo lectura, sincronizadas al arranque y periódicamente.
- **Inventarios**: Copia local de productos disponibles y necesarios en puestos cercanos.
- **Cola de Sincronización**: Almacena todas las acciones (creación de donaciones, escaneos QR, reportes) realizadas offline, pendientes de envío.
- **Tiles de Mapa**: Teselas descargadas de la zona afectada para visualización sin conexión.

**Gestión de cuota de almacenamiento:**

Los navegadores imponen límites al almacenamiento de IndexedDB (típicamente entre 50MB y el 60% del espacio libre en disco, dependiendo del navegador y dispositivo). Para los tiles de mapa, que pueden ocupar varios cientos de MB, se debe:

1. Consultar la cuota disponible antes de descargar: `navigator.storage.estimate()`
2. Mostrar al usuario cuánto espacio ocupará la descarga y cuánto hay disponible.
3. Implementar una estrategia de evicción (eliminar tiles de zonas antiguas) si el almacenamiento se acerca al límite.
4. Manejar el error `QuotaExceededError` de IndexedDB con degradación controlada (informar al usuario, no crashear).

### 3. Sincronización Inteligente

1. **Priorización**: Alertas críticas y cambios de inventario se sincronizan antes que fotos de alta resolución.
2. **Cola Persistente**: Si la app se cierra antes de sincronizar, los datos permanecen en IndexedDB hasta la próxima apertura.
3. **Resolución de Conflictos**: Reglas claras por tipo de dato:
   - Inventario: fusión por campo con timestamp (el valor más reciente por campo gana)
   - Alertas: append-only (no hay conflicto posible)
   - Rutas de voluntarios: merge por segmento temporal

### 4. Detección de Conectividad

El sistema distingue entre estados de conectividad, no solo online/offline:

- **Modo Normal**: API REST + WebSocket activos.
- **Modo Ahorro de Datos**: Conexión lenta detectada (via Network Information API o latencia medida). Se desactiva la descarga automática de imágenes y actualizaciones en tiempo real.
- **Modo Offline**: Sin conexión. Solo operación local con cola de sincronización pendiente.
- **Indicador Visual**: Banner persistente informando al usuario si trabaja con datos en tiempo real o con caché local.

---

## Limitaciones del PWA y Mitigaciones

Esta sección documenta las limitaciones técnicas del enfoque PWA, especialmente en iOS/Safari, que deben conocerse y gestionarse.

### Limitaciones en iOS / Safari

**1. Background Sync no disponible en Safari**

La API de Background Sync (para enviar datos en segundo plano cuando se recupera la conexión) no está soportada en Safari/iOS a la fecha del desarrollo de este MVP.

*Mitigación:* Se implementa un mecanismo propio: cuando la app detecta el evento `online` (al recuperar conexión mientras la app está abierta), lanza automáticamente la sincronización de la cola pendiente. Para el caso de app cerrada, la sincronización ocurre al reabrir la app.

**2. Web Push Notifications limitadas en iOS**

Las notificaciones push web solo están disponibles en iOS 16.4+ y únicamente si el usuario ha instalado la PWA en la pantalla de inicio (no funciona desde Safari sin instalar).

*Mitigación:* El flujo de notificaciones se diseña para ser funcional sin push: el estado relevante se muestra al abrir la app (pull, no push). Las notificaciones push son una mejora progresiva, no una dependencia.

**3. Instalación de PWA en iOS requiere acción manual**

En iOS, el usuario debe usar manualmente "Añadir a pantalla de inicio" desde el menú compartir de Safari. No existe el banner automático de instalación que sí aparece en Android/Chrome.

*Mitigación:* La app detecta si está ejecutándose en Safari móvil fuera de modo standalone y muestra un banner de instrucciones de instalación específico para iOS.

**4. Cuota de almacenamiento más restrictiva en Safari**

Safari puede limitar el almacenamiento de origen a 1GB en algunos contextos, y puede purgar el almacenamiento si el dispositivo tiene poco espacio libre.

*Mitigación:* Ver gestión de cuota de almacenamiento en la sección Offline-First.

**5. Service Workers en Safari tienen restricciones de ciclo de vida**

Safari puede terminar Service Workers más agresivamente que Chrome, lo que puede interrumpir sincronizaciones largas.

*Mitigación:* Las operaciones de sincronización se dividen en transacciones pequeñas y atómicas, de forma que una interrupción no deje datos en estado inconsistente.

### Cuándo considerar app nativa

Si en el piloto se detecta que las limitaciones de iOS afectan significativamente a usuarios en situación de emergencia, se evaluará una versión React Native que comparte la mayor parte de la lógica de negocio con la PWA.

---

## Funcionalidades Específicas para Catástrofes

### 1. Geolocalización sin Conexión

- **Rastreo Continuo**: API de Geolocalización del dispositivo guardando ruta localmente en IndexedDB.
- **Cálculo de Distancias Offline**: Fórmula de Haversine implementada en cliente para calcular distancias a puestos sin consultar al servidor.
- **Historial de Ruta**: Trayecto guardado para validación posterior.

### 2. Sistema QR Offline

- **Generación Local**: QR generados con `qrcode.react` directamente en el dispositivo, sin llamar a ninguna API.
- **Firma Criptográfica**: Cada QR incluye una firma digital generada localmente para evitar falsificaciones, verificable por otros dispositivos con la clave pública compartida.
- **Validación Asíncrona**: El escaneo se valida contra reglas locales y se marca para sincronización posterior con el servidor.

### 3. Mapas Offline

- **Descarga de Zonas**: El usuario selecciona el área afectada y descarga los tiles de OpenStreetMap para esa región.
- **Almacenamiento en IndexedDB**: Tiles guardados localmente con gestión de cuota (ver sección Offline-First).
- **Renderizado con Leaflet**: Navegación fluida sin datos usando tiles locales.

### 4. Fallbacks de Comunicación

Jerarquía de comunicación según disponibilidad de infraestructura:

1. **API REST + WebSocket** — Modo normal
2. **Solo API REST (sin WebSocket)** — Conexión degradada, sin tiempo real
3. **Modo Offline completo** — Solo local, cola de sincronización pendiente
4. **SMS Gateway** *(Fase 3)* — Envío de coordenadas y estados críticos por SMS codificados
5. **Mesh / Bluetooth P2P** *(Fase 3)* — Comunicación dispositivo a dispositivo

### 5. Compresión de Imágenes

- **Pre-procesamiento en Cliente**: Fotos redimensionadas y comprimidas en el navegador usando Canvas API antes de intentar subirlas.
- **Subida Diferida**: Imágenes en alta resolución solo se suben con WiFi estable; se envían miniaturas primero si es urgente.

---

## Estrategia de Testing

El testing es parte integral del MVP, no una fase separada. Sin una estrategia de testing documentada y ejecutada, no es posible validar que el comportamiento offline funciona correctamente ni demostrar calidad en el TFM.

### Niveles de Testing

**Tests Unitarios — Vitest**

Cobertura de la lógica de negocio pura:
- Fórmula de Haversine (cálculo de distancias)
- Algoritmo de priorización de puestos de distribución
- Resolución de conflictos de sincronización
- Generación y validación de QR
- Transformaciones de datos (serialización/deserialización para IndexedDB)

**Tests de Integración — Vitest + Testing Library**

Cobertura de componentes React con sus interacciones:
- Flujos de formulario (registro de voluntario, declaración de productos)
- Comportamiento de componentes según rol (RBAC)
- Integración con Dexie.js (lectura/escritura en IndexedDB)

**Tests End-to-End — Playwright**

Cobertura de flujos completos críticos:
- Flujo offline: realizar una donación sin conexión → reconectar → verificar sincronización
- Flujo de escaneo QR en un puesto de emergencia
- Flujo ciudadano: buscar puestos cercanos con GPS desactivado
- Flujo coordinador: crear catástrofe y asignar puestos

**Testing del Comportamiento Offline**

El testing offline requiere técnicas específicas:
- Playwright puede interceptar y bloquear peticiones de red para simular modo offline.
- Los Service Workers se pueden testear usando `workbox-window` con fakes de red.
- Se crean fixtures de IndexedDB con datos precargados para tests reproducibles.

### Cobertura Objetivo para MVP

| Capa | Objetivo |
|---|---|
| Lógica de negocio pura | >80% |
| Componentes críticos | >70% |
| Flujos E2E principales | 5 flujos cubiertos |
| Comportamiento offline | Al menos sincronización y QR |

---

## Infraestructura y Despliegue

### MVP: Docker Compose

El MVP se despliega con Docker Compose. Un único archivo `docker-compose.yml` levanta todos los servicios necesarios:

```
- app (Node.js backend)
- postgres (PostgreSQL + PostGIS)
- redis
- minio (almacenamiento de objetos, self-hosted)
```

**Ventajas para el TFM:**
- Un solo comando para levantar todo el entorno: `docker compose up`
- Reproducible en cualquier máquina (demos, evaluación del tribunal)
- Configuración completa en ~50 líneas de YAML
- Sin conocimiento especializado de Kubernetes

### Distribución del Frontend PWA

El frontend compilado (HTML/CSS/JS estáticos) se sirve:
- En desarrollo: servidor Vite con HMR
- En producción MVP: servido por el propio proceso Node.js (Express sirve la carpeta `dist`) o por Nginx en el mismo Compose

### CDN (Opcional en MVP)

Cloudflare en plan gratuito puede ponerse delante del servidor para:
- Caché agresiva de los assets estáticos del PWA
- HTTPS automático
- Protección DDoS básica
- "Always Online": sirve la app incluso si el servidor tiene problemas temporales

---

## Seguridad y Protección de Datos

### 1. Autenticación y Autorización

- **JWT (JSON Web Tokens)**: Tokens firmados para sesiones sin estado en el servidor.
- **Refresh Tokens**: Tokens de larga duración almacenados en cookies `HttpOnly` + `Secure`. El access token tiene vida corta (15 min).
- **RBAC (Role-Based Access Control)**: Middleware que verifica el rol del usuario antes de cada endpoint protegido.

### 2. Encriptación de Datos

- **En Tránsito**: TLS 1.3 obligatorio.
- **En Reposo**: Bases de datos con cifrado a nivel de disco.
- **Contraseñas**: Hashing con bcrypt (factor de coste ≥12) o argon2id.

### 3. Protección RGPD/LOPD

- **Consentimiento Explícito**: Registro de qué datos acepta compartir el usuario en el momento del registro.
- **Derecho al Olvido**: Endpoint de anonimización que desvincula datos personales de registros históricos.
- **Auditoría**: Tabla de auditoría en PostgreSQL con logs inmutables de accesos y modificaciones de datos sensibles.

### 4. Rate Limiting y Protección

- **Limitación por IP**: `express-rate-limit` con ventana deslizante. Sin infraestructura externa.
- **Protección de Login**: Bloqueo temporal progresivo tras múltiples intentos fallidos (implementado en lógica de aplicación + Redis para contador distribuido).
- **Cabeceras de Seguridad**: `helmet` configura automáticamente Content-Security-Policy, HSTS, X-Frame-Options, etc.

---

## Trazabilidad: Cadena de Custodia y Sellado de Tiempo

Para dar valor probatorio a la trazabilidad de donaciones y movimientos de inventario, el sistema implementa una **cadena de custodia tipo hash-chain** (`backend/src/lib/chain.ts`), opcionalmente reforzada con **sellado de tiempo RFC 3161** contra una autoridad externa (`backend/src/lib/tsa.ts`).

### Cómo funciona

- Cada evento relevante (`DONACION_CREADA`, `INVENTARIO_SALIDA`, etc.) se registra como un `ChainEvent` con un número de secuencia, su `payload` y el hash SHA-256 del evento anterior (`hashPrevio` → `hashPropio`).
- Cualquier manipulación posterior de un evento rompe la cadena a partir de ese punto, lo cual es detectable con `verifyChain()`, que recalcula y compara todos los hashes.
- Si la escritura del evento falla, no se descarta: se encola en `PendingChainEvent` y se reintenta con backoff exponencial (10 s → 30 min, hasta 5 intentos).

### El TSA es opcional (best-effort)

- El sellado de tiempo (`stampEventAsync`) se ejecuta de forma asíncrona y **nunca bloquea** el registro del evento. Si el TSA (`freetsa.org` por defecto, configurable vía `TSA_URL`) está caído, cambia su formato de respuesta o tarda más de 10 s, el fallo se ignora silenciosamente.
- **La integridad de la trazabilidad NO depende del TSA**: la garantiza el hash-chain por sí solo. El sello de tiempo solo añade una prueba independiente de *cuándo* existió un hash. Por tanto, la app funciona con normalidad aunque el TSA no esté disponible, y el despliegue no requiere contratar ningún servicio de sellado.

### Limitación conocida: cadena global serializable

La cadena es **única y global**: cada evento lee el último `sequence` y escribe dentro de una transacción con `isolationLevel: 'Serializable'`. Esto garantiza un orden total y verificable, pero **serializa toda la escritura de eventos**: bajo concurrencia alta (muchas donaciones o movimientos de inventario simultáneos) las transacciones compiten por el mismo punto final de la cadena, generando reintentos y reduciendo el throughput.

Para el alcance de un MVP/TFM es una decisión asumible —la cola de reintentos absorbe la contención sin perder eventos—, pero es el principal cuello de botella de escritura del sistema. **Línea de trabajo futura:** particionar la cadena (p. ej. una cadena por puesto de emergencia o por tipo de entidad) para permitir escrituras concurrentes manteniendo la verificabilidad dentro de cada partición.

---

## Roadmap de Implementación

### Fase 1: MVP (3-4 meses)

**Mes 1: Fundamentos**
- [ ] Configuración de repositorio y CI/CD básico (GitHub Actions)
- [ ] Diseño de base de datos PostgreSQL + PostGIS
- [ ] API básica de autenticación (registro, login, JWT, refresh tokens)
- [ ] PWA shell con Service Workers (Workbox) y estructura de rutas por rol
- [x] Almacenamiento local (IndexedDB con Dexie.js, schema inicial)
- [ ] Diseño de UI/UX (al menos wireframes de flujos principales)

**Mes 2: Funcionalidades Core**
- [ ] Registro y perfil de voluntarios (transporte y laboral)
- [ ] Lista de catástrofes activas y puestos de emergencia
- [ ] Sistema de productos: inventario disponible y necesidades
- [ ] Geolocalización básica y cálculo de distancias (Haversine)
- [ ] Generación de QR
- [ ] Escaneo de QR

**Mes 3: Características Offline**
- [x] Cola de sincronización persistente en IndexedDB
- [ ] Resolución de conflictos de inventario
- [x] Detección de conectividad y modos (normal / ahorro / offline)
- [ ] Compresión de imágenes en cliente (Canvas API)
- [x] Tiles de mapa visitados y rutas calculadas disponibles offline
- [ ] Gestión de cuota de almacenamiento
- [ ] Banner de instalación de PWA para iOS

**Mes 4: Testing y Lanzamiento**
- [ ] Tests unitarios (Vitest) — lógica de negocio crítica
- [ ] Tests E2E (Playwright) — 5 flujos principales
- [x] Tests de comportamiento offline (sesión, recarga, cola y reconciliación)
- [ ] Optimización de rendimiento (Lighthouse PWA score)
- [ ] Documentación de API (OpenAPI/Swagger)
- [ ] Deploy en producción (Docker Compose en VPS)
- [ ] Piloto con usuarios reales en escenario simulado

### Fase 2: Mejoras (2-3 meses)

**Mes 5: Optimización**
- [ ] Algoritmo de priorización de puntos de distribución
- [ ] Rutas optimizadas evitando calles cortadas
- [ ] Notificaciones push (Android/Chrome y iOS 16.4+)
- [ ] Mejoras de UI/UX basadas en feedback del piloto
- [ ] Panel de administración para coordinadores
- [ ] API Gateway (Kong o similar) si el tráfico lo justifica

**Mes 6: Escalabilidad**
- [ ] Extracción de microservicios (Auth y Geo como primer candidatos)
- [ ] Caché distribuido con Redis Cluster
- [ ] CDN para assets estáticos
- [ ] Balanceo de carga
- [ ] Monitoreo y alertas (Prometheus + Grafana)
- [ ] Migración de Docker Compose a Kubernetes

**Mes 7: Funcionalidades Avanzadas**
- [ ] Chat entre voluntarios y coordinadores
- [ ] Reportes de calles cortadas integrados en el mapa
- [ ] Sistema de reputación y gamificación básica
- [ ] Logs centralizados (Loki o ElasticSearch)

### Fase 3: Avanzadas (3-4 meses)

**Mes 8-9: IA y Predicciones**
- [ ] Predicción de necesidades con ML
- [ ] Optimización multi-voluntario (asignación óptima)
- [ ] Análisis de patrones de demanda

**Mes 10-11: Resiliencia Extrema**
- [ ] Fallback a SMS Gateway (Twilio)
- [ ] Mesh networking / Bluetooth P2P
- [ ] Sincronización P2P entre dispositivos cercanos
- [ ] Modo supervivencia extrema (sin ningún servidor)

---

## Arquitectura Objetivo (Post-MVP)

Esta sección documenta la arquitectura a la que evolucionará el sistema cuando esté en producción real, con equipos y volúmenes que lo justifiquen. No es parte del MVP.

```
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE CLIENTE                       │
├─────────────────────────────────────────────────────────┤
│  PWA (React)  │  App Nativa (React Native, si necesario)│
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│         API GATEWAY (Kong / AWS API Gateway)            │
│  Rate limiting │ Auth JWT │ Compresión │ Enrutamiento   │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                  MICROSERVICIOS                          │
│  Auth  │  Geo  │  Inventario  │  Notificaciones         │
│  Rutas │  Usuarios │  Reportes │  Analytics             │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE DATOS                         │
├─────────────────────────────────────────────────────────┤
│  PostgreSQL + PostGIS  │  Redis Cluster  │  RabbitMQ    │
│  MinIO / S3            │  MongoDB (logs) │  ElasticSearch│
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│              ORQUESTACIÓN (Kubernetes)                   │
│  HPA (autoescalado) │ Self-healing │ Rolling updates    │
│  CDN (Cloudflare)   │ DRP en región secundaria          │
└─────────────────────────────────────────────────────────┘
```

La diferencia entre MVP y arquitectura objetivo no es una elección de calidad, sino de escala y equipo. El MVP está diseñado para que la migración incremental a esta arquitectura sea posible sin reescrituras.

---

## Consideraciones de Costos

### Infraestructura MVP (Estimación mensual)

**Opción recomendada: Híbrido (VPS + Cloudflare)**
- VPS Hetzner/DigitalOcean (2 vCPU, 4GB RAM): ~$20-40/mes
- Cloudflare CDN: Gratis (plan gratuito)
- Backups S3 o Hetzner Storage Box: ~$5-10/mes
- **Total: ~$30-50/mes**

**Opción mínima: VPS self-contained**
- Servidor dedicado con Docker Compose: ~$30/mes
- Domain + SSL (Let's Encrypt gratuito): ~$15/año
- **Total: ~$36/mes**

**Opción full cloud (innecesaria para MVP):**
- AWS/GCP con RDS, ElastiCache, ECS: ~$370/mes
- Justificada solo cuando el sistema esté en producción real con miles de usuarios concurrentes.

### Servicios Externos

- Twilio (SMS, Fase 3): Pay-as-you-go (~$0.01/SMS)
- SendGrid (Emails): Gratis hasta 100/día
- OpenStreetMap: Gratuito (sin límite de tiles para uso razonable; self-hosted con tile server para producción)
- Mapbox: $0-5/mes (alternativa comercial si OSM no cubre necesidades)
- MinIO: Self-hosted en el mismo VPS (sin coste adicional para MVP)

---

## Conclusión

La implementación del MVP de **Catástrofe Logística** está construida sobre un stack deliberadamente simple y probado, que prioriza la funcionalidad offline-first sobre la complejidad arquitectural.

### Stack MVP Definitivo

✅ **PWA con React + TypeScript + Vite** — frontend moderno, una sola app con roles
✅ **Workbox + Dexie.js (IndexedDB)** — offline-first real con gestión de cuota
✅ **Node.js + Express/Fastify + Prisma** — monolito modular, sin microservicios
✅ **PostgreSQL + PostGIS** — datos + geoespacial + FTS (sin ElasticSearch)
✅ **Redis** — sesiones + caché + colas BullMQ
✅ **Docker Compose** — despliegue simple y reproducible
✅ **OpenStreetMap + Leaflet** — mapas sin costes
✅ **Vitest + Playwright** — testing unitario y E2E incluyendo comportamiento offline

### Lo que NO está en el MVP (y por qué)

❌ **Microservicios** — complejidad operacional no justificada a esta escala
❌ **Kong / API Gateway externo** — sustituido por middleware Express estándar
❌ **RabbitMQ** — sustituido por BullMQ sobre Redis si se necesitan colas
❌ **MongoDB** — los logs van a PostgreSQL; suficiente para MVP
❌ **ElasticSearch** — sustituido por `tsvector` de PostgreSQL
❌ **Kubernetes** — sustituido por Docker Compose
❌ **SMS / Bluetooth Mesh** — Fase 3; no bloquea ninguna funcionalidad del MVP

Esta arquitectura garantiza que la aplicación funcione en las peores condiciones de una catástrofe real, puede desarrollarse en 3-4 meses, y tiene un camino de migración claro hacia la arquitectura objetivo sin reescrituras.
