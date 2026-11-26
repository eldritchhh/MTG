// Tu ↔ X: soldi, carte in prestito nei due versi, gap degli scambi definitivi, restituzioni, storico
import { useState } from 'react'
import { useMe, useStore } from '../../lib/store'
import type { TradeLine } from '../../lib/types'
import { Avatar, Screen } from '../../components'
import { cardSummary, currentValue, gap, linesOf, loanedCards, pairMoney, sumValues, tradeState } from '../../lib/trades'
import { eurCents } from '../../lib/prices'
import { eur, dateIt } from '../../lib/util'
import { usePerms } from '../../lib/pod'
import { ask } from '../../lib/confirm'
import { toast } from '../../lib/toast'
import { buzz } from '../../lib/prefs'
import { CardName } from './CardParts'
import { useSettle, usePrices } from './ops'
import { TradeForm } from './TradeForm'
import type { Trade } from '../../lib/types'

export function PersonScreen({ other, onClose }: { other: string; onClose: () => void }) {
  const { players, debts, trades, trade_lines, update, add, remove } = useStore()
  const [me] = useMe()
  const perms = usePerms()
  const settle = useSettle()
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<Record<string, number>>({}) // riga → copie da restituire
  const [open, setOpen] = useState<Trade | 'new' | null>(null)
  const P = (id: string) => players.find((p) => p.id === id)
  const x = P(other)
  const meP = P(me ?? '')
  const canAct = perms.involved(me, other)

  const mineAtX = loanedCards(me!, other, trade_lines)
  const xAtMe = loanedCards(other, me!, trade_lines)
  const prices = usePrices([...mineAtX, ...xAtMe].map((l) => l.name!))
  const money = pairMoney(me!, other, debts, trade_lines)
  const mineVal = sumValues(mineAtX.map((l) => currentValue(l, prices)))
  const xVal = sumValues(xAtMe.map((l) => currentValue(l, prices)))
  const g = gap(me!, other, trade_lines)
  const history = trades
    .filter((t) => (t.player_a === me && t.player_b === other) || (t.player_a === other && t.player_b === me))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  // restituzione (anche parziale: 2 copie su 4 → una riga restituita da 2 e una in prestito da 2)
  async function markReturned() {
    const now = new Date().toISOString()
    const done: { line: TradeLine; qty: number; newId?: string }[] = []
    for (const [id, qty] of Object.entries(sel)) {
      const l = trade_lines.find((t) => t.id === id)
      if (!l || qty <= 0) continue
      if (qty >= l.quantity) await update('trade_lines', l.id, { status: 'returned', returned_at: now })
      else {
        const { pod_id: _p, id: _id, created_at: _c, ...rest } = l
        const newId = crypto.randomUUID()
        await update('trade_lines', l.id, { quantity: l.quantity - qty })
        await add('trade_lines', { ...rest, id: newId, quantity: qty, status: 'returned', returned_at: now })
        done.push({ line: l, qty, newId })
        continue
      }
      done.push({ line: l, qty })
    }
    setSelecting(false)
    setSel({})
    buzz()
    toast(`${done.reduce((s, d) => s + d.qty, 0)} carte segnate come restituite`, {
      action: {
        label: 'Annulla',
        run: async () => {
          for (const d of done) {
            if (d.newId) {
              // riunisco le copie nella riga originale
              await remove('trade_lines', d.newId)
              await update('trade_lines', d.line.id, { quantity: d.line.quantity })
            } else await update('trade_lines', d.line.id, { status: d.line.status!, returned_at: null })
          }
        },
      },
    })
  }

  // "me la tengo" o "persa": stato definitivo/perso e, se si vuole, un pagamento del valore attuale
  async function keepOrLose(l: TradeLine, status: 'permanent' | 'lost') {
    await update('trade_lines', l.id, { status })
    const v = currentValue(l, prices)
    const holder = P(l.to_player)?.name
    const owner = P(l.from_player)?.name
    if (v && (await ask(`${l.name}: ${status === 'permanent' ? `${holder} la tiene` : 'persa'}. Aggiungere un pagamento di ~${eurCents(v)} da ${holder} a ${owner} (entra nei saldi)?`)))
      await add('trade_lines', {
        trade_id: l.trade_id, from_player: l.to_player, to_player: l.from_player, kind: 'money', status: null, name: null, quantity: 1,
        value_cents: null, value_source: null, valued_at: null, returned_at: null, amount_cents: v, counts_in_balance: true, settled: false, linked_line_id: l.id,
      })
  }

  const cardList = (ls: TradeLine[], title: string, total: ReturnType<typeof sumValues>) =>
    ls.length > 0 && (
      <div className="card stack-sm">
        <div className="row between">
          <h3 className="no-m">{title}</h3>
          <span className="muted small">
            ~{eur(total.cents / 100)}
            {total.missing > 0 && ` · ${total.missing} senza prezzo`}
          </span>
        </div>
        {ls.map((l) => (
          <div key={l.id} className="line stack-sm">
            <div className="row between">
              {selecting ? (
                <label className="row grow">
                  <input type="checkbox" checked={!!sel[l.id]} onChange={(e) => setSel({ ...sel, [l.id]: e.target.checked ? l.quantity : 0 })} />
                  <span>{l.quantity > 1 ? `${l.quantity}× ` : ''}{l.name}</span>
                </label>
              ) : (
                <span className="grow">
                  <CardName name={l.name!} qty={l.quantity} value={currentValue(l, prices)} />
                </span>
              )}
              <span className="muted small nowrap">{eurCents(currentValue(l, prices))}</span>
            </div>
            {selecting && sel[l.id] > 0 && l.quantity > 1 && (
              <div className="row small muted">
                restituite
                <span className="stepper mini-stepper">
                  <button disabled={sel[l.id] <= 1} onClick={() => setSel({ ...sel, [l.id]: sel[l.id] - 1 })}>
                    −
                  </button>
                  <b>{sel[l.id]}</b>
                  <button disabled={sel[l.id] >= l.quantity} onClick={() => setSel({ ...sel, [l.id]: sel[l.id] + 1 })}>
                    +
                  </button>
                </span>
                di {l.quantity}
              </div>
            )}
            {!selecting && canAct && (
              <div className="row small">
                <button className="link small" onClick={() => keepOrLose(l, 'permanent')}>
                  {P(l.to_player)?.name} la tiene
                </button>
                <span className="dot" />
                <button className="link small" onClick={() => keepOrLose(l, 'lost')}>
                  Persa
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    )

  const total = g.aGave + g.bGave
  return (
    <Screen title={`Tu ↔ ${x?.name ?? ''}`} onClose={onClose}>
      <div className="row person-hero">
        <Avatar p={meP} size={40} />
        <span className="muted">↔</span>
        <Avatar p={x} size={40} />
        <div className="grow">
          <div className="strong">
            {money > 0.004 ? `${x?.name} ti deve ${eur(money)}` : money < -0.004 ? `Devi ${eur(-money)} a ${x?.name}` : 'Siete pari con i soldi'}
          </div>
          <div className="muted small">
            {mineAtX.length > 0 && `ha ${mineAtX.reduce((s, l) => s + l.quantity, 0)} tue carte (~${eur(mineVal.cents / 100)})`}
            {mineAtX.length > 0 && xAtMe.length > 0 && ' · '}
            {xAtMe.length > 0 && `hai ${xAtMe.reduce((s, l) => s + l.quantity, 0)} sue carte (~${eur(xVal.cents / 100)})`}
          </div>
        </div>
      </div>

      {total > 0 && (
        <div className="card stack-sm">
          <h3 className="no-m">Scambi definitivi</h3>
          <div className="row between small">
            <span>Hai dato ~{eur(g.aGave / 100)}</span>
            <span>Hai ricevuto ~{eur(g.bGave / 100)}</span>
          </div>
          <div className="gap-bar" role="img" aria-label="Bilancio degli scambi definitivi">
            <i style={{ width: `${(g.aGave / total) * 100}%` }} />
          </div>
          <div className="small">
            {g.diff === 0 ? 'Pari' : `Gap ${eur(Math.abs(g.diff) / 100)} a favore ${g.diff > 0 ? 'tuo' : `di ${x?.name}`}`}
            {g.missing > 0 && <span className="muted"> · {g.missing} carte senza prezzo escluse</span>}
          </div>
        </div>
      )}

      {canAct && (
        <div className="row">
          {(mineAtX.length > 0 || xAtMe.length > 0) &&
            (selecting ? (
              <>
                <button className="primary grow" disabled={!Object.values(sel).some((q) => q > 0)} onClick={markReturned}>
                  Conferma restituite
                </button>
                <button className="grow" onClick={() => (setSelecting(false), setSel({}))}>
                  Annulla
                </button>
              </>
            ) : (
              <button className="grow" onClick={() => setSelecting(true)}>
                Segna restituite
              </button>
            ))}
          {!selecting && Math.abs(money) > 0.004 && (
            <button className="grow" onClick={() => (money > 0 ? settle(other, me!, money) : settle(me!, other, -money))}>
              Pareggia {eur(Math.abs(money))}
            </button>
          )}
        </div>
      )}

      {cardList(mineAtX, `Tue carte da ${x?.name}`, mineVal)}
      {cardList(xAtMe, `Carte di ${x?.name} da te`, xVal)}

      <div className="card stack-sm">
        <div className="row between">
          <h3 className="no-m">Storico</h3>
          {canAct && (
            <button className="small-btn" onClick={() => setOpen('new')}>
              + Scambio
            </button>
          )}
        </div>
        {history.length === 0 && <p className="muted small no-m">Nessuno scambio tra voi.</p>}
        {history.map((t) => {
          const ls = linesOf(t, trade_lines)
          const st = tradeState(ls)
          return (
            <button key={t.id} className="list-item static-btn" onClick={() => setOpen(t)}>
              <div className="grow">
                <div className="small">
                  {cardSummary(ls) || 'Soldi'}
                  {t.note && <span className="muted"> · {t.note}</span>}
                </div>
                <div className="muted small">{dateIt(t.created_at)}</div>
              </div>
              <span className={`status ${st.cls}`}>{st.label}</span>
            </button>
          )
        })}
      </div>

      {open && <TradeForm trade={open === 'new' ? null : open} presetOther={other} onClose={() => setOpen(null)} />}
    </Screen>
  )
}
