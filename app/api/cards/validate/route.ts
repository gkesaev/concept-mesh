import { NextRequest, NextResponse } from 'next/server'
import { MAX_CARD_BYTES } from '@/lib/cards/static-checks'
import { validateCard } from '@/lib/cards/validate'

// Allow slight JSON envelope overhead above the 500 KB HTML limit
const MAX_REQUEST_BYTES = MAX_CARD_BYTES + 64 * 1024

export const runtime = 'nodejs'

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

  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    return NextResponse.json({ error: 'Unable to read request body', code: 'BAD_REQUEST' }, { status: 400 })
  }

  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
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
