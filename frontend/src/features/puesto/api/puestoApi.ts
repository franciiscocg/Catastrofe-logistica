import { apiClient } from '@/lib/api/client'

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
    apiClient.post(`/api/puestos/participaciones/${solicitudId}/${decision}`, {}),
  quitarParticipante: (puestoId: PuestoId, asignacionId: string) =>
    apiClient.delete(`/api/puestos/${puestoId}/participantes/${asignacionId}`),
  crearItem: (
    puestoId: PuestoId,
    payload: { nombre: string; categoria: string; unidad: string; cantidad: number; tipo: 'DISPONIBLE' | 'NECESARIO' },
  ) => apiClient.post(`/api/inventario/puesto/${puestoId}/items`, payload),
  ajustarCantidad: (itemId: string, delta: number) =>
    apiClient.patch(`/api/inventario/items/${itemId}/cantidad`, { delta }),
  eliminarItem: (itemId: string) => apiClient.delete(`/api/inventario/items/${itemId}`),
  confirmarQr: (puestoId: PuestoId, codigo: string) =>
    apiClient.post(`/api/inventario/puesto/${puestoId}/confirmar-qr`, { codigo }),
}
