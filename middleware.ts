// Auth is checked in individual API routes via auth() from lib/auth.ts.
// This file is a no-op — `config.matcher: []` means it never runs — but
// Next 16.2 requires a function export when middleware.ts exists.
import { NextResponse } from 'next/server'

export function middleware() {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
