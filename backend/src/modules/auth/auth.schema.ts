import { z } from 'zod'

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Introduce tu email o DNI'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

export const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  nombre: z.string().min(2, 'El nombre es obligatorio'),
  apellidos: z.string().min(2, 'Los apellidos son obligatorios'),
  dni: z.string().min(1, 'El DNI es obligatorio'),
  telefono: z.string().optional(),
})

export const verifyAccountSchema = z.object({
  token: z.string().min(20),
})

export const resendVerificationSchema = z.object({
  identifier: z.string().min(1, 'Introduce tu email o DNI'),
})

export const requestPasswordResetSchema = z.object({
  identifier: z.string().min(1, 'Introduce tu email o DNI'),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
