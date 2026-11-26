// Prezzi delle carte per le schermate del conto
import { useEffect, useState } from 'react'
import { loadPrices, refreshPrices, type Price } from '../../lib/prices'

// subito quelli in cache, poi aggiornati in background (al massimo una volta al giorno per carta)
export function usePrices(names: string[]) {
  const [prices, setPrices] = useState<Map<string, Price>>(new Map())
  const key = [...new Set(names)].sort().join('|')
  useEffect(() => {
    const list = key ? key.split('|') : []
    if (!list.length) return
    let stale = false
    loadPrices(list).then((m) => !stale && setPrices(m))
    refreshPrices(list)
      .then((n) => (n ? loadPrices(list) : null))
      .then((m) => m && !stale && setPrices(m))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [key])
  return prices
}

// data dell'aggiornamento più vecchio tra i prezzi mostrati
export function pricesAge(prices: Map<string, Price>) {
  const ts = [...prices.values()].map((p) => new Date(p.at).getTime())
  return ts.length ? Math.min(...ts) : null
}
