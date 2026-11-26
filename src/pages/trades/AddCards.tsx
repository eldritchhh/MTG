// Aggiungi carte al conto: "Prendo da X" (sue carte che prendo io) o "Do a X" (mie carte che prende lui).
// Entrano tutte aperte: non sono un debito finché non si saldano.
import { useState } from 'react'
import { useMe, useStore } from '../../lib/store'
import { parseCardLine } from '../../lib/scryfall'
import { eurCents, priceNow } from '../../lib/prices'
import { Avatar, Modal, Segmented } from '../../components'
import { useInPod } from '../../lib/pod'
import { withUndo } from '../../lib/toast'
import { CardSearch } from './CardParts'
import { Icon } from '../../icons'

type Draft = { key: string; name: string; qty: number; unit: number | null | undefined } // unit: undefined = in caricamento

export function AddCards({ presetOther, onClose }: { presetOther?: string; onClose: () => void }) {
  const { players, card_loans, batch } = useStore()
  const [me] = useMe()
  const inPod = useInPod()
  const [mode, setMode] = useState<'take' | 'give'>('take')
  const [other, setOther] = useState(presetOther ?? '')
  const [entry, setEntry] = useState<'search' | 'paste'>('search')
  const [paste, setPaste] = useState('')
  const [list, setList] = useState<Draft[]>([])
  const [err, setErr] = useState<string | null>(null)
  const others = players.filter((p) => !p.archived && p.id !== me)
  const otherName = players.find((p) => p.id === other)?.name ?? ''

  async function addName(name: string, qty = 1) {
    const ex = list.find((d) => d.name.toLowerCase() === name.toLowerCase())
    if (ex) return setList((l) => l.map((d) => (d === ex ? { ...d, qty: d.qty + qty } : d)))
    const key = crypto.randomUUID()
    setList((l) => [...l, { key, name, qty, unit: undefined }])
    const p = await priceNow(name).catch(() => null)
    setList((l) => l.map((d) => (d.key === key ? { ...d, unit: p?.cents ?? null } : d)))
  }

  function addPasted() {
    for (const line of paste.split('\n').map((x) => x.trim()).filter(Boolean)) {
      const { qty, name } = parseCardLine(line)
      if (name) addName(name, qty)
    }
    setPaste('')
    setEntry('search')
  }

  async function save() {
    setErr(null)
    if (!me) return setErr('Prima scegli chi sei (Account)')
    if (!other) return setErr(mode === 'take' ? 'Scegli da chi prendi le carte' : 'Scegli a chi le dai')
    if (!list.length) return setErr('Aggiungi almeno una carta')
    const owner = mode === 'take' ? other : me
    const holder = mode === 'take' ? me : other
    const now = new Date().toISOString()
    const done: { id: string; prevQty?: number }[] = []
    const ok = await withUndo(
      `${list.reduce((s, d) => s + d.qty, 0)} carte nel conto con ${otherName}`,
      () =>
        batch((tx) => {
          for (const d of list) {
            // la stessa carta già aperta nel conto: aumento le copie invece di fare un'altra riga
            const open = card_loans.find((l) => l.status === 'open' && l.owner_player === owner && l.holder_player === holder && l.name.toLowerCase() === d.name.toLowerCase())
            if (open) {
              tx.update('card_loans', open.id, { quantity: open.quantity + d.qty })
              done.push({ id: open.id, prevQty: open.quantity })
            } else {
              const row = tx.add('card_loans', {
                owner_player: owner, holder_player: holder, name: d.name, quantity: d.qty, note: null, added_at: now,
                status: 'open', closed_at: null, settlement_id: null,
              })
              done.push({ id: row.id })
            }
          }
        }),
      () => batch((tx) => done.forEach((d) => (d.prevQty ? tx.update('card_loans', d.id, { quantity: d.prevQty }) : tx.remove('card_loans', d.id)))),
    )
    if (ok) onClose()
  }

  const total = list.reduce((s, d) => s + (d.unit ?? 0) * d.qty, 0)
  const noPrice = list.filter((d) => d.unit === null).length

  return (
    <Modal title={`Aggiungi carte${inPod}`} onClose={onClose}>
      <div className="stack">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { id: 'take', label: 'Prendo da…' },
            { id: 'give', label: 'Do a…' },
          ]}
        />
        <div className="chips">
          {others.map((p) => (
            <button key={p.id} className={`chip big ${other === p.id ? 'on' : ''}`} aria-pressed={other === p.id} onClick={() => setOther(p.id)}>
              <Avatar p={p} size={22} /> {p.name}
            </button>
          ))}
        </div>
        <Segmented
          value={entry}
          onChange={setEntry}
          options={[
            { id: 'search', label: 'Cerca carta' },
            { id: 'paste', label: 'Incolla lista' },
          ]}
        />
        {entry === 'search' ? (
          <CardSearch onPick={(n) => addName(n)} />
        ) : (
          <>
            <textarea rows={5} placeholder={'Una carta per riga, anche con quantità:\n1 Cyclonic Rift\n2x Arcane Signet'} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button onClick={addPasted} disabled={!paste.trim()}>
              Aggiungi alla lista
            </button>
          </>
        )}
        {list.length > 0 && (
          <div className="card stack-sm">
            {list.map((d) => (
              <div key={d.key} className="row between line">
                <span className="grow">{d.name}</span>
                <span className="stepper mini-stepper">
                  <button onClick={() => setList((l) => l.map((x) => (x.key === d.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} aria-label="Una copia in meno">
                    −
                  </button>
                  <b>{d.qty}</b>
                  <button onClick={() => setList((l) => l.map((x) => (x.key === d.key ? { ...x, qty: x.qty + 1 } : x)))} aria-label="Una copia in più">
                    +
                  </button>
                </span>
                <span className="muted small nowrap tl-value">{d.unit === undefined ? '…' : eurCents(d.unit == null ? null : d.unit * d.qty)}</span>
                <button className="icon-btn sm" aria-label={`Togli ${d.name}`} onClick={() => setList((l) => l.filter((x) => x.key !== d.key))}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
            <div className="row between small">
              <span className="muted">Totale{noPrice ? ` · ${noPrice} senza prezzo` : ''}</span>
              <b>~{eurCents(total)}</b>
            </div>
          </div>
        )}
        <p className="muted small no-m">
          {other ? `Finiscono nel conto con ${otherName}. ` : ''}Non sono un debito finché non le saldi.
        </p>
        {err && <p className="small neg no-m">{err}</p>}
        <button className="primary" onClick={save}>
          Aggiungi {list.reduce((s, d) => s + d.qty, 0) || ''} carte
        </button>
      </div>
    </Modal>
  )
}
