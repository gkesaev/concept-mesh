'use client'

import { useEffect, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMeshStore } from '@/store/meshStore'
import { useUIStore } from '@/store/uiStore'
import { ConceptNode } from './ConceptNode'
import { ConnectionEdge } from './ConnectionEdge'
import { computeLayout } from '@/lib/graph/layout'
import type { MeshData } from '@/types/concept'
import type { ConceptNode as ConceptNodeType, ConnectionEdge as ConnectionEdgeType } from '@/types/mesh'

const nodeTypes: NodeTypes = { concept: ConceptNode as NodeTypes['concept'] }
const edgeTypes: EdgeTypes = { connection: ConnectionEdge as EdgeTypes['connection'] }

function buildNodes(data: MeshData, positions: Map<string, { x: number; y: number }>): ConceptNodeType[] {
  return data.concepts.map(c => ({
    id: c.id,
    type: 'concept' as const,
    position: positions.get(c.id) ?? { x: 0, y: 0 },
    data: {
      concept: c,
      status: 'unexplored',
    },
  }))
}

function buildEdges(data: MeshData): ConnectionEdgeType[] {
  return data.connections.map(c => ({
    id: c.id,
    source: c.sourceId,
    target: c.targetId,
    type: 'connection' as const,
    data: {
      type: c.type,
      strength: c.strength,
      reason: c.reason,
      aiGenerated: c.aiGenerated,
    },
  }))
}

interface MeshCanvasProps {
  initialData: MeshData
}

export function MeshCanvas({ initialData }: MeshCanvasProps) {
  const { nodes, edges, onNodesChange, onEdgesChange, setNodes, setEdges, setLayoutReady } = useMeshStore()
  const { selectedConceptId, selectConcept } = useUIStore()

  // Initialize layout on mount
  useEffect(() => {
    const positionMap = new Map(initialData.positions.map(p => [p.conceptId, { x: p.x, y: p.y }]))

    const initialEdges = buildEdges(initialData)
    const initialNodes = buildNodes(initialData, positionMap)

    // Compute d3-force layout for nodes without positions
    const nodesNeedingLayout = initialNodes.filter(n => !positionMap.has(n.id))
    if (nodesNeedingLayout.length > 0) {
      const computedPositions = computeLayout(initialNodes, initialEdges, positionMap)
      computedPositions.forEach((pos, id) => positionMap.set(id, pos))
    }

    const positionedNodes = buildNodes(initialData, positionMap)
    setEdges(initialEdges)
    setNodes(positionedNodes)
    setLayoutReady(true)
  }, [initialData, setNodes, setEdges, setLayoutReady])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: ConceptNodeType) => {
    selectConcept(node.id)
  }, [selectConcept])

  const handlePaneClick = useCallback(() => {
    selectConcept(null)
  }, [selectConcept])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0f1e' }}>
      <ReactFlow
        nodes={nodes.map(n => ({ ...n, selected: n.id === selectedConceptId }))}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.05}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={32}
          size={1}
          color="#1e293b"
        />
        <MiniMap
          style={{
            background: 'rgba(15,23,42,0.8)',
            border: '1px solid rgba(99,102,241,0.2)',
          }}
          nodeColor={(n) => {
            const status = (n.data as { status: string }).status
            return status === 'explored' ? '#6366f1' : '#334155'
          }}
          maskColor="rgba(15,23,42,0.6)"
        />
        <Controls
          style={{
            background: 'rgba(15,23,42,0.8)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 8,
          }}
        />
      </ReactFlow>

      <style>{`
        .react-flow__controls-button {
          background: transparent !important;
          border-color: rgba(99,102,241,0.2) !important;
          color: #94a3b8 !important;
        }
        .react-flow__controls-button:hover {
          background: rgba(99,102,241,0.15) !important;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
