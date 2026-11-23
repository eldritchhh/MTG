import type { Debt, Deck, Game, Loan, Player, TableName, Tables, Tier } from './types'

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
  const loan = (n: number, a: string, b: string, cards: string, status: Loan['status'], notes: string | null = null, d = n): Loan => ({
    id: uid(700 + n), lender_id: P[a], borrower_id: P[b], cards, status, notes, created_at: iso(d),
  })
  const loans = [
    loan(1, 'Francesco', 'Luca', 'Cyclonic Rift\nSmothering Tithe\nRhystic Study', 'prestito', 'per il torneo di sabato'),
    loan(2, 'Giulia', 'Sara', 'Doubling Season', 'prestito'),
    loan(3, 'Marco', 'Francesco', 'Craterhoof Behemoth', 'definitivo', 'scambiata con Teferi'),
    loan(4, 'Luca', 'Marco', "Skullclamp\nAshnod's Altar", 'restituito', null, 12),
  ]
  return { players, decks, games, debts, loans, tiers }
}
