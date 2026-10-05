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

describe('builtin sticker pack', () => {
  it('ships a single "basic" pack with 12-16 stickers', () => {
    expect(BUILTIN_PACKS.map((pack) => pack.id)).toEqual(['basic'])
    expect(allStickers.length).toBeGreaterThanOrEqual(12)
    expect(allStickers.length).toBeLessThanOrEqual(16)
  })

  it('uses unique sticker ids', () => {
    const ids = allStickers.map((sticker) => sticker.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every sticker a non-empty alt text', () => {
    for (const sticker of allStickers) {
      expect(sticker.alt.trim(), sticker.id).not.toBe('')
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

  it('returns undefined for unknown builtin or storage URLs', () => {
    expect(findBuiltinSticker('/stickers/basic/missing.webp')).toBeUndefined()
    expect(findBuiltinSticker('/storage/bucket/file.webp')).toBeUndefined()
    expect(findBuiltinSticker('')).toBeUndefined()
  })
})
