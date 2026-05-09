import { useEffect, useRef } from 'react'
import { clsx } from 'clsx'

export interface RoleInfoData {
  title: string
  icon: string
  color: 'blue' | 'green' | 'amber'
  what: string
  canDo: string[]
  whenToUse: string
}

interface RoleInfoModalProps {
  isOpen: boolean
  onClose: () => void
  info: RoleInfoData | null
}

const colorMap = {
  blue: {
    header: 'bg-blue-600',
    checkBg: 'bg-blue-100',
    checkText: 'text-blue-700',
    callout: 'bg-blue-50 border-blue-100',
    calloutText: 'text-blue-800',
    closeBtn: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white',
    ring: 'focus-visible:ring-blue-600',
  },
  green: {
    header: 'bg-green-700',
    checkBg: 'bg-green-100',
    checkText: 'text-green-700',
    callout: 'bg-green-50 border-green-100',
    calloutText: 'text-green-800',
    closeBtn: 'bg-green-700 hover:bg-green-800 active:bg-green-900 text-white',
    ring: 'focus-visible:ring-green-700',
  },
  amber: {
    header: 'bg-amber-700',
    checkBg: 'bg-amber-100',
    checkText: 'text-amber-800',
    callout: 'bg-amber-50 border-amber-100',
    calloutText: 'text-amber-900',
    closeBtn: 'bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white',
    ring: 'focus-visible:ring-amber-700',
  },
}

export default function RoleInfoModal({ isOpen, onClose, info }: RoleInfoModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const id = requestAnimationFrame(() => closeRef.current?.focus())
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose])

  if (!isOpen || !info) return null

  const c = colorMap[info.color]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-modal-title"
        className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con color del rol */}
        <div className={clsx('px-6 pt-7 pb-7 text-white text-center rounded-t-3xl', c.header)}>
          <div className="text-7xl mb-4 leading-none" aria-hidden="true">{info.icon}</div>
          <h2 id="role-modal-title" className="text-3xl font-bold tracking-tight">
            {info.title}
          </h2>
          <p className="mt-2 text-white/80 text-base leading-relaxed">{info.what}</p>
        </div>

        {/* Cuerpo scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-5 space-y-3">

          {/* Acciones como filas visuales */}
          {info.canDo.map((item) => (
            <div
              key={item}
              className="flex items-center gap-4 bg-gray-50 rounded-2xl px-4 py-4"
            >
              <div
                className={clsx(
                  'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold',
                  c.checkBg,
                  c.checkText,
                )}
                aria-hidden="true"
              >
                ✓
              </div>
              <span className="text-gray-800 text-base font-medium leading-snug">{item}</span>
            </div>
          ))}

          {/* Cuándo usarlo */}
          <div className={clsx('flex items-start gap-3 rounded-2xl border px-4 py-4 mt-1', c.callout)}>
            <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden="true">💡</span>
            <p className={clsx('text-sm leading-relaxed font-medium', c.calloutText)}>
              {info.whenToUse}
            </p>
          </div>
        </div>

        {/* Botón cerrar */}
        <div className="px-5 py-4">
          <button
            ref={closeRef}
            onClick={onClose}
            className={clsx(
              'w-full py-4 rounded-2xl font-bold text-lg transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              c.closeBtn,
              c.ring,
            )}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
