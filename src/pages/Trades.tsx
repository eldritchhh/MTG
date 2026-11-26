// Scambi: vista unica di soldi e carte (spec Parte 2)
import { useEffect, useMemo, useState } from 'react'
import { useMe, useStore } from '../lib/store'
import type { Trade } from '../lib/types'
import { byId, dateIt, eur, playerName, settlements } from '../lib/util'
import { Avatar, Empty, Header, Modal, Segmented } from '../components'
import { Icon } from '../icons'
import { usePerms } from '../lib/pod'
import { useNav } from '../lib/nav'
import { STALE } from '../lib/prices'
import { balances, cardSummary, currentValue, linesOf, loanedCards, pairMoney, snapshotValue, sumValues, tradeState } from '../lib/trades'
import { ExpenseForm, groupTotal, toEntries, type Entry } from './trades/Expense'
import { TradeForm } from './trades/TradeForm'
import { PersonScreen } from './trades/Person'
import { pricesAge, useSettle, usePrices } from './trades/ops'

type Filter = 'all' | 'cards' | 'money' | 'loan'
type Item = { kind: 'expense'; e: Entry; at: string } | { kind: 'trade'; t: Trade; at: string }

export default function TradesPage() {
  const { players, debts, trades, trade_lines, update } = useStore()
  const [me] = useMe()
  const perms = usePerms()
  const nav = useNav()
  const settle = useSettle()
  const [filter, setFilter] = useState<Filter>('all')
  const [showClosed, setShowClosed] = useState(false)
  const [choice, setChoice] = useState(false)
  const [tradeForm, setTradeForm] = useState<Trade | 'new' | null>(null)
  const [expense, setExpense] = useState<Entry | 'new' | null>(null)
  const [person, setPerson] = useState<string | null>(null)
  const P = byId(players)
  const active = players.filter((p) => !p.archived)

  const bal = useMemo(() => balances(debts, trade_lines), [debts, trade_lines])
  const plan = useMemo(() => settlements(bal), [bal])
  const valued = trade_lines.filter((l) => l.kind === 'card' && (l.status === 'loan' || l.status === 'permanent'))
  const prices = usePrices(valued.map((l) => l.name!))
  const age = pricesAge(prices)

  // carte senza valore concordato (es. prestiti di prima): al primo prezzo disponibile lo fisso
  useEffect(() => {
    for (const l of valued) {
      if (l.value_source !== 'none' || l.valued_at || !perms.involved(l.from_player, l.to_player)) continue
      const p = prices.get(l.name!)
      if (!p) continue
      update('trade_lines', l.id, { value_cents: p.cents, value_source: p.cents == null ? 'none' : 'scryfall', valued_at: new Date().toISOString() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices])

  // riepilogo personale
  const myOut = me ? trade_lines.filter((l) => l.kind === 'card' && l.status === 'loan' && l.from_player === me) : []
  const myOutVal = sumValues(myOut.map((l) => currentValue(l, prices)))
  const people = me
    ? active
        .filter((p) => p.id !== me)
        .map((p) => ({ p, money: pairMoney(me, p.id, debts, trade_lines), mine: loanedCards(me, p.id, trade_lines), theirs: loanedCards(p.id, me, trade_lines) }))
        .filter((x) => Math.abs(x.money) > 0.004 || x.mine.length || x.theirs.length)
    : []

  // movimenti: spese divise + scambi
  const items: Item[] = useMemo(() => {
    const ex: Item[] = toEntries(debts).map((e) => ({ kind: 'expense', e, at: e.created_at }))
    const tr: Item[] = trades.map((t) => ({ kind: 'trade', t, at: t.created_at }))
    return [...ex, ...tr].sort((a, b) => b.at.localeCompare(a.at))
  }, [debts, trades])
  const shown = items.filter((it) => {
    if (it.kind === 'expense') {
      if (filter === 'cards' || filter === 'loan') return false
      return showClosed || it.e.rows.some((r) => !r.settled)
    }
    const ls = linesOf(it.t, trade_lines)
    const st = tradeState(ls)
    if (filter === 'cards' && !ls.some((l) => l.kind === 'card')) return false
    if (filter === 'money' && !ls.some((l) => l.kind === 'money')) return false
    if (filter === 'loan' && !ls.some((l) => l.kind === 'card' && l.status === 'loan')) return false
    return showClosed || st.open
  })

  const canEditExpense = (e: Entry) => e.rows.every((r) => perms.involved(r.debtor_id, r.creditor_id))

  return (
    <div className="stack">
      <Header
        title="Scambi"
        sub="Soldi e carte tra di noi"
        action={
          <button className="primary" onClick={() => setChoice(true)} disabled={active.length < 2}>
            <Icon name="plus" size={18} /> Nuovo
          </button>
        }
      />

      {active.length < 2 ? (
        <Empty icon="swap" action={{ label: 'Vai a Giocatori', run: () => nav.setTab('players') }}>
          Servono almeno 2 giocatori.
        </Empty>
      ) : (
        <>
          {me && P[me] && (
            <div className="summary-grid">
              <div className="card summary">
                <div className="muted small">Soldi</div>
                <div className={`big ${(bal[me] ?? 0) >= 0 ? 'pos' : 'neg'}`}>{eur(bal[me] ?? 0)}</div>
                <div className="muted small">{Math.abs(bal[me] ?? 0) < 0.005 ? 'sei in pari' : (bal[me] ?? 0) > 0 ? 'devi ricevere' : 'devi dare'}</div>
              </div>
              <div className="card summary">
                <div className="muted small">Carte fuori</div>
                <div className="big">~{eur(myOutVal.cents / 100)}</div>
                <div className="muted small">
                  {myOut.reduce((s, l) => s + l.quantity, 0)} in prestito{myOutVal.missing ? ` · ${myOutVal.missing} senza prezzo` : ''}
                </div>
              </div>
            </div>
          )}
          {age && (
            <p className={`small no-m ${Date.now() - age > STALE ? 'neg' : 'muted'}`}>
              {Date.now() - age > STALE ? 'Prezzi non aggiornati' : 'Valori Cardmarket via Scryfall'} · aggiornati il {dateIt(new Date(age).toISOString())}
            </p>
          )}

          {people.length > 0 && (
            <>
              <h2 className="section">Per persona</h2>
              <div className="list">
                {people.map(({ p, money, mine, theirs }) => (
                  <button key={p.id} className="list-item" onClick={() => setPerson(p.id)}>
                    <Avatar p={p} size={32} />
                    <div className="grow">
                      <div className="strong">{p.name}</div>
                      <div className="muted small">
                        {[
                          money > 0.004 ? `ti deve ${eur(money)}` : money < -0.004 ? `gli devi ${eur(-money)}` : null,
                          mine.length ? `ha ${mine.reduce((s, l) => s + l.quantity, 0)} tue carte` : null,
                          theirs.length ? `hai ${theirs.reduce((s, l) => s + l.quantity, 0)} sue carte` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'pari'}
                      </div>
                    </div>
                    <Icon name="chevron" size={16} className="muted" />
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="card">
            <h2 className="section">Saldi del gruppo</h2>
            {active.filter((p) => Math.abs(bal[p.id] ?? 0) > 0.004).length === 0 && <p className="muted">Tutti in pari 🎉</p>}
            {players
              .filter((p) => Math.abs(bal[p.id] ?? 0) > 0.004)
              .sort((a, b) => (bal[b.id] ?? 0) - (bal[a.id] ?? 0))
              .map((p) => (
                <div key={p.id} className="row between line">
                  <span className="row">
                    <Avatar p={p} size={24} /> {p.name}
                    {p.archived && <span className="muted small">(ex)</span>}
                  </span>
                  <span className={(bal[p.id] ?? 0) >= 0 ? 'pos' : 'neg'}>{eur(bal[p.id] ?? 0)}</span>
                </div>
              ))}
            {plan.length > 0 && (
              <>
                <h3>Come pareggiare</h3>
                {plan.map((s) => (
                  <div key={s.from + s.to} className="row between line">
                    <span>
                      <b>{P[s.from]?.name}</b> → <b>{P[s.to]?.name}</b> {eur(s.amount)}
                    </span>
                    {perms.involved(s.from, s.to) && (
                      <button className="small-btn" onClick={() => settle(s.from, s.to, s.amount)}>
                        Pagato
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          <h2 className="section">Movimenti</h2>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'Tutti' },
              { id: 'cards', label: 'Carte' },
              { id: 'money', label: 'Soldi' },
              { id: 'loan', label: 'In prestito' },
            ]}
          />
          <label className="row small muted">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> mostra saldati e chiusi
          </label>
          {shown.length === 0 && (
            <Empty icon="swap" action={{ label: 'Nuovo movimento', run: () => setChoice(true) }}>
              Nessun movimento {showClosed ? '' : 'aperto'}.
            </Empty>
          )}
          <div className="list">
            {shown.map((it) => {
              if (it.kind === 'expense') {
                const e = it.e
                return (
                  <button key={e.key} className={`list-item group-item ${e.rows.every((r) => r.settled) ? 'done' : ''}`} onClick={() => setExpense(e)} disabled={!canEditExpense(e)}>
                    <div className="grow stack-sm">
                      <div className="row between">
                        <span>{e.rows[0].description || 'Spesa divisa'}</span>
                        <span className="strong">{eur(groupTotal(e.rows))}</span>
                      </div>
                      <div className="muted small">
                        spesa · pagata da {playerName(P, e.rows[0].creditor_id)} · divisa tra {e.rows.length + 1} · {dateIt(e.created_at)}
                      </div>
                      <div className="share-chips">
                        {e.rows.map((r) => (
                          <span key={r.id} className={`share ${r.settled ? 'paid' : ''}`}>
                            <Avatar p={P[r.debtor_id]} size={18} /> {eur(r.amount)}
                            {r.settled && <Icon name="check" size={12} />}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                )
              }
              const t = it.t
              const ls = linesOf(t, trade_lines)
              const st = tradeState(ls)
              const oneWay = ls.every((l) => l.from_player === ls[0]?.from_player)
              const from = ls[0]?.from_player ?? t.player_a
              const to = from === t.player_a ? t.player_b : t.player_a
              const cards = ls.filter((l) => l.kind === 'card')
              const val = sumValues(cards.map((l) => (l.status === 'loan' ? currentValue(l, prices) : l.status === 'returned' ? 0 : snapshotValue(l))))
              const moneyTot = ls.filter((l) => l.kind === 'money').reduce((s, l) => s + l.amount_cents!, 0)
              const linked = cards.length > 0 && ls.some((l) => l.kind === 'money')
              return (
                <button key={t.id} className={`list-item ${st.open ? '' : 'done'}`} onClick={() => setTradeForm(t)}>
                  <div className="grow stack-sm">
                    <div className="row between">
                      <span>
                        <b>{playerName(P, from)}</b> {oneWay ? '→' : '⇄'} <b>{playerName(P, to)}</b>
                      </span>
                      <span className={`status ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="small">
                      {cards.length > 0 ? cardSummary(ls) : t.note || 'Soldi'}
                      {cards.length > 0 && val.cents > 0 && <span className="muted"> · ~{eur(val.cents / 100)}</span>}
                      {moneyTot > 0 && <span className="muted"> · {eur(moneyTot / 100)}</span>}
                    </div>
                    <div className="muted small">
                      {cards.length > 0 && t.note ? `${t.note} · ` : ''}
                      {dateIt(t.created_at)}
                      {linked && <span className="chip tiny">collegato</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {choice && (
        <Modal title="Nuovo" onClose={() => setChoice(false)}>
          <div className="stack">
            <button
              className="list-item"
              onClick={() => {
                setChoice(false)
                setTradeForm('new')
              }}
            >
              <Icon name="cards" size={22} />
              <div className="grow">
                <div className="strong">Scambio / prestito carte</div>
                <div className="muted small">Carte e soldi tra due persone, anche insieme</div>
              </div>
            </button>
            <button
              className="list-item"
              onClick={() => {
                setChoice(false)
                setExpense('new')
              }}
            >
              <Icon name="coin" size={22} />
              <div className="grow">
                <div className="strong">Spesa</div>
                <div className="muted small">Divisa tra più persone, es. spedizione di un ordine CT0</div>
              </div>
            </button>
          </div>
        </Modal>
      )}
      {tradeForm && <TradeForm trade={tradeForm === 'new' ? null : tradeForm} onClose={() => setTradeForm(null)} />}
      {expense && <ExpenseForm entry={expense === 'new' ? null : expense} onClose={() => setExpense(null)} />}
      {person && <PersonScreen other={person} onClose={() => setPerson(null)} />}
    </div>
  )
}
