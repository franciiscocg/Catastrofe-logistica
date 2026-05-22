import Dexie, { type Table } from 'dexie'
import type { SyncOperation } from '@/types/sync.types'
import type { PuestoEmergencia } from '@/types/puesto.types'
import type { ItemInventario } from '@/types/inventario.types'

interface MapTile {
  key: string
  data: ArrayBuffer
  cachedAt: number
}

class CatLogisticaDB extends Dexie {
  syncQueue!: Table<SyncOperation, string>
  puestos!: Table<PuestoEmergencia, string>
  inventario!: Table<ItemInventario, string>
  mapTiles!: Table<MapTile, string>

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
  }
}

export const db = new CatLogisticaDB()
