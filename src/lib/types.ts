// pod_id: gruppo a cui appartiene la riga (solo con Supabase; in modalità locale manca)
// archived: giocatore "eliminato" (non compare nelle liste, ma partite, debiti e scambi restano)
export type Player = { id: string; pod_id?: string; name: string; color: string; archived?: boolean; created_at: string }

export type Tier = { id: string; pod_id?: string; name: string; color: string; sort_order: number; created_at: string }

export type Deck = {
  id: string
  pod_id?: string
  player_id: string
  commander: string
  partner: string | null
  colors: string[]
  tags: string[]
  image_url: string | null
  partner_image_url: string | null // illustrazione del partner/background: la card mostra metà e metà
  notes: string | null
  tier_id: string | null
  active: boolean
  created_at: string
}

export type Debt = {
  id: string
  pod_id?: string
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
  pod_id?: string
  lender_id: string
  borrower_id: string
  cards: string
  status: LoanStatus
  notes: string | null
  created_at: string
}

// Scambio tra due giocatori: righe di carte (stato per riga) e di soldi
export type Trade = {
  id: string
  pod_id?: string
  player_a: string
  player_b: string
  note: string | null
  created_at: string
}

export type LineStatus = 'loan' | 'permanent' | 'returned' | 'lost'
export type TradeLine = {
  id: string
  pod_id?: string
  trade_id: string
  from_player: string
  to_player: string
  kind: 'card' | 'money'
  status: LineStatus | null // solo carte
  name: string | null // solo carte (nome inglese o come scritto)
  quantity: number
  value_cents: number | null // valore unitario concordato (snapshot); null = senza prezzo
  value_source: 'scryfall' | 'manual' | 'none' | null
  valued_at: string | null
  returned_at: string | null
  amount_cents: number | null // solo soldi: from_player deve dare (o ha dato) a to_player
  counts_in_balance: boolean // soldi che entrano nei saldi "chi deve a chi"
  settled: boolean // saldato con "Pagato"
  linked_line_id: string | null
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
  pod_id?: string
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
  trades: Trade
  trade_lines: TradeLine
}
export type TableName = keyof Tables
// in ordine di dipendenza (import backup). "loans" resta solo per i backup vecchi: i prestiti ora sono trades
export const TABLES: TableName[] = ['players', 'tiers', 'decks', 'debts', 'loans', 'games', 'trades', 'trade_lines']
