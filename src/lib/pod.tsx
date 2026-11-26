// Gruppi ("pod"): di quali gruppi fai parte, quale è aperto, il tuo ruolo e il tuo giocatore.
// Le regole vere sono nel database (supabase/pods.sql): qui servono solo a mostrare
// all'utente le azioni che può fare.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Deck, Game } from './types'
import { toast } from './toast'
import { buzz } from './prefs'

export type Role = 'admin' | 'user'
export type Membership = {
  pod_id: string
  role: Role
  player_id: string | null
  name: string
  color: string
  players: number // giocatori attivi
  last_game: string | null // data dell'ultima partita
}
export type Member = { user_id: string; email: string | null; role: Role; player_id: string | null }
export type Invite = { code: string; expires_at: string; uses_left: number }

type PodState = {
  userId: string
  pods: Membership[]
  current: Membership | null
  loading: boolean
  error: string | null
  select(podId: string, announce?: boolean): void
  reload(): Promise<void>
  createPod(name: string): Promise<string>
  joinPod(code: string): Promise<string>
  claimPlayer(args: { player?: string; name?: string; color?: string }): Promise<void>
}

const Ctx = createContext<PodState | null>(null)
const CURRENT_KEY = 'mtg:pod'

function readCurrent() {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

// messaggi del database ("codice non valido o scaduto"…) senza i dettagli tecnici
export const errText = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Operazione non riuscita. Riprova.'

export function PodProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [pods, setPods] = useState<Membership[]>([])
  const [currentId, setCurrentId] = useState<string | null>(readCurrent)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase!.rpc('my_pods')
    if (error) setError(error.message)
    else {
      setError(null)
      const rows = (data ?? []) as { pod_id: string; name: string; color: string | null; role: Role; player_id: string | null; players: number; last_game: string | null }[]
      setPods(rows.map((r) => ({ ...r, color: r.color ?? '#d9b45a', players: Number(r.players) })))
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    reload()
    // se l'admin cambia il mio ruolo, il mio giocatore o mi toglie da un gruppo
    const ch = supabase!
      .channel('my-memberships')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pod_members', filter: `user_id=eq.${userId}` }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pods' }, () => reload())
      .subscribe()
    return () => {
      supabase!.removeChannel(ch)
    }
  }, [reload, userId])

  const current = pods.find((p) => p.pod_id === currentId) ?? pods[0] ?? null

  // cambio del pod attivo: lo ricordo per il prossimo avvio; announce = toast "Ora sei in …"
  const select = useCallback(
    (podId: string, announce = false) => {
      setCurrentId(podId)
      try {
        localStorage.setItem(CURRENT_KEY, podId)
      } catch {
        /* storage non disponibile */
      }
      const p = pods.find((x) => x.pod_id === podId)
      if (announce && p) {
        buzz()
        toast(
          <>
            Ora sei in <b>{p.name}</b>
          </>,
          { color: p.color },
        )
      }
    },
    [pods],
  )

  const value = useMemo<PodState>(
    () => ({
      userId,
      pods,
      current,
      loading,
      error,
      select,
      reload,
      async createPod(name) {
        const { data, error } = await supabase!.rpc('create_pod', { p_name: name })
        if (error) throw error
        await reload()
        select(data as string)
        return data as string
      },
      async joinPod(code) {
        const { data, error } = await supabase!.rpc('join_pod', { p_code: code })
        if (error) throw error
        await reload()
        select(data as string)
        return data as string
      },
      async claimPlayer({ player, name, color }) {
        if (!current) return
        const { error } = await supabase!.rpc('claim_player', { p_pod: current.pod_id, p_player: player ?? null, p_name: name ?? null, p_color: color ?? '#c9a227' })
        if (error) throw error
        await reload()
      },
    }),
    [userId, pods, current, loading, error, select, reload],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// null in modalità locale (senza Supabase non ci sono gruppi)
export const usePod = () => useContext(Ctx)

// " in {pod}" per i titoli dei moduli (vuoto in modalità locale)
export function useInPod() {
  const p = useContext(Ctx)?.current
  return p ? ` in ${p.name}` : ''
}

export function usePodRequired() {
  const p = useContext(Ctx)
  if (!p) throw new Error('PodProvider mancante')
  return p
}

// Cosa posso fare (stesse regole del database). In modalità locale: tutto.
export function usePerms() {
  const pod = useContext(Ctx)
  const admin = !pod || pod.current?.role === 'admin'
  const me = pod?.current?.player_id ?? null
  const mine = (id: string | null | undefined) => admin || (!!me && id === me)
  return {
    admin,
    me,
    player: mine, // modificare un giocatore (nome, colore)
    deck: (d: Pick<Deck, 'player_id'>) => mine(d.player_id),
    addDeckFor: mine,
    game: (g: Pick<Game, 'participants'>) => admin || (!!me && g.participants.some((p) => p.player_id === me)),
    involved: (...ids: (string | null | undefined)[]) => admin || (!!me && ids.includes(me)), // debiti e prestiti
  }
}

// ---------- gestione del gruppo (admin) ----------
export async function listMembers(podId: string): Promise<Member[]> {
  const { data, error } = await supabase!.from('pod_members').select('user_id, email, role, player_id').eq('pod_id', podId).order('joined_at')
  if (error) throw error
  return (data ?? []) as Member[]
}

export async function updateMember(podId: string, userId: string, patch: Partial<Pick<Member, 'role' | 'player_id'>>) {
  const { data, error } = await supabase!.from('pod_members').update(patch).eq('pod_id', podId).eq('user_id', userId).select()
  if (error) throw error
  if (!data?.length) throw new Error('Non hai i permessi per questa modifica.')
}

export async function removeMember(podId: string, userId: string) {
  const { error } = await supabase!.from('pod_members').delete().eq('pod_id', podId).eq('user_id', userId)
  if (error) throw error
}

export async function listInvites(podId: string): Promise<Invite[]> {
  const { data, error } = await supabase!.from('pod_invites').select('code, expires_at, uses_left').eq('pod_id', podId).order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Invite[]).filter((i) => i.uses_left > 0 && new Date(i.expires_at) > new Date())
}

export async function createInvite(podId: string): Promise<string> {
  const { data, error } = await supabase!.rpc('create_invite', { p_pod: podId })
  if (error) throw error
  return data as string
}

export async function deleteInvite(code: string) {
  const { error } = await supabase!.from('pod_invites').delete().eq('code', code)
  if (error) throw error
}

export async function updatePod(podId: string, patch: { name?: string; color?: string }) {
  const { error } = await supabase!.from('pods').update(patch).eq('id', podId)
  if (error) throw error
}

export const POD_COLORS = ['#d9b45a', '#4f8cf0', '#45b26b', '#e05252', '#a35ee0', '#e0843a', '#3ab8c4', '#e05ea8']

// giocatori del gruppo e quali sono già di qualcuno (per "chi sono")
export async function playersForClaim(podId: string) {
  const [pl, mem] = await Promise.all([
    supabase!.from('players').select('id, name, color').eq('pod_id', podId).order('name'),
    supabase!.from('pod_members').select('user_id, player_id').eq('pod_id', podId),
  ])
  if (pl.error) throw pl.error
  if (mem.error) throw mem.error
  const taken = new Map((mem.data ?? []).filter((m) => m.player_id).map((m) => [m.player_id as string, m.user_id as string]))
  return (pl.data ?? []).map((p) => ({ ...(p as { id: string; name: string; color: string }), takenBy: taken.get(p.id as string) ?? null }))
}
