'use client'

import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useMeshStore } from '@/store/meshStore'
import { VizRenderer } from '@/components/visualization/VizRenderer'
import type { Visualization } from '@/types/concept'

export function ConceptModal() {
  const { modalConcept, closeModal } = useUIStore()
  const { updateNodeStatus, updateNodeData } = useMeshStore()
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState('')
  const [activeViz, setActiveViz] = useState<Visualization | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const [showPlan, setShowPlan] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!modalConcept) return

    if (modalConcept.visualization) {
      setActiveViz(modalConcept.visualization)
      setGenerationStatus('done')
    } else {
      // Trigger generation
      startGeneration(modalConcept.id)
    }

    return () => {
      eventSourceRef.current?.close()
    }
  }, [modalConcept?.id])

  function startGeneration(conceptId: string) {
    setGenerationStatus('generating')
    setProgress('Starting...')
    updateNodeStatus(conceptId, 'generating')

    // Use fetch with ReadableStream for SSE
    const ctrl = new AbortController()

    fetch(`/api/concepts/${conceptId}/generate`, {
      method: 'POST',
      signal: ctrl.signal,
    }).then(async (res) => {
      const reader = res.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const event = JSON.parse(line.slice(6))

          if (event.type === 'progress') setProgress(event.message)
          if (event.type === 'plan') setPlan(event.plan)
          if (event.type === 'done') {
            setActiveViz(event.visualization)
            setGenerationStatus('done')
            updateNodeStatus(conceptId, 'explored')
            updateNodeData(conceptId, { visualization: event.visualization, status: 'explored' })
          }
          if (event.type === 'error') {
            setGenerationStatus('error')
            setProgress(event.message)
            updateNodeStatus(conceptId, 'error')
          }
        }
      }
    }).catch(err => {
      if (err.name !== 'AbortError') {
        setGenerationStatus('error')
        setProgress(err.message)
      }
    })

    return () => ctrl.abort()
  }

  if (!modalConcept) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={closeModal}
    >
      {/* Backdrop */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }} />

      {/* Modal */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          zIndex: 1,
          background: 'rgba(15,23,42,0.97)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 20,
          padding: '1.75rem',
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 0 60px rgba(99,102,241,0.15)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', margin: 0, marginBottom: 4 }}>
              {modalConcept.name}
            </h2>
            <span style={{
              fontSize: 11,
              color: '#6366f1',
              background: 'rgba(99,102,241,0.15)',
              padding: '2px 8px',
              borderRadius: 4,
            }}>
              {modalConcept.domain}
            </span>
          </div>
          <button
            onClick={closeModal}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '4px',
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Explanation */}
        <div style={{
          padding: '0.875rem 1rem',
          background: 'rgba(99,102,241,0.08)',
          borderLeft: '3px solid #6366f1',
          borderRadius: '0 8px 8px 0',
          marginBottom: '1.5rem',
          fontSize: 13,
          color: '#cbd5e1',
          lineHeight: 1.7,
        }}>
          {modalConcept.explanation}
        </div>

        {/* Visualization area */}
        {generationStatus === 'generating' && (
          <div style={{
            padding: '3rem',
            textAlign: 'center',
            background: 'rgba(15,23,42,0.5)',
            borderRadius: 14,
            border: '1px solid rgba(99,102,241,0.15)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⚡</div>
            <div style={{ fontWeight: 600, color: '#c7d2fe', marginBottom: 6 }}>
              Generating Visualization
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{progress}</div>
          </div>
        )}

        {generationStatus === 'error' && (
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            background: 'rgba(239,68,68,0.08)',
            borderRadius: 14,
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#fca5a5',
          }}>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>Generation failed</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{progress}</div>
            <button
              onClick={() => startGeneration(modalConcept.id)}
              style={{
                marginTop: 12,
                padding: '6px 16px',
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                color: '#fca5a5',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {activeViz && generationStatus === 'done' && (
          <>
            <VizRenderer code={activeViz.code} />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button
                onClick={() => {
                  setActiveViz(null)
                  setGenerationStatus('idle')
                  setPlan(null)
                  startGeneration(modalConcept.id)
                }}
                style={{
                  padding: '6px 14px',
                  background: 'rgba(99,102,241,0.1)',
                  border: '1px solid rgba(99,102,241,0.25)',
                  borderRadius: 8,
                  color: '#a5b4fc',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                ↻ Regenerate
              </button>

              {plan && (
                <button
                  onClick={() => setShowPlan(p => !p)}
                  style={{
                    padding: '6px 14px',
                    background: 'transparent',
                    border: '1px solid rgba(71,85,105,0.4)',
                    borderRadius: 8,
                    color: '#64748b',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {showPlan ? 'Hide' : 'Show'} AI plan
                </button>
              )}
            </div>

            {showPlan && plan && (
              <pre style={{
                marginTop: '1rem',
                padding: '1rem',
                background: 'rgba(15,23,42,0.6)',
                borderRadius: 10,
                fontSize: 10,
                color: '#64748b',
                overflowX: 'auto',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                {plan}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  )
}
