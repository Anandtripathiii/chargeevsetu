import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, ScrollRestoration, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import {
  Bike, CircleHelp, Crosshair, FlaskConical, House, Map as MapIcon, Menu, Moon, PlugZap, Search, Sun, TrendingUp, type LucideIcon,
} from 'lucide-react'
import { Toaster } from 'sonner'
import { useTheme } from '../lib/theme'
import { DEMO } from '../lib/backend'
import { AccountMenu, LoginDialog } from './Account'

export const NAV: [string, string, LucideIcon][] = [
  ['/', 'Home', House],
  ['/map', 'Charging map', MapIcon],
  ['/gaps', 'Gap analysis', Crosshair],
  ['/plan', 'Planning lab', FlaskConical],
  ['/forecast', 'Forecast', TrendingUp],
  ['/delivery', 'Delivery hubs', Bike],
  ['/plugsy', 'Plugsy', PlugZap],
]
const PHONE = ['/', '/map', '/gaps', '/plan', '/plugsy']

export function LogoMark({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path d="M13.5 2 5 13.5h5.5L9 22l9-12h-5.5z" fill="#0b0b0c" /></svg>
}

/** Closes on outside pointer-down or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return { open, setOpen, ref }
}

const Pop = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
    transition={{ duration: 0.16 }} className={`absolute right-0 top-full mt-2 z-50 card !animate-none p-2 ${className}`}>
    {children}
  </motion.div>
)

const Tip = ({ children }: { children: ReactNode }) => (
  <span aria-hidden className="hidden md:block pointer-events-none absolute top-full mt-2.5 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-lg bg-panel border border-line px-2.5 py-1 text-xs font-medium text-text shadow-lg opacity-0 -translate-y-1 transition duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100">{children}</span>
)

function NavItem({ to, label, Icon, id, showLabel }: { to: string; label: string; Icon: LucideIcon; id: string; showLabel?: boolean }) {
  return (
    <NavLink to={to} end={to === '/'} aria-label={label}
      className={({ isActive }) => `group relative grid place-items-center shrink-0 rounded-[14px] transition-colors ${showLabel ? 'w-14 h-12' : 'w-11 h-11'} ${isActive ? 'text-text' : 'text-muted hover:text-text hover:bg-hover'}`}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId={id} transition={{ type: 'spring', stiffness: 520, damping: 40 }}
            className="absolute inset-0 rounded-[14px] bg-active shadow-[inset_0_0_0_1px_var(--line),0_0_22px_-6px_var(--accent-fill)]" />}
          <span className="relative grid place-items-center gap-0.5">
            <Icon size={19} strokeWidth={1.8} className={isActive ? 'text-accent' : ''} />
            {showLabel && <span className="text-[10px] leading-none">{label.split(' ')[0]}</span>}
          </span>
          {!showLabel && <Tip>{label}</Tip>}
        </>
      )}
    </NavLink>
  )
}

function ThemeToggle() {
  const [theme, toggle] = useTheme()
  return (
    <button onClick={toggle} className="group relative grid place-items-center w-11 h-11 rounded-[14px] text-muted hover:text-text hover:bg-hover overflow-hidden" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} className="grid" initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

function SearchMenu() {
  const { open, setOpen, ref } = usePopover()
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const hits = NAV.filter(([, l]) => l.toLowerCase().includes(q.trim().toLowerCase()))
  const go = (to: string) => { nav(to); setOpen(false); setQ('') }
  const place = () => go(`/map?q=${encodeURIComponent(q.trim())}`)
  return (
    <div ref={ref} className="relative">
      <button className="group relative grid place-items-center w-11 h-11 rounded-[14px] text-muted hover:text-text hover:bg-hover" aria-label="Search" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Search size={18} /><Tip>Search</Tip>
      </button>
      <AnimatePresence>{open && (
        <Pop className="w-[min(20rem,calc(100vw-2rem))]">
          <input autoFocus className="input" placeholder="Search a city, station or page…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search"
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !q.trim()) return
              if (hits.length && q.trim().length > 2 && hits.length < NAV.length) go(hits[0][0]); else place()
            }} />
          <ul className="mt-1.5 max-h-72 overflow-auto">
            {q.trim() && <li><button className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-hover flex items-center gap-2" onClick={place}><MapIcon size={14} className="text-ok" />Find “{q.trim()}” on the map</button></li>}
            {hits.map(([to, l, I]) => <li key={to}><button className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-hover flex items-center gap-2" onClick={() => go(to)}><I size={14} className="text-muted" />{l}</button></li>)}
          </ul>
        </Pop>
      )}</AnimatePresence>
    </div>
  )
}

function Help() {
  const { open, setOpen, ref } = usePopover()
  return (
    <div ref={ref} className="relative hidden sm:block">
      <button className="group relative grid place-items-center w-11 h-11 rounded-[14px] text-muted hover:text-text hover:bg-hover" aria-label="Help" aria-expanded={open} onClick={() => setOpen(!open)}>
        <CircleHelp size={18} /><Tip>Help</Tip>
      </button>
      <AnimatePresence>{open && (
        <Pop className="w-80 text-sm">
          <div className="px-2 py-1.5 font-semibold">Quick help</div>
          <ul className="px-2 pb-2 space-y-2 text-muted">
            <li><b className="text-text">Find a charger:</b> open the map, allow location, or search a city. Zoom in to see green pins.</li>
            <li><b className="text-text">Something wrong?</b> Tap a station and choose “Report a problem”.</li>
            <li><b className="text-text">Share your charger:</b> go to Plugsy → Become a host.</li>
            <li><b className="text-text">Estimates</b> (forecasts, scores, hub areas) are marked “Estimated” and are guides, not guarantees.</li>
          </ul>
        </Pop>
      )}</AnimatePresence>
    </div>
  )
}

function TopBar() {
  return (
    <nav aria-label="Main" className="no-print fixed z-50 inset-x-0 top-0 p-2 md:p-2.5">
      <div className="max-w-[1440px] mx-auto h-[56px] md:h-[60px] rounded-[20px] bg-panel border border-line shadow-[var(--shadow)] flex items-center gap-1 px-2">
        <Link to="/" aria-label="ChargeEVSetu home" className="flex items-center gap-2.5 shrink-0 pr-2">
          <span className="grid w-10 h-10 rounded-[14px] place-items-center bg-accent-fill shadow-[0_0_24px_-6px_var(--accent-fill)] transition-transform hover:scale-105"><LogoMark /></span>
          <span className="hidden lg:block text-sm font-semibold tracking-tight">Charge<span className="text-accent">EV</span>Setu</span>
        </Link>
        <div className="hidden md:flex flex-1 justify-center gap-1">
          {NAV.map(([to, label, Icon]) => <NavItem key={to} to={to} label={label} Icon={Icon} id="top-active" />)}
        </div>
        <div className="ml-auto md:ml-0 flex items-center gap-0.5">
          {DEMO && <span className="chip text-warn border-warn/30 bg-warn/10 mr-1" title="Running without a live backend: data you add stays in this browser">Demo mode</span>}
          <SearchMenu />
          <ThemeToggle />
          <Help />
          <span className="ml-1"><AccountMenu /></span>
        </div>
      </div>
    </nav>
  )
}

function BottomBar() {
  const [more, setMore] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setMore(false), [pathname])
  return (
    <nav aria-label="Main (phone)" className="no-print md:hidden fixed z-50 inset-x-0 bottom-0 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <AnimatePresence>{more && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="card !animate-none mb-2 p-2 grid grid-cols-2 gap-1">
          {NAV.filter(([to]) => !PHONE.includes(to)).map(([to, l, I]) => (
            <Link key={to} to={to} className="flex items-center gap-2 px-3 py-3 rounded-xl hover:bg-hover text-sm"><I size={17} className="text-accent" />{l}</Link>
          ))}
        </motion.div>
      )}</AnimatePresence>
      <div className="h-[64px] rounded-[20px] bg-panel border border-line shadow-[var(--shadow)] flex items-center justify-around px-1">
        {NAV.filter(([to]) => PHONE.includes(to)).map(([to, label, Icon]) => <NavItem key={to} to={to} label={label} Icon={Icon} id="bottom-active" showLabel />)}
        <button onClick={() => setMore(!more)} aria-expanded={more} className="grid place-items-center gap-0.5 w-14 h-12 rounded-[14px] text-muted">
          <Menu size={19} strokeWidth={1.8} /><span className="text-[10px] leading-none">More</span>
        </button>
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer className="no-print max-w-[1440px] w-full mx-auto px-4 md:px-6 mt-16 pb-6">
      <div className="card p-6 flex flex-wrap gap-6 justify-between text-sm text-muted">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-8 h-8 rounded-[10px] bg-accent-fill"><LogoMark size={16} /></span>
            <span className="font-semibold text-text tracking-tight">Charge<span className="text-accent">EV</span>Setu</span>
          </div>
          <p className="mt-3 text-text font-medium">Find, plan and share EV charging across India.</p>
          <p className="mt-1 max-w-md">Charger locations from OpenStreetMap contributors and official government counts. Estimates are clearly marked.</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 content-start">
          {NAV.slice(1).map(([to, l]) => <Link key={to} to={to} className="hover:text-text">{l}</Link>)}
        </div>
      </div>
    </footer>
  )
}

/** Lenis smooth scroll everywhere except the full-screen map (and never for reduced-motion users). */
function useSmoothScroll(off: boolean) {
  useEffect(() => {
    if (off || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let lenis: { destroy: () => void } | undefined, dead = false
    import('lenis').then(({ default: Lenis }) => { if (!dead) lenis = new Lenis({ autoRaf: true, lerp: 0.12 }) })
    return () => { dead = true; lenis?.destroy() }
  }, [off])
}

export default function Layout() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const [theme] = useTheme()
  const isMap = pathname === '/map'
  useSmoothScroll(isMap)
  return (
    <MotionConfig reducedMotion="user">
      <TopBar />
      <BottomBar />
      <div className={`app-shell pt-[72px] md:pt-[80px] ${isMap ? 'h-dvh pb-[80px] md:pb-0' : 'min-h-dvh pb-[88px] md:pb-0'} flex flex-col`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.main key={pathname} className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none', transform: 'none' } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}>
            {outlet}
          </motion.main>
        </AnimatePresence>
        {!isMap && <Footer />}
      </div>
      <LoginDialog />
      <Toaster theme={theme} position="top-center" richColors closeButton />
      <ScrollRestoration />
    </MotionConfig>
  )
}
