const TECHNICAL_ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/^network error$/i, 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.'],
  [/failed to fetch|load failed|fetch failed/i, 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.'],
  [/typeerror|domexception/i, 'Se produjo un error inesperado en la aplicación. Inténtalo de nuevo.'],
  [/notallowederror|permission denied/i, 'No se pudo completar la acción porque falta un permiso del navegador. Revisa los permisos e inténtalo de nuevo.'],
  [/notfounderror|not readable|notreadableerror/i, 'No se pudo acceder al recurso solicitado. Revisa los permisos del navegador e inténtalo de nuevo.'],
  [/econnaborted|timeout|timed out/i, 'La petición ha tardado demasiado. Inténtalo de nuevo en unos segundos.'],
  [/err_network|econnrefused|enotfound|socket hang up/i, 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.'],
  [/^bad request$/i, 'La petición no es válida. Revisa los datos e inténtalo de nuevo.'],
  [/^unauthorized$/i, 'Tu sesión ha caducado. Inicia sesión de nuevo.'],
  [/^forbidden$/i, 'No tienes permiso para realizar esta acción.'],
  [/^not found$/i, 'No se encontró el recurso solicitado.'],
  [/request failed with status code 4\d\d/i, 'La petición no se pudo completar. Revisa los datos e inténtalo de nuevo.'],
  [/request failed with status code 5\d\d/i, 'El servidor no pudo completar la operación. Inténtalo de nuevo en unos minutos.'],
  [/cannot read|cannot access|undefined is not|is not a function|object object/i, 'Se produjo un error inesperado en la aplicación. Inténtalo de nuevo.'],
]

export function translateErrorMessage(message: unknown, fallback = 'No se pudo completar la operación.') {
  if (typeof message !== 'string') return fallback
  const trimmed = message.trim()
  if (!trimmed) return fallback

  const translated = TECHNICAL_ERROR_TRANSLATIONS.find(([pattern]) => pattern.test(trimmed))?.[1]
  return translated ?? trimmed
}

export function getApiErrorMessage(error: unknown, fallback = 'No se pudo completar la operación.') {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: { error?: string; message?: string; details?: Array<{ message?: string }> } } }).response?.data
    const detail = data?.details?.find((item) => item.message)?.message
    return translateErrorMessage(data?.error ?? data?.message ?? detail, fallback)
  }

  if (error instanceof Error && error.message) return translateErrorMessage(error.message, fallback)

  return fallback
}
