import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts, connections } from '@/lib/db/schema'
import { expandConceptPrompt } from '@/lib/ai/prompts'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'

type Params = { params: Promise<{ id: string }> }

function sseMessage(event: object): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

// POST /api/concepts/[id]/expand — generate sub-concepts branching from this concept
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(new TextEncoder().encode(sseMessage(event)))

      try {
        const concept = await db.query.concepts.findFirst({
          where: (c, { eq }) => eq(c.id, id),
        })

        if (!concept) {
          send({ type: 'error', message: 'Concept not found' })
          controller.close()
          return
        }

        send({ type: 'progress', message: 'Discovering related concepts...' })

        // Get existing concept IDs to avoid duplicates
        const existing = await db.select({ id: concepts.id }).from(concepts)
        const existingIds = existing.map(c => c.id)

        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: expandConceptPrompt(concept.id, concept.name, concept.domain, concept.explanation, existingIds),
          }],
        })

        const raw = (response.content[0] as Anthropic.TextBlock).text
        const match = raw.match(/\[[\s\S]*\]/)
        if (!match) throw new Error('Failed to parse expansion response')

        const newConcepts: Array<{
          id: string
          name: string
          domain: string
          explanation: string
          difficulty: string
          connectionReason: string
        }> = JSON.parse(match[0])

        const created = []
        for (const nc of newConcepts) {
          if (existingIds.includes(nc.id)) {
            // Concept exists — just ensure connection
            await db.insert(connections).values({
              sourceId: id,
              targetId: nc.id,
              type: 'related',
              strength: 0.8,
              aiGenerated: true,
              reason: nc.connectionReason,
            }).onConflictDoNothing()

            created.push({ id: nc.id, existing: true })
            continue
          }

          const [inserted] = await db.insert(concepts).values({
            id: nc.id,
            name: nc.name,
            domain: nc.domain,
            explanation: nc.explanation,
            difficulty: nc.difficulty ?? null,
            metadata: {},
          }).onConflictDoNothing().returning()

          if (inserted) {
            await db.insert(connections).values({
              sourceId: id,
              targetId: nc.id,
              type: 'related',
              strength: 0.8,
              aiGenerated: true,
              reason: nc.connectionReason,
            }).onConflictDoNothing()

            created.push({ concept: inserted, existing: false })
            send({ type: 'concept_added', concept: inserted, reason: nc.connectionReason })
          }
        }

        send({ type: 'done', count: created.length })
      } catch (err) {
        console.error(`Expand failed for ${id}:`, err)
        send({ type: 'error', message: (err as Error).message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
