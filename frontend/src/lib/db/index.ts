import Dexie, { type Table } from 'dexie'
import type { SyncOperation } from '@/types/sync.types'
import type { PuestoEmergencia } from '@/types/puesto.types'
import type { ItemInventario } from '@/types/inventario.types'

interface MapTile {
  key: string
  data: ArrayBuffer
  cachedAt: number
}

// Extracto OSM (grafo de calles de una zona) cacheado para enrutamiento offline.
export interface OsmGraphRecord {
  id: string
  data: unknown // OsmGraphData serializado
  cachedAt: number
}

export interface PublicSnapshot {
  key: string
  value: unknown
  updatedAt: number
}

export interface ApiCacheEntry {
  key: string
  userId: string
  data: unknown
  status: number
  updatedAt: number
}

export interface IdMapping {
  localId: string
  serverId: string
  entity: string
  updatedAt: number
}

class CatLogisticaDB extends Dexie {
  syncQueue!: Table<SyncOperation, string>
  puestos!: Table<PuestoEmergencia, string>
  inventario!: Table<ItemInventario, string>
  mapTiles!: Table<MapTile, string>
  osmGraphs!: Table<OsmGraphRecord, string>
  publicSnapshots!: Table<PublicSnapshot, string>
  apiCache!: Table<ApiCacheEntry, string>
  idMappings!: Table<IdMapping, string>

  constructor() {
    super('CatLogisticaDB')

    this.version(2).stores({
      syncQueue: 'id, status, priority, createdAt, entity',
      puestos: 'id, activo',
      inventario: 'id, puestoId, tipo',
      mapTiles: 'key, cachedAt',
    })

    this.version(3).stores({
      syncQueue: 'id, status, priority, createdAt, nextRunAt, entity, idempotencyKey',
      puestos: 'id, activo',
      inventario: 'id, puestoId, tipo',
      mapTiles: 'key, cachedAt',
    })

    this.version(4).stores({
      syncQueue: 'id, status, priority, createdAt, nextRunAt, entity, idempotencyKey',
      puestos: 'id, activo',
      inventario: 'id, puestoId, tipo',
      mapTiles: 'key, cachedAt',
      osmGraphs: 'id, cachedAt',
      publicSnapshots: 'key, updatedAt',
    })

    this.version(5).stores({
      syncQueue: 'id, status, priority, createdAt, nextRunAt, entity, idempotencyKey, localEntityId',
      puestos: 'id, activo',
      inventario: 'id, puestoId, tipo',
      mapTiles: 'key, cachedAt',
      publicSnapshots: 'key, updatedAt',
      apiCache: 'key, userId, updatedAt',
      idMappings: 'localId, entity, updatedAt',
    })
  }
}

export const db = new CatLogisticaDB()
