export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export type ConnectionType = 'related' // extensible: 'prerequisite' | 'application' | 'contrast' | 'analogy'

export interface Concept {
  id: string
  name: string
  domain: string
  explanation: string
  difficulty: Difficulty | null
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface Connection {
  id: string
  sourceId: string
  targetId: string
  type: ConnectionType
  strength: number
  aiGenerated: boolean
  reason: string | null
  createdAt: Date
}

export interface Visualization {
  id: string
  conceptId: string
  code: string
  plan: string | null
  version: number
  isActive: boolean
  createdAt: Date
}

export interface NodePosition {
  conceptId: string
  x: number
  y: number
  updatedAt: Date
}

export interface ConceptWithVisualization extends Concept {
  visualization: Visualization | null
}

export interface MeshData {
  concepts: ConceptWithVisualization[]
  connections: Connection[]
  positions: NodePosition[]
}
