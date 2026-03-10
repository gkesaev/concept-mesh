import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { connections } from '@/lib/db/schema'
import { or, eq } from 'drizzle-orm'

// GET /api/connections?conceptId=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const conceptId = searchParams.get('conceptId')

  try {
    let query = db.select().from(connections)

    if (conceptId) {
      query = query.where(
        or(eq(connections.sourceId, conceptId), eq(connections.targetId, conceptId))
      ) as typeof query
    }

    const results = await query
    return NextResponse.json(results)
  } catch (error) {
    console.error('GET /api/connections error:', error)
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 })
  }
}

// POST /api/connections
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sourceId, targetId, type, strength, aiGenerated, reason } = body

    if (!sourceId || !targetId) {
      return NextResponse.json({ error: 'sourceId and targetId are required' }, { status: 400 })
    }

    const [connection] = await db
      .insert(connections)
      .values({
        sourceId,
        targetId,
        type: type ?? 'related',
        strength: strength ?? 1.0,
        aiGenerated: aiGenerated ?? false,
        reason: reason ?? null,
      })
      .onConflictDoNothing()
      .returning()

    if (!connection) {
      return NextResponse.json({ error: 'Connection already exists' }, { status: 409 })
    }

    return NextResponse.json(connection, { status: 201 })
  } catch (error) {
    console.error('POST /api/connections error:', error)
    return NextResponse.json({ error: 'Failed to create connection' }, { status: 500 })
  }
}
