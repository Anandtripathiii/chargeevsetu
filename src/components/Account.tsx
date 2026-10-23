import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarCheck, LogOut, Mail, PlugZap, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { DEMO, signInEmail, signInGoogle, signOut, useUser } from '../lib/backend'

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

export function LoginDialog() {
  const isOpen = useOpen()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const close = () => { set(false); setSent(false) }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error('Please enter a valid email')
    setBusy(true)
    try {
      const r = await signInEmail(email)
      if (r === 'sent') setSent(true); else { toast.success('You are logged in'); close() }
    } catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }
  const google = async () => { try { await signInGoogle(); if (DEMO) { toast.success('You are logged in'); close() } } catch (err) { toast.error((err as Error).message) } }
  return (
    <Modal open={isOpen} onClose={close} title="Log in to ChargeEVSetu">
      {sent ? (
        <p className="text-sm text-muted">We sent a login link to <b className="text-text">{email}</b>. Open it on this device to finish logging in.</p>
      ) : (
        <div className="space-y-4">
          <button className="btn btn-ghost w-full justify-center" onClick={google}>
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <form onSubmit={submit} className="space-y-3">
            <label className="block"><span className="text-xs text-muted">Email</span>
              <input className="input mt-1" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </label>
            <button className="btn btn-primary w-full justify-center" disabled={busy}><Mail size={15} />{busy ? 'Sending…' : DEMO ? 'Log in (demo)' : 'Email me a login link'}</button>
          </form>
          <p className="text-xs text-muted">We only use your email to save your reviews, bookings and chargers.</p>
        </div>
      )}
    </Modal>
  )
}

export function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
  const u = useUser()
  const [menu, setMenu] = useState(false)
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
          <button className={item} onClick={() => { signOut(); go() }}><LogOut size={15} />Log out</button>
        </motion.div>
      )}</AnimatePresence>
    </div>
  )
}
