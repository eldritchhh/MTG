// Operazioni sui soldi usate da più schermate
import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../../lib/store'
import { openBetween } from '../../lib/trades'
import { withUndo } from '../../lib/toast'
import { buzz } from '../../lib/prefs'
import { eur } from '../../lib/util'
import { loadPrices, refreshPrices, type Price } from '../../lib/prices'

// "Pagato": `from` ha dato `amount` (euro) a `to`. Si esegue subito, con "Annulla" nel messaggio.
// Se il pagamento chiude esattamente i conti tra i due, segno come saldati debiti e righe soldi aperti;
// altrimenti (pareggio che coinvolge più persone) registro il pagamento come riga di soldi.
export function useSettle() {
  const { debts, trade_lines, players, update, add, remove } = useStore()
  return useCallback(
    async (from: string, to: string, amount: number) => {
      buzz()
      const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
      const msg = `${name(from)} ha dato ${eur(amount)} a ${name(to)}`
      const open = openBetween(from, to, debts, trade_lines)
      const net =
        open.debts.reduce((s, d) => s + (d.debtor_id === from ? d.amount : -d.amount), 0) +
        open.lines.reduce((s, l) => s + (l.from_player === from ? l.amount_cents! : -l.amount_cents!) / 100, 0)
      if (Math.abs(net - amount) < 0.005) {
        await withUndo(
          msg,
          () => Promise.all([...open.debts.map((d) => update('debts', d.id, { settled: true })), ...open.lines.map((l) => update('trade_lines', l.id, { settled: true }))]),
          () => Promise.all([...open.debts.map((d) => update('debts', d.id, { settled: false })), ...open.lines.map((l) => update('trade_lines', l.id, { settled: false }))]),
        )
      } else {
        const tradeId = crypto.randomUUID()
        const lineId = crypto.randomUUID()
        await withUndo(
          msg,
          async () => {
            // riga "to deve a from": nei saldi equivale al pagamento ricevuto da to
            await add('trades', { id: tradeId, player_a: from, player_b: to, note: 'Pagamento' })
            await add('trade_lines', {
              id: lineId, trade_id: tradeId, from_player: to, to_player: from, kind: 'money', status: null, name: null, quantity: 1,
              value_cents: null, value_source: null, valued_at: null, returned_at: null, amount_cents: Math.round(amount * 100),
              counts_in_balance: true, settled: false, linked_line_id: null,
            })
          },
          async () => {
            await remove('trade_lines', lineId)
            await remove('trades', tradeId)
          },
        )
      }
    },
    [debts, trade_lines, players, update, add, remove],
  )
}

// prezzi delle carte: subito quelli in cache, poi aggiornati in background (al massimo una volta al giorno)
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
