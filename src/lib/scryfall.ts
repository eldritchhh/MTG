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
  while (url) {
    const r: Response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!r.ok) throw new Error(`Scryfall ha risposto ${r.status}. Riprova tra qualche minuto.`)
    const j: { data: Raw[]; has_more: boolean; next_page?: string; total_cards: number } = await r.json()
    out.push(...j.data.map(toCommander))
    onProgress?.(out.length, j.total_cards)
    url = j.has_more && j.next_page ? j.next_page : null
    if (url) await new Promise((res) => setTimeout(res, 120)) // Scryfall chiede max ~10 richieste al secondo
  }
  saveCommanderList(out)
  return out.length
}

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
  const r = await fetch(`${API}?q=${encodeURIComponent(`${q} ${QUERY}${extra}`)}&order=edhrec`, { signal: opts.signal, headers: { Accept: 'application/json' } })
  if (!r.ok) return [] // 404 = nessun risultato
  const j: { data: Raw[] } = await r.json()
  return j.data.slice(0, 8).map(toCommander)
}
