/**
 * Manifest of the stickers shipped with the app (the "built-in" packs).
 *
 * A sticker message stores only its URL (`/stickers/<pack>/<id>.webp`), so every
 * asset below is committed and must never be renamed or removed: old messages
 * would stop rendering. Add new stickers, never rename shipped ones.
 *
 * The URL shape is enforced by the backend (`utils.IsBuiltinStickerURL`,
 * backend/utils/validationMedia.go) and mirrored here by the test.
 */

export interface BuiltinSticker {
  readonly id: string
  readonly url: string
  readonly alt: string
  readonly tags: readonly string[]
}

export interface BuiltinPack {
  readonly id: string
  readonly name: string
  readonly stickers: readonly BuiltinSticker[]
}

interface StickerSeed {
  readonly id: string
  readonly alt: string
  readonly tags: readonly string[]
}

interface PackSeed {
  readonly id: string
  readonly name: string
  readonly seeds: readonly StickerSeed[]
}

const PACK_SEEDS: readonly PackSeed[] = [
  {
    id: 'basic',
    name: 'Básicos',
    seeds: [
      { id: 'hola', alt: 'Sticker con la palabra Hola', tags: ['hola', 'saludo', 'greeting'] },
      { id: 'gracias', alt: 'Sticker con la palabra Gracias', tags: ['gracias', 'thanks'] },
      { id: 'ok', alt: 'Sticker con la señal OK', tags: ['ok', 'vale', 'bien'] },
      { id: 'jaja', alt: 'Sticker de risa con la palabra Jaja', tags: ['jaja', 'risa', 'laugh'] },
      { id: 'corazon', alt: 'Sticker de corazón rojo', tags: ['corazon', 'amor', 'love'] },
      { id: 'pulgar-arriba', alt: 'Sticker de pulgar arriba', tags: ['pulgar', 'like', 'bien'] },
      { id: 'fiesta', alt: 'Sticker de fiesta con confeti', tags: ['fiesta', 'party', 'celebrar'] },
      { id: 'dormido', alt: 'Sticker de cara dormida', tags: ['dormido', 'sueno', 'sleep'] },
      { id: 'triste', alt: 'Sticker de cara triste', tags: ['triste', 'sad'] },
      { id: 'amor', alt: 'Sticker de cara con ojos de corazón', tags: ['amor', 'love', 'enamorado'] },
      { id: 'sorpresa', alt: 'Sticker de cara sorprendida', tags: ['sorpresa', 'wow'] },
      { id: 'pensando', alt: 'Sticker de cara pensativa', tags: ['pensando', 'thinking'] },
      { id: 'adios', alt: 'Sticker con la palabra Adios', tags: ['adios', 'bye'] },
      { id: 'genial', alt: 'Sticker de cara con lentes de sol', tags: ['genial', 'cool'] },
      { id: 'enojado', alt: 'Sticker de cara enojada', tags: ['enojado', 'angry', 'molesto'] },
      { id: 'beso', alt: 'Sticker de cara enviando un beso', tags: ['beso', 'kiss', 'amor'] },
    ],
  },
  {
    id: 'animales',
    name: 'Animales',
    seeds: [
      { id: 'gato', alt: 'Sticker de cara de gato', tags: ['gato', 'cat', 'animal', 'mascota'] },
      { id: 'perro', alt: 'Sticker de cara de perro', tags: ['perro', 'dog', 'animal', 'mascota'] },
      { id: 'oso', alt: 'Sticker de cara de oso', tags: ['oso', 'bear', 'animal'] },
      { id: 'conejo', alt: 'Sticker de cara de conejo', tags: ['conejo', 'rabbit', 'animal'] },
      { id: 'zorro', alt: 'Sticker de cara de zorro', tags: ['zorro', 'fox', 'animal'] },
      { id: 'panda', alt: 'Sticker de cara de panda', tags: ['panda', 'animal', 'oso'] },
      { id: 'rana', alt: 'Sticker de cara de rana', tags: ['rana', 'frog', 'animal'] },
      { id: 'buho', alt: 'Sticker de cara de búho', tags: ['buho', 'owl', 'animal'] },
    ],
  },
  {
    id: 'comida',
    name: 'Comida',
    seeds: [
      { id: 'pizza', alt: 'Sticker de porción de pizza', tags: ['pizza', 'comida', 'food'] },
      { id: 'hamburguesa', alt: 'Sticker de hamburguesa', tags: ['hamburguesa', 'burger', 'comida'] },
      { id: 'helado', alt: 'Sticker de helado', tags: ['helado', 'icecream', 'postre'] },
      { id: 'dona', alt: 'Sticker de dona glaseada', tags: ['dona', 'donut', 'postre'] },
      { id: 'cafe', alt: 'Sticker de taza de café', tags: ['cafe', 'coffee', 'bebida'] },
      { id: 'taco', alt: 'Sticker de taco', tags: ['taco', 'comida', 'mexicano'] },
      { id: 'sushi', alt: 'Sticker de sushi', tags: ['sushi', 'comida', 'japones'] },
      { id: 'palomitas', alt: 'Sticker de palomitas de maíz', tags: ['palomitas', 'popcorn', 'cine'] },
    ],
  },
]

/** Builds the public shape from a seed so `url` can never drift from `id`. */
function toSticker(packId: string, seed: StickerSeed): BuiltinSticker {
  return {
    id: seed.id,
    url: `/stickers/${packId}/${seed.id}.webp`,
    alt: seed.alt,
    tags: seed.tags,
  }
}

export const BUILTIN_PACKS: readonly BuiltinPack[] = PACK_SEEDS.map((pack) => ({
  id: pack.id,
  name: pack.name,
  stickers: pack.seeds.map((seed) => toSticker(pack.id, seed)),
}))

const byUrl = new Map<string, BuiltinSticker>()
for (const pack of BUILTIN_PACKS) {
  for (const sticker of pack.stickers) {
    byUrl.set(sticker.url, sticker)
  }
}

/** Finds the built-in sticker for a message URL, or undefined when it is not ours. */
export function findBuiltinSticker(url: string): BuiltinSticker | undefined {
  return byUrl.get(url)
}
