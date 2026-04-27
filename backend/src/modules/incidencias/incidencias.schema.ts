import { z } from 'zod'

export const estadoViaSchema = z.enum(['CORTADA', 'TRANSITABLE'])

export const createIncidenciaSchema = z.object({
  catastrofeId: z.string().min(1, 'catastrofeId es obligatorio'),
  latitud: z.number().min(-90).max(90),
  longitud: z.number().min(-180).max(180),
  estado: estadoViaSchema,
  descripcion: z.string().max(500).optional(),
})

export const listIncidenciasQuerySchema = z.object({
  catastrofeId: z.string().min(1).optional(),
  estado: estadoViaSchema.optional(),
})

export const updateEstadoSchema = z.object({
  estado: estadoViaSchema,
})

export type CreateIncidenciaInput = z.infer<typeof createIncidenciaSchema>
export type ListIncidenciasQuery = z.infer<typeof listIncidenciasQuerySchema>
export type UpdateEstadoInput = z.infer<typeof updateEstadoSchema>
