import { useEffect, useState } from 'react'
import { Ban, EyeOff, RotateCcw, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { CardTitle, Container, PageHeader, Skeleton } from '../../components/ui'

interface Data {
  signups: { id: string; email: string; created_at: string; confirmed: boolean; banned_until: string | null }[]
  reports: { id: string; station_id: string; kind: string; note: string; created_at: string; user_id: string }[]
  flagged: { id: string; station_id: string; user_id: string; author: string; rating: number; body: string; hidden: boolean; flags: number }[]
  events: { kind: string; ip: string | null; detail: string | null; created_at: string }[]
}
const API = '/api/admin/security'
const call = (init?: RequestInit) => fetch(API, { ...init, headers: { 'X-Requested-With': 'admin', 'Content-Type': 'application/json' } })
const when = (s: string) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

/** Moderation and monitoring: recent sign-ups, reports, flagged reviews, failed admin logins. */
export default function Security() {
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () => {
    setErr(null)
    call().then(async (r) => { const j = await r.json().catch(() => null); if (!r.ok || !j) throw new Error(j?.error ?? `HTTP ${r.status}`); setD(j) })
      .catch((e: Error) => setErr(/Unexpected|JSON|404/.test(e.message) ? 'The admin API is only available on the Vercel deployment.' : e.message))
  }
  useEffect(load, [])
  const act = async (action: string, id: string, ok: string) => {
    const r = await call({ method: 'POST', body: JSON.stringify({ action, id }) })
    if (r.ok) { toast.success(ok); load() } else toast.error('Action failed')
  }
  const failed = d?.events.filter((e) => e.kind === 'admin_login_failed') ?? []
  return (
    <>
      <PageHeader title="Security">Recent sign-ups, problem reports, flagged reviews and failed admin logins. Hide abusive reviews or ban accounts.</PageHeader>
      <Container className="space-y-4">
        <div className="flex justify-end"><button className="pill" onClick={load}><RotateCcw size={13} />Refresh</button></div>
        {err && <div className="card p-4 text-sm text-warn">{err}</div>}
        {!d && !err && <Skeleton className="h-64" />}
        {d && (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card p-4 lg:col-span-2">
              <CardTitle>Flagged reviews ({d.flagged.length})</CardTitle>
              {!d.flagged.length ? <p className="text-sm text-muted">Nothing flagged.</p> : (
                <table className="tbl"><thead><tr><th>Flags</th><th>Review</th><th>Author</th><th>Station</th><th /></tr></thead>
                  <tbody>{d.flagged.map((r) => (
                    <tr key={r.id} className={r.hidden ? 'opacity-50' : ''}>
                      <td className="tnum font-semibold">{r.flags}</td><td className="max-w-md">{'★'.repeat(r.rating)} {r.body}</td><td>{r.author}</td><td className="text-xs">{r.station_id}</td>
                      <td className="whitespace-nowrap space-x-1">
                        <button className="pill !h-7" onClick={() => act(r.hidden ? 'unhide_review' : 'hide_review', r.id, r.hidden ? 'Review shown again' : 'Review hidden')}>{r.hidden ? <><Eye size={12} />Show</> : <><EyeOff size={12} />Hide</>}</button>
                        <button className="pill !h-7 text-crit" onClick={() => act('ban_user', r.user_id, 'User banned')}><Ban size={12} />Ban author</button>
                      </td>
                    </tr>
                  ))}</tbody></table>
              )}
            </div>
            <div className="card p-4">
              <CardTitle>Recent sign-ups</CardTitle>
              <ul className="text-sm divide-y divide-line max-h-96 overflow-auto" data-lenis-prevent>{d.signups.map((u) => (
                <li key={u.id} className="py-2 flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate">{u.email}<span className="block text-xs text-muted">{when(u.created_at)} · {u.confirmed ? 'confirmed' : 'not confirmed'}{u.banned_until ? ' · banned' : ''}</span></span>
                  <button className="pill !h-7" onClick={() => act(u.banned_until ? 'unban_user' : 'ban_user', u.id, u.banned_until ? 'User unbanned' : 'User banned')}>{u.banned_until ? 'Unban' : <><Ban size={12} />Ban</>}</button>
                </li>
              ))}</ul>
            </div>
            <div className="card p-4">
              <CardTitle>Problem reports</CardTitle>
              <ul className="text-sm divide-y divide-line max-h-96 overflow-auto" data-lenis-prevent>{d.reports.map((r) => (
                <li key={r.id} className="py-2"><b>{r.kind.replace('_', ' ')}</b> · <span className="text-xs text-muted">{r.station_id} · {when(r.created_at)}</span>{r.note && <p className="text-muted">{r.note}</p>}</li>
              ))}</ul>
            </div>
            <div className="card p-4 lg:col-span-2">
              <CardTitle>Failed admin logins ({failed.length}) and admin actions</CardTitle>
              <table className="tbl"><thead><tr><th>When</th><th>Event</th><th>IP</th><th>Detail</th></tr></thead>
                <tbody>{d.events.map((e, i) => <tr key={i}><td className="text-xs whitespace-nowrap">{when(e.created_at)}</td><td>{e.kind.replace(/_/g, ' ')}</td><td className="text-xs">{e.ip ?? ''}</td><td className="text-xs">{e.detail ?? ''}</td></tr>)}</tbody></table>
            </div>
          </div>
        )}
      </Container>
    </>
  )
}
