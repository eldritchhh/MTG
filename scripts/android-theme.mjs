// Tema Android dell'app (la cartella android/ si rigenera a ogni build, quindi lo applica il workflow):
// - barre di stato e di navigazione dello stesso colore scuro dell'app, con icone chiare
// - su Android 15+ niente "edge-to-edge": senza, l'app finisce sotto la barra di stato (ora, batteria…)
// Uso: node scripts/android-theme.mjs   (dopo "npx cap add android")
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const BG = '#0e0c14'
const res = 'android/app/src/main/res'
const items = (extra = '') => `
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
        <item name="android:windowBackground">@color/app_background</item>
        <item name="android:statusBarColor">@color/app_background</item>
        <item name="android:navigationBarColor">@color/app_background</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar">false</item>${extra}
    `

// colore di sfondo
writeFileSync(
  `${res}/values/app_colors.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="app_background">${BG}</color>\n</resources>\n`,
)

// tema principale (sostituisce quello del modello Capacitor)
const stylesPath = `${res}/values/styles.xml`
const styles = readFileSync(stylesPath, 'utf8')
const re = /(<style name="AppTheme\.NoActionBar"[^>]*>)[\s\S]*?(<\/style>)/
if (!re.test(styles)) throw new Error('AppTheme.NoActionBar non trovato in styles.xml')
writeFileSync(stylesPath, styles.replace(re, `$1${items()}$2`))

// Android 15+: stesso tema, senza edge-to-edge
mkdirSync(`${res}/values-v35`, { recursive: true })
writeFileSync(
  `${res}/values-v35/styles.xml`,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">${items(`
        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>`)}</style>
</resources>
`,
)
console.log('tema Android applicato')
