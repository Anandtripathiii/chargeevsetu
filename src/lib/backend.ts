/**
 * One small API for reviews, reports, accounts and Plugsy. Talks to Supabase when VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY are set; otherwise "Demo mode": the same calls backed by localStorage, with
 * live updates between tabs over BroadcastChannel. Supabase's client is imported lazily (not in the first bundle).
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const DEMO = !URL_ || !KEY

let client: Promise<SupabaseClient> | null = null
const sb = () => (client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(URL_!, KEY!)))

// ---------------- types ----------------
export interface User { id: string; email: string; name: string }
export interface Review { id: string; station_id: string; user_id: string; author: string; rating: number; body: string; created_at: string }
export type ReportKind = 'broken' | 'wrong_location' | 'blocked' | 'other'
export type PlugStatus = 'free' | 'busy' | 'booked' | 'offline'
export interface HomeCharger {
  id: string; host_id: string; host_name: string; title: string; area: string; lon: number; lat: number // approximate (~500 m)
  type: 'AC' | 'DC'; power_kw: number; connector: string; price_kwh: number; hours: string; status: PlugStatus
  verified: boolean; photos: string[]; created_at: string
}
export interface Booking {
  id: string; charger_id: string; user_id: string; start_at: string; hours: number; amount: number
  status: 'confirmed' | 'cancelled' | 'completed'; payment: 'demo'; created_at: string; address?: string | null
}
export interface InstallRequest { name: string; phone: string; city: string; kind: 'home_ac' | 'high_power'; notes: string }

// ---------------- demo store ----------------
const now = () => new Date().toISOString()
const uid = () => Math.random().toString(36).slice(2, 10)
const LS = 'evsetu-demo-v1'
interface DemoDB { user: User | null; reviews: Review[]; reports: unknown[]; chargers: HomeCharger[]; bookings: Booking[]; installs: unknown[]; addresses: Record<string, string> }

// Sample listings so Plugsy is explorable without a backend; shown only in Demo mode.
const SEED: [string, string, number, number, 'AC' | 'DC', number, string, number, PlugStatus][] = [
  ['Covered parking, Type 2 wallbox', 'Saket, Delhi', 77.216, 28.524, 'AC', 7.4, 'Type 2', 14, 'free'],
  ['Society basement charger', 'Dwarka Sec 10, Delhi', 77.058, 28.581, 'AC', 3.3, '15A socket', 10, 'busy'],
  ['Farmhouse DC charger', 'Gurugram Sec 57', 77.081, 28.423, 'DC', 30, 'CCS2', 21, 'free'],
  ['Villa garage charger', 'Whitefield, Bengaluru', 77.75, 12.97, 'AC', 7.4, 'Type 2', 13, 'free'],
  ['Office lot (evenings)', 'Koramangala, Bengaluru', 77.627, 12.935, 'AC', 11, 'Type 2', 15, 'booked'],
  ['Bungalow charger', 'Baner, Pune', 73.786, 18.559, 'AC', 7.4, 'Type 2', 12, 'free'],
  ['Shop front 2W charging', 'Andheri West, Mumbai', 72.836, 19.136, 'AC', 3.3, '15A socket', 9, 'free'],
  ['Highway dhaba DC', 'Lonavala, Pune Expressway', 73.407, 18.754, 'DC', 25, 'CCS2', 19, 'offline'],
  ['Gated community wallbox', 'Gachibowli, Hyderabad', 78.349, 17.44, 'AC', 7.4, 'Type 2', 12, 'free'],
  ['Independent house charger', 'Anna Nagar, Chennai', 80.209, 13.085, 'AC', 3.3, '15A socket', 10, 'busy'],
  ['Cafe parking charger', 'Salt Lake, Kolkata', 88.417, 22.58, 'AC', 7.4, 'Type 2', 13, 'free'],
  ['Clinic parking charger', 'Vaishali Nagar, Jaipur', 75.743, 26.911, 'AC', 7.4, 'Type 2', 11, 'free'],
]
function seed(): DemoDB {
  return {
    user: null, reviews: [], reports: [], bookings: [], installs: [], addresses: {},
    chargers: SEED.map(([title, area, lon, lat, type, power_kw, connector, price_kwh, status], i) => ({
      id: `demo-${i}`, host_id: `host-${i}`, host_name: ['Aarav', 'Meera', 'Kabir', 'Isha', 'Rohan', 'Ananya'][i % 6], title, area, lon, lat, type, power_kw,
      connector, price_kwh, hours: '7:00–22:00', status, verified: i % 4 !== 3, photos: [], created_at: now(),
    })),
  }
}
let db: DemoDB = (() => { try { return { ...seed(), ...JSON.parse(localStorage.getItem(LS) || '{}') } } catch { return seed() } })()
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(LS) : null
const subs = new Set<() => void>()
const notify = () => subs.forEach((f) => f())
function save() {
  try { localStorage.setItem(LS, JSON.stringify(db)) } catch { /* storage full or blocked: keeps working in memory */ }
  bc?.postMessage('changed')
  notify()
}
bc?.addEventListener('message', () => { try { db = { ...seed(), ...JSON.parse(localStorage.getItem(LS) || '{}') } } catch { /* keep memory copy */ } notify() })

// ---------------- auth ----------------
let current: User | null = DEMO ? db.user : null
const authSubs = new Set<() => void>()
const setUser = (u: User | null) => { current = u; authSubs.forEach((f) => f()) }
const toUser = (u: { id: string; email?: string; user_metadata?: Record<string, string> } | null | undefined): User | null =>
  u ? { id: u.id, email: u.email ?? '', name: u.user_metadata?.full_name || u.user_metadata?.name || (u.email ?? '').split('@')[0] } : null

if (!DEMO) sb().then((c) => {
  c.auth.getSession().then(({ data }) => setUser(toUser(data.session?.user)))
  c.auth.onAuthStateChange((_e, s) => setUser(toUser(s?.user)))
})

export function useUser(): User | null {
  return useSyncExternalStore((f) => (authSubs.add(f), () => authSubs.delete(f)), () => current)
}

export async function signInEmail(email: string): Promise<'sent' | 'signed-in'> {
  if (DEMO) { db.user = { id: `u-${email}`, email, name: email.split('@')[0] }; save(); setUser(db.user); return 'signed-in' }
  const { error } = await (await sb()).auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } })
  if (error) throw error
  return 'sent'
}
export async function signInGoogle() {
  if (DEMO) return signInEmail('demo.user@gmail.com')
  const { error } = await (await sb()).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } })
  if (error) throw error
}
export async function signOut() {
  if (DEMO) { db.user = null; save(); setUser(null); return }
  await (await sb()).auth.signOut()
}
const need = () => { if (!current) throw new Error('Please log in first'); return current }

// ---------------- reviews & reports ----------------
export async function listReviews(stationId: string): Promise<Review[]> {
  if (DEMO) return db.reviews.filter((r) => r.station_id === stationId).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const { data, error } = await (await sb()).from('reviews').select('*').eq('station_id', stationId).order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return data as Review[]
}
export async function addReview(station_id: string, rating: number, body: string) {
  const u = need()
  const r = { station_id, rating, body: body.trim().slice(0, 1000), user_id: u.id, author: u.name }
  if (DEMO) { db.reviews.push({ ...r, id: uid(), created_at: now() }); save(); return }
  const { error } = await (await sb()).from('reviews').insert(r)
  if (error) throw error
}
export async function addReport(station_id: string, kind: ReportKind, note: string, photo?: File | null) {
  const u = need()
  if (photo && (photo.size > 5e6 || !photo.type.startsWith('image/'))) throw new Error('Photo must be an image under 5 MB')
  if (DEMO) { db.reports.push({ station_id, kind, note, user_id: u.id, photo: photo?.name ?? null, created_at: now() }); save(); return }
  const c = await sb()
  let photo_path: string | null = null
  if (photo) {
    photo_path = `${u.id}/${uid()}-${photo.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await c.storage.from('report-photos').upload(photo_path, photo)
    if (error) throw error
  }
  const { error } = await c.from('reports').insert({ station_id, kind, note: note.slice(0, 1000), user_id: u.id, photo_path })
  if (error) throw error
}

// ---------------- Plugsy ----------------
/** All listed home chargers, kept live (Supabase Realtime, or other tabs in Demo mode). */
export function useHomeChargers(): HomeCharger[] | null {
  const [list, setList] = useState<HomeCharger[] | null>(DEMO ? db.chargers : null)
  useEffect(() => {
    if (DEMO) { const f = () => setList([...db.chargers]); subs.add(f); return () => { subs.delete(f) } }
    let live = true, off = () => {}
    sb().then(async (c) => {
      const load = async () => { const { data } = await c.from('home_chargers').select('*').order('created_at'); if (live && data) setList(data as HomeCharger[]) }
      await load()
      const ch = c.channel(`home_chargers-${uid()}`) // unique per hook: removeChannel must not close another listener's channel.on('postgres_changes', { event: '*', schema: 'public', table: 'home_chargers' }, load).subscribe()
      off = () => { c.removeChannel(ch) }
    })
    return () => { live = false; off() }
  }, [])
  return list
}

export async function setChargerStatus(id: string, status: PlugStatus) {
  if (DEMO) { const c = db.chargers.find((x) => x.id === id); if (c) c.status = status; save(); return }
  const { error } = await (await sb()).from('home_chargers').update({ status }).eq('id', id)
  if (error) throw error
}

export const PRICE_LIMITS = { min: 5, max: 30 } // ₹ per kWh
/** Approximate a point to ~500 m so a host's home is never shown exactly before booking. */
export const fuzz = (x: number) => Math.round(x * 200) / 200

export async function addHomeCharger(c: Omit<HomeCharger, 'id' | 'host_id' | 'host_name' | 'status' | 'verified' | 'photos' | 'created_at'>, address: string, photos: File[]) {
  const u = need()
  if (c.price_kwh < PRICE_LIMITS.min || c.price_kwh > PRICE_LIMITS.max) throw new Error(`Price must be ₹${PRICE_LIMITS.min}–${PRICE_LIMITS.max} per kWh`)
  const row = { ...c, lon: fuzz(c.lon), lat: fuzz(c.lat), host_id: u.id, host_name: u.name, status: 'offline' as const, verified: false }
  if (DEMO) {
    const id = uid()
    db.chargers.push({ ...row, id, photos: photos.map((p) => p.name), created_at: now() })
    db.addresses[id] = address
    save(); return
  }
  const cl = await sb()
  const paths: string[] = []
  for (const p of photos.slice(0, 4)) {
    const path = `${u.id}/${uid()}-${p.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await cl.storage.from('charger-photos').upload(path, p)
    if (!error) paths.push(path)
  }
  const { data, error } = await cl.from('home_chargers').insert({ ...row, photos: paths }).select('id').single()
  if (error) throw error
  const { error: e2 } = await cl.from('home_charger_private').insert({ charger_id: data.id, host_id: u.id, address })
  if (e2) throw e2
}

export async function createBooking(ch: HomeCharger, start_at: string, hours: number): Promise<Booking> {
  const u = need()
  const amount = Math.round(ch.power_kw * hours * ch.price_kwh * 0.9 + 10) // ~90% of rated power on average + ₹10 platform fee
  if (DEMO) {
    const b: Booking = { id: uid(), charger_id: ch.id, user_id: u.id, start_at, hours, amount, status: 'confirmed', payment: 'demo', created_at: now(), address: db.addresses[ch.id] ?? `${ch.area} (exact address shared by host)` }
    db.bookings.push(b)
    const c = db.chargers.find((x) => x.id === ch.id); if (c && c.status === 'free') c.status = 'booked'
    save(); return b
  }
  const { data, error } = await (await sb()).rpc('book_charger', { p_charger: ch.id, p_start: start_at, p_hours: hours })
  if (error) throw error
  return data as Booking
}

/** Bookings I made, plus bookings on chargers I host. */
export function useBookings(): { mine: Booking[]; hosting: Booking[] } | null {
  const u = useUser()
  const [res, setRes] = useState<{ mine: Booking[]; hosting: Booking[] } | null>(null)
  useEffect(() => {
    if (!u) { setRes({ mine: [], hosting: [] }); return }
    if (DEMO) {
      const f = () => {
        const myChargers = new Set(db.chargers.filter((c) => c.host_id === u.id).map((c) => c.id))
        setRes({ mine: db.bookings.filter((b) => b.user_id === u.id), hosting: db.bookings.filter((b) => myChargers.has(b.charger_id)) })
      }
      f(); subs.add(f); return () => { subs.delete(f) }
    }
    let live = true
    sb().then(async (c) => {
      // RLS returns only rows where I'm the booker or the host; the view joins the private address for my own bookings
      const { data } = await c.from('bookings_view').select('*').order('start_at', { ascending: false })
      if (!live || !data) return
      const rows = data as (Booking & { host_id: string })[]
      setRes({ mine: rows.filter((b) => b.user_id === u.id), hosting: rows.filter((b) => b.host_id === u.id) })
    })
    return () => { live = false }
  }, [u])
  return res
}

export async function requestInstall(r: InstallRequest) {
  if (!r.name.trim() || !/^[\d +-]{8,15}$/.test(r.phone)) throw new Error('Please enter your name and a valid phone number')
  if (DEMO) { db.installs.push({ ...r, created_at: now() }); save(); return }
  const { error } = await (await sb()).from('install_requests').insert({ ...r, user_id: current?.id ?? null })
  if (error) throw error
}
