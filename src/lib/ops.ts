// Più scritture insieme: o vanno a buon fine tutte o nessuna (sul database: funzione apply_ops, supabase/ops.sql).
// Serve dove un'azione tocca più righe: modifica di una spesa, saldo carte e il suo annullamento, restituzioni…
import type { TableName } from './types'

export type Op =
  | { op: 'insert'; table: TableName; row: Record<string, unknown> & { id: string } }
  | { op: 'update'; table: TableName; id: string; patch: Record<string, unknown> }
  | { op: 'delete'; table: TableName; id: string }

type Rows = Record<string, { id: string }[]>

// applica le operazioni ai dati in memoria (aggiornamento ottimistico); funzione pura
export function applyOps<D extends Rows>(data: D, ops: Op[]): D {
  const out: Rows = { ...data }
  for (const o of ops) {
    const rows = out[o.table] ?? []
    if (o.op === 'insert') out[o.table] = [...rows.filter((r) => r.id !== o.row.id), o.row]
    else if (o.op === 'update') out[o.table] = rows.map((r) => (r.id === o.id ? { ...r, ...o.patch } : r))
    else out[o.table] = rows.filter((r) => r.id !== o.id)
  }
  return out as D
}
