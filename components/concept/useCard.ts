'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConceptCard } from '@/types/concept'
import type { PipelinePhase } from '@/lib/ai/pipeline'
import { consumeSse } from '@/lib/ai/sseClient'

export interface CardGenerationProgress {
  phase: PipelinePhase
  totalChars: number
  validationErrors: string[]
}

export interface UseCardResult {
  card: ConceptCard | null
  loading: boolean
  loadError: string | null
  generating: boolean
  progress: CardGenerationProgress | null
  generateError: string | null
  generate: () => Promise<void>
  cancel: () => void
  /** Mark the current draft card as rendered after the iframe handshakes. */
  markRendered: (cardId: string) => Promise<void>
  refresh: () => Promise<void>
}

const INITIAL_PROGRESS: CardGenerationProgress = {
  phase: 'planning',
  totalChars: 0,
  validationErrors: [],
}

export function useCard(slug: string | null): UseCardResult {
  const [card, setCard] = useState<ConceptCard | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<CardGenerationProgress | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/concepts/${encodeURIComponent(slug)}/cards?best=1`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load card (HTTP ${res.status})`)
      const data = (await res.json()) as { card: ConceptCard | null }
      setCard(data.card ?? null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load card')
    } finally {
      setLoading(false)
    }
  }, [slug])

  // Reset state and load whenever the slug changes.
  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setCard(null)
    setProgress(null)
    setGenerateError(null)
    setGenerating(false)
    if (slug) void refresh()
  }, [slug, refresh])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setGenerating(false)
  }, [])

  const generate = useCallback(async () => {
    if (!slug) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setGenerating(true)
    setGenerateError(null)
    setProgress({ ...INITIAL_PROGRESS })

    try {
      await consumeSse(
        `/api/concepts/${encodeURIComponent(slug)}/generate`,
        { method: 'POST', signal: controller.signal },
        {
          onEvent: (event, data) => {
            switch (event) {
              case 'progress': {
                const phase = (data as { phase?: PipelinePhase })?.phase
                if (phase) setProgress(p => ({ ...(p ?? INITIAL_PROGRESS), phase }))
                break
              }
              case 'token': {
                const totalChars = (data as { totalChars?: number })?.totalChars ?? 0
                setProgress(p => ({ ...(p ?? INITIAL_PROGRESS), totalChars }))
                break
              }
              case 'validation': {
                const errors = (data as { errors?: string[] })?.errors ?? []
                setProgress(p => ({ ...(p ?? INITIAL_PROGRESS), validationErrors: errors }))
                break
              }
              case 'card': {
                const next = data as Partial<ConceptCard> & { id?: string; html?: string }
                if (next?.id && next?.html) {
                  setCard(prev => ({
                    ...(prev ?? ({} as ConceptCard)),
                    ...next,
                  } as ConceptCard))
                }
                break
              }
              case 'error': {
                const message = (data as { error?: string })?.error ?? 'Generation failed'
                setGenerateError(message)
                break
              }
            }
          },
          onError: (err) => {
            if (err.name === 'AbortError') return
            setGenerateError(err.message)
          },
        },
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setGenerateError(err instanceof Error ? err.message : 'Generation failed')
      }
    } finally {
      setGenerating(false)
      abortRef.current = null
      // Re-fetch to surface server-canonical fields (status, validation flags).
      void refresh()
    }
  }, [slug, refresh])

  const markRendered = useCallback(async (cardId: string) => {
    if (!slug) return
    try {
      await fetch(`/api/concepts/${encodeURIComponent(slug)}/cards`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, action: 'mark-rendered' }),
      })
    } catch {
      // Soft failure — the card still works in the UI; status will catch up
      // on the next refresh.
    }
  }, [slug])

  return {
    card,
    loading,
    loadError,
    generating,
    progress,
    generateError,
    generate,
    cancel,
    markRendered,
    refresh,
  }
}
