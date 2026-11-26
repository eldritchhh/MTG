// Classifiche delle statistiche, senza interfaccia (così si possono provare con i test)

// exp = vittorie attese: in una partita a N giocatori ognuno vince "di base" 1 volta su N
export type Row = { key: string; games: number; wins: number; exp: number }
export const pct = (r: Row) => (r.games ? Math.round((r.wins / r.games) * 100) : 0)
export const expPct = (r: Row) => (r.games ? Math.round((r.exp / r.games) * 100) : 0)
// rendimento: vittorie in più (o in meno) rispetto all'atteso, pesate sul numero di partite
// (+3 al denominatore: con poche partite il risultato conta meno, così 1 su 1 non batte 6 su 10)
export const score = (r: Row) => (r.wins - r.exp) / (r.games + 3)
