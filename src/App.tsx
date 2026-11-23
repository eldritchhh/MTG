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
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const [tab, setTab] = useState<Tab>(() => {
    const h = location.hash.slice(1)
    return TABS.some((t) => t.id === h) ? (h as Tab) : 'game'
  })
  const { error, loading, isDemo } = useStore()
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
