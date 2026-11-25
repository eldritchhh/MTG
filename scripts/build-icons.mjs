// Icona e schermata di avvio dell'APK, a partire dal logo dell'app (public/icon.svg).
// Crea assets/logo.png (stemma su sfondo trasparente); il workflow dell'APK poi lancia
//   npx capacitor-assets generate --android ...
// che ne ricava icone adattive e splash per Android.
// Uso: node scripts/build-icons.mjs
import { mkdirSync, readFileSync } from 'node:fs'
import sharp from 'sharp'

const svg = readFileSync('public/icon.svg', 'utf8')
  .replace(/<rect[^>]*\/>/, '') // via lo sfondo: lo mette capacitor-assets con il colore dell'app
  .replace('viewBox="0 0 512 512"', 'viewBox="86 86 340 340"') // solo lo stemma, con un filo di margine

mkdirSync('assets', { recursive: true })
await sharp(Buffer.from(svg), { density: 600 }).resize(1024, 1024).png().toFile('assets/logo.png')
console.log('assets/logo.png creato')
