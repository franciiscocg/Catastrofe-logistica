import { z } from 'zod'

export const createDonacionSchema = z.object({
  clientId: z.string().regex(/^offline-[0-9a-f-]{36}$/i).optional(),
  puestoId: z.string().min(1),
  productoId: z.string().min(1),
  cantidad: z.number().int().positive(),
  unidad: z.string().trim().min(1),
  comentario: z.string().trim().max(500).optional(),
  eta: z.string().datetime().optional(),
  estadoInicial: z.enum(['PENDIENTE', 'EN_CAMINO']).optional(),
  entregaCodigo: z.string().regex(/^OFFLINE-DEL-offline-[0-9a-f-]{36}$/i).optional(),
})

export const updateDonacionEstadoSchema = z.object({
  estado: z.enum(['PENDIENTE', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA']),
})

export const updateDonacionCantidadSchema = z.object({
  cantidad: z.number().int().positive(),
})

export type CreateDonacionInput = z.infer<typeof createDonacionSchema>
export type UpdateDonacionEstadoInput = z.infer<typeof updateDonacionEstadoSchema>
export type UpdateDonacionCantidadInput = z.infer<typeof updateDonacionCantidadSchema>
