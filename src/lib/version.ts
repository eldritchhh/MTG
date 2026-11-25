// Versione dell'app (es. "apk-9", la stessa della Release su GitHub) e controllo di una versione più nuova.
// Le due variabili le imposta il workflow dell'APK; in sviluppo mancano e il controllo non parte.
export const APP_VERSION = import.meta.env.VITE_APP_VERSION as string | undefined
const REPO = import.meta.env.VITE_GITHUB_REPO as string | undefined

export type Release = { tag: string; page: string; apk: string | null }
type Cache = { at: number; release: Release }

const KEY = 'mtg:latest-release'
const EVERY = 12 * 3600 * 1000 // GitHub senza login concede 60 richieste l'ora: basta un controllo ogni 12 ore
const num = (tag?: string) => Number(tag?.match(/(\d+)$/)?.[1] ?? 0)

export const isNewer = (r: Release | null) => !!r && !!APP_VERSION && num(r.tag) > num(APP_VERSION)

// Ultima Release pubblicata (dalla cache se recente, a meno di force)
export async function latestRelease(force = false): Promise<Release | null> {
  if (!APP_VERSION || !REPO) return null
  let cache: Cache | null = null
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    /* storage non disponibile */
  }
  if (!force && cache && Date.now() - cache.at < EVERY) return cache.release
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!r.ok) throw new Error(`GitHub ha risposto ${r.status}`)
  const j: { tag_name: string; html_url: string; assets?: { name: string; browser_download_url: string }[] } = await r.json()
  const release: Release = {
    tag: j.tag_name,
    page: j.html_url,
    apk: j.assets?.find((a) => a.name.endsWith('.apk'))?.browser_download_url ?? null,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), release } satisfies Cache))
  } catch {
    /* storage non disponibile */
  }
  return release
}
