import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isCloud } from './lib/supabase'
import { StoreProvider, useStore } from './lib/store'
import Login from './pages/Login'
import GamePage from './pages/Game'
import TradesPage from './pages/Trades'
import ProfilesPage from './pages/Profiles'
import StatsPage from './pages/Stats'
import SettingsPage from './pages/Settings'
import { Icon } from './icons'
import { ConfirmHost } from './lib/confirm'
import { useBack } from './lib/back'
import { isNewer, latestRelease, type Release } from './lib/version'
import { PodProvider, usePodRequired } from './lib/pod'
import { ChoosePlayer, GateScreen, GroupStart } from './pages/Onboarding'

const TABS = [
  { id: 'game', label: 'Partita', icon: 'heart' },
  { id: 'trades', label: 'Scambi', icon: 'swap' },
  { id: 'profiles', label: 'Profili', icon: 'user' },
  { id: 'stats', label: 'Statistiche', icon: 'chart' },
  { id: 'altro', label: 'Altro', icon: 'more' },
] as const
type Tab = (typeof TABS)[number]['id']

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!isCloud)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return <div className="center muted">Caricamento…</div>
  if (isCloud && !session) return <Login />
  if (!isCloud)
    return (
      <StoreProvider>
        <Shell />
      </StoreProvider>
    )
  return (
    <PodProvider key={session!.user.id} userId={session!.user.id}>
      <PodGate />
    </PodProvider>
  )
}

// con Supabase: prima un gruppo, poi "chi sei?", poi l'app sul gruppo aperto
function PodGate() {
  const pod = usePodRequired()
  if (pod.loading) return <div className="center muted">Caricamento…</div>
  if (pod.error) return <div className="center muted">Errore: {pod.error}</div>
  if (!pod.current)
    return (
      <GateScreen title="Benvenuto">
        <GroupStart />
      </GateScreen>
    )
  if (!pod.current.player_id)
    return (
      <GateScreen title={pod.current.name}>
        <ChoosePlayer />
      </GateScreen>
    )
  return (
    <StoreProvider key={pod.current.pod_id} podId={pod.current.pod_id}>
      <Shell />
    </StoreProvider>
  )
}

// banner "nuova versione": una volta nascosto, ricompare solo per una versione ancora più nuova
function useUpdateBanner() {
  const [release, setRelease] = useState<Release | null>(null)
  useEffect(() => {
    latestRelease()
      .then((r) => {
        let hidden: string | null = null
        try {
          hidden = localStorage.getItem('mtg:update-hidden')
        } catch {
          /* storage non disponibile */
        }
        if (isNewer(r) && r!.tag !== hidden) setRelease(r)
      })
      .catch(() => {}) // offline o GitHub non raggiungibile: niente banner
  }, [])
  return {
    release,
    dismiss: () => {
      try {
        if (release) localStorage.setItem('mtg:update-hidden', release.tag)
      } catch {
        /* storage non disponibile */
      }
      setRelease(null)
    },
  }
}

function Shell() {
  const [tab, setTab] = useState<Tab>(() => {
    const h = location.hash.slice(1)
    return TABS.some((t) => t.id === h) ? (h as Tab) : 'game'
  })
  const { error, loading, isDemo } = useStore()
  const update = useUpdateBanner()
  // indietro da un'altra scheda torna a Partita (da Partita l'app va in background)
  useBack(tab !== 'game' && (() => setTab('game')))

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`)
  }, [tab])

  return (
    <div className="app">
      {!isCloud && isDemo && (
        <div className="banner">
          Stai guardando dati di esempio.{' '}
          <button className="link inline" onClick={() => setTab('altro')}>
            Svuota e inizia
          </button>
        </div>
      )}
      {!isCloud && !isDemo && <div className="banner">Modalità locale: i dati restano su questo dispositivo.</div>}
      {error && <div className="banner error">Errore: {error}</div>}
      {update.release && (
        <div className="banner update">
          <span className="grow">
            È uscita la versione <b>{update.release.tag}</b>.{' '}
            <a href={update.release.apk ?? update.release.page} target="_blank" rel="noreferrer">
              Scarica e installa
            </a>
          </span>
          <button className="icon-btn sm" onClick={update.dismiss} aria-label="Nascondi">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      <main className="content">
        {loading ? (
          <div className="center muted">Caricamento…</div>
        ) : (
          <>
            {tab === 'game' && <GamePage />}
            {tab === 'trades' && <TradesPage />}
            {tab === 'profiles' && <ProfilesPage />}
            {tab === 'stats' && <StatsPage />}
            {tab === 'altro' && <SettingsPage />}
          </>
        )}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="ti">
              <Icon name={t.icon} size={22} />
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <ConfirmHost />
    </div>
  )
}
