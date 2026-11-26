// Ingresso nei gruppi: crea un gruppo o entra con un codice, poi "chi sei?" nel gruppo
import { useEffect, useState } from 'react'
import { errText, playersForClaim, usePodRequired } from '../lib/pod'
import { supabase } from '../lib/supabase'
import { PLAYER_COLORS } from '../lib/util'
import { Icon } from '../icons'

export function GroupStart({ onDone, onCancel }: { onDone?: () => void; onCancel?: () => void }) {
  const pod = usePodRequired()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run(kind: 'create' | 'join') {
    setErr(null)
    setBusy(kind)
    try {
      if (kind === 'create') await pod.createPod(name.trim())
      else await pod.joinPod(code.trim())
      onDone?.()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack onboarding">
      <div className="card stack">
        <h2 className="section">
          <Icon name="plus" size={16} /> Crea un pod
        </h2>
        <p className="muted small no-m">Ne diventi admin: inviti gli amici con un codice e decidi chi gestisce cosa.</p>
        <div className="row">
          <input placeholder="Nome del pod, es. Commander del giovedì" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && run('create')} />
          <button className="primary" disabled={!name.trim() || !!busy} onClick={() => run('create')}>
            {busy === 'create' ? '…' : 'Crea'}
          </button>
        </div>
      </div>
      <div className="card stack">
        <h2 className="section">
          <Icon name="users" size={16} /> Entra con un codice
        </h2>
        <p className="muted small no-m">Chiedi il codice all'admin del pod (6 lettere e numeri).</p>
        <div className="row">
          <input
            placeholder="Es. K7PQ2M"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && code.trim() && run('join')}
            autoCapitalize="characters"
            style={{ letterSpacing: '0.15em', fontWeight: 700 }}
          />
          <button className="primary" disabled={code.trim().length < 6 || !!busy} onClick={() => run('join')}>
            {busy === 'join' ? '…' : 'Entra'}
          </button>
        </div>
      </div>
      {err && <p className="small neg center-text">{err}</p>}
      {onCancel && (
        <button className="ghost" onClick={onCancel}>
          Annulla
        </button>
      )}
    </div>
  )
}

// "Chi sei?" nel gruppo: un giocatore già inserito dall'admin (non ancora preso) oppure uno nuovo
export function ChoosePlayer({ onDone, onCancel }: { onDone?: () => void; onCancel?: () => void }) {
  const pod = usePodRequired()
  const [list, setList] = useState<{ id: string; name: string; color: string; takenBy: string | null }[] | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(PLAYER_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const podId = pod.current?.pod_id

  useEffect(() => {
    if (!podId) return
    playersForClaim(podId).then(setList, (e) => setErr(errText(e)))
  }, [podId])

  async function claim(args: { player?: string; name?: string; color?: string }) {
    setErr(null)
    setBusy(true)
    try {
      await pod.claimPlayer(args)
      onDone?.()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const free = (list ?? []).filter((p) => !p.takenBy || p.takenBy === pod.userId)

  return (
    <div className="stack onboarding">
      <p className="muted no-m">
        Nel pod <b>{pod.current?.name}</b>, chi sei? Serve per i tuoi mazzi, il tuo saldo e cosa puoi modificare.
      </p>
      {list === null && !err && <p className="muted small">Carico i giocatori…</p>}
      {free.length > 0 && (
        <div className="card stack-sm">
          <h3 className="no-m">Sono uno di questi</h3>
          <div className="chips">
            {free.map((p) => (
              <button key={p.id} className={`chip big ${pod.current?.player_id === p.id ? 'on' : ''}`} disabled={busy} onClick={() => claim({ player: p.id })}>
                <span className="avatar" style={{ background: p.color, width: 22, height: 22, fontSize: 10 }}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>{' '}
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="card stack-sm">
        <h3 className="no-m">{free.length ? 'Sono un altro' : 'Crea il tuo giocatore'}</h3>
        <input placeholder="Il tuo nome" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="chips">
          {PLAYER_COLORS.map((c) => (
            <button key={c} className={`swatch ${c === color ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
        <button className="primary" disabled={!name.trim() || busy} onClick={() => claim({ name: name.trim(), color })}>
          Sono io
        </button>
      </div>
      {err && <p className="small neg center-text">{err}</p>}
      {onCancel && (
        <button className="ghost" onClick={onCancel}>
          Annulla
        </button>
      )}
    </div>
  )
}

// schermata intera (prima di entrare nell'app)
export function GateScreen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="gate">
      <div className="gate-head">
        <img src="./emblem.png" width={37} height={48} alt="" />
        <h1>{title}</h1>
      </div>
      {children}
      <button className="link center-self" onClick={() => supabase!.auth.signOut()}>
        Esci dall'account
      </button>
    </div>
  )
}
