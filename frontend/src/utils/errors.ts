export function getApiErrorMessage(error: unknown, fallback = 'No se pudo completar la operacion.') {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: { error?: string; message?: string; details?: Array<{ message?: string }> } } }).response?.data
    const detail = data?.details?.find((item) => item.message)?.message
    return data?.error ?? data?.message ?? detail ?? fallback
  }

  if (error instanceof Error && error.message) return error.message

  return fallback
}
