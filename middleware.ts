// Auth is checked in individual API routes via auth() from lib/auth.ts.
// No middleware needed — keeping this file as a no-op avoids interfering
// with NextAuth v5 cookie reading in route handlers.
export { }

export const config = {
  matcher: [],
}
