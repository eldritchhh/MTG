import type { ReactNode } from 'react'
import type { Deck, Player } from './lib/types'
import { deckLabel } from './lib/util'
import { useStore } from './lib/store'
import { Icon } from './icons'
import { useBack } from './lib/back'

export const MANA: Record<string, string> = { W: '#f6eed3', U: '#3f8fd8', B: '#4a3f52', R: '#e2553f', G: '#2f9e5b', C: '#b9b3a6' }
const MANA_INK: Record<string, string> = { W: '#5a4a1c', U: '#e8f2ff', B: '#e6dcef', R: '#fff1ec', G: '#eafff1', C: '#3a3630' }

export function Pips({ colors, size = 16 }: { colors: string[]; size?: number }) {
  const cs = colors.length ? colors : ['C']
  return (
    <span className="pips">
      {cs.map((c) => (
        <span key={c} className="pip" style={{ background: MANA[c] ?? '#888', color: MANA_INK[c], width: size, height: size, fontSize: size * 0.58 }} title={c}>
          {c}
        </span>
      ))}
    </span>
  )
}

// sfondo generato dall'identità di colore, usato quando manca l'immagine
export function manaGradient(colors: string[], alpha = 1) {
  const cs = (colors.length ? colors : ['C']).map((c) => MANA[c])
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0')
  if (cs.length === 1) return `radial-gradient(120% 120% at 20% 10%, ${cs[0]}${a}, #120f1a 75%)`
  const stops = cs.map((c, i) => `${c}${a} ${Math.round((i / (cs.length - 1)) * 100)}%`).join(', ')
  return `linear-gradient(135deg, ${stops})`
}

export function Avatar({ p, size = 28 }: { p?: Player; size?: number }) {
  const c = p?.color ?? '#555'
  return (
    <span className="avatar" style={{ background: `linear-gradient(145deg, ${c}, ${c}99)`, boxShadow: `0 0 0 2px #0008, 0 0 14px ${c}55`, width: size, height: size, fontSize: size * 0.44 }}>
      {p?.name.slice(0, 1).toUpperCase() ?? '?'}
    </span>
  )
}

// illustrazioni del mazzo: una, o due (comandante + partner/background) affiancate a metà
export const deckArts = (d?: Pick<Deck, 'image_url' | 'partner_image_url'>) =>
  [d?.image_url, d?.partner_image_url].filter((u): u is string => !!u)

export function SplitArt({ urls, className }: { urls: string[]; className: string }) {
  return (
    <div className={`${className} split`}>
      {urls.map((u, i) => (
        <i key={i} style={{ backgroundImage: `url(${u})` }} />
      ))}
    </div>
  )
}

export function DeckArt({ d, className = '' }: { d?: Deck; className?: string }) {
  const urls = deckArts(d)
  if (urls.length) return <SplitArt urls={urls} className={`art ${className}`} />
  return (
    <div className={`art fallback ${className}`} style={{ backgroundImage: manaGradient(d?.colors ?? [], 0.85) }}>
      <span className="art-initial">{d?.commander.slice(0, 1) ?? '?'}</span>
    </div>
  )
}

export function DeckChip({ d }: { d?: Deck }) {
  if (!d) return <span className="muted">—</span>
  return (
    <span className="deckchip">
      <Pips colors={d.colors} /> {deckLabel(d)}
    </span>
  )
}

// quadratino arrotondato con il colore e l'iniziale del pod
export function PodBadge({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  return (
    <span className="pod-badge" style={{ background: color, width: size, height: size, fontSize: size * 0.46 }}>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  )
}

// schermata a tutto schermo sopra le schede (Account, Pod), con il tasto indietro
export function Screen({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useBack(onClose)
  return (
    <div className="screen">
      <div className="screen-head">
        <button className="icon-btn" onClick={onClose} aria-label="Indietro">
          <Icon name="back" size={20} />
        </button>
        <h1 className="screen-title">{title}</h1>
      </div>
      <div className="screen-body stack">{children}</div>
    </div>
  )
}

export function Header({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="grow">
        <h1>{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      {action}
    </header>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useBack(onClose)
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="row between">
          <h2 className="modal-title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function PlayerSelect({
  players,
  value,
  onChange,
  placeholder = 'Scegli…',
  exclude,
}: {
  players: Player[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  exclude?: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {players
        .filter((p) => p.id !== exclude && (!p.archived || p.id === value))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? 'active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// lista vuota: un messaggio e, se c'è, l'azione per riempirla
export function Empty({ children, icon = 'cards', action }: { children: ReactNode; icon?: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      <div>{children}</div>
      {action && (
        <button className="primary" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  )
}

export function TierBadge({ id, small }: { id: string | null | undefined; small?: boolean }) {
  const { tiers } = useStore()
  const t = tiers.find((x) => x.id === id)
  if (!t) return null
  return (
    <span className={`tier-badge ${small ? 'sm' : ''}`} style={{ ['--tc' as string]: t.color }} title={`Tier ${t.name}`}>
      {t.name}
    </span>
  )
}

export function DeckCard({ d, owner, onClick, selected }: { d: Deck; owner?: Player; onClick?: () => void; selected?: boolean }) {
  return (
    <button className={`deck-card ${d.active ? '' : 'retired'} ${selected ? 'selected' : ''}`} onClick={onClick} disabled={!onClick}>
      <div className="deck-art-wrap">
        <DeckArt d={d} />
        <TierBadge id={d.tier_id} />
      </div>
      <div className="deck-body">
        <div className="strong">{deckLabel(d)}</div>
        <div className="row small">
          <Pips colors={d.colors} />
          {owner && <span className="muted">di {owner.name}</span>}
          {!d.active && <span className="muted">· ritirato</span>}
        </div>
        {d.tags.length > 0 && (
          <div className="chips small">
            {d.tags.map((t) => (
              <span key={t} className="chip tiny">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

