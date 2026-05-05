import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
  catastrofe: { id: 'dana', nombre: 'DANA Valencia', fase: 'RESPUESTA' },
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
    if (url === '/api/puestos/puesto-1/trabajadores') {
      return Promise.resolve({
        data: {
          trabajadores: [
            {
              id: 'rel-1',
              usuario: {
                id: 'user-2',
                nombre: 'Ana',
                apellidos: 'Lopez',
                email: 'ana@example.com',
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
    expect(screen.getByText('DANA Valencia')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()

    expect(within(screen.getByText('Productos').closest('div') as HTMLElement).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByText(/Cr.ticos/).closest('div') as HTMLElement).getByText('1')).toBeInTheDocument()
    expect(within(screen.getByText('Necesitan').closest('div') as HTMLElement).getByText('1')).toBeInTheDocument()
  })

  it('filtra la lista para mostrar solo productos necesarios', async () => {
    renderDashboard()

    expect(await screen.findByText('Agua embotellada')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Necesitamos', { selector: 'button' }))

    expect(screen.getByText('Botas de agua')).toBeInTheDocument()
    expect(screen.queryByText('Agua embotellada')).not.toBeInTheDocument()
  })

  it('actualiza cantidades desde los controles de inventario', async () => {
    renderDashboard()

    await screen.findByText('Mantas')
    const controls = screen.getByText('4 unidades').parentElement as HTMLElement
    fireEvent.click(within(controls).getByText('+'))

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/inventario/items/item-mantas/cantidad', { delta: 1 })
    })
  })

  it('anade un producto al inventario con sugerencia frecuente', async () => {
    renderDashboard()

    await screen.findByText('CEIP La Paz')
    fireEvent.click(screen.getByText(/\+ A.adir/))
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

  it('muestra y gestiona trabajadores del puesto', async () => {
    renderDashboard()

    await screen.findByText('CEIP La Paz')
    fireEvent.click(screen.getByText('👷'))

    expect(await screen.findByText('Ana Lopez')).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('correo@ejemplo.com'), {
      target: { value: 'nuevo@example.com' },
    })
    const form = screen.getByPlaceholderText('correo@ejemplo.com').closest('form') as HTMLElement
    fireEvent.click(within(form).getByRole('button', { name: /A.adir/ }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/puestos/puesto-1/trabajadores', {
        email: 'nuevo@example.com',
      })
    })

    fireEvent.click(screen.getByText('Eliminar'))
    expect(mockApiDelete).toHaveBeenCalledWith('/api/puestos/puesto-1/trabajadores/user-2')
  })

  it('abre el lector QR y muestra el resultado escaneado', async () => {
    renderDashboard()

    await screen.findByText('CEIP La Paz')
    fireEvent.click(screen.getByText(/QR/))
    fireEvent.click(screen.getByText('Simular QR'))

    expect(screen.getByText('QR-ENTREGA-123')).toBeInTheDocument()
  })
})
