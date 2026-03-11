import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { concepts, connections } from '@/lib/db/schema'
import { serendipityPrompt } from '@/lib/ai/prompts'
import { getAnthropicClient, MODEL } from '@/lib/ai/client'
import type Anthropic from '@anthropic-ai/sdk'

// GET /api/serendipity — find an unexpected connection between two unconnected concepts
export async function GET() {
  try {
    // Get two random concepts that have no direct connection between them
    const allConcepts = await db.select({
      id: concepts.id,
      name: concepts.name,
      domain: concepts.domain,
    }).from(concepts)

    if (allConcepts.length < 2) {
      return NextResponse.json({ connected: false, reason: 'Not enough concepts yet' })
    }

    // Get all existing connections to filter out already-connected pairs
    const allConnections = await db.select({
      sourceId: connections.sourceId,
      targetId: connections.targetId,
    }).from(connections)

    const connectedPairs = new Set(
      allConnections.flatMap(c => [`${c.sourceId}:${c.targetId}`, `${c.targetId}:${c.sourceId}`])
    )

    const client = await getAnthropicClient()

    // Find unconnected pairs (try up to 10 random pairs)
    for (let attempt = 0; attempt < 10; attempt++) {
      const idx1 = Math.floor(Math.random() * allConcepts.length)
      let idx2 = Math.floor(Math.random() * (allConcepts.length - 1))
      if (idx2 >= idx1) idx2++

      const c1 = allConcepts[idx1]
      const c2 = allConcepts[idx2]

      if (connectedPairs.has(`${c1.id}:${c2.id}`)) continue

      // Ask Claude to find a connection
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content: serendipityPrompt(c1.name, c1.domain, c2.name, c2.domain) }],
      })

      const raw = (response.content[0] as Anthropic.TextBlock).text
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) continue

      const result = JSON.parse(match[0])

      if (result.connected && result.reason) {
        // Store the connection
        await db.insert(connections).values({
          sourceId: c1.id,
          targetId: c2.id,
          type: 'related',
          strength: result.strength ?? 0.5,
          aiGenerated: true,
          reason: result.reason,
        }).onConflictDoNothing()

        return NextResponse.json({
          connected: true,
          source: c1,
          target: c2,
          reason: result.reason,
          strength: result.strength ?? 0.5,
        })
      }
    }

    return NextResponse.json({ connected: false })
  } catch (error) {
    console.error('GET /api/serendipity error:', error)
    return NextResponse.json({ error: 'Serendipity check failed' }, { status: 500 })
  }
}
