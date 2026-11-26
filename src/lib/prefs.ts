// Preferenze del dispositivo (Account → Preferenze)
const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* storage non disponibile */
  }
}

export const prefs = {
  get vibration() {
    return read('mtg:pref-vibration') !== '0'
  },
  set vibration(on: boolean) {
    write('mtg:pref-vibration', on ? '1' : '0')
  },
  get keepAwake() {
    return read('mtg:pref-awake') !== '0'
  },
  set keepAwake(on: boolean) {
    write('mtg:pref-awake', on ? '1' : '0')
  },
  get startingLife() {
    return Number(read('mtg:pref-life')) || 40
  },
  set startingLife(v: number) {
    write('mtg:pref-life', String(v))
  },
}

// vibrazione leggera (inizio partita, Pagato, cambio pod…), se attiva nelle preferenze
export function buzz(ms = 20) {
  if (!prefs.vibration) return
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* non supportata */
  }
}
