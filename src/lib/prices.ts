// Valore delle carte: prezzo Cardmarket (EUR) da Scryfall, il più basso tra le edizioni.
// Cache condivisa su Supabase (tabella card_prices) valida 24 ore: un prezzo lo scarica uno per tutti.
// Scryfall aggiorna i prezzi una volta al giorno; le ricerche rispettano il limite di 2 al secondo.
import { supabase } from './supabase'
import { englishName, searchFetch } from './scryfall'

export type Price = { cents: number | null; at: string } // cents null = senza prezzo
const TTL = 24 * 3600 * 1000
export const STALE = 48 * 3600 * 1000 // oltre: "prezzi non aggiornati"

const mem = new Map<string, Price>() // chiave: nome inglese in minuscolo
const key = (en: string) => en.toLowerCase()
const LOCAL = 'mtg:card-prices' // senza Supabase (modalità locale) la cache sta sul dispositivo

function readLocal(): Record<string, Price> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) ?? '{}')
  } catch {
    return {}
  }
}

// prezzi già noti (memoria, poi database o dispositivo) per i nomi dati
export async function loadPrices(names: string[]): Promise<Map<string, Price>> {
  const uniq = [...new Set(names)]
  const ens = await Promise.all(uniq.map(englishName))
  const missing = [...new Set(ens.map(key))].filter((k) => !mem.has(k))
  if (missing.length) {
    if (supabase) {
      for (let i = 0; i < missing.length; i += 100) {
        const { data } = await supabase.from('card_prices').select('name, eur_cents, fetched_at').in('name', missing.slice(i, i + 100))
        for (const r of data ?? []) mem.set(r.name as string, { cents: r.eur_cents as number | null, at: r.fetched_at as string })
      }
    } else {
      const local = readLocal()
      for (const k of missing) if (local[k]) mem.set(k, local[k])
    }
  }
  // risultato indicizzato con i nomi così come sono scritti nelle righe
  const out = new Map<string, Price>()
  uniq.forEach((n, i) => {
    const p = mem.get(key(ens[i]))
    if (p) out.set(n, p)
  })
  return out
}

// prezzo più basso tra le edizioni cartacee (null se Scryfall non ne ha)
async function fetchPrice(en: string): Promise<number | null> {
  const q = `!"${en.replace(/"/g, '')}" game:paper`
  const r = await searchFetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=eur&dir=asc`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`Scryfall ha risposto ${r.status}`)
  const j: { data: { prices?: { eur?: string | null } }[] } = await r.json()
  const eur = j.data.map((c) => Number(c.prices?.eur)).filter((x) => x > 0)
  return eur.length ? Math.round(Math.min(...eur) * 100) : null
}

// aggiorna i prezzi mancanti o più vecchi di 24 ore (al massimo `max` alla volta: 2 al secondo)
export async function refreshPrices(names: string[], max = 30): Promise<number> {
  const ens = [...new Set(await Promise.all([...new Set(names)].map(englishName)))]
  await loadPrices(ens)
  const now = Date.now()
  const todo = ens.filter((en) => {
    const p = mem.get(key(en))
    return !p || now - new Date(p.at).getTime() > TTL
  })
  let done = 0
  for (const en of todo.slice(0, max)) {
    let cents: number | null
    try {
      cents = await fetchPrice(en)
    } catch {
      break // offline o Scryfall ci sta limitando: riprovo la prossima volta
    }
    const p: Price = { cents, at: new Date().toISOString() }
    mem.set(key(en), p)
    if (supabase) await supabase.from('card_prices').upsert({ name: key(en), eur_cents: cents, fetched_at: p.at })
    else {
      const local = readLocal()
      local[key(en)] = p
      try {
        localStorage.setItem(LOCAL, JSON.stringify(local))
      } catch {
        /* storage pieno */
      }
    }
    done++
  }
  return done
}

// prezzo di una carta per il modulo di nuovo scambio (dalla cache, altrimenti subito da Scryfall)
export async function priceNow(name: string): Promise<Price | null> {
  const en = await englishName(name)
  await refreshPrices([en], 1)
  return mem.get(key(en)) ?? null
}

export const priceOf = (name: string, prices: Map<string, Price>) => prices.get(name) ?? null

export function eurCents(cents: number | null | undefined) {
  if (cents == null) return 'senza prezzo'
  return (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}
