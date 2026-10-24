// GET /api/admin/team-photo?name=anand -> 302 to a 10-minute signed URL for that photo in the PRIVATE "team-photos"
// bucket. Protected by middleware.ts (same Basic auth + lockout as /admin). The service-role key stays on the server.
export const config = { runtime: 'edge' }

const URL_ = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const NAMES = new Set(['anand', 'anurag', 'saavya', 'akshat', 'tanishik'])
const EXPIRES = 600 // seconds
const NO_CACHE = { 'Cache-Control': 'private, max-age=0, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' }

export default async function handler(req: Request) {
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405, headers: NO_CACHE })
  if (!URL_ || !KEY) return new Response('not configured', { status: 503, headers: NO_CACHE })
  const name = new URL(req.url).searchParams.get('name') ?? ''
  if (!NAMES.has(name)) return new Response('not found', { status: 404, headers: NO_CACHE })
  // sb_secret_ keys go in apikey only; legacy service_role JWTs also as Bearer
  const auth: Record<string, string> = { apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}), 'Content-Type': 'application/json' }
  const r = await fetch(`${URL_}/storage/v1/object/sign/team-photos/${name}.webp`, { method: 'POST', headers: auth, body: JSON.stringify({ expiresIn: EXPIRES }) })
  const j = (await r.json().catch(() => null)) as { signedURL?: string } | null
  if (!r.ok || !j?.signedURL) return new Response('photo unavailable', { status: 404, headers: NO_CACHE })
  return new Response(null, { status: 302, headers: { ...NO_CACHE, Location: `${URL_}/storage/v1${j.signedURL}` } })
}
