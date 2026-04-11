import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts } from '@/lib/db/schema'
import { ilike, or, and, type SQL } from 'drizzle-orm'

function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

// GET /api/concepts?q=&domain=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const domain = searchParams.get('domain')

  try {
    let query = db.select({
      slug: concepts.slug,
      title: concepts.title,
      domain: concepts.domain,
      description: concepts.description,
      bestCardId: concepts.bestCardId,
      cardCount: concepts.cardCount,
      createdAt: concepts.createdAt,
      updatedAt: concepts.updatedAt,
    }).from(concepts)

    const filters: SQL[] = []

    if (q) {
      const escaped = escapeLikePattern(q)
      const condition = or(
        ilike(concepts.title, `%${escaped}%`),
        ilike(concepts.description, `%${escaped}%`),
        ilike(concepts.domain, `%${escaped}%`)
      )
      if (condition) filters.push(condition)
    }

    if (domain) {
      const escapedDomain = escapeLikePattern(domain)
      filters.push(ilike(concepts.domain, `%${escapedDomain}%`))
    }

    if (filters.length > 0) {
      const combined = filters.length === 1 ? filters[0] : and(...filters)
      if (combined) query = query.where(combined) as typeof query
    }

    const results = await query
    return NextResponse.json(results)
  } catch (error) {
    console.error('GET /api/concepts error:', error)
    return NextResponse.json({ error: 'Failed to fetch concepts' }, { status: 500 })
  }
}

// POST /api/concepts — create a new concept
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 })
  }

  try {
    const { slug, title, domain, description } = body as Record<string, unknown>

    if (!slug || !title || !domain || !description) {
      return NextResponse.json({ error: 'slug, title, domain, description are required' }, { status: 400 })
    }
    if (typeof slug !== 'string' || typeof title !== 'string' || typeof domain !== 'string' || typeof description !== 'string') {
      return NextResponse.json({ error: 'slug, title, domain, description must be strings' }, { status: 400 })
    }

    // TODO: generate embedding vector for semantic search once embedding pipeline is built
    const [concept] = await db.insert(concepts).values({
      slug,
      title,
      domain,
      description,
    }).onConflictDoNothing().returning()

    if (!concept) {
      const existing = await db.query.concepts.findFirst({ where: (c, { eq }) => eq(c.slug, slug) })
      return NextResponse.json(existing, { status: 200 })
    }

    return NextResponse.json(concept, { status: 201 })
  } catch (error) {
    console.error('POST /api/concepts error:', error)
    return NextResponse.json({ error: 'Failed to create concept' }, { status: 500 })
  }
}
