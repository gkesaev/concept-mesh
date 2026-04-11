import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { concepts, favorites } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

// GET /api/user/favorites — list user's favorite concept slugs
export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userFavorites = await db
    .select({ conceptSlug: favorites.conceptSlug })
    .from(favorites)
    .where(eq(favorites.userId, userId))

  return NextResponse.json({ favorites: userFavorites.map(f => f.conceptSlug) })
}

// POST /api/user/favorites — add a concept to favorites
export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { conceptSlug } = body
  if (!conceptSlug || typeof conceptSlug !== 'string') {
    return NextResponse.json({ error: 'conceptSlug is required' }, { status: 400 })
  }

  const concept = await db.query.concepts.findFirst({
    where: (c, { eq }) => eq(c.slug, conceptSlug),
    columns: { slug: true },
  })
  if (!concept) {
    return NextResponse.json({ error: 'Concept not found' }, { status: 404 })
  }

  await db.insert(favorites).values({ userId, conceptSlug }).onConflictDoNothing()
  return NextResponse.json({ favorited: true })
}

// DELETE /api/user/favorites — remove a concept from favorites
export async function DELETE(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { conceptSlug } = body
  if (!conceptSlug || typeof conceptSlug !== 'string') {
    return NextResponse.json({ error: 'conceptSlug is required' }, { status: 400 })
  }

  await db.delete(favorites).where(
    and(eq(favorites.userId, userId), eq(favorites.conceptSlug, conceptSlug))
  )
  return NextResponse.json({ favorited: false })
}
