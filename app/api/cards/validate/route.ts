import { NextRequest, NextResponse } from 'next/server'
import { MAX_CARD_BYTES } from '@/lib/cards/static-checks'
import { validateCard } from '@/lib/cards/validate'

// Allow slight JSON envelope overhead above the 500 KB HTML limit
const MAX_REQUEST_BYTES = MAX_CARD_BYTES + 64 * 1024

export const runtime = 'nodejs'

async function readBoundedText(req: NextRequest, maxBytes: number): Promise<string | 'TOO_LARGE'> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return 'TOO_LARGE'
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks, total).toString('utf8')
}

// POST /api/cards/validate — validate self-contained HTML card and generate thumbnail
export async function POST(req: NextRequest) {
  const contentLengthHeader = req.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { error: 'Request payload exceeds maximum card size (500 KB)', code: 'PAYLOAD_TOO_LARGE' },
        { status: 413 },
      )
    }
  }

  let rawBody: string | 'TOO_LARGE'
  try {
    rawBody = await readBoundedText(req, MAX_REQUEST_BYTES)
  } catch {
    return NextResponse.json({ error: 'Unable to read request body', code: 'BAD_REQUEST' }, { status: 400 })
  }

  if (rawBody === 'TOO_LARGE') {
    return NextResponse.json(
      { error: 'Request payload exceeds maximum card size (500 KB)', code: 'PAYLOAD_TOO_LARGE' },
      { status: 413 },
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, { status: 400 })
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { html?: unknown }).html !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Request body must include a string "html" field', code: 'INVALID_INPUT' },
      { status: 400 },
    )
  }

  const { html } = parsed as { html: string }

  try {
    const result = await validateCard(html)
    return NextResponse.json({
      renders: result.renders,
      errors: result.errors,
      hasInteractivity: result.hasInteractivity,
      thumbnail: result.thumbnail ? result.thumbnail.toString('base64') : null,
      screenshotHash: result.screenshotHash,
    })
  } catch (error) {
    console.error('POST /api/cards/validate error:', error)
    return NextResponse.json(
      { error: 'Failed to validate card', code: 'VALIDATION_ERROR' },
      { status: 500 },
    )
  }
}
