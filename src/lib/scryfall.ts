// Scryfall (API gratuita): ricerca dei soli comandanti e lista scaricabile per usarla offline
export type Commander = {
  name: string
  colors: string[]
  art: string | null // illustrazione della carta (art crop)
  pair: boolean // può affiancare un altro comandante (partner, background, friends forever…)
}

const QUERY = '(is:commander or t:background) game:paper'
const API = 'https://api.scryfall.com/cards/search'
const LIST_KEY = 'mtg:commanders'

// Scryfall: /cards/search al massimo 2 richieste al secondo; un 429 blocca l'accesso per 30 secondi.
// Tutte le ricerche passano da qui e partono a distanza di almeno SEARCH_GAP ms l'una dall'altra.
const SEARCH_GAP = 550
let nextSearchAt = 0

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

async function searchFetch(url: string, signal?: AbortSignal) {
  const now = Date.now()
  const at = Math.max(now, nextSearchAt)
  nextSearchAt = at + SEARCH_GAP
  await sleep(at - now, signal)
  return fetch(url, { signal, headers: { Accept: 'application/json' } })
}

type Raw = {
  name: string
  color_identity?: string[]
  type_line?: string
  keywords?: string[]
  oracle_text?: string
  image_uris?: { art_crop?: string }
  card_faces?: { image_uris?: { art_crop?: string }; oracle_text?: string }[]
}

function toCommander(c: Raw): Commander {
  const text = [c.oracle_text, ...(c.card_faces ?? []).map((f) => f.oracle_text)].join(' ')
  const kw = (c.keywords ?? []).map((k) => k.toLowerCase())
  const pair =
    kw.some((k) => k.startsWith('partner') || k === 'friends forever' || k === "doctor's companion") ||
    /choose a background/i.test(text) ||
    /\bbackground\b/i.test(c.type_line ?? '')
  return {
    name: c.name,
    colors: 'WUBRG'.split('').filter((x) => (c.color_identity ?? []).includes(x)),
    art: c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop ?? null,
    pair,
  }
}

// ---------- lista salvata sul dispositivo ----------
type Stored = { updated: string; cards: [string, string, string | null, 0 | 1][] }
let cache: { updated: string; cards: Commander[] } | null | undefined

export function getCommanderList() {
  if (cache !== undefined) return cache
  try {
    const raw = localStorage.getItem(LIST_KEY)
    const s: Stored | null = raw ? JSON.parse(raw) : null
    cache = s ? { updated: s.updated, cards: s.cards.map(([name, c, art, p]) => ({ name, colors: c.split(''), art, pair: p === 1 })) } : null
  } catch {
    cache = null
  }
  return cache
}

function saveCommanderList(cards: Commander[]) {
  const updated = new Date().toISOString()
  cache = { updated, cards }
  const s: Stored = { updated, cards: cards.map((c) => [c.name, c.colors.join(''), c.art, c.pair ? 1 : 0]) }
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(s))
  } catch {
    /* storage pieno o bloccato: la lista resta in memoria finché la pagina è aperta */
  }
}

export async function downloadCommanderList(onProgress?: (done: number, total: number) => void): Promise<number> {
  let url: string | null = `${API}?q=${encodeURIComponent(QUERY)}&unique=cards&order=edhrec`
  const out: Commander[] = []
  let retries = 0
  while (url) {
    let r: Response | null = null
    try {
      r = await searchFetch(url)
    } catch {
      r = null // rete assente, oppure un 429 senza intestazioni CORS che il browser riporta come errore di rete
    }
    if (!r || r.status === 429) {
      // Scryfall ci ha rallentato: aspetto che scada il blocco (30 s) e riprovo la stessa pagina
      if (++retries > 2) throw new Error('Scryfall non risponde o ci sta limitando. Riprova tra qualche minuto.')
      await sleep(31000)
      continue
    }
    if (!r.ok) throw new Error(`Scryfall ha risposto ${r.status}. Riprova tra qualche minuto.`)
    retries = 0
    const j: { data: Raw[]; has_more: boolean; next_page?: string; total_cards: number } = await r.json()
    out.push(...j.data.map(toCommander))
    onProgress?.(out.length, j.total_cards)
    url = j.has_more && j.next_page ? j.next_page : null
  }
  saveCommanderList(out)
  return out.length
}

// ---------- tutte le carte (solo nomi inglesi, ~35.000 / ~700 KB) per scambi e prestiti ----------
const NAMES_KEY = 'mtg:cardnames'
let namesCache: { updated: string; names: string[] } | null | undefined
let normNames: { src: string[]; norm: string[] } | null = null // nomi normalizzati, calcolati alla prima ricerca

export function getCardNames() {
  if (namesCache !== undefined) return namesCache
  try {
    const raw = localStorage.getItem(NAMES_KEY)
    namesCache = raw ? JSON.parse(raw) : null
  } catch {
    namesCache = null
  }
  return namesCache ?? null
}

export async function downloadCardNames(): Promise<number> {
  const r = await fetch('https://api.scryfall.com/catalog/card-names', { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`Scryfall ha risposto ${r.status}. Riprova tra qualche minuto.`)
  const j: { data: string[] } = await r.json()
  namesCache = { updated: new Date().toISOString(), names: j.data }
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(namesCache))
  } catch {
    /* storage pieno o bloccato: la lista resta in memoria finché l'app è aperta */
  }
  return j.data.length
}

export type CardHit = { name: string; printed?: string } // name = nome inglese, printed = nome italiano

// Nomi inglesi (lista offline, altrimenti autocomplete online) + nomi italiani (sempre online, se c'è rete)
export async function searchCards(q: string, signal?: AbortSignal): Promise<CardHit[]> {
  const query = norm(q).trim()
  if (query.length < 2) return []
  const list = getCardNames()
  const english = (async (): Promise<CardHit[]> => {
    if (list) {
      if (normNames?.src !== list.names) normNames = { src: list.names, norm: list.names.map(norm) }
      const words = query.split(/\s+/)
      const out: { name: string; score: number }[] = []
      normNames.norm.forEach((n, i) => {
        if (!words.every((w) => n.includes(w))) return
        // prima chi inizia con il testo, poi chi ha una parola che inizia con il testo (es. "bolt" → Lightning Bolt)
        out.push({ name: list.names[i], score: n.startsWith(query) ? 0 : n.includes(` ${words[0]}`) ? 1 : 2 })
      })
      return out
        .sort((a, b) => a.score - b.score || a.name.length - b.name.length)
        .slice(0, 8)
        .map(({ name }) => ({ name }))
    }
    const r = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`, { signal, headers: { Accept: 'application/json' } })
    if (!r.ok) return []
    const j: { data: string[] } = await r.json()
    return j.data.map((name) => ({ name }))
  })()
  const italian = (async (): Promise<CardHit[]> => {
    if (query.length < 3) return []
    const r = await searchFetch(`${API}?q=${encodeURIComponent(`${q} lang:it`)}&unique=cards&order=edhrec`, signal)
    if (!r.ok) return [] // 404 = nessun risultato
    const j: { data: { name: string; printed_name?: string }[] } = await r.json()
    return j.data.slice(0, 20).map((c) => ({ name: c.name, printed: c.printed_name }))
  })()
  const [en, it] = await Promise.allSettled([english, italian])
  const hits = [...(en.status === 'fulfilled' ? en.value : []), ...(it.status === 'fulfilled' ? it.value : [])].filter(
    (h) => !/^(.+) \/\/ \1$/.test(h.name), // carte "art series" tipo "Sol Ring // Sol Ring"
  )
  // un risultato per carta (vince quello con il nome italiano); prima chi inizia con il testo cercato
  const byName = new Map<string, CardHit>()
  for (const h of hits) if (!byName.get(h.name)?.printed) byName.set(h.name, h)
  const starts = (h: CardHit) => norm(h.name).startsWith(query) || (!!h.printed && norm(h.printed).startsWith(query))
  const all = [...byName.values()]
  return [...all.filter(starts), ...all.filter((h) => !starts(h))].slice(0, 8)
}

// riga di una lista incollata ("2x Sol Ring (C21) 263 *F*") → quantità e nome
export function parseCardLine(line: string): { qty: number; name: string } {
  const m = line.trim().match(/^(\d+)\s*x?\s+(.*)$/i)
  const qty = m ? Number(m[1]) : 1
  const name = (m ? m[2] : line.trim())
    .replace(/\s+\*[^*]*\*\s*$/, '') // *F* foil
    .replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+[\w-]+)?\s*$/, '') // (SET) numero
    .trim()
  return { qty, name }
}

export const formatCardLine = (qty: number, name: string) => (qty > 1 ? `${qty} ${name}` : name)

// pagina Scryfall della carta (ricerca per nome esatto: se il nome è giusto apre direttamente la carta)
export const scryfallUrl = (name: string) => `https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}`

// ---------- ricerca ----------
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')

export async function searchCommanders(q: string, opts: { pairOnly?: boolean; signal?: AbortSignal } = {}): Promise<Commander[]> {
  const query = norm(q).trim()
  if (query.length < 2) return []
  const list = getCommanderList()
  if (list) {
    const words = query.split(/\s+/)
    const hits = list.cards.filter((c) => (!opts.pairOnly || c.pair) && words.every((w) => norm(c.name).includes(w)))
    // prima chi inizia con il testo cercato, poi per popolarità (la lista è in ordine EDHREC)
    return [...hits.filter((c) => norm(c.name).startsWith(query)), ...hits.filter((c) => !norm(c.name).startsWith(query))].slice(0, 8)
  }
  // nessuna lista scaricata: cerco online
  const extra = opts.pairOnly ? ' (keyword:partner or t:background or o:"choose a background" or keyword:"friends forever")' : ''
  const r = await searchFetch(`${API}?q=${encodeURIComponent(`${q} ${QUERY}${extra}`)}&order=edhrec`, opts.signal)
  if (!r.ok) return [] // 404 = nessun risultato
  const j: { data: Raw[] } = await r.json()
  return j.data.slice(0, 8).map(toCommander)
}
