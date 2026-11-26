import { describe, expect, it } from 'vitest'
import { groupTotal, payerIncluded, splitEqual } from '../lib/money'
import { netBalances, settlements } from '../lib/util'
import type { Debt } from '../lib/types'

const debt = (p: Partial<Debt>): Debt => ({
  id: crypto.randomUUID(), debtor_id: 'a', creditor_id: 'b', amount: 1, description: '', settled: false, group_id: null, group_total: null,
  created_at: '2026-11-26T10:00:00Z', ...p,
})

describe('splitEqual', () => {
  it('divide senza perdere centesimi, quelli in più ai primi', () => {
    expect(splitEqual(10, 3)).toEqual([3.34, 3.33, 3.33])
    expect(splitEqual(14, 7)).toEqual([2, 2, 2, 2, 2, 2, 2])
  })
  it('la somma è sempre il totale', () => {
    for (const [tot, n] of [[0.01, 3], [99.99, 7], [123.45, 4]] as const) {
      const parts = splitEqual(tot, n)
      expect(Math.round(parts.reduce((s, x) => s + x, 0) * 100)).toBe(Math.round(tot * 100))
    }
  })
})

describe('spese divise', () => {
  it('chi ha pagato è incluso se il totale supera la somma delle quote', () => {
    const rows = [debt({ amount: 2, group_total: 6 }), debt({ debtor_id: 'c', amount: 2, group_total: 6 })]
    expect(groupTotal(rows)).toBe(6)
    expect(payerIncluded(rows)).toBe(true)
  })
  it('regalo: chi ha pagato non è incluso', () => {
    const rows = [debt({ amount: 3, group_total: 6 }), debt({ debtor_id: 'c', amount: 3, group_total: 6 })]
    expect(payerIncluded(rows)).toBe(false)
  })
  it('vecchie righe senza totale: il totale è la somma', () => {
    expect(groupTotal([debt({ amount: 4 })])).toBe(4)
  })
})

describe('saldi', () => {
  it('ignora i debiti saldati e somma per persona', () => {
    const bal = netBalances([debt({ amount: 5 }), debt({ amount: 2, settled: true }), debt({ debtor_id: 'b', creditor_id: 'c', amount: 3 })])
    expect(bal).toEqual({ a: -5, b: 2, c: 3 })
  })
  it('come pareggiare: pochi pagamenti che azzerano tutti', () => {
    const bal = { a: -5, b: 2, c: 3 }
    const plan = settlements(bal)
    const after = { ...bal }
    for (const p of plan) {
      after[p.from as keyof typeof after] += p.amount
      after[p.to as keyof typeof after] -= p.amount
    }
    expect(Object.values(after).every((v) => Math.abs(v) < 0.005)).toBe(true)
    expect(plan.length).toBeLessThanOrEqual(2)
  })
})
