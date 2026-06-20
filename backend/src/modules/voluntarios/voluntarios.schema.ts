import { z } from 'zod'

export const modalidadVoluntarioSchema = z.enum(['mixta', 'transporte', 'presencial', 'donaciones'])

const textNullable = (max: number) => z.union([
  z.string().trim().max(max).transform((value) => value || null),
  z.null(),
]).optional()

const vehiculoSchema = z.object({
  disponible: z.boolean(),
  tipo: textNullable(40),
  matricula: textNullable(20),
  capacidad: textNullable(40),
}).strict().superRefine((vehiculo, ctx) => {
  if (!vehiculo.disponible) return
  if (!vehiculo.tipo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tipo'], message: 'Indica el tipo de vehículo disponible' })
  }
  if (!vehiculo.matricula) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matricula'], message: 'Indica la matrícula o identificador del vehículo' })
  }
}).transform((vehiculo) => ({
  disponible: vehiculo.disponible,
  tipo: vehiculo.disponible ? vehiculo.tipo ?? null : null,
  matricula: vehiculo.disponible ? vehiculo.matricula?.toUpperCase() ?? null : null,
  capacidad: vehiculo.disponible ? vehiculo.capacidad ?? null : null,
}))

export const updateVoluntarioProfileSchema = z.object({
  modalidad: z.union([modalidadVoluntarioSchema, z.null()]).optional(),
  vehiculo: vehiculoSchema.optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'No hay cambios para guardar',
})

export type UpdateVoluntarioProfileInput = z.infer<typeof updateVoluntarioProfileSchema>
