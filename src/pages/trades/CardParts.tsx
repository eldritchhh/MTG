// Pezzi condivisi degli scambi: ricerca di una carta e nome di carta con anteprima
import { useEffect, useState } from 'react'
import { italianOf, scryfallUrl, searchCards, type CardHit } from '../../lib/scryfall'
import { eurCents } from '../../lib/prices'
import { Modal } from '../../components'
import { Icon } from '../../icons'

// nome di una carta: il tocco apre un'anteprima (nomi IT/EN, valore, link), non esce subito dall'app
export function CardName({ name, qty = 1, value }: { name: string; qty?: number; value?: number | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="card-link" onClick={() => setOpen(true)}>
        {qty > 1 && <b>{qty}× </b>}
        {name}
      </button>
      {open && <CardPreview name={name} qty={qty} value={value} onClose={() => setOpen(false)} />}
    </>
  )
}

function CardPreview({ name, qty, value, onClose }: { name: string; qty: number; value?: number | null; onClose: () => void }) {
  const [it, setIt] = useState<string | undefined>()
  useEffect(() => {
    italianOf(name).then(setIt, () => {})
  }, [name])
  return (
    <Modal title={name} onClose={onClose}>
      <div className="stack">
        {it && it !== name && (
          <p className="no-m">
            In italiano: <b>{it}</b>
          </p>
        )}
        {qty > 1 && <p className="muted no-m">{qty} copie</p>}
        {value !== undefined && (
          <p className="no-m">
            Valore: <b>~{eurCents(value)}</b> <span className="muted small">(Cardmarket, edizione più economica)</span>
          </p>
        )}
        <a className="button-like primary" href={scryfallUrl(name)} target="_blank" rel="noreferrer">
          <Icon name="external" size={16} /> Apri su Scryfall
        </a>
      </div>
    </Modal>
  )
}

// ricerca con autocompletamento nella lista carte dell'app (inglese e italiano, offline)
export function CardSearch({ onPick, autoFocus }: { onPick: (name: string) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<CardHit[]>([])
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) return setHits([])
    let stale = false
    const t = setTimeout(() => {
      searchCards(q)
        .then((h) => !stale && setHits(h))
        .catch(() => !stale && setHits([]))
    }, 120)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q])

  function pick(name: string) {
    onPick(name)
    setQ('')
    setHits([])
  }

  return (
    <div className="ac">
      <input
        autoFocus={autoFocus}
        placeholder="Nome in italiano o inglese, es. Fulmine"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !q.trim()) return
          e.preventDefault()
          pick(hits[0]?.name ?? q.trim()) // Invio: il primo suggerimento, o il testo così com'è
        }}
      />
      {focused && q.trim().length >= 2 && (
        <div className="ac-list">
          {hits.length === 0 ? (
            <div className="ac-empty muted small">Nessuna carta trovata. Invio per aggiungerla comunque (senza prezzo).</div>
          ) : (
            hits.map((h) => (
              <button key={h.name} className="ac-item" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h.name)}>
                <span className="grow">
                  {h.printed ?? h.name}
                  {h.printed && h.printed !== h.name && <span className="muted small"> · {h.name}</span>}
                </span>
                <Icon name="plus" size={16} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
