import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher([
  '/projects(.*)',
  '/api-keys(.*)',
  '/billing(.*)',
  '/graph(.*)',
  '/api/agent-request',
])

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/mcp', // MCP route uses API key authentication, not Clerk
  '/api/graph-api', // Graph API route supports both Clerk and API key authentication
])

export default clerkMiddleware(async (auth, req) => {
  // Allow public access to home page and auth routes
  if (isPublicRoute(req)) {
    return
  }

  // Protect specific routes
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
