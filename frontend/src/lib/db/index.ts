import Dexie, { type Table } from 'dexie'
import type { SyncOperation } from '@/types/sync.types'
import type { Catastrofe, PuestoEmergencia } from '@/types/catastrofe.types'
import type { ItemInventario } from '@/types/inventario.types'

interface MapTile {
  key: string
  data: ArrayBuffer
  cachedAt: number
}

class CatLogisticaDB extends Dexie {
  syncQueue!: Table<SyncOperation, string>
  catastrofes!: Table<Catastrofe, string>
  puestos!: Table<PuestoEmergencia, string>
  inventario!: Table<ItemInventario, string>
  mapTiles!: Table<MapTile, string>

  constructor() {
    super('CatLogisticaDB')

    this.version(1).stores({
      syncQueue: 'id, status, priority, createdAt, entity',
      catastrofes: 'id, activa',
      puestos: 'id, catastrofeId, activo',
      inventario: 'id, puestoId, tipo',
      mapTiles: 'key, cachedAt',
    })
  }
}

export const db = new CatLogisticaDB()
