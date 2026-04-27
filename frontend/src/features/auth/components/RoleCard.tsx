import { clsx } from 'clsx'
import { Role } from '@/types/auth.types'

export interface RoleCardConfig {
  role: Role
  title: string
  description: string
  icon: string
  color: 'blue' | 'green' | 'amber' | 'purple'
  requiresAuth: boolean
  features: string[]
}

const colorMap = {
  blue: {
    card: 'border-blue-200 hover:border-blue-400 hover:shadow-blue-100',
    icon: 'bg-blue-100 text-blue-600',
    badge: 'bg-blue-50 text-blue-700',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
    dot: 'bg-blue-500',
  },
  green: {
    card: 'border-green-200 hover:border-green-400 hover:shadow-green-100',
    icon: 'bg-green-100 text-green-600',
    badge: 'bg-green-50 text-green-700',
    button: 'bg-green-600 hover:bg-green-700 text-white',
    dot: 'bg-green-500',
  },
  amber: {
    card: 'border-amber-200 hover:border-amber-400 hover:shadow-amber-100',
    icon: 'bg-amber-100 text-amber-600',
    badge: 'bg-amber-50 text-amber-700',
    button: 'bg-amber-500 hover:bg-amber-600 text-white',
    dot: 'bg-amber-500',
  },
  purple: {
    card: 'border-purple-200 hover:border-purple-400 hover:shadow-purple-100',
    icon: 'bg-purple-100 text-purple-600',
    badge: 'bg-purple-50 text-purple-700',
    button: 'bg-purple-600 hover:bg-purple-700 text-white',
    dot: 'bg-purple-500',
  },
}

interface RoleCardProps {
  config: RoleCardConfig
  onSelect: (role: Role) => void
}

export default function RoleCard({ config, onSelect }: RoleCardProps) {
  const c = colorMap[config.color]

  return (
    <button
      onClick={() => onSelect(config.role)}
      className={clsx(
        'group w-full text-left bg-white border-2 rounded-2xl p-5 transition-all duration-200',
        'hover:shadow-lg active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500',
        c.card,
      )}
    >
      <div className="flex items-start gap-4">
        <div className={clsx('flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl', c.icon)}>
          {config.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 text-base">{config.title}</h3>
            {config.requiresAuth ? (
              <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', c.badge)}>
                Requiere registro
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                Acceso libre
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-gray-500 leading-relaxed">{config.description}</p>

          <ul className="mt-3 space-y-1">
            {config.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-gray-500">
                <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', c.dot)} />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex-shrink-0 self-center">
          <svg className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  )
}
