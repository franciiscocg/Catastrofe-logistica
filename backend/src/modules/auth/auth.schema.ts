import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email invalido'),
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
  nombre: z.string().min(2),
  apellidos: z.string().min(2),
  telefono: z.string().optional(),
  dni: z.string().optional(),
  role: z.enum(['ciudadano', 'voluntario']).default('ciudadano'),
  roles: z.array(z.string()).optional(),
  puesto: puestoSchema.optional(),
}).superRefine((input, ctx) => {
  const esVoluntario = input.role === 'voluntario'
  const esPuesto = input.roles?.includes('PUESTO_EMERGENCIA') ?? false

  if (esVoluntario && !input.telefono) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['telefono'],
      message: 'El telefono es obligatorio para voluntarios',
    })
  }

  if (esVoluntario && !input.dni) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dni'],
      message: 'El DNI/NIE es obligatorio para voluntarios',
    })
  }

  if (esPuesto && !input.puesto) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['puesto'],
      message: 'Los datos del puesto son obligatorios',
    })
  }
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
