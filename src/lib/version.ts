// Versione dell'app (es. "MTGUtils-12", la stessa della Release su GitHub) e controllo di una versione più nuova.
// Le due variabili le imposta il workflow dell'APK; in sviluppo mancano e il controllo non parte.
// L'app guarda solo le release del suo canale (il nome prima del numero, es. "MTGUtils-").
export const APP_VERSION = import.meta.env.VITE_APP_VERSION as string | undefined
const REPO = import.meta.env.VITE_GITHUB_REPO as string | undefined
const PREFIX = APP_VERSION?.replace(/\d+$/, '') ?? 'MTGUtils-'

export type Release = { tag: string; page: string; apk: string | null }
type Cache = { at: number; release: Release | null }
type GhRelease = { tag_name: string; html_url: string; draft?: boolean; assets?: { name: string; browser_download_url: string }[] }

const KEY = `mtg:latest-release:${PREFIX}`
const EVERY = 12 * 3600 * 1000 // GitHub senza login concede 60 richieste l'ora: basta un controllo ogni 12 ore
const num = (tag?: string) => Number(tag?.match(/(\d+)$/)?.[1] ?? 0)

export const isNewer = (r: Release | null) => !!r && !!APP_VERSION && r.tag.startsWith(PREFIX) && num(r.tag) > num(APP_VERSION)

// Ultima Release del mio canale (dalla cache se recente, a meno di force)
export async function latestRelease(force = false): Promise<Release | null> {
  if (!APP_VERSION || !REPO) return null
  let cache: Cache | null = null
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    /* storage non disponibile */
  }
  if (!force && cache && Date.now() - cache.at < EVERY) return cache.release
  // "releases/latest" esclude le pre-release: le prendo tutte e scelgo il numero più alto del mio canale
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!r.ok) throw new Error(`GitHub ha risposto ${r.status}`)
  const all: GhRelease[] = await r.json()
  const best = all.filter((x) => !x.draft && x.tag_name.startsWith(PREFIX)).sort((a, b) => num(b.tag_name) - num(a.tag_name))[0]
  const release: Release | null = best
    ? { tag: best.tag_name, page: best.html_url, apk: best.assets?.find((a) => a.name.endsWith('.apk'))?.browser_download_url ?? null }
    : null
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), release } satisfies Cache))
  } catch {
    /* storage non disponibile */
  }
  return release
}
