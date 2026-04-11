export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export type EdgeRelationship = 'related' | 'prerequisite' | 'application' | 'contrast' | 'analogy'

export type CardStatus = 'draft' | 'validating' | 'published' | 'flagged'

export interface Concept {
  slug: string
  title: string
  domain: string
  description: string
  bestCardId: string | null
  cardCount: number
  createdAt: Date
  updatedAt: Date
}

export interface ConceptCard {
  id: string
  slug: string
  version: number
  title: string
  domain: string
  description: string
  tags: string[]
  difficulty: Difficulty | null
  html: string
  thumbnail: string | null
  interactivityLevel: number
  status: CardStatus
  validationRenders: boolean | null
  validationHasInteractivity: boolean | null
  validationScreenshotHash: string | null
  authorId: string | null
  generatedWith: string | null
  generationPrompt: string | null
  parentCardId: string | null
  createdAt: Date
  updatedAt: Date
  upvotes: number
  views: number
  embedCount: number
}

export interface ConceptEdge {
  id: string
  sourceSlug: string
  targetSlug: string
  relationship: EdgeRelationship
  reason: string | null
  aiGenerated: boolean
  createdAt: Date
}

export interface NodePosition {
  conceptSlug: string
  x: number
  y: number
  updatedAt: Date
}

export interface MeshData {
  concepts: Concept[]
  edges: ConceptEdge[]
  positions: NodePosition[]
}
