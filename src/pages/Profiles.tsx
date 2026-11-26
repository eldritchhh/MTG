import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import type { Deck, Player } from '../lib/types'
import { PLAYER_COLORS, deckLabel } from '../lib/util'
import { loadCommanders, searchCommanders, type Commander } from '../lib/scryfall'
import type { Tier } from '../lib/types'
import { Avatar, DeckArt, DeckCard, Empty, Header, MANA, Modal, Pips, Segmented, SplitArt, deckArts, manaGradient } from '../components'
import { ask } from '../lib/confirm'
import { Icon } from '../icons'
import { useBack } from '../lib/back'
import { useInPod, usePerms } from '../lib/pod'
import { useNav } from '../lib/nav'
import { buzz } from '../lib/prefs'
import { toast } from '../lib/toast'

type PlayerSort = 'name' | 'wins' | 'games'

export default function ProfilesPage() {
  const { players: allPlayers, decks, games } = useStore()
  const players = allPlayers.filter((p) => !p.archived)
  const perms = usePerms()
  const nav = useNav()
  const inPod = useInPod()
  const [sel, setSel] = useState<string | null>(nav.focusPlayer)
  const [editPlayer, setEditPlayer] = useState<Player | 'new' | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<PlayerSort>('name')

  // "I tuoi mazzi" dall'Account apre direttamente il proprio giocatore
  useEffect(() => {
    if (nav.focusPlayer) {
      setSel(nav.focusPlayer)
      nav.clearFocus()
    }
  }, [nav])

  const player = players.find((p) => p.id === sel)
  const allTags = useMemo(() => [...new Set(decks.flatMap((d) => d.tags))].sort(), [decks])
  const stats = useMemo(() => {
    const m: Record<string, { games: number; wins: number }> = {}
    for (const g of games) {
      for (const p of g.participants) (m[p.player_id] ??= { games: 0, wins: 0 }).games++
      if (g.winner_player_id) (m[g.winner_player_id] ??= { games: 0, wins: 0 }).wins++
    }
    return m
  }, [games])

  if (player) return <PlayerDetail player={player} onBack={() => setSel(null)} allTags={allTags} />

  const filtered = tagFilter ? decks.filter((d) => d.tags.includes(tagFilter)) : null
  const st = (id: string) => stats[id] ?? { games: 0, wins: 0 }
  const sorted = [...players].sort((a, b) =>
    sort === 'wins' ? st(b.id).wins - st(a.id).wins || a.name.localeCompare(b.name) : sort === 'games' ? st(b.id).games - st(a.id).games || a.name.localeCompare(b.name) : a.name.localeCompare(b.name),
  )
  const activeDecks = decks.filter((d) => players.some((p) => p.id === d.player_id))

  return (
    <div className="stack">
      <Header
        title="Giocatori"
        sub={`${players.length} giocatori · ${activeDecks.length} comandanti`}
        action={
          perms.admin && (
            <button className="primary" onClick={() => setEditPlayer('new')}>
              <Icon name="plus" size={18} /> Giocatore
            </button>
          )
        }
      />

      {players.length === 0 && (
        <Empty icon="users" action={perms.admin ? { label: 'Aggiungi un giocatore', run: () => setEditPlayer('new') } : undefined}>
          Nessun giocatore ancora.
        </Empty>
      )}

      {players.length > 1 && (
        <div className="row between">
          <span className="muted small">Ordina</span>
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { id: 'name', label: 'Nome' },
              { id: 'wins', label: 'Vittorie' },
              { id: 'games', label: 'Partite' },
            ]}
          />
        </div>
      )}

      <div className="list">
        {sorted.map((p) => {
          const n = decks.filter((d) => d.player_id === p.id).length
          const { games: played, wins } = st(p.id)
          return (
            <button key={p.id} className="list-item player-item" style={{ ['--pc' as string]: p.color }} onClick={() => setSel(p.id)}>
              <Avatar p={p} size={44} />
              <div className="grow">
                <div className="strong">{p.name}</div>
                <div className="row small muted wrap">
                  <span>
                    {played} partit{played === 1 ? 'a' : 'e'} · {played ? Math.round((wins / played) * 100) : 0}% vittorie
                  </span>
                  <span className="dot" />
                  <span className="row gap4">
                    <Icon name="trophy" size={13} /> {wins}
                  </span>
                  <span className="dot" />
                  <span>
                    {n} comandant{n === 1 ? 'e' : 'i'}
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

      {editPlayer && <PlayerForm player={editPlayer === 'new' ? null : editPlayer} onClose={() => setEditPlayer(null)} inPod={inPod} />}
    </div>
  )
}

type SortKey = 'name' | 'color' | 'tier'
const WUBRG = 'WUBRG'.split('')
// mono prima, poi bicolori…; a parità di numero di colori in ordine WUBRG
const colorKey = (d: Deck) => `${d.colors.length}${d.colors.map((c) => WUBRG.indexOf(c)).join('')}`

function PlayerDetail({ player, onBack, allTags }: { player: Player; onBack: () => void; allTags: string[] }) {
  const { decks, games, tiers } = useStore()
  const perms = usePerms()
  const [editDeck, setEditDeck] = useState<Deck | 'new' | null>(null)
  const [editPlayer, setEditPlayer] = useState(false)
  const [sort, setSort] = useState<SortKey>('name')
  const [tierF, setTierF] = useState<string | 'none' | null>(null)
  const [colorsF, setColorsF] = useState<string[]>([])
  const [exact, setExact] = useState(false)
  useBack(onBack)
  const mine = decks.filter((d) => d.player_id === player.id)
  const sortedTiers = [...tiers].sort((a, b) => a.sort_order - b.sort_order)
  const tierPos = (id: string | null) => sortedTiers.findIndex((t) => t.id === id) >>> 0 // nessun tier = in fondo

  const byColor = (d: Deck) => (exact ? d.colors.length === colorsF.length : true) && colorsF.every((c) => d.colors.includes(c))
  const byTier = (d: Deck) => tierF === null || (tierF === 'none' ? !d.tier_id : d.tier_id === tierF)
  const shown = mine
    .filter((d) => byTier(d) && byColor(d))
    .sort((a, b) => {
      const name = deckLabel(a).localeCompare(deckLabel(b))
      if (sort === 'color') return colorKey(a).localeCompare(colorKey(b)) || name
      if (sort === 'tier') return tierPos(a.tier_id) - tierPos(b.tier_id) || name
      return name
    })
  // conteggi sui filtri: quanti mazzi per tier (con i colori scelti) e per colore (con il tier scelto)
  const nTier = (id: string | 'none') => mine.filter((d) => byColor(d) && (id === 'none' ? !d.tier_id : d.tier_id === id)).length
  const nColor = (c: string) => mine.filter((d) => byTier(d) && d.colors.includes(c)).length
  const filtering = tierF !== null || colorsF.length > 0

  return (
    <div className="stack">
      <button className="link row gap4" onClick={onBack}>
        <Icon name="back" size={16} /> Giocatori
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
        {perms.player(player.id) && (
          <button className="icon-btn" onClick={() => setEditPlayer(true)} aria-label="Modifica">
            <Icon name="edit" size={17} />
          </button>
        )}
      </div>
      <div className="row between">
        <h2 className="section">Comandanti</h2>
        {perms.addDeckFor(player.id) && (
          <button className="primary" onClick={() => setEditDeck('new')}>
            <Icon name="plus" size={18} /> Comandante
          </button>
        )}
      </div>
      {mine.length === 0 && (
        <Empty action={perms.addDeckFor(player.id) ? { label: 'Aggiungi un comandante', run: () => setEditDeck('new') } : undefined}>Nessun comandante ancora.</Empty>
      )}
      {mine.length > 1 && (
        <div className="card stack-sm deck-filters">
          <div className="row between">
            <span className="muted small">Ordina</span>
            <Segmented
              value={sort}
              onChange={setSort}
              options={[
                { id: 'name', label: 'Nome' },
                { id: 'color', label: 'Colore' },
                { id: 'tier', label: 'Tier' },
              ]}
            />
          </div>
          {sortedTiers.length > 0 && (
            <div className="chips">
              {sortedTiers.map((t) => (
                <button key={t.id} className={`tier-chip ${tierF === t.id ? 'on' : ''}`} style={{ ['--tc' as string]: t.color }} onClick={() => setTierF(tierF === t.id ? null : t.id)}>
                  {t.name} <span className="count">{nTier(t.id)}</span>
                </button>
              ))}
              {nTier('none') > 0 && (
                <button className={`tier-chip none ${tierF === 'none' ? 'on' : ''}`} onClick={() => setTierF(tierF === 'none' ? null : 'none')}>
                  Senza tier <span className="count">{nTier('none')}</span>
                </button>
              )}
            </div>
          )}
          <div className="row wrap">
            {WUBRG.map((c) => (
              <button
                key={c}
                className={`mana-btn sm ${colorsF.includes(c) ? 'on' : ''}`}
                style={{ background: MANA[c] }}
                aria-label={`Filtra colore ${c}`}
                onClick={() => setColorsF(colorsF.includes(c) ? colorsF.filter((x) => x !== c) : WUBRG.filter((x) => x === c || colorsF.includes(x)))}
              >
                {c}
                <span className="mana-count">{nColor(c)}</span>
              </button>
            ))}
            {colorsF.length > 0 && (
              <Segmented
                value={exact ? 'exact' : 'has'}
                onChange={(v) => setExact(v === 'exact')}
                options={[
                  { id: 'has', label: 'Contiene' },
                  { id: 'exact', label: 'Esatti' },
                ]}
              />
            )}
          </div>
          {filtering && (
            <div className="row between small">
              <span className="muted">
                {shown.length} di {mine.length} comandanti
              </span>
              <button
                className="link small"
                onClick={() => {
                  setTierF(null)
                  setColorsF([])
                }}
              >
                Togli filtri
              </button>
            </div>
          )}
        </div>
      )}
      {filtering && shown.length === 0 && <p className="muted small">Nessun comandante con questi filtri.</p>}
      <div className="deck-grid">
        {shown.map((d) => (
          <DeckCard key={d.id} d={d} onClick={perms.deck(d) ? () => setEditDeck(d) : undefined} />
        ))}
      </div>
      {editDeck && (
        <DeckForm deck={editDeck === 'new' ? null : editDeck} playerId={player.id} allTags={allTags} onClose={() => setEditDeck(null)} />
      )}
      {editPlayer && <PlayerForm player={player} onClose={() => setEditPlayer(false)} onDeleted={onBack} />}
    </div>
  )
}

function PlayerForm({ player, onClose, onDeleted, inPod = '' }: { player: Player | null; onClose: () => void; onDeleted?: () => void; inPod?: string }) {
  const { add, update, players } = useStore()
  const perms = usePerms()
  const [name, setName] = useState(player?.name ?? '')
  const [color, setColor] = useState(player?.color ?? PLAYER_COLORS[players.length % PLAYER_COLORS.length])

  async function save() {
    if (!name.trim()) return
    if (player) await update('players', player.id, { name: name.trim(), color })
    else await add('players', { name: name.trim(), color })
    onClose()
  }

  return (
    <Modal title={player ? 'Modifica giocatore' : `Nuovo giocatore${inPod}`} onClose={onClose}>
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
        {player && perms.admin && (
          <>
            <button
              className="danger"
              onClick={async () => {
                // non si cancella davvero: sparisce dalle liste, partite, debiti e scambi restano
                await update('players', player.id, { archived: true })
                buzz()
                onClose()
                onDeleted?.()
                toast(`${player.name} eliminato dai giocatori`, { action: { label: 'Annulla', run: () => void update('players', player.id, { archived: false }) } })
              }}
            >
              Elimina giocatore
            </button>
            <p className="muted small no-m center-text">Le sue partite, i debiti e gli scambi restano nello storico.</p>
          </>
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
  const [partnerImage, setPartnerImage] = useState<string | null>(deck?.partner_image_url ?? null)
  const [notes, setNotes] = useState(deck?.notes ?? '')
  const [active, setActive] = useState(deck?.active ?? true)
  const [sugg, setSugg] = useState<(Commander & { printed?: string })[]>([])
  const [focus, setFocus] = useState<'c' | 'p' | null>(null)

  // mazzi creati prima dell'immagine del partner: la recupero dalla lista comandanti
  useEffect(() => {
    if (!deck?.partner || deck.partner_image_url) return
    loadCommanders()
      .then((l) => setPartnerImage((cur) => cur ?? l.cards.find((c) => c.name === deck.partner)?.art ?? null))
      .catch(() => {})
  }, [deck])

  const query = focus === 'p' ? partner : commander
  useEffect(() => {
    if (!focus) return
    let stale = false
    const t = setTimeout(() => {
      searchCommanders(query, { pairOnly: focus === 'p' })
        .then((s) => !stale && setSugg(s))
        .catch(() => !stale && setSugg([]))
    }, 80)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [query, focus])

  function pick(c: Commander) {
    const which = focus
    setSugg([])
    setFocus(null)
    if (which === 'p') {
      setPartner(c.name)
      setPartnerImage(c.art)
    } else {
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
      partner_image_url: partner.trim() ? partnerImage : null,
      notes: notes.trim() || null,
      tier_id: tierId,
      active,
    }
    if (deck) await update('decks', deck.id, row)
    else await add('decks', row)
    onClose()
  }

  const previewArts = deckArts({ image_url: image, partner_image_url: partner.trim() ? partnerImage : null })
  const tagSugg = allTags.filter((t) => !tags.includes(t) && t.includes(tagInput.toLowerCase())).slice(0, 8)

  return (
    <Modal title={deck ? 'Modifica comandante' : 'Nuovo comandante'} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Comandante</span>
          <div className="ac">
            <input
              placeholder="Es. Atraxa, Praetors' Voice"
              value={commander}
              onChange={(e) => setCommander(e.target.value)}
              onFocus={() => setFocus('c')}
            />
            {focus === 'c' && <Suggestions items={sugg} onPick={pick} query={commander} />}
          </div>
        </label>
        <label className="field">
          <span>Partner / Background (opzionale)</span>
          <div className="ac">
            <input
              value={partner}
              onChange={(e) => {
                setPartner(e.target.value)
                if (!e.target.value.trim()) setPartnerImage(null)
              }}
              onFocus={() => setFocus('p')}
            />
            {focus === 'p' && <Suggestions items={sugg} onPick={pick} query={partner} />}
          </div>
        </label>
        {previewArts.length > 0 && <SplitArt urls={previewArts} className="art preview" />}
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

function Suggestions({ items, onPick, query }: { items: (Commander & { printed?: string })[]; onPick: (c: Commander) => void; query: string }) {
  if (query.trim().length < 2) return null
  if (!items.length) return <div className="ac-list ac-empty muted small">Nessun comandante trovato. Puoi comunque scrivere il nome a mano.</div>
  return (
    <div className="ac-list">
      {items.map((c) => (
        <button key={c.name} className="ac-item" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c)}>
          <span className="ac-art" style={c.art ? { backgroundImage: `url(${c.art})` } : { backgroundImage: manaGradient(c.colors, 0.8) }} />
          <span className="grow">
            {c.name}
            {c.printed && c.printed !== c.name && <span className="muted small"> · {c.printed}</span>}
          </span>
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
