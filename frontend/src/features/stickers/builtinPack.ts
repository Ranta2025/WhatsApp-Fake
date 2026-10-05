/**
 * Manifest of the stickers shipped with the app (the "built-in" pack).
 *
 * A sticker message stores only its URL (`/stickers/basic/<id>.webp`), so every
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

const BASIC_PACK_ID = 'basic'

interface StickerSeed {
  readonly id: string
  readonly alt: string
  readonly tags: readonly string[]
}

const basicSeeds: readonly StickerSeed[] = [
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
]

/** Builds the public shape from a seed so `url` can never drift from `id`. */
function toSticker(seed: StickerSeed): BuiltinSticker {
  return {
    id: seed.id,
    url: `/stickers/${BASIC_PACK_ID}/${seed.id}.webp`,
    alt: seed.alt,
    tags: seed.tags,
  }
}

export const BUILTIN_PACKS: readonly BuiltinPack[] = [
  {
    id: BASIC_PACK_ID,
    name: 'Básicos',
    stickers: basicSeeds.map(toSticker),
  },
]

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
