import { clsx } from 'clsx'
import { Role } from '@/types/auth.types'

export interface RoleCardConfig {
  role: Role
  title: string
  subtitle: string
  icon: string
  color: 'blue' | 'green' | 'amber'
  requiresAuth: boolean
  badge?: { text: string; className: string }
}

const colorMap = {
  blue: {
    border: 'border-blue-200 hover:border-blue-400',
    icon: 'bg-blue-50 text-blue-600',
    title: 'text-blue-700',
    arrow: 'text-blue-300',
    infoBtn: 'text-blue-600 hover:bg-blue-50',
    ring: 'focus-visible:ring-blue-600',
  },
  green: {
    border: 'border-green-200 hover:border-green-400',
    icon: 'bg-green-50 text-green-700',
    title: 'text-green-700',
    arrow: 'text-green-300',
    infoBtn: 'text-green-700 hover:bg-green-50',
    ring: 'focus-visible:ring-green-700',
  },
  amber: {
    border: 'border-amber-200 hover:border-amber-400',
    icon: 'bg-amber-50 text-amber-700',
    title: 'text-amber-800',
    arrow: 'text-amber-300',
    infoBtn: 'text-amber-700 hover:bg-amber-50',
    ring: 'focus-visible:ring-amber-700',
  },
}

interface RoleCardProps {
  config: RoleCardConfig
  onSelect: (role: Role) => void
  onInfo: (role: Role) => void
}

export default function RoleCard({ config, onSelect, onInfo }: RoleCardProps) {
  const c = colorMap[config.color]

  return (
    <div
      className={clsx(
        'rounded-2xl border-2 bg-white overflow-hidden transition-all duration-200 hover:shadow-xl',
        c.border,
      )}
    >
      {/* Main action — selects the role */}
      <button
        onClick={() => onSelect(config.role)}
        className={clsx(
          'w-full text-left flex items-center gap-4 px-5 pt-5 pb-4',
          'active:scale-[0.99] transition-transform',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
          c.ring,
        )}
        aria-label={`Acceder como ${config.title}`}
      >
        {/* Role icon */}
        <div
          className={clsx(
            'flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-4xl',
            c.icon,
          )}
          aria-hidden="true"
        >
          {config.icon}
        </div>

        {/* Role text */}
        <div className="flex-1 min-w-0">
          <p className={clsx('text-xl font-bold leading-tight', c.title)}>{config.title}</p>
          <p className="text-gray-600 text-base mt-1 leading-snug">{config.subtitle}</p>
          {config.badge && (
            <span className={clsx('inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full', config.badge.className)}>
              {config.badge.text}
            </span>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={clsx('flex-shrink-0 w-7 h-7 transition-colors', c.arrow)}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Visual separator */}
      <div className="h-px bg-gray-100 mx-5" aria-hidden="true" />

      {/* Info button — opens modal, separate from the main action */}
      <button
        onClick={() => onInfo(config.role)}
        className={clsx(
          'w-full text-left flex items-center gap-2 px-5 py-3',
          'text-sm font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
          c.infoBtn,
          c.ring,
        )}
        aria-label={`Más información sobre el rol ${config.title}`}
      >
        <span className="text-base" aria-hidden="true">ℹ️</span>
        <span>¿Qué hace este rol?</span>
      </button>
    </div>
  )
}
