'use client'

import { memo } from 'react'
import { getStraightPath, BaseEdge, EdgeLabelRenderer } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import type { ConnectionEdge as ConnectionEdgeType } from '@/types/mesh'

export const ConnectionEdge = memo(function ConnectionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<ConnectionEdgeType>) {
  const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })

  const edgeData = data as ConnectionEdgeType['data'] | undefined
  const aiGenerated = edgeData?.aiGenerated ?? false
  const reason = edgeData?.reason

  const strokeColor = aiGenerated ? '#a855f7' : '#6366f1'
  const strokeWidth = 2
  const opacity = selected ? 0.9 : 0.5

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          opacity,
          strokeDasharray: aiGenerated ? '4 3' : undefined,
          filter: selected ? `drop-shadow(0 0 4px ${strokeColor})` : undefined,
        }}
      />
      {selected && reason && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 10,
              color: '#cbd5e1',
              background: 'rgba(15,23,42,0.9)',
              padding: '4px 8px',
              borderRadius: 6,
              border: `1px solid ${strokeColor}44`,
              maxWidth: 180,
              textAlign: 'center',
              lineHeight: 1.4,
              pointerEvents: 'none',
            }}
          >
            {reason}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
