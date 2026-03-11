'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useState } from 'react'

export function UserMenu() {
  const { data: session, status } = useSession()
  const [open, setOpen] = useState(false)

  if (status === 'loading') {
    return (
      <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
    )
  }

  if (!session) {
    return (
      <button
        onClick={() => signIn()}
        className="px-3 py-1.5 text-sm rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
      >
        Sign in
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 cursor-pointer"
      >
        {session.user?.image ? (
          <img
            src={session.user.image}
            alt=""
            className="w-8 h-8 rounded-full border border-white/20"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-indigo-500/30 border border-indigo-400/30 flex items-center justify-center text-sm text-white font-medium">
            {session.user?.name?.[0] ?? '?'}
          </div>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-white/10 p-2 shadow-xl"
            style={{ background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(12px)' }}>
            <div className="px-3 py-2 border-b border-white/5 mb-1">
              <p className="text-sm text-white font-medium truncate">{session.user?.name}</p>
              <p className="text-xs text-white/40 truncate">{session.user?.email}</p>
            </div>

            <a
              href="/settings"
              className="block px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              onClick={() => setOpen(false)}
            >
              Settings
            </a>

            <button
              onClick={() => signOut()}
              className="w-full text-left px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
