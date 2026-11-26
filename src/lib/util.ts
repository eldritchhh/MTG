import type { Debt, Deck, Player } from './types'

export const eur = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

// "4", "4,5", "4.50", "1.234,50": virgola o punto; vuoto o non valido = 0
export function parseEur(s: string) {
  let t = s.replace(/[\s€]/g, '')
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

export const centsToInput = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','))

export const dateIt = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })

export const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, r])) as Record<string, T>

export const playerName = (players: Record<string, Player>, id: string | null | undefined) =>
  (id && players[id]?.name) || '—'

// si può scegliere in partita: non ritirato e non nascosto in questo gruppo
export const playable = (d: Deck) => d.active && !d.hidden
export const deckLabel = (d: Deck | undefined) => (d ? (d.partner ? `${d.commander} + ${d.partner}` : d.commander) : '—')

export const PLAYER_COLORS = ['#e05252', '#4f8cf0', '#45b26b', '#c9a227', '#a35ee0', '#e0843a', '#3ab8c4', '#e05ea8']

// Saldo netto per giocatore: positivo = deve ricevere, negativo = deve dare
export function netBalances(debts: Debt[]) {
  const bal: Record<string, number> = {}
  for (const d of debts) {
    if (d.settled) continue
    bal[d.creditor_id] = (bal[d.creditor_id] ?? 0) + d.amount
    bal[d.debtor_id] = (bal[d.debtor_id] ?? 0) - d.amount
  }
  return bal
}

// Pareggi minimi stile Tricount: chi deve dare quanto a chi
export function settlements(bal: Record<string, number>) {
  const cents = Object.entries(bal).map(([id, v]) => ({ id, v: Math.round(v * 100) }))
  const cred = cents.filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
  const debt = cents.filter((x) => x.v < 0).map((x) => ({ ...x, v: -x.v })).sort((a, b) => b.v - a.v)
  const out: { from: string; to: string; amount: number }[] = []
  let i = 0
  let j = 0
  while (i < debt.length && j < cred.length) {
    const m = Math.min(debt[i].v, cred[j].v)
    if (m > 0) out.push({ from: debt[i].id, to: cred[j].id, amount: m / 100 })
    debt[i].v -= m
    cred[j].v -= m
    if (debt[i].v === 0) i++
    if (cred[j].v === 0) j++
  }
  return out
}
