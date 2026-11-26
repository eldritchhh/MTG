// Calcoli degli scambi (spec Parte 2 §13):
// - saldi in soldi = spese divise + righe soldi "da saldare" (counts_in_balance) non ancora saldate
// - il valore delle carte NON entra nei saldi (solo se l'utente aggiunge la differenza come riga soldi)
// - carte in prestito: valore attuale; scambi definitivi e gap: valore concordato (snapshot)
import type { Debt, LineStatus, Trade, TradeLine } from './types'
import type { Price } from './prices'
import { netBalances } from './util'

export const STATUS_LABEL: Record<LineStatus, string> = { loan: 'In prestito', permanent: 'Definitiva', returned: 'Restituita', lost: 'Persa' }

const openMoney = (l: TradeLine) => l.kind === 'money' && l.counts_in_balance && !l.settled

// saldo per giocatore (euro): positivo = deve ricevere
export function balances(debts: Debt[], lines: TradeLine[]) {
  const bal = netBalances(debts)
  for (const l of lines) {
    if (!openMoney(l)) continue
    bal[l.to_player] = (bal[l.to_player] ?? 0) + l.amount_cents! / 100
    bal[l.from_player] = (bal[l.from_player] ?? 0) - l.amount_cents! / 100
  }
  return bal
}

// soldi tra due persone (euro): positivo = other deve a me
export function pairMoney(me: string, other: string, debts: Debt[], lines: TradeLine[]) {
  let v = 0
  for (const d of debts) {
    if (d.settled) continue
    if (d.debtor_id === other && d.creditor_id === me) v += d.amount
    if (d.debtor_id === me && d.creditor_id === other) v -= d.amount
  }
  for (const l of lines) {
    if (!openMoney(l)) continue
    if (l.from_player === other && l.to_player === me) v += l.amount_cents! / 100
    if (l.from_player === me && l.to_player === other) v -= l.amount_cents! / 100
  }
  return Math.round(v * 100) / 100
}

// debiti e righe soldi aperti tra due persone (per "Pagato" / "Pareggia")
export function openBetween(a: string, b: string, debts: Debt[], lines: TradeLine[]) {
  const pair = (x: string, y: string) => (x === a && y === b) || (x === b && y === a)
  return {
    debts: debts.filter((d) => !d.settled && pair(d.debtor_id, d.creditor_id)),
    lines: lines.filter((l) => openMoney(l) && pair(l.from_player, l.to_player)),
  }
}

// carte di `owner` in prestito a `holder`
export const loanedCards = (owner: string, holder: string, lines: TradeLine[]) =>
  lines.filter((l) => l.kind === 'card' && l.status === 'loan' && l.from_player === owner && l.to_player === holder)

// valore attuale di una riga carta (prezzo di oggi; se manca, il valore concordato)
export function currentValue(l: TradeLine, prices: Map<string, Price>) {
  const p = l.name ? prices.get(l.name) : undefined
  const unit = l.value_source === 'manual' ? l.value_cents : (p?.cents ?? l.value_cents)
  return unit == null ? null : unit * l.quantity
}

export const snapshotValue = (l: TradeLine) => (l.value_cents == null ? null : l.value_cents * l.quantity)

// somma con conteggio delle carte senza prezzo (mai 0 €)
export function sumValues(values: (number | null)[]) {
  return { cents: values.reduce<number>((s, v) => s + (v ?? 0), 0), missing: values.filter((v) => v == null).length }
}

// Gap negli scambi definitivi tra a e b (spec §13.5): carte definitive a→b − b→a (valore concordato)
// + soldi dati nello scambio che non sono già nei saldi. Positivo = a ha dato di più.
export function gap(a: string, b: string, lines: TradeLine[]) {
  let aGave = 0
  let bGave = 0
  let missing = 0
  for (const l of lines) {
    const ab = l.from_player === a && l.to_player === b
    const ba = l.from_player === b && l.to_player === a
    if (!ab && !ba) continue
    let v: number | null = null
    if (l.kind === 'card' && l.status === 'permanent') {
      v = snapshotValue(l)
      if (v == null) {
        missing++
        continue
      }
    } else if (l.kind === 'money' && !l.counts_in_balance) v = l.amount_cents
    if (v == null) continue
    if (ab) aGave += v
    else bGave += v
  }
  return { aGave, bGave, diff: aGave - bGave, missing }
}

// stato riassuntivo di uno scambio per la lista
export function tradeState(lines: TradeLine[]): { label: string; cls: string; open: boolean } {
  const cards = lines.filter((l) => l.kind === 'card')
  const money = lines.filter((l) => l.kind === 'money' && l.counts_in_balance)
  if (cards.some((l) => l.status === 'loan')) return { label: 'In prestito', cls: 'st-loan', open: true }
  if (money.some((l) => !l.settled)) return { label: 'Da saldare', cls: 'st-loan', open: true }
  if (cards.length && cards.every((l) => l.status === 'returned')) return { label: 'Restituito', cls: 'st-back', open: false }
  if (cards.some((l) => l.status === 'permanent' || l.status === 'lost')) return { label: 'Definitivo', cls: 'st-final', open: false }
  return { label: 'Saldato', cls: 'st-back', open: false }
}

// riassunto delle carte "Sol Ring, Arcane Signet +3"
export function cardSummary(lines: TradeLine[], max = 2) {
  const names = lines.filter((l) => l.kind === 'card').map((l) => (l.quantity > 1 ? `${l.quantity}× ${l.name}` : l.name!))
  return names.slice(0, max).join(', ') + (names.length > max ? ` +${names.length - max}` : '')
}

export const linesOf = (t: Trade, lines: TradeLine[]) => lines.filter((l) => l.trade_id === t.id)
