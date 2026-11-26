// Salda (l'unica vera transazione) e dettaglio di un saldo
import { useEffect, useState } from 'react'
import { useMe, useStore } from '../../lib/store'
import type { CardLoan, SettlementItem } from '../../lib/types'
import { centsToInput, dayIt, eur, parseEur } from '../../lib/util'
import { eurCents, loadPrices, priceNow } from '../../lib/prices'
import { held } from '../../lib/cards'
import { Modal, Segmented } from '../../components'
import { usePerms } from '../../lib/pod'
import { ask } from '../../lib/confirm'
import { toast } from '../../lib/toast'
import { buzz } from '../../lib/prefs'
import { CardName, CardSearch } from './CardParts'
import { Icon } from '../../icons'

type Kept = { loan: CardLoan; qty: number; value: string } // value: euro unitario come scritto
type Given = { key: string; name: string; qty: number; value: string; loading?: boolean }
type Money = { key: string; amount: string; mode: 'due' | 'paid_now' }

const cents = (s: string) => (s.trim() ? Math.round(parseEur(s) * 100) : null)

// selection: righe del conto selezionate → copie (entrambe le direzioni)
export function SettleSheet({ other, selection, onClose, onDone }: { other: string; selection: Record<string, number>; onClose: () => void; onDone: () => void }) {
  const { players, card_loans, batch } = useStore()
  const [me] = useMe()
  const otherName = players.find((p) => p.id === other)?.name ?? ''
  const pick = (dir: 'keep' | 'mine'): Kept[] =>
    Object.entries(selection)
      .map(([id, qty]) => ({ loan: card_loans.find((l) => l.id === id)!, qty }))
      .filter((k) => k.loan && k.qty > 0 && (dir === 'keep' ? k.loan.holder_player === me : k.loan.owner_player === me))
      .map((k) => ({ ...k, value: '' }))
  const [keep, setKeep] = useState<Kept[]>(() => pick('keep')) // sue carte che tengo io
  const [mine, setMine] = useState<Kept[]>(() => pick('mine')) // mie carte che tiene lui (le "do")
  const [given, setGiven] = useState<Given[]>([])
  const [money, setMoney] = useState<Money[]>([])
  const [adding, setAdding] = useState<'album' | 'mine' | null>(null)
  const [resolution, setResolution] = useState<'accepted' | 'money'>('accepted')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // valori di partenza: il prezzo di oggi (modificabile prima di confermare)
  useEffect(() => {
    const names = [...keep, ...mine].map((k) => k.loan.name)
    loadPrices(names).then((m) => {
      const fill = (ks: Kept[]) => ks.map((k) => (k.value ? k : { ...k, value: centsToInput(m.get(k.loan.name)?.cents ?? null) }))
      setKeep(fill)
      setMine(fill)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const keptVal = keep.reduce((s, k) => s + (cents(k.value) ?? 0) * k.qty, 0)
  const giveVal =
    mine.reduce((s, k) => s + (cents(k.value) ?? 0) * k.qty, 0) +
    given.reduce((s, g) => s + (cents(g.value) ?? 0) * g.qty, 0) +
    money.reduce((s, m) => s + (cents(m.amount) ?? 0), 0)
  const diff = keptVal - giveVal // > 0: tieni di più, mancano soldi per l'altro
  const noPrice = [...keep, ...mine].filter((k) => !k.value.trim()).length + given.filter((g) => !g.value.trim()).length
  const available = me ? held(me, other, card_loans).filter((l) => !mine.some((k) => k.loan.id === l.id)) : []

  async function addGiven(name: string) {
    const key = crypto.randomUUID()
    setGiven((g) => [...g, { key, name, qty: 1, value: '', loading: true }])
    const p = await priceNow(name).catch(() => null)
    setGiven((g) => g.map((x) => (x.key === key ? { ...x, loading: false, value: centsToInput(p?.cents ?? null) } : x)))
  }

  async function confirm() {
    if (!me || busy) return
    if (!keep.length && !mine.length && !given.length && !money.length) return
    setBusy(true)
    setFailed(false)
    const now = new Date().toISOString()
    // tutto il saldo in un colpo solo: o c'è intero o non c'è (mai carte saldate senza i soldi, o viceversa)
    try {
      await batch((tx) => {
        const s = tx.add('settlements', {
          player_a: me, player_b: other, note: note.trim() || null, difference_cents: diff, difference_resolution: diff !== 0 ? resolution : 'accepted',
        })
        const item = (p: Partial<SettlementItem>) =>
          tx.add('settlement_items', {
            settlement_id: s.id, kind: 'kept', loan_id: null, from_player: me, to_player: other, name: null, quantity: 1, value_cents: null,
            value_source: null, amount_cents: null, mode: null, debt_id: null, ...p,
          })
        // carte tenute (entrambe le direzioni); saldare solo alcune copie divide la riga
        for (const k of [...keep, ...mine]) {
          let loanId = k.loan.id
          if (k.qty < k.loan.quantity) {
            tx.update('card_loans', k.loan.id, { quantity: k.loan.quantity - k.qty })
            const { id: _i, created_at: _c, pod_id: _p, ...rest } = k.loan
            loanId = tx.add('card_loans', { ...rest, quantity: k.qty, status: 'settled', closed_at: now, settlement_id: s.id }).id
          } else tx.update('card_loans', k.loan.id, { status: 'settled', closed_at: now, settlement_id: s.id })
          const v = cents(k.value)
          item({ kind: 'kept', loan_id: loanId, from_player: k.loan.owner_player, to_player: k.loan.holder_player, name: k.loan.name, quantity: k.qty, value_cents: v, value_source: v == null ? 'none' : 'manual' })
        }
        for (const g of given) {
          const v = cents(g.value)
          item({ kind: 'given', name: g.name, quantity: g.qty, value_cents: v, value_source: v == null ? 'none' : 'manual' })
        }
        // soldi: quelli da pagare diventano un movimento nella scheda Soldi
        const debt = (from: string, to: string, amount: number) =>
          tx.add('debts', { debtor_id: from, creditor_id: to, amount: amount / 100, description: `Saldo carte con ${from === me ? otherName : players.find((p) => p.id === me)?.name}`, settled: false, group_id: null, group_total: null, settlement_id: s.id }).id
        for (const m of money) {
          const a = cents(m.amount)
          if (!a) continue
          item({ kind: 'money', amount_cents: a, mode: m.mode, debt_id: m.mode === 'due' ? debt(me, other, a) : null })
        }
        if (diff !== 0 && resolution === 'money') {
          const [from, to] = diff > 0 ? [me, other] : [other, me]
          item({ kind: 'money', from_player: from, to_player: to, amount_cents: Math.abs(diff), mode: 'due', debt_id: debt(from, to, Math.abs(diff)) })
        }
      })
    } catch {
      setFailed(true)
      setBusy(false)
      return
    }
    buzz()
    toast(`Saldo con ${otherName} confermato`)
    onDone()
  }

  const keptRow = (k: Kept, set: (f: (x: Kept[]) => Kept[]) => void, removable: boolean) => (
    <div key={k.loan.id} className="row between line">
      <span className="grow">
        {k.qty > 1 ? `${k.qty}× ` : ''}
        {k.loan.name}
        {k.loan.owner_player === me && <span className="chip tiny">già da {otherName}</span>}
      </span>
      <input className="share-input" inputMode="decimal" placeholder="senza prezzo" value={k.value} onChange={(e) => set((xs) => xs.map((x) => (x.loan.id === k.loan.id ? { ...x, value: e.target.value } : x)))} aria-label={`Valore di ${k.loan.name}`} />
      <span className="muted small">€</span>
      {removable && (
        <button className="icon-btn sm" aria-label={`Togli ${k.loan.name}`} onClick={() => set((xs) => xs.filter((x) => x.loan.id !== k.loan.id))}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  )

  const total = keptVal + giveVal
  return (
    <Modal title={`Salda con ${otherName}`} onClose={onClose}>
      <div className="stack">
        <div className="card stack-sm">
          <div className="row between">
            <h3 className="no-m">Tieni (diventano tue)</h3>
            <span className="small">~{eur(keptVal / 100)}</span>
          </div>
          {keep.length === 0 && <p className="muted small no-m">Nessuna sua carta: selezionale nel conto.</p>}
          {keep.map((k) => keptRow(k, setKeep, true))}
        </div>

        <div className="card stack-sm">
          <div className="row between">
            <h3 className="no-m">In cambio dai</h3>
            <span className="small">~{eur(giveVal / 100)}</span>
          </div>
          {mine.map((k) => keptRow(k, setMine, true))}
          {given.map((g) => (
            <div key={g.key} className="row between line">
              <span className="grow">
                {g.name} <span className="chip tiny">dal tuo album</span>
              </span>
              {g.loading ? (
                <span className="muted small">…</span>
              ) : (
                <input className="share-input" inputMode="decimal" placeholder="senza prezzo" value={g.value} onChange={(e) => setGiven((xs) => xs.map((x) => (x.key === g.key ? { ...x, value: e.target.value } : x)))} aria-label={`Valore di ${g.name}`} />
              )}
              <span className="muted small">€</span>
              <button className="icon-btn sm" aria-label={`Togli ${g.name}`} onClick={() => setGiven((xs) => xs.filter((x) => x.key !== g.key))}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          {money.map((m) => (
            <div key={m.key} className="stack-sm line">
              <div className="row between">
                <span className="grow strong">Soldi</span>
                <input className="share-input" inputMode="decimal" placeholder="0,00" value={m.amount} onChange={(e) => setMoney((xs) => xs.map((x) => (x.key === m.key ? { ...x, amount: e.target.value } : x)))} aria-label="Importo" />
                <span className="muted small">€</span>
                <button className="icon-btn sm" aria-label="Togli i soldi" onClick={() => setMoney((xs) => xs.filter((x) => x.key !== m.key))}>
                  <Icon name="x" size={14} />
                </button>
              </div>
              <Segmented
                value={m.mode}
                onChange={(v) => setMoney((xs) => xs.map((x) => (x.key === m.key ? { ...x, mode: v } : x)))}
                options={[
                  { id: 'due', label: 'Da pagare' },
                  { id: 'paid_now', label: 'Pagati ora' },
                ]}
              />
            </div>
          ))}
          {adding === 'album' && (
            <CardSearch
              autoFocus
              onPick={(n) => {
                addGiven(n)
                setAdding(null)
              }}
            />
          )}
          {adding === 'mine' && (
            <div className="chips">
              {available.map((l) => (
                <button
                  key={l.id}
                  className="chip"
                  onClick={() => {
                    setMine((xs) => [...xs, { loan: l, qty: l.quantity, value: '' }])
                    loadPrices([l.name]).then((m) => setMine((xs) => xs.map((x) => (x.loan.id === l.id && !x.value ? { ...x, value: centsToInput(m.get(l.name)?.cents ?? null) } : x))))
                    setAdding(null)
                  }}
                >
                  {l.quantity > 1 ? `${l.quantity}× ` : ''}
                  {l.name}
                </button>
              ))}
              {available.length === 0 && <span className="muted small">{otherName} non ha altre tue carte.</span>}
            </div>
          )}
          <div className="row wrap">
            <button className="small-btn" onClick={() => setMoney((xs) => [...xs, { key: crypto.randomUUID(), amount: '', mode: 'due' }])}>
              <Icon name="plus" size={14} /> Soldi
            </button>
            <button className="small-btn" onClick={() => setAdding(adding === 'album' ? null : 'album')}>
              <Icon name="plus" size={14} /> Carta dal tuo album
            </button>
            <button className="small-btn" onClick={() => setAdding(adding === 'mine' ? null : 'mine')}>
              <Icon name="plus" size={14} /> Tua carta che ha già
            </button>
          </div>
        </div>

        <div className="card stack-sm trade-sum">
          <div className="gap-bar" role="img" aria-label="Tieni contro dai">
            <i style={{ width: total ? `${(keptVal / total) * 100}%` : '50%' }} />
          </div>
          <div className="row between small">
            <span>Tieni ~{eur(keptVal / 100)}</span>
            <span>Dai ~{eur(giveVal / 100)}</span>
          </div>
          <div className="strong">{diff === 0 ? 'Pari' : diff > 0 ? `Mancano ~${eur(diff / 100)} per ${otherName}` : `Sei in avanti di ~${eur(-diff / 100)}`}</div>
          {noPrice > 0 && <p className="muted small no-m">{noPrice} cart{noPrice === 1 ? 'a' : 'e'} senza prezzo, esclus{noPrice === 1 ? 'a' : 'e'} dai totali</p>}
          {diff !== 0 && (
            <Segmented
              value={resolution}
              onChange={setResolution}
              options={[
                { id: 'accepted', label: 'Va bene così' },
                { id: 'money', label: `+${eur(Math.abs(diff) / 100)} in soldi` },
              ]}
            />
          )}
          <p className="muted small no-m">I soldi da pagare entrano nei saldi (scheda Soldi). Il valore delle carte si congela adesso.</p>
        </div>
        <input placeholder="Nota (facoltativa)" value={note} onChange={(e) => setNote(e.target.value)} />
        {failed && <p className="small neg no-m">Saldo non salvato: controlla la connessione e riprova.</p>}
        <button className="primary" disabled={busy || (!keep.length && !mine.length && !given.length && !money.length)} onClick={confirm}>
          Conferma saldo
        </button>
      </div>
    </Modal>
  )
}

// Dettaglio di un saldo (da Storico o dal movimento "Saldo carte con X" nei Soldi)
export function SettlementDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { settlements, settlement_items, card_loans, debts, players, batch } = useStore()
  const perms = usePerms()
  const s = settlements.find((x) => x.id === id)
  const name = (pid: string) => players.find((p) => p.id === pid)?.name ?? '?'
  if (!s)
    return (
      <Modal title="Saldo" onClose={onClose}>
        <p className="muted">Saldo non trovato.</p>
      </Modal>
    )
  const items = settlement_items.filter((i) => i.settlement_id === s.id)
  const linkedDebts = debts.filter((d) => d.settlement_id === s.id)
  const canUndo = perms.involved(s.player_a, s.player_b) && linkedDebts.every((d) => !d.settled)
  const line = (i: SettlementItem) => (
    <div key={i.id} className="row between line">
      <span className="grow">
        {i.kind === 'money' ? (
          <>
            Soldi da {name(i.from_player)} a {name(i.to_player)} · <span className="muted">{i.mode === 'due' ? 'da pagare' : 'pagati ora'}</span>
          </>
        ) : (
          <>
            <CardName name={i.name!} qty={i.quantity} value={i.value_cents == null ? null : i.value_cents * i.quantity} />{' '}
            <span className="muted small">{i.kind === 'kept' ? `di ${name(i.from_player)}, la tiene ${name(i.to_player)}` : `da ${name(i.from_player)} a ${name(i.to_player)}`}</span>
          </>
        )}
      </span>
      <span className="small nowrap">{i.kind === 'money' ? eur(i.amount_cents! / 100) : eurCents(i.value_cents == null ? null : i.value_cents * i.quantity)}</span>
    </div>
  )

  // annullare: le carte tornano nel conto, i soldi da pagare spariscono (solo se nessuno li ha ancora pagati)
  async function undo() {
    if (!s || !(await ask('Annullare il saldo? Le carte tornano aperte nel conto e i soldi da pagare spariscono dai saldi.'))) return
    try {
      await batch((tx) => {
        for (const l of card_loans.filter((c) => c.settlement_id === s.id)) {
          const twin = card_loans.find((c) => c.status === 'open' && c.id !== l.id && c.owner_player === l.owner_player && c.holder_player === l.holder_player && c.name.toLowerCase() === l.name.toLowerCase())
          if (twin) {
            tx.update('card_loans', twin.id, { quantity: twin.quantity + l.quantity })
            tx.remove('card_loans', l.id)
          } else tx.update('card_loans', l.id, { status: 'open', closed_at: null, settlement_id: null })
        }
        for (const d of linkedDebts) tx.remove('debts', d.id)
        for (const i of items) tx.remove('settlement_items', i.id)
        tx.remove('settlements', s.id)
      })
    } catch {
      toast('Saldo non annullato: controlla la connessione e riprova')
      return
    }
    toast('Saldo annullato')
    onClose()
  }

  return (
    <Modal title={`Saldo ${name(s.player_a)} ↔ ${name(s.player_b)}`} onClose={onClose}>
      <div className="stack">
        <p className="muted small no-m">
          {dayIt(s.created_at)}
          {s.imported && ' · importato dai vecchi prestiti'}
          {s.note && ` · ${s.note}`}
        </p>
        {items.filter((i) => i.kind === 'kept').length > 0 && (
          <div className="card stack-sm">
            <h3 className="no-m">Carte tenute</h3>
            {items.filter((i) => i.kind === 'kept').map(line)}
          </div>
        )}
        {items.filter((i) => i.kind !== 'kept').length > 0 && (
          <div className="card stack-sm">
            <h3 className="no-m">In cambio</h3>
            {items.filter((i) => i.kind !== 'kept').map(line)}
          </div>
        )}
        {s.difference_cents !== 0 && (
          <p className="small no-m">
            Differenza {eur(Math.abs(s.difference_cents) / 100)} · {s.difference_resolution === 'money' ? 'aggiunta ai saldi in soldi' : 'va bene così'}
          </p>
        )}
        {canUndo ? (
          <button className="danger" onClick={undo}>
            Annulla saldo
          </button>
        ) : (
          linkedDebts.some((d) => d.settled) && <p className="muted small no-m">I soldi di questo saldo sono già stati pagati: non si può più annullare.</p>
        )}
      </div>
    </Modal>
  )
}
