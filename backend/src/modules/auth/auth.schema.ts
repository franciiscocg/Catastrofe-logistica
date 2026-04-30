import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

const puestoSchema = z.object({
  nombre:      z.string().min(2, 'El nombre del puesto es obligatorio'),
  tipo:        z.string().min(1, 'El tipo de instalación es obligatorio'),
  direccion:   z.string().min(5, 'La dirección es obligatoria'),
  descripcion: z.string().max(500).optional(),
  latitud:     z.number().min(-90).max(90),
  longitud:    z.number().min(-180).max(180),
})

export const registerSchema = z.object({
  email:     z.string().email('Email inválido'),
  password:  z.string().min(8, 'Mínimo 8 caracteres'),
  nombre:    z.string().min(2),
  apellidos: z.string().min(2),
  telefono:  z.string().optional(),
  dni:       z.string().optional(),
  roles:     z.array(z.string()).optional(),
  puesto:    puestoSchema.optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
