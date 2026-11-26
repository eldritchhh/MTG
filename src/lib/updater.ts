// Aggiornamento dall'app (plugin nativo plugins/apk-updater): scarica l'APK e apre l'installer di Android.
// Nel browser o nelle versioni dell'app senza plugin resta il link di download.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { useState } from 'react'

type ApkUpdater = {
  install(o: { url: string }): Promise<void>
  addListener(ev: 'progress', cb: (e: { percent: number }) => void): Promise<PluginListenerHandle>
}
const plugin = registerPlugin<ApkUpdater>('ApkUpdater')

export const canSelfUpdate = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('ApkUpdater')

// stato del download per il bottone "Aggiorna"
export function useSelfUpdate() {
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function run(url: string) {
    setError(null)
    setPercent(0)
    const h = await plugin.addListener('progress', (e) => setPercent(e.percent))
    try {
      await plugin.install({ url })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      await h.remove()
      setPercent(null)
    }
  }
  return { run, percent, error, busy: percent !== null }
}
