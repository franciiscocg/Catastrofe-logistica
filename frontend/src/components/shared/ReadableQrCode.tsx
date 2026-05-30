import { QRCodeSVG } from 'qrcode.react'

interface ReadableQrCodeProps {
  value: string
  size?: number
  className?: string
}

export default function ReadableQrCode({ value, size = 320, className = '' }: ReadableQrCodeProps) {
  return (
    <div className={`inline-flex rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        includeMargin
        bgColor="#ffffff"
        fgColor="#020617"
        style={{ display: 'block', height: 'auto', maxWidth: '100%' }}
      />
    </div>
  )
}
