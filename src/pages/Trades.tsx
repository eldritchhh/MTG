// Scambi: Soldi (spese e debiti, come sempre) | Carte (conto carte tra due persone e saldi)
import { useMemo, useState } from 'react'
import { useMe, useStore } from '../lib/store'
import type { Debt, Player } from '../lib/types'
import { byId, dayIt, eur, netBalances, parseEur, playerName, settlements } from '../lib/util'
import { Avatar, Empty, Header, Modal, Segmented, Switch } from '../components'
import { Icon } from '../icons'
import { groupTotal, payerIncluded, splitEqual } from '../lib/money'
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
  const { players, debts, add, remove, batch } = useStore()
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
  const myBal = me ? (bal[me] ?? 0) : 0
  const even = Math.abs(myBal) < 0.005

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
        () => batch((tx) => open.forEach((d) => tx.update('debts', d.id, { settled: true }))),
        () => batch((tx) => open.forEach((d) => tx.update('debts', d.id, { settled: false }))),
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
          {even ? (
            <>
              <div className="big">Sei in pari</div>
              <div className="muted small">nessun debito aperto</div>
            </>
          ) : (
            <>
              <div className={`big ${myBal > 0 ? 'pos' : 'neg'}`}>{eur(myBal)}</div>
              <div className="muted small">{myBal > 0 ? 'devi ricevere' : 'devi dare'}</div>
            </>
          )}
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
        {entries.length > 0 && (
          <button className="primary" onClick={() => setForm('new')}>
            <Icon name="plus" size={18} /> Spesa
          </button>
        )}
      </div>
      <Switch className="small muted" checked={showSettled} onChange={setShowSettled}>
        Mostra saldati
      </Switch>
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
          e.rows.length === 1 && e.rows[0].settlement_id ? (
            <button
              key={e.key}
              className={`list-item ${e.rows[0].settled ? 'done' : ''}`}
              // i movimenti creati da un saldo carte aprono il dettaglio del saldo
              onClick={() => setDetail(e.rows[0].settlement_id!)}
            >
              <div className="grow">
                <div>
                  <b>{playerName(P, e.rows[0].debtor_id)}</b> deve a <b>{playerName(P, e.rows[0].creditor_id)}</b>
                </div>
                <div className="muted small">
                  <Icon name="cards" size={12} /> {e.rows[0].description || 'Saldo carte'} · {dayIt(e.rows[0].created_at)}
                </div>
              </div>
              <div className="strong">{eur(e.rows[0].amount)}</div>
            </button>
          ) : (
            <button key={e.key} className={`list-item group-item ${e.rows.every((r) => r.settled) ? 'done' : ''}`} onClick={() => setForm(e)} disabled={!canEdit(e)}>
              <div className="grow stack-sm">
                <div className="row between">
                  <b>{e.rows[0].description || 'Spesa'}</b>
                  <span className="strong">{eur(groupTotal(e.rows))}</span>
                </div>
                <div className="muted small">
                  pagato da {playerName(P, e.rows[0].creditor_id)} · {people(e.rows, P)} · {dayIt(e.rows[0].created_at)}
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

// "per Luca" se la spesa è per una persona sola (non chi ha pagato), altrimenti "4 persone"
const people = (rows: Debt[], P: Record<string, Player>) => {
  if (rows.length === 1 && !payerIncluded(rows)) return `per ${playerName(P, rows[0].debtor_id)}`
  const n = rows.length + (payerIncluded(rows) ? 1 : 0)
  return `${n} persone`
}

const fmtEur = (n: number) => String(n).replace('.', ',')
type Errors = Partial<Record<'payer' | 'total' | 'part', string>>

// Un solo form: chi ha pagato → quanto → tra chi si divide.
// Le vecchie spese "tra due persone" si aprono qui come spese con un solo partecipante (stessi saldi).
function ExpenseForm({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const { players, update, batch } = useStore()
  const [me] = useMe()
  const perms = usePerms()
  const inPod = useInPod()
  const first = entry?.rows[0]
  const active = players.filter((p) => !p.archived || entry?.rows.some((r) => r.debtor_id === p.id || r.creditor_id === p.id))

  const [desc, setDesc] = useState(first?.description ?? '')
  const [payer, setPayer] = useState(first?.creditor_id ?? (me && active.some((p) => p.id === me) ? me : ''))
  const [total, setTotal] = useState(entry ? fmtEur(groupTotal(entry.rows)) : '')
  const [part, setPart] = useState<string[]>(() => {
    if (!entry) return []
    const ids = entry.rows.map((r) => r.debtor_id)
    return payerIncluded(entry.rows) ? [first!.creditor_id, ...ids] : ids
  })
  // quote diverse di più di un centesimo (il centesimo è l'arrotondamento della divisione in parti uguali)
  const [custom, setCustom] = useState(() => {
    const a = entry?.rows.map((r) => r.amount) ?? []
    return a.length > 1 && Math.max(...a) - Math.min(...a) > 0.011
  })
  const [shares, setShares] = useState<Record<string, string>>(() => {
    if (!entry) return {}
    const s = Object.fromEntries(entry.rows.map((r) => [r.debtor_id, fmtEur(r.amount)]))
    // la quota di chi ha pagato non è salvata: è il totale meno le altre
    if (payerIncluded(entry.rows)) s[first!.creditor_id] = fmtEur(Math.round((groupTotal(entry.rows) - entry.rows.reduce((t, r) => t + r.amount, 0)) * 100) / 100)
    return s
  })
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const tot = parseEur(total)
  const ordered = active.map((p) => p.id).filter((id) => part.includes(id))
  const equal = useMemo(() => (tot > 0 && ordered.length ? splitEqual(tot, ordered.length) : []), [tot, ordered.length])
  const shareOf = (id: string) => (custom ? parseEur(shares[id] ?? '') || 0 : (equal[ordered.indexOf(id)] ?? 0))
  const assigned = ordered.reduce((s, id) => s + shareOf(id), 0)
  const diff = Math.round((tot - assigned) * 100) / 100

  function validate(): Errors {
    const e: Errors = {}
    if (!payer) e.payer = 'Scegli chi ha pagato'
    // chi non è admin registra solo le spese che ha pagato lui
    else if (!perms.involved(payer)) e.payer = 'Puoi registrare solo le spese che hai pagato tu'
    if (!(tot > 0)) e.total = 'Inserisci il totale'
    if (!ordered.some((id) => id !== payer)) e.part = 'Scegli almeno una persona oltre a chi ha pagato'
    else if (custom && Math.abs(diff) >= 0.005) e.part = diff > 0 ? `Mancano ${eur(diff)} da assegnare` : `Hai assegnato ${eur(-diff)} in più del totale`
    return e
  }

  function togglePart(id: string) {
    setPart((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
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
    // modificare una spesa = sostituire le sue righe (tengo data e "già restituito" se la quota non cambia),
    // tutto insieme: se la connessione cade a metà non resta una spesa dimezzata
    const group_id = crypto.randomUUID()
    const group_total = Math.round(tot * 100) / 100
    setSaving(true)
    setSaveError(null)
    try {
      await batch((tx) => {
        if (entry) for (const r of entry.rows) tx.remove('debts', r.id)
        for (const id of ordered) {
          if (id === payer) continue
          const share = Math.round(shareOf(id) * 100) / 100
          if (share <= 0) continue
          const before = entry?.rows.find((r) => r.debtor_id === id)
          tx.add('debts', {
            debtor_id: id, creditor_id: payer, amount: share, description: desc.trim(),
            settled: !!before && before.settled && before.creditor_id === payer && Math.abs(before.amount - share) < 0.005,
            group_id, group_total,
            ...(first ? { created_at: first.created_at } : {}),
          })
        }
      })
      onClose()
    } catch {
      setSaveError('Non salvata: controlla la connessione e riprova.')
    } finally {
      setSaving(false)
    }
  }

  const err = (k: keyof Errors) => (errors[k] ? <em className="field-error">{errors[k]}</em> : null)

  return (
    <Modal title={entry ? 'Modifica spesa' : `Nuova spesa${inPod}`} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Per cosa</span>
          <input placeholder="Es. Spedizione ordine CT0" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>

        <div className={`field ${errors.payer ? 'invalid' : ''}`} data-field="payer">
          <span>Chi ha pagato</span>
          <div className="chips">
            {active.map((p) => (
              <button key={p.id} className={`chip big ${payer === p.id ? 'on' : ''}`} aria-pressed={payer === p.id} onClick={() => setPayer(p.id)}>
                <Avatar p={p} size={22} /> {p.name}
              </button>
            ))}
          </div>
          {err('payer')}
        </div>

        <label className={`field ${errors.total ? 'invalid' : ''}`} data-field="total">
          <span>Totale (€)</span>
          <input inputMode="decimal" placeholder="0,00" value={total} onChange={(e) => setTotal(e.target.value)} />
          {err('total')}
        </label>

        <div className={`field ${errors.part ? 'invalid' : ''}`} data-field="part">
          <span>Tra chi si divide</span>
          <div className="chips">
            {active.map((p) => (
              <button key={p.id} className={`chip big ${part.includes(p.id) ? 'on' : ''}`} aria-pressed={part.includes(p.id)} onClick={() => togglePart(p.id)}>
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
          {tot > 0 && ordered.length > 0 && !custom && (
            <p className="small muted no-m">
              {eur(tot)} · {ordered.length} person{ordered.length === 1 ? 'a' : 'e'} · {eur(equal[equal.length - 1] ?? 0)} a testa
            </p>
          )}
          {err('part')}
        </div>

        {ordered.length > 1 && tot > 0 && (
          <div className="card split-box">
            <Switch
              className="small"
              checked={custom}
              onChange={(on) => {
                setCustom(on)
                if (on) setShares(Object.fromEntries(ordered.map((id, i) => [id, fmtEur(equal[i] ?? 0)])))
              }}
            >
              Importi diversi
            </Switch>
            {custom &&
              ordered.map((id) => (
                <div key={id} className="row between line">
                  <span className="row">
                    <Avatar p={P(players, id)} size={22} /> {P(players, id)?.name}
                    {id === payer && <span className="muted small">(già pagato)</span>}
                  </span>
                  <input className="share-input" inputMode="decimal" value={shares[id] ?? ''} onChange={(e) => setShares({ ...shares, [id]: e.target.value })} />
                </div>
              ))}
          </div>
        )}

        {saveError && <p className="small neg no-m">{saveError}</p>}
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Salvo…' : 'Salva'}
        </button>
        {entry && (
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
        {entry && (
          <button
            className="danger"
            onClick={async () => {
              const rows = entry.rows
              onClose()
              await withUndo(
                'Spesa eliminata',
                () => batch((tx) => rows.forEach((r) => tx.remove('debts', r.id))),
                () => batch((tx) => rows.forEach(({ pod_id: _p, ...r }) => tx.add('debts', r))),
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
