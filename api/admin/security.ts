// Admin moderation API (Vercel Edge Function). Protected by middleware.ts (HTTP Basic auth, lockout), and it only acts
// on same-origin requests carrying X-Requested-With (blocks cross-site form/CSRF posts that would reuse Basic auth).
// Uses SUPABASE_SERVICE_ROLE_KEY, a server-only Vercel env var: never prefixed VITE_, never sent to the browser.
export const config = { runtime: 'edge' }

const URL_ = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
// New sb_secret_ keys go in `apikey` only (they are not JWTs); legacy service_role JWTs also need the Bearer header.
const h = (): Record<string, string> => ({ apikey: KEY!, ...(KEY!.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}), 'Content-Type': 'application/json' })
const rest = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...h(), ...(init.headers ?? {}) } })
  return r.ok ? r.json().catch(() => null) : null
}
const UUID = /^[0-9a-f-]{36}$/i

export default async function handler(req: Request) {
  if (!URL_ || !KEY) return json({ error: 'Admin API not configured: set SUPABASE_SERVICE_ROLE_KEY in Vercel (server-only).' }, 503)
  if (req.headers.get('x-requested-with') !== 'admin') return json({ error: 'forbidden' }, 403)
  const origin = req.headers.get('origin')
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: 'forbidden' }, 403)

  if (req.method === 'GET') {
    const [users, reports, flags, events] = await Promise.all([
      fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=50`, { headers: h() }).then((r) => (r.ok ? r.json() : { users: [] })),
      rest('reports?select=id,station_id,kind,note,created_at,user_id&order=created_at.desc&limit=30'),
      rest('review_flags?select=review_id,reason,created_at&order=created_at.desc&limit=200'),
      rest('admin_events?select=kind,ip,detail,created_at&order=created_at.desc&limit=50'),
    ])
    const count = new Map<string, number>()
    for (const f of (flags ?? []) as { review_id: string }[]) count.set(f.review_id, (count.get(f.review_id) ?? 0) + 1)
    const ids = [...count.keys()].filter((x) => UUID.test(x)).slice(0, 50)
    const reviews = ids.length ? await rest(`reviews?select=id,station_id,user_id,author,rating,body,hidden,created_at&id=in.(${ids.join(',')})`) : []
    const signups = ((users as { users: Record<string, unknown>[] }).users ?? [])
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 30)
      .map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, confirmed: !!u.email_confirmed_at, banned_until: u.banned_until ?? null }))
    return json({ signups, reports: reports ?? [], flagged: ((reviews ?? []) as { id: string }[]).map((r) => ({ ...r, flags: count.get(r.id) ?? 0 })).sort((a, b) => b.flags - a.flags), events: events ?? [] })
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({})) as { action?: string; id?: string }
    if (!body.id || !UUID.test(body.id)) return json({ error: 'bad id' }, 400)
    const audit = (kind: string) => rest('admin_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ kind, detail: body.id }) })
    if (body.action === 'hide_review' || body.action === 'unhide_review') {
      await rest(`reviews?id=eq.${body.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ hidden: body.action === 'hide_review' }) })
      await audit(body.action)
      return json({ ok: true })
    }
    if (body.action === 'ban_user' || body.action === 'unban_user') {
      const r = await fetch(`${URL_}/auth/v1/admin/users/${body.id}`, { method: 'PUT', headers: h(), body: JSON.stringify({ ban_duration: body.action === 'ban_user' ? '876000h' : 'none' }) })
      await audit(body.action)
      return json({ ok: r.ok }, r.ok ? 200 : 502)
    }
    return json({ error: 'unknown action' }, 400)
  }
  return json({ error: 'method not allowed' }, 405)
}
