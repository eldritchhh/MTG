import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import type { Deck, Player } from '../lib/types'
import { PLAYER_COLORS } from '../lib/util'
import { getCommanderList, searchCommanders, type Commander } from '../lib/scryfall'
import type { Tier } from '../lib/types'
import { Avatar, DeckArt, DeckCard, Empty, Header, MANA, Modal, Pips, manaGradient } from '../components'
import { ask } from '../lib/confirm'
import { Icon } from '../icons'

export default function ProfilesPage() {
  const { players, decks, games } = useStore()
  const [sel, setSel] = useState<string | null>(null)
  const [editPlayer, setEditPlayer] = useState<Player | 'new' | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const player = players.find((p) => p.id === sel)
  const allTags = useMemo(() => [...new Set(decks.flatMap((d) => d.tags))].sort(), [decks])

  if (player) return <PlayerDetail player={player} onBack={() => setSel(null)} allTags={allTags} />

  const filtered = tagFilter ? decks.filter((d) => d.tags.includes(tagFilter)) : null

  return (
    <div className="stack">
      <Header
        title="Profili"
        sub={`${players.length} giocatori · ${decks.length} comandanti`}
        action={
          <button className="primary" onClick={() => setEditPlayer('new')}>
            <Icon name="plus" size={18} /> Giocatore
          </button>
        }
      />

      {players.length === 0 && <Empty icon="users">Aggiungi te e i tuoi amici per iniziare.</Empty>}

      <div className="list">
        {players.map((p) => {
          const n = decks.filter((d) => d.player_id === p.id).length
          const wins = games.filter((g) => g.winner_player_id === p.id).length
          return (
            <button key={p.id} className="list-item player-item" style={{ ['--pc' as string]: p.color }} onClick={() => setSel(p.id)}>
              <Avatar p={p} size={44} />
              <div className="grow">
                <div className="strong">{p.name}</div>
                <div className="row small muted">
                  <span>
                    {n} comandant{n === 1 ? 'e' : 'i'}
                  </span>
                  <span className="dot" />
                  <span className="row gap4">
                    <Icon name="trophy" size={13} /> {wins}
                  </span>
                </div>
              </div>
              <div className="pip-stack">
                {decks
                  .filter((d) => d.player_id === p.id)
                  .slice(0, 3)
                  .map((d) => (
                    <DeckArt key={d.id} d={d} className="mini-art" />
                  ))}
              </div>
              <Icon name="chevron" size={18} className="muted" />
            </button>
          )
        })}
      </div>

      {allTags.length > 0 && (
        <>
          <h2 className="section">
            <Icon name="tag" size={16} /> Cerca per tag
          </h2>
          <div className="chips">
            {allTags.map((t) => (
              <button key={t} className={`chip ${tagFilter === t ? 'on' : ''}`} onClick={() => setTagFilter(tagFilter === t ? null : t)}>
                #{t}
              </button>
            ))}
          </div>
          {filtered && (
            <div className="deck-grid">
              {filtered.map((d) => (
                <DeckCard key={d.id} d={d} owner={players.find((p) => p.id === d.player_id)} />
              ))}
            </div>
          )}
        </>
      )}

      {editPlayer && <PlayerForm player={editPlayer === 'new' ? null : editPlayer} onClose={() => setEditPlayer(null)} />}
    </div>
  )
}

function PlayerDetail({ player, onBack, allTags }: { player: Player; onBack: () => void; allTags: string[] }) {
  const { decks, games } = useStore()
  const [editDeck, setEditDeck] = useState<Deck | 'new' | null>(null)
  const [editPlayer, setEditPlayer] = useState(false)
  const mine = decks.filter((d) => d.player_id === player.id)

  return (
    <div className="stack">
      <button className="link row gap4" onClick={onBack}>
        <Icon name="back" size={16} /> Profili
      </button>
      <div className="profile-hero" style={{ ['--pc' as string]: player.color }}>
        <Avatar p={player} size={64} />
        <div className="grow">
          <h1>{player.name}</h1>
          <div className="page-sub">
            {mine.length} comandanti · {games.filter((g) => g.participants.some((x) => x.player_id === player.id)).length} partite ·{' '}
            {games.filter((g) => g.winner_player_id === player.id).length} vittorie
          </div>
        </div>
        <button className="icon-btn" onClick={() => setEditPlayer(true)} aria-label="Modifica">
          <Icon name="edit" size={17} />
        </button>
      </div>
      <div className="row between">
        <h2 className="section">Comandanti</h2>
        <button className="primary" onClick={() => setEditDeck('new')}>
          <Icon name="plus" size={18} /> Comandante
        </button>
      </div>
      {mine.length === 0 && <Empty>Nessun comandante ancora.</Empty>}
      <div className="deck-grid">
        {mine.map((d) => (
          <DeckCard key={d.id} d={d} onClick={() => setEditDeck(d)} />
        ))}
      </div>
      {editDeck && (
        <DeckForm deck={editDeck === 'new' ? null : editDeck} playerId={player.id} allTags={allTags} onClose={() => setEditDeck(null)} />
      )}
      {editPlayer && <PlayerForm player={player} onClose={() => setEditPlayer(false)} onDeleted={onBack} />}
    </div>
  )
}

function PlayerForm({ player, onClose, onDeleted }: { player: Player | null; onClose: () => void; onDeleted?: () => void }) {
  const { add, update, remove, players } = useStore()
  const [name, setName] = useState(player?.name ?? '')
  const [color, setColor] = useState(player?.color ?? PLAYER_COLORS[players.length % PLAYER_COLORS.length])

  async function save() {
    if (!name.trim()) return
    if (player) await update('players', player.id, { name: name.trim(), color })
    else await add('players', { name: name.trim(), color })
    onClose()
  }

  return (
    <Modal title={player ? 'Modifica giocatore' : 'Nuovo giocatore'} onClose={onClose}>
      <div className="stack">
        <input autoFocus placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="chips">
          {PLAYER_COLORS.map((c) => (
            <button key={c} className={`swatch ${c === color ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
        <button className="primary" onClick={save}>
          Salva
        </button>
        {player && (
          <button
            className="danger"
            onClick={async () => {
              if (!(await ask(`Eliminare ${player.name}? Verranno eliminati anche i suoi mazzi, debiti e prestiti.`))) return
              await remove('players', player.id)
              onClose()
              onDeleted?.()
            }}
          >
            Elimina giocatore
          </button>
        )}
      </div>
    </Modal>
  )
}

function DeckForm({ deck, playerId, allTags, onClose }: { deck: Deck | null; playerId: string; allTags: string[]; onClose: () => void }) {
  const { add, update, remove, tiers } = useStore()
  const [tierId, setTierId] = useState<string | null>(deck?.tier_id ?? null)
  const [commander, setCommander] = useState(deck?.commander ?? '')
  const [partner, setPartner] = useState(deck?.partner ?? '')
  const [colors, setColors] = useState<string[]>(deck?.colors ?? [])
  const [tags, setTags] = useState<string[]>(deck?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [image, setImage] = useState<string | null>(deck?.image_url ?? null)
  const [notes, setNotes] = useState(deck?.notes ?? '')
  const [active, setActive] = useState(deck?.active ?? true)
  const [sugg, setSugg] = useState<Commander[]>([])
  const [searching, setSearching] = useState(false)
  const hasList = !!getCommanderList()
  const [focus, setFocus] = useState<'c' | 'p' | null>(null)

  const query = focus === 'p' ? partner : commander
  useEffect(() => {
    if (!focus) return
    const ac = new AbortController()
    const t = setTimeout(
      () => {
        setSearching(true)
        searchCommanders(query, { pairOnly: focus === 'p', signal: ac.signal })
          .then(setSugg)
          .catch(() => setSugg([]))
          .finally(() => setSearching(false))
      },
      hasList ? 0 : 300,
    )
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [query, focus, hasList])

  function pick(c: Commander) {
    const which = focus
    setSugg([])
    setFocus(null)
    if (which === 'p') setPartner(c.name)
    else {
      setCommander(c.name)
      setImage(c.art) // di default l'illustrazione del comandante
    }
    setColors((prev) => {
      const s = new Set(which === 'p' ? [...prev, ...c.colors] : [...c.colors, ...(partner ? prev : [])])
      return 'WUBRG'.split('').filter((x) => s.has(x))
    })
  }

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/^#/, '')
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }

  async function save() {
    if (!commander.trim()) return
    const row = {
      player_id: playerId,
      commander: commander.trim(),
      partner: partner.trim() || null,
      colors,
      tags: tagInput.trim() ? [...new Set([...tags, tagInput.trim().toLowerCase()])] : tags,
      image_url: image,
      notes: notes.trim() || null,
      tier_id: tierId,
      active,
    }
    if (deck) await update('decks', deck.id, row)
    else await add('decks', row)
    onClose()
  }

  const tagSugg = allTags.filter((t) => !tags.includes(t) && t.includes(tagInput.toLowerCase())).slice(0, 8)

  return (
    <Modal title={deck ? 'Modifica comandante' : 'Nuovo comandante'} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Comandante {hasList ? '' : <em className="hint">· ricerca online, scarica la lista da Altro per averla offline</em>}</span>
          <div className="ac">
            <input
              placeholder="Es. Atraxa, Praetors' Voice"
              value={commander}
              onChange={(e) => setCommander(e.target.value)}
              onFocus={() => setFocus('c')}
            />
            {focus === 'c' && <Suggestions items={sugg} onPick={pick} searching={searching} query={commander} />}
          </div>
        </label>
        <label className="field">
          <span>Partner / Background (opzionale)</span>
          <div className="ac">
            <input value={partner} onChange={(e) => setPartner(e.target.value)} onFocus={() => setFocus('p')} />
            {focus === 'p' && <Suggestions items={sugg} onPick={pick} searching={searching} query={partner} />}
          </div>
        </label>
        {image && <div className="art preview" style={{ backgroundImage: `url(${image})` }} />}
        <div className="field">
          <span>Identità di colore</span>
          <div className="chips">
            {'WUBRG'.split('').map((c) => (
              <button
                key={c}
                className={`mana-btn ${colors.includes(c) ? 'on' : ''}`}
                style={{ background: MANA[c] }}
                onClick={() => setColors(colors.includes(c) ? colors.filter((x) => x !== c) : 'WUBRG'.split('').filter((x) => x === c || colors.includes(x)))}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Tier</span>
          <TierPicker tiers={tiers} value={tierId} onChange={setTierId} />
        </div>
        <div className="field">
          <span>Tag</span>
          <div className="chips">
            {tags.map((t) => (
              <button key={t} className="chip on" onClick={() => setTags(tags.filter((x) => x !== t))}>
                #{t} ✕
              </button>
            ))}
          </div>
          <input
            placeholder="aggiungi tag (es. aggro, tribale, budget) + Invio"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addTag(tagInput)
              }
            }}
          />
          {tagSugg.length > 0 && (
            <div className="chips">
              {tagSugg.map((t) => (
                <button key={t} className="chip" onClick={() => addTag(t)}>
                  + #{t}
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="field">
          <span>Note</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Link alla lista, power level…" />
        </label>
        <label className="row">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Mazzo attivo
        </label>
        <button className="primary" onClick={save}>
          Salva
        </button>
        {deck && (
          <button
            className="danger"
            onClick={async () => {
              if (!(await ask('Eliminare questo comandante? Le partite giocate restano, ma senza il mazzo. Meglio "ritirarlo" togliendo "Mazzo attivo".'))) return
              await remove('decks', deck.id)
              onClose()
            }}
          >
            Elimina
          </button>
        )}
      </div>
    </Modal>
  )
}

function Suggestions({ items, onPick, searching, query }: { items: Commander[]; onPick: (c: Commander) => void; searching: boolean; query: string }) {
  if (query.trim().length < 2) return null
  if (!items.length)
    return <div className="ac-list ac-empty muted small">{searching ? 'Cerco tra i comandanti…' : 'Nessun comandante trovato. Puoi comunque scrivere il nome a mano.'}</div>
  return (
    <div className="ac-list">
      {items.map((c) => (
        <button key={c.name} className="ac-item" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c)}>
          <span className="ac-art" style={c.art ? { backgroundImage: `url(${c.art})` } : { backgroundImage: manaGradient(c.colors, 0.8) }} />
          <span className="grow">{c.name}</span>
          <Pips colors={c.colors} size={14} />
        </button>
      ))}
    </div>
  )
}

export function TierPicker({ tiers, value, onChange }: { tiers: Tier[]; value: string | null; onChange: (id: string | null) => void }) {
  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order)
  if (!sorted.length) return <p className="muted small">Nessun tier definito: aggiungili da Altro → Tier.</p>
  return (
    <div className="chips">
      {sorted.map((t) => (
        <button key={t.id} className={`tier-chip ${value === t.id ? 'on' : ''}`} style={{ ['--tc' as string]: t.color }} onClick={() => onChange(value === t.id ? null : t.id)}>
          {t.name}
        </button>
      ))}
      <button className={`tier-chip none ${value === null ? 'on' : ''}`} onClick={() => onChange(null)}>
        Nessuno
      </button>
    </div>
  )
}
