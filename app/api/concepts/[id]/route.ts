import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts, conceptCards } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'

type Params = { params: Promise<{ id: string }> }

// GET /api/concepts/[id] — concept plus its best published card
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const concept = await db.query.concepts.findFirst({
      where: (c, { eq }) => eq(c.slug, id),
      columns: { embedding: false },
    })

    if (!concept) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    let bestCard = null
    if (concept.bestCardId) {
      bestCard = await db.query.conceptCards.findFirst({
        where: and(
          eq(conceptCards.id, concept.bestCardId),
          eq(conceptCards.status, 'published'),
        ),
      }) ?? null
    }
    if (!bestCard) {
      bestCard = await db.query.conceptCards.findFirst({
        where: and(
          eq(conceptCards.slug, concept.slug),
          eq(conceptCards.status, 'published'),
        ),
        orderBy: [desc(conceptCards.upvotes), desc(conceptCards.version)],
      }) ?? null
    }

    return NextResponse.json({ ...concept, bestCard })
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
    const { title, domain, description } = body

    const [updated] = await db
      .update(concepts)
      .set({
        ...(title && { title }),
        ...(domain && { domain }),
        ...(description && { description }),
        updatedAt: new Date(),
      })
      .where(eq(concepts.slug, id))
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
    const deleted = await db
      .delete(concepts)
      .where(eq(concepts.slug, id))
      .returning({ slug: concepts.slug })
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Concept not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`DELETE /api/concepts/${id} error:`, error)
    return NextResponse.json({ error: 'Failed to delete concept' }, { status: 500 })
  }
}
