import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { afterAll, describe, expect, it } from 'vitest'
import { closeValidationBrowser } from '@/lib/cards/browser'
import { analyzeScreenshot } from '@/lib/cards/screenshot'
import { MAX_CARD_BYTES, runStaticChecks } from '@/lib/cards/static-checks'
import { validateCard } from '@/lib/cards/validate'

const REPO_ROOT = process.cwd()

function readCard(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')
}

function makeMinimalCard(bodyContent: string, scriptContent = ''): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Test Card</title>
    <style>
      :root {
        --cm-bg: #0b1020;
        --cm-surface: #141a2e;
        --cm-text: #e8ecff;
        --cm-accent: #7c5cff;
        --cm-border: #2a3150;
      }
      html, body { margin: 0; height: 100%; background: var(--cm-bg); color: var(--cm-text); }
    </style>
  </head>
  <body>
    <main aria-label="Test visualization">
      ${bodyContent}
    </main>
    ${scriptContent ? `<script>${scriptContent}</script>` : ''}
  </body>
</html>`
}

function makeSolidPng(width: number, height: number, rgba: [number, number, number, number]): Buffer {
  const png = new PNG({ width, height })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0]
    png.data[i + 1] = rgba[1]
    png.data[i + 2] = rgba[2]
    png.data[i + 3] = rgba[3]
  }
  return PNG.sync.write(png)
}

describe('runStaticChecks', () => {
  it('accepts all reference and seed cards', () => {
    const cards = [
      'docs/examples/card-static.html',
      'docs/examples/card-sliders.html',
      'docs/examples/card-animation.html',
      'lib/db/seed-cards/binary-search.html',
      'lib/db/seed-cards/compound-interest.html',
    ]

    for (const file of cards) {
      expect(runStaticChecks(readCard(file)), file).toEqual([])
    }
  })

  it('rejects empty and oversized HTML', () => {
    expect(runStaticChecks('')).toContain('Card HTML is empty')
    const huge = makeMinimalCard(`<p>${'x'.repeat(MAX_CARD_BYTES + 100)}</p>`)
    expect(runStaticChecks(huge).some(e => e.includes('500 KB'))).toBe(true)
  })

  it('rejects external resources and prohibited JS APIs', () => {
    const withExternal = makeMinimalCard(
      '<img src="https://example.com/pic.png" alt="x" /><link rel="stylesheet" href="https://example.com/a.css" />',
      'fetch("https://example.com/api"); localStorage.setItem("a", "b"); eval("1+1");',
    )
    const errors = runStaticChecks(withExternal)
    expect(errors.some(e => e.includes('<link>'))).toBe(true)
    expect(errors.some(e => e.includes('<img src>'))).toBe(true)
    expect(errors.some(e => e.includes('fetch()'))).toBe(true)
    expect(errors.some(e => e.includes('localStorage'))).toBe(true)
    expect(errors.some(e => e.includes('eval()'))).toBe(true)
  })

  it('rejects missing --cm-* variables and unlabeled <main>', () => {
    const broken = '<!doctype html><html><head><style>:root{--cm-bg:#000}</style></head><body><main>Hi</main></body></html>'
    const errors = runStaticChecks(broken)
    expect(errors.some(e => e.includes('--cm-text'))).toBe(true)
    expect(errors.some(e => e.includes('accessible name'))).toBe(true)
  })
})

describe('analyzeScreenshot', () => {
  it('flags all-white and single-color PNGs as blank', () => {
    const white = analyzeScreenshot(makeSolidPng(60, 40, [255, 255, 255, 255]))
    expect(white.isBlank).toBe(true)
    expect(white.hash).toMatch(/^[a-f0-9]{64}$/)

    const dark = analyzeScreenshot(makeSolidPng(60, 40, [11, 16, 32, 255]))
    expect(dark.isBlank).toBe(true)
  })

  it('accepts multi-color PNGs as non-blank', () => {
    const png = new PNG({ width: 60, height: 40 })
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 60; x++) {
        const idx = (y * 60 + x) * 4
        const isAccent = x < 30 && y < 20
        png.data[idx] = isAccent ? 124 : 11
        png.data[idx + 1] = isAccent ? 92 : 16
        png.data[idx + 2] = isAccent ? 255 : 32
        png.data[idx + 3] = 255
      }
    }
    const analysis = analyzeScreenshot(PNG.sync.write(png))
    expect(analysis.isBlank).toBe(false)
    expect(analysis.uniqueColors).toBeGreaterThan(1)
  })
})

describe('validateCard (Playwright headless render)', () => {
  afterAll(async () => {
    await closeValidationBrowser()
  })

  it('validates static reference card with 600x400 thumbnail and hasInteractivity=false', async () => {
    const result = await validateCard(readCard('docs/examples/card-static.html'))
    expect(result.renders).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.hasInteractivity).toBe(false)
    expect(result.screenshotHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.thumbnail).toBeInstanceOf(Buffer)

    const decoded = PNG.sync.read(result.thumbnail!)
    expect(decoded.width).toBe(600)
    expect(decoded.height).toBe(400)
  })

  it('validates interactive slider and animation cards with hasInteractivity=true', async () => {
    const sliders = await validateCard(readCard('docs/examples/card-sliders.html'))
    expect(sliders.renders).toBe(true)
    expect(sliders.errors).toEqual([])
    expect(sliders.hasInteractivity).toBe(true)
    expect(sliders.thumbnail).toBeInstanceOf(Buffer)

    const anim = await validateCard(readCard('docs/examples/card-animation.html'))
    expect(anim.renders).toBe(true)
    expect(anim.errors).toEqual([])
    expect(anim.hasInteractivity).toBe(true)
    expect(anim.thumbnail).toBeInstanceOf(Buffer)
  })

  it('fails cards with uncaught JS runtime errors', async () => {
    const broken = makeMinimalCard(
      '<h1>Broken</h1>',
      'throw new Error("intentional card boom");',
    )
    const result = await validateCard(broken)
    expect(result.renders).toBe(false)
    expect(result.errors.some(e => e.includes('intentional card boom'))).toBe(true)
  })

  it('fails cards that log console.error', async () => {
    const broken = makeMinimalCard(
      '<h1>Console error</h1>',
      'console.error("render failed cleanly");',
    )
    const result = await validateCard(broken)
    expect(result.renders).toBe(false)
    expect(result.errors.some(e => e.includes('render failed cleanly'))).toBe(true)
  })

  it('fails blank / single-color renders', async () => {
    const blank = makeMinimalCard('')
    const result = await validateCard(blank)
    expect(result.renders).toBe(false)
    expect(result.errors.some(e => e.toLowerCase().includes('blank'))).toBe(true)
  })

  it('fails when rendering exceeds timeout', async () => {
    const infiniteLoop = makeMinimalCard(
      '<h1>Stuck</h1>',
      'while (true) {}',
    )
    const result = await validateCard(infiniteLoop, { timeoutMs: 1_200 })
    expect(result.renders).toBe(false)
    expect(result.errors.some(e => e.toLowerCase().includes('timed out'))).toBe(true)
  })
})
