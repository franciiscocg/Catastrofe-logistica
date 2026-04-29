import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

export const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  nombre: z.string().min(2),
  apellidos: z.string().min(2),
  telefono: z.string().optional(),
  dni: z.string().optional(),
  role: z.enum(['ciudadano', 'voluntario']).default('ciudadano'),
}).superRefine((input, ctx) => {
  if (input.role !== 'voluntario') return

  if (!input.telefono) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['telefono'],
      message: 'El teléfono es obligatorio para voluntarios',
    })
  }

  if (!input.dni) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dni'],
      message: 'El DNI/NIE es obligatorio para voluntarios',
    })
  }

})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
