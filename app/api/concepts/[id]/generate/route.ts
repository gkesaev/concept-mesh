import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts, visualizations } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { generateVisualizationPipeline } from '@/lib/ai/pipeline'
import { metadataPrompt } from '@/lib/ai/prompts'
import { getAnthropicClient, MODEL } from '@/lib/ai/client'
import type Anthropic from '@anthropic-ai/sdk'

type Params = { params: Promise<{ id: string }> }

function sseMessage(event: object): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

// POST /api/concepts/[id]/generate — trigger AI visualization generation
// Streams progress via SSE
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(new TextEncoder().encode(sseMessage(event)))

      try {
        const client = await getAnthropicClient()

        // Get or create concept metadata
        let concept = await db.query.concepts.findFirst({
          where: (c, { eq }) => eq(c.id, id),
        })

        if (!concept) {
          send({ type: 'progress', message: 'Analyzing concept...' })

          const metaResponse = await client.messages.create({
            model: MODEL,
            max_tokens: 800,
            messages: [{ role: 'user', content: metadataPrompt(id) }],
          })

          const rawText = (metaResponse.content[0] as Anthropic.TextBlock).text
          const match = rawText.match(/\{[\s\S]*\}/)
          if (!match) throw new Error('Failed to parse concept metadata')

          const metadata = JSON.parse(match[0])
          const [created] = await db.insert(concepts).values({
            id,
            name: metadata.name,
            domain: metadata.domain,
            explanation: metadata.explanation,
            difficulty: metadata.difficulty ?? null,
            metadata: {},
          }).onConflictDoNothing().returning()

          concept = created ?? await db.query.concepts.findFirst({ where: (c, { eq }) => eq(c.id, id) })
          if (!concept) throw new Error('Failed to create concept')
        }

        // Mark existing visualizations inactive
        await db
          .update(visualizations)
          .set({ isActive: false })
          .where(and(eq(visualizations.conceptId, id), eq(visualizations.isActive, true)))

        // Run the pipeline
        for await (const event of generateVisualizationPipeline(
          concept.id,
          concept.name,
          concept.domain,
          concept.explanation,
          client
        )) {
          if (event.type === 'error') {
            send(event)
            controller.close()
            return
          }

          if (event.type === 'code') {
            // Save to DB
            const [viz] = await db.insert(visualizations).values({
              conceptId: id,
              code: event.code,
              plan: event.plan,
              isActive: true,
            }).returning()

            send({ type: 'done', visualization: viz, concept })
          } else {
            send(event)
          }
        }
      } catch (err) {
        console.error(`Generation failed for ${id}:`, err)
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
