import { useState } from 'react'
import { useMe, useStore } from '../lib/store'
import { downloadCommanderList, getCommanderList } from '../lib/scryfall'
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

      <TierManager />
      <CommanderList />

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

function CommanderList() {
  const [list, setList] = useState(getCommanderList)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function download() {
    setErr(null)
    setProgress([0, 0])
    try {
      await downloadCommanderList((d, t) => setProgress([d, t]))
      setList(getCommanderList())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Download non riuscito. Controlla la connessione e riprova.')
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="card stack">
      <h2 className="section">
        <Icon name="cards" size={16} /> Lista comandanti
      </h2>
      <p className="muted small">
        {list
          ? `${list.cards.length.toLocaleString('it-IT')} comandanti salvati su questo dispositivo, aggiornati il ${dateIt(list.updated)}. La ricerca dei mazzi usa questa lista, anche offline.`
          : 'Non ancora scaricata: quando crei un mazzo la ricerca dei comandanti avviene online su Scryfall. Scaricala per averla più veloce e offline.'}
      </p>
      {progress && (
        <div className="progress">
          <i style={{ width: progress[1] ? `${(progress[0] / progress[1]) * 100}%` : '5%' }} />
          <span className="small muted">
            {progress[1] ? `${progress[0]} / ${progress[1]}` : 'Collegamento a Scryfall…'}
          </span>
        </div>
      )}
      {err && <p className="small neg no-m">{err}</p>}
      <button onClick={download} disabled={!!progress}>
        {list ? 'Aggiorna lista da Scryfall' : 'Scarica lista da Scryfall'}
      </button>
    </div>
  )
}
