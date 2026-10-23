import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, ScrollRestoration, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import {
  Bell, BookOpen, Calculator, CalendarDays, CircleHelp, Crosshair, Database, Download, FlaskConical, House, LayoutDashboard,
  Map as MapIcon, Milestone, Moon, Search, Settings, Share2, Sun, type LucideIcon,
} from 'lucide-react'
import { useTheme } from '../lib/theme'
import { TEAM } from '../lib/team'
import { useData, type Summary } from '../lib/data'
import { useExporter } from '../lib/exporter'

const NAV: [string, string, LucideIcon][] = [
  ['/', 'Home', House],
  ['/map', 'Map', MapIcon],
  ['/gaps', 'Gap Analysis', Crosshair],
  ['/estimate', 'Estimation', Calculator],
  ['/dashboard', 'Dashboard', LayoutDashboard],
  ['/case-study', 'Case Study', BookOpen],
  ['/methodology', 'Methodology', FlaskConical],
  ['/data-sources', 'Data Sources', Database],
  ['/roadmap', 'Roadmap', Milestone],
]
const TABS: [string, string[]][] = [
  ['Overview', ['/', '/dashboard', '/case-study', '/about']],
  ['Monitoring', ['/map', '/gaps', '/data-sources']],
  ['Planning', ['/estimate', '/roadmap', '/methodology']],
]
const TITLES: Record<string, string> = {
  '/': 'EV charging overview', '/map': 'National EV charging map', '/gaps': 'Gap analysis', '/estimate': 'Plan & estimate',
  '/dashboard': 'Decision dashboard', '/case-study': 'Case study', '/methodology': 'Methodology', '/data-sources': 'Data sources',
  '/roadmap': 'Scalability roadmap', '/about': 'About & disclosure',
}
const PAGES: [string, string][] = [...NAV.map(([to, l]) => [to, l] as [string, string]), ['/about', 'About & Disclosure']]

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

function SideItem({ to, label, Icon, end }: { to: string; label: string; Icon: LucideIcon; end?: boolean }) {
  return (
    <NavLink to={to} end={end} aria-label={label}
      className={({ isActive }) => `group relative grid place-items-center w-11 h-11 shrink-0 rounded-[14px] transition-colors ${isActive ? 'text-text' : 'text-muted hover:text-text hover:bg-hover'}`}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="side-active" transition={{ type: 'spring', stiffness: 520, damping: 40 }}
            className="absolute inset-0 rounded-[14px] bg-active shadow-[inset_0_0_0_1px_var(--line),0_0_22px_-6px_var(--accent-fill)]" />}
          <Icon size={19} strokeWidth={1.8} className={`relative ${isActive ? 'text-accent' : ''}`} />
          <Tip>{label}</Tip>
        </>
      )}
    </NavLink>
  )
}

const Tip = ({ children }: { children: ReactNode }) => (
  <span aria-hidden className="hidden md:block pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-lg bg-panel border border-line px-2.5 py-1 text-xs font-medium text-text shadow-lg opacity-0 -translate-x-2 transition duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0">{children}</span>
)

function Sidebar() {
  return (
    <nav aria-label="Main" className="no-print fixed z-50 inset-x-0 bottom-0 h-[68px] p-2 md:inset-x-auto md:left-0 md:top-0 md:h-dvh md:w-[76px] md:p-2.5">
      <div className="h-full rounded-[20px] bg-panel border border-line shadow-[var(--shadow)] flex md:flex-col items-center gap-1 px-1.5 md:px-0 md:py-3 overflow-x-auto md:overflow-visible">
        <Link to="/" aria-label="ChargeEVSetu home" className="hidden md:grid w-11 h-11 shrink-0 rounded-[14px] place-items-center bg-accent-fill shadow-[0_0_24px_-6px_var(--accent-fill)] mb-4 transition-transform hover:scale-105">
          <LogoMark />
        </Link>
        <div className="flex md:flex-col gap-1 items-center">
          {NAV.map(([to, label, Icon]) => <SideItem key={to} to={to} label={label} Icon={Icon} end={to === '/'} />)}
        </div>
        <div className="md:mt-auto flex md:flex-col gap-1 items-center">
          <a href={`mailto:${TEAM.contact}`} aria-label="Help: contact the team" className="group relative hidden md:grid place-items-center w-11 h-11 rounded-[14px] text-muted hover:text-text hover:bg-hover transition-colors">
            <CircleHelp size={19} strokeWidth={1.8} /><Tip>Help</Tip>
          </a>
          <SideItem to="/about" label="About & settings" Icon={Settings} />
          <Link to="/about" aria-label={`${TEAM.name}: team details`} className="group relative hidden md:grid mt-2 w-9 h-9 rounded-full place-items-center text-[11px] font-semibold text-[#0b0b0c] bg-[linear-gradient(135deg,#b5f23d,#5ad1a0)] ring-2 ring-line">
            MF<Tip>{TEAM.name}</Tip>
          </Link>
        </div>
      </div>
    </nav>
  )
}

function ThemeToggle() {
  const [theme, toggle] = useTheme()
  return (
    <button onClick={toggle} className="icon-btn overflow-hidden" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Toggle theme">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} className="grid" initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

function SearchMenu() {
  const { open, setOpen, ref } = usePopover()
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const hits = PAGES.filter(([, l]) => l.toLowerCase().includes(q.trim().toLowerCase()))
  const go = (to: string) => { nav(to); setOpen(false); setQ('') }
  return (
    <div ref={ref} className="relative">
      <button className="icon-btn" aria-label="Search pages" aria-expanded={open} onClick={() => setOpen(!open)}><Search size={16} /></button>
      <AnimatePresence>{open && (
        <Pop className="w-72">
          <input autoFocus className="input" placeholder="Jump to a page…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search pages"
            onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0][0]) }} />
          <ul className="mt-1.5 max-h-72 overflow-auto">
            {hits.map(([to, l]) => <li key={to}><button className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-hover" onClick={() => go(to)}>{l}</button></li>)}
            {!hits.length && <li className="px-3 py-2 text-sm text-muted">No page matches</li>}
          </ul>
        </Pop>
      )}</AnimatePresence>
    </div>
  )
}

function Notifications({ s }: { s?: Summary }) {
  const { open, setOpen, ref } = usePopover()
  return (
    <div ref={ref} className="relative">
      <button className="icon-btn relative" aria-label="Data updates" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Bell size={16} /><span className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-accent-fill" aria-hidden />
      </button>
      <AnimatePresence>{open && (
        <Pop className="w-80">
          <div className="px-2 py-1.5 text-xs text-muted font-medium">Data updates</div>
          <ul className="text-sm">
            {[
              ['Data pipeline rebuilt', s ? `Generated ${fmtDate(s.generated)}` : '…'],
              ['EV stock (VAHAN)', s ? `As of ${s.ev_stock_as_of}` : '…'],
              ['Public chargers (BHEL portal)', s ? `As of ${s.public_chargers_as_of}` : '…'],
            ].map(([t, d]) => (
              <li key={t} className="px-2 py-2 rounded-lg hover:bg-hover flex gap-3">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-fill shrink-0" aria-hidden />
                <span><span className="block">{t}</span><span className="text-xs text-muted">{d}</span></span>
              </li>
            ))}
          </ul>
          <Link to="/data-sources" onClick={() => setOpen(false)} className="block px-2 py-1.5 text-xs text-accent">All data sources →</Link>
        </Pop>
      )}</AnimatePresence>
    </div>
  )
}

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function TopBar({ pathname, s }: { pathname: string; s?: Summary }) {
  const tab = TABS.find(([, paths]) => paths.includes(pathname))?.[0]
  return (
    <header className="no-print sticky top-0 z-40 bg-bg/80 backdrop-blur-md">
      <div className="h-16 px-4 md:px-6 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="md:hidden grid place-items-center w-8 h-8 rounded-[10px] bg-accent-fill"><LogoMark size={16} /></span>
          <span className="text-sm font-semibold tracking-tight">Charge<span className="text-accent">EV</span>Setu</span>
        </Link>
        <nav aria-label="Sections" className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center gap-1 rounded-full bg-panel border border-line p-1">
          {TABS.map(([label, paths]) => (
            <Link key={label} to={paths[0]} aria-current={tab === label ? 'page' : undefined}
              className={`relative px-4 py-1.5 text-sm rounded-full transition-colors ${tab === label ? 'text-text' : 'text-muted hover:text-text'}`}>
              {tab === label && <motion.span layoutId="tab-active" className="absolute inset-0 rounded-full bg-active" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
              <span className="relative">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <SearchMenu />
          <ThemeToggle />
          <Notifications s={s} />
          <Link to="/about" className="hidden sm:flex items-center gap-2 h-9 pl-1 pr-3.5 rounded-full border border-line bg-panel text-xs font-medium hover:bg-active transition-colors">
            <span className="w-7 h-7 rounded-full grid place-items-center text-[10px] font-semibold text-[#0b0b0c] bg-[linear-gradient(135deg,#b5f23d,#5ad1a0)]">MF</span>
            {TEAM.name}
          </Link>
        </div>
      </div>
    </header>
  )
}

function PageHeading({ title, s, wide }: { title: string; s?: Summary; wide: boolean }) {
  const exp = useExporter()
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = location.href
    try {
      if (navigator.share) await navigator.share({ title: `ChargeEVSetu · ${title}`, url })
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    } catch { /* share sheet dismissed */ }
  }
  return (
    <div className={`${wide ? '' : 'max-w-[1440px] mx-auto'} w-full px-4 md:px-6 pt-2 pb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3`}>
      <h1 className="text-[26px] sm:text-[34px] leading-tight font-semibold tracking-[-0.035em]">{title}</h1>
      <div className="no-print flex flex-wrap items-center gap-2">
        {s && <span className="pill text-muted"><CalendarDays size={14} />Data {fmtDate(s.generated)}</span>}
        <button className="pill" onClick={share}><Share2 size={14} />{copied ? 'Link copied' : 'Share report'}</button>
        <button className="pill pill-primary" onClick={exp.run}><Download size={14} />{exp.label}</button>
      </div>
    </div>
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
          <p className="mt-3 text-text font-medium">Bridging India's EV charging gap.</p>
          <p className="mt-1 max-w-md">Built for the Techfest IIT Bombay EV Infrastructure Challenge. Open data, open method, open to scrutiny.</p>
          <p className="mt-3 max-w-md">
            <span className="text-text font-medium">{TEAM.name}</span> · Team ID {TEAM.teamId} · Competition ID {TEAM.competitionId}<br />
            {TEAM.members.map(([n, r]) => r === 'Team Leader' ? `${n} (Leader)` : n).join(', ')}<br />
            <a href={`mailto:${TEAM.contact}`} className="text-accent [overflow-wrap:anywhere]">{TEAM.contact}</a>
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 content-start">
          {(['/methodology', '/data-sources', '/roadmap', '/about'] as const).map((to) => <Link key={to} to={to} className="hover:text-text">{TITLES[to]}</Link>)}
        </div>
      </div>
    </footer>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const { data: s } = useData<Summary>('summary.json')
  const isMap = pathname === '/map'
  const title = TITLES[pathname] ?? "This page isn't on the map"

  return (
    <MotionConfig reducedMotion="user">
      <Sidebar />
      <div className={`app-shell md:pl-[76px] pb-[68px] md:pb-0 flex flex-col ${isMap ? 'h-dvh' : 'min-h-dvh'}`}>
        <TopBar pathname={pathname} s={s} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.main key={pathname} className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}>
            <PageHeading title={title} s={s} wide={isMap} />
            {outlet}
          </motion.main>
        </AnimatePresence>
        {!isMap && <Footer />}
      </div>
      <ScrollRestoration />
    </MotionConfig>
  )
}
