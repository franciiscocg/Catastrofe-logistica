import { useEffect, useId, useRef, useState } from 'react'
import { Camera, CameraOff, Loader2, RotateCcw, X } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats, type CameraDevice } from 'html5-qrcode'

interface QrScannerProps {
  onResult: (result: string) => void
  onClose: () => void
}

type ScannerStatus = 'starting' | 'scanning' | 'blocked' | 'error'

const QR_BOX_SIZE = 340
const REAR_CAMERA_HINTS = ['back', 'rear', 'environment', 'trasera', 'posterior']

function highResolutionConstraints(base: MediaTrackConstraints = {}): MediaTrackConstraints {
  return {
    ...base,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  }
}

function getPreferredCamera(cameras: CameraDevice[]) {
  const labelledRearCamera = cameras.find((camera) => {
    const label = camera.label.toLocaleLowerCase()
    return REAR_CAMERA_HINTS.some((hint) => label.includes(hint))
  })

  return labelledRearCamera ?? cameras.at(-1)
}

async function getCameraTargets(): Promise<MediaTrackConstraints[]> {
  const targets: MediaTrackConstraints[] = []

  try {
    const cameras = await Html5Qrcode.getCameras()
    const preferredCamera = getPreferredCamera(cameras)
    if (preferredCamera) {
      targets.push(highResolutionConstraints({ deviceId: { exact: preferredCamera.id } }))
    }
  } catch {
    // Algunos navegadores solo enumeran dispositivos despues del permiso inicial.
  }

  targets.push(
    highResolutionConstraints({ facingMode: { exact: 'environment' } }),
    highResolutionConstraints({ facingMode: { ideal: 'environment' } }),
    highResolutionConstraints(),
    // Ultimo recurso sin pistas de resolucion: deja que el navegador elija la camara.
    // Brave y algunos Android fallan con constraints especificas pero abren con esto.
    { facingMode: { ideal: 'environment' } },
    {},
  )

  return targets
}

async function detectBrave(): Promise<boolean> {
  const brave = (navigator as Navigator & { brave?: { isBrave: () => Promise<boolean> } }).brave
  try {
    return brave ? await brave.isBrave() : false
  } catch {
    return false
  }
}

export default function QrScanner({ onResult, onClose }: QrScannerProps) {
  const uid = useId().replace(/:/g, '')
  const divId = `qr-reader-${uid}`
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const startedRef = useRef(false)
  const completedRef = useRef(false)
  const [status, setStatus] = useState<ScannerStatus>('starting')
  const [error, setError] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [cameraLabel, setCameraLabel] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const showSecureWarning = typeof window !== 'undefined'
    && !window.isSecureContext
    && window.location.hostname !== 'localhost'
    && window.location.hostname !== '127.0.0.1'

  useEffect(() => {
    let cancelled = false
    completedRef.current = false
    startedRef.current = false
    setStatus('starting')
    setError('')
    setErrorDetail('')
    setCameraLabel('')

    const stopScanner = async () => {
      const scanner = scannerRef.current
      if (!scanner) return
      try {
        if (startedRef.current) await scanner.stop()
      } catch {
        // La camara puede estar ya detenida si el navegador revoca el stream.
      }
      try {
        await scanner.clear()
      } catch {
        // clear falla si no llego a montarse el lector.
      }
      startedRef.current = false
    }

    const startScanner = async () => {
      await stopScanner()
      if (cancelled) return

      const brave = await detectBrave()

      const targets = await getCameraTargets()
      let lastError: unknown

      for (const target of targets) {
        if (cancelled) return

        // Una instancia nueva por intento: en iOS/WebKit, si un start() falla
        // (p.ej. OverconstrainedError con facingMode exact), la maquina de estados
        // interna de html5-qrcode queda bloqueada y el siguiente start() lanza
        // "Cannot transition to a new state, already under transition".
        const scanner = new Html5Qrcode(divId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
          verbose: false,
        })

        try {
          await scanner.start(
            target,
            {
              fps: 15,
              qrbox: (viewfinderWidth, viewfinderHeight) => {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight)
                const size = Math.max(260, Math.min(QR_BOX_SIZE, Math.floor(minEdge * 0.82)))
                return { width: size, height: size }
              },
              aspectRatio: 1,
              disableFlip: false,
            },
            (decoded) => {
              if (completedRef.current) return
              completedRef.current = true
              window.navigator.vibrate?.(80)
              void stopScanner()
              onResult(decoded)
            },
            () => {
              // Los fallos por frame son normales mientras el QR entra en foco.
            },
          )
          scannerRef.current = scanner
          startedRef.current = true
          if (cancelled) {
            await stopScanner()
            return
          }
          const trackSettings = scanner.getRunningTrackSettings() as MediaTrackSettings & { label?: string }
          setCameraLabel(trackSettings.label ?? '')
          setStatus('scanning')
          return
        } catch (err) {
          lastError = err
          // Limpia la instancia fallida para liberar el <video> y el estado interno
          // antes del siguiente intento.
          try {
            await scanner.clear()
          } catch {
            // clear falla si no llego a montarse; no es critico.
          }
          const message = err instanceof Error ? err.message : String(err)
          const lower = message.toLowerCase()
          const permissionBlocked = lower.includes('permission') || lower.includes('notallowed') || lower.includes('denied')
          if (permissionBlocked) break
        }
      }

      {
        if (cancelled) return
        const message = lastError instanceof Error ? lastError.message : String(lastError)
        const name = lastError instanceof Error ? lastError.name : ''
        setErrorDetail(`${name}: ${message}`.replace(/^:\s*/, ''))
        const lower = message.toLowerCase()
        const blocked = lower.includes('permission') || lower.includes('notallowed') || lower.includes('denied')
        setStatus(blocked || showSecureWarning ? 'blocked' : 'error')
        setError(
          showSecureWarning
            ? 'El navegador solo permite usar la cámara en HTTPS o en localhost.'
            : blocked
              ? 'Permite el acceso a la cámara para poder escanear el código.'
              : brave
                ? 'Brave está bloqueando la cámara con sus escudos. Pulsa el icono del león en la barra de direcciones, baja los Brave Shields para este sitio (o desactiva el bloqueo de huella digital) y reintenta.'
                : 'No se pudo abrir una cámara compatible. Comprueba permisos y que ninguna otra aplicación la esté usando.',
        )
      }
    }

    void startScanner()

    return () => {
      cancelled = true
      void stopScanner()
    }
  }, [retryKey])

  const isLoading = status === 'starting'

  return (
    <div className="fixed inset-0 z-[3000] flex items-end bg-slate-950/60 sm:items-center sm:justify-center">
      <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Camera className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Escaner QR</p>
              <p className="truncate text-sm font-semibold text-slate-950">
                {status === 'scanning' ? 'Cámara activa' : 'Cámara lista para escanear'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar escaner"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
          <div className="relative overflow-hidden rounded-xl bg-slate-950">
            <div
              id={divId}
              className="min-h-[380px] w-full [&_video]:min-h-[380px] [&_video]:w-full [&_video]:object-cover"
            />
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 text-white">
                <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
                <p className="text-sm font-medium">Abriendo cámara...</p>
              </div>
            )}
            {status === 'scanning' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[76%] w-[76%] max-w-[340px] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(15,23,42,0.28)]" />
              </div>
            )}
          </div>

          <div className="mt-3 text-center text-sm text-slate-600" aria-live="polite">
            <p>Acerca el código al recuadro y mantén el móvil estable hasta que vibre o se cierre el lector.</p>
            {cameraLabel && <p className="mt-1 text-xs text-slate-400">{cameraLabel}</p>}
          </div>

          {(status === 'blocked' || status === 'error') && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <div className="flex gap-2">
                <CameraOff className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p>{error}</p>
                  {errorDetail && (
                    <p className="mt-1 break-words font-mono text-xs text-amber-700/80">{errorDetail}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setRetryKey((current) => current + 1)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reintentar cámara
          </button>
        </div>
      </div>
    </div>
  )
}
