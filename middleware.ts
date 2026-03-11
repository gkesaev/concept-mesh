import NextAuth from 'next-auth'
import authConfig from './lib/auth.config'

export default NextAuth(authConfig).auth

export const config = {
  // Run auth middleware on all routes except static files and images
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
