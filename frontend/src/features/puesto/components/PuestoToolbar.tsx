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
    <section className="flex-shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button size="md" onClick={onScanQr} className="bg-blue-600 hover:bg-blue-700">
            Escanear QR
          </Button>
          <Button size="md" variant="secondary" onClick={onAdd}>
            Nuevo producto
          </Button>
          <Button size="md" variant="secondary" onClick={onWorkers}>
            Voluntarios
          </Button>
          <Button size="md" variant="ghost" onClick={onHistory}>
            Historial
          </Button>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <input
            type="search"
            value={inventarioSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por producto o categoria"
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 lg:w-72"
          />
          <div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-100 p-1">
            {([
              ['todos', 'Todo'],
              ['DISPONIBLE', 'Stock'],
              ['NECESARIO', 'Faltan'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onFiltroChange(id)}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition sm:min-w-[6.5rem] ${
                  filtro === id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'
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
