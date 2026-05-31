import { z } from 'zod'

export const estadoViaSchema = z.enum(['CORTADA', 'TRANSITABLE'])
export const categoriaIncidenciaSchema = z.enum([
  'inundacion',
  'obstaculos_via',
  'limpieza',
  'asistencia',
])

export const createIncidenciaSchema = z.object({
  titulo: z.string().trim().min(3).max(120).optional(),
  categoria: categoriaIncidenciaSchema.optional(),
  latitud: z.number().min(-90).max(90),
  longitud: z.number().min(-180).max(180),
  estado: estadoViaSchema,
  descripcion: z.string().max(500).optional(),
  force: z.boolean().optional(),
})

export const listIncidenciasQuerySchema = z.object({
  estado: estadoViaSchema.optional(),
})

export const updateEstadoSchema = z.object({
  estado: estadoViaSchema,
})

export const updateIncidenciaSchema = z.object({
  titulo: z.string().trim().min(3).max(120).nullable().optional(),
  categoria: categoriaIncidenciaSchema.nullable().optional(),
  descripcion: z.string().trim().max(500).nullable().optional(),
  estado: estadoViaSchema.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, {
  message: 'Debes indicar algun cambio',
})

export const createComentarioIncidenciaSchema = z.object({
  estado: estadoViaSchema,
  comentario: z.string().trim().min(1).max(500),
})

export type CreateIncidenciaInput = z.infer<typeof createIncidenciaSchema>
export type ListIncidenciasQuery = z.infer<typeof listIncidenciasQuerySchema>
export type UpdateEstadoInput = z.infer<typeof updateEstadoSchema>
export type UpdateIncidenciaInput = z.infer<typeof updateIncidenciaSchema>
export type CreateComentarioIncidenciaInput = z.infer<typeof createComentarioIncidenciaSchema>
