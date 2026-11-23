import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import type { Deck, Participant, Player } from '../lib/types'
import { byId, deckLabel } from '../lib/util'
import { Avatar, DeckArt, DeckCard, DeckChip, Header, Modal, Pips, SplitArt, TierBadge, deckArts, manaGradient } from '../components'
import { ask } from '../lib/confirm'
import { Icon } from '../icons'
import { useBack } from '../lib/back'

type Seat = {
  player_id: string
  deck_id: string | null
  life: number
  poison: number
  cmd: Record<number, number> // danni ricevuti dal comandante del posto i
  eliminated_order: number | null
}
type Live = { startedAt: string; startingLife: number; seats: Seat[]; table: boolean }

const LIVE_KEY = 'mtg:live'
const loadLive = (): Live | null => {
  try {
    return JSON.parse(localStorage.getItem(LIVE_KEY) ?? 'null')
  } catch {
    return null
  }
}
const saveLive = (l: Live | null) => {
  try {
    if (l) localStorage.setItem(LIVE_KEY, JSON.stringify(l))
    else localStorage.removeItem(LIVE_KEY)
  } catch {
    /* ignore */
  }
}

const isDead = (s: Seat) => s.life <= 0 || s.poison >= 10 || Object.values(s.cmd).some((v) => v >= 21)

export default function GamePage() {
  const [live, setLive] = useState<Live | null>(loadLive)
  useEffect(() => saveLive(live), [live])
  return live ? <Board live={live} setLive={setLive} /> : <Setup onStart={setLive} />
}

// ------------------------------------------------------------ SETUP
function Setup({ onStart }: { onStart: (l: Live) => void }) {
  const { players, decks, games } = useStore()
  const [sel, setSel] = useState<string[]>([])
  const [deckOf, setDeckOf] = useState<Record<string, string>>({})
  const [life, setLife] = useState(40)
  const [picking, setPicking] = useState<string | null>(null)
  const P = byId(players)
  const D = byId(decks)

  // mazzo proposto: l'ultimo giocato da quel giocatore, altrimenti il primo attivo
  const lastDeck = useMemo(() => {
    const m: Record<string, string> = {}
    for (const g of [...games].sort((a, b) => a.played_at.localeCompare(b.played_at)))
      for (const p of g.participants) if (p.deck_id) m[p.player_id] = p.deck_id
    return m
  }, [games])

  function toggle(id: string) {
    if (sel.includes(id)) return setSel(sel.filter((x) => x !== id))
    setSel([...sel, id])
    if (!deckOf[id]) {
      const own = decks.filter((d) => d.player_id === id && d.active)
      const pref = lastDeck[id] && decks.some((d) => d.id === lastDeck[id]) ? lastDeck[id] : own[0]?.id
      if (pref) setDeckOf((m) => ({ ...m, [id]: pref }))
    }
  }

  function start() {
    onStart({
      startedAt: new Date().toISOString(),
      startingLife: life,
      table: sel.length > 2,
      seats: sel.map((id) => ({ player_id: id, deck_id: deckOf[id] || null, life, poison: 0, cmd: {}, eliminated_order: null })),
    })
  }

  return (
    <div className="stack">
      <Header title="Nuova partita" sub={sel.length ? `${sel.length} giocatori · ${life} punti vita` : 'Scegli chi siede al tavolo'} />
      {players.length === 0 && <div className="empty">Prima aggiungi i giocatori e i loro comandanti in Profili.</div>}
      <h2>Chi gioca?</h2>
      <div className="chips">
        {players.map((p) => (
          <button key={p.id} className={`chip big ${sel.includes(p.id) ? 'on' : ''}`} onClick={() => toggle(p.id)}>
            <Avatar p={p} size={22} /> {p.name}
          </button>
        ))}
      </div>

      {sel.length > 0 && (
        <>
          <h2>Con che mazzo?</h2>
          <div className="list">
            {sel.map((id, i) => (
              <button key={id} className="list-item seat-setup" style={{ ['--pc' as string]: P[id]?.color }} onClick={() => setPicking(id)}>
                <span className="seat-n">{i + 1}</span>
                <div className="deck-art-wrap thumb-wrap">
                  <DeckArt d={D[deckOf[id]]} className="thumb" />
                  <TierBadge id={D[deckOf[id]]?.tier_id} small />
                </div>
                <div className="grow stack-sm">
                  <div className="strong">{P[id]?.name}</div>
                  <div className="small">{D[deckOf[id]] ? <DeckChip d={D[deckOf[id]]} /> : <span className="muted">Scegli il mazzo</span>}</div>
                  {D[deckOf[id]] && D[deckOf[id]].player_id !== id && <div className="muted small">mazzo di {P[D[deckOf[id]].player_id]?.name}</div>}
                </div>
                <span className="change-link">Cambia</span>
              </button>
            ))}
          </div>
          <p className="muted small">L'ordine di selezione è l'ordine di posto al tavolo. Tocca un giocatore per cambiare mazzo.</p>
        </>
      )}
      {picking && (
        <DeckPicker
          owner={picking}
          value={deckOf[picking] ?? ''}
          onClose={() => setPicking(null)}
          onPick={(v) => {
            setDeckOf({ ...deckOf, [picking]: v })
            setPicking(null)
          }}
        />
      )}

      <h2>Punti vita iniziali</h2>
      <div className="segmented">
        {[20, 30, 40].map((v) => (
          <button key={v} className={life === v ? 'active' : ''} onClick={() => setLife(v)}>
            {v}
          </button>
        ))}
      </div>

      <button className="primary big" disabled={sel.length < 2} onClick={start}>
        <Icon name="play" size={18} /> Inizia partita
      </button>
    </div>
  )
}

function DeckPicker({ owner, value, onPick, onClose }: { owner: string; value: string; onPick: (id: string) => void; onClose: () => void }) {
  const { decks, players, tiers } = useStore()
  const P = byId(players)
  const [q, setQ] = useState('')
  const [tier, setTier] = useState<string | null>(null)
  const match = (d: Deck) => d.active && (!tier || d.tier_id === tier) && (!q.trim() || deckLabel(d).toLowerCase().includes(q.trim().toLowerCase()) || d.tags.some((t) => t.includes(q.trim().toLowerCase())))
  const own = decks.filter((d) => d.player_id === owner && match(d))
  const others = decks.filter((d) => d.player_id !== owner && match(d))
  return (
    <Modal title={`Mazzo di ${P[owner]?.name ?? ''}`} onClose={onClose}>
      <input placeholder="Cerca comandante o tag" value={q} onChange={(e) => setQ(e.target.value)} />
      {tiers.length > 0 && (
        <div className="chips">
          <button className={`tier-chip none ${tier === null ? 'on' : ''}`} onClick={() => setTier(null)}>
            Tutti i tier
          </button>
          {[...tiers]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((t) => (
              <button key={t.id} className={`tier-chip ${tier === t.id ? 'on' : ''}`} style={{ ['--tc' as string]: t.color }} onClick={() => setTier(tier === t.id ? null : t.id)}>
                {t.name}
              </button>
            ))}
        </div>
      )}
      <h3 className="no-m">I suoi mazzi</h3>
      {own.length ? (
        <div className="deck-grid">
          {own.map((d) => (
            <DeckCard key={d.id} d={d} selected={d.id === value} onClick={() => onPick(d.id)} />
          ))}
        </div>
      ) : (
        <p className="muted small">Nessun mazzo{q || tier ? ' con questi filtri' : ': aggiungili in Profili'}.</p>
      )}
      {others.length > 0 && (
        <>
          <h3 className="no-m">Mazzi degli altri (in prestito)</h3>
          <div className="deck-grid">
            {others.map((d) => (
              <DeckCard key={d.id} d={d} owner={P[d.player_id]} selected={d.id === value} onClick={() => onPick(d.id)} />
            ))}
          </div>
        </>
      )}
      <button className="ghost" onClick={() => onPick('')}>
        Gioca senza mazzo registrato
      </button>
    </Modal>
  )
}

// ------------------------------------------------------------ BOARD
function Board({ live, setLive }: { live: Live; setLive: (l: Live | null) => void }) {
  const { players, decks } = useStore()
  const P = byId(players)
  const D = byId(decks)
  const [panel, setPanel] = useState<number | null>(null)
  const [menu, setMenu] = useState(false)
  const [ending, setEnding] = useState(false)
  const [moving, setMoving] = useState<number | null>(null) // posto tenuto premuto, da spostare
  const elapsed = useElapsed(live.startedAt)
  useBack(moving !== null && (() => setMoving(null)))

  // scambia due posti; i danni da comandante sono indicizzati per posto, quindi vanno rimappati
  function swap(a: number, b: number) {
    setMoving(null)
    if (a === b) return
    const map = (j: number) => (j === a ? b : j === b ? a : j)
    const seats = live.seats.map((s) => ({ ...s, cmd: Object.fromEntries(Object.entries(s.cmd).map(([k, v]) => [map(Number(k)), v])) }))
    ;[seats[a], seats[b]] = [seats[b], seats[a]]
    setLive({ ...live, seats })
  }

  function change(i: number, fn: (s: Seat) => Seat) {
    const seats = live.seats.map((s, j) => (j === i ? fn({ ...s, cmd: { ...s.cmd } }) : { ...s }))
    // aggiorna l'ordine di eliminazione
    let next = Math.max(0, ...seats.map((s) => s.eliminated_order ?? 0)) + 1
    for (const s of seats) {
      const dead = isDead(s)
      if (dead && s.eliminated_order == null) s.eliminated_order = next++
      if (!dead && s.eliminated_order != null) s.eliminated_order = null
    }
    setLive({ ...live, seats })
  }

  const n = live.seats.length
  const topCount = live.table ? Math.ceil(n / 2) : 0
  const rows = live.table ? [live.seats.map((_, i) => i).slice(0, topCount), live.seats.map((_, i) => i).slice(topCount)] : null

  const tile = (i: number, flipped: boolean) => (
    <SeatTile
      key={i}
      idx={i}
      seat={live.seats[i]}
      player={P[live.seats[i].player_id]}
      deck={D[live.seats[i].deck_id ?? '']}
      flipped={flipped}
      moving={moving}
      onLife={(d) => change(i, (s) => ({ ...s, life: s.life + d }))}
      onOpen={() => setPanel(i)}
      onHold={() => setMoving(i)}
      onDrop={(target) => target !== null && target !== i && swap(i, target)}
      onTapWhileMoving={() => moving !== null && swap(moving, i)}
    />
  )

  return (
    <div className="board">
      <div className="board-top">
        <span className="timer">
          <Icon name="clock" size={16} /> {elapsed}
        </span>
        <span className="board-title">{moving !== null ? `Sposta ${P[live.seats[moving].player_id]?.name ?? ''}: tocca il nuovo posto` : 'Partita'}</span>
        {moving !== null ? (
          <button className="icon-btn" onClick={() => setMoving(null)} aria-label="Annulla spostamento">
            <Icon name="x" size={20} />
          </button>
        ) : (
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Menu">
            <Icon name="menu" size={20} />
          </button>
        )}
      </div>
      {rows ? (
        <div className="seats table">
          <div className="seat-row">{rows[0].map((i) => tile(i, true))}</div>
          <div className="seat-row">{rows[1].map((i) => tile(i, false))}</div>
        </div>
      ) : (
        <div className={`seats grid n${Math.min(n, 6)}`}>{live.seats.map((_, i) => tile(i, false))}</div>
      )}

      {panel !== null && (
        <CounterPanel
          live={live}
          idx={panel}
          P={P}
          D={D}
          onClose={() => setPanel(null)}
          change={(fn) => change(panel, fn)}
        />
      )}

      {menu && (
        <Modal title="Partita" onClose={() => setMenu(false)}>
          <div className="stack">
            <button
              className="primary"
              onClick={() => {
                setMenu(false)
                setEnding(true)
              }}
            >
              <Icon name="trophy" size={18} /> Termina e salva
            </button>
            <button
              onClick={() => {
                setLive({ ...live, table: !live.table })
                setMenu(false)
              }}
            >
              {live.table ? 'Vista a griglia' : 'Vista tavolo (metà capovolta)'}
            </button>
            <p className="muted small no-m">Per cambiare posto: tieni premuto un giocatore e trascinalo sul nuovo posto (o rilascia e tocca il posto).</p>
            <button
              onClick={async () => {
                if (!(await ask('Riportare tutti ai punti vita iniziali?'))) return
                setLive({ ...live, startedAt: new Date().toISOString(), seats: live.seats.map((s) => ({ ...s, life: live.startingLife, poison: 0, cmd: {}, eliminated_order: null })) })
                setMenu(false)
              }}
            >
              ↺ Ricomincia (stessi giocatori)
            </button>
            <button
              className="danger"
              onClick={async () => {
                if (await ask('Annullare la partita senza salvarla?')) setLive(null)
              }}
            >
              Annulla partita
            </button>
          </div>
        </Modal>
      )}

      {ending && <EndGame live={live} P={P} D={D} onClose={() => setEnding(false)} onSaved={() => setLive(null)} />}
    </div>
  )
}

const HOLD_MS = 450

function SeatTile({
  idx, seat, player, deck, flipped, moving, onLife, onOpen, onHold, onDrop, onTapWhileMoving,
}: {
  idx: number
  seat: Seat
  player?: Player
  deck?: Deck
  flipped: boolean
  moving: number | null
  onLife: (d: number) => void
  onOpen: () => void
  onHold: () => void
  onDrop: (target: number | null) => void
  onTapWhileMoving: () => void
}) {
  const [delta, setDelta] = useState(0)
  const timer = useRef<number | undefined>(undefined)
  const press = useRef<{ x: number; y: number; t: number } | null>(null)
  const held = useRef(false)
  const dead = isDead(seat)
  const cmdTotal = Object.values(seat.cmd).reduce((a, b) => a + b, 0)
  const arts = deckArts(deck)

  // tieni premuto → posto "in mano": trascina e rilascia su un altro posto, oppure rilascia e tocca il posto
  const cancelHold = () => {
    if (press.current) clearTimeout(press.current.t)
    press.current = null
  }
  const hold = {
    onPointerDown: (e: React.PointerEvent) => {
      held.current = false
      cancelHold()
      const t = window.setTimeout(() => {
        held.current = true
        navigator.vibrate?.(30)
        onHold()
      }, HOLD_MS)
      press.current = { x: e.clientX, y: e.clientY, t }
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (press.current && !held.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 12) cancelHold()
    },
    onPointerUp: (e: React.PointerEvent) => {
      cancelHold()
      if (!held.current) return
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-seat]')
      onDrop(el ? Number(el.dataset.seat) : null)
    },
    onPointerCancel: cancelHold,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // durante lo spostamento i tocchi non cambiano la vita: scelgono il posto
    onClickCapture: (e: React.MouseEvent) => {
      if (held.current) {
        held.current = false
        e.stopPropagation()
      } else if (moving !== null) {
        e.stopPropagation()
        onTapWhileMoving()
      }
    },
  }

  function bump(d: number) {
    onLife(d)
    setDelta((x) => x + d)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDelta(0), 1500)
  }

  return (
    <div
      data-seat={idx}
      className={`seat ${dead ? 'dead' : ''} ${flipped ? 'flipped' : ''} ${moving === idx ? 'moving' : moving !== null ? 'drop-target' : ''}`}
      style={{
        ['--pc' as string]: player?.color ?? '#555',
        backgroundImage: arts.length
          ? undefined
          : `radial-gradient(90% 70% at 50% 0%, ${player?.color ?? '#555'}40, transparent 70%), ${manaGradient(deck?.colors ?? [], 0.22)}`,
      }}
      {...hold}
    >
      {arts.length > 0 && <SplitArt urls={arts} className="seat-art" />}
      <button className="zone minus" onClick={() => bump(-1)} aria-label="-1">
        −
      </button>
      <button className="zone plus" onClick={() => bump(1)} aria-label="+1">
        +
      </button>
      <div className="seat-info">
        <div className="seat-name">{player?.name ?? '?'}</div>
        <div className="seat-deck">
          {deck && <Pips colors={deck.colors} size={12} />} {deck ? deckLabel(deck) : ''}
        </div>
      </div>
      <div className="life">
        {seat.life}
        {delta !== 0 && <span className={`delta ${delta > 0 ? 'pos' : 'neg'}`}>{delta > 0 ? `+${delta}` : delta}</span>}
      </div>
      {dead && (
        <div className="out-badge">
          <Icon name="skull" size={14} /> Eliminato
        </div>
      )}
      <div className="seat-bottom">
        <button className="mini" onClick={() => bump(-5)}>
          −5
        </button>
        <button className="mini counters" onClick={onOpen}>
          <Icon name="sword" size={14} /> {cmdTotal}
          <Icon name="drop" size={14} /> {seat.poison}
        </button>
        <button className="mini" onClick={() => bump(5)}>
          +5
        </button>
      </div>
    </div>
  )
}

function CounterPanel({ live, idx, P, D, onClose, change }: { live: Live; idx: number; P: Record<string, Player>; D: Record<string, Deck>; onClose: () => void; change: (fn: (s: Seat) => Seat) => void }) {
  const seat = live.seats[idx]
  return (
    <Modal title={`Contatori di ${P[seat.player_id]?.name ?? ''}`} onClose={onClose}>
      <div className="stack">
        <h3>Danni da comandante ricevuti</h3>
        <p className="muted small">Il + toglie anche 1 punto vita. A 21 da uno stesso comandante si è fuori.</p>
        {live.seats.map((src, j) =>
          j === idx ? null : (
            <div key={j} className="row between line">
              <span className="row grow">
                <Avatar p={P[src.player_id]} size={22} />
                <span className="small">{src.deck_id ? deckLabel(D[src.deck_id]) : P[src.player_id]?.name}</span>
              </span>
              <Stepper
                value={seat.cmd[j] ?? 0}
                danger={(seat.cmd[j] ?? 0) >= 21}
                onChange={(d) =>
                  change((s) => {
                    const cur = s.cmd[j] ?? 0
                    const nv = Math.max(0, cur + d)
                    return { ...s, cmd: { ...s.cmd, [j]: nv }, life: s.life - (nv - cur) }
                  })
                }
              />
            </div>
          ),
        )}
        <h3>Segnalini veleno</h3>
        <div className="row between line">
          <span className="row">
            <Icon name="drop" size={16} /> Veleno (10 = fuori)
          </span>
          <Stepper value={seat.poison} danger={seat.poison >= 10} onChange={(d) => change((s) => ({ ...s, poison: Math.max(0, s.poison + d) }))} />
        </div>
        <h3>Punti vita</h3>
        <div className="row between line">
          <span className="row">
            <Icon name="heart" size={16} /> Vita
          </span>
          <Stepper value={seat.life} step={[1, 10]} onChange={(d) => change((s) => ({ ...s, life: s.life + d }))} />
        </div>
      </div>
    </Modal>
  )
}

function Stepper({ value, onChange, danger, step = [1] }: { value: number; onChange: (d: number) => void; danger?: boolean; step?: number[] }) {
  return (
    <span className="stepper">
      {[...step].reverse().map((s) => (
        <button key={-s} onClick={() => onChange(-s)}>
          −{s > 1 ? s : ''}
        </button>
      ))}
      <b className={danger ? 'neg' : ''}>{value}</b>
      {step.map((s) => (
        <button key={s} onClick={() => onChange(s)}>
          +{s > 1 ? s : ''}
        </button>
      ))}
    </span>
  )
}

function EndGame({ live, P, D, onClose, onSaved }: { live: Live; P: Record<string, Player>; D: Record<string, Deck>; onClose: () => void; onSaved: () => void }) {
  const { add } = useStore()
  const alive = live.seats.filter((s) => !isDead(s))
  const [winner, setWinner] = useState(alive.length === 1 ? alive[0].player_id : '')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const participants: Participant[] = live.seats.map((s) => ({
      player_id: s.player_id,
      deck_id: s.deck_id,
      final_life: s.life,
      tier_id: (s.deck_id && D[s.deck_id]?.tier_id) || null,
      eliminated_order: s.eliminated_order,
    }))
    await add('games', {
      played_at: live.startedAt,
      starting_life: live.startingLife,
      winner_player_id: winner || null,
      participants,
      duration_min: Math.max(1, Math.round((Date.now() - new Date(live.startedAt).getTime()) / 60000)),
      notes: notes.trim() || null,
    })
    onSaved()
  }

  return (
    <Modal title="Chi ha vinto?" onClose={onClose}>
      <div className="stack">
        <div className="list">
          {live.seats.map((s) => (
            <button key={s.player_id} className={`list-item ${winner === s.player_id ? 'selected' : ''}`} onClick={() => setWinner(s.player_id)}>
              <Avatar p={P[s.player_id]} />
              <div className="grow">
                <div className="strong">{P[s.player_id]?.name}</div>
                <div className="muted small row">
                  {s.deck_id && D[s.deck_id] && <Pips colors={D[s.deck_id].colors} />} {s.deck_id ? deckLabel(D[s.deck_id]) : 'nessun mazzo'}
                </div>
              </div>
              <span className={winner === s.player_id ? 'gold' : 'muted'}>{winner === s.player_id ? <Icon name="trophy" size={22} /> : `${s.life} ♥`}</span>
            </button>
          ))}
          <button className={`list-item ${winner === '' ? 'selected' : ''}`} onClick={() => setWinner('')}>
            <div className="grow muted">Nessun vincitore / pareggio</div>
          </button>
        </div>
        <input placeholder="Note (opzionale): combo, giocata epica…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="primary" disabled={busy} onClick={save}>
          Salva partita
        </button>
      </div>
    </Modal>
  )
}

function useElapsed(since: string) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (x: number) => String(x).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}
