export enum Role {
  CIUDADANO = 'ciudadano',
  VOLUNTARIO = 'voluntario',
  PUESTO = 'puesto',
  COORDINADOR = 'coordinador',
}

export interface User {
  id: string
  email: string
  nombre: string
  apellidos: string
  telefono?: string
  roles: string[]
  emailVerified?: boolean
  createdAt?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.CIUDADANO]: 'Ciudadano',
  [Role.VOLUNTARIO]: 'Voluntario / Donante',
  [Role.PUESTO]: 'Puesto de Emergencia',
  [Role.COORDINADOR]: 'Coordinador',
}

export const ROLE_ROUTES: Record<Role, string> = {
  [Role.CIUDADANO]: '/ciudadano',
  [Role.VOLUNTARIO]: '/voluntario',
  [Role.PUESTO]: '/puesto',
  [Role.COORDINADOR]: '/coordinador',
}

export const ROLE_REQUIRES_AUTH: Record<Role, boolean> = {
  [Role.CIUDADANO]: true,
  [Role.VOLUNTARIO]: true,
  [Role.PUESTO]: true,
  [Role.COORDINADOR]: true,
}
