import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { favorites } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

// GET /api/user/favorites — list user's favorite concept IDs
export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userFavorites = await db
    .select({ conceptId: favorites.conceptId })
    .from(favorites)
    .where(eq(favorites.userId, userId))

  return NextResponse.json({ favorites: userFavorites.map(f => f.conceptId) })
}

// POST /api/user/favorites — add a concept to favorites
export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { conceptId } = await req.json()
  if (!conceptId || typeof conceptId !== 'string') {
    return NextResponse.json({ error: 'conceptId is required' }, { status: 400 })
  }

  await db.insert(favorites).values({ userId, conceptId }).onConflictDoNothing()
  return NextResponse.json({ favorited: true })
}

// DELETE /api/user/favorites — remove a concept from favorites
export async function DELETE(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { conceptId } = await req.json()
  if (!conceptId || typeof conceptId !== 'string') {
    return NextResponse.json({ error: 'conceptId is required' }, { status: 400 })
  }

  await db.delete(favorites).where(
    and(eq(favorites.userId, userId), eq(favorites.conceptId, conceptId))
  )
  return NextResponse.json({ favorited: false })
}
