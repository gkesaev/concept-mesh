import * as d3 from 'd3-force'
import type { ConceptNode, ConnectionEdge } from '@/types/mesh'

interface LayoutNode {
  id: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
  domain: string
}

interface LayoutLink {
  source: string
  target: string
  strength: number
}

const DOMAIN_ANGLES: Record<string, number> = {
  'Computer Science': 0,
  'Mathematics':      Math.PI / 2,
  'Physics':          Math.PI,
  'Chemistry':        (3 * Math.PI) / 2,
  'Biology':          Math.PI / 4,
  'Economics':        (3 * Math.PI) / 4,
  'Philosophy':       (5 * Math.PI) / 4,
}

const DOMAIN_RADIUS = 500
const LINK_STRENGTH = 0.3

function getDomainCenter(domain: string): { x: number; y: number } {
  const angle = DOMAIN_ANGLES[domain] ?? Math.random() * Math.PI * 2
  return {
    x: Math.cos(angle) * DOMAIN_RADIUS,
    y: Math.sin(angle) * DOMAIN_RADIUS,
  }
}

export function computeLayout(
  nodes: ConceptNode[],
  edges: ConnectionEdge[],
  existingPositions: Map<string, { x: number; y: number }>
): Map<string, { x: number; y: number }> {
  if (nodes.length === 0) return new Map()

  const layoutNodes: LayoutNode[] = nodes.map(n => {
    const existing = existingPositions.get(n.id)
    const center = getDomainCenter(n.data.concept.domain)
    return {
      id: n.id,
      x: existing?.x ?? center.x + (Math.random() - 0.5) * 200,
      y: existing?.y ?? center.y + (Math.random() - 0.5) * 200,
      domain: n.data.concept.domain,
      // Pin nodes that already have persisted positions
      fx: existing ? existing.x : null,
      fy: existing ? existing.y : null,
    }
  })

  // Unpin after initial placement so new nodes can settle
  const unpinnedNodes = layoutNodes.map(n => ({ ...n, fx: null, fy: null }))

  const layoutLinks: LayoutLink[] = edges.map(e => ({
    source: e.source,
    target: e.target,
    strength: LINK_STRENGTH,
  }))

  const simulation = d3.forceSimulation(unpinnedNodes as d3.SimulationNodeDatum[])
    .force('link', d3.forceLink(layoutLinks)
      .id((d: d3.SimulationNodeDatum) => (d as LayoutNode).id)
      .distance(180)
      .strength((l: d3.SimulationLinkDatum<d3.SimulationNodeDatum>) => (l as LayoutLink).strength)
    )
    .force('charge', d3.forceManyBody().strength(-400))
    .force('collision', d3.forceCollide(100))
    .force('center', d3.forceCenter(0, 0).strength(0.05))
    .stop()

  // Run simulation synchronously
  simulation.tick(300)

  const positions = new Map<string, { x: number; y: number }>()
  unpinnedNodes.forEach(n => {
    if (n.x !== undefined && n.y !== undefined) {
      positions.set(n.id, { x: n.x, y: n.y })
    }
  })

  return positions
}
