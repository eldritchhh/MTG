// Spesa divisa tra più persone (es. spedizione di un ordine CT0), in parti uguali o con importi diversi.
// I debiti tra due persone ora sono scambi con una riga di soldi.
import { useMemo, useState } from 'react'
import { useMe, useStore } from '../../lib/store'
import type { Debt, Player } from '../../lib/types'
import { eur, parseEur } from '../../lib/util'
import { Avatar, Modal } from '../../components'
import { useInPod, usePerms } from '../../lib/pod'
import { withUndo } from '../../lib/toast'

export type Entry = { key: string; rows: Debt[]; created_at: string }

// raggruppa le righe della stessa spesa divisa
export function toEntries(debts: Debt[]): Entry[] {
  const groups = new Map<string, Debt[]>()
  for (const d of debts) {
    const k = d.group_id ?? d.id
    groups.set(k, [...(groups.get(k) ?? []), d])
  }
  return [...groups.entries()].map(([key, rows]) => ({ key, rows, created_at: rows[0].created_at }))
}

export const groupTotal = (rows: Debt[]) => rows[0].group_total ?? rows.reduce((s, r) => s + r.amount, 0)

// divide in centesimi senza perdere arrotondamenti (i centesimi in più vanno ai primi)
function splitEqual(total: number, n: number) {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  return Array.from({ length: n }, (_, i) => (base + (i < cents - base * n ? 1 : 0)) / 100)
}

type Errors = Partial<Record<'payer' | 'total' | 'part' | 'shares', string>>
const P = (players: Player[], id: string) => players.find((p) => p.id === id)

export function ExpenseForm({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const { players, add, update, remove } = useStore()
  const [me] = useMe()
  const perms = usePerms()
  const inPod = useInPod()
  const first = entry?.rows[0]
  const active = players.filter((p) => !p.archived)

  const [creditor, setCreditor] = useState(first?.creditor_id ?? me ?? '')
  const [desc, setDesc] = useState(first?.description ?? '')
  const [total, setTotal] = useState(first ? String(groupTotal(entry!.rows)).replace('.', ',') : '')
  const initialPart = entry ? entry.rows.map((r) => r.debtor_id) : []
  const payerIncluded = entry ? Math.abs(groupTotal(entry.rows) - entry.rows.reduce((s, r) => s + r.amount, 0)) > 0.004 : true
  const [part, setPart] = useState<string[]>(entry ? (payerIncluded ? [first!.creditor_id, ...initialPart] : initialPart) : [])
  const [custom, setCustom] = useState(!!entry && new Set(entry.rows.map((r) => r.amount)).size > 1)
  const [shares, setShares] = useState<Record<string, string>>(() => (entry ? Object.fromEntries(entry.rows.map((r) => [r.debtor_id, String(r.amount).replace('.', ',')])) : {}))
  const [errors, setErrors] = useState<Errors>({})

  const tot = parseEur(total)
  const payer = creditor
  const equal = useMemo(() => (tot > 0 && part.length ? splitEqual(tot, part.length) : []), [tot, part.length])
  const shareOf = (id: string) => (custom ? parseEur(shares[id] ?? '') || 0 : (equal[part.indexOf(id)] ?? 0))
  const assigned = part.reduce((s, id) => s + shareOf(id), 0)
  const diff = Math.round((tot - assigned) * 100) / 100
  const allowed = perms.involved(payer) // chi non è admin registra solo le spese che ha pagato lui

  function validate(): Errors {
    const e: Errors = {}
    if (!payer) e.payer = 'Scegli chi ha pagato'
    else if (!allowed) e.payer = 'Puoi registrare solo le spese che hai pagato tu'
    if (!(tot > 0)) e.total = 'Inserisci il totale'
    if (!part.some((id) => id !== payer)) e.part = 'Scegli tra chi si divide (oltre a chi ha pagato)'
    else if (custom && Math.abs(diff) >= 0.005) e.shares = diff > 0 ? `Mancano ${eur(diff)} da assegnare` : `Hai assegnato ${eur(-diff)} in più del totale`
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
    onClose()
  }

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

        <button className="primary" onClick={save}>
          Salva
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
