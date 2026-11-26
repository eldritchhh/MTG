import type { CardLoan, Debt, Deck, Game, Loan, Player, Settlement, SettlementItem, TableName, Tables, Tier } from './types'

export function defaultTiers(ids?: string[]): Tier[] {
  const now = new Date().toISOString()
  return (
    [
      ['S', '#e05252'],
      ['1', '#c9a227'],
      ['2', '#4f8cf0'],
    ] as const
  ).map(([name, color], i) => ({ id: ids?.[i] ?? crypto.randomUUID(), name, color, sort_order: i, created_at: now }))
}

// Dati di esempio (date relative ad oggi) per provare l'app
export function demoData(): { [T in TableName]: Tables[T][] } {
  const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const now = Date.now()
  const iso = (d: number) => new Date(now - d * 86400000).toISOString()
  const players: Player[] = (
    [
      ['Francesco', '#e05252'],
      ['Luca', '#4f8cf0'],
      ['Marco', '#45b26b'],
      ['Giulia', '#c9a227'],
      ['Sara', '#a35ee0'],
    ] as const
  ).map(([name, color], i) => ({ id: uid(i + 1), name, color, created_at: iso(60) }))
  const P = Object.fromEntries(players.map((p) => [p.name, p.id]))
  const tiers = defaultTiers([uid(901), uid(902), uid(903)])
  const T = { S: uid(901), '1': uid(902), '2': uid(903) } as const
  const dk = (n: number, owner: string, commander: string, colors: string[], tags: string[], tier: keyof typeof T, partner: string | null = null): Deck => ({
    id: uid(100 + n), player_id: P[owner], commander, partner, colors, tags, image_url: null, partner_image_url: null, notes: null, tier_id: T[tier], active: true, created_at: iso(50),
  })
  const decks = [
    dk(1, 'Francesco', "Atraxa, Praetors' Voice", ['W', 'U', 'B', 'G'], ['superfriends', 'control'], 'S'),
    dk(2, 'Francesco', "Yuriko, the Tiger's Shadow", ['U', 'B'], ['ninja', 'tempo'], '1'),
    dk(3, 'Luca', 'Krenko, Mob Boss', ['R'], ['goblin', 'aggro', 'tribale'], '1'),
    dk(4, 'Luca', 'Kenrith, the Returned King', ['W', 'U', 'B', 'R', 'G'], ['politica'], '2'),
    dk(5, 'Marco', 'Meren of Clan Nel Toth', ['B', 'G'], ['aristocrats', 'grind'], '1'),
    dk(6, 'Giulia', 'Edgar Markov', ['W', 'B', 'R'], ['vampiri', 'aggro', 'tribale'], 'S'),
    dk(7, 'Giulia', 'Lathril, Blade of the Elves', ['B', 'G'], ['elfi', 'tribale'], '2'),
    dk(8, 'Sara', 'Talrand, Sky Summoner', ['U'], ['spellslinger', 'budget'], '2'),
    dk(9, 'Sara', 'Kodama of the East Tree', ['G', 'R'], ['landfall'], '1', 'Prava of the Steel Legion'),
  ]
  const g = (n: number, daysAgo: number, seats: [string, number][], w: number, dur: number): Game => ({
    id: uid(300 + n), played_at: iso(daysAgo), created_at: iso(daysAgo), starting_life: 40, duration_min: dur,
    notes: n === 1 ? 'Atraxa ha chiuso con 7 planeswalker in campo' : null,
    winner_player_id: P[seats[w][0]],
    participants: seats.map(([pl, d], i) => ({
      player_id: P[pl], deck_id: uid(100 + d), final_life: i === w ? 18 + i : 0, eliminated_order: i === w ? null : i + 1,
      tier_id: decks.find((x) => x.id === uid(100 + d))?.tier_id ?? null,
    })),
  })
  const games = [
    g(1, 1, [['Francesco', 1], ['Luca', 3], ['Marco', 5], ['Giulia', 6]], 0, 94),
    g(2, 3, [['Francesco', 2], ['Luca', 3], ['Sara', 8], ['Giulia', 6]], 1, 62),
    g(3, 6, [['Francesco', 1], ['Marco', 5], ['Sara', 9]], 1, 81),
    g(4, 8, [['Luca', 4], ['Marco', 5], ['Giulia', 7], ['Sara', 8]], 2, 110),
    g(5, 10, [['Francesco', 1], ['Luca', 3], ['Giulia', 6], ['Sara', 9]], 0, 75),
    g(6, 14, [['Francesco', 2], ['Marco', 5], ['Giulia', 6]], 2, 58),
    g(7, 17, [['Luca', 3], ['Marco', 5], ['Sara', 8], ['Francesco', 1]], 3, 88),
    g(8, 21, [['Giulia', 7], ['Luca', 4], ['Marco', 5], ['Sara', 9]], 2, 120),
    g(9, 25, [['Francesco', 1], ['Luca', 3], ['Marco', 5], ['Giulia', 6]], 1, 49),
    g(10, 28, [['Sara', 8], ['Giulia', 6], ['Francesco', 2]], 1, 66),
  ]
  const debt = (n: number, a: string, b: string, amount: number, description: string, settled = false, d = n, group: [string, number] | null = null): Debt => ({
    id: uid(500 + n), debtor_id: P[a], creditor_id: P[b], amount, description, settled, created_at: iso(d), group_id: group?.[0] ?? null, group_total: group?.[1] ?? null,
  })
  const ct0: [string, number] = [uid(599), 14]
  const debts = [
    debt(1, 'Luca', 'Francesco', 4, 'Sol Ring + Arcane Signet'),
    debt(2, 'Marco', 'Francesco', 12.5, 'Bustine Foundations'),
    debt(3, 'Francesco', 'Giulia', 7, 'Pizza serata commander'),
    debt(4, 'Sara', 'Luca', 3, 'Sleeves'),
    debt(5, 'Giulia', 'Marco', 20, 'Dockside (vecchia storia)', true, 30),
    debt(6, 'Luca', 'Francesco', 3.5, 'Spedizione ordine CT0', false, 2, ct0),
    debt(7, 'Marco', 'Francesco', 3.5, 'Spedizione ordine CT0', true, 2, ct0),
    debt(8, 'Giulia', 'Francesco', 3.5, 'Spedizione ordine CT0', false, 2, ct0),
  ]
  // conto carte: carte di `owner` che ha `holder` (aperte, restituite, saldate)
  let n = 0
  const cl = (owner: string, holder: string, name: string, d: number, extra: Partial<CardLoan> = {}): CardLoan => ({
    id: uid(800 + ++n), owner_player: P[owner], holder_player: P[holder], name, quantity: 1, note: null, added_at: iso(d), added_by: null,
    status: 'open', closed_at: null, settlement_id: null, created_at: iso(d), ...extra,
  })
  const settlement: Settlement = {
    id: uid(790), player_a: P['Francesco'], player_b: P['Marco'], note: 'Craterhoof per Teferi', difference_cents: 0, difference_resolution: 'accepted', created_at: iso(8),
  }
  const card_loans = [
    cl('Francesco', 'Luca', 'Cyclonic Rift', 6, { note: 'per il torneo di sabato' }),
    cl('Francesco', 'Luca', 'Smothering Tithe', 6),
    cl('Francesco', 'Luca', 'Rhystic Study', 3),
    cl('Luca', 'Francesco', 'Swords to Plowshares', 2, { quantity: 2 }),
    cl('Giulia', 'Sara', 'Doubling Season', 7),
    cl('Marco', 'Francesco', 'Craterhoof Behemoth', 12, { status: 'settled', closed_at: iso(8), settlement_id: settlement.id }),
    cl('Francesco', 'Marco', 'Teferi, Time Raveler', 12, { status: 'settled', closed_at: iso(8), settlement_id: settlement.id }),
    cl('Luca', 'Marco', 'Skullclamp', 12, { status: 'returned', closed_at: iso(5) }),
  ]
  const item = (k: number, extra: Partial<SettlementItem>): SettlementItem => ({
    id: uid(780 + k), settlement_id: settlement.id, kind: 'kept', loan_id: null, from_player: P['Marco'], to_player: P['Francesco'], name: null, quantity: 1,
    value_cents: null, value_source: 'scryfall', amount_cents: null, mode: null, debt_id: null, created_at: iso(8), ...extra,
  })
  const settlement_items = [
    item(1, { loan_id: card_loans[5].id, name: 'Craterhoof Behemoth', value_cents: 3990 }),
    item(2, { loan_id: card_loans[6].id, name: 'Teferi, Time Raveler', value_cents: 2200, from_player: P['Francesco'], to_player: P['Marco'] }),
    item(3, { kind: 'money', amount_cents: 1790, mode: 'paid_now', value_source: null, from_player: P['Francesco'], to_player: P['Marco'] }),
  ]
  const loans: Loan[] = []
  return { players, decks, games, debts, loans, tiers, card_loans, settlements: [settlement], settlement_items }
}
