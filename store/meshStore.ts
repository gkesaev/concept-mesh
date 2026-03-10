import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { NodeChange, EdgeChange } from '@xyflow/react'
import type { ConceptNode, ConnectionEdge } from '@/types/mesh'

interface MeshState {
  nodes: ConceptNode[]
  edges: ConnectionEdge[]
  isLoading: boolean
  layoutReady: boolean

  setNodes: (nodes: ConceptNode[]) => void
  setEdges: (edges: ConnectionEdge[]) => void
  onNodesChange: (changes: NodeChange<ConceptNode>[]) => void
  onEdgesChange: (changes: EdgeChange<ConnectionEdge>[]) => void
  addNodes: (nodes: ConceptNode[]) => void
  addEdges: (edges: ConnectionEdge[]) => void
  updateNodeStatus: (id: string, status: import('@/types/mesh').ConceptNodeStatus) => void
  updateNodeData: (id: string, data: Partial<ConceptNode['data']>) => void
  setLoading: (loading: boolean) => void
  setLayoutReady: (ready: boolean) => void
}

export const useMeshStore = create<MeshState>((set) => ({
  nodes: [],
  edges: [],
  isLoading: false,
  layoutReady: false,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),

  onEdgesChange: (changes) =>
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

  addNodes: (newNodes) =>
    set((state) => ({
      nodes: [...state.nodes, ...newNodes.filter(n => !state.nodes.find(e => e.id === n.id))],
    })),

  addEdges: (newEdges) =>
    set((state) => ({
      edges: [...state.edges, ...newEdges.filter(e => !state.edges.find(ex => ex.id === e.id))],
    })),

  updateNodeStatus: (id, status) =>
    set((state) => ({
      nodes: state.nodes.map(n =>
        n.id === id ? { ...n, data: { ...n.data, status } } : n
      ),
    })),

  updateNodeData: (id, data) =>
    set((state) => ({
      nodes: state.nodes.map(n =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
    })),

  setLoading: (isLoading) => set({ isLoading }),
  setLayoutReady: (layoutReady) => set({ layoutReady }),
}))
