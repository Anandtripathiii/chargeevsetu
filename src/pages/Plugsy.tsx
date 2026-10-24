import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { PickingInfo } from '@deck.gl/core'
import { CalendarCheck, Camera, ChevronRight, CreditCard, EyeOff, Flag, Home, IndianRupee, LocateFixed, MapPin, Plug, PlugZap, Search, ShieldCheck, Wallet, Wrench, X, Zap } from 'lucide-react'
import MapBase from '../components/LazyMap'
import type { MapBaseHandle } from '../components/mapUtil'
import { useTheme } from '../lib/theme'
import { tooltipBox } from '../lib/tooltip'
import { useLiveStatus, useSamples, type Listing } from '../lib/plugsy'
import { toast } from 'sonner'
import { Container, PageHeader, Skeleton } from '../components/ui'
import { Modal, openLogin, useRequireLogin } from '../components/Account'
import {
  addHomeCharger, createBooking, PRICE_LIMITS, requestInstall, setChargerStatus, useBookings, useHomeChargers, useUser,
  type Booking, type HomeCharger, type InstallRequest, type PlugStatus,
} from '../lib/backend'
import { haversineKm } from '../lib/model'
import { kmText } from '../lib/stations'
import { fmt } from '../lib/format'

const MapPage = lazy(() => import('./MapPage'))

const TABS = [['public', 'Public stations'], ['home', 'Home chargers (Plugsy)'], ['bookings', 'My bookings'], ['host', 'Host a charger'], ['install', 'Get one installed']] as const
type Tab = (typeof TABS)[number][0]
const COMMISSION = 0.15
/** value for <input type=datetime-local>, in the visitor's local time */
const localInput = (t: number) => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }

const STATUS: Record<PlugStatus, [string, string, [number, number, number]]> = {
  free: ['Free', 'text-ok border-ok/30 bg-ok/10', [22, 163, 74]], busy: ['Busy', 'text-[#c2410c] border-[#f97316]/40 bg-[#f97316]/10', [249, 115, 22]],
  booked: ['Booked', 'text-[#1d4ed8] border-[#2563eb]/40 bg-[#2563eb]/10', [37, 99, 235]], offline: ['Offline', 'text-muted border-line bg-active', [148, 163, 184]],
}
const Status = ({ s, mins }: { s: PlugStatus; mins?: number }) => (
  <span className={`chip ${STATUS[s][1]}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{STATUS[s][0]}{s === 'busy' && mins ? ` · free in ~${mins} min` : ''}</span>
)
const rgb = (s: PlugStatus) => `rgb(${STATUS[s][2].join(',')})`

export default function Plugsy() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some(([t]) => t === params.get('tab')) ? params.get('tab') : 'home') as Tab
  const setTab = (t: Tab) => setParams(t === 'home' ? {} : { tab: t }, { replace: true })
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><PlugZap className="text-accent" />Plugsy: all charging in one place</span>}>
        Find a <b className="text-text">public charging station</b>, or book a <b className="text-text">neighbour’s home charger</b> nearby. Hosts share their charger and earn. Exact addresses are shared only after booking.
      </PageHeader>
      <Container className="space-y-5">
        <HowItWorks />
        <div className="flex gap-1 overflow-x-auto rounded-full border border-line bg-panel p-1 w-fit max-w-full [scrollbar-width:none]" role="tablist">
          {TABS.map(([t, l]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm rounded-full whitespace-nowrap transition-colors ${tab === t ? 'bg-accent-fill text-[#0b0b0c] font-semibold' : 'text-muted hover:text-text'}`}>{l}</button>
          ))}
        </div>
        {tab === 'public' && <div className="flex flex-col"><Suspense fallback={<Skeleton className="h-[620px]" />}><MapPage embedded /></Suspense>
          <p className="text-xs text-muted mt-2">Real public stations from OpenStreetMap and Open Charge Map: same data as the main EV map.</p></div>}
        {tab === 'home' && <HomeChargers />}
        {tab === 'bookings' && <MyBookings />}
        {tab === 'host' && <Host />}
        {tab === 'install' && <Install />}
        <About />
      </Container>
    </>
  )
}

function HowItWorks() {
  const Row = ({ who, steps }: { who: string; steps: [typeof Search, string, string][] }) => (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted mb-2">{who}</div>
      <ol className="flex items-start gap-1 sm:gap-2">
        {steps.map(([I, t, d], i) => (
          <li key={t} className="flex items-start gap-1 sm:gap-2 flex-1 min-w-0">
            <div className="flex-1 min-w-0 text-center">
              <div className="mx-auto grid place-items-center w-9 h-9 rounded-full bg-accent/15 text-accent"><I size={17} /></div>
              <b className="block text-sm mt-1">{t}</b><span className="hidden sm:block text-[11px] text-muted leading-snug">{d}</span>
            </div>
            {i < steps.length - 1 && <ChevronRight size={16} className="text-muted mt-2.5 shrink-0" />}
          </li>
        ))}
      </ol>
    </div>
  )
  return (
    <section aria-label="How Plugsy works" className="grid lg:grid-cols-[3fr_2fr] gap-3">
      <Row who="How Plugsy works · drivers" steps={[[Search, 'Find', 'See free chargers near you'], [CalendarCheck, 'Book', 'Pick a time slot'], [Zap, 'Charge', 'Plug in at the host’s'], [IndianRupee, 'Pay', 'Only for energy used']]} />
      <Row who="For hosts" steps={[[Plug, 'List', 'Add your charger, price and hours'], [CalendarCheck, 'Get bookings', 'Drivers book slots'], [Wallet, 'Earn', 'Money for every kWh']]} />
    </section>
  )
}

function HomeChargers() {
  const theme = useTheme()[0]
  const real = useHomeChargers()
  const u = useUser()
  const map = useRef<MapBaseHandle>(null)
  const [me, setMe] = useState<[number, number] | null>(null)
  const [type, setType] = useState<'all' | 'AC' | 'DC'>('all')
  const [freeOnly, setFreeOnly] = useState(false)
  const [book, setBook] = useState<HomeCharger | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const requireLogin = useRequireLogin()
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition((p) => { const pos: [number, number] = [p.coords.longitude, p.coords.latitude]; setMe(pos); map.current?.fly(pos[0], pos[1], 12) }, () => {}, { maximumAge: 600000, timeout: 8000 })
    map.current?.fly(77.21, 28.58, 10.5)
  }, [])
  const samples = useSamples(me)
  const base = useMemo(() => [...(real ?? []).map((c) => ({ ...c, rating: 4.6, reviews: 0 }) as Listing), ...samples], [real, samples])
  const live = useLiveStatus(base)
  const origin = useMemo<[number, number]>(() => me ?? [77.21, 28.58], [me])
  const rows = useMemo(() => live
    .filter((c) => c.host_id !== u?.id && (type === 'all' || c.type === type) && (!freeOnly || c.status === 'free'))
    .map((c) => ({ c, d: haversineKm(origin[1], origin[0], c.lat, c.lon) }))
    .sort((a, b) => a.d - b.d), [live, u, type, freeOnly, origin])
  const sel = live.find((c) => c.id === selId) ?? null
  const alts = useMemo(() => (sel && sel.status !== 'free' ? live.filter((c) => c.status === 'free' && c.id !== sel.id)
    .map((c) => ({ c, d: haversineKm(sel.lat, sel.lon, c.lat, c.lon) })).sort((a, b) => a.d - b.d).slice(0, 3) : []), [sel, live])
  const counts = useMemo(() => Object.fromEntries((['free', 'busy', 'booked', 'offline'] as PlugStatus[]).map((s) => [s, live.filter((c) => c.status === s).length])), [live])
  const choose = (c: Listing) => { setSelId(c.id); map.current?.fly(c.lon, c.lat, 14) }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {(['all', 'AC', 'DC'] as const).map((t) => <button key={t} onClick={() => setType(t)} className={`pill ${type === t ? 'pill-primary' : ''}`}>{t === 'all' ? 'All' : t === 'DC' ? 'DC fast' : 'AC'}</button>)}
        <button onClick={() => setFreeOnly(!freeOnly)} aria-pressed={freeOnly} className={`pill ${freeOnly ? 'pill-primary' : ''}`}>Free now only</button>
        <span className="chip text-warn border-warn/30 bg-warn/10">Pilot demo — sample listings</span>
        <span className="text-xs text-muted flex items-center gap-1 ml-auto"><span className="w-2 h-2 rounded-full bg-ok animate-pulse" />Status updates live</span>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-4">
        <div className="map-card h-[460px] md:h-[600px]">
          <MapBase ref={map} basemap={theme} deck={(_, { ScatterplotLayer }) => ({
            layers: [new ScatterplotLayer<Listing>({
              id: 'home', data: rows.map((r) => r.c), getPosition: (c) => [c.lon, c.lat], radiusUnits: 'pixels', getRadius: (c) => (c.id === selId ? 11 : 7), pickable: true,
              stroked: true, lineWidthMinPixels: 2, getFillColor: (c) => STATUS[c.status][2], getLineColor: (c) => (c.id === selId ? [17, 24, 39] : [255, 255, 255]),
              updateTriggers: { getFillColor: live, getRadius: selId, getLineColor: selId }, transitions: { getFillColor: 400 },
              onClick: (i: PickingInfo) => { if (i.object) setSelId((i.object as Listing).id) },
            })],
            getTooltip: ({ object }: PickingInfo) => { const c = object as Listing | undefined; return c ? tooltipBox(`<b>${c.host_name}’s charger · ${c.area}</b><br/>${c.type} ${c.power_kw} kW · ₹${c.price_kwh}/kWh<br/>${STATUS[c.status][0]}${c.status === 'busy' && c.mins ? ` · free in ~${c.mins} min` : ''}`) : null },
          })}>
            {({ Marker }) => me && <Marker longitude={me[0]} latitude={me[1]}><div className="me-dot" aria-label="You are here" /></Marker>}
          </MapBase>
          <div className="absolute left-3 bottom-3 glass p-3 no-print text-[11px] space-y-1">
            {(['free', 'busy', 'booked', 'offline'] as PlugStatus[]).map((s) => (
              <div key={s} className="flex items-center gap-1.5 tnum"><span className="w-2.5 h-2.5 rounded-full ring-2 ring-white" style={{ background: rgb(s) }} />{STATUS[s][0]}{s === 'busy' ? ' (in use)' : ''} · {counts[s]}</div>
            ))}
          </div>
        </div>
        <div className="space-y-3 min-w-0">
          {sel && (
            <article className="card p-4 border-accent/40">
              <div className="flex items-start justify-between gap-2"><Status s={sel.status} mins={sel.mins} /><button className="icon-btn !w-7 !h-7" onClick={() => setSelId(null)} aria-label="Close"><X size={14} /></button></div>
              <ChargerCard c={sel} d={haversineKm(origin[1], origin[0], sel.lat, sel.lon)} onBook={() => requireLogin(() => setBook(sel))} flat />
              {alts.length > 0 && (
                <div className="mt-3 rounded-xl bg-[#f97316]/10 border border-[#f97316]/30 p-3">
                  <div className="text-sm font-semibold">{STATUS[sel.status][0]} — nearest free chargers:</div>
                  <ul className="mt-1.5 space-y-1">{alts.map(({ c, d }) => (
                    <li key={c.id}><button className="w-full text-left text-sm flex justify-between gap-2 hover:underline" onClick={() => choose(c)}><span className="truncate">{c.host_name} · {c.area} · {c.type} {c.power_kw} kW</span><span className="tnum text-muted shrink-0">{kmText(d)}</span></button></li>
                  ))}</ul>
                </div>
              )}
            </article>
          )}
          <div className="text-xs text-muted">{rows.length} home chargers · nearest to {me ? 'you' : 'central Delhi (allow location to see yours)'}</div>
          <ul className="space-y-2 max-h-[520px] overflow-auto pr-1" data-lenis-prevent>
            {rows.slice(0, 40).map(({ c, d }) => (
              <li key={c.id}>
                <button onClick={() => choose(c)} className={`w-full text-left card p-3 flex items-center gap-3 hover:bg-hover ${c.id === selId ? '!border-accent' : ''}`}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: rgb(c.status) }} aria-hidden />
                  <span className="min-w-0 flex-1"><b className="block text-sm truncate">{c.host_name} · {c.area}</b>
                    <span className="text-xs text-muted">{c.type} {c.power_kw} kW · ₹{c.price_kwh}/kWh · ★ {c.rating}</span></span>
                  <span className="text-right shrink-0"><span className="block text-xs tnum">{kmText(d)}</span><span className="text-[11px] text-muted">{STATUS[c.status][0]}{c.status === 'busy' && c.mins ? ` ~${c.mins}m` : ''}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <BookDialog c={book} onClose={() => setBook(null)} />
    </div>
  )
}

function ChargerCard({ c, d, onBook, flat }: { c: Listing; d: number | null; onBook: () => void; flat?: boolean }) {
  return (
    <div className={flat ? 'mt-2' : 'card p-5'}>
      <div className="flex gap-3">
        <div className="w-16 h-16 rounded-xl bg-[linear-gradient(135deg,var(--bg-2),var(--active))] border border-line grid place-items-center text-muted shrink-0" aria-label="Photo placeholder"><Camera size={18} /></div>
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{c.title}</h3>
          <p className="text-sm text-muted flex items-center gap-1"><MapPin size={13} />{c.area} (approx.){d != null ? ` · ${kmText(d)}` : ''}</p>
          <p className="text-xs mt-0.5">Host {c.host_name} · <span className="text-warn">★ {c.rating}</span> <span className="text-muted">({c.reviews})</span> {c.verified ? <span className="text-ok">· Verified</span> : <span className="text-muted">· Verification pending</span>}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <span className="chip"><Zap size={11} />{c.type} {c.power_kw} kW</span><span className="chip"><Plug size={11} />{c.connector}</span><span className="chip">{c.hours}</span>
        {c.sample && <span className="chip text-warn border-warn/30">Sample listing</span>}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span><b className="text-lg tnum">₹{c.price_kwh}</b><span className="text-xs text-muted"> / kWh</span></span>
        <button className="btn btn-primary !py-2" disabled={c.status === 'offline'} onClick={onBook}>{c.status === 'offline' ? 'Offline' : c.status === 'free' ? 'Book now' : 'Book a later slot'}</button>
      </div>
    </div>
  )
}

function BookDialog({ c, onClose }: { c: HomeCharger | null; onClose: () => void }) {
  const [step, setStep] = useState<'slot' | 'pay' | 'done'>('slot')
  const [start, setStart] = useState(() => localInput(Date.now() + 3600e3))
  const [hours, setHours] = useState(2)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Booking | null>(null)
  useEffect(() => { if (c) { setStep('slot'); setDone(null) } }, [c])
  if (!c) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const energy = c.power_kw * hours * 0.9
  const amount = Math.round(energy * c.price_kwh + 10)
  const pay = async () => {
    setBusy(true)
    try { const b = await createBooking(c, new Date(start).toISOString(), hours); setDone(b); setStep('done'); toast.success('Booking confirmed') }
    catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={!!c} onClose={onClose} title={step === 'done' ? 'Booking confirmed' : step === 'pay' ? 'Demo payment' : `Book ${c.title}`}>
      {step === 'slot' && (
        <div className="space-y-4">
          <label className="block"><span className="text-xs text-muted">Start time</span><input type="datetime-local" className="input mt-1" value={start} min={localInput(Date.now())} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="block"><span className="text-xs text-muted">Duration</span>
            <select className="input mt-1" value={hours} onChange={(e) => setHours(Number(e.target.value))}>{[1, 2, 3, 4, 6, 8].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}</select>
          </label>
          <div className="rounded-xl bg-bg-2 border border-line p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted">Energy (about)</span><span className="tnum">{fmt(energy, 1)} kWh</span></div>
            <div className="flex justify-between"><span className="text-muted">₹{c.price_kwh} × kWh + ₹10 service fee</span><b className="tnum">₹{fmt(amount)}</b></div>
            <p className="text-[11px] text-muted">You pay only for energy used. Unused amount is refunded.</p>
          </div>
          <button className="btn btn-primary w-full justify-center" onClick={() => setStep('pay')} disabled={!start}>Continue to payment</button>
        </div>
      )}
      {step === 'pay' && (
        <div className="space-y-4">
          <div className="chip text-warn border-warn/30 bg-warn/10">Demo payment: no money is charged</div>
          <label className="block"><span className="text-xs text-muted">Card number</span><input className="input mt-1 tnum" defaultValue="4242 4242 4242 4242" readOnly /></label>
          <div className="grid grid-cols-2 gap-2"><input className="input" defaultValue="12/30" readOnly aria-label="Expiry" /><input className="input" defaultValue="123" readOnly aria-label="CVV" /></div>
          <button className="btn btn-primary w-full justify-center" onClick={pay} disabled={busy}><CreditCard size={15} />{busy ? 'Processing…' : `Pay ₹${fmt(amount)} (demo)`}</button>
        </div>
      )}
      {step === 'done' && done && (
        <div className="space-y-3 text-sm">
          <p>Your slot is booked for <b>{new Date(done.start_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</b> ({done.hours} h).</p>
          <div className="rounded-xl bg-ok/10 border border-ok/30 p-3"><div className="text-xs text-muted">Exact address</div><div className="font-medium">{done.address ?? 'Shared in My bookings'}</div></div>
          <Link to="/plugsy?tab=bookings" className="btn btn-ghost w-full justify-center" onClick={onClose}><CalendarCheck size={15} />See my bookings</Link>
        </div>
      )}
    </Modal>
  )
}

function NeedLogin({ what }: { what: string }) {
  return <div className="card p-6 text-sm"><p className="text-muted">Log in to {what}.</p><button className="btn btn-primary mt-3" onClick={openLogin}>Log in</button></div>
}

function MyBookings() {
  const u = useUser()
  const b = useBookings()
  const chargers = useHomeChargers()
  if (!u) return <NeedLogin what="see your bookings" />
  if (!b) return <Skeleton className="h-40" />
  if (!b.mine.length) return <p className="text-sm text-muted">No bookings yet.</p>
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {b.mine.map((x) => {
        const c = chargers?.find((y) => y.id === x.charger_id)
        return (
          <div key={x.id} className="card p-5 text-sm">
            <div className="flex justify-between"><b>{c?.title ?? 'Home charger'}</b><span className="chip text-ok border-ok/30">{x.status}</span></div>
            <p className="text-muted mt-1">{new Date(x.start_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {x.hours} h · ₹{fmt(x.amount)} (demo payment)</p>
            <p className="mt-2 flex items-start gap-1.5"><MapPin size={14} className="text-accent shrink-0 mt-0.5" />{x.address ?? c?.area}</p>
          </div>
        )
      })}
    </div>
  )
}

function Host() {
  const u = useUser()
  const list = useHomeChargers()
  const b = useBookings()
  const [adding, setAdding] = useState(false)
  if (!u) return <NeedLogin what="list and manage your charger" />
  const mine = (list ?? []).filter((c) => c.host_id === u.id)
  const gross = (b?.hosting ?? []).filter((x) => x.status !== 'cancelled').reduce((s, x) => s + x.amount - 10, 0)
  const set = (id: string, s: PlugStatus) => setChargerStatus(id, s).catch((e) => toast.error(e.message))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5"><div className="text-xs text-muted">Chargers listed</div><div className="text-3xl font-semibold tnum">{mine.length}</div></div>
        <div className="card p-5"><div className="text-xs text-muted">Reservations</div><div className="text-3xl font-semibold tnum">{b?.hosting.length ?? '…'}</div></div>
        <div className="card p-5"><div className="text-xs text-muted">Charging income</div><div className="text-3xl font-semibold tnum">₹{fmt(gross)}</div></div>
        <div className="card p-5"><div className="text-xs text-muted">You earn (after {COMMISSION * 100}% fee)</div><div className="text-3xl font-semibold tnum text-ok">₹{fmt(gross * (1 - COMMISSION))}</div></div>
      </div>
      <div className="flex justify-between items-center"><h2 className="font-semibold">My chargers</h2><button className="btn btn-primary" onClick={() => setAdding(true)}><Plug size={15} />Register a charger</button></div>
      {!mine.length ? <p className="text-sm text-muted">You haven’t listed a charger yet.</p> : (
        <div className="grid sm:grid-cols-2 gap-4">
          {mine.map((c) => (
            <div key={c.id} className="card p-5 text-sm">
              <div className="flex justify-between gap-2"><b>{c.title}</b><Status s={c.status} /></div>
              <p className="text-muted mt-1">{c.type} {c.power_kw} kW · {c.connector} · ₹{c.price_kwh}/kWh</p>
              <p className="mt-1 text-xs">{c.verified ? <span className="text-ok">Verified</span> : <span className="text-warn">Verification pending: our team will contact you to check the installation.</span>}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button className="pill" onClick={() => set(c.id, 'busy')}>Simulate plug-in</button>
                <button className="pill" onClick={() => set(c.id, 'free')}>Simulate unplug</button>
                <button className="pill" onClick={() => set(c.id, c.status === 'offline' ? 'free' : 'offline')}>{c.status === 'offline' ? 'Go online' : 'Go offline'}</button>
              </div>
              {(b?.hosting ?? []).filter((x) => x.charger_id === c.id).slice(0, 4).map((x) => (
                <div key={x.id} className="mt-2 text-xs text-muted flex justify-between border-t border-line pt-2"><span>{new Date(x.start_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })} · {x.hours} h</span><span className="tnum">₹{fmt(x.amount)}</span></div>
              ))}
            </div>
          ))}
        </div>
      )}
      <RegisterDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function RegisterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [v, setV] = useState({ title: '', area: '', address: '', type: 'AC' as 'AC' | 'DC', power_kw: 7.4, connector: 'Type 2', price_kwh: 12, hours: '7:00–22:00' })
  const [pos, setPos] = useState<[number, number] | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const f = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: typeof v[k] === 'number' ? Number(e.target.value) : e.target.value })
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setPos([p.coords.longitude, p.coords.latitude]), () => toast.error('Location not available'))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      let p = pos
      if (!p) {
        const r = await fetch(`https://photon.komoot.io/api/?limit=1&bbox=68,6,98,37&q=${encodeURIComponent(v.area)}`).then((x) => x.json()).catch(() => null)
        const c = r?.features?.[0]?.geometry?.coordinates
        if (!c) throw new Error('We could not find that area. Use “Use my location” instead.')
        p = c
      }
      await addHomeCharger({ ...v, lon: p![0], lat: p![1] }, v.address, photos)
      toast.success('Charger registered. It is offline until you switch it on.')
      onClose()
    } catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Register your charger" wide>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3 text-sm">
        <label className="sm:col-span-2"><span className="text-xs text-muted">Listing title</span><input required maxLength={120} className="input mt-1" value={v.title} onChange={f('title')} placeholder="Covered parking, Type 2 wallbox" /></label>
        <label><span className="text-xs text-muted">Area shown publicly</span><input required maxLength={120} className="input mt-1" value={v.area} onChange={f('area')} placeholder="Saket, Delhi" /></label>
        <label><span className="text-xs text-muted">Exact address (private until booked)</span><input required maxLength={300} className="input mt-1" value={v.address} onChange={f('address')} /></label>
        <label><span className="text-xs text-muted">Type</span><select className="input mt-1" value={v.type} onChange={f('type')}><option>AC</option><option>DC</option></select></label>
        <label><span className="text-xs text-muted">Power (kW)</span><input type="number" min={1} max={150} step={0.1} required className="input mt-1" value={v.power_kw} onChange={f('power_kw')} /></label>
        <label><span className="text-xs text-muted">Connector</span><select className="input mt-1" value={v.connector} onChange={f('connector')}>{['Type 2', '15A socket', 'CCS2', 'Bharat AC-001', 'Bharat DC-001', 'CHAdeMO'].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label><span className="text-xs text-muted">Price ₹/kWh ({PRICE_LIMITS.min}–{PRICE_LIMITS.max})</span><input type="number" min={PRICE_LIMITS.min} max={PRICE_LIMITS.max} step={0.5} required className="input mt-1" value={v.price_kwh} onChange={f('price_kwh')} /></label>
        <label><span className="text-xs text-muted">Available hours</span><input className="input mt-1" maxLength={60} value={v.hours} onChange={f('hours')} /></label>
        <label><span className="text-xs text-muted">Photos (up to 4)</span><input type="file" accept="image/*" multiple className="mt-1 block w-full text-xs" onChange={(e) => setPhotos([...(e.target.files ?? [])].slice(0, 4))} /></label>
        <div className="sm:col-span-2 flex items-center gap-2">
          <button type="button" className="pill" onClick={locate}><LocateFixed size={14} />{pos ? 'Location set' : 'Use my location'}</button>
          <span className="text-[11px] text-muted">Shown on the map only to about 500 m.</span>
        </div>
        <button className="btn btn-primary sm:col-span-2 justify-center" disabled={busy}>{busy ? 'Saving…' : 'Submit for verification'}</button>
      </form>
    </Modal>
  )
}

function Install() {
  const [v, setV] = useState<InstallRequest>({ name: '', phone: '', city: '', kind: 'home_ac', notes: '' })
  const [sent, setSent] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await requestInstall(v); setSent(true); toast.success('Request received. We will call you within 2 working days.') } catch (err) { toast.error((err as Error).message) }
  }
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-4">
        {[
          [Home, 'Home AC charger (3.3–7.4 kW)', 'Works on most homes. Uses your existing single-phase supply with a dedicated circuit. Charges a car overnight or a scooter in 3–4 hours.', 'Installation ₹15,000–25,000 · wallbox charger ₹30,000–55,000 extra'],
          [Zap, 'Higher power (11–30 kW)', 'Faster charging, but needs a three-phase connection and a load increase approved by your electricity company (DISCOM). An electrician checks your wiring first.', 'Electrical upgrade ₹40,000–1.5 lakh · charger ₹80,000–5 lakh'],
          [Wrench, 'Service plan', 'Yearly safety check, cleaning and remote support.', '₹2,000–5,000 per year'],
        ].map(([I, t, d, cost]) => {
          const Icon = I as typeof Home
          return (
            <div key={t as string} className="card p-5 text-sm">
              <div className="flex items-center gap-2 font-semibold"><Icon size={17} className="text-accent" />{t as string}</div>
              <p className="text-muted mt-1">{d as string}</p>
              <p className="mt-2 text-xs"><IndianRupee size={12} className="inline" /> {cost as string} <span className="text-muted">(estimated)</span></p>
            </div>
          )
        })}
      </div>
      <div className="card p-5 h-fit">
        <h2 className="font-semibold">Request an installation</h2>
        {sent ? <p className="text-sm text-muted mt-2">Thanks! An installer will call you to arrange a free site visit.</p> : (
          <form onSubmit={submit} className="mt-3 space-y-3 text-sm">
            <input required maxLength={80} className="input" placeholder="Your name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label="Your name" />
            <input required className="input" inputMode="tel" placeholder="Phone number" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} aria-label="Phone number" />
            <input required maxLength={80} className="input" placeholder="City" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} aria-label="City" />
            <select className="input" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as InstallRequest['kind'] })} aria-label="Charger type">
              <option value="home_ac">Home AC charger</option><option value="high_power">Higher power (needs upgrade)</option>
            </select>
            <textarea maxLength={1000} className="input min-h-20" placeholder="Parking type, vehicle, anything else (optional)" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} aria-label="Notes" />
            <button className="btn btn-primary w-full justify-center">Request a site visit</button>
          </form>
        )}
      </div>
    </div>
  )
}

function About() {
  return (
    <div className="grid md:grid-cols-2 gap-4 pt-4">
      <div className="card p-5 text-sm">
        <h2 className="font-semibold mb-3">How Plugsy works</h2>
        <ul className="space-y-2 text-muted">
          <li><b className="text-text">Installation fee:</b> one-time fee when we install a charger for a host.</li>
          <li><b className="text-text">Charging payments:</b> drivers pay per kWh at the host’s price (₹{PRICE_LIMITS.min}–{PRICE_LIMITS.max}).</li>
          <li><b className="text-text">Platform commission:</b> {COMMISSION * 100}% of each charging payment, plus a ₹10 booking fee. The host keeps the rest.</li>
        </ul>
      </div>
      <div className="card p-5 text-sm">
        <h2 className="font-semibold mb-3">Safety and privacy</h2>
        <ul className="space-y-2 text-muted">
          <li className="flex gap-2"><ShieldCheck size={16} className="text-ok shrink-0" />Hosts are verified before they get a “Verified” badge.</li>
          <li className="flex gap-2"><EyeOff size={16} className="text-ok shrink-0" />Only the approximate area is public. The exact address is shown after you book.</li>
          <li className="flex gap-2"><Flag size={16} className="text-ok shrink-0" />Something wrong? Use “Report a problem” on any charger, or contact support from your booking.</li>
        </ul>
      </div>
    </div>
  )
}
