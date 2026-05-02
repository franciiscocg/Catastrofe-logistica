import { z } from 'zod'

export const createDonacionSchema = z.object({
  puestoId: z.string().min(1),
  productoId: z.string().min(1),
  cantidad: z.number().int().positive(),
  unidad: z.string().trim().min(1),
  comentario: z.string().trim().max(500).optional(),
  eta: z.string().datetime().optional(),
})

export const updateDonacionEstadoSchema = z.object({
  estado: z.enum(['PENDIENTE', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA']),
})

export type CreateDonacionInput = z.infer<typeof createDonacionSchema>
export type UpdateDonacionEstadoInput = z.infer<typeof updateDonacionEstadoSchema>
