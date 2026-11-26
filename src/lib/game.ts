// Regole della partita in corso, senza interfaccia (così si possono provare con i test)

export type Seat = {
  player_id: string
  deck_id: string | null
  life: number
  poison: number
  cmd: Record<string, number> // danni ricevuti dal comandante del posto i ("2") e dal suo partner ("2p")
  eliminated_order: number | null
  energy?: number
  exp?: number // esperienza
}
// Disposizioni del tavolo (il telefono sta in mezzo, i giocatori intorno):
// sides = rettangolo, giocatori sui due lati lunghi; square = un giocatore per lato;
// table = metà capovolta; grid = tutti dritti
export type Layout = 'sides' | 'square' | 'table' | 'grid'
// turn: di chi è il turno (posto), giro n, chi ha iniziato; monarch/initiative: posto che li ha; storm: tempesta del turno
export type Turn = { seat: number; n: number; first: number }
export type Live = {
  startedAt: string
  startingLife: number
  seats: Seat[]
  layout?: Layout
  table?: boolean
  turn?: Turn | null
  monarch?: number | null
  initiative?: number | null
  storm?: number
}

// fuori: vita a 0, 10 veleni o 21 danni da uno stesso comandante (il partner conta a parte)
export const isDead = (s: Seat) => s.life <= 0 || s.poison >= 10 || Object.values(s.cmd).some((v) => v >= 21)

// modifica un posto e aggiorna l'ordine di eliminazione (chi torna in vita perde il suo posto in classifica)
export function changeSeat(live: Live, i: number, fn: (s: Seat) => Seat): Live {
  const seats = live.seats.map((s, j) => (j === i ? fn({ ...s, cmd: { ...s.cmd } }) : { ...s }))
  let next = Math.max(0, ...seats.map((s) => s.eliminated_order ?? 0)) + 1
  for (const s of seats) {
    const dead = isDead(s)
    if (dead && s.eliminated_order == null) s.eliminated_order = next++
    if (!dead && s.eliminated_order != null) s.eliminated_order = null
  }
  return { ...live, seats }
}

// danno da comandante: conta a parte e toglie anche vita (mai sotto zero danni)
export const commanderDamage = (live: Live, receiver: number, key: string, d: number) =>
  changeSeat(live, receiver, (s) => {
    const cur = s.cmd[key] ?? 0
    const nv = Math.max(0, cur + d)
    return { ...s, cmd: { ...s.cmd, [key]: nv }, life: s.life - (nv - cur) }
  })

// scambia due posti; tutto ciò che è indicizzato per posto va rimappato (danni da comandante, turno, monarca…)
export function swapSeats(live: Live, a: number, b: number): Live {
  if (a === b) return live
  const map = (j: number) => (j === a ? b : j === b ? a : j)
  const mapN = (j: number | null | undefined) => (j == null ? j : map(j))
  const remap = (k: string) => k.replace(/^\d+/, (n) => String(map(Number(n)))) // "2p" → "0p"
  const seats = live.seats.map((s) => ({ ...s, cmd: Object.fromEntries(Object.entries(s.cmd).map(([k, v]) => [remap(k), v])) }))
  ;[seats[a], seats[b]] = [seats[b], seats[a]]
  const turn = live.turn ? { ...live.turn, seat: map(live.turn.seat), first: map(live.turn.first) } : live.turn
  return { ...live, seats, turn, monarch: mapN(live.monarch), initiative: mapN(live.initiative) }
}

// turno al prossimo giocatore ancora in gioco (senso orario); il giro aumenta quando si ripassa da chi ha iniziato.
// La tempesta si azzera a ogni turno.
export function nextTurn(live: Live): Live {
  const t = live.turn
  if (!t) return live
  const n = live.seats.length
  let next = t.seat
  let round = t.n
  for (let k = 1; k <= n; k++) {
    const c = (t.seat + k) % n
    if (c === t.first) round++
    if (!isDead(live.seats[c])) {
      next = c
      break
    }
  }
  return { ...live, turn: { ...t, seat: next, n: round }, storm: 0 }
}
