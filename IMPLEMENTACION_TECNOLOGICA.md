# Implementación Tecnológica - Catástrofe Logística

## Índice

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Stack Tecnológico Recomendado](#stack-tecnológico-recomendado)
4. [Diseño Offline-First](#diseño-offline-first)
5. [Funcionalidades Específicas para Catástrofes](#funcionalidades-específicas-para-catástrofes)
6. [Infraestructura y Despliegue](#infraestructura-y-despliegue)
7. [Seguridad y Protección de Datos](#seguridad-y-protección-de-datos)
8. [Roadmap de Implementación](#roadmap-de-implementación)
9. [Consideraciones de Costos](#consideraciones-de-costos)

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

## Arquitectura del Sistema

### Arquitectura General

```
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE CLIENTE                       │
├─────────────────────────────────────────────────────────┤
│  PWA (Progressive Web App)  │  Aplicación Móvil Nativa  │
│  - React + TypeScript       │  - React Native / Flutter │
│  - Service Workers          │  - SQLite local           │
│  - IndexedDB                │  - Geolocalización nativa │
│  - Cache API                │  - QR Scanner nativo      │
└─────────────────────────────────────────────────────────┘
                            ↕
            (Sincronización cuando hay conexión)
                            ↕
┌─────────────────────────────────────────────────────────┐
│                   CAPA DE GATEWAY                        │
├─────────────────────────────────────────────────────────┤
│  API Gateway (Kong / AWS API Gateway)                   │
│  - Rate limiting                                         │
│  - Autenticación JWT                                     │
│  - Compresión de respuestas                             │
│  - Cache de consultas frecuentes                        │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                  CAPA DE SERVICIOS                       │
├─────────────────────────────────────────────────────────┤
│  Microservicios (Node.js / Go / Python)                 │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│  │ Auth Service │ │ Geo Service  │ │ Inventory Svc   │ │
│  └──────────────┘ └──────────────┘ └─────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│  │ User Service │ │ Route Service│ │ Notification Svc│ │
│  └──────────────┘ └──────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE DATOS                         │
├─────────────────────────────────────────────────────────┤
│  PostgreSQL + PostGIS  │  Redis Cache  │  MongoDB       │
│  (Datos estructurados) │  (Sesiones)   │  (Logs)        │
│                        │               │                 │
│  MinIO / S3            │  RabbitMQ     │  ElasticSearch │
│  (Imágenes/Fotos)      │  (Cola msg)   │  (Búsquedas)   │
└─────────────────────────────────────────────────────────┘
```

### Flujo de Datos Offline-First

```
1. Usuario interactúa con la app
   ↓
2. Datos se guardan PRIMERO en almacenamiento local
   ↓
3. App intenta sincronizar con servidor
   ↓
4. ¿Hay conexión?
   │
   ├─ SÍ → Sincroniza y marca como enviado
   │
   └─ NO → Queda en cola de pendientes
              ↓
              Se reintenta periódicamente
              ↓
              Cuando hay conexión: sincroniza
```

---

## Stack Tecnológico Recomendado

### Opción 1: PWA (Progressive Web App) - RECOMENDADO PARA MVP

**Ventajas:**
- ✅ Un solo código para web y móvil
- ✅ No requiere aprobación de tiendas de apps
- ✅ Actualizaciones instantáneas
- ✅ Menor costo de desarrollo
- ✅ Funciona offline con Service Workers

**Stack:**

```javascript
Frontend:
- React 18+ con TypeScript
- Vite (build tool rápido)
- TailwindCSS (estilos)
- React Router (navegación)
- Zustand (gestión de estado ligera)
- React Query (gestión de servidor state)

PWA & Offline:
- Workbox (Service Workers)
- IndexedDB vía Dexie.js (almacenamiento local)
- LocalForage (fallback para almacenamiento)

Geolocalización:
- Geolocation API nativa del navegador
- Leaflet o Mapbox GL (mapas)
- OpenStreetMap (mapas sin costo)

QR:
- html5-qrcode (scanner)
- qrcode.react (generación)

Comunicación:
- Axios (HTTP cliente)
- Socket.io (WebSockets para actualizaciones en tiempo real)
```

### Opción 2: Aplicación Móvil Nativa

**Ventajas:**
- ✅ Mejor rendimiento
- ✅ Acceso completo a APIs nativas
- ✅ Mejor integración con GPS
- ✅ Mayor control sobre almacenamiento

**Stack:**

```javascript
React Native:
- React Native 0.72+
- TypeScript
- React Navigation
- Redux Toolkit o Zustand
- React Native Maps
- React Native Camera (para QR y fotos)
- AsyncStorage o SQLite (almacenamiento)
- NetInfo (detectar conectividad)

Flutter (alternativa):
- Flutter 3.x
- Dart
- Hive o SQLite (almacenamiento)
- google_maps_flutter
- qr_code_scanner
```

### Backend

```javascript
Opción A - Node.js (Recomendado para equipos JavaScript):
- Express.js o Fastify
- TypeScript
- Prisma ORM
- Joi o Zod (validación)
- JWT para autenticación
- Bull (colas de trabajo)

Opción B - Go (Recomendado para alto rendimiento):
- Gin o Fiber framework
- GORM (ORM)
- JWT-go
- Mejor rendimiento y menor consumo de recursos

Opción C - Python (Recomendado para IA/ML futuro):
- FastAPI
- SQLAlchemy
- Celery (tareas asíncronas)
- Útil si se planea añadir predicciones con ML
```

### Base de Datos

```sql
Principal:
- PostgreSQL 15+ con extensión PostGIS
  * Datos relacionales
  * Capacidades geoespaciales (búsquedas por proximidad)
  * JSONB para datos flexibles
  * Replicación y backup

Cache:
- Redis
  * Sesiones de usuario
  * Cache de consultas frecuentes
  * Rate limiting
  * Lista de puestos activos

Almacenamiento de Objetos:
- MinIO (self-hosted) o AWS S3
  * Fotos de vehículos
  * Fotos de productos
  * Imágenes de puestos
```

---

## Diseño Offline-First

### 1. Service Workers (PWA)

```javascript
// service-worker.js
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// Precachear recursos estáticos
precacheAndRoute(self.__WB_MANIFEST);

// Estrategia para API calls críticos
registerRoute(
  ({url}) => url.pathname.startsWith('/api/disasters'),
  new NetworkFirst({
    cacheName: 'disasters-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 // 1 hora
      })
    ]
  })
);

// Estrategia para imágenes
registerRoute(
  ({request}) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 días
      })
    ]
  })
);

// Background Sync para datos pendientes
const bgSyncPlugin = new BackgroundSyncPlugin('delivery-queue', {
  maxRetentionTime: 24 * 60 // Reintentar por 24 horas
});

registerRoute(
  ({url}) => url.pathname.startsWith('/api/deliveries'),
  new NetworkOnly({
    plugins: [bgSyncPlugin]
  }),
  'POST'
);
```

### 2. Almacenamiento Local (IndexedDB)

```javascript
// db.js usando Dexie
import Dexie from 'dexie';

export const db = new Dexie('CatastrofeLogistica');

db.version(1).stores({
  disasters: '++id, type, location, date, status',
  volunteers: '++id, dni, name, phone, status',
  products: '++id, name, category, priority',
  distributionPoints: '++id, disasterId, location, *needs, *available',
  deliveries: '++id, volunteerId, pointId, status, timestamp, synced',
  routes: '++id, volunteerId, waypoints, status',
  qrCodes: '++id, volunteerId, deliveryId, used, timestamp',
  photos: '++id, entityType, entityId, blob, synced',
  syncQueue: '++id, endpoint, method, body, timestamp, retryCount',
  mapTiles: '++id, key, zoom, x, y, timestamp'
});

// Funciones helper
export const addToSyncQueue = async (endpoint, method, body) => {
  await db.syncQueue.add({
    endpoint,
    method,
    body: JSON.stringify(body),
    timestamp: Date.now(),
    retryCount: 0
  });
};

export const processSyncQueue = async () => {
  const items = await db.syncQueue.toArray();
  
  for (const item of items) {
    try {
      const response = await fetch(item.endpoint, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body
      });
      
      if (response.ok) {
        await db.syncQueue.delete(item.id);
      } else if (item.retryCount < 5) {
        await db.syncQueue.update(item.id, {
          retryCount: item.retryCount + 1
        });
      }
    } catch (error) {
      console.log('Sync failed, will retry later');
    }
  }
};
```

### 3. Sincronización Inteligente

```javascript
// sync-manager.js
class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.priorityQueue = [];
    
    // Escuchar cambios de conectividad
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }
  
  handleOnline() {
    this.isOnline = true;
    this.startSync();
  }
  
  handleOffline() {
    this.isOnline = false;
  }
  
  async startSync() {
    if (this.syncInProgress || !this.isOnline) return;
    
    this.syncInProgress = true;
    
    try {
      // 1. Sincronizar datos críticos primero
      await this.syncCriticalData();
      
      // 2. Sincronizar datos del usuario
      await this.syncUserData();
      
      // 3. Sincronizar fotos (último, consume más datos)
      await this.syncPhotos();
      
      // 4. Procesar cola general
      await processSyncQueue();
      
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      this.syncInProgress = false;
    }
  }
  
  async syncCriticalData() {
    // Sincronizar lista de catástrofes activas
    const disasters = await fetch('/api/disasters/active');
    await db.disasters.bulkPut(await disasters.json());
    
    // Sincronizar productos necesitados
    const products = await fetch('/api/products/needed');
    await db.products.bulkPut(await products.json());
  }
  
  async syncUserData() {
    // Enviar entregas registradas offline
    const pendingDeliveries = await db.deliveries
      .where('synced').equals(0)
      .toArray();
    
    for (const delivery of pendingDeliveries) {
      try {
        await fetch('/api/deliveries', {
          method: 'POST',
          body: JSON.stringify(delivery)
        });
        await db.deliveries.update(delivery.id, { synced: 1 });
      } catch (error) {
        // Se reintentará después
      }
    }
  }
  
  async syncPhotos() {
    // Solo sincronizar fotos si está en WiFi
    const connection = navigator.connection;
    if (connection && connection.effectiveType !== 'wifi') {
      return; // Postponer hasta WiFi
    }
    
    const pendingPhotos = await db.photos
      .where('synced').equals(0)
      .toArray();
    
    for (const photo of pendingPhotos) {
      try {
        const formData = new FormData();
        formData.append('photo', photo.blob);
        formData.append('entityType', photo.entityType);
        formData.append('entityId', photo.entityId);
        
        await fetch('/api/photos', {
          method: 'POST',
          body: formData
        });
        
        await db.photos.update(photo.id, { synced: 1 });
      } catch (error) {
        // Se reintentará después
      }
    }
  }
}

export const syncManager = new SyncManager();
```

### 4. Detección de Conectividad

```javascript
// connectivity.js
export class ConnectivityManager {
  constructor() {
    this.status = {
      online: navigator.onLine,
      type: 'unknown',
      effectiveType: 'unknown',
      downlink: 0,
      rtt: 0
    };
    
    this.updateConnectionInfo();
    this.setupListeners();
  }
  
  updateConnectionInfo() {
    if ('connection' in navigator) {
      const conn = navigator.connection;
      this.status.type = conn.type || 'unknown';
      this.status.effectiveType = conn.effectiveType || 'unknown';
      this.status.downlink = conn.downlink || 0;
      this.status.rtt = conn.rtt || 0;
    }
  }
  
  setupListeners() {
    window.addEventListener('online', () => {
      this.status.online = true;
      this.notifyListeners();
    });
    
    window.addEventListener('offline', () => {
      this.status.online = false;
      this.notifyListeners();
    });
    
    if ('connection' in navigator) {
      navigator.connection.addEventListener('change', () => {
        this.updateConnectionInfo();
        this.notifyListeners();
      });
    }
  }
  
  isOnline() {
    return this.status.online;
  }
  
  getConnectionQuality() {
    const { effectiveType, downlink } = this.status;
    
    if (!this.status.online) return 'offline';
    if (effectiveType === '4g' && downlink > 5) return 'excellent';
    if (effectiveType === '4g' || effectiveType === '3g') return 'good';
    if (effectiveType === '2g') return 'poor';
    return 'unknown';
  }
  
  shouldDeferHeavyOperations() {
    const quality = this.getConnectionQuality();
    return quality === 'poor' || quality === 'offline';
  }
}
```

---

## Funcionalidades Específicas para Catástrofes

### 1. Geolocalización sin Conexión

```javascript
// location-manager.js
class LocationManager {
  constructor() {
    this.currentPosition = null;
    this.watchId = null;
    this.positionHistory = [];
  }
  
  async startTracking() {
    if (!('geolocation' in navigator)) {
      throw new Error('Geolocalización no disponible');
    }
    
    // Obtener posición actual
    this.currentPosition = await this.getCurrentPosition();
    
    // Iniciar seguimiento continuo
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.currentPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        
        // Guardar en historial local
        this.positionHistory.push(this.currentPosition);
        
        // Guardar en IndexedDB
        db.routes.add({
          volunteerId: this.getVolunteerId(),
          position: this.currentPosition,
          timestamp: Date.now()
        });
        
        // Intentar enviar al servidor si hay conexión
        if (navigator.onLine) {
          this.syncPosition();
        }
      },
      (error) => {
        console.error('Error de geolocalización:', error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000, // Cache de 30 segundos
        timeout: 27000 // Timeout menor que maximumAge para permitir fallback
      }
    );
  }
  
  stopTracking() {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
    }
  }
  
  async getCurrentPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        }),
        (error) => reject(error),
        { enableHighAccuracy: true }
      );
    });
  }
  
  // Calcular distancia usando fórmula de Haversine (offline)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance; // en km
  }
  
  deg2rad(deg) {
    return deg * (Math.PI/180);
  }
  
  // Encontrar puntos de distribución cercanos (offline)
  async findNearbyPoints(maxDistance = 50) {
    if (!this.currentPosition) {
      await this.getCurrentPosition();
    }
    
    const points = await db.distributionPoints.toArray();
    
    return points
      .map(point => ({
        ...point,
        distance: this.calculateDistance(
          this.currentPosition.lat,
          this.currentPosition.lng,
          point.location.lat,
          point.location.lng
        )
      }))
      .filter(point => point.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  }
}
```

### 2. Sistema QR Offline

```javascript
// qr-manager.js
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

class QRManager {
  // Generar QR localmente
  async generateDeliveryQR(deliveryData) {
    const qrData = {
      id: uuidv4(),
      volunteerId: deliveryData.volunteerId,
      timestamp: Date.now(),
      products: deliveryData.products,
      pointId: deliveryData.pointId,
      signature: await this.generateSignature(deliveryData)
    };
    
    // Guardar en IndexedDB
    await db.qrCodes.add({
      ...qrData,
      used: false,
      synced: false
    });
    
    // Generar imagen QR
    const qrImage = await QRCode.toDataURL(JSON.stringify(qrData));
    
    return {
      id: qrData.id,
      image: qrImage,
      data: qrData
    };
  }
  
  // Generar firma offline (simplificada)
  async generateSignature(data) {
    const encoder = new TextEncoder();
    const dataString = JSON.stringify(data);
    const dataBuffer = encoder.encode(dataString);
    
    // Usar Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  }
  
  // Verificar QR offline
  async verifyQR(qrDataString) {
    try {
      const qrData = JSON.parse(qrDataString);
      
      // Verificar firma
      const expectedSignature = await this.generateSignature({
        volunteerId: qrData.volunteerId,
        timestamp: qrData.timestamp,
        products: qrData.products,
        pointId: qrData.pointId
      });
      
      if (qrData.signature !== expectedSignature) {
        return { valid: false, reason: 'Firma inválida' };
      }
      
      // Verificar que no se haya usado antes
      const existingQR = await db.qrCodes.get(qrData.id);
      if (existingQR && existingQR.used) {
        return { valid: false, reason: 'QR ya utilizado' };
      }
      
      // Verificar tiempo (no más de 24 horas)
      const hoursSinceCreation = (Date.now() - qrData.timestamp) / (1000 * 60 * 60);
      if (hoursSinceCreation > 24) {
        return { valid: false, reason: 'QR expirado' };
      }
      
      return { valid: true, data: qrData };
    } catch (error) {
      return { valid: false, reason: 'QR inválido' };
    }
  }
  
  // Marcar QR como usado
  async markAsUsed(qrId, deliveryConfirmation) {
    await db.qrCodes.update(qrId, {
      used: true,
      usedAt: Date.now(),
      confirmation: deliveryConfirmation
    });
    
    // Intentar sincronizar si hay conexión
    if (navigator.onLine) {
      addToSyncQueue('/api/qr/confirm', 'POST', {
        qrId,
        confirmation: deliveryConfirmation
      });
    }
  }
}
```

### 3. Mapas Offline

```javascript
// offline-maps.js
import { Map } from 'leaflet';
import 'leaflet-offline';

class OfflineMapManager {
  constructor(containerId) {
    this.map = null;
    this.containerId = containerId;
    this.offlineTiles = new Map();
  }
  
  async initialize() {
    this.map = L.map(this.containerId).setView([39.4699, -0.3763], 13);
    
    // Usar tiles de OpenStreetMap con cache
    const tileLayer = L.tileLayer.offline(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '© OpenStreetMap contributors',
        subdomains: 'abc',
        minZoom: 10,
        maxZoom: 18
      }
    );
    
    tileLayer.addTo(this.map);
    
    // Cargar tiles guardados
    await this.loadOfflineTiles();
  }
  
  // Descargar tiles para uso offline
  async downloadAreaTiles(bounds, zoomLevels = [12, 13, 14, 15]) {
    const tiles = [];
    
    for (const zoom of zoomLevels) {
      const tilesInBounds = this.getTilesInBounds(bounds, zoom);
      tiles.push(...tilesInBounds);
    }
    
    let downloaded = 0;
    for (const tile of tiles) {
      try {
        const blob = await this.downloadTile(tile);
        await this.saveTile(tile, blob);
        downloaded++;
        
        // Notificar progreso
        this.onProgress(downloaded, tiles.length);
      } catch (error) {
        console.error('Error descargando tile:', error);
      }
    }
    
    return downloaded;
  }
  
  async downloadTile(tile) {
    const url = `https://a.tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
    const response = await fetch(url);
    return await response.blob();
  }
  
  async saveTile(tile, blob) {
    const key = `tile_${tile.z}_${tile.x}_${tile.y}`;
    
    // Guardar en IndexedDB
    await db.mapTiles.put({
      key,
      zoom: tile.z,
      x: tile.x,
      y: tile.y,
      blob: blob,
      timestamp: Date.now()
    });
  }
  
  async loadOfflineTiles() {
    const tiles = await db.mapTiles.toArray();
    this.offlineTiles = new Map(
      tiles.map(t => [t.key, URL.createObjectURL(t.blob)])
    );
  }
  
  getTilesInBounds(bounds, zoom) {
    // Calcular tiles necesarios para el área
    const tiles = [];
    const minTile = this.latLngToTile(bounds.north, bounds.west, zoom);
    const maxTile = this.latLngToTile(bounds.south, bounds.east, zoom);
    
    for (let x = minTile.x; x <= maxTile.x; x++) {
      for (let y = minTile.y; y <= maxTile.y; y++) {
        tiles.push({ z: zoom, x, y });
      }
    }
    
    return tiles;
  }
  
  latLngToTile(lat, lng, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lng + 180) / 360 * n);
    const y = Math.floor(
      (1 - Math.log(Math.tan(lat * Math.PI / 180) + 
       1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
    );
    return { x, y };
  }
}
```

### 4. Fallbacks de Comunicación

```javascript
// communication-fallbacks.js
class CommunicationManager {
  constructor() {
    this.channels = [
      { name: 'api', priority: 1, available: true },
      { name: 'websocket', priority: 2, available: false },
      { name: 'sms', priority: 3, available: false },
      { name: 'bluetooth', priority: 4, available: false }
    ];
  }
  
  // Intentar enviar mensaje por el mejor canal disponible
  async sendMessage(message, recipient) {
    for (const channel of this.channels.sort((a, b) => a.priority - b.priority)) {
      if (!channel.available) continue;
      
      try {
        switch (channel.name) {
          case 'api':
            return await this.sendViaAPI(message, recipient);
          
          case 'websocket':
            return await this.sendViaWebSocket(message, recipient);
          
          case 'sms':
            return await this.sendViaSMS(message, recipient);
          
          case 'bluetooth':
            return await this.sendViaBluetooth(message, recipient);
        }
      } catch (error) {
        console.log(`Failed to send via ${channel.name}, trying next channel`);
        continue;
      }
    }
    
    throw new Error('No hay canales de comunicación disponibles');
  }
  
  async sendViaAPI(message, recipient) {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, recipient })
    });
    
    if (!response.ok) throw new Error('API failed');
    return await response.json();
  }
  
  async sendViaSMS(message, recipient) {
    // Usar SMS Gateway o Twilio
    // En móvil nativo, usar plugin de SMS
    if ('sms' in navigator) {
      await navigator.sms.send(recipient.phone, message);
      return { sent: true, channel: 'sms' };
    }
    throw new Error('SMS not available');
  }
  
  async sendViaBluetooth(message, recipient) {
    // Para mesh networking en caso de fallo total de red
    if ('bluetooth' in navigator) {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true
      });
      // Implementar protocolo de mesh networking
      // ...
    }
    throw new Error('Bluetooth not available');
  }
  
  // Verificar disponibilidad de canales
  async checkChannelAvailability() {
    // API
    try {
      const response = await fetch('/api/health', { timeout: 3000 });
      this.channels.find(c => c.name === 'api').available = response.ok;
    } catch {
      this.channels.find(c => c.name === 'api').available = false;
    }
    
    // WebSocket
    // ... verificar WebSocket
    
    // SMS
    this.channels.find(c => c.name === 'sms').available = 'sms' in navigator;
    
    // Bluetooth
    this.channels.find(c => c.name === 'bluetooth').available = 'bluetooth' in navigator;
  }
}
```

### 5. Compresión de Imágenes

```javascript
// image-compression.js
class ImageCompressor {
  async compressImage(file, maxSizeMB = 0.5) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Reducir dimensiones si es muy grande
          const maxDimension = 1920;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Comprimir
          let quality = 0.8;
          let blob;
          
          const compress = () => {
            canvas.toBlob(
              (b) => {
                blob = b;
                
                // Si es muy grande, reducir calidad
                if (blob.size > maxSizeMB * 1024 * 1024 && quality > 0.1) {
                  quality -= 0.1;
                  compress();
                } else {
                  resolve(new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                  }));
                }
              },
              'image/jpeg',
              quality
            );
          };
          
          compress();
        };
      };
    });
  }
  
  async compressMultiple(files) {
    const compressed = [];
    for (const file of files) {
      compressed.push(await this.compressImage(file));
    }
    return compressed;
  }
}
```

---

## Infraestructura y Despliegue

### 1. Arquitectura Cloud

```yaml
# docker-compose.yml
version: '3.8'

services:
  # API Gateway
  api-gateway:
    image: kong:latest
    ports:
      - "8000:8000"
      - "8443:8443"
      - "8001:8001"
    environment:
      KONG_DATABASE: postgres
      KONG_PG_HOST: postgres
      KONG_PG_DATABASE: kong
      KONG_PG_USER: kong
      KONG_PG_PASSWORD: ${KONG_PG_PASSWORD}
    depends_on:
      - postgres

  # Servicio de Autenticación
  auth-service:
    build: ./services/auth
    environment:
      DATABASE_URL: postgresql://user:pass@postgres:5432/auth
      JWT_SECRET: ${JWT_SECRET}
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis

  # Servicio de Geolocalización
  geo-service:
    build: ./services/geo
    environment:
      DATABASE_URL: postgresql://user:pass@postgres:5432/geo
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis

  # Servicio de Inventario
  inventory-service:
    build: ./services/inventory
    environment:
      DATABASE_URL: postgresql://user:pass@postgres:5432/inventory
      RABBITMQ_URL: amqp://rabbitmq:5672
    depends_on:
      - postgres
      - rabbitmq

  # Base de datos principal
  postgres:
    image: postgis/postgis:15-3.3
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: catastrofe_logistica
    ports:
      - "5432:5432"

  # Cache Redis
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  # Cola de mensajes
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASS}

  # Almacenamiento de objetos
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}

  # Frontend PWA
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    environment:
      REACT_APP_API_URL: http://api-gateway:8000

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### 2. Kubernetes (Producción)

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: catastrofe/api-gateway:latest
        ports:
        - containerPort: 8000
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway-service
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 8000
  selector:
    app: api-gateway
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 3. CDN y Distribución

```javascript
// Configuración de CloudFlare
{
  "cdn": {
    "provider": "cloudflare",
    "zones": [
      {
        "domain": "catastrofe-logistica.com",
        "settings": {
          "ssl": "full",
          "always_use_https": true,
          "min_tls_version": "1.2",
          "automatic_https_rewrites": true,
          "browser_cache_ttl": 14400,
          "cache_level": "aggressive",
          "development_mode": false,
          "edge_cache_ttl": 7200
        }
      }
    ],
    "page_rules": [
      {
        "pattern": "catastrofe-logistica.com/static/*",
        "settings": {
          "cache_level": "cache_everything",
          "edge_cache_ttl": 2592000
        }
      },
      {
        "pattern": "catastrofe-logistica.com/api/*",
        "settings": {
          "cache_level": "bypass"
        }
      }
    ]
  }
}
```

### 4. Backup y Recuperación

```bash
#!/bin/bash
# backup.sh

# Variables
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
S3_BUCKET="s3://catastrofe-backups"

# Backup de PostgreSQL
pg_dump -h postgres -U admin catastrofe_logistica | \
  gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Backup de Redis
redis-cli --rdb "$BACKUP_DIR/redis_$DATE.rdb"

# Backup de fotos (MinIO)
mc mirror minio/photos "$BACKUP_DIR/photos_$DATE"

# Subir a S3
aws s3 sync "$BACKUP_DIR/" "$S3_BUCKET/$(date +%Y/%m/%d)/"

# Limpiar backups antiguos (mantener últimos 30 días)
find "$BACKUP_DIR" -type f -mtime +30 -delete

# Notificar éxito
curl -X POST https://api.catastrofe-logistica.com/webhooks/backup-complete \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"success\", \"date\": \"$DATE\"}"
```

---

## Seguridad y Protección de Datos

### 1. Autenticación y Autorización

```javascript
// auth-middleware.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

class AuthService {
  async register(userData) {
    // Hash de contraseña
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    
    // Guardar usuario
    const user = await db.users.create({
      ...userData,
      password: hashedPassword,
      role: 'volunteer',
      verified: false,
      createdAt: new Date()
    });
    
    // Enviar email de verificación
    await this.sendVerificationEmail(user.email);
    
    return { userId: user.id, email: user.email };
  }
  
  async login(email, password) {
    const user = await db.users.findOne({ email });
    
    if (!user) {
      throw new Error('Usuario no encontrado');
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      throw new Error('Contraseña incorrecta');
    }
    
    // Generar tokens
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    
    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: '7d' }
    );
    
    // Guardar refresh token
    await db.refreshTokens.create({
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    };
  }
  
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Token inválido');
    }
  }
}

// Middleware de autenticación
export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Middleware de roles
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
  };
};
```

### 2. Encriptación de Datos

```javascript
// encryption.js
import crypto from 'crypto';

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.saltLength = 64;
    this.tagLength = 16;
  }
  
  // Generar clave desde contraseña
  async deriveKey(password, salt) {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        100000,
        this.keyLength,
        'sha512',
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  }
  
  // Encriptar datos sensibles
  async encrypt(plaintext, password) {
    const salt = crypto.randomBytes(this.saltLength);
    const key = await this.deriveKey(password, salt);
    const iv = crypto.randomBytes(this.ivLength);
    
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combinar salt, iv, tag y datos encriptados
    return Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]).toString('base64');
  }
  
  // Desencriptar datos
  async decrypt(ciphertext, password) {
    const buffer = Buffer.from(ciphertext, 'base64');
    
    const salt = buffer.slice(0, this.saltLength);
    const iv = buffer.slice(this.saltLength, this.saltLength + this.ivLength);
    const tag = buffer.slice(
      this.saltLength + this.ivLength,
      this.saltLength + this.ivLength + this.tagLength
    );
    const encrypted = buffer.slice(this.saltLength + this.ivLength + this.tagLength);
    
    const key = await this.deriveKey(password, salt);
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  }
  
  // Hash de datos (para comparaciones)
  hash(data) {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }
}

export const encryption = new EncryptionService();
```

### 3. Protección RGPD/LOPD

```javascript
// gdpr-compliance.js
class GDPRService {
  // Consentimiento del usuario
  async recordConsent(userId, consentType, granted) {
    await db.consents.create({
      userId,
      consentType, // 'data_processing', 'location_tracking', 'photo_storage'
      granted,
      timestamp: new Date(),
      ipAddress: this.getClientIP(),
      userAgent: this.getUserAgent()
    });
  }
  
  // Derecho de acceso
  async exportUserData(userId) {
    const userData = await db.users.findById(userId);
    const deliveries = await db.deliveries.where({ volunteerId: userId });
    const photos = await db.photos.where({ userId });
    const locations = await db.locationHistory.where({ userId });
    
    return {
      personal_data: {
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        dni: userData.dni
      },
      deliveries: deliveries.map(d => ({
        date: d.timestamp,
        products: d.products,
        point: d.pointId
      })),
      photos: photos.length,
      location_history: locations.map(l => ({
        timestamp: l.timestamp,
        lat: l.lat,
        lng: l.lng
      }))
    };
  }
  
  // Derecho al olvido
  async deleteUserData(userId) {
    // Anonimizar en lugar de eliminar (mantener estadísticas)
    await db.users.update(userId, {
      name: `Usuario-${userId}`,
      email: `deleted-${userId}@anonymized.com`,
      phone: null,
      dni: null,
      deleted: true,
      deletedAt: new Date()
    });
    
    // Eliminar fotos
    await db.photos.where({ userId }).delete();
    
    // Eliminar historial de ubicación
    await db.locationHistory.where({ userId }).delete();
    
    // Anonimizar entregas (mantener estadísticas)
    await db.deliveries.where({ volunteerId: userId }).update({
      volunteerId: null,
      anonymized: true
    });
  }
  
  // Retención de datos limitada
  async cleanOldData() {
    const retentionDays = 730; // 2 años
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    // Eliminar ubicaciones antiguas
    await db.locationHistory.where('timestamp').below(cutoffDate).delete();
    
    // Eliminar fotos antiguas
    await db.photos.where('timestamp').below(cutoffDate).delete();
    
    // Anonimizar entregas antiguas
    const oldDeliveries = await db.deliveries
      .where('timestamp').below(cutoffDate)
      .toArray();
    
    for (const delivery of oldDeliveries) {
      await db.deliveries.update(delivery.id, {
        volunteerId: null,
        personalData: null,
        anonymized: true
      });
    }
  }
}
```

### 4. Rate Limiting y Protección DDoS

```javascript
// rate-limiter.js
import Redis from 'ioredis';

class RateLimiter {
  constructor(redis) {
    this.redis = redis;
  }
  
  // Rate limiting por IP
  async checkRateLimit(ip, endpoint, maxRequests = 100, windowSecs = 60) {
    const key = `ratelimit:${ip}:${endpoint}`;
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, windowSecs);
    }
    
    if (current > maxRequests) {
      throw new Error('Rate limit exceeded');
    }
    
    return {
      allowed: true,
      remaining: maxRequests - current,
      reset: await this.redis.ttl(key)
    };
  }
  
  // Protección contra fuerza bruta en login
  async checkLoginAttempts(identifier, maxAttempts = 5, windowSecs = 900) {
    const key = `login:attempts:${identifier}`;
    const attempts = await this.redis.incr(key);
    
    if (attempts === 1) {
      await this.redis.expire(key, windowSecs);
    }
    
    if (attempts > maxAttempts) {
      const ttl = await this.redis.ttl(key);
      throw new Error(`Too many login attempts. Try again in ${ttl} seconds`);
    }
    
    return attempts;
  }
  
  // Limpiar intentos exitosos
  async clearLoginAttempts(identifier) {
    await this.redis.del(`login:attempts:${identifier}`);
  }
}

// Middleware Express
export const rateLimitMiddleware = (maxRequests, windowSecs) => {
  const redis = new Redis(process.env.REDIS_URL);
  const limiter = new RateLimiter(redis);
  
  return async (req, res, next) => {
    try {
      const ip = req.ip || req.connection.remoteAddress;
      const endpoint = req.path;
      
      const result = await limiter.checkRateLimit(ip, endpoint, maxRequests, windowSecs);
      
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.reset);
      
      next();
    } catch (error) {
      res.status(429).json({
        error: 'Too many requests',
        message: error.message
      });
    }
  };
};
```

---

## Roadmap de Implementación

### Fase 1: MVP (3-4 meses)

**Mes 1: Fundamentos**
- [ ] Configuración de repositorio y CI/CD
- [ ] Diseño de base de datos
- [ ] API básica de autenticación
- [ ] PWA básica con Service Workers
- [ ] Almacenamiento local (IndexedDB)
- [ ] Diseño de UI/UX

**Mes 2: Funcionalidades Core**
- [ ] Registro de voluntarios
- [ ] Lista de catástrofes activas
- [ ] Sistema de productos y necesidades
- [ ] Geolocalización básica
- [ ] Generación de QR
- [ ] Escaneo de QR

**Mes 3: Características Offline**
- [ ] Sincronización offline
- [ ] Cache de datos críticos
- [ ] Compresión de imágenes
- [ ] Mapas offline básicos
- [ ] Cola de sincronización

**Mes 4: Testing y Lanzamiento**
- [ ] Testing integral
- [ ] Optimización de performance
- [ ] Documentación
- [ ] Deploy en producción
- [ ] Piloto con usuarios reales

### Fase 2: Mejoras (2-3 meses)

**Mes 5: Optimización**
- [ ] Algoritmo de priorización de puntos
- [ ] Rutas optimizadas
- [ ] Notificaciones push
- [ ] Mejoras de UI/UX basadas en feedback
- [ ] Panel de administración

**Mes 6: Escalabilidad**
- [ ] Microservicios
- [ ] Caché distribuido
- [ ] CDN para assets
- [ ] Balanceo de carga
- [ ] Monitoreo y alertas

**Mes 7: Funcionalidades Avanzadas**
- [ ] Chat entre voluntarios
- [ ] Reportes de calles cortadas
- [ ] Integración con redes sociales
- [ ] Gamificación básica
- [ ] Sistema de reputación

### Fase 3: Avanzadas (3-4 meses)

**Mes 8-9: IA y Predicciones**
- [ ] Predicción de necesidades con ML
- [ ] Optimización multi-voluntario
- [ ] Análisis de patrones
- [ ] Recomendaciones inteligentes

**Mes 10-11: Resilencia Extrema**
- [ ] Mesh networking
- [ ] Fallback a SMS
- [ ] Comunicación por Bluetooth
- [ ] Sincronización P2P
- [ ] Modo supervivencia extrema

---

## Consideraciones de Costos

### Infraestructura (Estimación mensual)

**Opción 1: Cloud Completo (AWS/GCP/Azure)**
- Servidores (3 instancias t3.medium): ~$150/mes
- Base de datos (RDS PostgreSQL): ~$100/mes
- CDN (CloudFront): ~$50/mes
- Almacenamiento S3: ~$20/mes
- Cache (ElastiCache Redis): ~$50/mes
- **Total: ~$370/mes**

**Opción 2: Híbrido (VPS + Cloud)**
- VPS Hetzner/DigitalOcean: ~$40/mes
- CloudFlare CDN: Gratis (plan gratuito)
- Backups S3: ~$10/mes
- **Total: ~$50/mes**

**Opción 3: Autohosted (Mínimo)**
- Servidor dedicado: ~$30/mes
- Domain + SSL: ~$15/año
- Backups: ~$5/mes
- **Total: ~$36/mes**

### Desarrollo

**Equipo Mínimo:**
- 1 Desarrollador Full-stack: Desarrollo completo
- 1 Diseñador UI/UX: Diseño de interfaz
- 1 DevOps (tiempo parcial): Infraestructura

**Equipo Ideal:**
- 2 Desarrolladores Frontend
- 2 Desarrolladores Backend
- 1 Desarrollador Móvil
- 1 Ingeniero DevOps
- 1 Diseñador UI/UX
- 1 Ingeniero QA
- 1 Product Manager

### Servicios Externos

- Twilio (SMS): Pay-as-you-go (~$0.01/SMS)
- SendGrid (Emails): Gratis hasta 100/día
- Maps: OpenStreetMap (gratis) o Mapbox ($0 - $5/mes)
- Storage: MinIO (self-hosted) o S3 (~$0.02/GB)

---

## Conclusión

La implementación de **Catástrofe Logística** requiere un enfoque **offline-first** que priorice:

1. **Funcionalidad sin conexión** como caso principal
2. **Sincronización inteligente** cuando hay conectividad
3. **Compresión y optimización** de datos
4. **Múltiples fallbacks** de comunicación
5. **Seguridad y privacidad** como pilares fundamentales

### Tecnologías Clave Recomendadas

✅ **PWA con React + TypeScript** para el frontend
✅ **Service Workers + IndexedDB** para funcionalidad offline
✅ **Node.js + PostgreSQL + PostGIS** para el backend
✅ **Redis** para caché
✅ **Docker + Kubernetes** para despliegue escalable
✅ **OpenStreetMap + Leaflet** para mapas sin costos

### Próximos Pasos

1. Validar requisitos con stakeholders
2. Crear prototipos de UI/UX
3. Iniciar desarrollo del MVP
4. Pruebas piloto en catástrofe simulada
5. Iteración basada en feedback real

Esta arquitectura garantiza que la aplicación funcione de manera óptima incluso en las peores condiciones de una catástrofe real, cumpliendo con la misión de **salvar vidas a través de logística organizada y tecnología resiliente**.
