// Vercel Routing Middleware: HTTP Basic auth for the admin area (page, its JS/CSS chunks and admin data).
// Credentials come from the ADMIN_USER / ADMIN_PASSWORD environment variables; without them admin stays locked.
export const config = { matcher: ['/admin', '/admin/:path*', '/admin.html'] }

function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

export default function middleware(request: Request) {
  const user = process.env.ADMIN_USER, pass = process.env.ADMIN_PASSWORD
  if (!user || !pass) return new Response('Admin is not configured.', { status: 503 })
  const h = request.headers.get('authorization') ?? ''
  if (h.startsWith('Basic ')) {
    try {
      const [u, ...rest] = atob(h.slice(6)).split(':')
      if (safeEqual(u, user) && safeEqual(rest.join(':'), pass)) return // continue to the requested file
    } catch { /* malformed header: fall through to 401 */ }
  }
  return new Response('Authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="ChargeEVSetu admin", charset="UTF-8"', 'Cache-Control': 'no-store' } })
}
