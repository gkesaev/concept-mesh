import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts, connections, visualizations, nodePositions } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

// GET /api/mesh — bulk fetch all concepts + connections + positions
// Used for initial canvas hydration
export async function GET() {
  try {
    const [allConcepts, allConnections, allPositions, activeViz] = await Promise.all([
      db.select({
        id: concepts.id,
        name: concepts.name,
        domain: concepts.domain,
        explanation: concepts.explanation,
        difficulty: concepts.difficulty,
        metadata: concepts.metadata,
        createdAt: concepts.createdAt,
        updatedAt: concepts.updatedAt,
      }).from(concepts),

      db.select().from(connections),

      db.select().from(nodePositions),

      db.select().from(visualizations).where(eq(visualizations.isActive, true)),
    ])

    // Map active visualizations by conceptId
    const vizByConceptId = new Map(activeViz.map(v => [v.conceptId, v]))

    const conceptsWithViz = allConcepts.map(c => ({
      ...c,
      visualization: vizByConceptId.get(c.id) ?? null,
    }))

    return NextResponse.json({
      concepts: conceptsWithViz,
      connections: allConnections,
      positions: allPositions,
    })
  } catch (error) {
    console.error('GET /api/mesh error:', error)
    return NextResponse.json({ error: 'Failed to load mesh data' }, { status: 500 })
  }
}
