// Nuovo / modifica scambio: due persone, righe di carte e di soldi in entrambe le direzioni
import { useState } from 'react'
import { useMe, useStore } from '../../lib/store'
import type { LineStatus, Trade, TradeLine } from '../../lib/types'
import { centsToInput, eur, parseEur } from '../../lib/util'
import { Modal, PlayerSelect, Segmented } from '../../components'
import { useInPod, usePerms } from '../../lib/pod'
import { priceNow } from '../../lib/prices'
import { STATUS_LABEL } from '../../lib/trades'
import { withUndo } from '../../lib/toast'
import { CardName, CardSearch } from './CardParts'
import { Icon } from '../../icons'

type Side = 'a' | 'b'
type Draft = {
  key: string
  orig?: TradeLine
  side: Side // chi dà: a o b
  kind: 'card' | 'money'
  name: string
  quantity: number
  value: string // euro (unitario) come scritto
  value_source: TradeLine['value_source']
  loading?: boolean
  status: LineStatus
  amount: string // euro
  counts: boolean // soldi da saldare (entra nei saldi)
  settled: boolean
}

const fromLine = (l: TradeLine, a: string): Draft => ({
  key: l.id, orig: l, side: l.from_player === a ? 'a' : 'b', kind: l.kind, name: l.name ?? '', quantity: l.quantity,
  value: centsToInput(l.value_cents), value_source: l.value_source, status: l.status ?? 'loan',
  amount: centsToInput(l.amount_cents), counts: l.counts_in_balance, settled: l.settled,
})

export function TradeForm({ trade, onClose, presetOther }: { trade: Trade | null; onClose: () => void; presetOther?: string }) {
  const { players, trade_lines, add, update, remove } = useStore()
  const [me] = useMe()
  const perms = usePerms()
  const inPod = useInPod()
  const [a, setA] = useState(trade?.player_a ?? me ?? '')
  const [b, setB] = useState(trade?.player_b ?? presetOther ?? '')
  const [note, setNote] = useState(trade?.note ?? '')
  const [lines, setLines] = useState<Draft[]>(() => (trade ? trade_lines.filter((l) => l.trade_id === trade.id).map((l) => fromLine(l, trade.player_a)) : []))
  const [defStatus, setDefStatus] = useState<LineStatus>('loan')
  const [adding, setAdding] = useState<Side | null>(null)
  const [addDiff, setAddDiff] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const canEdit = !trade || perms.involved(trade.player_a, trade.player_b)

  const patch = (key: string, p: Partial<Draft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)))

  async function addCard(side: Side, cardName: string) {
    const key = crypto.randomUUID()
    setLines((ls) => [...ls, { key, side, kind: 'card', name: cardName, quantity: 1, value: '', value_source: 'none', loading: true, status: defStatus, amount: '', counts: false, settled: false }])
    const p = await priceNow(cardName).catch(() => null)
    setLines((ls) => ls.map((l) => (l.key === key && l.loading ? { ...l, loading: false, value: centsToInput(p?.cents ?? null), value_source: p?.cents != null ? 'scryfall' : 'none' } : l)))
  }
  const addMoney = (side: Side) =>
    setLines((ls) => [...ls, { key: crypto.randomUUID(), side, kind: 'money', name: '', quantity: 1, value: '', value_source: null, status: 'loan', amount: '', counts: true, settled: false }])

  // valori: carte (escluse le restituite) + soldi
  const valueOf = (l: Draft) =>
    l.kind === 'money' ? Math.round(parseEur(l.amount) * 100) : l.status === 'returned' || !l.value.trim() ? 0 : Math.round(parseEur(l.value) * 100) * l.quantity
  const tot = (side: Side) => lines.filter((l) => l.side === side).reduce((s, l) => s + valueOf(l), 0)
  const noPrice = lines.filter((l) => l.kind === 'card' && !l.value.trim()).length
  const diff = tot('a') - tot('b')

  async function save() {
    setErr(null)
    if (!a || !b || a === b) return setErr('Scegli due persone diverse')
    if (!perms.involved(a, b)) return setErr('Puoi registrare solo scambi in cui ci sei tu')
    if (!lines.length) return setErr('Aggiungi almeno una carta o dei soldi')
    if (lines.some((l) => l.kind === 'money' && !(parseEur(l.amount) > 0))) return setErr('Inserisci gli importi dei soldi')
    const id = trade?.id ?? crypto.randomUUID()
    if (trade) await update('trades', id, { player_a: a, player_b: b, note: note.trim() || null })
    else await add('trades', { id, player_a: a, player_b: b, note: note.trim() || null })
    const now = new Date().toISOString()
    for (const d of lines) {
      const from = d.side === 'a' ? a : b
      const to = d.side === 'a' ? b : a
      const row = {
        trade_id: id, from_player: from, to_player: to, kind: d.kind,
        status: d.kind === 'card' ? d.status : null,
        name: d.kind === 'card' ? d.name : null,
        quantity: d.kind === 'card' ? d.quantity : 1,
        value_cents: d.kind === 'card' && d.value.trim() ? Math.round(parseEur(d.value) * 100) : null,
        value_source: d.kind === 'card' ? (d.value.trim() ? d.value_source ?? 'manual' : 'none') : null,
        valued_at: d.kind === 'card' && d.value.trim() ? (d.orig?.valued_at ?? now) : null,
        returned_at: d.kind === 'card' && d.status === 'returned' ? (d.orig?.returned_at ?? now) : null,
        amount_cents: d.kind === 'money' ? Math.round(parseEur(d.amount) * 100) : null,
        counts_in_balance: d.kind === 'money' ? d.counts : false,
        settled: d.settled,
        linked_line_id: d.orig?.linked_line_id ?? null,
      }
      if (d.orig) await update('trade_lines', d.orig.id, row)
      else await add('trade_lines', row)
    }
    // righe tolte
    if (trade) for (const l of trade_lines.filter((x) => x.trade_id === trade.id && !lines.some((d) => d.orig?.id === x.id))) await remove('trade_lines', l.id)
    // differenza nei saldi: chi ha ricevuto di più deve la differenza all'altro
    if (addDiff && diff !== 0) {
      const [from, to] = diff > 0 ? [b, a] : [a, b]
      await add('trade_lines', {
        trade_id: id, from_player: from, to_player: to, kind: 'money', status: null, name: null, quantity: 1, value_cents: null, value_source: null,
        valued_at: null, returned_at: null, amount_cents: Math.abs(diff), counts_in_balance: true, settled: false, linked_line_id: null,
      })
    }
    onClose()
  }

  async function del() {
    if (!trade) return
    const ls = trade_lines.filter((l) => l.trade_id === trade.id)
    onClose()
    await withUndo(
      'Scambio eliminato',
      async () => {
        for (const l of ls) await remove('trade_lines', l.id)
        await remove('trades', trade.id)
      },
      async () => {
        const { pod_id: _p, ...t } = trade
        await add('trades', t)
        for (const { pod_id: _q, ...l } of ls) await add('trade_lines', l)
      },
    )
  }

  const block = (side: Side) => {
    const who = side === 'a' ? a : b
    const mine = lines.filter((l) => l.side === side)
    return (
      <div className="card stack-sm trade-block">
        <h3 className="no-m">{who ? `${name(who)} dà` : side === 'a' ? 'Il primo dà' : 'Il secondo dà'}</h3>
        {mine.map((l) =>
          l.kind === 'card' ? (
            <div key={l.key} className="trade-line">
              <div className="row between">
                <span className="grow">
                  <CardName name={l.name} qty={l.quantity} value={l.value.trim() ? Math.round(parseEur(l.value) * 100) * l.quantity : null} />
                </span>
                <span className="row tl-value">
                  {l.loading ? (
                    <span className="muted small">…</span>
                  ) : (
                    <input className="share-input" inputMode="decimal" placeholder="senza prezzo" value={l.value} disabled={!canEdit} onChange={(e) => patch(l.key, { value: e.target.value, value_source: 'manual' })} aria-label={`Valore di ${l.name}`} />
                  )}
                  <span className="muted small">€</span>
                </span>
                {canEdit && (
                  <button className="icon-btn sm" aria-label={`Togli ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
              <div className="row between small">
                <span className="stepper mini-stepper">
                  <button disabled={!canEdit || l.quantity <= 1} onClick={() => patch(l.key, { quantity: l.quantity - 1 })} aria-label="Una copia in meno">
                    −
                  </button>
                  <b>{l.quantity}</b>
                  <button disabled={!canEdit} onClick={() => patch(l.key, { quantity: l.quantity + 1 })} aria-label="Una copia in più">
                    +
                  </button>
                </span>
                <select value={l.status} disabled={!canEdit} onChange={(e) => patch(l.key, { status: e.target.value as LineStatus })} className="status-select" aria-label={`Stato di ${l.name}`}>
                  {(Object.keys(STATUS_LABEL) as LineStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div key={l.key} className="trade-line">
              <div className="row between">
                <span className="grow strong">Soldi</span>
                <input className="share-input" inputMode="decimal" placeholder="0,00" value={l.amount} disabled={!canEdit || l.settled} onChange={(e) => patch(l.key, { amount: e.target.value })} aria-label="Importo" />
                <span className="muted small">€</span>
                {canEdit && !l.settled && (
                  <button className="icon-btn sm" aria-label="Togli i soldi" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
              {l.settled ? (
                <span className="muted small">Saldato con "Pagato": non si modifica</span>
              ) : (
                <label className="row small muted">
                  <input type="checkbox" checked={l.counts} disabled={!canEdit} onChange={(e) => patch(l.key, { counts: e.target.checked })} /> da saldare (entra nei saldi; se no: dati subito)
                </label>
              )}
            </div>
          ),
        )}
        {canEdit &&
          (adding === side ? (
            <CardSearch
              autoFocus
              onPick={(n) => {
                addCard(side, n)
                setAdding(null)
              }}
            />
          ) : (
            <div className="row">
              <button className="small-btn" onClick={() => setAdding(side)} disabled={!who}>
                <Icon name="plus" size={14} /> Carta
              </button>
              <button className="small-btn" onClick={() => addMoney(side)} disabled={!who}>
                <Icon name="plus" size={14} /> Soldi
              </button>
            </div>
          ))}
      </div>
    )
  }

  return (
    <Modal title={trade ? 'Scambio' : `Nuovo scambio${inPod}`} onClose={onClose}>
      <div className="stack">
        <div className="row trade-people">
          <span className="grow">
            <PlayerSelect players={players} value={a} onChange={setA} exclude={b} />
          </span>
          <button
            className="icon-btn"
            aria-label="Inverti le persone"
            disabled={!canEdit}
            onClick={() => {
              setA(b)
              setB(a)
              setLines((ls) => ls.map((l) => ({ ...l, side: l.side === 'a' ? 'b' : 'a' })))
            }}
          >
            <Icon name="swap" size={18} />
          </button>
          <span className="grow">
            <PlayerSelect players={players} value={b} onChange={setB} exclude={a} />
          </span>
        </div>

        {block('a')}
        {block('b')}

        {canEdit && (
          <div className="row between small">
            <span className="muted">Stato delle nuove carte</span>
            <Segmented
              value={defStatus}
              onChange={setDefStatus}
              options={[
                { id: 'loan', label: 'In prestito' },
                { id: 'permanent', label: 'Definitivo' },
              ]}
            />
          </div>
        )}

        {lines.length > 0 && a && b && (
          <div className="card stack-sm trade-sum">
            <div className="row between">
              <span>{name(a)} dà</span>
              <b>~{eur(tot('a') / 100)}</b>
            </div>
            <div className="row between">
              <span>{name(b)} dà</span>
              <b>~{eur(tot('b') / 100)}</b>
            </div>
            <div className="row between gold">
              <span>{diff === 0 ? 'Pari' : `Differenza a favore di ${name(diff > 0 ? a : b)}`}</span>
              <b>{diff !== 0 && eur(Math.abs(diff) / 100)}</b>
            </div>
            {noPrice > 0 && <p className="muted small no-m">{noPrice} cart{noPrice === 1 ? 'a' : 'e'} senza prezzo, non contat{noPrice === 1 ? 'a' : 'e'}</p>}
            {canEdit && diff !== 0 && (
              <label className="row small">
                <input type="checkbox" checked={addDiff} onChange={(e) => setAddDiff(e.target.checked)} /> Aggiungi la differenza ai saldi in soldi
              </label>
            )}
            <p className="muted small no-m">Valori Cardmarket via Scryfall (edizione più economica), modificabili a mano. Il valore delle carte non entra nei saldi se non lo aggiungi tu.</p>
          </div>
        )}

        <label className="field">
          <span>Note</span>
          <input placeholder="Es. per il torneo di sabato" value={note} disabled={!canEdit} onChange={(e) => setNote(e.target.value)} />
        </label>
        {err && <p className="small neg no-m">{err}</p>}
        {canEdit ? (
          <button className="primary" onClick={save}>
            Salva scambio
          </button>
        ) : (
          <p className="muted small center-text no-m">Solo le due persone coinvolte o un admin possono modificarlo.</p>
        )}
        {trade && canEdit && (
          <button className="danger" onClick={del}>
            Elimina scambio
          </button>
        )}
        {trade && <p className="muted small center-text no-m">Creato il {new Date(trade.created_at).toLocaleDateString('it-IT')}</p>}
      </div>
    </Modal>
  )
}
