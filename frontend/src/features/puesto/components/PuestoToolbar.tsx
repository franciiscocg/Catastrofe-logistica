import Button from '@/components/ui/Button'

interface PuestoToolbarProps {
  filtro: 'todos' | 'DISPONIBLE' | 'NECESARIO'
  inventarioSearch: string
  onAdd: () => void
  onScanQr: () => void
  onHistory: () => void
  onWorkers: () => void
  onSearchChange: (value: string) => void
  onFiltroChange: (value: 'todos' | 'DISPONIBLE' | 'NECESARIO') => void
}

export default function PuestoToolbar({
  filtro,
  inventarioSearch,
  onAdd,
  onScanQr,
  onHistory,
  onWorkers,
  onSearchChange,
  onFiltroChange,
}: PuestoToolbarProps) {
  return (
    <section className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button size="sm" onClick={onAdd} className="bg-amber-600 hover:bg-amber-700">
            Añadir producto
          </Button>
          <Button size="sm" variant="secondary" onClick={onScanQr}>
            Escanear QR
          </Button>
          <details className="relative col-span-2 sm:col-span-1">
            <summary className="flex h-full cursor-pointer list-none items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
              Mas acciones
            </summary>
            <div className="absolute left-0 top-full z-[1500] mt-1 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
              <button type="button" onClick={onHistory} className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                Historial
              </button>
              <button type="button" onClick={onWorkers} className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                Voluntarios
              </button>
            </div>
          </details>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={inventarioSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar producto"
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 sm:w-56"
          />
          <div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-100 p-1">
            {([
              ['todos', 'Todo'],
              ['DISPONIBLE', 'Disponible'],
              ['NECESARIO', 'Faltan'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onFiltroChange(id)}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition sm:min-w-[6.5rem] ${
                  filtro === id ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
