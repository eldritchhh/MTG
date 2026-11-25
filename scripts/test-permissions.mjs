// Test dei permessi (gruppi e ruoli) sul database di PROVA, con utenti veri e le stesse API dell'app.
// Prerequisiti: database di prova con schema.sql + pods.sql e i dati di "Il nostro gruppo";
// utenti mtg.admin@example.com (admin) e mtg.user@example.com (user) registrati prima della migrazione.
// Uso: MTG_TEST_PASSWORD=... node scripts/test-permissions.mjs   (URL e chiave da .env.test.local)
import { readFileSync } from 'node:fs'
const env = readFileSync('.env.test.local', 'utf8')
const URL = env.match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim()
const KEY = env.match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)[1].trim()
const PW = process.env.MTG_TEST_PASSWORD
if (!PW) throw new Error('imposta MTG_TEST_PASSWORD (password degli utenti di test)')
let fails = 0
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) fails++
}

async function signup(email) {
  await fetch(`${URL}/auth/v1/signup`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) })
}
async function login(email) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) })
  const j = await r.json()
  if (!j.access_token) throw new Error(`login ${email}: ${JSON.stringify(j)}`)
  return as(j.access_token)
}
function as(token) {
  const h = { apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
  const call = async (method, path, body) => {
    const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return { status: r.status, ok: r.ok, data, rows: Array.isArray(data) ? data.length : 0 }
  }
  return {
    get: (path) => call('GET', path),
    insert: (t, row) => call('POST', t, row),
    update: (t, filter, patch) => call('PATCH', `${t}?${filter}`, patch),
    del: (t, filter) => call('DELETE', `${t}?${filter}`),
    rpc: (fn, args) => call('POST', `rpc/${fn}`, args),
  }
}

const FRANCESCO = 'fac72672-16c0-4cf9-8628-d284eb0ef8a3'
const ENRICO = '13806163-2232-4ef9-8aae-24d3ffef8096'
const JIMBO = '8ec4d36f-4f09-40d1-a2ee-40cc5f62241a'
const DECK_FRANCESCO = '16232a34-2442-42f3-bc98-5e44f5017e49'

await signup('mtg.estraneo@example.com')
const admin = await login('mtg.admin@example.com')
const user = await login('mtg.user@example.com')
const out = await login('mtg.estraneo@example.com')

const pod = (await admin.get('pods?select=id,name')).data[0]
ok(pod?.name === 'Il nostro gruppo', `admin vede il suo gruppo (${pod?.name})`)
const P = pod.id

console.log('\n--- estraneo (registrato ma in nessun gruppo)')
ok((await out.get('players?select=id')).rows === 0, 'non vede i giocatori')
ok((await out.get('decks?select=id')).rows === 0, 'non vede i mazzi')
ok((await out.get('pods?select=id')).rows === 0, 'non vede i gruppi')
ok(!(await out.insert('decks', { pod_id: P, player_id: FRANCESCO, commander: 'Hack' })).ok, 'non può inserire mazzi nel gruppo')
ok(!(await out.rpc('claim_player', { p_pod: P, p_player: JIMBO })).ok, 'non può prendersi un giocatore del gruppo')
const own = await out.rpc('create_pod', { p_name: 'Gruppo estraneo' })
ok(own.ok, 'può creare il suo gruppo')
const OWN = own.data
ok((await out.get(`tiers?pod_id=eq.${OWN}&select=id`)).rows === 3, 'il nuovo gruppo ha i tier S/1/2')
ok((await out.get('tiers?select=id')).rows === 3, 'vede solo i tier del suo gruppo')
ok((await admin.get(`tiers?pod_id=eq.${OWN}&select=id`)).rows === 0, "l'admin dell'altro gruppo non vede quei tier")

console.log('\n--- scelta del giocatore ("chi sono")')
ok((await admin.rpc('claim_player', { p_pod: P, p_player: FRANCESCO })).ok, 'admin sceglie Francesco')
ok(!(await user.rpc('claim_player', { p_pod: P, p_player: FRANCESCO })).ok, 'user non può prendersi Francesco (già preso)')
ok((await user.rpc('claim_player', { p_pod: P, p_player: ENRICO })).ok, 'user sceglie Enrico')

console.log('\n--- user: vede tutto, modifica solo sé stesso')
ok((await user.get('players?select=id')).rows === 6, 'vede i 6 giocatori')
ok((await user.get('decks?select=id')).rows === 18, 'vede tutti i 18 mazzi')
ok((await user.update('players', `id=eq.${ENRICO}`, { color: '#123456' })).rows === 1, 'cambia il proprio colore')
ok((await user.update('players', `id=eq.${FRANCESCO}`, { name: 'Hack' })).rows === 0, 'non cambia il nome di Francesco')
ok(!(await user.insert('players', { pod_id: P, name: 'Nuovo' })).ok, 'non aggiunge giocatori')
ok((await user.del('players', `id=eq.${JIMBO}`)).rows === 0, 'non elimina giocatori')
const myDeck = await user.insert('decks', { pod_id: P, player_id: ENRICO, commander: 'Test User Deck' })
ok(myDeck.ok, 'aggiunge un mazzo suo')
ok(!(await user.insert('decks', { pod_id: P, player_id: FRANCESCO, commander: 'Hack' })).ok, 'non aggiunge mazzi a Francesco')
ok((await user.update('decks', `id=eq.${DECK_FRANCESCO}`, { commander: 'Hack' })).rows === 0, 'non modifica il mazzo di Francesco')
ok((await user.del('decks', `id=eq.${DECK_FRANCESCO}`)).rows === 0, 'non elimina il mazzo di Francesco')
ok(!(await user.insert('decks', { pod_id: P, player_id: ENRICO, commander: 'X', tier_id: (await out.get(`tiers?pod_id=eq.${OWN}&select=id`)).data[0].id })).ok, 'non usa un tier di un altro gruppo')
ok((await user.update('tiers', `pod_id=eq.${P}`, { name: 'Hack' })).rows === 0, 'non modifica i tier')
ok(!(await user.rpc('create_invite', { p_pod: P })).ok, 'non crea inviti')
ok((await user.update('pod_members', `pod_id=eq.${P}`, { role: 'admin' })).rows === 0, 'non si promuove admin')

console.log('\n--- partite')
const g = await user.insert('games', { pod_id: P, participants: [{ player_id: ENRICO, deck_id: null, final_life: 0, eliminated_order: 1 }, { player_id: FRANCESCO, deck_id: null, final_life: 10, eliminated_order: null }], winner_player_id: FRANCESCO })
ok(g.ok, 'user registra una partita')
const gOther = await admin.insert('games', { pod_id: P, participants: [{ player_id: FRANCESCO, deck_id: null, final_life: 5, eliminated_order: null }, { player_id: JIMBO, deck_id: null, final_life: 0, eliminated_order: 1 }], winner_player_id: FRANCESCO })
ok(gOther.ok, 'admin registra una partita senza Enrico')
ok((await user.update('games', `id=eq.${g.data[0].id}`, { notes: 'ok' })).rows === 1, 'user modifica una partita dove ha giocato')
ok((await user.update('games', `id=eq.${gOther.data[0].id}`, { notes: 'hack' })).rows === 0, 'user non modifica una partita dove non ha giocato')
ok((await user.del('games', `id=eq.${gOther.data[0].id}`)).rows === 0, 'user non elimina una partita dove non ha giocato')

console.log('\n--- soldi e carte')
ok((await user.insert('debts', { pod_id: P, debtor_id: ENRICO, creditor_id: FRANCESCO, amount: 4, description: 'test' })).ok, 'user segna un debito suo')
ok(!(await user.insert('debts', { pod_id: P, debtor_id: JIMBO, creditor_id: FRANCESCO, amount: 4, description: 'hack' })).ok, 'user non segna debiti tra altri')
ok((await admin.insert('debts', { pod_id: P, debtor_id: JIMBO, creditor_id: FRANCESCO, amount: 2, description: 'admin' })).ok, 'admin segna debiti tra altri')
ok((await user.get('debts?select=id')).rows === 2, 'user vede tutti i debiti del gruppo')
ok((await user.update('debts', `debtor_id=eq.${JIMBO}`, { amount: 0.01 })).rows === 0, 'user non modifica debiti tra altri')
ok(!(await user.insert('loans', { pod_id: P, lender_id: FRANCESCO, borrower_id: JIMBO, cards: 'Hack' })).ok, 'user non segna prestiti tra altri')
ok((await user.insert('loans', { pod_id: P, lender_id: ENRICO, borrower_id: JIMBO, cards: 'Sol Ring' })).ok, 'user segna un prestito suo')

console.log('\n--- admin')
ok((await admin.update('players', `id=eq.${JIMBO}`, { color: '#654321' })).rows === 1, 'modifica qualsiasi giocatore')
ok((await admin.update('decks', `id=eq.${myDeck.data[0].id}`, { notes: 'admin' })).rows === 1, 'modifica il mazzo di un altro')
ok((await admin.update('tiers', `pod_id=eq.${P}&name=eq.2`, { color: '#4f8cf0' })).rows === 1, 'modifica i tier')
ok(!(await admin.insert('decks', { pod_id: P, player_id: (await out.get(`players?pod_id=eq.${OWN}&select=id`)).data[0]?.id ?? '00000000-0000-0000-0000-000000000000', commander: 'X' })).ok, 'non usa giocatori di un altro gruppo')
ok(!(await admin.update('pod_members', `pod_id=eq.${P}&role=eq.admin`, { role: 'user' })).ok, "non può togliere l'ultimo admin")

console.log('\n--- inviti')
const inv = await admin.rpc('create_invite', { p_pod: P })
ok(inv.ok && /^[A-Z0-9]{6}$/.test(inv.data), `admin crea un codice (${inv.data})`)
ok(!(await out.rpc('join_pod', { p_code: 'NOPE00' })).ok, 'codice sbagliato rifiutato')
ok((await out.rpc('join_pod', { p_code: inv.data.toLowerCase() })).ok, 'estraneo entra con il codice (anche minuscolo)')
ok((await out.get(`players?pod_id=eq.${P}&select=id`)).rows === 6, 'ora vede i giocatori del gruppo')
const nuovo = await out.rpc('claim_player', { p_pod: P, p_name: 'Nuovo Amico', p_color: '#45b26b' })
ok(nuovo.ok, 'si crea il proprio giocatore')
ok((await out.get(`pod_members?pod_id=eq.${P}&select=role&user_id=eq.${(await out.get('pod_members?select=user_id&role=eq.user')).data?.[0]?.user_id}`)).ok, 'è membro con ruolo user')
ok((await out.update('players', `id=eq.${JIMBO}`, { name: 'Hack' })).rows === 0, 'non modifica gli altri giocatori')
ok((await admin.update('pod_members', `pod_id=eq.${P}&player_id=eq.${nuovo.data}`, { role: 'admin' })).rows === 1, "l'admin lo promuove admin")
ok((await out.update('players', `id=eq.${JIMBO}`, { color: '#c9a227' })).rows === 1, 'da admin ora modifica gli altri')

console.log(`\n${fails ? `${fails} TEST FALLITI` : 'TUTTI I TEST PASSATI'}`)
process.exitCode = fails ? 1 : 0
