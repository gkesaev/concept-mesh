'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildCardEmbedCode, type CardTheme } from '@/lib/cards/theme'
import type { ConceptCard } from '@/types/concept'

interface CardEmbedPanelProps {
  card: Pick<ConceptCard, 'id' | 'title'>
  theme: CardTheme
  onClose: () => void
}

export function CardEmbedPanel({ card, theme, onClose }: CardEmbedPanelProps) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const embedCode = buildCardEmbedCode(card, origin, theme)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(embedCode)
      setCopied(true)
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      resetTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFailed(true)
    }
  }, [embedCode])

  return (
    <div
      role="region"
      aria-label="Embed code"
      className="mb-2 rounded-xl border border-indigo-400/30 bg-slate-950/90 p-3 text-xs text-slate-200"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-indigo-200">Iframe embed code (preview)</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-indigo-400/35 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-medium text-indigo-200 transition hover:bg-indigo-500/25"
          >
            {copied ? 'Copied!' : 'Copy code'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close embed code"
            className="rounded-md px-1.5 py-0.5 text-slate-400 transition hover:text-slate-200"
          >
            ✕
          </button>
        </div>
      </div>

      <p className="mb-2 text-[11px] text-slate-400">
        Public card embed endpoints (<code className="text-slate-300">/embed/[cardId]</code>) are
        not served yet and will go live in #21.
      </p>

      <textarea
        readOnly
        value={embedCode}
        rows={3}
        aria-label="Iframe embed HTML snippet"
        onFocus={e => e.currentTarget.select()}
        className="w-full resize-none rounded-lg border border-slate-700/80 bg-slate-900/90 p-2 font-mono text-[11px] leading-relaxed text-slate-200 focus:border-indigo-400 focus:outline-none"
      />

      {copyFailed && (
        <p role="status" className="mt-1.5 text-[11px] text-amber-300">
          Clipboard access is unavailable — select and copy the code above.
        </p>
      )}
    </div>
  )
}
