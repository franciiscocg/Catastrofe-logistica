import { useEffect, useRef, useId, useState } from 'react'
import { Html5Qrcode, Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode'

interface QrScannerProps {
  onResult: (result: string) => void
  onClose: () => void
}

export default function QrScanner({ onResult, onClose }: QrScannerProps) {
  const uid = useId().replace(/:/g, '')
  const divId = `qr-reader-${uid}`
  const fileReaderId = `qr-file-reader-${uid}`
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)
  const mountedRef = useRef(false)
  const [fileError, setFileError] = useState('')
  const [scanningFile, setScanningFile] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [manualError, setManualError] = useState('')
  const showSecureWarning = typeof window !== 'undefined'
    && !window.isSecureContext
    && window.location.hostname !== 'localhost'
    && window.location.hostname !== '127.0.0.1'

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

  const handleFileQr = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setScanningFile(true)
    setFileError('')

    const fileScanner = new Html5Qrcode(fileReaderId)
    try {
      const result = await fileScanner.scanFileV2(file, true)
      fileScanner.clear()
      scannerRef.current?.clear().catch(() => {})
      onResult(result.decodedText)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setFileError(
        message.toLowerCase().includes('image')
          ? 'No he podido abrir esa imagen. En iPhone prueba a hacer captura del QR o una foto en JPG/PNG.'
          : 'No he podido leer un QR en esa imagen. Prueba con mas luz, sin reflejos y acercando el codigo.',
      )
    } finally {
      try {
        fileScanner.clear()
      } catch {
        // No hay camara activa que limpiar cuando solo se lee un archivo.
      }
      setScanningFile(false)
      event.target.value = ''
    }
  }

  const handleManualSubmit = () => {
    const code = manualCode.trim()
    if (!code) {
      setManualError('Pega primero el codigo del QR.')
      return
    }

    scannerRef.current?.clear().catch(() => {})
    setManualError('')
    onResult(code)
  }

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
        {showSecureWarning && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Si el navegador no abre la camara por estar en HTTP, usa el boton de foto de abajo.
          </p>
        )}

        <div id={divId} className="w-full [&_#qr-reader__dashboard_section_csr_span]:text-sm [&_video]:rounded-xl" />
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-semibold text-gray-900">Alternativa para movil</p>
          <p className="mt-1 text-xs text-gray-500">
            Haz una foto del QR o sube una captura si la camara directa no aparece.
          </p>
          <div
            id={fileReaderId}
            className="mt-3 min-h-16 overflow-hidden rounded-lg border border-dashed border-gray-300 bg-white text-center text-xs text-gray-400 [&_img]:mx-auto [&_img]:max-h-56"
          />
          <label className="mt-3 flex w-full cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            {scanningFile ? 'Leyendo QR...' : 'Hacer foto o subir QR'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/*"
              className="hidden"
              disabled={scanningFile}
              onChange={(event) => void handleFileQr(event)}
            />
          </label>
          {fileError && (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{fileError}</p>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-gray-900">Si no lo reconoce</p>
          <p className="mt-1 text-xs text-gray-500">
            Pega aqui el codigo del QR para probar la confirmacion sin depender de la camara.
          </p>
          <textarea
            value={manualCode}
            onChange={(event) => {
              setManualCode(event.target.value)
              setManualError('')
            }}
            rows={3}
            className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder='{"t":"SC",...}'
          />
          {manualError && (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{manualError}</p>
          )}
          <button
            type="button"
            onClick={handleManualSubmit}
            className="mt-3 flex w-full items-center justify-center rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            Leer codigo pegado
          </button>
        </div>
      </div>
    </div>
  )
}
