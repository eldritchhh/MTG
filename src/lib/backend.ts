import { supabase } from './supabase'
import type { TableName, Tables } from './types'

export interface Backend {
  list<T extends TableName>(t: T, podId?: string | null): Promise<Tables[T][]>
  insert<T extends TableName>(t: T, row: Tables[T]): Promise<void>
  update<T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>): Promise<void>
  remove(t: TableName, id: string): Promise<void>
}

// ---------- Supabase (cloud, sincronizzato) ----------
const cloud: Backend = {
  async list(t, podId) {
    // solo il gruppo aperto (le regole del database comunque non mostrano gruppi di cui non si fa parte)
    let q = supabase!.from(t).select('*')
    if (podId) q = q.eq('pod_id', podId)
    const { data, error } = await q.order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map((r) => normalize(t, r)) as never
  },
  async insert(t, row) {
    const { error } = await supabase!.from(t).insert(row as never)
    if (error) throw error
  },
  async update(t, id, patch) {
    const { error } = await supabase!.from(t).update(patch as never).eq('id', id)
    if (error) throw error
  },
  async remove(t, id) {
    const { error } = await supabase!.from(t).delete().eq('id', id)
    if (error) throw error
  },
}

// Postgres numeric arriva come stringa
function normalize(t: TableName, r: Record<string, unknown>) {
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
}

export const backend: Backend = supabase ? cloud : local
