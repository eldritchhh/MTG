// Service worker della versione web (GitHub Pages): l'app si apre anche senza rete.
// Pagina: prima la rete (così si aggiorna), poi la copia salvata. File con l'hash nel nome, icone e liste
// di carte: dalla copia salvata, aggiornata in background. Supabase e Scryfall non passano di qui.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `mtg-${VERSION}`

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  // via le copie delle versioni precedenti
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('mtg-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./').then((r) => r || Response.error())),
    )
    return
  }

  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req)
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) c.put(req, res.clone())
          return res
        })
        .catch(() => hit)
      return hit || fresh
    }),
  )
})
