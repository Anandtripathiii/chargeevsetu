import { useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, Loader2, RotateCcw } from 'lucide-react'
import { Container, PageHeader } from '../components/ui'
import { STYLE_URL } from '../components/mapStyle'
import { DEMO } from '../lib/backend'

type State = 'checking' | 'ok' | 'down' | 'off'
const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

async function probe(f: () => Promise<boolean>): Promise<State> {
  try { return (await Promise.race([f(), new Promise<boolean>((ok) => setTimeout(() => ok(false), 8000))])) ? 'ok' : 'down' } catch { return 'down' }
}
const CHECKS: [string, string, () => Promise<State>][] = [
  ['Charger and planning data', 'Station tiles, districts and forecasts (served with the site)', () => probe(async () => {
    const r = await fetch(`${import.meta.env.BASE_URL}data/tiles/index.json`, { cache: 'no-store' })
    return r.ok && ((await r.json()) as { count: number }).count > 0
  })],
  ['Map', 'Basemap tiles (OpenFreeMap)', () => probe(async () => (await fetch(STYLE_URL, { cache: 'no-store' })).ok)],
  ['Place search', 'Geocoder (Photon, OpenStreetMap)', () => probe(async () => (await fetch('https://photon.komoot.io/api/?q=Delhi&limit=1')).ok)],
  ['Login and Plugsy', 'Accounts, reviews, bookings (Supabase)', () => DEMO ? Promise.resolve('off' as State) : probe(async () => (await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: KEY! } })).ok)],
]

export default function Status() {
  const [res, setRes] = useState<State[]>(CHECKS.map(() => 'checking'))
  const [at, setAt] = useState<Date | null>(null)
  const run = () => { setRes(CHECKS.map(() => 'checking')); Promise.all(CHECKS.map(([, , f]) => f())).then((r) => { setRes(r); setAt(new Date()) }) }
  useEffect(run, [])
  const ok = res.every((r) => r === 'ok' || r === 'off')
  return (
    <>
      <PageHeader title="Service status">Is everything working? This page checks each part of ChargeEVSetu from your browser.</PageHeader>
      <Container className="max-w-2xl space-y-3">
        <div className={`card p-4 font-semibold ${ok ? 'text-ok' : 'text-warn'}`}>{res.includes('checking') ? 'Checking…' : ok ? 'All systems working' : 'Some services have problems. Maps and planning tools keep working with saved data.'}</div>
        <ul className="card divide-y divide-line">
          {CHECKS.map(([name, sub], i) => (
            <li key={name} className="p-4 flex items-center gap-3">
              {res[i] === 'checking' ? <Loader2 className="animate-spin text-muted" size={20} /> : res[i] === 'ok' ? <CheckCircle2 className="text-ok" size={20} /> : <CircleAlert className={res[i] === 'off' ? 'text-muted' : 'text-warn'} size={20} />}
              <span className="flex-1 min-w-0"><b className="block text-sm">{name}</b><span className="text-xs text-muted">{sub}</span></span>
              <span className="text-sm">{{ checking: '…', ok: 'Working', down: 'Not responding', off: 'Demo mode' }[res[i]]}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{at ? `Checked ${at.toLocaleTimeString('en-IN')}` : ''}</span>
          <button className="pill" onClick={run}><RotateCcw size={13} />Check again</button>
        </div>
      </Container>
    </>
  )
}
