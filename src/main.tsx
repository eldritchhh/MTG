import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { initBackButton } from './lib/back'
import { Capacitor } from '@capacitor/core'

initBackButton()

// versione web (GitHub Pages, "Aggiungi a Home" su iPhone): si apre anche offline. Non nell'app Android.
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  const v = (import.meta.env.VITE_WEB_BUILD as string | undefined) ?? 'local'
  window.addEventListener('load', () => navigator.serviceWorker.register(`./sw.js?v=${v}`).catch(() => {}))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
