'use client'

import { useEffect, useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { CardViewer } from '@/components/card/CardViewer'
import type { ConceptCard } from '@/types/concept'

// Fetch results are keyed by slug so stale results for a previously
// opened concept are never shown and no state reset is needed on close.
type FetchResult = { slug: string; card: ConceptCard | null; failed: boolean }

export function ConceptModal() {
  const { modalConcept, closeModal } = useUIStore()
  const [result, setResult] = useState<FetchResult | null>(null)

  // Fetch the concept's best card when the modal opens
  useEffect(() => {
    if (!modalConcept || modalConcept.cardCount === 0) return

    const slug = modalConcept.slug
    const controller = new AbortController()
    fetch(`/api/concepts/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((detail: { bestCard: ConceptCard | null }) => {
        setResult({ slug, card: detail.bestCard, failed: false })
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setResult({ slug, card: null, failed: true })
      })
    return () => controller.abort()
  }, [modalConcept])

  // Close with Escape
  useEffect(() => {
    if (!modalConcept) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeModal()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalConcept, closeModal])

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
        role="dialog"
        aria-modal="true"
        aria-label={modalConcept.title}
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
            onClick={closeModal}
            aria-label="Close"
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
          {modalConcept.description}
        </div>

        {/* Card */}
        {(() => {
          if (modalConcept.cardCount === 0) {
            return (
              <CardPanel>
                No card for this concept yet.
                <br />
                <span style={{ fontSize: 11, color: '#475569' }}>
                  Card generation is being rebuilt on the new multi-provider pipeline.
                </span>
              </CardPanel>
            )
          }
          if (result?.slug !== modalConcept.slug) {
            return <CardPanel>Loading card…</CardPanel>
          }
          if (result.failed) {
            return <CardPanel>Could not load the card for this concept. Try again later.</CardPanel>
          }
          if (!result.card) {
            return <CardPanel>No published card for this concept yet.</CardPanel>
          }
          return <CardViewer card={result.card} />
        })()}
      </div>
    </div>
  )
}

function CardPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '2.5rem 1.5rem',
      textAlign: 'center',
      background: 'rgba(15,23,42,0.5)',
      borderRadius: 14,
      border: '1px dashed rgba(99,102,241,0.25)',
      color: '#64748b',
      fontSize: 13,
      lineHeight: 1.7,
    }}>
      {children}
    </div>
  )
}
