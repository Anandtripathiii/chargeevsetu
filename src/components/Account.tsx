import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarCheck, Loader2, LogOut, Mail, MailCheck, PlugZap, ShieldCheck, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import Turnstile, { TURNSTILE_KEY } from './Turnstile'

const AccountSettings = lazy(() => import('./AccountSettings')) // lazy: it imports Modal from this file
import {
  authProviders, DEMO, endRecovery, friendly, linkError, mfaVerify, resetPassword, signInEmail, signInGoogle, signInPassword, signOut, signUp, updatePassword, useRecovering, useUser,
} from '../lib/backend'

// Login dialog is global: any page can call openLogin() (e.g. "Write a review" while logged out).
let open = false
const subs = new Set<() => void>()
const set = (v: boolean) => { open = v; subs.forEach((f) => f()) }
export const openLogin = () => set(true)
const useOpen = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => open)

/** Runs `f` if logged in, otherwise asks the visitor to log in first. */
export function useRequireLogin() {
  const u = useUser()
  return (f: () => void) => (u ? f() : (toast('Please log in to continue'), openLogin()))
}

export function Modal({ open: isOpen, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-[100] grid place-items-end sm:place-items-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}>
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            className={`card !animate-none w-full ${wide ? 'sm:max-w-xl' : 'sm:max-w-md'} max-h-[90dvh] overflow-auto rounded-b-none sm:rounded-[18px] p-5 sm:p-6`}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold text-lg">{title}</h2>
              <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

type View = 'login' | 'signup' | 'forgot' | 'link'

export function LoginDialog() {
  const isOpen = useOpen()
  const recovering = useRecovering()
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [google, setGoogle] = useState(false)
  const [captcha, setCaptcha] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0) // bump for a fresh challenge (tokens are single-use)
  const [mfa, setMfa] = useState(false)
  const [code, setCode] = useState('')
  const onToken = useCallback((t: string) => setCaptcha(t), [])
  useEffect(() => { if (isOpen) authProviders().then((p) => setGoogle(p.google)) }, [isOpen])
  useEffect(() => { if (linkError) { toast.error(linkError); set(true) } }, [])
  const close = () => { set(false); setSent(null); setError(null); setPassword(''); setMfa(false); setCode('') }
  const go = (v: View) => { setView(v); setError(null); setSent(null) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (TURNSTILE_KEY && !captcha && !mfa) return setError('Please complete the “I am human” check.')
    setBusy(true)
    const t = captcha || undefined
    try {
      if (mfa) { await mfaVerify(code); toast.success('You are logged in'); close() }
      else if (view === 'login') { if ((await signInPassword(email, password, t)) === 'mfa') setMfa(true); else { toast.success('You are logged in'); close() } }
      else if (view === 'signup') {
        const r = await signUp(email, password, name, t)
        // same message whether or not the email already has an account
        if (r === 'confirm') setSent(`If this email can be registered, we sent a confirmation link to ${email}. Open it to activate your account, then log in.`)
        else { toast.success('Account created. You are logged in'); close() }
      } else if (view === 'forgot') { await resetPassword(email, t); setSent('If this email is registered, you’ll get a link to set a new password.') }
      else { const r = await signInEmail(email, t); if (r === 'sent') setSent('If this email is registered, you’ll get a login link. Open it on this device.'); else { toast.success('You are logged in'); close() } }
    } catch (err) { setError(friendly(err)); setCaptcha(''); setCaptchaKey((k) => k + 1) } finally { setBusy(false) }
  }
  const googleIn = async () => { try { await signInGoogle(); if (DEMO) { toast.success('You are logged in'); close() } } catch (err) { setError(friendly(err)) } }

  if (recovering) return <NewPassword />
  const title = { login: 'Log in to ChargeEVSetu', signup: 'Create your account', forgot: 'Reset your password', link: 'Log in with an email link' }[view]
  if (mfa) return (
    <Modal open={isOpen} onClose={close} title="2-step login">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">Open your authenticator app and enter the 6-digit code for ChargeEVSetu.</p>
        <input className="input tnum text-center text-lg tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="6-digit code" autoFocus />
        {error && <p role="alert" className="text-sm text-crit">{error}</p>}
        <button className="btn btn-primary w-full justify-center" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify and log in'}</button>
      </form>
    </Modal>
  )
  return (
    <Modal open={isOpen} onClose={close} title={title}>
      {sent ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-ok/10 border border-ok/30 p-3 text-sm flex gap-2"><MailCheck size={18} className="text-ok shrink-0" />{sent}</div>
          <p className="text-xs text-muted">Did not get it? Check your spam folder, or wait a minute and try again.</p>
          <button className="btn btn-ghost w-full justify-center" onClick={() => go('login')}>Back to log in</button>
        </div>
      ) : (
        <div className="space-y-4">
          {(view === 'login' || view === 'signup') && (
            <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-bg-2 p-1" role="tablist">
              {(['login', 'signup'] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => go(v)} className={`py-1.5 rounded-full text-sm ${view === v ? 'bg-accent-fill text-[#0b0b0c] font-semibold' : 'text-muted'}`}>{v === 'login' ? 'Log in' : 'Sign up'}</button>
              ))}
            </div>
          )}
          {google && (view === 'login' || view === 'signup') && (
            <>
              <button className="btn btn-ghost w-full justify-center" onClick={googleIn}>
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
                Continue with Google
              </button>
              <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
            </>
          )}
          <form onSubmit={submit} className="space-y-3" noValidate>
            {view === 'signup' && (
              <label className="block"><span className="text-xs text-muted">Your name</span>
                <input className="input mt-1" autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" />
              </label>
            )}
            <label className="block"><span className="text-xs text-muted">Email</span>
              <input className="input mt-1" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </label>
            {(view === 'login' || view === 'signup') && (
              <label className="block"><span className="flex justify-between text-xs text-muted">Password{view === 'login' && <button type="button" className="text-accent" onClick={() => go('forgot')}>Forgot password?</button>}</span>
                <input className="input mt-1" type="password" autoComplete={view === 'login' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={view === 'signup' ? 'At least 8 characters, with a number or symbol' : ''} required />
              </label>
            )}
            <Turnstile key={captchaKey} onToken={onToken} />
            {error && <p role="alert" className="text-sm text-crit bg-crit/10 border border-crit/30 rounded-xl p-2.5">{error}</p>}
            <button className="btn btn-primary w-full justify-center" disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              {{ login: 'Log in', signup: 'Create account', forgot: 'Send reset link', link: 'Email me a login link' }[view]}
            </button>
          </form>
          <div className="text-xs text-muted flex flex-wrap justify-between gap-2">
            {view === 'login' && <button className="text-accent" onClick={() => go('link')}>Log in without a password</button>}
            {(view === 'forgot' || view === 'link') && <button className="text-accent" onClick={() => go('login')}>← Back to log in</button>}
            {DEMO && <span className="text-warn">Demo mode: nothing is sent.</span>}
          </div>
          <p className="text-xs text-muted">We only use your email to save your reviews, bookings and chargers.</p>
        </div>
      )}
    </Modal>
  )
}

/** Shown after the visitor opens a "reset password" email link. */
function NewPassword() {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try { await updatePassword(pw); toast.success('Password updated. You are logged in') } catch (err) { setError(friendly(err)) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={endRecovery} title="Set a new password">
      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (at least 8 characters)" aria-label="New password" />
        {error && <p role="alert" className="text-sm text-crit">{error}</p>}
        <button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
    </Modal>
  )
}

export function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
  const u = useUser()
  const [menu, setMenu] = useState(false)
  const [settings, setSettings] = useState(false)
  if (!u) return (
    <button onClick={openLogin} aria-label="Log in" title="Log in"
      className="w-9 h-9 rounded-full grid place-items-center bg-active text-muted hover:text-text ring-2 ring-line transition-colors"><UserRound size={17} /></button>
  )
  const initials = u.name.slice(0, 2).toUpperCase()
  const item = 'flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-hover'
  const go = () => { setMenu(false); onNavigate?.() }
  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setMenu(false)}>
      <button onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Account menu"
        className="w-9 h-9 rounded-full grid place-items-center text-[11px] font-semibold text-[#0b0b0c] bg-[linear-gradient(135deg,#f87171,#fbbf24)] ring-2 ring-line">{initials}</button>
      <AnimatePresence>{menu && (
        <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
          className="absolute right-0 top-full mt-2 z-50 card !animate-none p-2 w-60">
          <div className="px-3 py-2"><div className="text-sm font-medium truncate">{u.name}</div><div className="text-xs text-muted truncate">{u.email}</div></div>
          <Link className={item} to="/plugsy?tab=bookings" onClick={go}><CalendarCheck size={15} />My bookings</Link>
          <Link className={item} to="/plugsy?tab=host" onClick={go}><PlugZap size={15} />My chargers</Link>
          <button className={item} onClick={() => { setSettings(true); go() }}><ShieldCheck size={15} />Security & privacy</button>
          <button className={item} onClick={() => { signOut().then(() => toast.success('You are logged out')); go() }}><LogOut size={15} />Log out</button>
        </motion.div>
      )}</AnimatePresence>
      {settings && <Suspense fallback={null}><AccountSettings open={settings} onClose={() => setSettings(false)} /></Suspense>}
    </div>
  )
}
