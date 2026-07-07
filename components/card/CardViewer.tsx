'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { ConceptCard } from '@/types/concept'

// Host-side theme injected into every card, per docs/card-spec.md (#8).
const THEME_VARS: Record<string, string> = {
  '--cm-bg':      '#0b1020',
  '--cm-surface': '#141a2e',
  '--cm-text':    '#e8ecff',
  '--cm-accent':  '#7c5cff',
  '--cm-border':  '#2a3150',
}

const LOAD_TIMEOUT_MS = 10000

function injectTheme(html: string): string {
  const vars = Object.entries(THEME_VARS).map(([k, v]) => `${k}:${v}`).join(';')
  const style = `<style data-cm-host-theme>:root{${vars}}</style>`
  const headClose = /<\/head>/i
  if (headClose.test(html)) return html.replace(headClose, `${style}</head>`)
  return style + html
}

interface CardViewerProps {
  card: ConceptCard
}

export function CardViewer({ card }: CardViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)

  const srcDoc = useMemo(() => injectTheme(card.html), [card.html])

  // cm:ready / cm:error messages from the sandboxed card
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const msg = e.data as { type?: string; message?: string }
      if (msg?.type === 'cm:ready') setLoading(false)
      if (msg?.type === 'cm:error') {
        setError(typeof msg.message === 'string' ? msg.message : 'Card reported an error')
        setLoading(false)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Cards aren't required to send cm:ready — clear the spinner on load,
  // and fail if nothing rendered within the timeout.
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => {
      setError('Card took too long to render')
      setLoading(false)
    }, LOAD_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [loading])

  // Close fullscreen with Escape
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const copyEmbedCode = useCallback(async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const code = `<iframe src="${origin}/embed/${card.id}" width="640" height="480" style="border:1px solid #2a3150;border-radius:12px" title="${card.title} — ConceptMesh" sandbox="allow-scripts"></iframe>`
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy embed code to clipboard')
    }
  }, [card.id, card.title])

  const buttonStyle: React.CSSProperties = {
    background: 'rgba(99,102,241,0.12)',
    border: '1px solid rgba(99,102,241,0.3)',
    borderRadius: 8,
    color: '#a5b4fc',
    cursor: 'pointer',
    fontSize: 11,
    padding: '4px 10px',
  }

  return (
    <div
      style={fullscreen ? {
        position: 'fixed', inset: 0, zIndex: 100,
        background: '#0b1020', display: 'flex', flexDirection: 'column', padding: '1rem',
      } : {
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <button onClick={copyEmbedCode} style={buttonStyle} aria-label="Copy embed code">
          {copied ? 'Copied!' : 'Embed this'}
        </button>
        <button
          onClick={() => setFullscreen(f => !f)}
          style={buttonStyle}
          aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'}
        >
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>

      <div style={{
        position: 'relative',
        flex: fullscreen ? 1 : undefined,
        height: fullscreen ? undefined : 'min(60vh, 480px)',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid rgba(99,102,241,0.25)',
        background: THEME_VARS['--cm-bg'],
      }}>
        {loading && !error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#64748b', fontSize: 13, zIndex: 1,
          }}>
            Rendering card…
          </div>
        )}

        {error ? (
          <div role="alert" style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            color: '#fca5a5', fontSize: 13, padding: '1rem', textAlign: 'center',
          }}>
            <span>This card failed to render.</span>
            <span style={{ color: '#64748b', fontSize: 11 }}>{error}</span>
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
            style={{
              width: '100%', height: '100%', border: 'none', display: 'block',
              opacity: loading ? 0 : 1, transition: 'opacity 0.3s',
              touchAction: 'auto',
            }}
          />
        )}
      </div>
    </div>
  )
}
