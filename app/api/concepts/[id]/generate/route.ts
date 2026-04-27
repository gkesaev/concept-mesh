import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { and, eq, desc, max, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { concepts, conceptCards } from '@/lib/db/schema'
import { auth } from '@/lib/auth'
import { getAnthropicClient, MODEL } from '@/lib/ai/client'
import { runCardPipeline } from '@/lib/ai/pipeline'

type Params = { params: Promise<{ id: string }> }

export const runtime = 'nodejs'
// Pipeline budget: plan + generate + (optional) fix. Keep below platform limits.
export const maxDuration = 90

// POST /api/concepts/[slug]/generate — streams Server-Sent Events for the
// multi-shot card generation pipeline. Each chunk is a discrete event:
//   event: progress | plan | token | validation | card | error | done
//   data:  <JSON payload>
export async function POST(req: NextRequest, { params }: Params) {
  const { id: slug } = await params

  const concept = await db.query.concepts.findFirst({
    where: (c, { eq }) => eq(c.slug, slug),
    columns: { slug: true, title: true, domain: true, description: true },
  })
  if (!concept) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let client
  try {
    client = await getAnthropicClient()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No API key configured'
    return NextResponse.json({ error: message, code: 'NO_API_KEY' }, { status: 401 })
  }

  const session = await auth()
  const authorId = session?.user?.id ?? null

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, payload: unknown) => {
        const data = JSON.stringify(payload)
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
      }

      const abort = new AbortController()
      const onClose = () => abort.abort()
      // Forward client disconnects to the pipeline.
      req.signal.addEventListener('abort', onClose, { once: true })

      try {
        let savedCard: { id: string; version: number } | null = null

        for await (const ev of runCardPipeline({
          client,
          concept,
          signal: abort.signal,
        })) {
          switch (ev.type) {
            case 'phase':
              send('progress', { phase: ev.phase, message: ev.message })
              break
            case 'plan':
              send('plan', ev.plan)
              break
            case 'token':
              // Coarse-grained heartbeat so clients see progress without
              // shipping every delta over the wire.
              send('token', { phase: ev.phase, totalChars: ev.totalChars })
              break
            case 'validation':
              send('validation', { ok: ev.result.ok, errors: ev.result.errors, willRetry: ev.willRetry })
              break
            case 'card': {
              savedCard = await saveCard({
                slug: concept.slug,
                title: concept.title,
                domain: concept.domain,
                description: concept.description,
                html: ev.html,
                modelId: ev.modelId,
                generationPrompt: ev.plan.insight,
                authorId,
                hasInteractivity: ev.validation.hasInteractivity,
              })
              send('card', {
                id: savedCard.id,
                version: savedCard.version,
                slug: concept.slug,
                html: ev.html,
                plan: ev.plan,
                generatedWith: ev.modelId,
                hasInteractivity: ev.validation.hasInteractivity,
              })
              break
            }
            case 'error':
              send('error', { error: ev.message })
              break
          }
        }

        send('done', { cardId: savedCard?.id ?? null })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Pipeline failed'
        console.error(`POST /api/concepts/${slug}/generate error:`, err)
        send('error', { error: message })
        send('done', { cardId: null })
      } finally {
        req.signal.removeEventListener('abort', onClose)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

interface SaveCardArgs {
  slug: string
  title: string
  domain: string
  description: string
  html: string
  modelId: string
  generationPrompt: string
  authorId: string | null
  hasInteractivity: boolean
}

async function saveCard(args: SaveCardArgs): Promise<{ id: string; version: number }> {
  // We bump the version per slug so concurrent generations don't collide on
  // (slug, version) — the unique constraint is the safety net.
  return await db.transaction(async (tx) => {
    const [{ maxVersion }] = await tx
      .select({ maxVersion: max(conceptCards.version) })
      .from(conceptCards)
      .where(eq(conceptCards.slug, args.slug))

    const nextVersion = (maxVersion ?? 0) + 1

    const [inserted] = await tx
      .insert(conceptCards)
      .values({
        slug: args.slug,
        version: nextVersion,
        title: args.title,
        domain: args.domain,
        description: args.description,
        html: args.html,
        status: 'draft',
        validationHasInteractivity: args.hasInteractivity,
        validationRenders: null,
        authorId: args.authorId,
        generatedWith: args.modelId ?? MODEL,
        generationPrompt: args.generationPrompt,
      })
      .returning({ id: conceptCards.id, version: conceptCards.version })

    // Promote to best card if the concept has none yet.
    await tx
      .update(concepts)
      .set({ bestCardId: inserted.id })
      .where(and(eq(concepts.slug, args.slug), isNull(concepts.bestCardId)))

    await tx
      .update(concepts)
      .set({ cardCount: nextVersion, updatedAt: new Date() })
      .where(eq(concepts.slug, args.slug))

    return inserted
  })
}

// Cleaner GET: keep the latest card list for clients that prefer to poll.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: slug } = await params
  try {
    const cards = await db
      .select({
        id: conceptCards.id,
        version: conceptCards.version,
        status: conceptCards.status,
        createdAt: conceptCards.createdAt,
      })
      .from(conceptCards)
      .where(eq(conceptCards.slug, slug))
      .orderBy(desc(conceptCards.version))
      .limit(20)
    return NextResponse.json({ cards })
  } catch (err) {
    console.error(`GET /api/concepts/${slug}/generate error:`, err)
    return NextResponse.json({ error: 'Failed to list cards' }, { status: 500 })
  }
}
