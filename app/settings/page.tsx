'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [maskedKey, setMaskedKey] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    if (session?.user) {
      fetch('/api/user/api-key')
        .then(r => r.json())
        .then(data => {
          setHasKey(data.hasKey)
          setMaskedKey(data.maskedKey ?? null)
        })
    }
  }, [session])

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/user/api-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHasKey(true)
      setMaskedKey(data.maskedKey)
      setApiKey('')
      setMessage({ type: 'success', text: 'API key saved and encrypted' })
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    setSaving(true)
    setMessage(null)
    try {
      await fetch('/api/user/api-key', { method: 'DELETE' })
      setHasKey(false)
      setMaskedKey(null)
      setMessage({ type: 'success', text: 'API key removed' })
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f1e' }}>
        <div className="text-white/50">Loading...</div>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <a href="/" className="text-sm text-white/50 hover:text-white transition-colors">
            Back to mesh
          </a>
        </div>

        {/* API Key Section */}
        <div className="rounded-xl border border-white/10 p-6" style={{ background: 'rgba(15, 23, 42, 0.8)' }}>
          <h2 className="text-lg font-semibold text-white mb-1">Anthropic API Key</h2>
          <p className="text-sm text-white/40 mb-4">
            Add your own API key to generate visualizations. Your key is encrypted at rest and never exposed to the browser.
          </p>

          {hasKey && maskedKey && (
            <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
              <span className="text-sm text-white/60 font-mono flex-1">{maskedKey}</span>
              <button
                onClick={handleRemove}
                disabled={saving}
                className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? 'Replace with new key...' : 'sk-ant-...'}
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50"
            />
            <button
              onClick={handleSave}
              disabled={saving || !apiKey}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving ? 'Saving...' : hasKey ? 'Update' : 'Save'}
            </button>
          </div>

          {message && (
            <p className={`mt-3 text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
              {message.text}
            </p>
          )}
        </div>

        {/* Account Info */}
        <div className="mt-6 rounded-xl border border-white/10 p-6" style={{ background: 'rgba(15, 23, 42, 0.8)' }}>
          <h2 className="text-lg font-semibold text-white mb-3">Account</h2>
          <div className="flex items-center gap-3">
            {session.user?.image && (
              <img src={session.user.image} alt="" className="w-10 h-10 rounded-full" />
            )}
            <div>
              <p className="text-sm text-white font-medium">{session.user?.name}</p>
              <p className="text-xs text-white/40">{session.user?.email}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
