'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// Messages we trust from a card iframe. Anything else is dropped.
type CardMessage =
  | { type: 'concept-mesh-ready' }
  | { type: 'concept-mesh-error'; message?: string }

interface VizRendererProps {
  /** Self-contained HTML document produced by the AI pipeline. */
  html: string
  /** Card id — passed to the parent so it can mark the card rendered after handshake. */
  cardId?: string
  /** Fired when the iframe handshakes ready. */
  onReady?: (cardId?: string) => void
  /** Fired when the iframe reports an error or fails to handshake. */
  onError?: (message: string) => void
  /** Optional explicit height. Defaults to 480px. */
  height?: number | string
}

const HANDSHAKE_TIMEOUT_MS = 8_000

export function VizRenderer({ html, cardId, onReady, onError, height = 480 }: VizRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [status, setStatus] = useState<'mounting' | 'ready' | 'error'>('mounting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Re-mount the iframe whenever the HTML changes — gives a clean origin
  // without us having to manually clear timers/listeners.
  const renderKey = useMemo(() => hashString(html), [html])

  useEffect(() => {
    setStatus('mounting')
    setErrorMessage(null)

    const iframe = iframeRef.current
    if (!iframe) return

    const fail = (message: string) => {
      setStatus(s => (s === 'ready' ? s : 'error'))
      setErrorMessage(message)
      onError?.(message)
    }

    const handshakeTimer = window.setTimeout(() => {
      fail('Card did not signal ready in time. The visualization may have failed to start.')
    }, HANDSHAKE_TIMEOUT_MS)

    const onMessage = (event: MessageEvent) => {
      // The sandboxed iframe has a unique opaque origin (string "null"),
      // so we trust source-equality with our own iframe instead of origin.
      if (event.source !== iframe.contentWindow) return
      const data = event.data as CardMessage | undefined
      if (!data || typeof data !== 'object') return
      if (data.type === 'concept-mesh-ready') {
        window.clearTimeout(handshakeTimer)
        setStatus('ready')
        onReady?.(cardId)
      } else if (data.type === 'concept-mesh-error') {
        window.clearTimeout(handshakeTimer)
        fail(data.message ?? 'The card reported an error during initialization.')
      }
    }

    window.addEventListener('message', onMessage)
    return () => {
      window.clearTimeout(handshakeTimer)
      window.removeEventListener('message', onMessage)
    }
    // We deliberately key on renderKey so a new card resets the listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey, cardId])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'rgba(2,6,23,0.6)',
        border: '1px solid rgba(99,102,241,0.2)',
      }}
    >
      <iframe
        ref={iframeRef}
        key={renderKey}
        title="Concept visualization"
        // sandbox="allow-scripts" gives the iframe a unique opaque origin
        // (the literal "null"). It can run JS but cannot:
        //  - access the parent DOM, cookies, localStorage, or our origin
        //  - issue same-origin XHR/fetch (CORS blocks cross-origin too)
        //  - submit forms or open new windows that affect us
        // Combined with the static validator's deny-list this is our trust
        // boundary for AI-generated code.
        sandbox="allow-scripts"
        srcDoc={html}
        referrerPolicy="no-referrer"
        loading="lazy"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: 'transparent',
          display: 'block',
        }}
      />
      {status === 'mounting' && <MountingOverlay />}
      {status === 'error' && <ErrorOverlay message={errorMessage ?? 'Failed to render card.'} />}
    </div>
  )
}

function MountingOverlay() {
  return (
    <div style={overlayStyle}>
      <div
        style={{
          fontSize: 12,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#94a3b8',
          opacity: 0.85,
        }}
      >
        Mounting card…
      </div>
    </div>
  )
}

function ErrorOverlay({ message }: { message: string }) {
  return (
    <div style={{ ...overlayStyle, background: 'rgba(76,5,25,0.55)' }}>
      <div style={{ color: '#fda4af', fontWeight: 600, marginBottom: 6 }}>Card failed to render</div>
      <div style={{ color: '#fecaca', fontSize: 12, maxWidth: 360, textAlign: 'center', lineHeight: 1.5 }}>
        {message}
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  background: 'rgba(2,6,23,0.45)',
  backdropFilter: 'blur(4px)',
}

// Stable, fast string hash (FNV-1a) so the iframe key changes only when the
// content changes, not on every render.
function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}
