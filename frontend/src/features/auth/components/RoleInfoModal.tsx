import { useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { Check, HeartHandshake, Lightbulb, ShieldCheck, Store, UserRound } from 'lucide-react'

export interface RoleInfoData {
  title: string
  icon: string
  color: 'blue' | 'green' | 'amber' | 'purple'
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
  purple: {
    header: 'bg-purple-700',
    checkBg: 'bg-purple-100',
    checkText: 'text-purple-800',
    callout: 'bg-purple-50 border-purple-100',
    calloutText: 'text-purple-900',
    closeBtn: 'bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white',
    ring: 'focus-visible:ring-purple-700',
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
  const HeaderIcon = info.title.includes('Voluntario')
    ? HeartHandshake
    : info.title.includes('Puesto')
      ? Store
      : info.title.includes('Coordinador')
        ? ShieldCheck
        : UserRound

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-modal-title"
        className="relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={clsx('rounded-t-3xl px-6 pb-7 pt-7 text-center text-white', c.header)}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15" aria-hidden="true">
            <HeaderIcon className="h-8 w-8" />
          </div>
          <h2 id="role-modal-title" className="text-3xl font-bold tracking-tight">
            {info.title}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-white/80">{info.what}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
          {info.canDo.map((item) => (
            <div
              key={item}
              className="flex items-center gap-4 rounded-2xl bg-gray-50 px-4 py-4"
            >
              <div
                className={clsx(
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
                  c.checkBg,
                  c.checkText,
                )}
                aria-hidden="true"
              >
                <Check className="h-5 w-5" />
              </div>
              <span className="text-base font-medium leading-snug text-gray-800">{item}</span>
            </div>
          ))}

          <div className={clsx('mt-1 flex items-start gap-3 rounded-2xl border px-4 py-4', c.callout)}>
            <Lightbulb className={clsx('mt-0.5 h-5 w-5 flex-shrink-0', c.calloutText)} aria-hidden="true" />
            <p className={clsx('text-sm font-medium leading-relaxed', c.calloutText)}>
              {info.whenToUse}
            </p>
          </div>
        </div>

        <div className="px-5 py-4">
          <button
            ref={closeRef}
            onClick={onClose}
            className={clsx(
              'w-full rounded-2xl py-4 text-lg font-bold transition-colors',
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
