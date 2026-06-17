import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('../../../frontend/src/lib/api/client', () => ({
  apiClient: { get: apiGet },
}))

import Verificar from '../../../frontend/src/features/public/pages/Verificar'

function renderPage(path = '/verificar') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/verificar" element={<Verificar />} />
          <Route path="/verificar/:id" element={<Verificar />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('pagina publica de verificacion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockImplementation((url: string) => {
      if (url.endsWith('/stats')) return Promise.resolve({ data: { total: 1, withTSA: 1, latestSequence: 1, latestHash: 'hash' } })
      if (url.endsWith('/verify')) return Promise.resolve({ data: { valid: true, totalEvents: 1 } })
      if (url.includes('/donacion/don-1')) {
        return Promise.resolve({
          data: {
            entidadId: 'don-1',
            entidad: 'donacion',
            events: [{
              id: 'ev-1',
              sequence: 1,
              tipo: 'DONACION_CREADA',
              actorRol: 'VOLUNTARIO',
              entidad: 'donacion',
              entidadId: 'don-1',
              payload: { producto: { nombre: 'Agua' }, cantidad: 5, unidad: 'litros' },
              hashPrevio: '0'.repeat(64),
              hashPropio: 'a'.repeat(64),
              tsaTimestamp: '2026-05-26T10:00:00.000Z',
              createdAt: '2026-05-26T10:00:00.000Z',
            }],
          },
        })
      }
      return Promise.reject(new Error(`Ruta inesperada: ${url}`))
    })
  })

  it('consulta automaticamente la donacion incluida en la URL publica', async () => {
    renderPage('/verificar/don-1')

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/public/audit/donacion/don-1'))
    expect(await screen.findByText('Donación registrada')).toBeInTheDocument()
    expect(screen.getByText(/1 evento encontrado/)).toBeInTheDocument()
  })

  it('permite comprobar la integridad global de la cadena', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Verificar ahora/i }))

    expect(await screen.findByText(/Cadena íntegra/)).toBeInTheDocument()
    expect(apiGet).toHaveBeenCalledWith('/api/public/audit/verify')
  })
})
