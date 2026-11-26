import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import type { Deck, Participant, Player } from '../lib/types'
import { byId, deckLabel } from '../lib/util'
import { Avatar, DeckArt, DeckCard, DeckChip, Empty, Header, Modal, Pips, SplitArt, TierBadge, deckArts, manaGradient } from '../components'
import { ask } from '../lib/confirm'
import { Icon } from '../icons'
import { useBack } from '../lib/back'
import { usePod } from '../lib/pod'
import { useNav } from '../lib/nav'
import { buzz, prefs } from '../lib/prefs'

type Seat = {
  player_id: string
  deck_id: string | null
  life: number
  poison: number
  cmd: Record<string, number> // danni ricevuti dal comandante del posto i ("2") e dal suo partner ("2p")
  eliminated_order: number | null
}
// Disposizioni del tavolo (il telefono sta in mezzo, i giocatori intorno):
// sides = rettangolo, giocatori sui due lati lunghi; square = un giocatore per lato;
// table = metà capovolta; grid = tutti dritti
type Layout = 'sides' | 'square' | 'table' | 'grid'
const LAYOUTS: { id: Layout; label: string }[] = [
  { id: 'sides', label: 'Rettangolo' },
  { id: 'square', label: '4 lati' },
  { id: 'table', label: 'Metà capovolta' },
  { id: 'grid', label: 'Griglia' },
]
type Rot = 0 | 90 | 180 | 270
type Live = { startedAt: string; startingLife: number; seats: Seat[]; layout?: Layout; table?: boolean }
const layoutOf = (l: Live): Layout => l.layout ?? (l.table ? 'table' : 'grid') // partite salvate prima delle disposizioni

// ultima configurazione usata: alla partita successiva gli stessi giocatori sono già selezionati
const SETUP_KEY = 'mtg:setup'
type SavedSetup = { sel: string[]; deckOf: Record<string, string>; life: number; tier: string | null; layout: Layout }
const loadSetup = (): Partial<SavedSetup> => {
  try {
    return JSON.parse(localStorage.getItem(SETUP_KEY) ?? '{}')
  } catch {
    return {}
  }
}

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
  const { players: allPlayers, decks, games, tiers } = useStore()
  const players = allPlayers.filter((p) => !p.archived)
  const pod = usePod()?.current
  const nav = useNav()
  const [saved] = useState(loadSetup)
  // solo giocatori, mazzi e tier che esistono ancora
  const [sel, setSel] = useState<string[]>(() => (saved.sel ?? []).filter((id) => players.some((p) => p.id === id)))
  const [deckOf, setDeckOf] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(saved.deckOf ?? {}).filter(([, d]) => decks.some((x) => x.id === d))),
  )
  const [life, setLife] = useState(saved.life ?? prefs.startingLife)
  const [picking, setPicking] = useState<string | null>(null)
  const [tier, setTier] = useState<string | null>(saved.tier && tiers.some((t) => t.id === saved.tier) ? saved.tier : null) // null = misto
  const [layout, setLayout] = useState<Layout>(saved.layout ?? 'sides')
  const [noDeck, setNoDeck] = useState<string[]>([]) // giocatori senza mazzi del tier scelto
  const P = byId(players)
  const D = byId(decks)
  const sortedTiers = [...tiers].sort((a, b) => a.sort_order - b.sort_order)

  // un mazzo a caso per ogni giocatore, tra i suoi mazzi attivi del tier scelto (o di qualsiasi tier)
  function randomDecks() {
    const next = { ...deckOf }
    const missing: string[] = []
    for (const id of sel) {
      const pool = decks.filter((d) => d.player_id === id && d.active && (tier === null || d.tier_id === tier))
      if (!pool.length) {
        missing.push(id)
        continue
      }
      // se possibile evito di riproporre lo stesso mazzo di prima
      const fresh = pool.length > 1 ? pool.filter((d) => d.id !== deckOf[id]) : pool
      next[id] = fresh[Math.floor(Math.random() * fresh.length)].id
    }
    setDeckOf(next)
    setNoDeck(missing)
  }

  // mazzo proposto: l'ultimo giocato da quel giocatore, altrimenti il primo attivo
  const lastDeck = useMemo(() => {
    const m: Record<string, string> = {}
    for (const g of [...games].sort((a, b) => a.played_at.localeCompare(b.played_at)))
      for (const p of g.participants) if (p.deck_id) m[p.player_id] = p.deck_id
    return m
  }, [games])

  function toggle(id: string) {
    setNoDeck([])
    if (sel.includes(id)) return setSel(sel.filter((x) => x !== id))
    setSel([...sel, id])
    if (!deckOf[id]) {
      const own = decks.filter((d) => d.player_id === id && d.active)
      const pref = lastDeck[id] && decks.some((d) => d.id === lastDeck[id]) ? lastDeck[id] : own[0]?.id
      if (pref) setDeckOf((m) => ({ ...m, [id]: pref }))
    }
  }

  function start() {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify({ sel, deckOf, life, tier, layout } satisfies SavedSetup))
    } catch {
      /* storage non disponibile */
    }
    buzz(40)
    onStart({
      startedAt: new Date().toISOString(),
      startingLife: life,
      layout,
      seats: sel.map((id) => ({ player_id: id, deck_id: deckOf[id] || null, life, poison: 0, cmd: {}, eliminated_order: null })),
    })
  }

  return (
    <div className="stack">
      <Header
        title="Nuova partita"
        sub={
          <>
            {pod && (
              <>
                in <b style={{ color: pod.color }}>{pod.name}</b> ·{' '}
              </>
            )}
            {sel.length ? `${sel.length} giocatori · ${life} punti vita` : 'scegli chi siede al tavolo'}
          </>
        }
      />
      {players.length === 0 && (
        <Empty icon="users" action={{ label: 'Vai a Giocatori', run: () => nav.setTab('players') }}>
          Prima aggiungi i giocatori e i loro comandanti.
        </Empty>
      )}
      <h2>Chi gioca?</h2>
      <div className="chips player-pick">
        {players.map((p) => {
          const on = sel.includes(p.id)
          return (
            <button key={p.id} className={`chip big ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(p.id)}>
              {on ? <Icon name="check" size={18} className="gold" /> : <Avatar p={p} size={22} />} {p.name}
            </button>
          )
        })}
      </div>

      {sel.length > 0 && (
        <>
          <h2>Con che mazzo?</h2>
          <div className="card stack-sm">
            {sortedTiers.length > 0 && <h3 className="no-m">Tier dei mazzi</h3>}
            {sortedTiers.length > 0 && <p className="muted small no-m">Misto = qualsiasi tier. Gli altri sono i tier che date ai mazzi (in Giocatori).</p>}
            {sortedTiers.length > 0 && (
              <div className="chips">
                <button className={`tier-chip none ${tier === null ? 'on' : ''}`} onClick={() => setTier(null)}>
                  Misto
                </button>
                {sortedTiers.map((t) => (
                  <button key={t.id} className={`tier-chip ${tier === t.id ? 'on' : ''}`} style={{ ['--tc' as string]: t.color }} onClick={() => setTier(t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <button onClick={randomDecks}>
              <Icon name="dice" size={18} /> Mazzi a caso{tier ? ` (tier ${sortedTiers.find((t) => t.id === tier)?.name})` : ''}
            </button>
            {noDeck.length > 0 && (
              <p className="small neg no-m">
                Nessun mazzo {tier ? `di tier ${sortedTiers.find((t) => t.id === tier)?.name}` : 'attivo'} per {noDeck.map((id) => P[id]?.name).join(', ')}: scegli a mano.
              </p>
            )}
          </div>
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
                  <div className="small clamp2">{D[deckOf[id]] ? <DeckChip d={D[deckOf[id]]} /> : <span className="muted">Scegli il mazzo</span>}</div>
                  {D[deckOf[id]] && D[deckOf[id]].player_id !== id && <div className="muted small">mazzo di {P[D[deckOf[id]].player_id]?.name}</div>}
                </div>
                <span className="change-link">Cambia</span>
              </button>
            ))}
          </div>
          <p className="muted small">L'ordine di selezione è l'ordine di posto al tavolo, in senso orario. Tocca un giocatore per cambiare mazzo.</p>
        </>
      )}

      <h2>Disposizione</h2>
      <LayoutPicker value={layout} onChange={setLayout} />
      {picking && (
        <DeckPicker
          owner={picking}
          initialTier={tier}
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

      <div className="sticky-cta">
        <button className="primary big" disabled={sel.length < 2} onClick={start}>
          <Icon name="play" size={18} /> Inizia partita{pod ? ` in ${pod.name}` : ''}
        </button>
        {sel.length < 2 && <p className="muted small center-text no-m">Scegli almeno 2 giocatori</p>}
      </div>
    </div>
  )
}

function DeckPicker({ owner, value, initialTier, onPick, onClose }: { owner: string; value: string; initialTier: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const { decks, players, tiers } = useStore()
  const P = byId(players)
  const [q, setQ] = useState('')
  const [tier, setTier] = useState<string | null>(initialTier)
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
  // indietro durante la partita (senza finestre aperte): apre il menu Termina / Annulla / …
  useBack(moving === null && !menu && !ending && panel === null && (() => setMenu(true)))

  // scambia due posti; i danni da comandante sono indicizzati per posto, quindi vanno rimappati
  function swap(a: number, b: number) {
    setMoving(null)
    if (a === b) return
    const map = (j: number) => (j === a ? b : j === b ? a : j)
    const remap = (k: string) => k.replace(/^\d+/, (n) => String(map(Number(n)))) // "2p" → "0p"
    const seats = live.seats.map((s) => ({ ...s, cmd: Object.fromEntries(Object.entries(s.cmd).map(([k, v]) => [remap(k), v])) }))
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

  const tile = (i: number, rot: Rot) => (
    <div className="cell" key={i}>
      <SeatTile
        idx={i}
        seat={live.seats[i]}
        player={P[live.seats[i].player_id]}
        deck={D[live.seats[i].deck_id ?? '']}
        rot={rot}
      moving={moving}
      onLife={(d) => change(i, (s) => ({ ...s, life: s.life + d }))}
      onOpen={() => setPanel(i)}
      onHold={() => setMoving(i)}
      onDrop={(target) => target !== null && target !== i && swap(i, target)}
        onTapWhileMoving={() => moving !== null && swap(moving, i)}
      />
    </div>
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
      <Seats layout={layoutOf(live)} n={live.seats.length} tile={tile} />

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
            <div className="field">
              <span>Disposizione</span>
              <LayoutPicker
                value={layoutOf(live)}
                onChange={(layout) => {
                  setLive({ ...live, layout, table: undefined })
                  setMenu(false)
                }}
              />
            </div>
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

// I posti seguono l'ordine di selezione in senso orario (visto dall'alto, telefono in verticale).
// Ogni posto è ruotato verso chi ci siede: 0 = in basso, 90 = lato sinistro, 180 = in alto, 270 = lato destro.
function Seats({ layout, n, tile }: { layout: Layout; n: number; tile: (i: number, rot: Rot) => ReactNode }) {
  const all = Array.from({ length: n }, (_, i) => i)

  if (layout === 'sides') {
    // rettangolo: lato sinistro dal basso verso l'alto, poi lato destro dall'alto verso il basso
    const nl = Math.ceil(n / 2)
    return (
      <div className="seats sides">
        <div className="seat-col">{all.slice(0, nl).reverse().map((i) => tile(i, 90))}</div>
        <div className="seat-col">{all.slice(nl).map((i) => tile(i, 270))}</div>
      </div>
    )
  }

  if (layout === 'square') {
    // un posto in basso, poi lato sinistro, in alto (da 4 giocatori, o con 2), lato destro
    const hasTop = n >= 4 || n === 2
    const sides = n - 1 - (hasTop ? 1 : 0)
    const nl = Math.ceil(sides / 2)
    const left = all.slice(1, 1 + nl)
    const top = hasTop ? 1 + nl : null
    const right = all.slice(1 + nl + (hasTop ? 1 : 0))
    return (
      <div className="seats square">
        {top !== null && <div className="sq-row">{tile(top, 180)}</div>}
        {sides > 0 && (
          <div className="sq-mid" style={{ flex: Math.max(left.length, right.length) > 1 ? 2.2 : 1.3 }}>
            <div className="seat-col">{[...left].reverse().map((i) => tile(i, 90))}</div>
            {right.length > 0 && <div className="seat-col">{right.map((i) => tile(i, 270))}</div>}
          </div>
        )}
        <div className="sq-row">{tile(0, 0)}</div>
      </div>
    )
  }

  if (layout === 'table') {
    const top = Math.ceil(n / 2)
    return (
      <div className="seats table">
        <div className="seat-row">{all.slice(0, top).map((i) => tile(i, 180))}</div>
        <div className="seat-row">{all.slice(top).map((i) => tile(i, 0))}</div>
      </div>
    )
  }

  return <div className={`seats grid n${Math.min(n, 6)}`}>{all.map((i) => tile(i, 0))}</div>
}

function LayoutPicker({ value, onChange }: { value: Layout; onChange: (l: Layout) => void }) {
  return (
    <div className="layout-picker">
      {LAYOUTS.map((l) => (
        <button key={l.id} className={value === l.id ? 'on' : ''} onClick={() => onChange(l.id)}>
          <LayoutIcon layout={l.id} />
          <span>{l.label}</span>
        </button>
      ))}
    </div>
  )
}

// disegnino della disposizione con 4 posti (la tacca indica il lato del giocatore)
function LayoutIcon({ layout }: { layout: Layout }) {
  const r = (x: number, y: number, w: number, h: number, k: number) => <rect key={k} x={x} y={y} width={w} height={h} rx={2} />
  const boxes: Record<Layout, ReactNode[]> = {
    sides: [r(2, 2, 11, 17, 0), r(15, 2, 11, 17, 1), r(2, 21, 11, 17, 2), r(15, 21, 11, 17, 3)],
    square: [r(6, 2, 16, 10, 0), r(2, 14, 11, 12, 1), r(15, 14, 11, 12, 2), r(6, 28, 16, 10, 3)],
    table: [r(2, 2, 11, 17, 0), r(15, 2, 11, 17, 1), r(2, 21, 11, 17, 2), r(15, 21, 11, 17, 3)],
    grid: [r(2, 2, 11, 17, 0), r(15, 2, 11, 17, 1), r(2, 21, 11, 17, 2), r(15, 21, 11, 17, 3)],
  }
  // tacche: verso dove guarda ciascun posto
  const ticks: Record<Layout, [number, number, number, number][]> = {
    sides: [[3, 7, 3, 14], [25, 7, 25, 14], [3, 26, 3, 33], [25, 26, 25, 33]],
    square: [[11, 3, 17, 3], [3, 17, 3, 23], [25, 17, 25, 23], [11, 37, 17, 37]],
    table: [[5, 3, 10, 3], [18, 3, 23, 3], [5, 37, 10, 37], [18, 37, 23, 37]],
    grid: [[5, 18, 10, 18], [18, 18, 23, 18], [5, 37, 10, 37], [18, 37, 23, 37]],
  }
  return (
    <svg viewBox="0 0 28 40" width={28} height={40} className="layout-icon">
      <g fill="currentColor" opacity={0.25}>
        {boxes[layout]}
      </g>
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        {ticks[layout].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
    </svg>
  )
}

const HOLD_MS = 450

function SeatTile({
  idx, seat, player, deck, rot, moving, onLife, onOpen, onHold, onDrop, onTapWhileMoving,
}: {
  idx: number
  seat: Seat
  player?: Player
  deck?: Deck
  rot: Rot
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
      className={`seat r${rot} ${dead ? 'dead' : ''} ${moving === idx ? 'moving' : moving !== null ? 'drop-target' : ''}`}
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
        <p className="muted small">I danni tolgono anche i punti vita. A 21 da uno stesso comandante si è fuori: con i partner ognuno dei due conta a parte.</p>
        {live.seats.map((src, j) => {
          if (j === idx) return null
          const deck = src.deck_id ? D[src.deck_id] : undefined
          // un contatore per comandante: con partner/background due contatori separati
          const sources = [
            { key: String(j), label: deck?.commander ?? P[src.player_id]?.name ?? '?' },
            ...(deck?.partner ? [{ key: `${j}p`, label: deck.partner }] : []),
          ]
          return (
            <div key={j} className="cmd-src line">
              {sources.length > 1 && (
                <div className="row small muted">
                  <Avatar p={P[src.player_id]} size={18} /> {P[src.player_id]?.name}
                </div>
              )}
              {sources.map(({ key, label }) => (
                <div key={key} className="row between cmd-row">
                  <span className="row grow">
                    {sources.length === 1 && <Avatar p={P[src.player_id]} size={22} />}
                    <span className="small">{label}</span>
                  </span>
                  <Stepper
                    value={seat.cmd[key] ?? 0}
                    step={[1, 5]}
                    danger={(seat.cmd[key] ?? 0) >= 21}
                    onChange={(d) =>
                      change((s) => {
                        const cur = s.cmd[key] ?? 0
                        const nv = Math.max(0, cur + d)
                        return { ...s, cmd: { ...s.cmd, [key]: nv }, life: s.life - (nv - cur) }
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )
        })}
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
