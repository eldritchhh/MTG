export type Player = { id: string; name: string; color: string; created_at: string }

export type Tier = { id: string; name: string; color: string; sort_order: number; created_at: string }

export type Deck = {
  id: string
  player_id: string
  commander: string
  partner: string | null
  colors: string[]
  tags: string[]
  image_url: string | null
  notes: string | null
  tier_id: string | null
  active: boolean
  created_at: string
}

export type Debt = {
  id: string
  debtor_id: string
  creditor_id: string
  amount: number
  description: string
  settled: boolean
  group_id: string | null // spese divise tra più persone: stesse righe, stesso group_id
  group_total: number | null // totale della spesa (inclusa la quota di chi ha pagato)
  created_at: string
}

export type LoanStatus = 'prestito' | 'definitivo' | 'restituito'
export type Loan = {
  id: string
  lender_id: string
  borrower_id: string
  cards: string
  status: LoanStatus
  notes: string | null
  created_at: string
}

export type Participant = {
  player_id: string
  deck_id: string | null
  final_life: number
  eliminated_order: number | null
  tier_id?: string | null // tier del mazzo al momento della partita
}

export type Game = {
  id: string
  played_at: string
  starting_life: number
  winner_player_id: string | null
  participants: Participant[]
  duration_min: number | null
  notes: string | null
  created_at: string
}

export type Tables = {
  players: Player
  decks: Deck
  debts: Debt
  loans: Loan
  games: Game
  tiers: Tier
}
export type TableName = keyof Tables
export const TABLES: TableName[] = ['players', 'tiers', 'decks', 'debts', 'loans', 'games'] // in ordine di dipendenza (import backup)
