'use client'

import { useEffect } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useMeshStore } from '@/store/meshStore'
import { VizRenderer } from '@/components/visualization/VizRenderer'
import { VizPlaceholder } from '@/components/visualization/VizPlaceholder'
import { VizErrorBoundary } from '@/components/visualization/VizError'
import { useCard } from './useCard'

export function ConceptModal() {
  const modalConcept = useUIStore(s => s.modalConcept)
  const closeModal = useUIStore(s => s.closeModal)
  const updateNodeStatus = useMeshStore(s => s.updateNodeStatus)

  const slug = modalConcept?.slug ?? null
  const {
    card, loading, loadError,
    generating, progress, generateError,
    generate, cancel, markRendered,
  } = useCard(slug)

  // Reflect generation status on the canvas node so the user can see the dot
  // change while the modal is open.
  useEffect(() => {
    if (!slug) return
    if (generating) updateNodeStatus(slug, 'generating')
    else if (card) updateNodeStatus(slug, 'explored')
    else if (generateError || loadError) updateNodeStatus(slug, 'error')
  }, [slug, generating, card, generateError, loadError, updateNodeStatus])

  // Close on Escape.
  useEffect(() => {
    if (!modalConcept) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancel()
        closeModal()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalConcept, closeModal, cancel])

  if (!modalConcept) return null

  const handleClose = () => {
    cancel()
    closeModal()
  }

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
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label={modalConcept.title}
    >
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }} />

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
          maxWidth: 820,
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 0 60px rgba(99,102,241,0.15)',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', margin: 0, marginBottom: 4 }}>
              {modalConcept.title}
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
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: 4,
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </header>

        <div style={{
          padding: '0.875rem 1rem',
          background: 'rgba(99,102,241,0.08)',
          borderLeft: '3px solid #6366f1',
          borderRadius: '0 8px 8px 0',
          marginBottom: '1.25rem',
          fontSize: 13,
          color: '#cbd5e1',
          lineHeight: 1.7,
        }}>
          {modalConcept.description}
        </div>

        <CardArea
          loading={loading}
          loadError={loadError}
          generating={generating}
          generateError={generateError}
          progressPhase={progress?.phase}
          progressChars={progress?.totalChars ?? 0}
          validationErrors={progress?.validationErrors ?? []}
          html={card?.html ?? null}
          cardId={card?.id}
          status={card?.status ?? null}
          onGenerate={generate}
          onMarkRendered={markRendered}
        />
      </div>
    </div>
  )
}

interface CardAreaProps {
  loading: boolean
  loadError: string | null
  generating: boolean
  generateError: string | null
  progressPhase: import('@/lib/ai/pipeline').PipelinePhase | undefined
  progressChars: number
  validationErrors: string[]
  html: string | null
  cardId?: string
  status: string | null
  onGenerate: () => void | Promise<void>
  onMarkRendered: (cardId: string) => Promise<void>
}

function CardArea(props: CardAreaProps) {
  const {
    loading, loadError, generating, generateError, progressPhase, progressChars,
    validationErrors, html, cardId, status, onGenerate, onMarkRendered,
  } = props

  if (loading && !html) {
    return <VizPlaceholder state="generating" message="Loading card…" />
  }

  if (generating && !html) {
    return (
      <div>
        <VizPlaceholder state="generating" phase={progressPhase} progressChars={progressChars} />
        {validationErrors.length > 0 && <ValidationNotice errors={validationErrors} />}
      </div>
    )
  }

  if (!html) {
    return (
      <div>
        <VizPlaceholder state="empty" onGenerate={onGenerate} />
        {generateError && <ErrorNotice message={generateError} onRetry={onGenerate} />}
        {loadError && <ErrorNotice message={loadError} />}
      </div>
    )
  }

  return (
    <div>
      <VizErrorBoundary onRetry={onGenerate}>
        <VizRenderer
          html={html}
          cardId={cardId}
          onReady={(id) => { if (id) void onMarkRendered(id) }}
        />
      </VizErrorBoundary>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {status ? `status: ${status}` : null}
          {generating ? ' · regenerating…' : null}
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid rgba(99,102,241,0.4)',
            background: generating ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.18)',
            color: '#c7d2fe',
            fontSize: 12,
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.7 : 1,
          }}
        >
          {generating ? `Generating… ${progressPhase ?? ''}` : 'Regenerate'}
        </button>
      </div>

      {generateError && <ErrorNotice message={generateError} onRetry={onGenerate} />}
    </div>
  )
}

function ValidationNotice({ errors }: { errors: string[] }) {
  return (
    <div style={{
      marginTop: 10,
      padding: '8px 12px',
      borderRadius: 8,
      background: 'rgba(245,158,11,0.1)',
      border: '1px solid rgba(245,158,11,0.3)',
      color: '#fde68a',
      fontSize: 12,
      lineHeight: 1.5,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Validation issues — fixing…</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {errors.slice(0, 4).map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    </div>
  )
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void | Promise<void> }) {
  return (
    <div style={{
      marginTop: 10,
      padding: '8px 12px',
      borderRadius: 8,
      background: 'rgba(76,5,25,0.45)',
      border: '1px solid rgba(248,113,113,0.4)',
      color: '#fecaca',
      fontSize: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      <div>{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={() => { void onRetry() }}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid rgba(248,113,113,0.5)',
            background: 'transparent',
            color: '#fecaca',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
    </div>
  )
}
