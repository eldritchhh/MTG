// Navigazione dell'app: 4 schede + schermate sovrapposte (Account, Pod) + selettore dei pod
import { createContext, useContext } from 'react'

export type Tab = 'game' | 'trades' | 'players' | 'stats'
export type Overlay = 'account' | 'pod' | null

export type Nav = {
  tab: Tab
  setTab(t: Tab): void
  openAccount(): void
  openPod(): void // schermata del pod attivo (Gestisci / Dettagli)
  openPods(): void // selettore "I tuoi pod"
  focusPlayer: string | null // giocatore da aprire nella scheda Giocatori ("I tuoi mazzi")
  showPlayer(id: string): void
  clearFocus(): void
}

export const NavCtx = createContext<Nav | null>(null)

export function useNav() {
  const n = useContext(NavCtx)
  if (!n) throw new Error('NavCtx mancante')
  return n
}
