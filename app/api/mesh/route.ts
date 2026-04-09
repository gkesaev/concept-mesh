import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts, connections, nodePositions } from '@/lib/db/schema'

// GET /api/mesh — bulk fetch all concepts + connections + positions
// Used for initial canvas hydration
export async function GET() {
  try {
    const [allConcepts, allConnections, allPositions] = await Promise.all([
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
    ])

    return NextResponse.json({
      concepts: allConcepts,
      connections: allConnections,
      positions: allPositions,
    })
  } catch (error) {
    console.error('GET /api/mesh error:', error)
    return NextResponse.json({ error: 'Failed to load mesh data' }, { status: 500 })
  }
}
