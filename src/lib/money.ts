// Conti delle spese, senza interfaccia (così si possono provare con i test)
import type { Debt } from './types'

// totale della spesa (inclusa la quota di chi ha pagato, che non è una riga)
export const groupTotal = (rows: Debt[]) => rows[0].group_total ?? rows.reduce((s, r) => s + r.amount, 0)
// chi ha pagato è nella divisione se il totale supera la somma delle quote degli altri
export const payerIncluded = (rows: Debt[]) => Math.abs(groupTotal(rows) - rows.reduce((s, r) => s + r.amount, 0)) > 0.004

// divide in centesimi senza perdere arrotondamenti (i centesimi in più vanno ai primi)
export function splitEqual(total: number, n: number) {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  return Array.from({ length: n }, (_, i) => (base + (i < cents - base * n ? 1 : 0)) / 100)
}
