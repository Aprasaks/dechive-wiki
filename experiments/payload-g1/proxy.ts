import { NextResponse, type NextRequest } from 'next/server'

// G1 isolated fixture. In real deployment, configure a single exact HTTPS
// origin through a reviewed allowlist; never derive it from untrusted Host or
// X-Forwarded-* headers. No wildcard or CORS reflection.
const UNSAFE = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])
const TRUSTED_ORIGIN = process.env.G1_TRUSTED_ORIGIN || ''
const denied = () => NextResponse.json({ error: 'CSRF_ORIGIN_REJECTED' }, {
  status: 403,
  headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' },
})

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  const method = request.method.toUpperCase()
  const cookies = request.headers.get('cookie') ?? ''
  const hasCookie = cookies.length > 0

  // Fail closed for a malformed test-lab environment.
  if (!TRUSTED_ORIGIN || !TRUSTED_ORIGIN.startsWith('http')) return denied()

  // Any explicit foreign Origin or cross-site browser request is rejected,
  // even if CORS would stop the browser from reading the response.
  if ((origin !== null && origin !== TRUSTED_ORIGIN) ||
      fetchSite === 'cross-site') {
    return denied()
  }

  // Browser cookies are ambient authority. Require an explicit same-origin
  // Origin to mutate ANY /api route with cookies attached. A server-to-server
  // call using an explicit signed JWT header and no cookies can be originless.
  // Do NOT rely on SameSite alone for privileged review/publish operations.
  if (UNSAFE.has(method) && hasCookie && origin !== TRUSTED_ORIGIN) {
    return denied()
  }

  return NextResponse.next()
}

export const config = { matcher: '/api/:path*' }
