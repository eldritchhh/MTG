import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isCloud } from './lib/supabase'
import { StoreProvider, useMe, useStore } from './lib/store'
import Login from './pages/Login'
import GamePage from './pages/Game'
import TradesPage from './pages/Trades'
import ProfilesPage from './pages/Profiles'
import StatsPage from './pages/Stats'
import { Icon } from './icons'
import { ConfirmHost } from './lib/confirm'
import { useBack } from './lib/back'
import { isNewer, latestRelease, type Release } from './lib/version'
import { canSelfUpdate, useSelfUpdate } from './lib/updater'
import { PodProvider, usePod, usePodRequired } from './lib/pod'
import { ChoosePlayer, GateScreen, GroupStart } from './pages/Onboarding'
import { NavCtx, useNav, type Nav, type Overlay, type Tab } from './lib/nav'
import { ToastHost } from './lib/toast'
import { Avatar, LoadingPage, PodBadge } from './components'
import { PodSheet, PodScreen } from './pages/PodScreen'
import { AccountScreen } from './pages/Account'
import { Tip } from './lib/tips'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'game', label: 'Partita', icon: 'heart' },
  { id: 'trades', label: 'Scambi', icon: 'swap' },
  { id: 'players', label: 'Giocatori', icon: 'user' },
  { id: 'stats', label: 'Statistiche', icon: 'chart' },
]
// vecchi indirizzi: "profiles" è diventato "players", "altro" ora è la schermata Account
const OLD_HASH: Record<string, Tab> = { profiles: 'players', altro: 'game' }

// i toast stanno fuori da tutto: al cambio di pod lo Shell si ricrea, il messaggio deve restare
export default function App() {
  return (
    <>
      <Root />
      <ToastHost />
    </>
  )
}

function Root() {
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

  if (!ready) return <LoadingPage />
  if (isCloud && !session) return <Login />
  if (!isCloud)
    return (
      <StoreProvider>
        <Shell />
      </StoreProvider>
    )
  return (
    <PodProvider key={session!.user.id} userId={session!.user.id}>
      <PodGate email={session!.user.email ?? ''} />
    </PodProvider>
  )
}

// con Supabase: prima un pod, poi "chi sei?", poi l'app sul pod attivo
function PodGate({ email }: { email: string }) {
  const pod = usePodRequired()
  if (pod.loading) return <LoadingPage />
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
      <Shell email={email} />
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

function Shell({ email = '' }: { email?: string }) {
  const [tab, setTab] = useState<Tab>(() => {
    const h = location.hash.slice(1)
    return TABS.some((t) => t.id === h) ? (h as Tab) : (OLD_HASH[h] ?? 'game')
  })
  const [overlay, setOverlay] = useState<Overlay>(() => (location.hash === '#altro' ? 'account' : null))
  const [sheet, setSheet] = useState(false)
  const [focusPlayer, setFocusPlayer] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const main = useRef<HTMLElement>(null)
  const { error, loading, isDemo } = useStore()
  const pod = usePod()
  const update = useUpdateBanner()
  // indietro da un'altra scheda torna a Partita (da Partita l'app va in background)
  useBack(tab !== 'game' && (() => setTab('game')))

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`)
    main.current?.scrollTo({ top: 0 })
    setScrolled(false)
  }, [tab])

  const nav = useMemo<Nav>(
    () => ({
      tab,
      setTab,
      openAccount: () => setOverlay('account'),
      openPod: () => {
        setSheet(false)
        setOverlay('pod')
      },
      openPods: () => setSheet(true),
      focusPlayer,
      showPlayer: (id) => {
        setFocusPlayer(id)
        setOverlay(null)
        setTab('players')
      },
      clearFocus: () => setFocusPlayer(null),
    }),
    [tab, focusPlayer],
  )

  return (
    <NavCtx.Provider value={nav}>
      <div className="app" style={{ ['--pod' as string]: pod?.current?.color ?? 'var(--gold)' }}>
        <AppHeader />
        {!isCloud && isDemo && (
          <div className="banner">
            Stai guardando dati di esempio.{' '}
            <button className="link inline" onClick={() => setOverlay('account')}>
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
              <UpdateLink release={update.release} />
            </span>
            <button className="icon-btn sm" onClick={update.dismiss} aria-label="Nascondi">
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
        <main ref={main} className={`content ${scrolled ? 'scrolled' : ''}`} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 60)}>
          {loading ? (
            <LoadingPage />
          ) : (
            <div className="page-fade" key={`${pod?.current?.pod_id ?? 'local'}-${tab}`}>
              {tab === 'game' && <GamePage />}
              {tab === 'trades' && <TradesPage />}
              {tab === 'players' && <ProfilesPage />}
              {tab === 'stats' && <StatsPage />}
            </div>
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
        {overlay === 'account' && <AccountScreen email={email} onClose={() => setOverlay(null)} />}
        {overlay === 'pod' && <PodScreen onClose={() => setOverlay(null)} />}
        {sheet && <PodSheet onClose={() => setSheet(false)} />}
        <ConfirmHost />
      </div>
    </NavCtx.Provider>
  )
}

// In cima a ogni scheda: pod attivo (tocco = cambia pod) e avatar (tocco = Account, pressione lunga = pod)
function AppHeader() {
  const pod = usePod()
  const nav = useNav()
  const { players } = useStore()
  const [meId] = useMe()
  const me = players.find((p) => p.id === meId)
  const hold = useRef<number | undefined>(undefined)
  const held = useRef(false)
  const cur = pod?.current

  return (
    <header className="app-header">
      <div className="app-header-row">
        {cur ? (
          <button className="pod-pill" onClick={nav.openPods} aria-label="Cambia pod">
            <PodBadge name={cur.name} color={cur.color} />
            <span className="pod-pill-text">
              <span className="pod-pill-name">{cur.name}</span>
              <span className="pod-pill-sub">
                {cur.role === 'admin' ? 'Admin' : 'Membro'} · {cur.players} giocator{cur.players === 1 ? 'e' : 'i'}
              </span>
            </span>
            {pod!.pods.length > 1 && <Icon name="chevron" size={16} className="pod-pill-chevron" />}
          </button>
        ) : (
          <span className="app-title">MTGUtils</span>
        )}
        <button
          className="avatar-btn"
          aria-label="Il tuo account"
          onPointerDown={() => {
            held.current = false
            hold.current = window.setTimeout(() => {
              if (!pod) return
              held.current = true
              nav.openPods()
            }, 500)
          }}
          onPointerUp={() => clearTimeout(hold.current)}
          onPointerLeave={() => clearTimeout(hold.current)}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => !held.current && nav.openAccount()}
        >
          <Avatar p={me} size={36} />
        </button>
      </div>
      <div className="pod-bar" />
      {cur && (
        <Tip
          id="header"
          steps={[
            { icon: 'users', target: '.pod-pill', title: 'Il pod in cui sei', text: 'Partite, spese e statistiche sono di questo pod. Toccalo per passare a un altro pod o crearne uno nuovo.' },
            { icon: 'user', target: '.avatar-btn', title: 'Il tuo profilo', text: 'Tocca la tua icona per account, mazzi, preferenze e statistiche su tutti i pod.' },
          ]}
        />
      )}
    </header>
  )
}

// "Aggiorna": dall'app (scarica e apre l'installer) se il plugin c'è, altrimenti link al file
function UpdateLink({ release }: { release: Release }) {
  const up = useSelfUpdate()
  if (!release.apk || !canSelfUpdate())
    return (
      <a href={release.apk ?? release.page} target="_blank" rel="noreferrer">
        Scarica e installa
      </a>
    )
  if (up.busy) return <span>Scarico… {up.percent}%</span>
  return (
    <>
      <button className="link inline" onClick={() => up.run(release.apk!)}>
        Aggiorna
      </button>
      {up.error && <span className="neg"> {up.error}</span>}
    </>
  )
}
