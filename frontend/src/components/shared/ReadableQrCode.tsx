import { QRCodeSVG } from 'qrcode.react'

interface ReadableQrCodeProps {
  value: string
  size?: number
  className?: string
}

function extractLegibleCode(value: string): string | null {
  try {
    const data = JSON.parse(value) as Record<string, unknown>
    // DONACION_ENTREGA: campo e = entregaCodigo
    if (data.t === 'DE' && typeof data.e === 'string') return data.e
    // SOLICITUD_CIUDADANO: campo r = requestId
    if (data.t === 'SC' && typeof data.r === 'string') return data.r
  } catch {
    // valor ya es texto plano
    if (value && value.length < 80) return value
  }
  return null
}

export default function ReadableQrCode({ value, size = 320, className = '' }: ReadableQrCodeProps) {
  const legibleCode = extractLegibleCode(value)

  return (
    <div className={`inline-flex flex-col items-center rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        includeMargin
        bgColor="#ffffff"
        fgColor="#020617"
        style={{ display: 'block', height: 'auto', maxWidth: '100%' }}
      />
      {legibleCode && (
        <div className="mt-3 w-full rounded-md bg-slate-50 px-3 py-2 text-center">
          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">Código manual</p>
          <p className="mt-0.5 select-all break-all font-mono text-base font-bold tracking-wider text-slate-800">
            {legibleCode}
          </p>
        </div>
      )}
    </div>
  )
}
