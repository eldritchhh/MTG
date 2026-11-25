import { useEffect, useState } from 'react'
import { useMe, useStore } from '../lib/store'
import { cardListInfo, commanderListInfo, updateCardList, updateCommanderList } from '../lib/scryfall'
import { APP_VERSION, isNewer, latestRelease, type Release } from '../lib/version'
import { PLAYER_COLORS, dateIt } from '../lib/util'
import type { Tier } from '../lib/types'
import { isCloud, supabase } from '../lib/supabase'
import { TABLES } from '../lib/types'
import { Header, PlayerSelect } from '../components'
import { ask } from '../lib/confirm'
import { Icon } from '../icons'

export default function SettingsPage() {
  const store = useStore()
  const [me, setMe] = useMe()

  function exportJson() {
    const data = Object.fromEntries(TABLES.map((t) => [t, store[t]]))
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mtg-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importJson(file: File) {
    const data = JSON.parse(await file.text())
    if (!(await ask('Importare il backup? I record verranno aggiunti a quelli esistenti (stessi id = saltati).'))) return
    for (const t of TABLES) {
      const existing = new Set((store[t] as { id: string }[]).map((r) => r.id))
      for (const row of (data[t] ?? []) as { id: string }[]) if (!existing.has(row.id)) await store.add(t, row as never)
    }
  }

  return (
    <div className="stack">
      <Header title="Altro" sub="Impostazioni e dati" />
      <div className="card stack">
        <h2 className="section">
          <Icon name="user" size={16} /> Chi sei?
        </h2>
        <p className="muted small">Serve per mostrarti il tuo saldo e preimpostare i moduli. Viene salvato solo su questo dispositivo.</p>
        <PlayerSelect players={store.players} value={me ?? ''} onChange={(v) => setMe(v || null)} placeholder="Nessuno" />
      </div>

      {isCloud && <AccessManager />}
      <TierManager />
      <CommanderList />
      <CardNamesList />

      <div className="card stack">
        <h2 className="section">
          <Icon name="cards" size={16} /> Dati
        </h2>
        <p className="muted small">
          {isCloud ? 'Sincronizzato con Supabase: tutti gli amici vedono gli stessi dati in tempo reale.' : 'Modalità locale: i dati sono solo su questo dispositivo.'}
        </p>
        {import.meta.env.VITE_DEMO !== '1' && <button onClick={exportJson}>Esporta backup (JSON)</button>}
        <label className="button-like">
          Importa backup
          <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </label>
        <button onClick={() => store.reload()}>Ricarica dati</button>
      </div>

      {APP_VERSION && <VersionCard />}

      {!isCloud && (
        <div className="card stack">
          <h2 className="section">
            <Icon name="play" size={16} /> Prova
          </h2>
          <p className="muted small">
            {store.isDemo ? 'Ora vedi dati di esempio. Svuota per partire da zero con il tuo gruppo.' : 'Carica 5 amici, 9 comandanti e 10 partite di esempio per vedere come funziona.'}
          </p>
          {store.isDemo ? (
            <button
              className="primary"
              onClick={async () => {
                if (await ask('Cancellare tutti i dati di esempio e partire da zero?')) {
                  await store.clearAll()
                  setMe(null)
                }
              }}
            >
              Svuota e inizia da zero
            </button>
          ) : (
            <button
              onClick={async () => {
                if (await ask('Sostituire i dati attuali con quelli di esempio?')) await store.loadDemo()
              }}
            >
              Carica dati di esempio
            </button>
          )}
        </div>
      )}

      {isCloud && (
        <button className="danger" onClick={() => supabase!.auth.signOut()}>
          Esci
        </button>
      )}
      <p className="muted small center-text">Immagini e nomi delle carte da Scryfall. Non affiliato a Wizards of the Coast.</p>
    </div>
  )
}

function TierManager() {
  const { tiers, decks, add, update, remove } = useStore()
  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order)
  const [name, setName] = useState('')

  async function move(t: Tier, dir: -1 | 1) {
    const i = sorted.findIndex((x) => x.id === t.id)
    const other = sorted[i + dir]
    if (!other) return
    await update('tiers', t.id, { sort_order: other.sort_order })
    await update('tiers', other.id, { sort_order: t.sort_order })
  }
  async function addTier() {
    if (!name.trim()) return
    const max = Math.max(-1, ...tiers.map((t) => t.sort_order))
    await add('tiers', { name: name.trim(), color: PLAYER_COLORS[tiers.length % PLAYER_COLORS.length], sort_order: max + 1 })
    setName('')
  }

  return (
    <div className="card stack">
      <h2 className="section">
        <Icon name="tag" size={16} /> Tier
      </h2>
      <p className="muted small">Dal più forte al più debole. Rinominali, riordinali o aggiungine quando cambiate sistema: le statistiche delle partite passate restano con il tier che il mazzo aveva quel giorno.</p>
      <div className="stack-sm">
        {sorted.map((t, i) => (
          <div key={t.id} className="tier-row">
            <button
              className="tier-color"
              style={{ background: t.color }}
              aria-label="Cambia colore"
              onClick={() => update('tiers', t.id, { color: PLAYER_COLORS[(PLAYER_COLORS.indexOf(t.color) + 1) % PLAYER_COLORS.length] })}
            />
            <input
              id={`tier-${t.id}`}
              className="tier-name"
              defaultValue={t.name}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && update('tiers', t.id, { name: e.target.value.trim() })}
            />
            <span className="muted small nowrap">{decks.filter((d) => d.tier_id === t.id).length} mazzi</span>
            <button className="icon-btn sm" disabled={i === 0} onClick={() => move(t, -1)} aria-label="Sposta su">
              ↑
            </button>
            <button className="icon-btn sm" disabled={i === sorted.length - 1} onClick={() => move(t, 1)} aria-label="Sposta giù">
              ↓
            </button>
            <button
              className="icon-btn sm danger"
              aria-label="Elimina tier"
              onClick={async () => {
                const n = decks.filter((d) => d.tier_id === t.id).length
                if (!(await ask(`Eliminare il tier ${t.name}?${n ? ` ${n} mazzi resteranno senza tier.` : ''}`))) return
                for (const d of decks.filter((d) => d.tier_id === t.id)) await update('decks', d.id, { tier_id: null })
                await remove('tiers', t.id)
              }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <input id="new-tier" placeholder="Nuovo tier (es. 3, Casual)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTier()} />
        <button className="primary" onClick={addTier} disabled={!name.trim()}>
          Aggiungi
        </button>
      </div>
    </div>
  )
}

interface AllowedEmail {
  email: string
  is_admin: boolean
}

// Visibile solo all'admin: chi è in lista può registrarsi, chi viene tolto perde l'accesso ai dati
function AccessManager() {
  const [rows, setRows] = useState<AllowedEmail[] | null>(null)
  const [myEmail, setMyEmail] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const [{ data: u }, { data, error }] = await Promise.all([
      supabase!.auth.getUser(),
      supabase!.from('allowed_emails').select('email, is_admin').order('created_at'),
    ])
    setMyEmail(u.user?.email?.toLowerCase() ?? null)
    setRows(error ? [] : (data as AllowedEmail[]))
  }
  useEffect(() => {
    load()
  }, [])

  const isAdmin = rows?.some((r) => r.email === myEmail && r.is_admin)
  if (!isAdmin) return null

  async function addEmail() {
    const e = email.trim().toLowerCase()
    if (!e) return
    setErr(null)
    const { error } = await supabase!.from('allowed_emails').insert({ email: e })
    if (error) setErr(error.code === '23505' ? 'Email già in lista.' : error.message)
    else setEmail('')
    load()
  }

  async function removeEmail(e: string) {
    if (!(await ask(`Togliere ${e}? Non potrà più registrarsi e, se ha già un account, non vedrà più i dati.`))) return
    const { error } = await supabase!.from('allowed_emails').delete().eq('email', e)
    if (error) setErr(error.message)
    load()
  }

  return (
    <div className="card stack">
      <h2 className="section">
        <Icon name="users" size={16} /> Accesso
      </h2>
      <p className="muted small">Solo queste email possono registrarsi. Aggiungi quella di un amico, poi lui si registra dall'app con la sua password.</p>
      <div className="stack-sm">
        {rows!.map((r) => (
          <div key={r.email} className="row">
            <span className="grow" style={{ overflowWrap: 'anywhere' }}>
              {r.email}
              {r.is_admin && <span className="muted small"> · admin</span>}
            </span>
            {r.email !== myEmail && (
              <button className="icon-btn sm danger" aria-label={`Togli ${r.email}`} onClick={() => removeEmail(r.email)}>
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {err && <p className="small neg no-m">{err}</p>}
      <div className="row">
        <input
          id="new-allowed-email"
          type="email"
          placeholder="email@amico.it"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEmail()}
        />
        <button className="primary" onClick={addEmail} disabled={!email.trim()}>
          Aggiungi
        </button>
      </div>
    </div>
  )
}

function VersionCard() {
  const [state, setState] = useState<{ release: Release | null; err?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function check() {
    setBusy(true)
    try {
      setState({ release: await latestRelease(true) })
    } catch {
      setState({ release: null, err: 'Non riesco a contattare GitHub: controlla la connessione.' })
    } finally {
      setBusy(false)
    }
  }
  const newer = state?.release && isNewer(state.release) ? state.release : null
  return (
    <div className="card stack">
      <h2 className="section">
        <Icon name="check" size={16} /> Versione
      </h2>
      <p className="muted small no-m">Installata: {APP_VERSION}</p>
      {state?.err && <p className="small neg no-m">{state.err}</p>}
      {state && !state.err && !newer && <p className="small no-m">È l'ultima versione.</p>}
      {newer && (
        <a className="button-like primary" href={newer.apk ?? newer.page} target="_blank" rel="noreferrer">
          Scarica {newer.tag}
        </a>
      )}
      <button onClick={check} disabled={busy}>
        {busy ? 'Controllo…' : 'Controlla aggiornamenti'}
      </button>
    </div>
  )
}

// Liste di Scryfall incluse nell'app: mostra cosa c'è e aggiorna solo con le novità
function ScryfallList({
  title,
  icon,
  load,
  update,
  describe,
  noun,
}: {
  title: string
  icon: string
  load: () => Promise<{ updated: string; count: number; italian?: number }>
  update: () => Promise<number>
  describe: (i: { updated: string; count: number; italian?: number }) => string
  noun: string
}) {
  const [info, setInfo] = useState<{ updated: string; count: number; italian?: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    load().then(setInfo, () => setErr('Lista non disponibile.'))
  }, [load])

  async function run() {
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      const n = await update()
      setInfo(await load())
      setMsg(n ? `Aggiunti ${n} nuovi.` : 'Nessuna novità: la lista è già aggiornata.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Aggiornamento non riuscito. Controlla la connessione e riprova.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card stack">
      <h2 className="section">
        <Icon name={icon} size={16} /> {title}
      </h2>
      <p className="muted small">{info ? describe(info) : 'Carico la lista…'}</p>
      <p className="muted small no-m">Dopo l'uscita di un nuovo set: chiede a Scryfall solo quelli usciti dall'ultimo aggiornamento.</p>
      {msg && <p className="small no-m">{msg}</p>}
      {err && <p className="small neg no-m">{err}</p>}
      <button onClick={run} disabled={busy || !info}>
        {busy ? `Cerco ${noun} nuovi…` : `Cerca ${noun} nuovi su Scryfall`}
      </button>
    </div>
  )
}

const it = (n: number) => n.toLocaleString('it-IT')

function CommanderList() {
  return (
    <ScryfallList
      title="Lista comandanti"
      icon="cards"
      noun="comandanti"
      load={commanderListInfo}
      update={updateCommanderList}
      describe={(i) => `${it(i.count)} comandanti e background, aggiornati al ${dateIt(i.updated)}. La ricerca funziona offline, anche per nome italiano.`}
    />
  )
}

function CardNamesList() {
  return (
    <ScryfallList
      title="Lista carte (scambi)"
      icon="swap"
      noun="carte"
      load={cardListInfo}
      update={updateCardList}
      describe={(i) => `${it(i.count)} carte, ${it(i.italian ?? 0)} con il nome italiano, aggiornate al ${dateIt(i.updated)}. La ricerca negli scambi funziona offline.`}
    />
  )
}
