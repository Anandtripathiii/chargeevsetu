// Vercel Routing Middleware: HTTP Basic auth for the admin area (page, its JS/CSS chunks, admin data and the admin API).
// Credentials come from the ADMIN_USER / ADMIN_PASSWORD environment variables; without them admin stays locked.
// Brute force: 10 wrong passwords from one IP lock that IP out for 15 minutes. With UPSTASH_REDIS_REST_URL/TOKEN set
// the counter is shared by all edge instances; otherwise it is per instance (shortcut: in-memory, resets on cold start).
export const config = { matcher: ['/admin', '/admin/:path*', '/admin.html', '/api/admin/:path*'] }

const MAX_FAILS = 10
const LOCK_MS = 15 * 60 * 1000
const fails = new Map<string, { n: number; until: number }>()

/** Constant-time comparison: compares SHA-256 digests so neither length nor content leaks through timing. */
async function safeEqual(a: string, b: string) {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const p = new Uint8Array(x), q = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i]
  return diff === 0
}

const redis = async (cmd: (string | number)[]) => {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) })
    return ((await r.json()) as { result: unknown }).result
  } catch { return null }
}
async function lockedOut(ip: string) {
  const shared = await redis(['GET', `admin-fails:${ip}`])
  if (shared != null) return Number(shared) >= MAX_FAILS
  const f = fails.get(ip)
  return !!f && f.n >= MAX_FAILS && f.until > Date.now()
}
async function recordFail(ip: string, user: string) {
  const n = await redis(['INCR', `admin-fails:${ip}`])
  if (n != null) await redis(['PEXPIRE', `admin-fails:${ip}`, LOCK_MS])
  const f = fails.get(ip)
  const cur = f && f.until > Date.now() ? f.n + 1 : 1
  fails.set(ip, { n: cur, until: Date.now() + LOCK_MS })
  if (fails.size > 5000) fails.clear() // bound memory
  // never log the password; the username is truncated
  console.warn(JSON.stringify({ event: 'admin_login_failed', ip, user: user.slice(0, 40), count: Number(n ?? cur), at: new Date().toISOString() }))
  // optional: keep a record for the admin Security page
  const sb = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (sb && key) await fetch(`${sb}/rest/v1/admin_events`, {
    // sb_secret_ keys: apikey header only; legacy JWT keys also as Bearer
    method: 'POST', headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ kind: 'admin_login_failed', ip, detail: user.slice(0, 40) }),
  }).catch(() => {})
}

const deny = (status: number, msg: string, extra: Record<string, string> = {}) =>
  new Response(msg, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...extra } })

export default async function middleware(request: Request) {
  const user = process.env.ADMIN_USER, pass = process.env.ADMIN_PASSWORD
  if (!user || !pass) return deny(503, 'Admin is not configured.')
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
  if (await lockedOut(ip)) return deny(429, 'Too many wrong passwords. Try again in 15 minutes.', { 'Retry-After': String(LOCK_MS / 1000) })
  const h = request.headers.get('authorization') ?? ''
  let u = ''
  if (h.startsWith('Basic ')) {
    try {
      const [name, ...rest] = atob(h.slice(6)).split(':')
      u = name
      const okUser = await safeEqual(name, user), okPass = await safeEqual(rest.join(':'), pass)
      if (okUser && okPass) return // continue to the requested file
    } catch { /* malformed header: treated as a failed attempt */ }
    await recordFail(ip, u)
    await new Promise((ok) => setTimeout(ok, 800 + Math.random() * 400)) // slow down guessing
  }
  return deny(401, 'Authentication required', { 'WWW-Authenticate': 'Basic realm="ChargeEVSetu admin", charset="UTF-8"' })
}
