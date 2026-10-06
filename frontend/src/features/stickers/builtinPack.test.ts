/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_PACKS, findBuiltinSticker } from './builtinPack'

const root = process.cwd()
const publicDir = join(root, 'public')

/** Exact shape the backend accepts in utils.IsBuiltinStickerURL (backend/utils/validationMedia.go). */
const STICKER_URL = /^\/stickers\/[a-z0-9-]{1,40}\/[a-z0-9-]{1,60}\.webp$/

const stickerPath = (url: string) => join(publicDir, url.replace(/^\//, ''))

const allStickers = BUILTIN_PACKS.flatMap((pack) => pack.stickers)

describe('builtin sticker packs', () => {
  it('ships the basic pack plus at least two more original packs', () => {
    const ids = BUILTIN_PACKS.map((pack) => pack.id)
    expect(ids[0]).toBe('basic')
    expect(ids.length).toBeGreaterThanOrEqual(3)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every pack a Spanish display name and 8-20 stickers', () => {
    for (const pack of BUILTIN_PACKS) {
      expect(pack.name.trim(), pack.id).not.toBe('')
      expect(pack.stickers.length, pack.id).toBeGreaterThanOrEqual(8)
      expect(pack.stickers.length, pack.id).toBeLessThanOrEqual(20)
    }
  })

  it('uses unique sticker ids across every pack', () => {
    const ids = allStickers.map((sticker) => sticker.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every sticker a non-empty alt text', () => {
    for (const sticker of allStickers) {
      expect(sticker.alt.trim(), sticker.id).not.toBe('')
    }
  })

  it('gives every sticker at least one lowercase, unaccented tag', () => {
    for (const sticker of allStickers) {
      expect(sticker.tags.length, sticker.id).toBeGreaterThanOrEqual(1)
      for (const tag of sticker.tags) {
        expect(tag, sticker.id).toBe(tag.toLowerCase())
        expect(tag, sticker.id).toBe(tag.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
      }
    }
  })

  it('builds URLs the backend accepts (regex shape)', () => {
    for (const sticker of allStickers) {
      expect(sticker.url, sticker.id).toMatch(STICKER_URL)
    }
  })

  it('references only sticker files that exist under public/stickers/', () => {
    for (const sticker of allStickers) {
      expect(existsSync(stickerPath(sticker.url)), sticker.url).toBe(true)
    }
  })

  it('ships real WebP files (RIFF/WEBP magic)', () => {
    for (const sticker of allStickers) {
      const file = stickerPath(sticker.url)
      const buf = readFileSync(file)
      expect(buf.subarray(0, 4).toString('ascii'), file).toBe('RIFF')
      expect(buf.subarray(8, 12).toString('ascii'), file).toBe('WEBP')
    }
  })
})

describe('findBuiltinSticker', () => {
  it('returns the matching sticker for a known URL', () => {
    const hola = findBuiltinSticker('/stickers/basic/hola.webp')
    expect(hola).toBeDefined()
    expect(hola?.id).toBe('hola')
    expect(hola?.alt).not.toBe('')
  })

  it('finds stickers from the extra packs too', () => {
    const animales = BUILTIN_PACKS.find((pack) => pack.id === 'animales')
    expect(animales).toBeDefined()
    const first = animales!.stickers[0]!
    expect(findBuiltinSticker(first.url)?.id).toBe(first.id)
  })

  it('returns undefined for unknown builtin or storage URLs', () => {
    expect(findBuiltinSticker('/stickers/basic/missing.webp')).toBeUndefined()
    expect(findBuiltinSticker('/storage/bucket/file.webp')).toBeUndefined()
    expect(findBuiltinSticker('')).toBeUndefined()
  })
})
