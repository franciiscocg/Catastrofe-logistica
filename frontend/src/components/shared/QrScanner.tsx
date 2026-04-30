interface QrScannerProps {
  onResult: (result: string) => void
  onError?: (error: string) => void
}

// TODO: Implementar con html5-qrcode en Mes 2
export default function QrScanner(_props: QrScannerProps) {
  return (
    <div className="h-64 bg-gray-900 flex items-center justify-center rounded-lg">
      <p className="text-white text-sm">Escáner QR — pendiente de implementar</p>
    </div>
  )
}
