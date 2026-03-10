'use client'

import { useEffect, useRef, useState } from 'react'

interface VizRendererProps {
  code: string
  onError?: (err: string) => void
}

// Minimal React runtime injected into the iframe
const IFRAME_RUNTIME = `
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
`

function buildIframeHTML(code: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: transparent; font-family: system-ui, sans-serif; }
    input[type=range] { cursor: pointer; }
  </style>
  ${IFRAME_RUNTIME}
</head>
<body>
  <div id="root"></div>
  <script>
    const { useState, useEffect, useRef, useCallback, useMemo } = React;

    window.onerror = function(msg, src, line, col, err) {
      window.parent.postMessage({ type: 'viz-error', message: msg }, '*');
    };

    try {
      const componentFn = (function(React, useState, useEffect, useRef, useCallback, useMemo, Math) {
        'use strict';
        return (${code});
      })(React, useState, useEffect, useRef, useCallback, useMemo, Math);

      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(componentFn));
      window.parent.postMessage({ type: 'viz-ready' }, '*');
    } catch(err) {
      window.parent.postMessage({ type: 'viz-error', message: err.message }, '*');
    }
  </script>
</body>
</html>`
}

export function VizRenderer({ code, onError }: VizRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setReady(false)
    setError(null)

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'viz-ready') setReady(true)
      if (e.data?.type === 'viz-error') {
        setError(e.data.message)
        onError?.(e.data.message)
      }
    }

    window.addEventListener('message', handleMessage)

    if (iframeRef.current) {
      const html = buildIframeHTML(code)
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      iframeRef.current.src = url
      return () => {
        URL.revokeObjectURL(url)
        window.removeEventListener('message', handleMessage)
      }
    }

    return () => window.removeEventListener('message', handleMessage)
  }, [code, onError])

  if (error) {
    return (
      <div style={{
        padding: '2rem',
        background: 'rgba(239,68,68,0.1)',
        borderRadius: 12,
        border: '1px solid rgba(239,68,68,0.3)',
        color: '#fca5a5',
        fontSize: 13,
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>Visualization error</div>
        <div style={{ color: '#94a3b8', fontSize: 11 }}>{error}</div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
      {!ready && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(15,23,42,0.8)',
          color: '#94a3b8',
          fontSize: 13,
          zIndex: 1,
        }}>
          Loading visualization...
        </div>
      )}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        style={{
          width: '100%',
          height: 380,
          border: 'none',
          borderRadius: 12,
          background: 'transparent',
          display: 'block',
          opacity: ready ? 1 : 0,
          transition: 'opacity 0.3s',
        }}
        title="Concept Visualization"
      />
    </div>
  )
}
