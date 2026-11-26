// Messaggio breve in basso, sopra la tab bar, con un'azione facoltativa ("Annulla")
import { useEffect, useState, type ReactNode } from 'react'

type Toast = { id: number; msg: ReactNode; color?: string; action?: { label: string; run: () => void }; ms: number }
let push: ((t: Toast) => void) | null = null
let seq = 0

export function toast(msg: ReactNode, opts: { color?: string; action?: { label: string; run: () => void }; ms?: number } = {}) {
  push?.({ id: ++seq, msg, color: opts.color, action: opts.action, ms: opts.ms ?? (opts.action ? 5000 : 2200) })
}

// azione reversibile: la esegue subito e propone "Annulla" per qualche secondo (al posto di una conferma).
// false se non è riuscita (es. senza rete): il messaggio lo dice, chi chiama può lasciare tutto com'era
export async function withUndo(msg: ReactNode, run: () => Promise<unknown> | unknown, undo: () => Promise<unknown> | unknown): Promise<boolean> {
  try {
    await run()
  } catch {
    toast('Non salvato: controlla la connessione e riprova', { color: 'var(--neg)' })
    return false
  }
  toast(msg, {
    action: {
      label: 'Annulla',
      run: () => void Promise.resolve(undo()).catch(() => toast('Annullamento non riuscito: controlla la connessione', { color: 'var(--neg)' })),
    },
  })
  return true
}

export function ToastHost() {
  const [t, setT] = useState<Toast | null>(null)
  useEffect(() => {
    push = setT
    return () => {
      push = null
    }
  }, [])
  useEffect(() => {
    if (!t) return
    const h = setTimeout(() => setT((cur) => (cur?.id === t.id ? null : cur)), t.ms)
    return () => clearTimeout(h)
  }, [t])
  if (!t) return null
  return (
    <div className="toast" role="status" key={t.id}>
      {t.color && <span className="toast-dot" style={{ background: t.color }} />}
      <span className="grow">{t.msg}</span>
      {t.action && (
        <button
          className="toast-action"
          onClick={() => {
            t.action!.run()
            setT(null)
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  )
}
