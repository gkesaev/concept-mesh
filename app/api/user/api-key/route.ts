import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { encrypt, decrypt } from '@/lib/crypto'

// GET /api/user/api-key — check if user has an API key stored (returns masked version)
export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
    columns: { encryptedApiKey: true },
  })

  if (!user?.encryptedApiKey) {
    return NextResponse.json({ hasKey: false })
  }

  // Decrypt to show masked version
  const key = decrypt(user.encryptedApiKey)
  const masked = key.slice(0, 10) + '...' + key.slice(-4)

  return NextResponse.json({ hasKey: true, maskedKey: masked })
}

// PUT /api/user/api-key — store or update the user's Anthropic API key
export async function PUT(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { apiKey } = await req.json()

  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json({ error: 'apiKey is required' }, { status: 400 })
  }

  // Basic format check
  if (!apiKey.startsWith('sk-ant-')) {
    return NextResponse.json({ error: 'Invalid Anthropic API key format' }, { status: 400 })
  }

  const encrypted = encrypt(apiKey)

  await db
    .update(users)
    .set({ encryptedApiKey: encrypted })
    .where(eq(users.id, userId))

  const masked = apiKey.slice(0, 10) + '...' + apiKey.slice(-4)
  return NextResponse.json({ hasKey: true, maskedKey: masked })
}

// DELETE /api/user/api-key — remove the user's stored API key
export async function DELETE() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await db
    .update(users)
    .set({ encryptedApiKey: null })
    .where(eq(users.id, userId))

  return NextResponse.json({ hasKey: false })
}
