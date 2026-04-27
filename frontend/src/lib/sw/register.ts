import { registerSW as vitePwaRegisterSW } from 'virtual:pwa-register'

export function registerSW() {
  if (!('serviceWorker' in navigator)) return

  vitePwaRegisterSW({
    onNeedRefresh() {
      // Nueva versión disponible — notificar al usuario
      const event = new CustomEvent('sw:update-available')
      window.dispatchEvent(event)
    },
    onOfflineReady() {
      const event = new CustomEvent('sw:offline-ready')
      window.dispatchEvent(event)
    },
  })
}
