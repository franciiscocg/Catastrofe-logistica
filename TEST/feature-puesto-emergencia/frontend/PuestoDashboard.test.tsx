import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockApiGet,
  mockApiPost,
  mockApiPatch,
  mockApiDelete,
} = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
  mockApiPatch: vi.fn(),
  mockApiDelete: vi.fn(),
}))

vi.mock('../../../frontend/src/lib/api/client', () => ({
  apiClient: {
    get: mockApiGet,
    post: mockApiPost,
    patch: mockApiPatch,
    delete: mockApiDelete,
  },
}))

vi.mock('../../../frontend/src/store/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    puestoId: 'puesto-1',
    user: { id: 'admin-1', email: 'admin@example.com' },
  })),
}))

vi.mock('../../../frontend/src/components/shared/QrScanner', () => ({
  default: ({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="qr-scanner">
      <button onClick={() => onResult('QR-ENTREGA-123')}>Simular QR</button>
      <button
        onClick={() => onResult(JSON.stringify({
          t: 'SC',
          r: 'sol-1',
          p: 'puesto-1',
          i: [{ n: 'Agua embotellada', c: 'Bebidas', q: 3, u: 'litros' }],
        }))}
      >
        Simular QR solicitud
      </button>
      <button onClick={onClose}>Cerrar QR</button>
    </div>
  ),
}))

import PuestoDashboard from '../../../frontend/src/features/puesto/pages/Dashboard'

const puesto = {
  id: 'puesto-1',
  nombre: 'CEIP La Paz',
  direccion: 'Calle Mayor 12',
  tipo: 'colegio',
  activo: true,
}

const inventario = [
  {
    id: 'item-agua',
    cantidad: 100,
    tipo: 'DISPONIBLE',
    producto: { id: 'prod-agua', nombre: 'Agua embotellada', categoria: 'Bebidas', unidad: 'litros' },
  },
  {
    id: 'item-mantas',
    cantidad: 4,
    tipo: 'DISPONIBLE',
    producto: { id: 'prod-mantas', nombre: 'Mantas', categoria: 'Abrigo', unidad: 'unidades' },
  },
  {
    id: 'item-botas',
    cantidad: 12,
    tipo: 'NECESARIO',
    producto: { id: 'prod-botas', nombre: 'Botas de agua', categoria: 'Calzado', unidad: 'pares' },
  },
  {
    id: 'item-radio',
    cantidad: 0,
    tipo: 'DISPONIBLE',
    producto: { id: 'prod-radio', nombre: 'Radios', categoria: 'Equipamiento', unidad: 'unidades' },
  },
]

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PuestoDashboard />
    </QueryClientProvider>,
  )
}

function mockApi() {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/api/puestos/puesto-1') return Promise.resolve({ data: { puesto } })
    if (url === '/api/inventario/puesto/puesto-1') return Promise.resolve({ data: { inventario } })
    if (url === '/api/puestos/puesto-1/donaciones') return Promise.resolve({ data: { donaciones: [] } })
    if (url === '/api/inventario/puesto/puesto-1/historial') return Promise.resolve({ data: { historial: [] } })
    if (url === '/api/puestos/puesto-1/solicitudes-participacion') return Promise.resolve({ data: { solicitudes: [] } })
    if (url === '/api/puestos/puesto-1/participantes') {
      return Promise.resolve({
        data: {
          participantes: [
            {
              id: 'rel-1',
              usuario: {
                id: 'user-2',
                nombre: 'Ana',
                apellidos: 'Lopez',
                email: 'ana@example.com',
                dni: '12345678A',
                telefono: '600111222',
              },
            },
          ],
        },
      })
    }
    return Promise.reject(new Error(`GET no mockeado: ${url}`))
  })
  mockApiPost.mockResolvedValue({ data: {} })
  mockApiPatch.mockResolvedValue({ data: {} })
  mockApiDelete.mockResolvedValue({ data: {} })
}

describe('PuestoDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi()
  })

  it('muestra cabecera, estado y resumen del inventario del puesto', async () => {
    renderDashboard()

    expect(await screen.findByText('CEIP La Paz')).toBeInTheDocument()
    await screen.findByText('Agua embotellada')

    // La cabecera resume el estado del puesto y las metricas del inventario.
    const header = screen.getByText('Puesto de emergencia').closest('section') as HTMLElement
    expect(within(header).getByText('Operativo')).toBeInTheDocument()
    // 1 producto falta (Botas) y 1 esta critico por stock bajo (Mantas).
    expect(within(within(header).getByText('Faltan').closest('div') as HTMLElement).getByText('1')).toBeInTheDocument()
    expect(within(within(header).getByText('Criticos').closest('div') as HTMLElement).getByText('1')).toBeInTheDocument()
  })

  it('filtra la lista para mostrar solo productos necesarios', async () => {
    renderDashboard()

    expect(await screen.findByText('Agua embotellada')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Faltan', { selector: 'button' }))

    // Botas (faltante) sigue visible; Agua (disponible) desaparece de la vista.
    // "Botas de agua" puede aparecer tambien en el panel de prioridad operativa.
    expect(screen.getAllByText('Botas de agua').length).toBeGreaterThan(0)
    expect(screen.queryByText('Agua embotellada')).not.toBeInTheDocument()
  })

  it('actualiza cantidades desde los controles de inventario', async () => {
    renderDashboard()

    await screen.findAllByText('Mantas')
    // "Mantas" puede aparecer en el panel de prioridad y en la tarjeta; nos
    // quedamos con la tarjeta (article) del inventario.
    const card = screen.getAllByText('Mantas')
      .map((node) => node.closest('article'))
      .find((el): el is HTMLElement => el !== null) as HTMLElement
    fireEvent.click(within(card).getByTitle('Registrar entrada'))

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/inventario/items/item-mantas/cantidad', { delta: 1 })
    })
  })

  it('permite bajar de cero creando una necesidad en la misma tarjeta', async () => {
    renderDashboard()

    await screen.findByText('Radios')
    const card = screen.getAllByText('Radios')
      .map((node) => node.closest('article'))
      .find((el): el is HTMLElement => el !== null) as HTMLElement
    fireEvent.click(within(card).getByTitle('Registrar salida'))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/inventario/puesto/puesto-1/items', expect.objectContaining({
        nombre: 'Radios',
        categoria: 'Equipamiento',
        unidad: 'unidades',
        cantidad: 1,
        tipo: 'NECESARIO',
      }))
    })
  })

  it('anade un producto al inventario con sugerencia frecuente', async () => {
    renderDashboard()

    await screen.findByText('CEIP La Paz')
    fireEvent.click(screen.getByRole('button', { name: /Nuevo producto/i }))
    fireEvent.click(screen.getByText(/Medicamentos b.sicos/))
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /A.adir al inventario/ }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/inventario/puesto/puesto-1/items',
        expect.objectContaining({
          nombre: expect.stringMatching(/Medicamentos b.sicos/),
          categoria: 'Sanidad',
          unidad: 'kits',
          cantidad: 8,
          tipo: 'DISPONIBLE',
        }),
      )
    })
  })

  it('muestra y gestiona voluntarios del puesto', async () => {
    renderDashboard()

    await screen.findByText('CEIP La Paz')
    // El boton "Voluntarios" de la barra de acciones abre el panel de voluntarios.
    fireEvent.click(screen.getAllByText('Voluntarios').find((node) => node.tagName.toLowerCase() === 'button') as HTMLElement)

    expect(await screen.findByText('Ana Lopez')).toBeInTheDocument()
    expect(screen.getByText('DNI: 12345678A')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Quitar'))
    fireEvent.click(screen.getByText('Confirmar'))
    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith('/api/puestos/puesto-1/participantes/rel-1')
    })
  })

  it('abre el lector QR y muestra el resultado escaneado', async () => {
    renderDashboard()

    await screen.findByText('CEIP La Paz')
    fireEvent.click(screen.getByText(/QR/))
    fireEvent.click(screen.getByText('Simular QR'))

    expect(screen.getByText('QR-ENTREGA-123')).toBeInTheDocument()
  })

  it('muestra un error informado si backend rechaza la confirmación QR', async () => {
    mockApiPost.mockRejectedValueOnce({
      response: {
        data: {
          error: 'Este QR de solicitud ya se ha usado. Pide al ciudadano que genere uno nuevo.',
        },
      },
    })
    renderDashboard()

    await screen.findByText('CEIP La Paz')
    fireEvent.click(screen.getByText(/QR/))
    fireEvent.click(screen.getByText('Simular QR solicitud'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('Este QR de solicitud ya se ha usado. Pide al ciudadano que genere uno nuevo.')).toBeInTheDocument()
  })
})
