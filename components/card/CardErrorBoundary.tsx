'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface CardErrorBoundaryProps {
  resetKey?: string
  children: ReactNode
}

interface CardErrorBoundaryState {
  hasError: boolean
  message: string | null
}

/**
 * React requires a class component for Error Boundaries (`getDerivedStateFromError`
 * / `componentDidCatch` have no hook equivalent). This isolates CardViewer failures
 * so malformed card state never crashes the host modal or mesh canvas.
 */
export class CardErrorBoundary extends Component<
  CardErrorBoundaryProps,
  CardErrorBoundaryState
> {
  state: CardErrorBoundaryState = { hasError: false, message: null }

  static getDerivedStateFromError(error: Error): CardErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Unexpected error while rendering card',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[CardErrorBoundary]', error, info.componentStack)
  }

  componentDidUpdate(prevProps: CardErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: null })
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border border-red-500/30 bg-slate-950/80 p-6 text-center text-sm text-red-200"
        >
          <p className="font-medium">Unable to display this card.</p>
          {this.state.message && (
            <p className="max-w-md text-xs text-slate-400">{this.state.message}</p>
          )}
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-1.5 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/25"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
