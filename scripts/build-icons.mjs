// Icone dell'app a partire dallo stemma (assets/icon-source.png, sfondo trasparente). Crea:
//   assets/logo.png    stemma su quadrato trasparente: il workflow dell'APK lancia poi
//                      npx capacitor-assets generate --android ... (icone adattive e splash)
//   public/icon.png    icona per browser e "aggiungi a schermata Home" (stemma su sfondo scuro)
//   public/emblem.png  stemma da solo, per login e primo accesso
// Uso: node scripts/build-icons.mjs
import sharp from 'sharp'

const SRC = 'assets/icon-source.png'
const BG = '#0e0c14'
const clear = { r: 0, g: 0, b: 0, alpha: 0 }

// stemma dentro un quadrato di lato `size`, alto al massimo `fill` del lato
async function square(size, fill, background) {
  const h = Math.round(size * fill)
  const emblem = await sharp(SRC).resize({ height: h, width: h, fit: 'inside' }).toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background } }).composite([{ input: emblem, gravity: 'centre' }])
}

await (await square(1024, 0.94, clear)).png().toFile('assets/logo.png')
const rounded = Buffer.from(`<svg width="512" height="512"><rect width="512" height="512" rx="112" fill="${BG}"/></svg>`)
const bg = await sharp(rounded).png().toBuffer()
const emblem = await sharp(SRC).resize({ height: 420, width: 420, fit: 'inside' }).toBuffer()
await sharp(bg).composite([{ input: emblem, gravity: 'centre' }]).png().toFile('public/icon.png')
await sharp(SRC).resize({ height: 256 }).png().toFile('public/emblem.png')
console.log('creati assets/logo.png, public/icon.png, public/emblem.png')
