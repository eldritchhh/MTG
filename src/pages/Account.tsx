// Account (dall'avatar in alto): le cose personali, quelle che prima erano in "Altro"
import { useEffect, useState } from 'react'
import { useMe, useStore } from '../lib/store'
import { usePod } from '../lib/pod'
import { isCloud, supabase } from '../lib/supabase'
import { useNav } from '../lib/nav'
import { prefs } from '../lib/prefs'
import { Avatar, Modal, Screen, Segmented, Switch } from '../components'
import { ChoosePlayer } from './Onboarding'
import { CardNamesList, CommanderList, DataCard, LocalCards, VersionCard } from './Settings'
import { APP_VERSION } from '../lib/version'
import { Icon } from '../icons'
import { resetTips, Tip } from '../lib/tips'
import { toast } from '../lib/toast'

export function AccountScreen({ email, onClose }: { email: string; onClose: () => void }) {
  const pod = usePod()
  const nav = useNav()
  const { players, decks } = useStore()
  const [meId] = useMe()
  const me = players.find((p) => p.id === meId)
  const [choose, setChoose] = useState(false)
  const [life, setLife] = useState(prefs.startingLife)
  const [vibration, setVibration] = useState(prefs.vibration)
  const [awake, setAwake] = useState(prefs.keepAwake)
  const myDecks = decks.filter((d) => d.player_id === meId && d.active && !d.hidden).length

  return (
    <Screen title="Account" onClose={onClose}>
      <div className="row account-hero">
        <Avatar p={me} size={56} />
        <div className="grow">
          <div className="pod-hero-name">{me?.name ?? 'Il tuo account'}</div>
          {email && <div className="muted small" style={{ overflowWrap: 'anywhere' }}>{email}</div>}
        </div>
      </div>

      {isCloud && pod?.current ? (
        <div className="list">
          <button className="list-item account-player" onClick={() => setChoose(true)}>
            <div className="grow">
              <div className="muted small">Il tuo giocatore in {pod.current.name}</div>
              <div className="strong">{me?.name ?? 'nessuno'}</div>
            </div>
            <span className="change-link">Cambia</span>
          </button>
          {meId && (
            <button className="list-item account-decks" onClick={() => nav.showPlayer(meId)}>
              <div className="grow strong">I tuoi mazzi</div>
              <span className="muted">{myDecks}</span>
              <Icon name="chevron" size={16} className="muted" />
            </button>
          )}
          <button
            className="list-item"
            onClick={() => {
              onClose()
              nav.openPods()
            }}
          >
            <div className="grow strong">I tuoi pod</div>
            <span className="muted">{pod.pods.length}</span>
            <Icon name="chevron" size={16} className="muted" />
          </button>
        </div>
      ) : (
        <LocalCards />
      )}

      {isCloud && pod && <MyStats />}

      <div className="card stack prefs-card">
        <h2 className="section">
          <Icon name="edit" size={16} /> Preferenze
        </h2>
        <div className="field">
          <span>Punti vita predefiniti</span>
          <Segmented
            value={String(life)}
            onChange={(v) => {
              prefs.startingLife = Number(v)
              setLife(Number(v))
            }}
            options={[20, 30, 40].map((v) => ({ id: String(v), label: String(v) }))}
          />
        </div>
        <Switch
          checked={vibration}
          onChange={(on) => {
            prefs.vibration = on
            setVibration(on)
          }}
        >
          Vibrazione leggera (inizio partita, Pagato, cambio pod)
        </Switch>
        <Switch
          checked={awake}
          onChange={(on) => {
            prefs.keepAwake = on
            setAwake(on)
          }}
        >
          Schermo sempre acceso durante la partita
        </Switch>
        <button
          className="small-btn"
          onClick={() => {
            resetTips()
            toast('I suggerimenti ricompariranno nelle schermate')
          }}
        >
          Rivedi i suggerimenti
        </button>
      </div>

      <h3 className="no-m">App e dati</h3>
      <CommanderList />
      <CardNamesList />
      {APP_VERSION && <VersionCard />}
      <DataCard />

      {isCloud && (
        <button className="danger" onClick={() => supabase!.auth.signOut()}>
          Esci dall'account
        </button>
      )}
      <p className="muted small center-text">Immagini e nomi delle carte da Scryfall. Non affiliato a Wizards of the Coast.</p>

      {choose && (
        <Modal title="Chi sei?" onClose={() => setChoose(false)}>
          <ChoosePlayer onDone={() => setChoose(false)} />
        </Modal>
      )}
      <Tip
        id="account"
        when={isCloud && !!pod?.current}
        steps={[
          { icon: 'user', target: '.account-player', title: 'Il tuo giocatore', text: 'In ogni pod sei un giocatore: serve per il tuo saldo, i tuoi mazzi e le partite. Se hai sbagliato, cambialo da qui.' },
          { icon: 'cards', target: '.account-decks', title: 'I tuoi mazzi', text: 'Li crei una volta e valgono in tutti i tuoi pod.' },
          { icon: 'edit', target: '.prefs-card', title: 'Preferenze', text: 'Vita iniziale, vibrazione, schermo acceso in partita. Da qui puoi anche rivedere questi suggerimenti.' },
        ]}
      />
    </Screen>
  )
}

// Le tue statistiche su tutti i pod (l'unico posto senza filtro per pod)
function MyStats() {
  const pod = usePod()!
  const [s, setS] = useState<{ games: number; wins: number; top: string | null } | null>(null)
  const mine = pod.pods.map((p) => p.player_id).filter((x): x is string => !!x)
  const key = mine.join(',')

  useEffect(() => {
    if (!mine.length) return setS({ games: 0, wins: 0, top: null })
    let stale = false
    ;(async () => {
      const [g, d] = await Promise.all([
        supabase!.from('games').select('winner_player_id, participants').in('pod_id', pod.pods.map((p) => p.pod_id)),
        supabase!.from('pod_decks').select('id, commander, partner').in('player_id', mine),
      ])
      if (stale || g.error || d.error) return
      const ids = new Set(mine)
      const played = (g.data ?? []).filter((x) => (x.participants as { player_id: string }[]).some((p) => ids.has(p.player_id)))
      const count: Record<string, number> = {}
      for (const x of played)
        for (const p of x.participants as { player_id: string; deck_id: string | null }[]) if (ids.has(p.player_id) && p.deck_id) count[p.deck_id] = (count[p.deck_id] ?? 0) + 1
      const topId = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0]
      const top = (d.data ?? []).find((x) => x.id === topId)
      setS({
        games: played.length,
        wins: played.filter((x) => x.winner_player_id && ids.has(x.winner_player_id)).length,
        top: top ? (top.partner ? `${top.commander} + ${top.partner}` : top.commander) : null,
      })
    })()
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <div className="card stack-sm">
      <h2 className="section">
        <Icon name="chart" size={16} /> Le tue statistiche (tutti i pod)
      </h2>
      {!s ? (
        <p className="muted small no-m">Calcolo…</p>
      ) : s.games === 0 ? (
        <p className="muted small no-m">Nessuna partita giocata ancora.</p>
      ) : (
        <>
          <div className="row between">
            <span>Partite</span>
            <b>{s.games}</b>
          </div>
          <div className="row between">
            <span>Vittorie</span>
            <b>
              {s.wins} ({Math.round((s.wins / s.games) * 100)}%)
            </b>
          </div>
          {s.top && (
            <div className="row between">
              <span>Comandante più giocato</span>
              <b className="right-text">{s.top}</b>
            </div>
          )}
        </>
      )}
    </div>
  )
}
