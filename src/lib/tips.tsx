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

// target: selettore CSS di ciò che il passo descrive (anche più elementi, separati da virgola): resta illuminato
export type TipStep = { icon?: string; title: string; text: ReactNode; target?: string }

type Box = { x: number; y: number; w: number; h: number }
const PAD = 6

// posizione degli elementi da illuminare, aggiornata a ogni fotogramma (rotazioni, scroll, tastiera…)
function useBoxes(selector: string | undefined, active: boolean) {
  const [boxes, setBoxes] = useState<Box[]>([])
  useEffect(() => {
    if (!active || !selector) return setBoxes([])
    const els = () => [...document.querySelectorAll<HTMLElement>(selector)].slice(0, 4)
    els()[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    let raf = 0
    let last = ''
    const tick = () => {
      const next = els()
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }))
      const key = JSON.stringify(next)
      if (key !== last) {
        last = key
        setBoxes(next)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [selector, active])
  return boxes
}

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
  const step = steps[Math.min(i, steps.length - 1)]
  const boxes = useBoxes(step?.target, open)
  if (!open) return null
  const last = i === steps.length - 1
  const vw = window.innerWidth
  const vh = window.innerHeight
  // il fumetto va dove non copre ciò che descrive: in basso, in alto, o al centro se è sia in alto sia in basso
  const low = boxes.some((b) => b.y + b.h > vh * 0.55)
  const high = boxes.some((b) => b.y < vh * 0.35)
  const where = low && high ? 'mid' : low ? 'top' : ''
  return createPortal(
    <div className={`tip-bg ${where} ${boxes.length ? 'spot' : ''}`} onClick={close}>
      {boxes.length > 0 && (
        <>
          <svg className="tip-mask" width={vw} height={vh} aria-hidden>
            <defs>
              <mask id="tip-holes">
                <rect width={vw} height={vh} fill="white" />
                {boxes.map((b, k) => (
                  <rect key={k} x={b.x} y={b.y} width={b.w} height={b.h} rx={14} fill="black" />
                ))}
              </mask>
            </defs>
            <rect width={vw} height={vh} fill="#000000b8" mask="url(#tip-holes)" />
          </svg>
          {boxes.map((b, k) => (
            <span key={k} className="tip-ring" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />
          ))}
        </>
      )}
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
