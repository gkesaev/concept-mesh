'use client'

import { useEffect } from 'react'
import { useUIStore } from '@/store/uiStore'

export function SerendipityBanner() {
  const { serendipityBanner, dismissSerendipity } = useUIStore()

  // Auto-dismiss after 12s
  useEffect(() => {
    if (!serendipityBanner) return
    const t = setTimeout(dismissSerendipity, 12000)
    return () => clearTimeout(t)
  }, [serendipityBanner, dismissSerendipity])

  if (!serendipityBanner) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        maxWidth: 520,
        width: 'calc(100vw - 2rem)',
        background: 'rgba(15,23,42,0.97)',
        border: '1px solid rgba(168,85,247,0.4)',
        borderRadius: 14,
        padding: '1rem 1.25rem',
        boxShadow: '0 0 40px rgba(168,85,247,0.2)',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#a855f7', fontWeight: 600, marginBottom: 6, letterSpacing: '0.05em' }}>
            ✦ UNEXPECTED CONNECTION
          </div>
          <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.6 }}>
            <span style={{ color: '#c7d2fe', fontWeight: 600 }}>{serendipityBanner.sourceTitle}</span>
            {' '}and{' '}
            <span style={{ color: '#c7d2fe', fontWeight: 600 }}>{serendipityBanner.targetTitle}</span>
            {' '}are connected:{' '}
            <span style={{ color: '#94a3b8' }}>{serendipityBanner.reason}</span>
          </div>
        </div>
        <button
          onClick={dismissSerendipity}
          style={{
            background: 'none',
            border: 'none',
            color: '#475569',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}
