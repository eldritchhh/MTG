// Scambi: Soldi (spese e debiti, come sempre) | Carte (conto carte tra due persone e saldi)
import { useMemo, useState } from 'react'
import { useMe, useStore } from '../lib/store'
import type { Debt, Player } from '../lib/types'
import { byId, dateIt, eur, netBalances, parseEur, playerName, settlements } from '../lib/util'
import { Avatar, Empty, Header, Modal, PlayerSelect, Segmented } from '../components'
import { Icon } from '../icons'
import { useInPod, usePerms } from '../lib/pod'
import { useNav } from '../lib/nav'
import { buzz } from '../lib/prefs'
import { withUndo } from '../lib/toast'
import { CardsTab } from './trades/Cards'
import { SettlementDetail } from './trades/Settle'

export default function TradesPage() {
  const [sub, setSub] = useState<'money' | 'cards'>(() => (sessionStorage.getItem('mtg:trades-tab') === 'cards' ? 'cards' : 'money'))
  return (
    <div className="stack">
      <Header title="Scambi" sub="Soldi e carte tra di noi" />
      <Segmented
        value={sub}
        onChange={(v) => {
          setSub(v)
          try {
            sessionStorage.setItem('mtg:trades-tab', v)
          } catch {
            /* storage non disponibile */
          }
        }}
        options={[
          { id: 'money', label: <span className="row gap4 center-row"><Icon name="coin" size={16} /> Soldi</span> },
          { id: 'cards', label: <span className="row gap4 center-row"><Icon name="cards" size={16} /> Carte</span> },
        ]}
      />
      {sub === 'money' ? <Money /> : <CardsTab />}
    </div>
  )
}

// ------------------------------------------------------------ SOLDI
function Money() {
  const { players, debts, update, add, remove } = useStore()
  const [me] = useMe()
  const [form, setForm] = useState<Entry | 'new' | null>(null)
  const [detail, setDetail] = useState<string | null>(null) // saldo carte da mostrare
  const [showSettled, setShowSettled] = useState(false)
  const perms = usePerms()
  const nav = useNav()
  const P = byId(players)
  // modificare una spesa = riscriverne tutte le righe: serve essere coinvolti in ognuna (chi ha pagato) o admin
  const canEdit = (e: Entry) => e.rows.every((r) => perms.involved(r.debtor_id, r.creditor_id))

  const bal = useMemo(() => netBalances(debts), [debts])
  const plan = useMemo(() => settlements(bal), [bal])
  const entries = useMemo(() => toEntries(debts).filter((e) => showSettled || e.rows.some((r) => !r.settled)), [debts, showSettled])

  // "Pagato": si esegue subito, con "Annulla" nel messaggio (al posto della conferma)
  async function settlePair(from: string, to: string, amount: number) {
    buzz()
    const msg = `${P[from]?.name} ha dato ${eur(amount)} a ${P[to]?.name}`
    // se il pareggio riguarda solo loro due chiudo i debiti aperti tra i due
    const open = debts.filter((d) => !d.settled && ((d.debtor_id === from && d.creditor_id === to) || (d.debtor_id === to && d.creditor_id === from)))
    const pairNet = open.reduce((s, d) => s + (d.debtor_id === from ? d.amount : -d.amount), 0)
    if (Math.abs(pairNet - amount) < 0.005) {
      await withUndo(
        msg,
        () => Promise.all(open.map((d) => update('debts', d.id, { settled: true }))),
        () => Promise.all(open.map((d) => update('debts', d.id, { settled: false }))),
      )
    } else {
      // il pareggio coinvolge più persone: registro il pagamento come movimento compensativo
      let row: { id: string } | null = null
      await withUndo(
        msg,
        async () => (row = await add('debts', { debtor_id: to, creditor_id: from, amount, description: 'Pagamento', settled: false, group_id: null, group_total: null })),
        () => row && remove('debts', row.id),
      )
    }
  }

  return (
    <div className="stack">
      {me && P[me] && (
        <div className="card hero">
          <div className="muted small">Il tuo saldo</div>
          <div className={`big ${(bal[me] ?? 0) >= 0 ? 'pos' : 'neg'}`}>{eur(bal[me] ?? 0)}</div>
          <div className="muted small">{(bal[me] ?? 0) >= 0 ? 'devi ricevere' : 'devi dare'}</div>
        </div>
      )}

      <div className="card">
        <h2 className="section">Saldi</h2>
        {players.filter((p) => Math.abs(bal[p.id] ?? 0) > 0.004).length === 0 && <p className="muted">Tutti in pari 🎉</p>}
        {players
          .filter((p) => Math.abs(bal[p.id] ?? 0) > 0.004)
          .sort((a, b) => (bal[b.id] ?? 0) - (bal[a.id] ?? 0))
          .map((p) => (
            <div key={p.id} className="row between line">
              <span className="row">
                <Avatar p={p} size={24} /> {p.name}
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
                  <button className="small-btn" onClick={() => settlePair(s.from, s.to, s.amount)}>
                    Pagato
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="row between">
        <h2 className="section">Movimenti</h2>
        <button className="primary" onClick={() => setForm('new')} disabled={players.length < 2}>
          <Icon name="plus" size={18} /> Spesa
        </button>
      </div>
      <label className="row small muted">
        <input type="checkbox" checked={showSettled} onChange={(e) => setShowSettled(e.target.checked)} /> mostra saldati
      </label>
      {entries.length === 0 &&
        (players.length < 2 ? (
          <Empty icon="coin" action={{ label: 'Vai a Giocatori', run: () => nav.setTab('players') }}>
            Servono almeno 2 giocatori.
          </Empty>
        ) : (
          <Empty icon="coin" action={{ label: 'Aggiungi una spesa', run: () => setForm('new') }}>
            Nessun movimento aperto.
          </Empty>
        ))}
      <div className="list">
        {entries.map((e) =>
          e.rows.length === 1 && !e.rows[0].group_id ? (
            <button
              key={e.key}
              className={`list-item ${e.rows[0].settled ? 'done' : ''}`}
              // i movimenti creati da un saldo carte aprono il dettaglio del saldo
              onClick={() => (e.rows[0].settlement_id ? setDetail(e.rows[0].settlement_id) : setForm(e))}
              disabled={!e.rows[0].settlement_id && !canEdit(e)}
            >
              <div className="grow">
                <div>
                  <b>{playerName(P, e.rows[0].debtor_id)}</b> deve a <b>{playerName(P, e.rows[0].creditor_id)}</b>
                </div>
                <div className="muted small">
                  {e.rows[0].settlement_id && <Icon name="cards" size={12} />} {e.rows[0].description || 'senza descrizione'} · {dateIt(e.rows[0].created_at)}
                </div>
              </div>
              <div className="strong">{eur(e.rows[0].amount)}</div>
            </button>
          ) : (
            <button key={e.key} className={`list-item group-item ${e.rows.every((r) => r.settled) ? 'done' : ''}`} onClick={() => setForm(e)} disabled={!canEdit(e)}>
              <div className="grow stack-sm">
                <div className="row between">
                  <span>
                    <b>{playerName(P, e.rows[0].creditor_id)}</b> ha pagato
                  </span>
                  <span className="strong">{eur(groupTotal(e.rows))}</span>
                </div>
                <div className="muted small">
                  <Icon name="users" size={13} /> {e.rows[0].description || 'Spesa divisa'} · {dateIt(e.rows[0].created_at)}
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
          ),
        )}
      </div>
      {form && <ExpenseForm entry={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {detail && <SettlementDetail id={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

type Entry = { key: string; rows: Debt[]; created_at: string }

// raggruppa le righe della stessa spesa divisa
function toEntries(debts: Debt[]): Entry[] {
  const groups = new Map<string, Debt[]>()
  for (const d of debts) {
    const k = d.group_id ?? d.id
    groups.set(k, [...(groups.get(k) ?? []), d])
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({ key, rows, created_at: rows[0].created_at }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

const groupTotal = (rows: Debt[]) => rows[0].group_total ?? rows.reduce((s, r) => s + r.amount, 0)

// divide in centesimi senza perdere arrotondamenti (i centesimi in più vanno ai primi)
function splitEqual(total: number, n: number) {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  return Array.from({ length: n }, (_, i) => (base + (i < cents - base * n ? 1 : 0)) / 100)
}
type Errors = Partial<Record<'debtor' | 'creditor' | 'amount' | 'payer' | 'total' | 'part' | 'shares', string>>

function ExpenseForm({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const { players, add, update, remove } = useStore()
  const [me] = useMe()
  const perms = usePerms()
  const first = entry?.rows[0]
  const isGroup = !!first?.group_id
  const [mode, setMode] = useState<'single' | 'split'>(entry ? (isGroup ? 'split' : 'single') : 'split')

  // --- tra due persone
  const [debtor, setDebtor] = useState(!isGroup ? (first?.debtor_id ?? '') : '')
  const [creditor, setCreditor] = useState(first?.creditor_id ?? me ?? '')
  const [amount, setAmount] = useState(!isGroup && first ? String(first.amount).replace('.', ',') : '')
  const [desc, setDesc] = useState(first?.description ?? '')

  // --- spesa divisa
  const [total, setTotal] = useState(isGroup && first ? String(groupTotal(entry!.rows)).replace('.', ',') : '')
  const initialPart = isGroup ? entry!.rows.map((r) => r.debtor_id) : []
  const payerIncluded = isGroup ? Math.abs(groupTotal(entry!.rows) - entry!.rows.reduce((s, r) => s + r.amount, 0)) > 0.004 : true
  const [part, setPart] = useState<string[]>(isGroup ? (payerIncluded ? [first!.creditor_id, ...initialPart] : initialPart) : [])
  const [custom, setCustom] = useState(false)
  const [shares, setShares] = useState<Record<string, string>>(() =>
    isGroup ? Object.fromEntries(entry!.rows.map((r) => [r.debtor_id, String(r.amount).replace('.', ',')])) : {},
  )

  const tot = parseEur(total)
  const payer = creditor
  const equal = useMemo(() => (tot > 0 && part.length ? splitEqual(tot, part.length) : []), [tot, part.length])
  const shareOf = (id: string) => (custom ? parseEur(shares[id] ?? '') || 0 : equal[part.indexOf(id)] ?? 0)
  const assigned = part.reduce((s, id) => s + shareOf(id), 0)
  const diff = Math.round((tot - assigned) * 100) / 100

  const amt = parseEur(amount)
  // chi non è admin registra solo movimenti in cui è coinvolto (nelle spese divise: quelle che ha pagato lui)
  const allowed = mode === 'single' ? perms.involved(debtor, creditor) : perms.involved(payer)
  const [errors, setErrors] = useState<Errors>({})
  const inPod = useInPod()
  const active = players.filter((p) => !p.archived)

  function validate(): Errors {
    const e: Errors = {}
    if (mode === 'single') {
      if (!debtor) e.debtor = 'Scegli chi deve'
      if (!creditor) e.creditor = 'Scegli a chi'
      else if (!allowed) e.creditor = 'Puoi registrare solo debiti in cui ci sei tu'
      if (!(amt > 0)) e.amount = "Inserisci l'importo"
    } else {
      if (!payer) e.payer = 'Scegli chi ha pagato'
      else if (!allowed) e.payer = 'Puoi registrare solo le spese che hai pagato tu'
      if (!(tot > 0)) e.total = 'Inserisci il totale'
      if (!part.some((id) => id !== payer)) e.part = 'Scegli tra chi si divide (oltre a chi ha pagato)'
      else if (custom && Math.abs(diff) >= 0.005) e.shares = diff > 0 ? `Mancano ${eur(diff)} da assegnare` : `Hai assegnato ${eur(-diff)} in più del totale`
    }
    return e
  }

  function togglePart(id: string) {
    setPart((p) => (p.includes(id) ? p.filter((x) => x !== id) : players.map((x) => x.id).filter((x) => x === id || p.includes(x))))
  }

  // "Salva" sempre attivo: se manca qualcosa porto al primo campo da correggere
  async function save() {
    const e = validate()
    setErrors(e)
    const firstError = Object.keys(e)[0]
    if (firstError) {
      document.querySelector(`[data-field="${firstError}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    // modificare una spesa = sostituire le sue righe
    if (entry) for (const r of entry.rows) await remove('debts', r.id)
    if (mode === 'single') {
      await add('debts', {
        debtor_id: debtor, creditor_id: creditor, amount: Math.round(amt * 100) / 100, description: desc.trim(),
        settled: (!isGroup && first?.settled) || false, group_id: null, group_total: null,
      })
    } else {
      const group_id = crypto.randomUUID()
      for (const id of part) {
        if (id === payer) continue
        const share = Math.round(shareOf(id) * 100) / 100
        if (share <= 0) continue
        const before = entry?.rows.find((r) => r.debtor_id === id)
        await add('debts', {
          debtor_id: id, creditor_id: payer, amount: share, description: desc.trim(),
          settled: !!before && before.settled && Math.abs(before.amount - share) < 0.005,
          group_id, group_total: Math.round(tot * 100) / 100,
        })
      }
    }
    onClose()
  }

  return (
    <Modal title={entry ? 'Modifica spesa' : `Nuova spesa${inPod}`} onClose={onClose}>
      <div className="stack">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { id: 'split', label: 'Divisa tra più persone' },
            { id: 'single', label: 'Tra due persone' },
          ]}
        />
        <label className="field">
          <span>Per cosa</span>
          <input placeholder={mode === 'split' ? 'Es. Spedizione ordine CT0' : 'Es. Sol Ring + Arcane Signet'} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>

        {mode === 'single' ? (
          <>
            <label className={`field ${errors.debtor ? 'invalid' : ''}`} data-field="debtor">
              <span>Chi deve</span>
              <PlayerSelect players={players} value={debtor} onChange={setDebtor} exclude={creditor} />
              {errors.debtor && <em className="field-error">{errors.debtor}</em>}
            </label>
            <label className={`field ${errors.creditor ? 'invalid' : ''}`} data-field="creditor">
              <span>A chi</span>
              <PlayerSelect players={players} value={creditor} onChange={setCreditor} exclude={debtor} />
              {errors.creditor && <em className="field-error">{errors.creditor}</em>}
            </label>
            <label className={`field ${errors.amount ? 'invalid' : ''}`} data-field="amount">
              <span>Importo (€)</span>
              <input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {errors.amount && <em className="field-error">{errors.amount}</em>}
            </label>
          </>
        ) : (
          <>
            <div className={`field ${errors.payer ? 'invalid' : ''}`} data-field="payer">
              <span>Chi ha pagato</span>
              <div className="chips">
                {active.map((p) => (
                  <button key={p.id} className={`chip big ${creditor === p.id ? 'on' : ''}`} aria-pressed={creditor === p.id} onClick={() => setCreditor(p.id)}>
                    <Avatar p={p} size={22} /> {p.name}
                  </button>
                ))}
              </div>
              {errors.payer && <em className="field-error">{errors.payer}</em>}
            </div>
            <label className={`field ${errors.total ? 'invalid' : ''}`} data-field="total">
              <span>Totale (€)</span>
              <input inputMode="decimal" placeholder="0,00" value={total} onChange={(e) => setTotal(e.target.value)} />
              {errors.total && <em className="field-error">{errors.total}</em>}
            </label>
            <div className={`field ${errors.part ? 'invalid' : ''}`} data-field="part">
              <span>Tra chi si divide</span>
              <div className="chips">
                {active.map((p) => (
                  <button key={p.id} className={`chip big ${part.includes(p.id) ? 'on' : ''}`} onClick={() => togglePart(p.id)}>
                    <Avatar p={p} size={22} /> {p.name}
                    {p.id === payer && <span className="tiny-tag">ha pagato</span>}
                  </button>
                ))}
              </div>
              <div className="row small muted">
                <button className="link small" onClick={() => setPart(active.map((p) => p.id))}>
                  Tutti
                </button>
                <span className="dot" />
                <button className="link small" onClick={() => setPart([])}>
                  Nessuno
                </button>
              </div>
              {errors.part && <em className="field-error">{errors.part}</em>}
            </div>
            {part.length > 0 && tot > 0 && (
              <div className="card split-box">
                <div className="row between">
                  <h3 className="no-m">Quote</h3>
                  <label className="row small">
                    <input
                      type="checkbox"
                      checked={custom}
                      onChange={(e) => {
                        setCustom(e.target.checked)
                        if (e.target.checked) setShares(Object.fromEntries(part.map((id, i) => [id, String(equal[i] ?? 0).replace('.', ',')])))
                      }}
                    />{' '}
                    importi diversi
                  </label>
                </div>
                {part.map((id) => (
                  <div key={id} className="row between line">
                    <span className="row">
                      <Avatar p={P(players, id)} size={22} /> {P(players, id)?.name}
                      {id === payer && <span className="muted small">(già pagato)</span>}
                    </span>
                    {custom ? (
                      <input className="share-input" inputMode="decimal" value={shares[id] ?? ''} onChange={(e) => setShares({ ...shares, [id]: e.target.value })} />
                    ) : (
                      <b>{eur(shareOf(id))}</b>
                    )}
                  </div>
                ))}
                {custom && Math.abs(diff) >= 0.005 && (
                  <p className="small neg" data-field="shares">
                    {diff > 0 ? `Mancano ${eur(diff)} da assegnare` : `Hai assegnato ${eur(-diff)} in più del totale`}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <button className="primary" onClick={save}>
          Salva
        </button>
        {entry && entry.rows.length > 1 && (
          <div className="card stack-sm">
            <h3 className="no-m">Chi ha già restituito la sua quota</h3>
            {entry.rows.map((r) => (
              <label key={r.id} className="row between line">
                <span className="row">
                  <Avatar p={P(players, r.debtor_id)} size={22} /> {P(players, r.debtor_id)?.name} · {eur(r.amount)}
                </span>
                <input type="checkbox" checked={r.settled} onChange={(e) => update('debts', r.id, { settled: e.target.checked })} />
              </label>
            ))}
          </div>
        )}
        {entry && entry.rows.length === 1 && (
          <button
            onClick={async () => {
              await update('debts', entry.rows[0].id, { settled: !entry.rows[0].settled })
              onClose()
            }}
          >
            {entry.rows[0].settled ? 'Riapri' : '✓ Segna come saldato'}
          </button>
        )}
        {entry && (
          <button
            className="danger"
            onClick={async () => {
              const rows = entry.rows
              onClose()
              await withUndo(
                'Spesa eliminata',
                () => Promise.all(rows.map((r) => remove('debts', r.id))),
                () => Promise.all(rows.map(({ pod_id: _p, ...r }) => add('debts', r))),
              )
            }}
          >
            Elimina
          </button>
        )}
      </div>
    </Modal>
  )
}

const P = (players: Player[], id: string) => players.find((p) => p.id === id)
