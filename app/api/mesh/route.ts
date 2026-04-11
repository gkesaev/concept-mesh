import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts, conceptEdges, nodePositions } from '@/lib/db/schema'
import { and, gte, lte, inArray, type SQL } from 'drizzle-orm'

const MAX_RADIUS = 10000
const MAX_NODES = 500

const CONCEPT_COLUMNS = {
  slug: concepts.slug,
  title: concepts.title,
  domain: concepts.domain,
  description: concepts.description,
  bestCardId: concepts.bestCardId,
  cardCount: concepts.cardCount,
  createdAt: concepts.createdAt,
  updatedAt: concepts.updatedAt,
} as const

// GET /api/mesh?x=&y=&radius= — viewport-bounded fetch of concepts/edges/positions
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const xRaw = searchParams.get('x')
  const yRaw = searchParams.get('y')
  const radiusRaw = searchParams.get('radius')

  let viewport: { x: number; y: number; radius: number } | null = null
  if (xRaw !== null || yRaw !== null || radiusRaw !== null) {
    const x = Number(xRaw)
    const y = Number(yRaw)
    const radius = Number(radiusRaw)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) {
      return NextResponse.json(
        { error: 'x, y, radius must be finite numbers with radius > 0' },
        { status: 400 }
      )
    }
    viewport = { x, y, radius: Math.min(radius, MAX_RADIUS) }
  }

  try {
    // 1. Positions: bounding-box filtered if viewport provided, always limited
    let positionsQuery = db.select().from(nodePositions)
    if (viewport) {
      const bbox: SQL | undefined = and(
        gte(nodePositions.x, viewport.x - viewport.radius),
        lte(nodePositions.x, viewport.x + viewport.radius),
        gte(nodePositions.y, viewport.y - viewport.radius),
        lte(nodePositions.y, viewport.y + viewport.radius),
      )
      if (bbox) positionsQuery = positionsQuery.where(bbox) as typeof positionsQuery
    }
    const positions = await positionsQuery.limit(MAX_NODES)

    // 2. Concepts: restrict to in-viewport slugs if viewport, otherwise capped list
    const allConcepts = await (async () => {
      if (viewport) {
        const slugs = positions.map(p => p.conceptSlug)
        if (slugs.length === 0) return []
        return db
          .select(CONCEPT_COLUMNS)
          .from(concepts)
          .where(inArray(concepts.slug, slugs))
      }
      return db.select(CONCEPT_COLUMNS).from(concepts).limit(MAX_NODES)
    })()

    if (allConcepts.length === 0) {
      return NextResponse.json({ concepts: [], edges: [], positions })
    }

    // 3. Edges: only those whose endpoints are both in the returned concept set
    const conceptSlugs = allConcepts.map(c => c.slug)
    const allEdges = conceptSlugs.length > 0
      ? await db
          .select()
          .from(conceptEdges)
          .where(
            and(
              inArray(conceptEdges.sourceSlug, conceptSlugs),
              inArray(conceptEdges.targetSlug, conceptSlugs),
            )
          )
      : []

    return NextResponse.json({
      concepts: allConcepts,
      edges: allEdges,
      positions,
    })
  } catch (error) {
    console.error('GET /api/mesh error:', error)
    return NextResponse.json({ error: 'Failed to load mesh data' }, { status: 500 })
  }
}
