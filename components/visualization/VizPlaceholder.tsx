'use client'

import type { PipelinePhase } from '@/lib/ai/pipeline'

interface VizPlaceholderProps {
  state: 'unexplored' | 'generating' | 'empty'
  phase?: PipelinePhase
  message?: string
  onGenerate?: () => void
  /** Optional total chars produced so far during streamed generation. */
  progressChars?: number
}

const PHASE_COPY: Record<PipelinePhase, string> = {
  planning:   'Planning the visualization…',
  generating: 'Generating the card…',
  validating: 'Checking the card…',
  fixing:     'Repairing a small issue…',
  saving:     'Saving the card…',
  done:       'Almost ready…',
}

export function VizPlaceholder({ state, phase, message, onGenerate, progressChars }: VizPlaceholderProps) {
  if (state === 'generating') {
    const copy = message ?? (phase ? PHASE_COPY[phase] : 'Generating…')
    return (
      <div style={baseStyle}>
        <div style={spinnerStyle} />
        <div style={titleStyle}>{copy}</div>
        {progressChars && progressChars > 0 ? (
          <div style={subtitleStyle}>{progressChars.toLocaleString()} characters written</div>
        ) : (
          <div style={subtitleStyle}>This usually takes 15–30 seconds.</div>
        )}
        <style>{spinnerKeyframes}</style>
      </div>
    )
  }

  if (state === 'empty') {
    return (
      <div style={baseStyle}>
        <div style={titleStyle}>No card yet for this concept.</div>
        {onGenerate && (
          <button onClick={onGenerate} style={buttonStyle} type="button">
            Generate card
          </button>
        )}
      </div>
    )
  }

  // unexplored
  return (
    <div style={baseStyle}>
      <div style={titleStyle}>Unexplored concept</div>
      <div style={subtitleStyle}>Click below to spin up an interactive visualization.</div>
      {onGenerate && (
        <button onClick={onGenerate} style={buttonStyle} type="button">
          Generate card
        </button>
      )}
    </div>
  )
}

const baseStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  padding: '2.5rem 1.5rem',
  textAlign: 'center',
  background: 'rgba(15,23,42,0.5)',
  borderRadius: 14,
  border: '1px dashed rgba(99,102,241,0.25)',
  minHeight: 240,
}

const titleStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: 14,
  fontWeight: 500,
}

const subtitleStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: 12,
}

const buttonStyle: React.CSSProperties = {
  marginTop: 4,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid rgba(99,102,241,0.4)',
  background: 'rgba(99,102,241,0.15)',
  color: '#c7d2fe',
  fontSize: 13,
  cursor: 'pointer',
}

const spinnerStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: '3px solid rgba(99,102,241,0.2)',
  borderTopColor: '#6366f1',
  animation: 'cm-spin 0.9s linear infinite',
}

const spinnerKeyframes = `@keyframes cm-spin { to { transform: rotate(360deg); } }`
