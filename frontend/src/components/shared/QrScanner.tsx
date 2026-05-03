import { useEffect, useRef, useId } from 'react'
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode'

interface QrScannerProps {
  onResult: (result: string) => void
  onClose: () => void
}

export default function QrScanner({ onResult, onClose }: QrScannerProps) {
  const uid = useId().replace(/:/g, '')
  const divId = `qr-reader-${uid}`
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    // Evitar doble inicialización en React Strict Mode
    if (mountedRef.current) return
    mountedRef.current = true

    scannerRef.current = new Html5QrcodeScanner(
      divId,
      {
        fps: 10,
        qrbox: { width: 240, height: 240 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        showTorchButtonIfSupported: true,
        showZoomSliderIfSupported: true,
        rememberLastUsedCamera: true,
      },
      false,
    )

    scannerRef.current.render(
      (decoded) => {
        // Parar el escáner al obtener un resultado y notificar al padre
        scannerRef.current?.clear().catch(() => {})
        onResult(decoded)
      },
      () => { /* errores de escaneo continuos — ignorar */ },
    )

    return () => {
      scannerRef.current?.clear().catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-x-0 bottom-0 z-[3000] bg-white rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* Cabecera */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Escáner</p>
          <p className="font-semibold text-gray-900">Escanear código QR</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Área del escáner */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
        <p className="text-xs text-gray-500 text-center mb-3">
          Apunta la cámara al código QR del voluntario
        </p>

        {/* html5-qrcode monta su UI aquí */}
        <div id={divId} className="w-full [&_#qr-reader__dashboard_section_csr_span]:text-sm [&_video]:rounded-xl" />
      </div>
    </div>
  )
}
