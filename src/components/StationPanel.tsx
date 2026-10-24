import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Flag, IndianRupee, Navigation, Plug, Star, ThumbsDown, ThumbsUp, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { addReport, addReview, flagReview, listReviews, type ReportKind, type Review } from '../lib/backend'
import { directions, type Station } from '../lib/stations'
import { Modal, useRequireLogin } from './Account'

const NA = <span className="text-muted">Not available</span>

/** Desktop: slides in from the left. Phone: spring bottom sheet, drag down to close. */
export function Sheet({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 767px)').matches
  return (
    <motion.aside aria-label={label} role="dialog"
      className="glass !rounded-b-none md:!rounded-[18px] absolute z-20 inset-x-0 bottom-0 max-h-[72%] md:inset-auto md:left-3 md:top-[72px] md:bottom-3 md:w-[380px] md:max-h-none flex flex-col overflow-hidden"
      initial={phone ? { y: '100%' } : { x: -24, opacity: 0 }} animate={phone ? { y: 0 } : { x: 0, opacity: 1 }} exit={phone ? { y: '100%' } : { x: -24, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      drag={phone ? 'y' : false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, i) => { if (i.offset.y > 120) onClose() }}>
      {phone && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-active shrink-0" aria-hidden />}
      <button className="icon-btn absolute right-3 top-3 z-10" onClick={onClose} aria-label="Close"><X size={16} /></button>
      <div className="overflow-y-auto overscroll-contain p-5 pt-4" data-lenis-prevent>{children}</div>
    </motion.aside>
  )
}

function Stars({ value, onChange, size = 16 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Star size={size} className={n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted'} />
        return onChange
          ? <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} className="hover:scale-110 transition-transform">{icon}</button>
          : <span key={n}>{icon}</span>
      })}
    </span>
  )
}

const REPORTS: [ReportKind, string][] = [['broken', 'Charger not working'], ['wrong_location', 'Wrong location'], ['blocked', 'Blocked / not accessible'], ['other', 'Something else']]

export default function StationPanel({ s, distance, onClose }: { s: Station; distance?: string; onClose: () => void }) {
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [writing, setWriting] = useState(false)
  const [reporting, setReporting] = useState(false)
  const requireLogin = useRequireLogin()
  const refresh = () => listReviews(s.id).then(setReviews, () => setReviews([]))
  useEffect(() => { setReviews(null); refresh() }, [s.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const avg = reviews?.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0
  const good = reviews?.filter((r) => r.rating >= 4) ?? [], bad = reviews?.filter((r) => r.rating <= 2) ?? []
  const row = 'flex gap-3 py-2.5 border-b border-line text-sm'
  return (
    <Sheet onClose={onClose} label={s.name}>
      <div className="pr-10">
        <span className={`chip ${s.dc ? 'text-ok border-ok/30 bg-ok/10' : 'text-text'}`}>{s.dc ? 'DC fast' : 'AC'}{s.swap ? ' · battery swap' : ''}</span>
        <h2 className="mt-2 text-lg font-semibold leading-snug">{s.name}</h2>
        <p className="text-sm text-muted">{s.address ?? s.area}{distance ? ` · ${distance}` : ''}</p>
        {reviews && reviews.length > 0 && <div className="mt-1 flex items-center gap-2 text-sm"><Stars value={avg} size={14} /><span className="tnum">{avg.toFixed(1)}</span><span className="text-muted">({reviews.length})</span></div>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a className="btn btn-primary justify-center" href={directions(s.lat, s.lon)} target="_blank" rel="noreferrer"><Navigation size={15} />Directions</a>
        <button className="btn btn-ghost justify-center" onClick={() => requireLogin(() => setReporting(true))}><Flag size={15} />Report a problem</button>
      </div>

      <div className="mt-4">
        <div className={row}><Zap size={16} className="text-muted shrink-0 mt-0.5" /><div><div className="text-muted text-xs">Operator</div>{s.operator ?? NA}</div></div>
        <div className={row}><Plug size={16} className="text-muted shrink-0 mt-0.5" /><div className="min-w-0"><div className="text-muted text-xs">Connectors & power</div>
          {s.plugs.length ? s.plugs.map((p, i) => <div key={i}>{p.type}{p.count ? ` × ${p.count}` : ''}{p.kw ? ` · ${p.kw} kW` : ''}</div>) : s.kw ? `${s.kw} kW` : NA}
          {s.points ? <div className="text-xs text-muted mt-0.5">{s.points} charging point{s.points > 1 ? 's' : ''}</div> : null}
        </div></div>
        <div className={row}><IndianRupee size={16} className="text-muted shrink-0 mt-0.5" /><div><div className="text-muted text-xs">Price</div>{s.price ?? NA}</div></div>
        <div className={row}><Clock size={16} className="text-muted shrink-0 mt-0.5" /><div><div className="text-muted text-xs">Opening hours</div>{s.hours ?? NA}</div></div>
        <div className={row}><span className="w-4 shrink-0 grid place-items-center"><span className="w-2 h-2 rounded-full bg-muted" /></span><div><div className="text-muted text-xs">Live availability</div>{NA}</div></div>
        <p className="text-[11px] text-muted mt-2">Source: {s.src.join(', ')}. Details may be out of date. Tell us if something is wrong.</p>
      </div>

      <section className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Reviews</h3>
          <button className="pill pill-primary" onClick={() => requireLogin(() => setWriting(true))}>Write a review</button>
        </div>
        {!reviews ? <div className="skeleton h-16 mt-3" /> : !reviews.length ? <p className="text-sm text-muted mt-3">No reviews yet. Be the first to share how charging went.</p> : (
          <div className="mt-3 space-y-4">
            <ReviewGroup list={good} title="What people liked" Icon={ThumbsUp} cls="text-ok" />
            <ReviewGroup list={bad} title="Problems people had" Icon={ThumbsDown} cls="text-crit" />
            {reviews.filter((r) => r.rating === 3).slice(0, 3).map((r) => <ReviewItem key={r.id} r={r} />)}
          </div>
        )}
      </section>
      <ReviewDialog open={writing} onClose={() => setWriting(false)} stationId={s.id} onDone={refresh} />
      <ReportDialog open={reporting} onClose={() => setReporting(false)} stationId={s.id} />
    </Sheet>
  )
}

function ReviewGroup({ list, title, Icon, cls }: { list: Review[]; title: string; Icon: typeof ThumbsUp; cls: string }) {
  if (!list.length) return null
  return (
    <div>
      <div className={`text-xs font-semibold flex items-center gap-1.5 ${cls}`}><Icon size={13} />{title}</div>
      {list.slice(0, 3).map((r) => <ReviewItem key={r.id} r={r} />)}
    </div>
  )
}

function ReviewItem({ r }: { r: Review }) {
  const requireLogin = useRequireLogin()
  return (
    <div className="py-2 border-b border-line text-sm">
      <div className="flex items-center gap-2"><Stars value={r.rating} size={12} /><span className="font-medium">{r.author}</span><span className="text-xs text-muted ml-auto">{new Date(r.created_at).toLocaleDateString('en-IN')}</span>
        <button className="text-[11px] text-muted hover:text-crit" title="Report this review" onClick={() => requireLogin(() => flagReview(r.id).then(() => toast.success('Thanks. Our team will check this review.'), (e) => toast.error(e.message)))}>Report</button></div>
      {r.body && <p className="mt-1 text-muted">{r.body}</p>}
    </div>
  )
}

function ReviewDialog({ open, onClose, stationId, onDone }: { open: boolean; onClose: () => void; stationId: string; onDone: () => void }) {
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rating) return toast.error('Please pick a star rating')
    setBusy(true)
    try { await addReview(stationId, rating, body); toast.success('Thanks for your review'); setRating(0); setBody(''); onDone(); onClose() }
    catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Write a review">
      <form onSubmit={submit} className="space-y-4">
        <Stars value={rating} onChange={setRating} size={26} />
        <textarea className="input min-h-28" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Did it work? How long did you wait? Was it easy to find?" aria-label="Your review" />
        <button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? 'Posting…' : 'Post review'}</button>
      </form>
    </Modal>
  )
}

function ReportDialog({ open, onClose, stationId }: { open: boolean; onClose: () => void; stationId: string }) {
  const [kind, setKind] = useState<ReportKind>('broken')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try { await addReport(stationId, kind, note, photo); toast.success('Report sent. Thank you for helping other drivers.'); setNote(''); setPhoto(null); onClose() }
    catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Report a problem">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {REPORTS.map(([k, l]) => (
            <button type="button" key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
              className={`text-sm text-left rounded-xl border px-3 py-2.5 transition-colors ${kind === k ? 'border-accent bg-accent/10' : 'border-line hover:bg-hover'}`}>{l}</button>
          ))}
        </div>
        <textarea className="input min-h-20" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything else we should know? (optional)" aria-label="Details" />
        <label className="block text-sm"><span className="text-xs text-muted">Photo (optional, max 5 MB)</span>
          <input type="file" accept="image/*" className="mt-1 block w-full text-sm file:mr-3 file:btn file:btn-ghost file:border-0" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        <button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
      </form>
    </Modal>
  )
}
