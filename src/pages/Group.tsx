// Altro → Gruppo: il tuo profilo nel gruppo, cambio gruppo e, per gli admin, inviti e membri
import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import {
  createInvite,
  deleteInvite,
  errText,
  listInvites,
  listMembers,
  removeMember,
  renamePod,
  updateMember,
  usePodRequired,
  usePerms,
  type Invite,
  type Member,
} from '../lib/pod'
import { Avatar, Modal } from '../components'
import { ChoosePlayer, GroupStart } from './Onboarding'
import { ask } from '../lib/confirm'
import { Icon } from '../icons'
import { dateIt } from '../lib/util'

export function GroupCard() {
  const pod = usePodRequired()
  const { players } = useStore()
  const { admin } = usePerms()
  const [modal, setModal] = useState<'player' | 'new' | null>(null)
  const me = players.find((p) => p.id === pod.current?.player_id)

  async function leave() {
    if (!pod.current) return
    if (!(await ask(`Uscire dal gruppo ${pod.current.name}? Per rientrare servirà un nuovo codice.`))) return
    try {
      await removeMember(pod.current.pod_id, pod.userId)
      await pod.reload()
    } catch (e) {
      alert(errText(e))
    }
  }

  return (
    <div className="card stack">
      <h2 className="section">
        <Icon name="users" size={16} /> Gruppo
      </h2>
      <div className="row between">
        <div>
          <div className="strong">{pod.current?.name}</div>
          <div className="muted small">{admin ? 'Sei admin del gruppo' : 'Sei membro del gruppo'}</div>
        </div>
        {pod.pods.length > 1 && (
          <select value={pod.current?.pod_id} onChange={(e) => pod.select(e.target.value)} aria-label="Cambia gruppo" style={{ maxWidth: '50%' }}>
            {pod.pods.map((p) => (
              <option key={p.pod_id} value={p.pod_id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="row between line">
        <span className="row">
          <Avatar p={me} size={28} /> {me ? <b>{me.name}</b> : <span className="muted">nessun giocatore</span>}
        </span>
        <button className="small-btn" onClick={() => setModal('player')}>
          Cambia
        </button>
      </div>
      <p className="muted small no-m">Puoi modificare il tuo giocatore e i tuoi mazzi{admin ? '; da admin anche tutto il resto' : ''}.</p>
      <div className="row">
        <button className="grow" onClick={() => setModal('new')}>
          Crea o entra in un altro gruppo
        </button>
        <button className="danger" onClick={leave}>
          Esci dal gruppo
        </button>
      </div>
      {modal === 'player' && (
        <Modal title="Chi sei?" onClose={() => setModal(null)}>
          <ChoosePlayer onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal === 'new' && (
        <Modal title="Altro gruppo" onClose={() => setModal(null)}>
          <GroupStart onDone={() => setModal(null)} />
        </Modal>
      )}
    </div>
  )
}

export function GroupAdmin() {
  const pod = usePodRequired()
  const { players } = useStore()
  const podId = pod.current!.pod_id
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [name, setName] = useState(pod.current!.name)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([listMembers(podId), listInvites(podId)])
      setMembers(m)
      setInvites(i)
    } catch (e) {
      setErr(errText(e))
    }
  }, [podId])
  useEffect(() => {
    load()
  }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try {
      await fn()
      await Promise.all([load(), pod.reload()])
    } catch (e) {
      setErr(errText(e))
    }
  }

  async function share(code: string) {
    const text = `Entra nel gruppo "${pod.current!.name}" su MTG tra amici con il codice ${code}`
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(code)
        setCopied(code)
      }
    } catch {
      /* condivisione annullata */
    }
  }

  const playerName = (id: string | null) => players.find((p) => p.id === id)?.name
  const taken = new Set(members.map((m) => m.player_id).filter(Boolean))

  return (
    <div className="card stack">
      <h2 className="section">
        <Icon name="edit" size={16} /> Gestione del gruppo
      </h2>

      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome del gruppo" />
        <button disabled={!name.trim() || name.trim() === pod.current!.name} onClick={() => act(() => renamePod(podId, name))}>
          Rinomina
        </button>
      </div>

      <h3 className="no-m">Inviti</h3>
      <p className="muted small no-m">Manda il codice agli amici: lo inseriscono dopo la registrazione. Vale 14 giorni e fino a 20 persone.</p>
      {invites.map((i) => (
        <div key={i.code} className="row between line">
          <span>
            <b className="invite-code">{i.code}</b>
            <span className="muted small">
              {' '}
              · fino al {dateIt(i.expires_at)} · {i.uses_left} posti
            </span>
          </span>
          <span className="row">
            <button className="small-btn" onClick={() => share(i.code)}>
              {copied === i.code ? 'Copiato' : 'Condividi'}
            </button>
            <button className="icon-btn sm danger" aria-label={`Annulla il codice ${i.code}`} onClick={() => act(() => deleteInvite(i.code))}>
              <Icon name="x" size={14} />
            </button>
          </span>
        </div>
      ))}
      <button className="primary" onClick={() => act(() => createInvite(podId))}>
        <Icon name="plus" size={16} /> Nuovo codice invito
      </button>

      <h3 className="no-m">Membri</h3>
      {members.map((m) => {
        const self = m.user_id === pod.userId
        return (
          <div key={m.user_id} className="member stack-sm line">
            <div className="member-email">
              {m.email ?? 'utente'}
              {self && <span className="muted small"> · tu</span>}
            </div>
            <div className="row member-ctrl">
              <select
                value={m.role}
                aria-label={`Ruolo di ${m.email}`}
                onChange={(e) => act(() => updateMember(podId, m.user_id, { role: e.target.value as Member['role'] }))}
              >
                <option value="admin">admin</option>
                <option value="user">user</option>
              </select>
              <select
                className="grow"
                value={m.player_id ?? ''}
                aria-label={`Giocatore di ${m.email}`}
                onChange={(e) => act(() => updateMember(podId, m.user_id, { player_id: e.target.value || null }))}
              >
                <option value="">— nessun giocatore —</option>
                {players
                  .filter((p) => p.id === m.player_id || !taken.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              {!self && (
                <button
                  className="small-btn danger"
                  onClick={async () => {
                    if (await ask(`Togliere ${m.email ?? 'questo utente'}${playerName(m.player_id) ? ` (${playerName(m.player_id)})` : ''} dal gruppo? I suoi dati restano.`))
                      act(() => removeMember(podId, m.user_id))
                  }}
                >
                  Togli
                </button>
              )}
            </div>
          </div>
        )
      })}
      {err && <p className="small neg no-m">{err}</p>}
    </div>
  )
}
