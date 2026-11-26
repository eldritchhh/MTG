import { supabase } from './supabase'
import type { TableName, Tables } from './types'
import type { Op } from './ops'

export interface Backend {
  list<T extends TableName>(t: T, podId?: string | null): Promise<Tables[T][]>
  insert<T extends TableName>(t: T, row: Tables[T]): Promise<void>
  // podId: un mazzo personale compare in più gruppi; tier e "nascosto" valgono solo per quello aperto
  update<T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>, podId?: string | null): Promise<void>
  remove(t: TableName, id: string, podId?: string | null): Promise<void>
  batch(ops: Op[]): Promise<void> // tutte o nessuna
}

// i mazzi si leggono e scrivono dalla vista pod_decks (supabase/decks.sql): giocatore e tier già del gruppo
const src = (t: TableName) => (t === 'decks' ? 'pod_decks' : t)

// ---------- Supabase (cloud, sincronizzato) ----------
const cloud: Backend = {
  async list(t, podId) {
    // solo il gruppo aperto (le regole del database comunque non mostrano gruppi di cui non si fa parte)
    let q = supabase!.from(src(t)).select('*')
    if (podId) q = q.eq('pod_id', podId)
    const { data, error } = await q.order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map((r) => normalize(t, r)) as never
  },
  async insert(t, row) {
    const { owner_user: _o, ...r } = row as Record<string, unknown>
    const { error } = await supabase!.from(src(t)).insert((t === 'decks' ? r : row) as never)
    if (error) throw error
  },
  async update(t, id, patch, podId) {
    let q = supabase!.from(src(t)).update(patch as never).eq('id', id)
    if (t === 'decks' && podId) q = q.eq('pod_id', podId)
    const { error } = await q
    if (error) throw error
  },
  async remove(t, id, podId) {
    let q = supabase!.from(src(t)).delete().eq('id', id)
    if (t === 'decks' && podId) q = q.eq('pod_id', podId)
    const { error } = await q
    if (error) throw error
  },
  async batch(ops) {
    const { error } = await supabase!.rpc('apply_ops', { ops })
    if (!error) return
    // database senza supabase/ops.sql (funzione non trovata): una scrittura alla volta, come prima
    if (error.code === 'PGRST202') return sequential(this, ops)
    throw error
  },
}

async function sequential(b: Backend, ops: Op[]) {
  for (const o of ops) {
    if (o.op === 'insert') await b.insert(o.table, o.row as never)
    else if (o.op === 'update') await b.update(o.table, o.id, o.patch as never)
    else await b.remove(o.table, o.id)
  }
}

// Postgres numeric arriva come stringa
export function normalize(t: TableName, r: Record<string, unknown>) {
  if (t === 'debts') return { ...r, amount: Number(r.amount), group_total: r.group_total == null ? null : Number(r.group_total) }
  return r
}

// ---------- localStorage (solo questo dispositivo) ----------
// se il browser blocca lo storage (navigazione privata, anteprime) i dati restano in memoria
const k = (t: TableName) => `mtg:${t}`
const mem: Record<string, string> = {}
const read = (t: TableName) => {
  let raw: string | null = mem[k(t)] ?? null
  try {
    raw = localStorage.getItem(k(t)) ?? raw
  } catch {
    /* storage non disponibile */
  }
  try {
    return JSON.parse(raw ?? '[]')
  } catch {
    return []
  }
}
const write = (t: TableName, rows: unknown[]) => {
  mem[k(t)] = JSON.stringify(rows)
  try {
    localStorage.setItem(k(t), mem[k(t)])
  } catch {
    /* storage non disponibile */
  }
}
export const resetLocal = (data: Partial<Record<TableName, unknown[]>>) => {
  for (const [t, rows] of Object.entries(data)) write(t as TableName, rows ?? [])
}

const local: Backend = {
  async list(t) {
    return read(t)
  },
  async insert(t, row) {
    write(t, [...read(t), row])
  },
  async update(t, id, patch) {
    write(t, read(t).map((r: { id: string }) => (r.id === id ? { ...r, ...patch } : r)))
  },
  async remove(t, id) {
    write(t, read(t).filter((r: { id: string }) => r.id !== id))
  },
  async batch(ops) {
    return sequential(this, ops)
  },
}

export const backend: Backend = supabase ? cloud : local
