/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { manifest } from './manifest'

const root = process.cwd()
const publicDir = join(root, 'public')

const icons = manifest.icons ?? []

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngSize(file: string): string {
  const buf = readFileSync(file)
  pngSignature.forEach((byte, i) => expect(buf[i], `PNG signature of ${file}`).toBe(byte))
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`
}

const iconPath = (src: string) => join(publicDir, src.replace(/^\//, ''))

describe('PWA manifest', () => {
  it('declares identity, scope, language and display fields', () => {
    expect(manifest.id).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.lang).toBe('es')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
  })

  it('includes PNG icons 192 and 512 (any) and a 512 maskable', () => {
    const pngs = icons.filter((i) => i.type === 'image/png')
    expect(pngs.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true)
    expect(pngs.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true)
    expect(pngs.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true)
  })

  it('references only icon files that exist', () => {
    for (const icon of icons) {
      expect(existsSync(iconPath(icon.src)), icon.src).toBe(true)
    }
  })

  it('has PNG real dimensions matching declared sizes', () => {
    for (const icon of icons.filter((i) => i.type === 'image/png')) {
      expect(pngSize(iconPath(icon.src)), icon.src).toBe(icon.sizes)
    }
  })

  it('points the apple-touch-icon to an existing 180x180 PNG', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    const link = html.match(/<link[^>]*rel="apple-touch-icon"[^>]*>/)?.[0] ?? ''
    const href = link.match(/href="([^"]+)"/)?.[1] ?? ''
    expect(href).toMatch(/\.png$/)
    expect(existsSync(iconPath(href))).toBe(true)
    expect(pngSize(iconPath(href))).toBe('180x180')
  })
})
