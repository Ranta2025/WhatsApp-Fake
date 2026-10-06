// Generates the built-in sticker packs.
//
// Sources are original hand-written SVG designs (faces, gestures, words,
// animals and food). They are rasterized at 320x320 with @resvg/resvg-js
// (already used by generate-icons.mjs) and encoded to WebP with sharp. The
// resulting .webp files are committed and no build step runs this script.
// sharp is still a devDependency, so `npm ci` (CI and the Docker build stage)
// installs it.
//
// Output is not byte-reproducible across machines: the word stickers render
// text through FONT, and resvg resolves it from the host's system fonts.
// Shipped files are never renamed, deleted or regenerated in place (old
// messages reference them by URL). To honour that, this script skips a file
// that already exists; pass `--force` to regenerate in place anyway.
//
// Run with: npm run stickers  (from frontend/)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const publicStickersDir = join(here, '..', 'public', 'stickers')

const SIZE = 320
const FONT = "DejaVu Sans, Verdana, Helvetica, sans-serif"
const FORCE = process.argv.includes('--force')

/** Wraps an SVG body in the shared 320x320 canvas. */
const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${body}</svg>`

/** Flat face base: bright disc with a soft bottom shade. */
const face = (fill, shade) => `
  <circle cx="160" cy="160" r="150" fill="${shade}"/>
  <circle cx="160" cy="150" r="150" fill="${fill}"/>`

/** Smaller head disc (leaves room for ears drawn before it). */
const head = (fill, shade) => `
  <circle cx="160" cy="180" r="120" fill="${shade}"/>
  <circle cx="160" cy="170" r="120" fill="${fill}"/>`

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

const BASIC_STICKERS = [
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

const ANIMAL_STICKERS = [
  {
    id: 'gato',
    alt: 'Sticker de cara de gato',
    tags: ['gato', 'cat', 'animal', 'mascota'],
    body: `
      <path d="M82 96 L66 30 L138 68 Z" fill="#E89B45"/>
      <path d="M238 96 L254 30 L182 68 Z" fill="#E89B45"/>
      <path d="M88 88 L78 44 L124 70 Z" fill="#F7C9A0"/>
      <path d="M232 88 L242 44 L196 70 Z" fill="#F7C9A0"/>
      ${head('#F7B267', '#E89B45')}
      ${eye(118, 162)}${eye(202, 162)}
      <path d="M160 196 l-14 12 h28 Z" fill="#E0607E"/>
      <path d="M160 210 q-26 22 -42 4" stroke="#2b2b2b" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M160 210 q26 22 42 4" stroke="#2b2b2b" stroke-width="8" fill="none" stroke-linecap="round"/>
      <g stroke="#2b2b2b" stroke-width="6" stroke-linecap="round" opacity="0.8">
        <path d="M44 186 h52"/><path d="M44 208 h52"/>
        <path d="M276 186 h-52"/><path d="M276 208 h-52"/>
      </g>`,
  },
  {
    id: 'perro',
    alt: 'Sticker de cara de perro',
    tags: ['perro', 'dog', 'animal', 'mascota'],
    body: `
      <ellipse cx="62" cy="176" rx="40" ry="82" fill="#7E5236"/>
      <ellipse cx="258" cy="176" rx="40" ry="82" fill="#7E5236"/>
      ${head('#C98A5A', '#A96F44')}
      ${eye(118, 154)}${eye(202, 154)}
      <ellipse cx="160" cy="210" rx="48" ry="36" fill="#F3DDC4"/>
      <ellipse cx="160" cy="196" rx="17" ry="12" fill="#2b2b2b"/>
      <path d="M160 208 v14" stroke="#2b2b2b" stroke-width="7" stroke-linecap="round"/>
      <path d="M134 226 q26 22 52 0" stroke="#2b2b2b" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: 'oso',
    alt: 'Sticker de cara de oso',
    tags: ['oso', 'bear', 'animal'],
    body: `
      <circle cx="84" cy="82" r="40" fill="#A9713F"/>
      <circle cx="236" cy="82" r="40" fill="#A9713F"/>
      <circle cx="84" cy="82" r="20" fill="#D8A87A"/>
      <circle cx="236" cy="82" r="20" fill="#D8A87A"/>
      ${head('#B9824E', '#9C6B3D')}
      ${eye(122, 164)}${eye(198, 164)}
      <ellipse cx="160" cy="212" rx="46" ry="34" fill="#EBD3B5"/>
      <ellipse cx="160" cy="198" rx="17" ry="12" fill="#2b2b2b"/>
      <path d="M160 210 v12" stroke="#2b2b2b" stroke-width="7" stroke-linecap="round"/>
      <path d="M138 228 q22 20 44 0" stroke="#2b2b2b" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: 'conejo',
    alt: 'Sticker de cara de conejo',
    tags: ['conejo', 'rabbit', 'animal'],
    body: `
      <ellipse cx="122" cy="70" rx="24" ry="70" fill="#E8E8F0"/>
      <ellipse cx="198" cy="70" rx="24" ry="70" fill="#E8E8F0"/>
      <ellipse cx="122" cy="74" rx="11" ry="50" fill="#F7B8C8"/>
      <ellipse cx="198" cy="74" rx="11" ry="50" fill="#F7B8C8"/>
      ${head('#F2F2F7', '#D9D9E3')}
      ${eye(120, 164)}${eye(200, 164)}
      <path d="M160 196 l-12 10 h24 Z" fill="#E0607E"/>
      <path d="M160 206 v8" stroke="#2b2b2b" stroke-width="7" stroke-linecap="round"/>
      <path d="M138 220 q22 20 44 0" stroke="#2b2b2b" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: 'zorro',
    alt: 'Sticker de cara de zorro',
    tags: ['zorro', 'fox', 'animal'],
    body: `
      <path d="M74 96 L62 26 L140 66 Z" fill="#E2703A"/>
      <path d="M246 96 L258 26 L180 66 Z" fill="#E2703A"/>
      <path d="M84 86 L80 46 L124 70 Z" fill="#3B2A2A"/>
      <path d="M236 86 L240 46 L196 70 Z" fill="#3B2A2A"/>
      ${head('#F08A4B', '#D9753A')}
      ${eye(118, 158)}${eye(202, 158)}
      <path d="M160 210 q-32 -40 0 -54 q32 14 0 54 Z" fill="#FFF4EA"/>
      <ellipse cx="160" cy="198" rx="15" ry="11" fill="#2b2b2b"/>
      <path d="M160 210 v10" stroke="#2b2b2b" stroke-width="7" stroke-linecap="round"/>`,
  },
  {
    id: 'panda',
    alt: 'Sticker de cara de panda',
    tags: ['panda', 'animal', 'oso'],
    body: `
      <circle cx="86" cy="84" r="38" fill="#2b2b2b"/>
      <circle cx="234" cy="84" r="38" fill="#2b2b2b"/>
      ${head('#F7F7F7', '#DDDDDD')}
      <ellipse cx="120" cy="164" rx="30" ry="38" fill="#2b2b2b" transform="rotate(-18 120 164)"/>
      <ellipse cx="200" cy="164" rx="30" ry="38" fill="#2b2b2b" transform="rotate(18 200 164)"/>
      <circle cx="120" cy="164" r="9" fill="#ffffff"/>
      <circle cx="200" cy="164" r="9" fill="#ffffff"/>
      <ellipse cx="160" cy="206" rx="14" ry="10" fill="#2b2b2b"/>
      <path d="M160 216 q-18 16 -32 2" stroke="#2b2b2b" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M160 216 q18 16 32 2" stroke="#2b2b2b" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: 'rana',
    alt: 'Sticker de cara de rana',
    tags: ['rana', 'frog', 'animal'],
    body: `
      <circle cx="108" cy="84" r="44" fill="#6BBF59"/>
      <circle cx="212" cy="84" r="44" fill="#6BBF59"/>
      ${head('#7CCB6A', '#5FAE4E')}
      <circle cx="108" cy="84" r="26" fill="#ffffff"/>
      <circle cx="212" cy="84" r="26" fill="#ffffff"/>
      <circle cx="108" cy="86" r="12" fill="#2b2b2b"/>
      <circle cx="212" cy="86" r="12" fill="#2b2b2b"/>
      <path d="M108 206 q52 44 104 0" stroke="#2b2b2b" stroke-width="9" fill="none" stroke-linecap="round"/>
      <circle cx="130" cy="172" r="8" fill="#3E7A33"/>
      <circle cx="190" cy="172" r="8" fill="#3E7A33"/>`,
  },
  {
    id: 'buho',
    alt: 'Sticker de cara de búho',
    tags: ['buho', 'owl', 'animal'],
    body: `
      <path d="M94 96 L76 34 L132 70 Z" fill="#8B6B4A"/>
      <path d="M226 96 L244 34 L188 70 Z" fill="#8B6B4A"/>
      ${head('#A9835B', '#8B6B4A')}
      <circle cx="118" cy="162" r="42" fill="#F7F2E7"/>
      <circle cx="202" cy="162" r="42" fill="#F7F2E7"/>
      <circle cx="118" cy="162" r="17" fill="#2b2b2b"/>
      <circle cx="202" cy="162" r="17" fill="#2b2b2b"/>
      <path d="M160 186 l-16 16 l16 16 l16 -16 Z" fill="#E8A33D"/>`,
  },
]

const FOOD_STICKERS = [
  {
    id: 'pizza',
    alt: 'Sticker de porción de pizza',
    tags: ['pizza', 'comida', 'food'],
    body: `
      <path d="M160 292 L54 120 q106 -54 212 0 Z" fill="#F2C14E"/>
      <path d="M160 292 L70 138 q90 -40 180 0 Z" fill="#E06B3A"/>
      <circle cx="130" cy="182" r="16" fill="#C63A2E"/>
      <circle cx="196" cy="178" r="16" fill="#C63A2E"/>
      <circle cx="160" cy="240" r="16" fill="#C63A2E"/>
      <circle cx="112" cy="236" r="12" fill="#C63A2E"/>
      <circle cx="210" cy="234" r="12" fill="#C63A2E"/>`,
  },
  {
    id: 'hamburguesa',
    alt: 'Sticker de hamburguesa',
    tags: ['hamburguesa', 'burger', 'comida'],
    body: `
      <path d="M52 138 q108 -90 216 0 Z" fill="#E8A33D"/>
      <circle cx="108" cy="110" r="7" fill="#F7E3B0"/>
      <circle cx="160" cy="98" r="7" fill="#F7E3B0"/>
      <circle cx="212" cy="110" r="7" fill="#F7E3B0"/>
      <rect x="46" y="136" width="228" height="22" rx="11" fill="#5FAE4E"/>
      <rect x="52" y="156" width="216" height="20" rx="10" fill="#C63A2E"/>
      <rect x="50" y="174" width="220" height="18" rx="9" fill="#F2C14E"/>
      <rect x="54" y="190" width="212" height="34" rx="14" fill="#8A5A3B"/>
      <path d="M52 222 h216 q-14 52 -108 52 q-94 0 -108 -52 Z" fill="#D98C34"/>`,
  },
  {
    id: 'helado',
    alt: 'Sticker de helado',
    tags: ['helado', 'icecream', 'postre'],
    body: `
      <path d="M92 176 L160 300 L228 176 Z" fill="#E0A96D"/>
      <path d="M104 190 h112 M116 216 h88 M128 242 h64" stroke="#B9854A" stroke-width="8"/>
      <circle cx="130" cy="150" r="52" fill="#F7B8C8"/>
      <circle cx="190" cy="150" r="52" fill="#F2C14E"/>
      <circle cx="160" cy="106" r="52" fill="#8ED1C4"/>
      <circle cx="150" cy="92" r="7" fill="#E0607E"/>`,
  },
  {
    id: 'dona',
    alt: 'Sticker de dona glaseada',
    tags: ['dona', 'donut', 'postre'],
    body: `
      <circle cx="160" cy="160" r="128" fill="#D98C5F"/>
      <circle cx="160" cy="160" r="112" fill="#F7A8C4"/>
      <circle cx="160" cy="160" r="46" fill="#D98C5F"/>
      <circle cx="160" cy="160" r="46" fill="none" stroke="#B9744A" stroke-width="8"/>
      <g stroke-width="9" stroke-linecap="round">
        <path d="M112 112 l16 -10" stroke="#F2C14E"/>
        <path d="M210 120 l14 8" stroke="#5FAE4E"/>
        <path d="M110 214 l14 8" stroke="#4D9DE0"/>
        <path d="M214 208 l12 -12" stroke="#C63A2E"/>
        <path d="M160 84 l0 14" stroke="#8ED1C4"/>
        <path d="M160 234 l0 12" stroke="#F2C14E"/>
      </g>`,
  },
  {
    id: 'cafe',
    alt: 'Sticker de taza de café',
    tags: ['cafe', 'coffee', 'bebida'],
    body: `
      <g stroke="#9AA7B4" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.9">
        <path d="M126 60 q-14 -22 0 -40"/>
        <path d="M160 56 q-14 -22 0 -40"/>
        <path d="M194 60 q-14 -22 0 -40"/>
      </g>
      <path d="M242 150 h30 a30 30 0 0 1 0 60 h-30" fill="none" stroke="#F7F2E7" stroke-width="16"/>
      <path d="M78 130 h164 v70 a58 58 0 0 1 -58 58 h-48 a58 58 0 0 1 -58 -58 Z" fill="#F7F2E7"/>
      <path d="M88 146 h144 v46 a48 48 0 0 1 -48 48 h-48 a48 48 0 0 1 -48 -48 Z" fill="#8A5A3B"/>
      <ellipse cx="160" cy="292" rx="118" ry="14" fill="#C9BFAD"/>`,
  },
  {
    id: 'taco',
    alt: 'Sticker de taco',
    tags: ['taco', 'comida', 'mexicano'],
    body: `
      <path d="M52 210 a108 108 0 0 1 216 0 Z" fill="#E8A33D"/>
      <path d="M62 210 q98 -50 196 0 q-24 18 -46 0 q-22 18 -44 0 q-22 18 -44 0 q-22 18 -44 0 Z" fill="#5FAE4E"/>
      <circle cx="120" cy="184" r="14" fill="#C63A2E"/>
      <circle cx="160" cy="174" r="14" fill="#C63A2E"/>
      <circle cx="200" cy="184" r="14" fill="#C63A2E"/>
      <path d="M92 178 q14 -20 28 0" stroke="#F2C14E" stroke-width="9" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: 'sushi',
    alt: 'Sticker de sushi',
    tags: ['sushi', 'comida', 'japones'],
    body: `
      <ellipse cx="160" cy="196" rx="118" ry="70" fill="#F7F2E7"/>
      <path d="M54 176 q106 -70 212 0 q-30 44 -106 44 q-76 0 -106 -44 Z" fill="#F08A4B"/>
      <path d="M78 156 q82 -44 164 0" stroke="#F7B8A0" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="M120 138 q-16 58 0 116 l80 0 q16 -58 0 -116 Z" fill="#2E3A34"/>
      <ellipse cx="160" cy="196" rx="40" ry="70" fill="#3C4A42"/>`,
  },
  {
    id: 'palomitas',
    alt: 'Sticker de palomitas de maíz',
    tags: ['palomitas', 'popcorn', 'cine'],
    body: `
      <g fill="#F7F2E7">
        <circle cx="98" cy="126" r="34"/>
        <circle cx="140" cy="104" r="38"/>
        <circle cx="184" cy="104" r="38"/>
        <circle cx="222" cy="128" r="34"/>
        <circle cx="160" cy="126" r="40"/>
      </g>
      <g fill="#F2C14E">
        <circle cx="120" cy="120" r="12"/><circle cx="160" cy="108" r="12"/>
        <circle cx="200" cy="120" r="12"/><circle cx="140" cy="140" r="12"/><circle cx="182" cy="140" r="12"/>
      </g>
      <path d="M84 168 h152 l-16 122 h-120 Z" fill="#E8E8F0"/>
      <g fill="#C63A2E">
        <path d="M96 168 h30 l-10 122 h-24 Z"/>
        <path d="M150 168 h30 l-4 122 h-24 Z"/>
        <path d="M204 168 h30 l-2 122 h-26 Z"/>
      </g>
      <path d="M84 168 h152 l-16 122 h-120 Z" fill="none" stroke="#C9BFAD" stroke-width="6"/>`,
  },
]

const PACKS = [
  { id: 'basic', stickers: BASIC_STICKERS },
  { id: 'animales', stickers: ANIMAL_STICKERS },
  { id: 'comida', stickers: FOOD_STICKERS },
]

const render = (body) =>
  new Resvg(svg(body), { fitTo: { mode: 'width', value: SIZE } }).render().asPng()

let total = 0
let written = 0
let skipped = 0
for (const pack of PACKS) {
  const outDir = join(publicStickersDir, pack.id)
  mkdirSync(outDir, { recursive: true })
  let packBytes = 0
  for (const sticker of pack.stickers) {
    const file = join(outDir, `${sticker.id}.webp`)
    if (!FORCE && existsSync(file)) {
      skipped += 1
      continue
    }
    const png = render(sticker.body)
    const webp = await sharp(png).webp({ quality: 82, effort: 5 }).toBuffer()
    writeFileSync(file, webp)
    packBytes += webp.length
    total += webp.length
    written += 1
    console.log(`Generated ${pack.id}/${sticker.id}.webp (${(webp.length / 1024).toFixed(1)} KB)`)
  }
  console.log(`${pack.id}: ${pack.stickers.length} stickers (${(packBytes / 1024).toFixed(1)} KB written)`)
}

console.log(`\nDone! ${written} written, ${skipped} skipped in public/stickers/ (${(total / 1024).toFixed(1)} KB total)`)
