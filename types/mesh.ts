import type { Node, Edge } from '@xyflow/react'
import type { Concept, EdgeRelationship } from './concept'

export type ConceptNodeStatus = 'unexplored' | 'generating' | 'explored' | 'error'

export interface ConceptNodeData extends Record<string, unknown> {
  concept: Concept
  status: ConceptNodeStatus
}

export type ConceptNode = Node<ConceptNodeData, 'concept'>

export interface ConnectionEdgeData extends Record<string, unknown> {
  relationship: EdgeRelationship
  reason: string | null
  aiGenerated: boolean
}

export type ConnectionEdge = Edge<ConnectionEdgeData, 'connection'>

export interface Viewport {
  x: number
  y: number
  zoom: number
}

// Semantic zoom thresholds
export const ZOOM_CLUSTER = 0.3    // below: show domain cluster blobs only
export const ZOOM_CARD = 0.7       // below: show minimal cards (name + domain)
                                    // above: show full card detail
