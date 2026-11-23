import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

// Tasto indietro di Android: chiama l'ultimo "indietro" registrato (finestra aperta, dettaglio, scheda).
// Se non c'è niente da chiudere l'app va in background invece di chiudersi.
const stack: (() => void)[] = []

export function useBack(handler: (() => void) | null | false) {
  const ref = useRef(handler)
  ref.current = handler
  const active = !!handler
  useEffect(() => {
    if (!active) return
    const fn = () => {
      if (ref.current) ref.current()
    }
    stack.push(fn)
    return () => {
      const i = stack.lastIndexOf(fn)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active])
}

// true se qualcuno ha gestito l'indietro (separata dal listener per poterla provare anche nel browser)
export function handleBack(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}

export function initBackButton() {
  if (!Capacitor.isNativePlatform()) return
  App.addListener('backButton', () => {
    if (!handleBack()) App.minimizeApp()
  })
}
