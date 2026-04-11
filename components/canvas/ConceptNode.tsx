'use client'

import { memo, useCallback } from 'react'
import { Handle, Position, useStore } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { ConceptNode as ConceptNodeType, ConceptNodeStatus } from '@/types/mesh'
import { ZOOM_CARD, ZOOM_CLUSTER } from '@/types/mesh'
import { useUIStore } from '@/store/uiStore'

const DOMAIN_COLORS: Record<string, string> = {
  'Computer Science': '#6366f1',
  'Mathematics':      '#a855f7',
  'Physics':          '#3b82f6',
  'Chemistry':        '#10b981',
  'Biology':          '#22c55e',
  'Economics':        '#f59e0b',
  'Philosophy':       '#ec4899',
}

function getDomainColor(domain: string): string {
  return DOMAIN_COLORS[domain] ?? '#64748b'
}

const STATUS_STYLES = {
  unexplored: { border: 'rgba(99,102,241,0.2)', glow: 'none', opacity: 0.7 },
  generating: { border: 'rgba(99,102,241,0.6)', glow: '0 0 20px rgba(99,102,241,0.4)', opacity: 1 },
  explored:   { border: 'rgba(99,102,241,0.5)', glow: '0 0 12px rgba(99,102,241,0.25)', opacity: 1 },
  error:      { border: 'rgba(239,68,68,0.4)',  glow: 'none', opacity: 0.8 },
}

export const ConceptNode = memo(function ConceptNode({ data, selected }: NodeProps<ConceptNodeType>) {
  const zoom = useStore(s => s.transform[2])
  const { concept, status } = data as { concept: ConceptNodeType['data']['concept'], status: ConceptNodeStatus }
  const openModal = useUIStore(s => s.openModal)
  const selectConcept = useUIStore(s => s.selectConcept)

  const domainColor = getDomainColor(concept.domain)
  const style = STATUS_STYLES[status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.unexplored

  const handleClick = useCallback(() => {
    selectConcept(concept.slug)
    openModal(concept)
  }, [concept, openModal, selectConcept])

  // Cluster view — tiny dot
  if (zoom < ZOOM_CLUSTER) {
    return (
      <>
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <div style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: domainColor,
          opacity: style.opacity,
          boxShadow: style.glow,
        }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </>
    )
  }

  // Minimal card — name + domain badge only
  if (zoom < ZOOM_CARD) {
    return (
      <>
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <div
          onClick={handleClick}
          style={{
            padding: '8px 12px',
            background: 'rgba(15,23,42,0.9)',
            borderRadius: 10,
            border: `1px solid ${selected ? domainColor : style.border}`,
            boxShadow: selected ? `0 0 16px ${domainColor}66` : style.glow,
            cursor: 'pointer',
            minWidth: 120,
            opacity: style.opacity,
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>
            {concept.title}
          </div>
          <div style={{
            fontSize: 10,
            color: domainColor,
            background: `${domainColor}22`,
            padding: '1px 6px',
            borderRadius: 4,
            display: 'inline-block',
          }}>
            {concept.domain}
          </div>
        </div>
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </>
    )
  }

  // Full card
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        onClick={handleClick}
        style={{
          padding: '14px 16px',
          background: 'rgba(15,23,42,0.95)',
          backdropFilter: 'blur(8px)',
          borderRadius: 14,
          border: `1px solid ${selected ? domainColor : style.border}`,
          boxShadow: selected ? `0 0 24px ${domainColor}55` : style.glow,
          cursor: 'pointer',
          width: 220,
          opacity: style.opacity,
          transition: 'all 0.2s',
          position: 'relative',
        }}
      >
        {/* Status indicator dot */}
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: status === 'explored' ? '#10b981'
            : status === 'generating' ? '#f59e0b'
            : status === 'error' ? '#ef4444'
            : '#475569',
          boxShadow: status === 'generating' ? '0 0 6px #f59e0b' : 'none',
          animation: status === 'generating' ? 'pulse 1s ease-in-out infinite' : 'none',
        }} />

        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 6, paddingRight: 16 }}>
          {concept.title}
        </div>

        <div style={{
          fontSize: 10,
          color: domainColor,
          background: `${domainColor}22`,
          padding: '2px 7px',
          borderRadius: 4,
          display: 'inline-block',
          marginBottom: 8,
        }}>
          {concept.domain}
        </div>

        {concept.description && (
          <div style={{
            fontSize: 11,
            color: '#94a3b8',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {concept.description}
          </div>
        )}

        {status === 'unexplored' && (
          <div style={{
            marginTop: 8,
            fontSize: 10,
            color: '#475569',
            textAlign: 'center',
          }}>
            click to open
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  )
})
