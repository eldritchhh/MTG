// Suggerimenti contestuali: la prima volta che arrivi in una schermata, un fumetto spiega i gesti meno ovvi.
// Ricordati sul dispositivo (Android, iPhone o browser); "Salta tutti" li spegne; Account → "Rivedi i suggerimenti".
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBack } from './back'
import { Icon } from '../icons'

const SEEN = 'mtg:tips-seen'
const OFF = 'mtg:tips-off'

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? '[]')
  } catch {
    return []
  }
}
const tipsOff = () => {
  try {
    return localStorage.getItem(OFF) === '1'
  } catch {
    return true // senza storage non li mostro (ricomparirebbero sempre)
  }
}
const markSeen = (id: string) => {
  try {
    localStorage.setItem(SEEN, JSON.stringify([...new Set([...readSeen(), id])]))
  } catch {
    /* storage non disponibile */
  }
}
const skipAll = () => {
  try {
    localStorage.setItem(OFF, '1')
  } catch {
    /* storage non disponibile */
  }
}
// Account → "Rivedi i suggerimenti"
export function resetTips() {
  try {
    localStorage.removeItem(SEEN)
    localStorage.removeItem(OFF)
  } catch {
    /* storage non disponibile */
  }
}

export type TipStep = { icon?: string; title: string; text: ReactNode }

// when: mostra solo se la schermata è pronta (es. dati caricati, solo nei gruppi)
export function Tip({ id, steps, when = true }: { id: string; steps: TipStep[]; when?: boolean }) {
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!when || tipsOff() || readSeen().includes(id)) return
    const t = window.setTimeout(() => setOpen(true), 450) // dopo l'animazione della schermata
    return () => clearTimeout(t)
  }, [when, id])
  const close = () => {
    markSeen(id)
    setOpen(false)
  }
  useBack(open && close)
  if (!open) return null
  const step = steps[i]
  const last = i === steps.length - 1
  return createPortal(
    <div className="tip-bg" onClick={close}>
      <div className="tip" role="dialog" aria-modal="true" aria-label={step.title} onClick={(e) => e.stopPropagation()}>
        <div className="row tip-head">
          {step.icon && (
            <span className="tip-icon">
              <Icon name={step.icon} size={20} />
            </span>
          )}
          <h3 className="no-m">{step.title}</h3>
        </div>
        <p className="no-m">{step.text}</p>
        <div className="row between tip-actions">
          <button
            className="link small"
            onClick={() => {
              skipAll()
              close()
            }}
          >
            Salta tutti
          </button>
          {steps.length > 1 && (
            <span className="tip-dots" aria-label={`${i + 1} di ${steps.length}`}>
              {steps.map((_, k) => (
                <i key={k} className={k === i ? 'on' : ''} />
              ))}
            </span>
          )}
          <button className="primary" onClick={() => (last ? close() : setI(i + 1))}>
            {last ? 'Ho capito' : 'Avanti'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
