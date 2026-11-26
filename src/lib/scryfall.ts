// Scryfall: liste di comandanti e carte incluse nell'app (ricerca solo offline) + aggiornamento incrementale.
//
// Le basi sono in public/ e si rigenerano dal file "All Cards" di Scryfall con:
//   scripts/build-commanders.py  -> public/commanders.json  ([nome, colori, illustrazione, partner])
//   scripts/build-card-names.py  -> public/cards.json       ([inglese] o [inglese, italiano])
// "Cerca … nuovi" chiede a Scryfall solo le carte uscite dopo l'ultimo aggiornamento e le salva sul dispositivo:
// nessuna carta già presente viene richiesta di nuovo.

export type Commander = {
  name: string
  colors: string[]
  art: string | null // illustrazione della carta (art crop)
  pair: boolean // può affiancare un altro comandante (partner, background, friends forever…)
}

const API = 'https://api.scryfall.com/cards/search'
const today = () => new Date().toISOString().slice(0, 10)

// ---------- Scryfall: /cards/search al massimo 2 richieste al secondo ----------
// Un 429 blocca l'accesso per 30 secondi: le ricerche partono ad almeno SEARCH_GAP ms l'una dall'altra.
const SEARCH_GAP = 550
let nextSearchAt = 0

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function searchFetch(url: string) {
  const now = Date.now()
  const at = Math.max(now, nextSearchAt)
  nextSearchAt = at + SEARCH_GAP
  await sleep(at - now)
  return fetch(url, { headers: { Accept: 'application/json' } })
}

type RawPrint = {
  name: string
  layout?: string
  color_identity?: string[]
  type_line?: string
  keywords?: string[]
  oracle_text?: string
  printed_name?: string
  image_uris?: { art_crop?: string }
  card_faces?: { image_uris?: { art_crop?: string }; oracle_text?: string; printed_name?: string }[]
}
const SKIP_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'reversible_card'])

// tutte le pagine di una ricerca (404 = nessun risultato); se Scryfall ci blocca aspetto 31 s e riprovo
async function searchAllPages(q: string, order = ''): Promise<RawPrint[]> {
  const out: RawPrint[] = []
  let url: string | null = `${API}?q=${encodeURIComponent(q)}&unique=cards${order ? `&order=${order}` : ''}`
  let retries = 0
  while (url) {
    let r: Response | null = null
    try {
      r = await searchFetch(url)
    } catch {
      r = null // rete assente, oppure un 429 senza intestazioni CORS che il browser riporta come errore di rete
    }
    if (!r || r.status === 429) {
      if (++retries > 2) throw new Error('Scryfall non risponde o ci sta limitando. Controlla la connessione e riprova tra qualche minuto.')
      await sleep(31000)
      continue
    }
    if (r.status === 404) break
    if (!r.ok) throw new Error(`Scryfall ha risposto ${r.status}. Riprova tra qualche minuto.`)
    retries = 0
    const j: { data: RawPrint[]; has_more: boolean; next_page?: string } = await r.json()
    // fuori token & co. e le stampe fronte-retro uguali ("Momentary Blink // Momentary Blink")
    out.push(...j.data.filter((c) => !SKIP_LAYOUTS.has(c.layout ?? '') && !/^(.+) \/\/ \1$/.test(c.name)))
    url = j.has_more && j.next_page ? j.next_page : null
  }
  return out
}

// ---------- base inclusa nell'app + novità salvate sul dispositivo ----------
type ListFile<T> = { updated: string; cards: T[] }

function readLocal<T>(key: string): ListFile<T> | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage pieno o bloccato: le novità restano finché l'app è aperta */
  }
}

const fetchBase = <T>(file: string): Promise<ListFile<T>> =>
  fetch(file).then((r) => {
    if (!r.ok) throw new Error('Lista non trovata nell’app')
    return r.json()
  })

// vecchie liste scaricate per intero (prima che le basi fossero nell'app): non servono più
try {
  localStorage.removeItem('mtg:commanders')
  localStorage.removeItem('mtg:cardnames')
} catch {
  /* storage non disponibile */
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')

// punteggio di un nome per la ricerca: identico, poi inizia con il testo, poi una parola inizia con il testo
function scorer(query: string) {
  const words = query.split(/\s+/)
  return (n: string) =>
    !n || !words.every((w) => n.includes(w)) ? 9 : n === query ? -1 : n.startsWith(query) ? 0 : n.includes(` ${words[0]}`) ? 1 : 2
}

// ================================================================ CARTE (nome inglese + italiano)
type CardEntry = [string] | [string, string] // [inglese] oppure [inglese, italiano]
type CardIndex = { updated: string; en: string[]; it: (string | undefined)[]; nen: string[]; nit: string[] }
const CARDS_NEW = 'mtg:cards-new'

let cardsBaseP: Promise<ListFile<CardEntry>> | null = null
let cardIndexP: Promise<CardIndex> | null = null
const loadCardsBase = () => (cardsBaseP ??= fetchBase<CardEntry>('./cards.json'))

function buildCardIndex(base: ListFile<CardEntry>, delta: ListFile<CardEntry> | null): CardIndex {
  const map = new Map<string, string | undefined>(base.cards.map(([en, it]) => [en, it]))
  for (const [en, it] of delta?.cards ?? []) map.set(en, it ?? map.get(en))
  const en = [...map.keys()]
  const it = en.map((n) => map.get(n))
  return { updated: delta?.updated ?? base.updated, en, it, nen: en.map(norm), nit: it.map((x) => (x ? norm(x) : '')) }
}

const loadCardIndex = () =>
  (cardIndexP ??= loadCardsBase()
    .then((b) => buildCardIndex(b, readLocal<CardEntry>(CARDS_NEW)))
    .catch((e) => {
      cardIndexP = cardsBaseP = null
      throw e
    }))

export async function cardListInfo() {
  const ix = await loadCardIndex()
  return { updated: ix.updated, count: ix.en.length, italian: ix.it.filter(Boolean).length }
}

const italianName = (c: RawPrint) => {
  const faces = c.card_faces?.map((f) => f.printed_name)
  return c.printed_name ?? (faces?.length && faces.every(Boolean) ? faces.join(' // ') : undefined)
}

// Solo le stampe uscite dall'ultimo aggiornamento: carte nuove e nuove traduzioni
// (anche di carte vecchie ristampate in italiano). Restituisce quante carte o traduzioni sono state aggiunte.
export async function updateCardList(): Promise<number> {
  const [base, ix] = await Promise.all([loadCardsBase(), loadCardIndex()])
  const english = await searchAllPages(`date>=${ix.updated} game:paper`)
  const italian = await searchAllPages(`lang:it date>=${ix.updated} game:paper`)
  const known = new Map(ix.en.map((n, i) => [n, ix.it[i]]))
  const delta = new Map<string, string | undefined>((readLocal<CardEntry>(CARDS_NEW)?.cards ?? []).map(([en, it]) => [en, it]))
  let added = 0
  for (const c of english) {
    if (known.has(c.name) || delta.has(c.name)) continue
    delta.set(c.name, undefined)
    added++
  }
  for (const c of italian) {
    const it = italianName(c)
    if (!it || (known.get(c.name) ?? delta.get(c.name)) === it) continue
    if (!known.get(c.name) && !delta.get(c.name)) added++
    delta.set(c.name, it)
  }
  const file: ListFile<CardEntry> = { updated: today(), cards: [...delta].map(([en, it]) => (it ? [en, it] : [en])) }
  writeLocal(CARDS_NEW, file)
  cardIndexP = Promise.resolve(buildCardIndex(base, file))
  return added
}

export type CardHit = { name: string; printed?: string } // name = nome inglese, printed = nome italiano

// nome inglese "ufficiale" di una carta scritta in qualsiasi modo ("sol ring", "Nebbia" → "Sol Ring", "Fog")
export async function englishName(name: string): Promise<string> {
  const ix = await loadCardIndex()
  const q = norm(name).trim()
  let i = ix.nen.indexOf(q)
  if (i < 0) i = ix.nit.indexOf(q)
  return i >= 0 ? ix.en[i] : name.trim()
}

// nome italiano di una carta (dalla lista nell'app), se c'è
export async function italianOf(name: string): Promise<string | undefined> {
  const ix = await loadCardIndex()
  const i = ix.en.findIndex((n) => n.toLowerCase() === name.toLowerCase())
  return i >= 0 ? ix.it[i] : undefined
}

// Ricerca offline per nome inglese o italiano
export async function searchCards(q: string): Promise<CardHit[]> {
  const query = norm(q).trim()
  if (query.length < 2) return []
  const ix = await loadCardIndex()
  const score = scorer(query)
  const out: { i: number; s: number; len: number }[] = []
  for (let i = 0; i < ix.en.length; i++) {
    const se = score(ix.nen[i])
    const st = score(ix.nit[i])
    if (se < 9 || st < 9) out.push({ i, s: Math.min(se, st), len: st < se ? ix.nit[i].length : ix.nen[i].length })
  }
  return out
    .sort((a, b) => a.s - b.s || a.len - b.len)
    .slice(0, 8)
    .map(({ i }) => ({ name: ix.en[i], printed: ix.it[i] }))
}

// ================================================================ COMANDANTI
type CmdEntry = [string, string, string | null, 0 | 1] // [nome, colori "WUBRG", illustrazione, partner/background]
type CmdList = { updated: string; cards: Commander[] }
const CMD_NEW = 'mtg:commanders-new'
const CMD_QUERY = '(is:commander or t:background) game:paper'

let cmdBaseP: Promise<ListFile<CmdEntry>> | null = null
let cmdListP: Promise<CmdList> | null = null
const loadCmdBase = () => (cmdBaseP ??= fetchBase<CmdEntry>('./commanders.json'))

const fromEntry = ([name, c, art, p]: CmdEntry): Commander => ({ name, colors: c.split('').filter(Boolean), art, pair: p === 1 })

function buildCmdList(base: ListFile<CmdEntry>, delta: ListFile<CmdEntry> | null): CmdList {
  const names = new Set(base.cards.map((c) => c[0]))
  const extra = (delta?.cards ?? []).filter((c) => !names.has(c[0]))
  return { updated: delta?.updated ?? base.updated, cards: [...base.cards, ...extra].map(fromEntry) }
}

export const loadCommanders = () =>
  (cmdListP ??= loadCmdBase()
    .then((b) => buildCmdList(b, readLocal<CmdEntry>(CMD_NEW)))
    .catch((e) => {
      cmdListP = cmdBaseP = null
      throw e
    }))

function toEntry(c: RawPrint): CmdEntry {
  const text = [c.oracle_text, ...(c.card_faces ?? []).map((f) => f.oracle_text)].join(' ')
  const kw = (c.keywords ?? []).map((k) => k.toLowerCase())
  const pair =
    kw.some((k) => k.startsWith('partner') || k === 'friends forever' || k === "doctor's companion") ||
    /choose a background/i.test(text) ||
    /\bbackground\b/i.test(c.type_line ?? '')
  const colors = 'WUBRG'
    .split('')
    .filter((x) => (c.color_identity ?? []).includes(x))
    .join('')
  return [c.name, colors, c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop ?? null, pair ? 1 : 0]
}

// Solo i comandanti usciti dall'ultimo aggiornamento. Restituisce quanti sono nuovi.
export async function updateCommanderList(): Promise<number> {
  const [base, list] = await Promise.all([loadCmdBase(), loadCommanders()])
  const found = await searchAllPages(`${CMD_QUERY} date>=${list.updated}`, 'edhrec')
  const known = new Set(list.cards.map((c) => c.name))
  const delta = readLocal<CmdEntry>(CMD_NEW)?.cards ?? []
  const fresh = found.filter((c) => !known.has(c.name)).map(toEntry)
  const file: ListFile<CmdEntry> = { updated: today(), cards: [...delta, ...fresh] }
  writeLocal(CMD_NEW, file)
  cmdListP = Promise.resolve(buildCmdList(base, file))
  return fresh.length
}

export async function commanderListInfo() {
  const l = await loadCommanders()
  return { updated: l.updated, count: l.cards.length }
}

// Ricerca offline per nome inglese o italiano (traduzioni dalla lista carte); a parità, i più giocati (ordine EDHREC)
export async function searchCommanders(q: string, opts: { pairOnly?: boolean } = {}): Promise<(Commander & { printed?: string })[]> {
  const query = norm(q).trim()
  if (query.length < 2) return []
  const [list, ix] = await Promise.all([loadCommanders(), loadCardIndex().catch(() => null)])
  const it = ix ? new Map(ix.en.map((n, i) => [n, ix.it[i]])) : new Map<string, string | undefined>()
  const score = scorer(query)
  const out: { c: Commander & { printed?: string }; s: number; pos: number }[] = []
  list.cards.forEach((c, pos) => {
    if (opts.pairOnly && !c.pair) return
    const printed = it.get(c.name)
    const s = Math.min(score(norm(c.name)), score(printed ? norm(printed) : ''))
    if (s < 9) out.push({ c: { ...c, printed }, s, pos })
  })
  return out
    .sort((a, b) => a.s - b.s || a.pos - b.pos)
    .slice(0, 8)
    .map((x) => x.c)
}

// ================================================================ righe di carte e link
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
