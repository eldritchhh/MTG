import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyOps, type Op } from '../lib/ops'
import { approx } from '../lib/cards'
import { dateIt, dayIt, onDate, sinceIt } from '../lib/util'
import { expPct, pct, score, type Row } from '../lib/stats'

describe('applyOps (aggiornamento ottimistico)', () => {
  it('inserisce, aggiorna ed elimina in ordine', () => {
    const data = { debts: [{ id: '1', amount: 1 }], games: [] as { id: string }[] }
    const ops: Op[] = [
      { op: 'insert', table: 'debts', row: { id: '2', amount: 2 } },
      { op: 'update', table: 'debts', id: '2', patch: { amount: 3 } },
      { op: 'delete', table: 'debts', id: '1' },
    ]
    expect(applyOps(data, ops)).toEqual({ debts: [{ id: '2', amount: 3 }], games: [] })
    expect(data.debts).toEqual([{ id: '1', amount: 1 }]) // non tocca l'originale
  })
  it('reinserire la stessa riga la sostituisce (eventi del tempo reale)', () => {
    const out = applyOps({ debts: [{ id: '1', amount: 1 }] }, [{ op: 'insert', table: 'debts', row: { id: '1', amount: 9 } }])
    expect(out.debts).toEqual([{ id: '1', amount: 9 }])
  })
})

describe('prezzi', () => {
  it('"prezzo n/d" solo se nessuna carta ha un prezzo', () => {
    expect(approx({ cents: 0, missing: 2 })).toBe('prezzo n/d')
    expect(approx({ cents: 0, missing: 0 })).toMatch(/^~0,00/)
    expect(approx({ cents: 1250, missing: 1 })).toMatch(/^~12,50/)
  })
})

describe('date', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 26, 18, 0))
  })
  afterEach(() => vi.useRealTimers())
  it('oggi, ieri, poi la data senza anno', () => {
    expect(dayIt(new Date(2026, 10, 26, 9).toISOString())).toBe('oggi')
    expect(dayIt(new Date(2026, 10, 25, 23).toISOString())).toBe('ieri')
    expect(dayIt(new Date(2026, 10, 20).toISOString())).toBe('20 nov')
    expect(dateIt(new Date(2025, 11, 3).toISOString())).toBe('3 dic 2025')
  })
  it('preposizioni con elisione', () => {
    expect(onDate('dal', new Date(2026, 10, 8).toISOString())).toBe("dall'8 nov")
    expect(onDate('al', new Date(2026, 10, 11).toISOString())).toBe("all'11 nov")
    expect(onDate('del', new Date(2026, 10, 1).toISOString())).toBe('del 1 nov')
    expect(sinceIt(new Date(2026, 10, 26).toISOString())).toBe('da oggi')
    expect(sinceIt(new Date(2026, 10, 20).toISOString())).toBe('dal 20 nov')
  })
})

describe('statistiche', () => {
  const row = (games: number, wins: number, exp = games / 4): Row => ({ key: '', games, wins, exp })
  it('percentuali e atteso', () => {
    expect(pct(row(5, 3))).toBe(60)
    expect(expPct(row(4, 1))).toBe(25)
  })
  it('1 vittoria su 1 non batte 6 su 10 in 4 giocatori', () => {
    expect(score(row(10, 6))).toBeGreaterThan(score(row(1, 1)))
  })
  it("chi vince quanto l'atteso ha rendimento zero", () => {
    expect(score(row(8, 2))).toBe(0)
  })
})
