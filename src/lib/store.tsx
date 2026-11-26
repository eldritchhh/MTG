import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { backend, normalize, resetLocal } from './backend'
import { applyOps, type Op } from './ops'
import { defaultTiers, demoData } from './demo'
import { isCloud } from './supabase'
import { supabase } from './supabase'
import { TABLES, type TableName, type Tables } from './types'
import { usePod } from './pod'

type Data = { [T in TableName]: Tables[T][] }
type NewRow<T extends TableName> = Omit<Tables[T], 'id' | 'created_at' | 'pod_id'> & Partial<Pick<Tables[T], 'id' | 'created_at'>>

type Store = Data & {
  loading: boolean
  error: string | null
  isDemo: boolean
  loadDemo(): Promise<void>
  clearAll(): Promise<void>
  add<T extends TableName>(t: T, row: NewRow<T>): Promise<Tables[T]>
  update<T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>): Promise<void>
  remove(t: TableName, id: string): Promise<void>
  // più scritture insieme (tutte o nessuna): build le prepara con tx.add / tx.update / tx.remove
  batch(build: (tx: Tx) => void): Promise<void>
  reload(): Promise<void>
}

export type Tx = {
  add<T extends TableName>(t: T, row: NewRow<T>): Tables[T]
  update<T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>): void
  remove(t: TableName, id: string): void
}

// le scritture lanciano l'errore (dopo averlo mostrato e aver ricaricato i dati):
// chi chiama può tenere aperto il modulo, proporre "Riprova", non cancellare la partita…
const REALTIME_TABLES = TABLES.filter((t) => t !== 'decks') // i mazzi passano dalla vista pod_decks: si ricaricano
const STALE_MS = 60_000 // riaprendo l'app dopo più di un minuto ricarico tutto (il tempo reale può aver perso qualcosa)

const DEMO_VERSION = '4' // 4: prestiti diventano il conto carte
const empty: Data = { players: [], decks: [], debts: [], loans: [], games: [], tiers: [], card_loans: [], settlements: [], settlement_items: [] }
const Ctx = createContext<Store | null>(null)

// podId: gruppo aperto (con Supabase); in modalità locale null
export function StoreProvider({ podId = null, children }: { podId?: string | null; children: ReactNode }) {
  const [data, setData] = useState<Data>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTable = useCallback(
    async (t: TableName) => {
      const rows = await backend.list(t, podId)
      setData((d) => ({ ...d, [t]: rows }))
    },
    [podId],
  )

  const [isDemo, setIsDemo] = useState(() => !!getFlag('mtg:demo') && getFlag('mtg:demo') !== '0')

  const reload = useCallback(async () => {
    try {
      // versione dimostrativa: al primo avvio carico i dati di esempio
      // (se i dati di esempio sono di una versione precedente li rigenero)
      const flag = getFlag('mtg:demo')
      if (!isCloud && import.meta.env.VITE_DEMO === '1' && (!flag || (flag !== '0' && flag !== DEMO_VERSION))) {
        const demo = demoData()
        resetLocal(demo)
        setFlag('mtg:demo', DEMO_VERSION)
        setFlag('mtg:me', demo.players[0].id)
        setIsDemo(true)
      }
      const all = await Promise.all(TABLES.map((t) => backend.list(t, podId)))
      setData(Object.fromEntries(TABLES.map((t, i) => [t, all[i]])) as Data)
      setError(null)
    } catch (e) {
      setError(msg(e))
    } finally {
      setLoading(false)
    }
  }, [podId])

  useEffect(() => {
    reload()
    let hiddenAt = 0
    const onFocus = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > STALE_MS) reload()
    }
    document.addEventListener('visibilitychange', onFocus)
    // tempo reale: applico la riga cambiata (solo del gruppo aperto) invece di ricaricare la tabella
    const upsert = (t: TableName, row: Record<string, unknown>) =>
      setData((d) => ({ ...d, [t]: applyOps(d, [{ op: 'insert', table: t, row: normalize(t, row) as never }])[t] }))
    let ch = supabase?.channel(`db-changes-${podId ?? 'local'}`)
    if (ch && podId) {
      for (const t of REALTIME_TABLES) {
        const filter = `pod_id=eq.${podId}`
        ch = ch
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: t, filter }, (p) => upsert(t, p.new))
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: t, filter }, (p) => upsert(t, p.new))
          // le eliminazioni non si possono filtrare: arriva solo l'id, se non è tra le mie righe non cambia niente
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: t }, (p) => {
            const id = (p.old as { id?: string }).id
            if (id) setData((d) => ({ ...d, [t]: (d[t] as { id: string }[]).filter((r) => r.id !== id) }))
          })
      }
      // mazzi: personali (senza gruppo) e tier per gruppo (deck_pod) → ricarico la vista
      ch = ch
        .on('postgres_changes', { event: '*', schema: 'public', table: 'decks' }, () => void loadTable('decks').catch(() => {}))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'deck_pod', filter: `pod_id=eq.${podId}` }, () => void loadTable('decks').catch(() => {}))
    }
    ch?.subscribe()
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      if (ch) supabase?.removeChannel(ch)
    }
  }, [reload, loadTable, podId])

  const fail = useCallback(
    (e: unknown) => {
      setError(msg(e))
      reload()
    },
    [reload],
  )

  // riga completa: id e data se mancano, gruppo aperto
  const fullRow = useCallback(
    <T extends TableName>(_t: T, row: NewRow<T>) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row, ...(podId ? { pod_id: podId } : {}) }) as Tables[T],
    [podId],
  )

  const store = useMemo<Store>(
    () => ({
      ...data,
      loading,
      error,
      reload,
      isDemo,
      async loadDemo() {
        const demo = demoData()
        resetLocal(demo)
        setFlag('mtg:me', demo.players[0].id)
        setFlag('mtg:demo', DEMO_VERSION)
        setIsDemo(true)
        await reload()
      },
      async clearAll() {
        resetLocal({ players: [], decks: [], debts: [], loans: [], games: [], tiers: defaultTiers(), card_loans: [], settlements: [], settlement_items: [] })
        setFlag('mtg:demo', '0')
        setFlag('mtg:me', null)
        setFlag('mtg:live', null)
        setIsDemo(false)
        await reload()
      },
      async add(t, row) {
        const full = fullRow(t, row)
        setData((d) => ({ ...d, [t]: [...d[t], full] }))
        try {
          await backend.insert(t, full)
        } catch (e) {
          fail(e)
          throw e
        }
        return full
      },
      async update(t, id, patch) {
        setData((d) => ({ ...d, [t]: (d[t] as { id: string }[]).map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
        try {
          await backend.update(t, id, patch, podId)
        } catch (e) {
          fail(e)
          throw e
        }
      },
      async remove(t, id) {
        setData((d) => ({ ...d, [t]: (d[t] as { id: string }[]).filter((r) => r.id !== id) }))
        try {
          await backend.remove(t, id, podId)
        } catch (e) {
          fail(e)
          throw e
        }
      },
      async batch(build) {
        const ops: Op[] = []
        build({
          add(t, row) {
            if (t === 'decks') throw new Error('i mazzi non passano da batch')
            const full = fullRow(t, row)
            ops.push({ op: 'insert', table: t, row: full as never })
            return full
          },
          update: (t, id, patch) => void ops.push({ op: 'update', table: t, id, patch }),
          remove: (t, id) => void ops.push({ op: 'delete', table: t, id }),
        })
        if (!ops.length) return
        setData((d) => applyOps(d, ops))
        try {
          await backend.batch(ops)
        } catch (e) {
          fail(e)
          throw e
        }
      },
    }),
    [data, loading, error, reload, fail, isDemo, podId, fullRow],
  )

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider mancante')
  return s
}

function getFlag(k: string) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function setFlag(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

function msg(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

// "Chi sei?": con i gruppi è il giocatore collegato al tuo account; in modalità locale lo scegli sul dispositivo
export function useMe(): [string | null, (id: string | null) => void] {
  const pod = usePod()
  const [me, setMe] = useState<string | null>(() => {
    try {
      return localStorage.getItem('mtg:me')
    } catch {
      return null
    }
  })
  if (pod) return [pod.current?.player_id ?? null, () => {}]
  return [
    me,
    (id) => {
      setMe(id)
      try {
        if (id) localStorage.setItem('mtg:me', id)
        else localStorage.removeItem('mtg:me')
      } catch {
        /* ignore */
      }
    },
  ]
}
