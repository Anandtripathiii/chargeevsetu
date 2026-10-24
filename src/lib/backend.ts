/**
 * One small API for reviews, reports, accounts and Plugsy. Talks to Supabase when VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY are set; otherwise "Demo mode": the same calls backed by localStorage, with
 * live updates between tabs over BroadcastChannel. Supabase's client is imported lazily (not in the first bundle).
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as V from './validate'
import { check } from './validate'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const DEMO = !URL_ || !KEY

let client: Promise<SupabaseClient> | null = null
/** Retries reads (and any request that never reached the server) twice, so a brief Supabase hiccup is invisible. */
async function retryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const safe = !init?.method || init.method === 'GET' || init.method === 'HEAD'
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(input, init)
      if (!safe || i >= 2 || ![502, 503, 504].includes(r.status)) return r
    } catch (e) { if (i >= 2) throw e } // network error: the request never arrived, retrying is safe
    await new Promise((ok) => setTimeout(ok, 400 * 2 ** i))
  }
}
const sb = () => (client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(URL_!, KEY!, { global: { fetch: retryFetch } })))
export const UNAVAILABLE = 'Service temporarily unavailable. Please try again shortly.'

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
const LS = 'evsetu-demo-v2'
interface DemoDB { user: User | null; reviews: Review[]; reports: unknown[]; chargers: HomeCharger[]; bookings: Booking[]; installs: unknown[]; addresses: Record<string, string> }

function seed(): DemoDB {
  return {
    user: null, reviews: [], reports: [], bookings: [], installs: [], addresses: {},
    chargers: [], // sample listings come from lib/plugsy.ts in every mode
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

// Password-recovery links land back here; the dialog then asks for a new password.
let recovering = false
const recSubs = new Set<() => void>()
const setRecovering = (v: boolean) => { recovering = v; recSubs.forEach((f) => f()) }
export const endRecovery = () => setRecovering(false)
export const useRecovering = () => useSyncExternalStore((f) => (recSubs.add(f), () => recSubs.delete(f)), () => recovering)

/** Errors from a link in an email (expired, already used …), read once from the URL hash. */
export const linkError: string | null = (() => {
  const h = new URLSearchParams(location.hash.slice(1))
  const e = h.get('error_description') || h.get('error')
  if (!e) return null
  history.replaceState(null, '', location.pathname + location.search)
  return /expired|invalid/i.test(e) ? 'That email link has expired or was already used. Please ask for a new one.' : e.replace(/\+/g, ' ')
})()

if (!DEMO) sb().then((c) => {
  c.auth.getSession().then(({ data }) => setUser(toUser(data.session?.user)))
  c.auth.onAuthStateChange((e, s) => { setUser(toUser(s?.user)); if (e === 'PASSWORD_RECOVERY') setRecovering(true) })
})

export function useUser(): User | null {
  return useSyncExternalStore((f) => (authSubs.add(f), () => authSubs.delete(f)), () => current)
}

/** Supabase error -> a sentence a first-time visitor understands. */
export function friendly(err: unknown): string {
  const m = (err as { message?: string })?.message ?? String(err)
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password. Try again, or use “Forgot password?”.'
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first: open the link we sent you (check spam too).'
  if (/already registered|already exists/i.test(m)) return 'This email already has an account. Please log in instead.'
  if (/rate limit|too many|security purposes/i.test(m)) return 'Too many tries. Please wait a minute and try again.'
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'Google login is not turned on yet. Please use your email.'
  if (/password.*(at least|short|weak)/i.test(m)) return 'Password must be at least 6 characters.'
  if (/signups? not allowed/i.test(m)) return 'New sign-ups are closed right now.'
  if (/captcha/i.test(m)) return 'Please complete the “I am human” check and try again.'
  if (/too many requests|P0429/i.test(m)) return 'Too many requests. Please wait a while and try again.'
  if (/failed to fetch|network|load failed|fetch failed|50[234]|timeout|upstream/i.test(m)) return UNAVAILABLE
  if (/violates (check|row-level)|permission denied|42501/i.test(m)) return 'That change is not allowed.'
  return m
}
const wrap = async <R extends { data: unknown; error: unknown }>(p: PromiseLike<R>): Promise<R['data']> => { const r = await p; if (r.error) throw new Error(friendly(r.error)); return r.data }
const home = () => location.origin + import.meta.env.BASE_URL

/** Which sign-in methods the Supabase project has switched on (Google only shows when enabled). */
export async function authProviders(): Promise<{ google: boolean }> {
  if (DEMO) return { google: true }
  try { const j = await (await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY! } })).json(); return { google: !!j.external?.google } }
  catch { return { google: false } }
}

const demoLogin = (email: string, name?: string) => { db.user = { id: `u-${email}`, email, name: name || email.split('@')[0] }; save(); setUser(db.user) }

// captchaToken: Cloudflare Turnstile token when VITE_TURNSTILE_SITE_KEY is set (Supabase verifies it)
export async function signInEmail(email: string, captchaToken?: string): Promise<'sent' | 'signed-in'> {
  email = check(V.email, email)
  if (DEMO) { demoLogin(email); return 'signed-in' }
  await wrap((await sb()).auth.signInWithOtp({ email, options: { emailRedirectTo: home(), captchaToken } }))
  return 'sent'
}
/** Returns 'mfa' when the account has 2-step login on and still needs the 6-digit code. */
export async function signInPassword(email: string, password: string, captchaToken?: string): Promise<'ok' | 'mfa'> {
  email = check(V.email, email); check(V.loginPassword, password)
  if (DEMO) { demoLogin(email); return 'ok' }
  const c = await sb()
  await wrap(c.auth.signInWithPassword({ email, password, options: { captchaToken } }))
  const { data } = await c.auth.mfa.getAuthenticatorAssuranceLevel()
  return data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2' ? 'mfa' : 'ok'
}
/** Always 'confirm' unless the project signs people in straight away; never reveals whether the email already exists. */
export async function signUp(email: string, password: string, name: string, captchaToken?: string): Promise<'confirm' | 'signed-in'> {
  email = check(V.email, email); check(V.newPassword, password); name = check(V.personName, name)
  if (DEMO) { demoLogin(email, name); return 'signed-in' }
  const d = await wrap((await sb()).auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: home(), captchaToken } }))
  return d.session ? 'signed-in' : 'confirm'
}
export async function resetPassword(email: string, captchaToken?: string) {
  email = check(V.email, email)
  if (DEMO) return
  await wrap((await sb()).auth.resetPasswordForEmail(email, { redirectTo: home(), captchaToken }))
}
export async function updatePassword(password: string) {
  check(V.newPassword, password)
  if (DEMO) { setRecovering(false); return }
  await wrap((await sb()).auth.updateUser({ password }))
  setRecovering(false)
}

// ---------------- 2-step login (TOTP, Supabase MFA) ----------------
export async function mfaStatus(): Promise<{ on: boolean; factorId?: string }> {
  if (DEMO) return { on: false }
  const { data } = await (await sb()).auth.mfa.listFactors()
  const f = data?.totp.find((x) => x.status === 'verified')
  return { on: !!f, factorId: f?.id }
}
/** Starts enrolment: returns the QR code (SVG data URL) and secret to type into an authenticator app. */
export async function mfaEnroll(): Promise<{ factorId: string; qr: string; secret: string }> {
  if (DEMO) throw new Error('2-step login needs the live service.')
  const d = await wrap((await sb()).auth.mfa.enroll({ factorType: 'totp', friendlyName: `Plugsy ${new Date().toISOString().slice(0, 10)}` }))
  if (!d) throw new Error(UNAVAILABLE)
  return { factorId: d.id, qr: d.totp.qr_code, secret: d.totp.secret }
}
/** Verifies a 6-digit code for a factor (finishes enrolment, or completes a login that needs 2-step). */
export async function mfaVerify(code: string, factorId?: string) {
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code from your authenticator app.')
  const c = await sb()
  const id = factorId ?? (await mfaStatus()).factorId
  if (!id) throw new Error('2-step login is not set up on this account.')
  await wrap(c.auth.mfa.challengeAndVerify({ factorId: id, code }))
}
export async function mfaDisable() {
  const { factorId } = await mfaStatus()
  if (factorId) await wrap((await sb()).auth.mfa.unenroll({ factorId }))
}

/** Delete my account: my photos, then every row I own and the login itself (delete_my_account RPC). */
export async function deleteAccount() {
  const u = need()
  if (DEMO) {
    const mine = new Set(db.chargers.filter((c) => c.host_id === u.id).map((c) => c.id))
    db.reviews = db.reviews.filter((r) => r.user_id !== u.id); db.bookings = db.bookings.filter((b) => b.user_id !== u.id && !mine.has(b.charger_id))
    db.chargers = db.chargers.filter((c) => !mine.has(c.id)); db.user = null; save(); setUser(null); return
  }
  const c = await sb()
  for (const bucket of ['charger-photos', 'report-photos']) {
    const { data } = await c.storage.from(bucket).list(u.id, { limit: 1000 })
    if (data?.length) await c.storage.from(bucket).remove(data.map((f) => `${u.id}/${f.name}`))
  }
  const { error } = await c.rpc('delete_my_account')
  if (error) throw new Error(friendly(error))
  await c.auth.signOut({ scope: 'local' })
  setUser(null)
}
export async function signInGoogle() {
  if (DEMO) return void demoLogin('demo.user@gmail.com')
  await wrap((await sb()).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: home() } }))
}
/** everywhere: also ends the session on every other device. */
export async function signOut(everywhere = false) {
  if (DEMO) { db.user = null; save(); setUser(null); return }
  const { error } = await (await sb()).auth.signOut({ scope: everywhere ? 'global' : 'local' })
  if (error) setUser(null) // local sign-out still clears this tab
}
const need = () => { if (!current) throw new Error('Please log in first'); return current }

// ---------------- reviews & reports ----------------
export async function listReviews(stationId: string): Promise<Review[]> {
  if (DEMO) return db.reviews.filter((r) => r.station_id === stationId).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const { data, error } = await (await sb()).from('reviews').select('id, station_id, user_id, author, rating, body, created_at').eq('station_id', stationId).order('created_at', { ascending: false }).limit(50)
  if (error) throw new Error(friendly(error))
  return data as Review[]
}
export async function addReview(station_id: string, rating: number, body: string) {
  const u = need()
  const r = { ...check(V.review, { station_id, rating, body }), user_id: u.id, author: u.name.slice(0, 100) }
  if (DEMO) { db.reviews.push({ ...r, id: uid(), created_at: now() }); save(); return }
  const { error } = await (await sb()).from('reviews').insert(r)
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'You have already reviewed this station.' : friendly(error))
}
export async function addReport(station_id: string, kind: ReportKind, note: string, photo?: File | null) {
  const u = need()
  ;({ station_id, kind, note } = check(V.report, { station_id, kind, note }))
  if (photo) check(V.photo, photo)
  if (DEMO) { db.reports.push({ station_id, kind, note, user_id: u.id, photo: photo?.name ?? null, created_at: now() }); save(); return }
  const c = await sb()
  let photo_path: string | null = null
  if (photo) {
    photo_path = `${u.id}/${uid()}.${photo.type.split('/')[1].replace('jpeg', 'jpg')}`
    const { error } = await c.storage.from('report-photos').upload(photo_path, photo, { contentType: photo.type })
    if (error) throw new Error(friendly(error))
  }
  const { error } = await c.from('reports').insert({ station_id, kind, note, user_id: u.id, photo_path })
  if (error) throw new Error(friendly(error))
}

// ---------------- Plugsy ----------------
/** All listed home chargers, kept live (Supabase Realtime, or other tabs in Demo mode). */
export function useHomeChargers(): HomeCharger[] | null {
  const [list, setList] = useState<HomeCharger[] | null>(DEMO ? db.chargers : null)
  useEffect(() => {
    if (DEMO) { const f = () => setList([...db.chargers]); subs.add(f); return () => { subs.delete(f) } }
    let live = true, off = () => {}
    sb().then(async (c) => {
      // public columns only, max 100 rows per request
      const load = async () => { const { data } = await c.from('home_chargers').select('id, host_id, host_name, title, area, lon, lat, type, power_kw, connector, price_kwh, hours, status, verified, photos, created_at').order('created_at', { ascending: false }).range(0, 99); if (live) setList((data ?? []) as HomeCharger[]) }
      await load()
      // unique name per hook: removeChannel must not close another listener's channel
      const ch = c.channel(`home_chargers-${uid()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'home_chargers' }, load).subscribe()
      off = () => { c.removeChannel(ch) }
    })
    return () => { live = false; off() }
  }, [])
  return list
}

export async function setChargerStatus(id: string, status: PlugStatus) {
  if (DEMO) { const c = db.chargers.find((x) => x.id === id); if (c) c.status = status; save(); return }
  const { error } = await (await sb()).from('home_chargers').update({ status }).eq('id', id)
  if (error) throw new Error(friendly(error))
}

export const PRICE_LIMITS = { min: 5, max: 30 } // ₹ per kWh
/** Approximate a point to ~500 m so a host's home is never shown exactly before booking. */
export const fuzz = (x: number) => Math.round(x * 200) / 200

export async function addHomeCharger(c: Omit<HomeCharger, 'id' | 'host_id' | 'host_name' | 'status' | 'verified' | 'photos' | 'created_at'>, address: string, photos: File[]) {
  const u = need()
  c = check(V.homeCharger, c); address = check(V.address, address)
  photos.forEach((p) => check(V.photo, p))
  const row = { ...c, lon: fuzz(c.lon), lat: fuzz(c.lat), host_id: u.id, host_name: u.name.slice(0, 100), status: 'offline' as const, verified: false }
  if (DEMO) {
    const id = uid()
    db.chargers.push({ ...row, id, photos: photos.map((p) => p.name), created_at: now() })
    db.addresses[id] = address
    save(); return
  }
  const cl = await sb()
  const paths: string[] = []
  for (const p of photos.slice(0, 4)) {
    const path = `${u.id}/${uid()}.${p.type.split('/')[1].replace('jpeg', 'jpg')}`
    const { error } = await cl.storage.from('charger-photos').upload(path, p, { contentType: p.type })
    if (!error) paths.push(path)
  }
  const { data, error } = await cl.from('home_chargers').insert({ ...row, photos: paths }).select('id').single()
  if (error) throw new Error(friendly(error))
  const { error: e2 } = await cl.from('home_charger_private').insert({ charger_id: data.id, host_id: u.id, address })
  if (e2) throw new Error(friendly(e2))
}

export async function createBooking(ch: HomeCharger, start_at: string, hours: number): Promise<Booking> {
  const u = need()
  check(V.booking, { start_at, hours })
  const amount = Math.round(ch.power_kw * hours * ch.price_kwh * 0.9 + 10) // ~90% of rated power on average + ₹10 platform fee
  // sample (pilot demo) listings are booked locally even when Supabase is connected
  if (DEMO || ch.id.startsWith('sample-')) {
    const b: Booking = { id: uid(), charger_id: ch.id, user_id: u.id, start_at, hours, amount, status: 'confirmed', payment: 'demo', created_at: now(), address: db.addresses[ch.id] ?? `${ch.area} (exact address shared by host)` }
    db.bookings.push(b)
    const c = db.chargers.find((x) => x.id === ch.id); if (c && c.status === 'free') c.status = 'booked'
    save(); return b
  }
  const { data, error } = await (await sb()).rpc('book_charger', { p_charger: ch.id, p_start: start_at, p_hours: hours })
  if (error) throw new Error(friendly(error))
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
      const { data } = await c.from('bookings_view').select('*').order('start_at', { ascending: false }).range(0, 99)
      if (!live || !data) return
      const rows = data as (Booking & { host_id: string })[]
      const local = db.bookings.filter((b) => b.user_id === u.id) // pilot-demo bookings on sample listings
      setRes({ mine: [...local, ...rows.filter((b) => b.user_id === u.id)], hosting: rows.filter((b) => b.host_id === u.id) })
    })
    return () => { live = false }
  }, [u])
  return res
}

export async function requestInstall(r: InstallRequest) {
  r = check(V.install, r)
  if (DEMO) { db.installs.push({ ...r, created_at: now() }); save(); return }
  const { error } = await (await sb()).from('install_requests').insert({ ...r, user_id: current?.id ?? null })
  if (error) throw new Error(friendly(error))
}
