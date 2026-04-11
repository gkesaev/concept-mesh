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
type Relationship = typeof VALID_RELATIONSHIPS[number]

function isRelationship(value: unknown): value is Relationship {
  return typeof value === 'string' && (VALID_RELATIONSHIPS as readonly string[]).includes(value)
}

// POST /api/connections
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

  const raw = body as Record<string, unknown>

  if (typeof raw.sourceSlug !== 'string' || raw.sourceSlug.length === 0) {
    return NextResponse.json({ error: 'sourceSlug must be a non-empty string' }, { status: 400 })
  }
  if (typeof raw.targetSlug !== 'string' || raw.targetSlug.length === 0) {
    return NextResponse.json({ error: 'targetSlug must be a non-empty string' }, { status: 400 })
  }
  const sourceSlug: string = raw.sourceSlug
  const targetSlug: string = raw.targetSlug

  let relationship: Relationship = 'related'
  if (raw.relationship !== undefined && raw.relationship !== null) {
    if (!isRelationship(raw.relationship)) {
      return NextResponse.json({ error: `relationship must be one of: ${VALID_RELATIONSHIPS.join(', ')}` }, { status: 400 })
    }
    relationship = raw.relationship
  }

  let reason: string | null = null
  if (raw.reason !== undefined && raw.reason !== null) {
    if (typeof raw.reason !== 'string') {
      return NextResponse.json({ error: 'reason must be a string or null' }, { status: 400 })
    }
    reason = raw.reason
  }

  let aiGenerated = false
  if (raw.aiGenerated !== undefined) {
    if (typeof raw.aiGenerated !== 'boolean') {
      return NextResponse.json({ error: 'aiGenerated must be a boolean' }, { status: 400 })
    }
    aiGenerated = raw.aiGenerated
  }

  try {
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
        relationship,
        reason,
        aiGenerated,
      })
      .onConflictDoNothing()
      .returning()

    if (!edge) {
      return NextResponse.json({ error: 'Connection already exists' }, { status: 409 })
    }

    return NextResponse.json(edge, { status: 201 })
  } catch (error) {
    // pg foreign_key_violation — concept deleted between check and insert
    if (error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === '23503') {
      return NextResponse.json({ error: `Concept(s) not found` }, { status: 404 })
    }
    console.error('POST /api/connections error:', error)
    return NextResponse.json({ error: 'Failed to create connection' }, { status: 500 })
  }
}
