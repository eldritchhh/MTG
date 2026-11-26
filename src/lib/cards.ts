// Conto carte tra due persone (spec Parte 2):
// - ogni carta presa è una riga "open": NON è un debito e non entra mai nei saldi in soldi
// - si chiude restituendola (returned) o saldandola (settled, dentro un Settlement)
// - valore: le righe aperte mostrano il prezzo di oggi; al saldo il valore si congela
import type { CardLoan } from './types'
import type { Price } from './prices'

export const isOpen = (l: CardLoan) => l.status === 'open'

// carte di `owner` che ha `holder` (aperte)
export const held = (owner: string, holder: string, loans: CardLoan[]) =>
  loans.filter((l) => isOpen(l) && l.owner_player === owner && l.holder_player === holder)

// valore di oggi di una riga (null = senza prezzo)
export function valueNow(l: Pick<CardLoan, 'name' | 'quantity'>, prices: Map<string, Price>) {
  const p = prices.get(l.name)
  return p?.cents == null ? null : p.cents * l.quantity
}

// somma con conteggio delle carte senza prezzo (escluse dai totali, mai 0 €)
export function sum(values: (number | null)[]) {
  return { cents: values.reduce<number>((s, v) => s + (v ?? 0), 0), missing: values.filter((v) => v == null).length }
}

export const copies = (ls: CardLoan[]) => ls.reduce((s, l) => s + l.quantity, 0)

// conti aperti di `me` con ogni altro giocatore
export function accounts(me: string, loans: CardLoan[]) {
  const others = new Set<string>()
  for (const l of loans) {
    if (!isOpen(l)) continue
    if (l.holder_player === me) others.add(l.owner_player)
    if (l.owner_player === me) others.add(l.holder_player)
  }
  return [...others].map((other) => ({ other, theirs: held(other, me, loans), mine: held(me, other, loans) }))
}

// righe aggiunte dall'altra persona dopo l'ultima volta che ho aperto il conto (badge "nuove")
const seenKey = (me: string, other: string) => `mtg:conto-visto:${me}:${other}`
export function markSeen(me: string, other: string) {
  try {
    localStorage.setItem(seenKey(me, other), new Date().toISOString())
  } catch {
    /* storage non disponibile */
  }
}
export function newCount(me: string, other: string, myUser: string | null, loans: CardLoan[]) {
  if (!myUser) return 0
  let seen = ''
  try {
    seen = localStorage.getItem(seenKey(me, other)) ?? ''
  } catch {
    /* storage non disponibile */
  }
  return loans.filter(
    (l) => isOpen(l) && l.added_by && l.added_by !== myUser && l.added_at > seen &&
      ((l.owner_player === me && l.holder_player === other) || (l.owner_player === other && l.holder_player === me)),
  ).length
}
