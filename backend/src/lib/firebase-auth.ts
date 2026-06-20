import { createRemoteJWKSet, jwtVerify } from 'jose'

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

type FirebaseIdentityResponse = {
  idToken: string
  refreshToken: string
  expiresIn: string
  localId: string
  email?: string
}

type FirebaseRefreshResponse = {
  id_token: string
  refresh_token: string
  expires_in: string
  user_id: string
  project_id: string
}

type FirebaseAccount = {
  localId: string
  email?: string
  emailVerified?: boolean
  disabled?: boolean
}

type FirebaseErrorPayload = {
  error?: {
    message?: string
  }
}

export type FirebaseTokenClaims = {
  uid: string
  email?: string
  emailVerified: boolean
}

function appError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode })
}

function firebaseError(message: string, statusCode: number, firebaseCode?: string) {
  return Object.assign(new Error(message), { statusCode, firebaseCode })
}

export function isFirebaseAuthEnabled() {
  return process.env.AUTH_PROVIDER?.toLowerCase() === 'firebase'
}

function getApiKey() {
  const apiKey = process.env.FIREBASE_API_KEY
  if (!apiKey) throw new Error('FIREBASE_API_KEY no configurada')
  return apiKey
}

function getProjectId() {
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID no configurado')
  return projectId
}

function getAppBaseUrl() {
  return (process.env.APP_PUBLIC_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '')
}

export function assertFirebaseAuthConfigured() {
  if (!isFirebaseAuthEnabled()) return
  getApiKey()
  getProjectId()
  if (!process.env.APP_PUBLIC_URL && !process.env.FRONTEND_URL) {
    throw new Error('APP_PUBLIC_URL o FRONTEND_URL es obligatorio para los enlaces de Firebase')
  }
}

function firebaseMessage(code?: string) {
  switch (code) {
    case 'EMAIL_EXISTS':
      return firebaseError('Este correo electrónico ya está registrado', 400, code)
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_PASSWORD':
    case 'INVALID_LOGIN_CREDENTIALS':
      return firebaseError('Credenciales incorrectas', 401, code)
    case 'USER_DISABLED':
      return firebaseError('Cuenta desactivada', 403, code)
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return firebaseError('Demasiados intentos. Inténtalo más tarde.', 429, code)
    case 'WEAK_PASSWORD : Password should be at least 6 characters':
      return firebaseError('La contraseña debe tener al menos 8 caracteres', 400, code)
    case 'OPERATION_NOT_ALLOWED':
      return firebaseError('Activa el proveedor Email/Password en Firebase Authentication', 503, code)
    default:
      return firebaseError('Firebase Authentication no pudo completar la operación', 502, code)
  }
}

async function identityRequest<T>(path: string, body: Record<string, unknown>) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(getApiKey())}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-Locale': 'es',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })

  const payload = await response.json() as T & FirebaseErrorPayload
  if (!response.ok) throw firebaseMessage(payload.error?.message)
  return payload as T
}

export function firebaseSignUp(email: string, password: string) {
  return identityRequest<FirebaseIdentityResponse>('accounts:signUp', {
    email,
    password,
    returnSecureToken: true,
  })
}

export function firebaseSignIn(email: string, password: string) {
  return identityRequest<FirebaseIdentityResponse>('accounts:signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  })
}

export async function firebaseDeleteCurrentUser(idToken: string) {
  await identityRequest('accounts:delete', { idToken })
}

export async function firebaseRefreshSession(refreshToken: string) {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(getApiKey())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await response.json() as FirebaseRefreshResponse & FirebaseErrorPayload
  if (!response.ok) throw appError('Sesión expirada', 401)
  return payload as FirebaseRefreshResponse
}

export async function firebaseLookupAccount(idToken: string) {
  const result = await identityRequest<{ users?: FirebaseAccount[] }>('accounts:lookup', { idToken })
  const account = result.users?.[0]
  if (!account || account.disabled) throw appError('Cuenta desactivada', 403)
  return account
}

export async function sendFirebaseVerificationEmail(idToken: string) {
  await identityRequest('accounts:sendOobCode', {
    requestType: 'VERIFY_EMAIL',
    idToken,
    continueUrl: `${getAppBaseUrl()}/auth/login?verified=1`,
    canHandleCodeInApp: false,
  })
}

export async function sendFirebasePasswordResetEmail(email: string) {
  await identityRequest('accounts:sendOobCode', {
    requestType: 'PASSWORD_RESET',
    email,
    continueUrl: `${getAppBaseUrl()}/auth/login?passwordReset=1`,
  })
}

export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseTokenClaims> {
  const projectId = getProjectId()
  const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
    algorithms: ['RS256'],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  })

  if (!payload.sub) throw appError('Token de Firebase inválido', 401)
  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: payload.email_verified === true,
  }
}

export function firebaseSessionPayload(session: {
  idToken: string
  refreshToken: string
  expiresIn: string
}) {
  const ttl = Number(session.expiresIn || 3600)
  return {
    accessToken: session.idToken,
    refreshToken: session.refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  }
}
