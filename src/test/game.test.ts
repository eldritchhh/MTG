import { describe, expect, it } from 'vitest'
import { changeSeat, commanderDamage, isDead, nextTurn, swapSeats, type Live, type Seat } from '../lib/game'

const seat = (id: string, p: Partial<Seat> = {}): Seat => ({ player_id: id, deck_id: null, life: 40, poison: 0, cmd: {}, eliminated_order: null, ...p })
const game = (n = 4, p: Partial<Live> = {}): Live => ({ startedAt: '2026-11-26T20:00:00Z', startingLife: 40, seats: Array.from({ length: n }, (_, i) => seat(`p${i}`)), ...p })

describe('eliminazione', () => {
  it('vita a zero, 10 veleni o 21 da uno stesso comandante', () => {
    expect(isDead(seat('a', { life: 0 }))).toBe(true)
    expect(isDead(seat('a', { poison: 10 }))).toBe(true)
    expect(isDead(seat('a', { cmd: { '1': 21 } }))).toBe(true)
    // con il partner i due comandanti contano a parte
    expect(isDead(seat('a', { cmd: { '1': 11, '1p': 10 } }))).toBe(false)
  })
  it("tiene l'ordine di eliminazione e lo toglie a chi torna in vita", () => {
    let g = changeSeat(game(), 2, (s) => ({ ...s, life: 0 }))
    g = changeSeat(g, 0, (s) => ({ ...s, poison: 10 }))
    expect(g.seats.map((s) => s.eliminated_order)).toEqual([2, null, 1, null])
    g = changeSeat(g, 2, (s) => ({ ...s, life: 5 }))
    expect(g.seats[2].eliminated_order).toBeNull()
  })
})

describe('danni da comandante', () => {
  it('contano a parte e tolgono vita, mai sotto zero', () => {
    let g = commanderDamage(game(), 0, '1', 7)
    expect(g.seats[0].cmd['1']).toBe(7)
    expect(g.seats[0].life).toBe(33)
    g = commanderDamage(g, 0, '1', -10)
    expect(g.seats[0].cmd['1']).toBe(0)
    expect(g.seats[0].life).toBe(40)
  })
  it('21 da uno stesso comandante elimina', () => {
    const g = commanderDamage(game(), 3, '0p', 21)
    expect(g.seats[3].eliminated_order).toBe(1)
  })
})

describe('scambio dei posti', () => {
  it('rimappa danni da comandante, turno, monarca e iniziativa', () => {
    let g = game(4, { turn: { seat: 1, n: 2, first: 0 }, monarch: 1, initiative: 3 })
    g = commanderDamage(g, 2, '1', 5)
    g = commanderDamage(g, 2, '1p', 3)
    const s = swapSeats(g, 1, 3)
    expect(s.seats[1].player_id).toBe('p3')
    expect(s.seats[3].player_id).toBe('p1')
    // i danni del comandante che era al posto 1 ora vengono dal posto 3
    expect(s.seats[2].cmd).toEqual({ '3': 5, '3p': 3 })
    expect(s.turn).toEqual({ seat: 3, n: 2, first: 0 })
    expect(s.monarch).toBe(3)
    expect(s.initiative).toBe(1)
  })
  it('lo stesso posto non cambia niente', () => {
    const g = game()
    expect(swapSeats(g, 2, 2)).toBe(g)
  })
})

describe('turni', () => {
  it('passa in senso orario e conta i giri da chi ha iniziato', () => {
    let g = game(3, { turn: { seat: 1, n: 1, first: 1 }, storm: 4 })
    g = nextTurn(g)
    expect(g.turn).toEqual({ seat: 2, n: 1, first: 1 })
    expect(g.storm).toBe(0)
    g = nextTurn(nextTurn(g))
    expect(g.turn).toEqual({ seat: 1, n: 2, first: 1 })
  })
  it('salta chi è eliminato (e il giro aumenta anche se chi ha iniziato è fuori)', () => {
    let g = game(3, { turn: { seat: 2, n: 1, first: 0 } })
    g = changeSeat(g, 0, (s) => ({ ...s, life: 0 }))
    g = nextTurn(g)
    expect(g.turn).toEqual({ seat: 1, n: 2, first: 0 })
  })
  it('senza turni non fa niente', () => {
    const g = game()
    expect(nextTurn(g)).toBe(g)
  })
})
