import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import { useTheme } from '../lib/theme'
import { TEAM } from '../lib/team'

const PRIMARY = [
  ['/map', 'Map'],
  ['/gaps', 'Gap Analysis'],
  ['/estimate', 'Plan & Estimate'],
  ['/dashboard', 'Dashboard'],
  ['/case-study', 'Case Study'],
] as const
const MORE = [
  ['/methodology', 'Methodology'],
  ['/data-sources', 'Data Sources'],
  ['/roadmap', 'Roadmap'],
  ['/about', 'About & Disclosure'],
] as const

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'text-accent bg-accent/10' : 'text-muted hover:text-text'}`

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 shrink-0">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--bg-2)" stroke="var(--line)" />
        <path d="M18 4 8 18h7l-2 10 10-14h-7z" fill="var(--accent)" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-display font-bold tracking-tight">
          Charge<span className="text-accent">EV</span>Setu
        </span>
        <span className="text-[10px] text-muted font-medium tracking-wide mt-0.5">EV Infra Map India</span>
      </span>
    </Link>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  const [theme, toggle] = useTheme()
  const [open, setOpen] = useState(false)
  const isMap = pathname === '/map'
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-50 h-14 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="h-full max-w-[1400px] mx-auto px-4 flex items-center gap-4">
          <Logo />
          <nav className="hidden lg:flex items-center gap-0.5 ml-4" aria-label="Main">
            {PRIMARY.map(([to, label]) => (
              <NavLink key={to} to={to} className={linkCls}>{label}</NavLink>
            ))}
            <div className="relative group">
              <button className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted hover:text-text" aria-haspopup="true">More ▾</button>
              <div className="absolute right-0 top-full pt-1 hidden group-hover:block group-focus-within:block">
                <div className="card !bg-panel-solid p-1.5 w-52 flex flex-col">
                  {MORE.map(([to, label]) => (
                    <NavLink key={to} to={to} className={linkCls}>{label}</NavLink>
                  ))}
                </div>
              </div>
            </div>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggle} className="btn btn-ghost !px-2.5 !py-1.5" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Toggle theme">
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              )}
            </button>
            <button className="lg:hidden btn btn-ghost !px-2.5 !py-1.5" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={open ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
            </button>
          </div>
        </div>
        {open && (
          <nav className="lg:hidden border-b border-line bg-panel-solid px-4 py-3 grid grid-cols-2 gap-1" aria-label="Mobile">
            {[...PRIMARY, ...MORE].map(([to, label]) => (
              <NavLink key={to} to={to} className={linkCls}>{label}</NavLink>
            ))}
          </nav>
        )}
      </header>

      <main key={pathname} className="flex-1 flex flex-col rise min-h-[calc(100dvh-56px)]">
        <Outlet />
      </main>

      {!isMap && (
        <footer className="border-t border-line mt-16">
          <div className="max-w-[1400px] mx-auto px-4 py-8 flex flex-wrap gap-6 justify-between text-sm text-muted">
            <div>
              <Logo />
              <p className="mt-3 text-text font-medium">Bridging India's EV charging gap.</p>
              <p className="mt-1 max-w-md">Built for the Techfest IIT Bombay EV Infrastructure Challenge. Open data, open method, open to scrutiny.</p>
              <p className="mt-3 max-w-md">
                <span className="text-text font-medium">{TEAM.name}</span> · Team ID {TEAM.teamId} · Competition ID {TEAM.competitionId}<br />
                {TEAM.members.map(([n, r]) => r === 'Team Leader' ? `${n} (Leader)` : n).join(', ')}<br />
                <a href={`mailto:${TEAM.contact}`} className="text-accent [overflow-wrap:anywhere]">{TEAM.contact}</a>
              </p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {MORE.map(([to, label]) => <Link key={to} to={to} className="hover:text-text">{label}</Link>)}
            </div>
          </div>
        </footer>
      )}
      <ScrollRestoration />
    </div>
  )
}
