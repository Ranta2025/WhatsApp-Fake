// Generates the built-in "basic" sticker pack.
//
// Sources are 16 original hand-written SVG designs (faces, gestures and words).
// They are rasterized at 320x320 with @resvg/resvg-js (already used by
// generate-icons.mjs) and encoded to WebP with sharp (dev-only). The resulting
// .webp files are committed, so CI never installs sharp nor runs this script.
//
// Run with: npm run stickers  (from frontend/)
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'stickers', 'basic')

const SIZE = 320
const FONT = "DejaVu Sans, Verdana, Helvetica, sans-serif"

/** Wraps an SVG body in the shared 320x320 canvas. */
const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${body}</svg>`

/** Flat face base: bright disc with a soft bottom shade. */
const face = (fill, shade) => `
  <circle cx="160" cy="160" r="150" fill="${shade}"/>
  <circle cx="160" cy="150" r="150" fill="${fill}"/>`

/** Centered bold label (used by the word stickers). */
const label = (text, y, size, fill = '#ffffff') =>
  `<text x="160" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${size}" fill="${fill}">${text}</text>`

/** A rounded square badge behind a word sticker. */
const badge = (from, to) => `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect x="20" y="20" width="280" height="280" rx="70" fill="url(#g)"/>`

// Simple reusable eye / mouth shapes for the face stickers.
const eye = (x, y, r = 15) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#2b2b2b"/>`
const eyeLine = (x, y) => `<path d="M${x - 20} ${y} q20 -22 40 0" stroke="#2b2b2b" stroke-width="11" fill="none" stroke-linecap="round"/>`
const smile = (y, w = 60, lift = 34) => `<path d="M${160 - w} ${y} q${w} ${lift} ${w * 2} 0" stroke="#2b2b2b" stroke-width="13" fill="none" stroke-linecap="round"/>`
const sad = (y, w = 60, drop = 34) => `<path d="M${160 - w} ${y + drop} q${w} -${drop} ${w * 2} 0" stroke="#2b2b2b" stroke-width="13" fill="none" stroke-linecap="round"/>`

const STICKERS = [
  {
    id: 'hola',
    alt: 'Sticker con la palabra Hola',
    tags: ['hola', 'saludo', 'greeting'],
    body: `${badge('#25C685', '#0EAE8E')}
      <g fill="#ffffff" transform="translate(160 104)">
        <rect x="-40" y="-12" width="80" height="70" rx="28"/>
        <rect x="-42" y="-50" width="19" height="56" rx="9"/>
        <rect x="-17" y="-62" width="19" height="68" rx="9"/>
        <rect x="8" y="-60" width="19" height="66" rx="9"/>
        <rect x="33" y="-46" width="19" height="52" rx="9"/>
      </g>
      ${label('Hola', 262, 56)}`,
  },
  {
    id: 'gracias',
    alt: 'Sticker con la palabra Gracias',
    tags: ['gracias', 'thanks'],
    body: `${badge('#FF9F43', '#F97A1F')}
      <path d="M160 138 C120 108 96 78 118 54 C136 34 158 46 160 64 C162 46 184 34 202 54 C224 78 200 108 160 138 Z" fill="#ffffff"/>
      ${label('Gracias', 268, 46)}`,
  },
  {
    id: 'ok',
    alt: 'Sticker con la señal OK',
    tags: ['ok', 'vale', 'bien'],
    body: `${badge('#4D9DE0', '#2F7DC4')}
      <circle cx="160" cy="150" r="80" fill="none" stroke="#ffffff" stroke-width="20"/>
      <path d="M118 152 l28 30 l54 -64" fill="none" stroke="#ffffff" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
      ${label('OK', 274, 44)}`,
  },
  {
    id: 'jaja',
    alt: 'Sticker de risa con la palabra Jaja',
    tags: ['jaja', 'risa', 'laugh'],
    body: `${face('#FFCF33', '#F2B705')}
      ${eyeLine(110, 128)}${eyeLine(210, 128)}
      <path d="M92 190 q68 84 136 0 q-68 26 -136 0" fill="#7a2f1d"/>
      <path d="M92 190 q68 84 136 0" fill="#ffffff"/>
      ${label('Jaja', 292, 40, '#7a2f1d')}`,
  },
  {
    id: 'corazon',
    alt: 'Sticker de corazón rojo',
    tags: ['corazon', 'amor', 'love'],
    body: `
      <path d="M160 268 C60 200 30 150 30 112 C30 70 62 46 98 46 C128 46 150 64 160 84 C170 64 192 46 222 46 C258 46 290 70 290 112 C290 150 260 200 160 268 Z"
        fill="#FF4D5E" stroke="#E0323F" stroke-width="6"/>`,
  },
  {
    id: 'pulgar-arriba',
    alt: 'Sticker de pulgar arriba',
    tags: ['pulgar', 'like', 'bien'],
    body: `${badge('#25C685', '#0EAE8E')}
      <g fill="#ffffff">
        <path d="M150 158 v-66 a26 26 0 0 1 52 0 v66 Z"/>
        <rect x="118" y="150" width="112" height="98" rx="28"/>
      </g>
      <g fill="#25C685">
        <rect x="150" y="170" width="80" height="10" rx="5"/>
        <rect x="150" y="198" width="80" height="10" rx="5"/>
        <rect x="150" y="226" width="80" height="10" rx="5"/>
      </g>`,
  },
  {
    id: 'fiesta',
    alt: 'Sticker de fiesta con confeti',
    tags: ['fiesta', 'party', 'celebrar'],
    body: `${badge('#9B6BFF', '#6E43E0')}
      <path d="M84 250 L122 138 L186 202 Z" fill="#FFCF33"/>
      <path d="M122 138 L186 202 L84 250" fill="none"/>
      <circle cx="196" cy="96" r="12" fill="#FF4D5E"/>
      <circle cx="238" cy="142" r="10" fill="#25C685"/>
      <circle cx="160" cy="72" r="9" fill="#4D9DE0"/>
      <rect x="206" y="70" width="14" height="14" rx="4" fill="#FF9F43" transform="rotate(28 213 77)"/>
      <rect x="130" y="60" width="14" height="14" rx="4" fill="#FF7EB6" transform="rotate(-20 137 67)"/>
      ${label('Fiesta', 300, 38)}`,
  },
  {
    id: 'dormido',
    alt: 'Sticker de cara dormida',
    tags: ['dormido', 'sueno', 'sleep'],
    body: `${face('#7FB3FF', '#5A93E6')}
      ${eyeLine(112, 138)}${eyeLine(208, 138)}
      <path d="M132 196 q28 24 56 0" stroke="#2b2b2b" stroke-width="11" fill="none" stroke-linecap="round"/>
      ${label('Z', 84, 40, '#ffffff')}${label('Z', 108, 30, '#ffffff')}${label('Z', 126, 22, '#ffffff')}`,
  },
  {
    id: 'triste',
    alt: 'Sticker de cara triste',
    tags: ['triste', 'sad'],
    body: `${face('#9FB6CC', '#7E97B0')}
      ${eye(112, 138)}${eye(208, 138)}
      ${sad(178)}
      <path d="M228 176 q18 26 0 44 q-18 -18 0 -44 Z" fill="#4D9DE0"/>`,
  },
  {
    id: 'amor',
    alt: 'Sticker de cara con ojos de corazón',
    tags: ['amor', 'love', 'enamorado'],
    body: `${face('#FFCF33', '#F2B705')}
      <path d="M112 122 c-18 -16 -44 4 -22 26 l22 22 22 -22 c22 -22 -4 -42 -22 -26 Z" fill="#FF4D5E"/>
      <path d="M208 122 c-18 -16 -44 4 -22 26 l22 22 22 -22 c22 -22 -4 -42 -22 -26 Z" fill="#FF4D5E"/>
      ${smile(196)}`,
  },
  {
    id: 'sorpresa',
    alt: 'Sticker de cara sorprendida',
    tags: ['sorpresa', 'wow'],
    body: `${face('#FFCF33', '#F2B705')}
      ${eye(112, 130)}${eye(208, 130)}
      <ellipse cx="160" cy="216" rx="30" ry="38" fill="#7a2f1d"/>
      <path d="M70 92 q26 -30 54 -6" stroke="#2b2b2b" stroke-width="11" fill="none" stroke-linecap="round"/>
      <path d="M250 92 q-26 -30 -54 -6" stroke="#2b2b2b" stroke-width="11" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: 'pensando',
    alt: 'Sticker de cara pensativa',
    tags: ['pensando', 'thinking'],
    body: `${face('#FFCF33', '#F2B705')}
      ${eye(112, 132)}${eye(208, 132)}
      <path d="M120 196 q40 18 84 -4" stroke="#2b2b2b" stroke-width="11" fill="none" stroke-linecap="round"/>
      <g fill="#FFCF33" stroke="#2b2b2b" stroke-width="8">
        <circle cx="244" cy="176" r="18"/>
        <circle cx="276" cy="206" r="24"/>
      </g>
      <path d="M78 88 q26 -26 54 -4" stroke="#2b2b2b" stroke-width="11" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: 'adios',
    alt: 'Sticker con la palabra Adios',
    tags: ['adios', 'bye'],
    body: `${badge('#4D9DE0', '#2F7DC4')}
      <g fill="#ffffff" transform="translate(150 108)">
        <rect x="-40" y="-12" width="80" height="70" rx="28"/>
        <rect x="-42" y="-50" width="19" height="56" rx="9"/>
        <rect x="-17" y="-62" width="19" height="68" rx="9"/>
        <rect x="8" y="-60" width="19" height="66" rx="9"/>
        <rect x="33" y="-46" width="19" height="52" rx="9"/>
      </g>
      ${label('Adios', 264, 50)}`,
  },
  {
    id: 'genial',
    alt: 'Sticker de cara con lentes de sol',
    tags: ['genial', 'cool'],
    body: `${face('#FFCF33', '#F2B705')}
      <path d="M70 120 h180 v14 a18 18 0 0 1 -18 18 h-52 a14 14 0 0 1 -14 -14 v-4 h-4 v4 a14 14 0 0 1 -14 14 h-52 a18 18 0 0 1 -18 -18 Z" fill="#2b2b2b"/>
      <g fill="#4D9DE0" opacity="0.9">
        <rect x="78" y="122" width="62" height="26" rx="10"/>
        <rect x="180" y="122" width="62" height="26" rx="10"/>
      </g>
      ${smile(198)}`,
  },
  {
    id: 'enojado',
    alt: 'Sticker de cara enojada',
    tags: ['enojado', 'angry', 'molesto'],
    body: `${face('#FF6B6B', '#E04A4A')}
      ${eye(112, 146)}${eye(208, 146)}
      <path d="M78 108 q30 -18 56 6" stroke="#2b2b2b" stroke-width="13" fill="none" stroke-linecap="round"/>
      <path d="M242 108 q-30 -18 -56 6" stroke="#2b2b2b" stroke-width="13" fill="none" stroke-linecap="round"/>
      ${sad(186, 56, 30)}`,
  },
  {
    id: 'beso',
    alt: 'Sticker de cara enviando un beso',
    tags: ['beso', 'kiss', 'amor'],
    body: `${face('#FFCF33', '#F2B705')}
      <path d="M96 130 q16 -24 44 -8" stroke="#2b2b2b" stroke-width="11" fill="none" stroke-linecap="round"/>
      ${eye(196, 128)}
      <path d="M118 186 q34 34 68 -6" fill="#7a2f1d"/>
      <path d="M222 118 c-20 -18 -48 4 -24 28 l24 24 24 -24 c24 -24 -4 -46 -24 -28 Z" fill="#FF4D5E"/>`,
  },
]

try {
  mkdirSync(outDir, { recursive: true })
} catch {
  // Directory already exists.
}

const render = (body) =>
  new Resvg(svg(body), { fitTo: { mode: 'width', value: SIZE } }).render().asPng()

let total = 0
for (const sticker of STICKERS) {
  const png = render(sticker.body)
  const webp = await sharp(png).webp({ quality: 82, effort: 5 }).toBuffer()
  const file = join(outDir, `${sticker.id}.webp`)
  writeFileSync(file, webp)
  total += webp.length
  console.log(`Generated ${sticker.id}.webp (${(webp.length / 1024).toFixed(1)} KB)`)
}

console.log(`\nDone! ${STICKERS.length} stickers in public/stickers/basic/ (${(total / 1024).toFixed(1)} KB total)`)
