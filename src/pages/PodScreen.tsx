// "I tuoi pod" (selettore dalla pill in alto) e schermata del pod attivo (Gestisci / Dettagli)
import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import {
  POD_COLORS,
  createInvite,
  deleteInvite,
  errText,
  listInvites,
  listMembers,
  removeMember,
  updateMember,
  updatePod,
  usePodRequired,
  type Invite,
  type Member,
} from '../lib/pod'
import { Avatar, Modal, PodBadge, Screen } from '../components'
import { GroupStart } from './Onboarding'
import { TierManager } from './Settings'
import { useNav } from '../lib/nav'
import { ask } from '../lib/confirm'
import { toast } from '../lib/toast'
import { Icon } from '../icons'
import { onDate } from '../lib/util'
import { Tip } from '../lib/tips'

const lastGame = (iso: string | null) => {
  if (!iso) return 'nessuna partita'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return `ultima partita ${days <= 0 ? 'oggi' : days === 1 ? 'ieri' : `${days} giorni fa`}`
}

export function PodSheet({ onClose }: { onClose: () => void }) {
  const pod = usePodRequired()
  const nav = useNav()
  const [start, setStart] = useState(false)
  const cur = pod.current!

  return (
    <Modal title="I tuoi pod" onClose={onClose}>
      <div className="stack">
        <div className="list">
          {pod.pods.map((p) => {
            const active = p.pod_id === cur.pod_id
            return (
              <button
                key={p.pod_id}
                className={`list-item pod-row ${active ? 'selected' : ''}`}
                aria-current={active}
                onClick={() => {
                  if (!active) pod.select(p.pod_id, true)
                  onClose()
                }}
              >
                <PodBadge name={p.name} color={p.color} />
                <div className="grow">
                  <div className="strong">{p.name}</div>
                  <div className="muted small">
                    {p.players} giocator{p.players === 1 ? 'e' : 'i'} · {lastGame(p.last_game)}
                  </div>
                </div>
                <span className={`role-chip ${p.role}`}>{p.role === 'admin' ? 'Admin' : 'Membro'}</span>
                {active && <Icon name="check" size={18} className="gold" />}
              </button>
            )
          })}
        </div>
        {start ? (
          <GroupStart
            onDone={() => {
              setStart(false)
              onClose()
            }}
            onCancel={() => setStart(false)}
          />
        ) : (
          <div className="row pod-actions">
            <button className="grow" onClick={() => setStart(true)}>
              <Icon name="plus" size={16} /> Crea pod
            </button>
            <button className="grow" onClick={() => setStart(true)}>
              Entra con codice
            </button>
          </div>
        )}
        <button className="link center-self pod-manage" onClick={nav.openPod}>
          {cur.role === 'admin' ? 'Gestisci' : 'Dettagli di'} «{cur.name}» ›
        </button>
      </div>
      <Tip
        id="pods"
        steps={[
          { icon: 'users', target: '.modal .pod-row.selected', title: 'I tuoi pod', text: 'Ogni pod è un gruppo con i suoi giocatori, partite e spese. Tocca un pod per passarci: il colore in alto ti dice sempre in quale sei.' },
          { icon: 'plus', target: '.modal .pod-actions', title: 'Nuovi gruppi', text: 'Crea un pod per un altro gruppo di amici, oppure entra in quello di qualcuno con il codice invito che ti manda.' },
          { icon: 'edit', target: '.modal .pod-manage', title: cur.role === 'admin' ? 'Gestire il pod' : 'Dettagli del pod', text: cur.role === 'admin' ? 'Nome, colore, codici invito, membri e tier del pod.' : 'Chi c\'è nel pod, e da qui puoi anche uscire.' },
        ]}
      />
    </Modal>
  )
}

// Schermata del pod attivo: per tutti membri e uscita; per gli admin anche nome, colore, inviti, ruoli e tier
export function PodScreen({ onClose }: { onClose: () => void }) {
  const pod = usePodRequired()
  const { players } = useStore()
  const cur = pod.current!
  const admin = cur.role === 'admin'
  const podId = cur.pod_id
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [name, setName] = useState(cur.name)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([listMembers(podId), admin ? listInvites(podId) : Promise.resolve([])])
      setMembers(m)
      setInvites(i)
    } catch (e) {
      setErr(errText(e))
    }
  }, [podId, admin])
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
    const text = `Entra nel pod "${cur.name}" su MTGUtils con il codice ${code}`
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

  async function leave() {
    if (!(await ask(`Uscire dal pod ${cur.name}? Per rientrare servirà un nuovo codice. I tuoi dati nel pod restano.`))) return
    try {
      await removeMember(podId, pod.userId)
      await pod.reload()
      onClose()
      toast(`Sei uscito da ${cur.name}`)
    } catch (e) {
      setErr(errText(e))
    }
  }

  const playerName = (id: string | null) => players.find((p) => p.id === id)?.name
  const taken = new Set(members.map((m) => m.player_id).filter(Boolean))

  return (
    <Screen title={admin ? 'Gestisci pod' : 'Dettagli del pod'} onClose={onClose}>
      <div className="row pod-hero">
        <PodBadge name={cur.name} color={cur.color} size={52} />
        <div className="grow">
          <div className="pod-hero-name">{cur.name}</div>
          <div className="muted small">
            {admin ? 'Sei admin' : 'Sei membro'} · {cur.players} giocator{cur.players === 1 ? 'e' : 'i'} · {members.length} account
          </div>
        </div>
      </div>

      {admin && (
        <div className="card stack">
          <h2 className="section">
            <Icon name="edit" size={16} /> Nome e colore
          </h2>
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome del pod" />
            <button disabled={!name.trim() || name.trim() === cur.name} onClick={() => act(() => updatePod(podId, { name: name.trim() }))}>
              Rinomina
            </button>
          </div>
          <div className="chips">
            {POD_COLORS.map((c) => (
              <button key={c} className={`swatch ${c === cur.color ? 'on' : ''}`} style={{ background: c }} aria-label={`Colore ${c}`} onClick={() => act(() => updatePod(podId, { color: c }))} />
            ))}
          </div>
        </div>
      )}

      {admin && (
        <div className="card stack invites-card">
          <h2 className="section">
            <Icon name="plus" size={16} /> Inviti
          </h2>
          <p className="muted small no-m">Manda il codice agli amici: lo inseriscono dopo la registrazione. Vale 14 giorni e fino a 20 persone.</p>
          {invites.map((i) => (
            <div key={i.code} className="row between line">
              <span>
                <b className="invite-code">{i.code}</b>
                <span className="muted small">
                  {' '}
                  · fino {onDate('al', i.expires_at)} · {i.uses_left} posti
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
        </div>
      )}

      <div className="card stack members-card">
        <h2 className="section">
          <Icon name="users" size={16} /> Membri
        </h2>
        {members.map((m) => {
          const self = m.user_id === pod.userId
          const pl = players.find((p) => p.id === m.player_id)
          if (!admin)
            return (
              <div key={m.user_id} className="row between line">
                <span className="row">
                  <Avatar p={pl} size={26} /> {pl?.name ?? <span className="muted">nessun giocatore</span>}
                  {self && <span className="muted small">· tu</span>}
                </span>
                <span className={`role-chip ${m.role}`}>{m.role === 'admin' ? 'Admin' : 'Membro'}</span>
              </div>
            )
          return (
            <div key={m.user_id} className="member stack-sm line">
              <div className="member-email">
                {m.email ?? 'utente'}
                {self && <span className="muted small"> · tu</span>}
              </div>
              <div className="row member-ctrl">
                <select value={m.role} aria-label={`Ruolo di ${m.email}`} onChange={(e) => act(() => updateMember(podId, m.user_id, { role: e.target.value as Member['role'] }))}>
                  <option value="admin">admin</option>
                  <option value="user">membro</option>
                </select>
                <select className="grow" value={m.player_id ?? ''} aria-label={`Giocatore di ${m.email}`} onChange={(e) => act(() => updateMember(podId, m.user_id, { player_id: e.target.value || null }))}>
                  <option value="">— nessun giocatore —</option>
                  {players
                    .filter((p) => !p.archived && (p.id === m.player_id || !taken.has(p.id)))
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
                      if (await ask(`Togliere ${m.email ?? 'questo utente'}${playerName(m.player_id) ? ` (${playerName(m.player_id)})` : ''} dal pod? I suoi dati restano.`))
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
      </div>

      {admin && <TierManager />}

      {err && <p className="small neg no-m">{err}</p>}
      <button className="danger" onClick={leave}>
        Esci dal pod
      </button>
      <Tip
        id="pod-admin"
        when={admin}
        steps={[
          { icon: 'plus', target: '.invites-card', title: 'Invitare gli amici', text: 'Crea un codice e mandalo con "Condividi": gli amici lo inseriscono dopo essersi registrati.' },
          { icon: 'users', target: '.members-card', title: 'Membri', text: 'Collega ogni account al suo giocatore e decidi chi è admin. Gli admin possono modificare tutto il pod; gli altri solo le cose che li riguardano.' },
        ]}
      />
    </Screen>
  )
}
