'use client'

import { Component, type ReactNode } from 'react'

// Catches render-time exceptions thrown by descendant components (e.g. a
// VizRenderer that explodes during effect setup). Iframe-internal errors are
// caught by VizRenderer's postMessage handler, not by this boundary.
interface Props {
  children: ReactNode
  onRetry?: () => void
}

interface State {
  error: Error | null
}

export class VizErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('VizErrorBoundary caught:', error)
  }

  reset = () => {
    this.setState({ error: null })
    this.props.onRetry?.()
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: '1.5rem',
            borderRadius: 14,
            border: '1px solid rgba(248,113,113,0.4)',
            background: 'rgba(76,5,25,0.45)',
            color: '#fecaca',
            fontSize: 13,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
          role="alert"
        >
          <div style={{ fontWeight: 600, color: '#fda4af' }}>Card crashed while rendering.</div>
          <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12, opacity: 0.85 }}>
            {this.state.error.message}
          </div>
          <button
            type="button"
            onClick={this.reset}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid rgba(248,113,113,0.5)',
              background: 'transparent',
              color: '#fecaca',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
