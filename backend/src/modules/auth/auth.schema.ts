import { z } from 'zod'

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Introduce tu email o DNI'),
  password: z.string().min(8, 'Minimo 8 caracteres'),
})

const puestoSchema = z.object({
  nombre: z.string().min(2, 'El nombre del puesto es obligatorio'),
  tipo: z.string().min(1, 'El tipo de instalacion es obligatorio'),
  direccion: z.string().min(5, 'La direccion es obligatoria'),
  descripcion: z.string().max(500).optional(),
  latitud: z.number().min(-90).max(90),
  longitud: z.number().min(-180).max(180),
})

export const registerSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'Minimo 8 caracteres'),
  nombre: z.string().min(2, 'El nombre es obligatorio'),
  apellidos: z.string().min(2, 'Los apellidos son obligatorios'),
  dni: z.string().min(1, 'El DNI es obligatorio'),
  telefono: z.string().optional(),
  puesto: puestoSchema.optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
