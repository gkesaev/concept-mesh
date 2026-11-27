'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CardEmbedPanel } from '@/components/card/CardEmbedPanel'
import { CardErrorBoundary } from '@/components/card/CardErrorBoundary'
import { CARD_THEMES, injectCardTheme, type CardTheme } from '@/lib/cards/theme'
import type { ConceptCard } from '@/types/concept'

const LOAD_TIMEOUT_MS = 10000
const MIN_RESIZE_HEIGHT = 260
const MAX_RESIZE_HEIGHT = 1000

export interface CardViewerProps {
  card: ConceptCard
  theme?: CardTheme
  className?: string
}

export function CardViewer({ card, theme = 'dark', className }: CardViewerProps) {
  const [retryCount, setRetryCount] = useState(0)
  const frameKey = `${card.id}:${card.version}:${theme}:${retryCount}`

  return (
    <CardErrorBoundary resetKey={frameKey}>
      <CardViewerFrame
        key={frameKey}
        card={card}
        theme={theme}
        className={className}
        onRetry={() => setRetryCount(c => c + 1)}
      />
    </CardErrorBoundary>
  )
}

interface CardViewerFrameProps {
  card: ConceptCard
  theme: CardTheme
  className?: string
  onRetry: () => void
}

function CardViewerFrame({ card, theme, className, onRetry }: CardViewerFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [showEmbed, setShowEmbed] = useState(false)
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null)

  const srcDoc = useMemo(() => injectCardTheme(card.html, theme), [card.html, theme])
  const themeVars = CARD_THEMES[theme]

  // Listen for cm:ready / cm:error / cm:resize messages from the sandboxed card
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Sandboxed iframe without allow-same-origin always sends from opaque 'null' origin
      if (e.origin !== 'null' || e.source !== iframeRef.current?.contentWindow) return
      const msg = e.data as { type?: string; message?: unknown; height?: unknown } | null
      if (!msg || typeof msg !== 'object') return

      if (msg.type === 'cm:ready') {
        setLoading(false)
      } else if (msg.type === 'cm:error') {
        setError(typeof msg.message === 'string' ? msg.message : 'Card reported an error')
        setLoading(false)
      } else if (msg.type === 'cm:resize' && typeof msg.height === 'number' && Number.isFinite(msg.height)) {
        const clamped = Math.min(MAX_RESIZE_HEIGHT, Math.max(MIN_RESIZE_HEIGHT, Math.round(msg.height)))
        setMeasuredHeight(clamped)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const emptyHtmlError = !card.html.trim() ? 'Card HTML is empty' : null
  const activeError = emptyHtmlError ?? error
  const isLight = theme === 'light'

  // Fail if nothing rendered within the timeout (cards aren't required to send cm:ready)
  useEffect(() => {
    if (!loading || activeError) return
    const timer = setTimeout(() => {
      setError('Card took too long to render')
      setLoading(false)
    }, LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [loading, activeError])

  // Close fullscreen with Escape without closing a parent modal underneath
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setFullscreen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [fullscreen])

  const controlClass = isLight
    ? 'rounded-lg border border-indigo-600/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600'
    : 'rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-200 transition hover:bg-indigo-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400'

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-[100] flex flex-col p-3 sm:p-4'
          : `flex w-full flex-col${className ? ` ${className}` : ''}`
      }
      style={fullscreen ? { background: themeVars['--cm-bg'] } : undefined}
    >
      <div className="mb-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowEmbed(v => !v)}
          aria-expanded={showEmbed}
          aria-label="Show iframe embed code"
          className={controlClass}
        >
          {showEmbed ? 'Hide embed' : 'Embed this'}
        </button>
        <button
          type="button"
          onClick={() => setFullscreen(f => !f)}
          aria-pressed={fullscreen}
          aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'}
          className={controlClass}
        >
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>

      {showEmbed && (
        <CardEmbedPanel card={card} theme={theme} onClose={() => setShowEmbed(false)} />
      )}

      <div
        className={
          fullscreen
            ? 'relative flex-1 overflow-hidden rounded-xl border'
            : 'relative w-full aspect-[4/3] min-h-[260px] max-h-[70vh] overflow-hidden rounded-xl border'
        }
        style={{
          background: themeVars['--cm-bg'],
          borderColor: themeVars['--cm-border'],
          height: !fullscreen && measuredHeight != null ? `${measuredHeight}px` : undefined,
          touchAction: 'auto',
        }}
      >
        {loading && !activeError && (
          <div
            role="status"
            aria-live="polite"
            className={`absolute inset-0 z-10 flex items-center justify-center text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}
          >
            Rendering card…
          </div>
        )}

        {activeError ? (
          <div
            role="alert"
            className={`absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm ${isLight ? 'text-red-700' : 'text-red-300'}`}
          >
            <span>This card failed to render.</span>
            <span className={`max-w-sm text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              {activeError}
            </span>
            <button type="button" onClick={onRetry} className={`${controlClass} mt-1`}>
              Try again
            </button>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            loading="lazy"
            title={card.title}
            onLoad={() => setLoading(false)}
            className={`block h-full w-full border-0 transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
            style={{ touchAction: 'auto' }}
          />
        )}
      </div>
    </div>
  )
}
