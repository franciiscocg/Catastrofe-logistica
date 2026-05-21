import { z } from 'zod'

export const addItemSchema = z.object({
  nombre:    z.string().min(1, 'El nombre es obligatorio'),
  categoria: z.string().min(1, 'La categoría es obligatoria'),
  unidad:    z.string().min(1, 'La unidad es obligatoria'),
  cantidad:  z.number().min(0, 'La cantidad no puede ser negativa'),
  tipo:      z.enum(['DISPONIBLE', 'NECESARIO']).default('DISPONIBLE'),
})

export const updateCantidadSchema = z.object({
  cantidad: z.number().min(0).optional(),
  delta:    z.number().optional(),
}).refine(
  (d) => d.cantidad !== undefined || d.delta !== undefined,
  { message: 'Proporciona cantidad o delta' },
)

export const confirmarQrSchema = z.object({
  codigo: z.string().trim().min(1, 'Pega o escanea el codigo del QR'),
})

export type AddItemInput = z.infer<typeof addItemSchema>
export type UpdateCantidadInput = z.infer<typeof updateCantidadSchema>
export type ConfirmarQrInput = z.infer<typeof confirmarQrSchema>
