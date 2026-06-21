import { z } from 'zod'

const nombreSchema = z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(60, 'El nombre no puede superar 60 caracteres')
const apellidosSchema = z.string().trim().min(2, 'Los apellidos deben tener al menos 2 caracteres').max(80, 'Los apellidos no pueden superar 80 caracteres')

const telefonoSchema = z.string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine((value) => /^(?:\+34)?[6789]\d{8}$/.test(value), 'El teléfono debe ser un número español válido')

export const updateUserProfileSchema = z.object({
  nombre: nombreSchema.optional(),
  apellidos: apellidosSchema.optional(),
  telefono: z.union([telefonoSchema, z.null()]).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'No hay cambios para guardar',
})

export const updateManagedUserSchema = z.object({
  roles: z.array(z.enum(['CIUDADANO', 'VOLUNTARIO', 'PUESTO_EMERGENCIA', 'COORDINADOR']))
    .min(1, 'El usuario debe conservar al menos un rol')
    .optional(),
  activo: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'No hay cambios para guardar',
})

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>
