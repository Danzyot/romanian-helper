import sharp from 'sharp'
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs'

const svg = readFileSync(new URL('./icon.svg', import.meta.url))
mkdirSync('public', { recursive: true })

await sharp(svg).resize(192, 192).png().toFile('public/pwa-192.png')
await sharp(svg).resize(512, 512).png().toFile('public/pwa-512.png')

// Maskable: same art shrunk onto a full-bleed background so Android's
// circular mask doesn't clip the bubble.
const inner = await sharp(svg).resize(400, 400).png().toBuffer()
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#1d3557' },
})
  .composite([{ input: inner, top: 56, left: 56 }])
  .png()
  .toFile('public/maskable-512.png')

copyFileSync(new URL('./icon.svg', import.meta.url), 'public/favicon.svg')
console.log('icons written to public/')
