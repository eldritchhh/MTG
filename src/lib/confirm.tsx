import { useEffect, useState } from 'react'

// Conferma dentro la pagina (window.confirm non funziona ovunque, es. negli artifact)
type Req = { msg: string; resolve: (ok: boolean) => void }
let push: ((r: Req) => void) | null = null

export function ask(msg: string): Promise<boolean> {
  return new Promise((resolve) => (push ? push({ msg, resolve }) : resolve(window.confirm(msg))))
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null)
  useEffect(() => {
    push = setReq
    return () => {
      push = null
    }
  }, [])
  if (!req) return null
  const done = (ok: boolean) => {
    req.resolve(ok)
    setReq(null)
  }
  return (
    <div className="modal-bg confirm-bg" onClick={() => done(false)}>
      <div className="modal confirm" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <p className="confirm-msg">{req.msg}</p>
        <div className="row confirm-actions">
          <button className="grow" onClick={() => done(false)}>
            Annulla
          </button>
          <button className="primary grow" autoFocus onClick={() => done(true)}>
            Conferma
          </button>
        </div>
      </div>
    </div>
  )
}
