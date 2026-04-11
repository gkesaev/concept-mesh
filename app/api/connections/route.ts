import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts, conceptEdges } from '@/lib/db/schema'
import { or, eq, inArray } from 'drizzle-orm'

// GET /api/connections?conceptSlug=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const conceptSlug = searchParams.get('conceptSlug')

  try {
    let query = db.select().from(conceptEdges)

    if (conceptSlug) {
      query = query.where(
        or(eq(conceptEdges.sourceSlug, conceptSlug), eq(conceptEdges.targetSlug, conceptSlug))
      ) as typeof query
    }

    const results = await query
    return NextResponse.json(results)
  } catch (error) {
    console.error('GET /api/connections error:', error)
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 })
  }
}

const VALID_RELATIONSHIPS = ['related', 'prerequisite', 'application', 'contrast', 'analogy'] as const

// POST /api/connections
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sourceSlug, targetSlug, relationship, reason, aiGenerated } = body

    if (!sourceSlug || !targetSlug) {
      return NextResponse.json({ error: 'sourceSlug and targetSlug are required' }, { status: 400 })
    }

    if (relationship && !VALID_RELATIONSHIPS.includes(relationship)) {
      return NextResponse.json({ error: `relationship must be one of: ${VALID_RELATIONSHIPS.join(', ')}` }, { status: 400 })
    }

    // Validate that both concepts exist before inserting
    const existing = await db
      .select({ slug: concepts.slug })
      .from(concepts)
      .where(inArray(concepts.slug, [sourceSlug, targetSlug]))
    const existingSlugs = new Set(existing.map(c => c.slug))
    const missing = [sourceSlug, targetSlug].filter(s => !existingSlugs.has(s))
    if (missing.length > 0) {
      return NextResponse.json({ error: `Concept(s) not found: ${missing.join(', ')}` }, { status: 404 })
    }

    const [edge] = await db
      .insert(conceptEdges)
      .values({
        sourceSlug,
        targetSlug,
        relationship: relationship ?? 'related',
        reason: reason ?? null,
        aiGenerated: aiGenerated ?? false,
      })
      .onConflictDoNothing()
      .returning()

    if (!edge) {
      return NextResponse.json({ error: 'Connection already exists' }, { status: 409 })
    }

    return NextResponse.json(edge, { status: 201 })
  } catch (error) {
    console.error('POST /api/connections error:', error)
    return NextResponse.json({ error: 'Failed to create connection' }, { status: 500 })
  }
}
