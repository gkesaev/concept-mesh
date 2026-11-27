import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { afterAll, describe, expect, it } from 'vitest'
import { POST } from '@/app/api/cards/validate/route'
import { closeValidationBrowser } from '@/lib/cards/browser'
import { MAX_CARD_BYTES } from '@/lib/cards/static-checks'

function buildRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

describe('POST /api/cards/validate', () => {
  afterAll(async () => {
    await closeValidationBrowser()
  })

  it('returns 400 for invalid JSON or missing html string', async () => {
    const badJson = await POST(buildRequest('{not-json'))
    expect(badJson.status).toBe(400)

    const missingHtml = await POST(buildRequest(JSON.stringify({ html: 123 })))
    expect(missingHtml.status).toBe(400)
  })

  it('returns 413 for payloads exceeding the size cap', async () => {
    const huge = JSON.stringify({ html: 'a'.repeat(MAX_CARD_BYTES + 70_000) })
    const res = await POST(buildRequest(huge))
    expect(res.status).toBe(413)
  })

  it('validates a known-good reference card and returns base64 thumbnail', async () => {
    const html = readFileSync(
      path.join(process.cwd(), 'docs/examples/card-sliders.html'),
      'utf8',
    )
    const res = await POST(buildRequest(JSON.stringify({ html })))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.renders).toBe(true)
    expect(data.errors).toEqual([])
    expect(data.hasInteractivity).toBe(true)
    expect(typeof data.thumbnail).toBe('string')
    expect(data.thumbnail.length).toBeGreaterThan(100)
    expect(data.screenshotHash).toMatch(/^[a-f0-9]{64}$/)
  })
})
