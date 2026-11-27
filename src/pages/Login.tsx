import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Registrazione solo con codice invito (supabase/signup.sql): il codice si controlla prima,
// poi va con la registrazione e porta subito nel gruppo dell'invito
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [podName, setPodName] = useState<string | null>(null)
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const invite = code.trim().toUpperCase()

  // nome del gruppo appena il codice è completo
  useEffect(() => {
    setPodName(null)
    if (mode !== 'up' || invite.length < 6) return
    let stale = false
    supabase!.rpc('invite_pod_name', { p_code: invite }).then(({ data }) => !stale && setPodName((data as string | null) ?? null))
    return () => {
      stale = true
    }
  }, [invite, mode])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'in') {
        const { error } = await supabase!.auth.signInWithPassword({ email, password })
        if (error) setMsg(error.message)
        return
      }
      const { data: name, error: checkError } = await supabase!.rpc('invite_pod_name', { p_code: invite })
      // PGRST202: database senza signup.sql (registrazione libera), il controllo si salta
      if (checkError && checkError.code !== 'PGRST202') return setMsg(checkError.message)
      if (!checkError && !name) return setMsg('Codice invito non valido o scaduto: chiedine uno nuovo a chi gestisce il gruppo.')
      const { data, error } = await supabase!.auth.signUp({ email, password, options: { data: { invite } } })
      // il database rifiuta la registrazione se nel frattempo il codice è finito
      if (error) setMsg(/database error/i.test(error.message) ? 'Codice invito non più valido: chiedine uno nuovo.' : error.message)
      else if (!data.session) setMsg('Controlla la mail per confermare la registrazione.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <img src="./emblem.png" width={56} height={72} alt="" />
      <h1>MTGUtils</h1>
      <form onSubmit={submit} className="card stack">
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
        />
        {mode === 'up' && (
          <label className="field">
            <span>Codice invito</span>
            <input
              placeholder="Es. K7PQ2M"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              maxLength={12}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            <em className="muted small">
              {podName ? `Entrerai nel gruppo "${podName}"` : 'Te lo dà chi gestisce il gruppo (dal gruppo → Nuovo codice invito).'}
            </em>
          </label>
        )}
        <button className="primary" disabled={busy}>
          {mode === 'in' ? 'Entra' : 'Registrati'}
        </button>
        {msg && <p className="muted small">{msg}</p>}
      </form>
      <button
        className="link"
        onClick={() => {
          setMode(mode === 'in' ? 'up' : 'in')
          setMsg(null)
        }}
      >
        {mode === 'in' ? 'Prima volta? Registrati con un codice invito' : 'Hai già un account? Entra'}
      </button>
    </div>
  )
}
