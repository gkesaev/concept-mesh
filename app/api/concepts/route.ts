import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts } from '@/lib/db/schema'
import { ilike, or } from 'drizzle-orm'

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

    if (q) {
      const escaped = escapeLikePattern(q)
      query = query.where(
        or(
          ilike(concepts.title, `%${escaped}%`),
          ilike(concepts.description, `%${escaped}%`),
          ilike(concepts.domain, `%${escaped}%`)
        )
      ) as typeof query
    }

    if (domain) {
      const escapedDomain = escapeLikePattern(domain)
      query = query.where(ilike(concepts.domain, `%${escapedDomain}%`)) as typeof query
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
  try {
    const body = await req.json()
    const { slug, title, domain, description } = body

    if (!slug || !title || !domain || !description) {
      return NextResponse.json({ error: 'slug, title, domain, description are required' }, { status: 400 })
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
