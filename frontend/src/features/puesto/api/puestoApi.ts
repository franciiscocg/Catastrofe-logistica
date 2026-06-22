import { apiClient } from '@/lib/api/client'
import { queueableApiRequest } from '@/lib/api/offline'

export type PuestoId = string

export const puestoApi = {
  getMiPuesto: <T = { id: string }>() => apiClient.get<{ puestos: T[] }>('/api/puestos/mio'),
  getPuesto: <T>(puestoId: PuestoId) => apiClient.get<{ puesto: T }>(`/api/puestos/${puestoId}`),
  getInventario: <T>(puestoId: PuestoId) => apiClient.get<{ inventario: T[] }>(`/api/inventario/puesto/${puestoId}`),
  getHistorial: <T>(puestoId: PuestoId) => apiClient.get<{ historial: T[] }>(`/api/inventario/puesto/${puestoId}/historial`),
  getDonaciones: <T>(puestoId: PuestoId) => apiClient.get<{ donaciones: T[] }>(`/api/puestos/${puestoId}/donaciones`),
  getSolicitudesParticipacion: <T>(puestoId: PuestoId) =>
    apiClient.get<{ solicitudes: T[] }>(`/api/puestos/${puestoId}/solicitudes-participacion`),
  getParticipantes: <T>(puestoId: PuestoId) =>
    apiClient.get<{ participantes: T[] }>(`/api/puestos/${puestoId}/participantes`),
  decidirParticipacion: (solicitudId: string, decision: 'aceptar' | 'rechazar') =>
    queueableApiRequest({ method: 'POST', url: `/api/puestos/participaciones/${solicitudId}/${decision}`, data: {} }, { entity: 'participacion', priority: 'high' }),
  quitarParticipante: (puestoId: PuestoId, asignacionId: string) =>
    queueableApiRequest({ method: 'DELETE', url: `/api/puestos/${puestoId}/participantes/${asignacionId}` }, { entity: 'participacion', priority: 'high' }),
  crearItem: (
    puestoId: PuestoId,
    payload: { nombre: string; categoria: string; unidad: string; cantidad: number; tipo: 'DISPONIBLE' | 'NECESARIO' },
  ) => queueableApiRequest({ method: 'POST', url: `/api/inventario/puesto/${puestoId}/items`, data: payload }, { entity: 'inventario', priority: 'high' }),
  ajustarCantidad: (itemId: string, delta: number) =>
    queueableApiRequest({ method: 'PATCH', url: `/api/inventario/items/${itemId}/cantidad`, data: { delta } }, { entity: 'inventario', priority: 'high' }),
  eliminarItem: (itemId: string) => queueableApiRequest({ method: 'DELETE', url: `/api/inventario/items/${itemId}` }, { entity: 'inventario', priority: 'high' }),
  confirmarQr: (puestoId: PuestoId, codigo: string, cantidadOverride?: number) =>
    queueableApiRequest({ method: 'POST', url: `/api/inventario/puesto/${puestoId}/confirmar-qr`, data: { codigo, cantidadOverride } }, { entity: 'confirmacion-qr', priority: 'critical' }),
}
