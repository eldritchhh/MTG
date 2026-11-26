// Schermo sempre acceso durante la partita: nell'app con il plugin nativo (KeepAwake),
// nel browser con la Screen Wake Lock API (va richiesta di nuovo quando la pagina torna visibile)
import { Capacitor, registerPlugin } from '@capacitor/core'
import { useEffect } from 'react'
import { prefs } from './prefs'

const Native = registerPlugin<{ keepAwake(): Promise<void>; allowSleep(): Promise<void> }>('KeepAwake')

export function useKeepAwake(on: boolean) {
  useEffect(() => {
    if (!on || !prefs.keepAwake) return
    if (Capacitor.isPluginAvailable('KeepAwake')) {
      Native.keepAwake().catch(() => {})
      return () => void Native.allowSleep().catch(() => {})
    }
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let done = false
    const acquire = async () => {
      if (done || document.visibilityState !== 'visible') return
      try {
        lock = await navigator.wakeLock.request('screen')
        if (done) lock.release().catch(() => {})
      } catch {
        /* non concesso (batteria scarica, browser) */
      }
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      done = true
      document.removeEventListener('visibilitychange', acquire)
      lock?.release().catch(() => {})
    }
  }, [on])
}
