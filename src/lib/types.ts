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
  tier_id: string | null // tier nel gruppo aperto (ogni gruppo ha i suoi)
  active: boolean // false = ritirato (vale in tutti i gruppi)
  owner_user?: string | null // mazzo personale: l'account che lo possiede (compare in tutti i suoi gruppi)
  hidden?: boolean // mazzo personale nascosto nel gruppo aperto
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
  settlement_id?: string | null // movimento creato da un saldo carte ("Saldo carte con X")
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

// Conto carte: una carta di `owner_player` che ha `holder_player`. Non è un debito.
export type CardLoanStatus = 'open' | 'returned' | 'settled'
export type CardLoan = {
  id: string
  pod_id?: string
  owner_player: string
  holder_player: string
  name: string // nome della carta (come scritto; il prezzo usa il nome inglese)
  quantity: number
  note: string | null
  added_at: string
  added_by?: string | null // account che l'ha aggiunta (per il badge "nuove")
  status: CardLoanStatus
  closed_at: string | null
  settlement_id: string | null
  created_at: string
}

// Saldo tra due persone: l'unica vera transazione
export type Settlement = {
  id: string
  pod_id?: string
  player_a: string // chi ha fatto il saldo (dal suo punto di vista: "Tieni" / "In cambio dai")
  player_b: string
  note: string | null
  difference_cents: number // valore tenuto da a − valore dato da a
  difference_resolution: 'accepted' | 'money'
  imported?: boolean
  created_by?: string | null
  created_at: string
}

export type SettlementItem = {
  id: string
  pod_id?: string
  settlement_id: string
  kind: 'kept' | 'given' | 'money'
  loan_id: string | null // kept: riga del conto che diventa definitiva
  from_player: string // kept: proprietario; given/money: chi dà
  to_player: string // kept: chi la tiene; given/money: chi riceve
  name: string | null
  quantity: number
  value_cents: number | null // valore unitario congelato al saldo; null = senza prezzo
  value_source: 'scryfall' | 'manual' | 'none' | null
  amount_cents: number | null // soldi
  mode: 'due' | 'paid_now' | null // soldi: da pagare (entra in Soldi) o pagati ora
  debt_id: string | null
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
  card_loans: CardLoan
  settlements: Settlement
  settlement_items: SettlementItem
}
export type TableName = keyof Tables
// in ordine di dipendenza (import backup). "loans" resta solo per i backup vecchi: i prestiti ora sono card_loans
export const TABLES: TableName[] = ['players', 'tiers', 'decks', 'settlements', 'debts', 'loans', 'games', 'card_loans', 'settlement_items']
