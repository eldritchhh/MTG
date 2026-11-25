import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import type { Game } from '../lib/types'
import { byId, dateIt, deckLabel } from '../lib/util'
import { Avatar, DeckArt, Empty, Header, MANA, Modal, Pips, Segmented, TierBadge } from '../components'
import { ask } from '../lib/confirm'
import { Icon } from '../icons'
import { usePerms } from '../lib/pod'

type Row = { key: string; games: number; wins: number }
const pct = (r: Row) => (r.games ? Math.round((r.wins / r.games) * 100) : 0)

export default function StatsPage() {
  const { games, players, decks, tiers } = useStore()
  const [view, setView] = useState<'decks' | 'players' | 'tags' | 'history'>('decks')
  const [tier, setTier] = useState<string | null>(null)
  const sortedTiers = [...tiers].sort((a, b) => a.sort_order - b.sort_order)
  const [period, setPeriod] = useState<'all' | '90' | '30'>('all')
  const [detail, setDetail] = useState<Game | null>(null)
  const P = byId(players)
  const D = byId(decks)

  // tier del mazzo al momento della partita (se non salvato, quello attuale)
  const tierOf = (p: Game['participants'][number]) => p.tier_id ?? (p.deck_id ? D[p.deck_id]?.tier_id : null) ?? null
  // con un tier selezionato contano solo le partecipazioni con mazzi di quel tier
  const counts = (p: Game['participants'][number]) => !tier || tierOf(p) === tier

  const gs = useMemo(() => {
    const since = period === 'all' ? 0 : Date.now() - Number(period) * 86400000
    return games.filter((g) => new Date(g.played_at).getTime() >= since && g.participants.some(counts))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, period, tier, D])

  const stats = useMemo(() => {
    const byPlayer: Record<string, Row> = {}
    const byDeck: Record<string, Row> = {}
    const byTag: Record<string, Row> = {}
    const byColor: Record<string, Row> = {}
    const bump = (m: Record<string, Row>, k: string, win: boolean) => {
      m[k] ??= { key: k, games: 0, wins: 0 }
      m[k].games++
      if (win) m[k].wins++
    }
    for (const g of gs) {
      for (const p of g.participants) {
        if (!counts(p)) continue
        const win = g.winner_player_id === p.player_id
        bump(byPlayer, p.player_id, win)
        const d = p.deck_id ? D[p.deck_id] : undefined
        if (d) {
          bump(byDeck, d.id, win)
          d.tags.forEach((t) => bump(byTag, t, win))
          ;(d.colors.length ? d.colors : ['C']).forEach((c) => bump(byColor, c, win))
        }
      }
    }
    const sort = (m: Record<string, Row>) => Object.values(m).sort((a, b) => b.wins - a.wins || pct(b) - pct(a) || b.games - a.games)
    const durs = gs.map((g) => g.duration_min).filter((x): x is number => !!x)
    return {
      players: sort(byPlayer),
      decks: sort(byDeck),
      tags: sort(byTag),
      colors: sort(byColor),
      avgDur: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
      avgPod: gs.length ? (gs.reduce((a, g) => a + g.participants.length, 0) / gs.length).toFixed(1) : null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs, D, tier])

  return (
    <div className="stack">
      <Header title="Statistiche" sub="Chi domina il tavolo" />
      <Segmented
        value={period}
        onChange={setPeriod}
        options={[
          { id: 'all', label: 'Sempre' },
          { id: '90', label: '90 giorni' },
          { id: '30', label: '30 giorni' },
        ]}
      />
      {sortedTiers.length > 0 && (
        <div className="chips">
          <button className={`tier-chip none ${tier === null ? 'on' : ''}`} onClick={() => setTier(null)}>
            Tutti i tier
          </button>
          {sortedTiers.map((t) => (
            <button key={t.id} className={`tier-chip ${tier === t.id ? 'on' : ''}`} style={{ ['--tc' as string]: t.color }} onClick={() => setTier(tier === t.id ? null : t.id)}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="kpis">
        <div className="card kpi">
          <Icon name="cards" size={18} className="gold" />
          <b>{gs.length}</b>
          <span>partite</span>
        </div>
        <div className="card kpi">
          <Icon name="clock" size={18} className="gold" />
          <b>{stats.avgDur ?? '—'}</b>
          <span>min medi</span>
        </div>
        <div className="card kpi">
          <Icon name="users" size={18} className="gold" />
          <b>{stats.avgPod ?? '—'}</b>
          <span>giocatori/partita</span>
        </div>
      </div>

      {gs.length === 0 ? (
        <Empty icon="chart">
          {tier ? 'Nessuna partita con mazzi di questo tier nel periodo scelto.' : 'Ancora nessuna partita salvata. Gioca dalla scheda Partita e premi "Termina e salva".'}
        </Empty>
      ) : (
        <>
          {stats.decks[0] && D[stats.decks[0].key] && (
            <div className="champion">
              <DeckArt d={D[stats.decks[0].key]} className="champ-art" />
              <div className="champ-body">
                <div className="eyebrow">
                  <Icon name="trophy" size={14} /> Mazzo campione
                </div>
                <div className="champ-name">{deckLabel(D[stats.decks[0].key])}</div>
                <div className="row small">
                  <Pips colors={D[stats.decks[0].key].colors} />
                  <span className="muted">di {P[D[stats.decks[0].key].player_id]?.name}</span>
                </div>
                <div className="champ-stats">
                  <b>{stats.decks[0].wins}</b> vittorie su {stats.decks[0].games} · <b>{pct(stats.decks[0])}%</b>
                </div>
              </div>
            </div>
          )}
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { id: 'decks', label: 'Mazzi' },
              { id: 'players', label: 'Giocatori' },
              { id: 'tags', label: 'Tag' },
              { id: 'history', label: 'Storico' },
            ]}
          />

          {view === 'decks' && (
            <Table
              rows={stats.decks}
              label={(k) => (
                <span className="stack-sm">
                  <span className="row gap6">
                    <TierBadge id={D[k]?.tier_id} small />
                    <span className="strong">{deckLabel(D[k])}</span>
                  </span>
                  <span className="row small muted">
                    <Pips colors={D[k]?.colors ?? []} size={14} /> {P[D[k]?.player_id]?.name}
                  </span>
                </span>
              )}
            />
          )}
          {view === 'players' && (
            <Table
              rows={stats.players}
              label={(k) => (
                <span className="row">
                  <Avatar p={P[k]} size={22} /> {P[k]?.name ?? 'eliminato'}
                </span>
              )}
            />
          )}
          {view === 'tags' && (
            <>
              <h2 className="section">Colori</h2>
              <Table
                rows={stats.colors}
                label={(k) => (
                  <span className="row">
                    <span className="pip" style={{ background: MANA[k] }} /> {COLOR_NAMES[k] ?? k}
                  </span>
                )}
              />
              <h2 className="section">Tag</h2>
              {stats.tags.length ? <Table rows={stats.tags} label={(k) => `#${k}`} /> : <Empty>Nessun tag sui mazzi giocati.</Empty>}
            </>
          )}
          {view === 'history' && (
            <div className="list">
              {[...gs]
                .sort((a, b) => b.played_at.localeCompare(a.played_at))
                .map((g) => (
                  <button key={g.id} className="list-item" onClick={() => setDetail(g)}>
                    <div className="grow">
                      <div>
                        <Icon name="trophy" size={14} className="gold" /> <b>{g.winner_player_id ? P[g.winner_player_id]?.name : 'nessuno'}</b>
                        {(() => {
                          const w = g.participants.find((p) => p.player_id === g.winner_player_id)
                          return w?.deck_id && D[w.deck_id] ? <span className="muted"> con {deckLabel(D[w.deck_id])}</span> : null
                        })()}
                      </div>
                      <div className="muted small">
                        {dateIt(g.played_at)} · {g.participants.length} giocatori{g.duration_min ? ` · ${g.duration_min} min` : ''}
                      </div>
                    </div>
                    <Icon name="chevron" size={18} className="muted" />
                  </button>
                ))}
            </div>
          )}
        </>
      )}
      {detail && <GameDetail g={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

const COLOR_NAMES: Record<string, string> = { W: 'Bianco', U: 'Blu', B: 'Nero', R: 'Rosso', G: 'Verde', C: 'Incolore' }

function Table({ rows, label }: { rows: Row[]; label: (k: string) => React.ReactNode }) {
  const max = Math.max(1, ...rows.map((r) => r.games))
  return (
    <div className="card table">
      <div className="trow head">
        <span>Nome</span>
        <span>Giocate</span>
        <span>Vinte</span>
        <span>%</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="trow">
          <span className="tname">
            {label(r.key)}
            <span className="bar">
              <i style={{ width: `${(r.games / max) * 100}%` }} />
              <i className="w" style={{ width: `${(r.wins / max) * 100}%` }} />
            </span>
          </span>
          <span>{r.games}</span>
          <span>{r.wins}</span>
          <span className="strong">{pct(r)}%</span>
        </div>
      ))}
    </div>
  )
}

function GameDetail({ g, onClose }: { g: Game; onClose: () => void }) {
  const { players, decks, remove } = useStore()
  const perms = usePerms()
  const P = byId(players)
  const D = byId(decks)
  const order = [...g.participants].sort((a, b) => {
    if (a.player_id === g.winner_player_id) return -1
    if (b.player_id === g.winner_player_id) return 1
    return (b.eliminated_order ?? 99) - (a.eliminated_order ?? 99)
  })
  return (
    <Modal title={`Partita del ${dateIt(g.played_at)}`} onClose={onClose}>
      <div className="stack">
        <div className="list">
          {order.map((p) => (
            <div key={p.player_id} className="list-item static">
              <Avatar p={P[p.player_id]} />
              <div className="grow">
                <div className="strong">
                  {p.player_id === g.winner_player_id && <Icon name="trophy" size={14} className="gold" />} 
                  {P[p.player_id]?.name ?? '?'}
                </div>
                <div className="muted small">{p.deck_id ? deckLabel(D[p.deck_id]) : 'nessun mazzo'}</div>
              </div>
              <span className="muted">{p.final_life} ♥</span>
            </div>
          ))}
        </div>
        <div className="muted small">
          Vita iniziale {g.starting_life}
          {g.duration_min ? ` · durata ${g.duration_min} min` : ''}
        </div>
        {g.notes && <p>{g.notes}</p>}
        {perms.game(g) && (
          <button
            className="danger"
            onClick={async () => {
              if (!(await ask('Eliminare questa partita dalle statistiche?'))) return
              await remove('games', g.id)
              onClose()
            }}
          >
            Elimina partita
          </button>
        )}
      </div>
    </Modal>
  )
}
