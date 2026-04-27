import Dexie, { type EntityTable } from 'dexie'
import type { SyncOperation } from '@/types/sync.types'
import type { Catastrofe, PuestoEmergencia } from '@/types/catastrofe.types'
import type { ItemInventario } from '@/types/inventario.types'

interface MapTile {
  key: string
  data: ArrayBuffer
  cachedAt: number
}

class CatLogisticaDB extends Dexie {
  syncQueue!: EntityTable<SyncOperation, 'id'>
  catastrofes!: EntityTable<Catastrofe, 'id'>
  puestos!: EntityTable<PuestoEmergencia, 'id'>
  inventario!: EntityTable<ItemInventario, 'id'>
  mapTiles!: EntityTable<MapTile, 'key'>

  constructor() {
    super('CatLogisticaDB')

    this.version(1).stores({
      syncQueue: 'id, status, priority, createdAt',
      catastrofes: 'id, activa',
      puestos: 'id, catastrofeId, activo',
      inventario: 'id, puestoId, tipo',
      mapTiles: 'key, cachedAt',
    })
  }
}

export const db = new CatLogisticaDB()
