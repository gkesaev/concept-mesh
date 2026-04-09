import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

type Params = { params: Promise<{ id: string }> }

// GET /api/concepts/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const concept = await db.query.concepts.findFirst({
      where: (c, { eq }) => eq(c.id, id),
    })

    if (!concept) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(concept)
  } catch (error) {
    console.error(`GET /api/concepts/${id} error:`, error)
    return NextResponse.json({ error: 'Failed to fetch concept' }, { status: 500 })
  }
}

// PUT /api/concepts/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const body = await req.json()
    const { name, domain, explanation, difficulty, metadata } = body

    const [updated] = await db
      .update(concepts)
      .set({
        ...(name && { name }),
        ...(domain && { domain }),
        ...(explanation && { explanation }),
        ...(difficulty !== undefined && { difficulty }),
        ...(metadata !== undefined && { metadata }),
        updatedAt: new Date(),
      })
      .where(eq(concepts.id, id))
      .returning()

    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error(`PUT /api/concepts/${id} error:`, error)
    return NextResponse.json({ error: 'Failed to update concept' }, { status: 500 })
  }
}

// DELETE /api/concepts/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    await db.delete(concepts).where(eq(concepts.id, id))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`DELETE /api/concepts/${id} error:`, error)
    return NextResponse.json({ error: 'Failed to delete concept' }, { status: 500 })
  }
}
