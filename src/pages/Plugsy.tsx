import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BadgeCheck, CalendarCheck, CreditCard, EyeOff, Flag, Home, IndianRupee, LocateFixed, MapPin, Plug, PlugZap, ShieldCheck, Wrench, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Container, PageHeader, Skeleton } from '../components/ui'
import { Modal, openLogin, useRequireLogin } from '../components/Account'
import {
  addHomeCharger, createBooking, DEMO, PRICE_LIMITS, requestInstall, setChargerStatus, useBookings, useHomeChargers, useUser,
  type Booking, type HomeCharger, type InstallRequest, type PlugStatus,
} from '../lib/backend'
import { haversineKm } from '../lib/model'
import { kmText } from '../lib/stations'
import { fmt } from '../lib/format'

const TABS = [['find', 'Find a charger'], ['bookings', 'My bookings'], ['host', 'Become a host'], ['install', 'Get one installed']] as const
type Tab = (typeof TABS)[number][0]
const COMMISSION = 0.15

const STATUS: Record<PlugStatus, [string, string]> = {
  free: ['Free', 'text-ok border-ok/30 bg-ok/10'], busy: ['Busy', 'text-warn border-warn/30 bg-warn/10'],
  booked: ['Booked', 'text-crit border-crit/30 bg-crit/10'], offline: ['Offline', 'text-muted border-line bg-active'],
}
const Status = ({ s }: { s: PlugStatus }) => <span className={`chip ${STATUS[s][1]}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{STATUS[s][0]}</span>

export default function Plugsy() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some(([t]) => t === params.get('tab')) ? params.get('tab') : 'find') as Tab
  const setTab = (t: Tab) => setParams(t === 'find' ? {} : { tab: t }, { replace: true })
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><PlugZap className="text-accent" />Plugsy: charge at a neighbour’s</span>}>
        Book a home charger near you, or share yours and earn. Hosts are verified and exact addresses are shared only after booking.
        {DEMO && <span className="block mt-1 text-warn text-xs">Demo mode: listings are samples and payments are not real.</span>}
      </PageHeader>
      <Container className="space-y-5">
        <div className="flex gap-1 overflow-x-auto rounded-full border border-line bg-panel p-1 w-fit max-w-full [scrollbar-width:none]" role="tablist">
          {TABS.map(([t, l]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm rounded-full whitespace-nowrap transition-colors ${tab === t ? 'bg-accent-fill text-[#0b0b0c] font-semibold' : 'text-muted hover:text-text'}`}>{l}</button>
          ))}
        </div>
        {tab === 'find' && <Find />}
        {tab === 'bookings' && <MyBookings />}
        {tab === 'host' && <Host />}
        {tab === 'install' && <Install />}
        <About />
      </Container>
    </>
  )
}

function Find() {
  const list = useHomeChargers()
  const u = useUser()
  const [me, setMe] = useState<[number, number] | null>(null)
  const [type, setType] = useState<'all' | 'AC' | 'DC'>('all')
  const [book, setBook] = useState<HomeCharger | null>(null)
  const requireLogin = useRequireLogin()
  useEffect(() => { navigator.geolocation?.getCurrentPosition((p) => setMe([p.coords.longitude, p.coords.latitude]), () => {}, { maximumAge: 600000, timeout: 8000 }) }, [])
  const rows = useMemo(() => (list ?? [])
    .filter((c) => c.host_id !== u?.id && (type === 'all' || c.type === type))
    .map((c) => ({ c, d: me ? haversineKm(me[1], me[0], c.lat, c.lon) : null }))
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0) || a.c.area.localeCompare(b.c.area)), [list, u, type, me])
  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        {(['all', 'AC', 'DC'] as const).map((t) => <button key={t} onClick={() => setType(t)} className={`pill ${type === t ? 'pill-primary' : ''}`}>{t === 'all' ? 'All' : t === 'DC' ? 'DC fast' : 'AC'}</button>)}
        <span className="text-xs text-muted flex items-center gap-1 ml-auto"><span className="w-2 h-2 rounded-full bg-ok animate-pulse" />Status updates live</span>
      </div>
      {!list ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div> : !rows.length
        ? <p className="text-sm text-muted">No home chargers listed here yet. <button className="text-accent" onClick={() => location.assign('?tab=host')}>Be the first host</button>.</p>
        : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map(({ c, d }) => (
              <article key={c.id} className="card p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2"><Status s={c.status} />{c.verified ? <span className="chip text-ok border-ok/30"><BadgeCheck size={12} />Verified host</span> : <span className="chip text-muted">Verification pending</span>}</div>
                <h3 className="mt-3 font-semibold">{c.title}</h3>
                <p className="text-sm text-muted flex items-center gap-1"><MapPin size={13} />{c.area} (approx.){d != null ? ` · ${kmText(d)}` : ''}</p>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  <span className="chip"><Zap size={11} />{c.type} {c.power_kw} kW</span><span className="chip"><Plug size={11} />{c.connector}</span><span className="chip">{c.hours}</span>
                </div>
                <div className="mt-auto pt-4 flex items-center justify-between">
                  <span><b className="text-lg tnum">₹{c.price_kwh}</b><span className="text-xs text-muted"> / kWh</span></span>
                  <button className="btn btn-primary !py-2" disabled={c.status === 'offline'} onClick={() => requireLogin(() => setBook(c))}>{c.status === 'offline' ? 'Offline' : 'Book a slot'}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      <BookDialog c={book} onClose={() => setBook(null)} />
    </>
  )
}

function BookDialog({ c, onClose }: { c: HomeCharger | null; onClose: () => void }) {
  const [step, setStep] = useState<'slot' | 'pay' | 'done'>('slot')
  const [start, setStart] = useState(() => new Date(Date.now() + 3600e3).toISOString().slice(0, 16))
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
          <label className="block"><span className="text-xs text-muted">Start time</span><input type="datetime-local" className="input mt-1" value={start} min={new Date().toISOString().slice(0, 16)} onChange={(e) => setStart(e.target.value)} /></label>
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
