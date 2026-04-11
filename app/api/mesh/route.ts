import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts, conceptEdges, nodePositions } from '@/lib/db/schema'

// GET /api/mesh — bulk fetch all concepts + edges + positions
// Used for initial canvas hydration
export async function GET() {
  try {
    const [allConcepts, allEdges, allPositions] = await Promise.all([
      db.select({
        slug: concepts.slug,
        title: concepts.title,
        domain: concepts.domain,
        description: concepts.description,
        bestCardId: concepts.bestCardId,
        cardCount: concepts.cardCount,
        createdAt: concepts.createdAt,
        updatedAt: concepts.updatedAt,
      }).from(concepts),

      db.select().from(conceptEdges),

      db.select().from(nodePositions),
    ])

    return NextResponse.json({
      concepts: allConcepts,
      edges: allEdges,
      positions: allPositions,
    })
  } catch (error) {
    console.error('GET /api/mesh error:', error)
    return NextResponse.json({ error: 'Failed to load mesh data' }, { status: 500 })
  }
}
