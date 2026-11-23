import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { backend, resetLocal } from './backend'
import { defaultTiers, demoData } from './demo'
import { isCloud } from './supabase'
import { supabase } from './supabase'
import { TABLES, type TableName, type Tables } from './types'

type Data = { [T in TableName]: Tables[T][] }
type NewRow<T extends TableName> = Omit<Tables[T], 'id' | 'created_at'> & Partial<Pick<Tables[T], 'id' | 'created_at'>>

type Store = Data & {
  loading: boolean
  error: string | null
  isDemo: boolean
  loadDemo(): Promise<void>
  clearAll(): Promise<void>
  add<T extends TableName>(t: T, row: NewRow<T>): Promise<Tables[T]>
  update<T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>): Promise<void>
  remove(t: TableName, id: string): Promise<void>
  reload(): Promise<void>
}

const DEMO_VERSION = '2'
const empty: Data = { players: [], decks: [], debts: [], loans: [], games: [], tiers: [] }
const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTable = useCallback(async (t: TableName) => {
    const rows = await backend.list(t)
    setData((d) => ({ ...d, [t]: rows }))
  }, [])

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
      const all = await Promise.all(TABLES.map((t) => backend.list(t)))
      setData(Object.fromEntries(TABLES.map((t, i) => [t, all[i]])) as Data)
      setError(null)
    } catch (e) {
      setError(msg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    const onFocus = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onFocus)
    // realtime: quando un amico modifica qualcosa, ricarico quella tabella
    const ch = supabase
      ?.channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, (p) => {
        if (TABLES.includes(p.table as TableName)) loadTable(p.table as TableName).catch(() => {})
      })
      .subscribe()
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      if (ch) supabase?.removeChannel(ch)
    }
  }, [reload, loadTable])

  const fail = useCallback(
    (e: unknown) => {
      setError(msg(e))
      reload()
    },
    [reload],
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
        resetLocal({ players: [], decks: [], debts: [], loans: [], games: [], tiers: defaultTiers() })
        setFlag('mtg:demo', '0')
        setFlag('mtg:me', null)
        setFlag('mtg:live', null)
        setIsDemo(false)
        await reload()
      },
      async add(t, row) {
        const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row } as Tables[typeof t]
        setData((d) => ({ ...d, [t]: [...d[t], full] }))
        try {
          await backend.insert(t, full)
        } catch (e) {
          fail(e)
        }
        return full
      },
      async update(t, id, patch) {
        setData((d) => ({ ...d, [t]: (d[t] as { id: string }[]).map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
        try {
          await backend.update(t, id, patch)
        } catch (e) {
          fail(e)
        }
      },
      async remove(t, id) {
        setData((d) => ({ ...d, [t]: (d[t] as { id: string }[]).filter((r) => r.id !== id) }))
        try {
          await backend.remove(t, id)
        } catch (e) {
          fail(e)
        }
      },
    }),
    [data, loading, error, reload, fail, isDemo],
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

// "Chi sei?" salvato sul dispositivo
export function useMe(): [string | null, (id: string | null) => void] {
  const [me, setMe] = useState<string | null>(() => {
    try {
      return localStorage.getItem('mtg:me')
    } catch {
      return null
    }
  })
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
