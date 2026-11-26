// Scambi › Carte: panoramica dei conti, conto con una persona, storico
import { useEffect, useState } from 'react'
import { useMe, useStore } from '../../lib/store'
import type { CardLoan } from '../../lib/types'
import { accounts, copies, held, markSeen, newCount, sum, valueNow } from '../../lib/cards'
import { eurCents, STALE } from '../../lib/prices'
import { dateIt, eur } from '../../lib/util'
import { Avatar, Empty, Modal, Screen } from '../../components'
import { usePod, usePerms } from '../../lib/pod'
import { withUndo } from '../../lib/toast'
import { buzz } from '../../lib/prefs'
import { CardName } from './CardParts'
import { AddCards } from './AddCards'
import { SettleSheet, SettlementDetail } from './Settle'
import { pricesAge, usePrices } from './ops'
import { Icon } from '../../icons'

export function CardsTab() {
  const { players, card_loans } = useStore()
  const [me] = useMe()
  const pod = usePod()
  const [add, setAdd] = useState(false)
  const [conto, setConto] = useState<string | null>(null)
  const [history, setHistory] = useState(false)
  const prices = usePrices(card_loans.filter((l) => l.status === 'open').map((l) => l.name))
  const age = pricesAge(prices)
  const P = (id: string) => players.find((p) => p.id === id)

  if (!me) return <Empty icon="cards">Scegli chi sei (Account) per vedere il tuo conto carte.</Empty>

  const accs = accounts(me, card_loans)
  const theirs = card_loans.filter((l) => l.status === 'open' && l.holder_player === me)
  const mine = card_loans.filter((l) => l.status === 'open' && l.owner_player === me)
  const theirsVal = sum(theirs.map((l) => valueNow(l, prices)))
  const mineVal = sum(mine.map((l) => valueNow(l, prices)))
  const userId = pod?.userId ?? null

  return (
    <div className="stack">
      <div className="summary-grid">
        <div className="card summary">
          <div className="muted small">Hai carte di altri</div>
          <div className="big">{copies(theirs)}</div>
          <div className="muted small">~{eur(theirsVal.cents / 100)}{theirsVal.missing ? ` · ${theirsVal.missing} senza prezzo` : ''}</div>
        </div>
        <div className="card summary">
          <div className="muted small">Tue carte in giro</div>
          <div className="big">{copies(mine)}</div>
          <div className="muted small">~{eur(mineVal.cents / 100)}{mineVal.missing ? ` · ${mineVal.missing} senza prezzo` : ''}</div>
        </div>
      </div>
      <p className="muted small no-m">
        Non sono debiti finché non le saldi.
        {age && (
          <span className={Date.now() - age > STALE ? 'neg' : ''}>
            {' '}
            {Date.now() - age > STALE ? 'Prezzi non aggiornati' : 'Valori Cardmarket via Scryfall'} · {dateIt(new Date(age).toISOString())}
          </span>
        )}
      </p>

      <div className="row between">
        <h2 className="section">Per persona</h2>
        <button className="primary" onClick={() => setAdd(true)}>
          <Icon name="plus" size={18} /> Prendi carte
        </button>
      </div>
      {accs.length === 0 && (
        <Empty icon="cards" action={{ label: 'Prendi carte', run: () => setAdd(true) }}>
          Nessuna carta in giro.
        </Empty>
      )}
      <div className="list">
        {accs.map(({ other, theirs: t, mine: m }) => {
          const nuove = newCount(me, other, userId, card_loans)
          const tv = sum(t.map((l) => valueNow(l, prices)))
          const mv = sum(m.map((l) => valueNow(l, prices)))
          const o = P(other)
          return (
            <button key={other} className="list-item account-item" onClick={() => setConto(other)}>
              <div className="row between">
                <span className="row">
                  <Avatar p={o} size={30} /> <b>{o?.name ?? '?'}</b>
                  {o?.archived && <span className="muted small">(ex membro)</span>}
                  {nuove > 0 && <span className="badge-new">{nuove} nuove</span>}
                </span>
                <Icon name="chevron" size={16} className="muted" />
              </div>
              <div className="account-boxes">
                <span className="account-box">{t.length ? `Hai ${copies(t)} sue · ~${eur(tv.cents / 100)}` : 'Nessuna sua'}</span>
                <span className="account-box">{m.length ? `Ha ${copies(m)} tue · ~${eur(mv.cents / 100)}` : 'Nessuna tua'}</span>
              </div>
            </button>
          )
        })}
      </div>
      <button className="link center-self" onClick={() => setHistory(true)}>
        Storico restituzioni e saldi ›
      </button>

      {add && <AddCards onClose={() => setAdd(false)} />}
      {conto && <ContoScreen other={conto} onClose={() => setConto(null)} />}
      {history && <HistoryModal onClose={() => setHistory(false)} />}
    </div>
  )
}

// Conto con X: due liste selezionabili, Restituisci / Salda
function ContoScreen({ other, onClose }: { other: string; onClose: () => void }) {
  const { players, card_loans, update, add, remove } = useStore()
  const [me] = useMe()
  const perms = usePerms()
  const [sel, setSel] = useState<Record<string, number>>({})
  const [adding, setAdding] = useState(false)
  const [settle, setSettle] = useState(false)
  const [history, setHistory] = useState(false)
  const o = players.find((p) => p.id === other)
  const canAct = perms.involved(me, other)
  const theirs = held(other, me!, card_loans)
  const mine = held(me!, other, card_loans)
  const prices = usePrices([...theirs, ...mine].map((l) => l.name))
  useEffect(() => {
    if (me) markSeen(me, other)
  }, [me, other])

  const selected = Object.entries(sel).filter(([, q]) => q > 0)
  const selVal = sum(selected.map(([id, q]) => {
    const l = card_loans.find((x) => x.id === id)
    return l ? valueNow({ name: l.name, quantity: q }, prices) : null
  }))

  // restituisci (anche solo alcune copie: la riga si divide), con "Annulla"
  async function giveBack() {
    const now = new Date().toISOString()
    const done: { l: CardLoan; newId?: string }[] = []
    const n = selected.reduce((s, [, q]) => s + q, 0)
    await withUndo(
      `${n} carte restituite`,
      async () => {
        for (const [id, q] of selected) {
          const l = card_loans.find((x) => x.id === id)
          if (!l) continue
          if (q >= l.quantity) {
            await update('card_loans', l.id, { status: 'returned', closed_at: now })
            done.push({ l })
          } else {
            const { id: _i, created_at: _c, pod_id: _p, ...rest } = l
            await update('card_loans', l.id, { quantity: l.quantity - q })
            const row = await add('card_loans', { ...rest, quantity: q, status: 'returned', closed_at: now })
            done.push({ l, newId: row.id })
          }
        }
      },
      async () => {
        for (const d of done) {
          if (d.newId) {
            await remove('card_loans', d.newId)
            await update('card_loans', d.l.id, { quantity: d.l.quantity })
          } else await update('card_loans', d.l.id, { status: 'open', closed_at: null })
        }
      },
    )
    buzz()
    setSel({})
  }

  const list = (ls: CardLoan[], title: string) => {
    const v = sum(ls.map((l) => valueNow(l, prices)))
    return (
      <div className="card stack-sm">
        <div className="row between">
          <h3 className="no-m">{title}</h3>
          <span className="muted small">
            {copies(ls)} · ~{eur(v.cents / 100)}
          </span>
        </div>
        {ls.length === 0 && <p className="muted small no-m">Nessuna.</p>}
        {ls.map((l) => {
          const q = sel[l.id] ?? 0
          return (
            <div key={l.id} className="stack-sm line">
              <div className="row between">
                {canAct && (
                  <input
                    type="checkbox"
                    checked={q > 0}
                    onChange={(e) => setSel({ ...sel, [l.id]: e.target.checked ? l.quantity : 0 })}
                    aria-label={`Seleziona ${l.name}`}
                  />
                )}
                <span className="grow">
                  <CardName name={l.name} qty={l.quantity} value={valueNow(l, prices)} />
                  <span className="muted small"> · dal {dateIt(l.added_at)}</span>
                </span>
                <span className="small nowrap">{eurCents(valueNow(l, prices))}</span>
              </div>
              {q > 0 && l.quantity > 1 && (
                <div className="row small muted">
                  copie
                  <span className="stepper mini-stepper">
                    <button disabled={q <= 1} onClick={() => setSel({ ...sel, [l.id]: q - 1 })} aria-label="Una copia in meno">
                      −
                    </button>
                    <b>{q}</b>
                    <button disabled={q >= l.quantity} onClick={() => setSel({ ...sel, [l.id]: q + 1 })} aria-label="Una copia in più">
                      +
                    </button>
                  </span>
                  di {l.quantity}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Screen title={`Tu ↔ ${o?.name ?? ''}`} onClose={onClose}>
      <div className="row between">
        <span className="row">
          <Avatar p={o} size={32} /> <b>{o?.name}</b>
          {o?.archived && <span className="muted small">(ex membro)</span>}
        </span>
        {canAct && (
          <button className="small-btn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} /> Aggiungi carte
          </button>
        )}
      </div>
      {list(theirs, 'Sue carte che hai tu')}
      {list(mine, 'Tue carte che ha lui')}
      <button className="link center-self" onClick={() => setHistory(true)}>
        Storico con {o?.name} ›
      </button>
      {selected.length > 0 && <div style={{ height: 90 }} />}

      {selected.length > 0 && (
        <div className="action-bar">
          <span className="grow small">
            <b>{selected.reduce((s, [, q]) => s + q, 0)} selezionate</b> · ~{eur(selVal.cents / 100)}
          </span>
          <button onClick={giveBack}>Restituisci</button>
          <button className="primary" onClick={() => setSettle(true)}>
            Salda
          </button>
        </div>
      )}

      {adding && <AddCards presetOther={other} onClose={() => setAdding(false)} />}
      {settle && (
        <SettleSheet
          other={other}
          selection={sel}
          onClose={() => setSettle(false)}
          onDone={() => {
            setSettle(false)
            setSel({})
          }}
        />
      )}
      {history && <HistoryModal other={other} onClose={() => setHistory(false)} />}
    </Screen>
  )
}

// Storico: carte restituite e saldi (di tutti i miei conti, o solo con una persona)
function HistoryModal({ other, onClose }: { other?: string; onClose: () => void }) {
  const { players, card_loans, settlements } = useStore()
  const [me] = useMe()
  const [detail, setDetail] = useState<string | null>(null)
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const pair = (a: string, b: string) => (other ? (a === me && b === other) || (a === other && b === me) : a === me || b === me)
  const returned = card_loans.filter((l) => l.status === 'returned' && pair(l.owner_player, l.holder_player))
  const sets = settlements.filter((s) => pair(s.player_a, s.player_b))
  const items = [
    ...returned.map((l) => ({ at: l.closed_at ?? l.added_at, el: (
      <div key={l.id} className="row between line">
        <span className="grow small">
          <CardName name={l.name} qty={l.quantity} /> <span className="muted">di {name(l.owner_player)}, restituita da {name(l.holder_player)}</span>
        </span>
        <span className="muted small nowrap">{dateIt(l.closed_at ?? l.added_at)}</span>
      </div>
    ) })),
    ...sets.map((s) => ({ at: s.created_at, el: (
      <button key={s.id} className="list-item static-btn" onClick={() => setDetail(s.id)}>
        <div className="grow">
          <div className="small strong">
            Saldo {name(s.player_a)} ↔ {name(s.player_b)}
            {s.imported && <span className="muted"> · importato</span>}
          </div>
          <div className="muted small">{dateIt(s.created_at)}{s.note ? ` · ${s.note}` : ''}</div>
        </div>
        <Icon name="chevron" size={16} className="muted" />
      </button>
    ) })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <Modal title={other ? `Storico con ${name(other)}` : 'Storico restituzioni e saldi'} onClose={onClose}>
      <div className="stack-sm">
        {items.length === 0 && <p className="muted">Ancora niente.</p>}
        {items.map((i) => i.el)}
      </div>
      {detail && <SettlementDetail id={detail} onClose={() => setDetail(null)} />}
    </Modal>
  )
}
