import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { and, eq, desc, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { concepts, conceptCards } from '@/lib/db/schema'

type Params = { params: Promise<{ id: string }> }

// GET /api/concepts/[slug]/cards
//   ?best=1 → return only the canonical card (concepts.best_card_id) or the
//             newest non-flagged card as a fallback.
//   default → list of cards ordered newest first, capped.
export async function GET(req: NextRequest, { params }: Params) {
  const { id: slug } = await params
  const { searchParams } = new URL(req.url)
  const wantBest = searchParams.get('best') === '1'

  try {
    const concept = await db.query.concepts.findFirst({
      where: (c, { eq }) => eq(c.slug, slug),
      columns: { slug: true, bestCardId: true, cardCount: true },
    })
    if (!concept) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (wantBest) {
      const card = concept.bestCardId
        ? await db.query.conceptCards.findFirst({
            where: (c, { eq }) => eq(c.id, concept.bestCardId!),
          })
        : await db.query.conceptCards.findFirst({
            where: (c, { eq }) => eq(c.slug, slug),
            orderBy: (c, { desc }) => [desc(c.version)],
          })

      if (!card) return NextResponse.json({ card: null })
      return NextResponse.json({ card })
    }

    const cards = await db
      .select()
      .from(conceptCards)
      .where(eq(conceptCards.slug, slug))
      .orderBy(desc(conceptCards.version))
      .limit(20)

    return NextResponse.json({ cards })
  } catch (err) {
    console.error(`GET /api/concepts/${slug}/cards error:`, err)
    return NextResponse.json({ error: 'Failed to load cards' }, { status: 500 })
  }
}

// PATCH /api/concepts/[slug]/cards
//   body: { cardId: string, action: 'mark-rendered' | 'flag' }
// `mark-rendered` is sent by the VizRenderer once the iframe posts its
// `concept-mesh-ready` handshake, flipping a draft card to published.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: slug } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const cardId = (body as { cardId?: unknown })?.cardId
  const action = (body as { action?: unknown })?.action
  if (typeof cardId !== 'string' || (action !== 'mark-rendered' && action !== 'flag')) {
    return NextResponse.json({ error: 'cardId and action ("mark-rendered" | "flag") are required' }, { status: 400 })
  }

  try {
    if (action === 'mark-rendered') {
      const [updated] = await db
        .update(conceptCards)
        .set({
          validationRenders: true,
          status: 'published',
          updatedAt: new Date(),
        })
        .where(eq(conceptCards.id, cardId))
        .returning({ id: conceptCards.id, status: conceptCards.status })
      if (!updated) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

      // Promote to best card only if this concept does not already have one.
      await db
        .update(concepts)
        .set({ bestCardId: cardId })
        .where(and(eq(concepts.slug, slug), isNull(concepts.bestCardId)))

      return NextResponse.json({ card: updated })
    }

    // flag
    const [flagged] = await db
      .update(conceptCards)
      .set({ status: 'flagged', updatedAt: new Date() })
      .where(eq(conceptCards.id, cardId))
      .returning({ id: conceptCards.id, status: conceptCards.status })
    if (!flagged) return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    return NextResponse.json({ card: flagged })
  } catch (err) {
    console.error(`PATCH /api/concepts/${slug}/cards error:`, err)
    return NextResponse.json({ error: 'Failed to update card' }, { status: 500 })
  }
}
