import { useEffect, useState } from 'react'
import { useMe, useStore } from '../lib/store'
import { cardListInfo, commanderListInfo, updateCardList, updateCommanderList } from '../lib/scryfall'
import { APP_VERSION, isNewer, latestRelease, type Release } from '../lib/version'
import { canSelfUpdate, useSelfUpdate } from '../lib/updater'
import { PLAYER_COLORS, onDate } from '../lib/util'
import type { Tier } from '../lib/types'
import { isCloud } from '../lib/supabase'
import { TABLES } from '../lib/types'
import { ask } from '../lib/confirm'
import { Icon } from '../icons'
import { usePerms } from '../lib/pod'

// Sezioni usate dalle schermate Account e Pod (la vecchia scheda "Altro" non esiste più)

export function DataCard() {
  const store = useStore()
  const perms = usePerms()

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
    <div className="card stack">
      <h2 className="section">
        <Icon name="cards" size={16} /> Dati
      </h2>
      <p className="muted small">
        {isCloud ? 'Sincronizzato con Supabase: tutti nel pod vedono gli stessi dati in tempo reale. Il backup riguarda il pod attivo.' : 'Modalità locale: i dati sono solo su questo dispositivo.'}
      </p>
      {import.meta.env.VITE_DEMO !== '1' && <button onClick={exportJson}>Esporta backup (JSON)</button>}
      {perms.admin && (
        <label className="button-like">
          Importa backup
          <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </label>
      )}
      <button onClick={() => store.reload()}>Ricarica dati</button>
    </div>
  )
}

// modalità locale: "chi sei" sul dispositivo e dati di esempio
export function LocalCards() {
  const store = useStore()
  const [me, setMe] = useMe()
  return (
    <>
      <div className="card stack">
        <h2 className="section">
          <Icon name="user" size={16} /> Chi sei?
        </h2>
        <p className="muted small">Serve per mostrarti il tuo saldo e preimpostare i moduli. Viene salvato solo su questo dispositivo.</p>
        <select value={me ?? ''} onChange={(e) => setMe(e.target.value || null)}>
          <option value="">Nessuno</option>
          {store.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
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
    </>
  )
}

export function TierManager() {
  const { tiers, decks, add, update, remove, batch } = useStore()
  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order)
  const [name, setName] = useState('')

  async function move(t: Tier, dir: -1 | 1) {
    const i = sorted.findIndex((x) => x.id === t.id)
    const other = sorted[i + dir]
    if (!other) return
    await batch((tx) => {
      tx.update('tiers', t.id, { sort_order: other.sort_order })
      tx.update('tiers', other.id, { sort_order: t.sort_order })
    })
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

export function VersionCard() {
  const [state, setState] = useState<{ release: Release | null; err?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const up = useSelfUpdate()
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
    <div className="card stack version-card">
      <h2 className="section">
        <Icon name="check" size={16} /> Versione
      </h2>
      <p className="muted small no-m">Installata: {APP_VERSION}</p>
      {state?.err && <p className="small neg no-m">{state.err}</p>}
      {state && !state.err && !newer && <p className="small no-m">È l'ultima versione.</p>}
      {newer &&
        (newer.apk && canSelfUpdate() ? (
          <button className="primary" disabled={up.busy} onClick={() => up.run(newer.apk!)}>
            {up.busy ? `Scarico… ${up.percent}%` : `Aggiorna a ${newer.tag}`}
          </button>
        ) : (
          <a className="button-like primary" href={newer.apk ?? newer.page} target="_blank" rel="noreferrer">
            Scarica {newer.tag}
          </a>
        ))}
      {up.error && <p className="small neg no-m">{up.error}</p>}
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
      setMsg(n ? `Aggiunte ${n} novità.` : 'Nessuna novità: la lista è già aggiornata.')
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
        {busy ? `Cerco ${noun} ${noun === 'carte' ? 'nuove' : 'nuovi'}…` : `Cerca ${noun} ${noun === 'carte' ? 'nuove' : 'nuovi'} su Scryfall`}
      </button>
    </div>
  )
}

const it = (n: number) => n.toLocaleString('it-IT')

export function CommanderList() {
  return (
    <ScryfallList
      title="Lista comandanti"
      icon="cards"
      noun="comandanti"
      load={commanderListInfo}
      update={updateCommanderList}
      describe={(i) => `${it(i.count)} comandanti e background, aggiornati ${onDate('al', i.updated)}. La ricerca funziona offline, anche per nome italiano.`}
    />
  )
}

export function CardNamesList() {
  return (
    <ScryfallList
      title="Lista carte (scambi)"
      icon="swap"
      noun="carte"
      load={cardListInfo}
      update={updateCardList}
      describe={(i) => `${it(i.count)} carte, ${it(i.italian ?? 0)} con il nome italiano, aggiornate ${onDate('al', i.updated)}. La ricerca negli scambi funziona offline.`}
    />
  )
}
