import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts } from '@/lib/db/schema'
import { ilike, or } from 'drizzle-orm'

// GET /api/concepts?q=&domain=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const domain = searchParams.get('domain')

  try {
    let query = db.select({
      id: concepts.id,
      name: concepts.name,
      domain: concepts.domain,
      explanation: concepts.explanation,
      difficulty: concepts.difficulty,
      metadata: concepts.metadata,
      createdAt: concepts.createdAt,
      updatedAt: concepts.updatedAt,
    }).from(concepts)

    if (q) {
      query = query.where(
        or(
          ilike(concepts.name, `%${q}%`),
          ilike(concepts.explanation, `%${q}%`),
          ilike(concepts.domain, `%${q}%`)
        )
      ) as typeof query
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
    const { id, name, domain, explanation, difficulty, metadata } = body

    if (!id || !name || !domain || !explanation) {
      return NextResponse.json({ error: 'id, name, domain, explanation are required' }, { status: 400 })
    }

    const [concept] = await db.insert(concepts).values({
      id,
      name,
      domain,
      explanation,
      difficulty: difficulty ?? null,
      metadata: metadata ?? {},
    }).onConflictDoNothing().returning()

    if (!concept) {
      // Concept already existed — return existing
      const existing = await db.query.concepts.findFirst({ where: (c, { eq }) => eq(c.id, id) })
      return NextResponse.json(existing, { status: 200 })
    }

    return NextResponse.json(concept, { status: 201 })
  } catch (error) {
    console.error('POST /api/concepts error:', error)
    return NextResponse.json({ error: 'Failed to create concept' }, { status: 500 })
  }
}
