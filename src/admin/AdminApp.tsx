import { lazy, Suspense } from 'react'
import { createBrowserRouter, NavLink, Outlet, RouterProvider, ScrollRestoration } from 'react-router-dom'
import { Download, Moon, Sun } from 'lucide-react'
import { PageSkeleton } from '../components/ui'
import { useTheme } from '../lib/theme'
import { useExporter } from '../lib/exporter'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const DataMap = lazy(() => import('./pages/DataMap'))
const Estimation = lazy(() => import('./pages/Estimation'))
const CaseStudy = lazy(() => import('./pages/CaseStudy'))
const Methodology = lazy(() => import('./pages/Methodology'))
const DataSources = lazy(() => import('./pages/DataSources'))
const Roadmap = lazy(() => import('./pages/Roadmap'))
const About = lazy(() => import('./pages/About'))

const NAV: [string, string][] = [
  ['/', 'Data quality'], ['/map', 'All layers map'], ['/estimate', 'Estimation'], ['/case-study', 'Case study'],
  ['/methodology', 'Methodology'], ['/data-sources', 'Data sources'], ['/roadmap', 'Roadmap'], ['/about', 'Team & disclosure'],
]

function Shell() {
  const [theme, toggle] = useTheme()
  const exp = useExporter()
  return (
    <>
      <header className="sticky top-0 z-40 bg-bg/85 backdrop-blur-md border-b border-line">
        <div className="max-w-[1440px] mx-auto px-4 h-14 flex items-center gap-3">
          <a href="/" className="text-sm font-semibold shrink-0">Charge<span className="text-accent">EV</span>Setu <span className="chip text-warn border-warn/30 ml-1">Admin</span></a>
          <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none] flex-1">
            {NAV.map(([to, l]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${isActive ? 'bg-active text-text' : 'text-muted hover:text-text'}`}>{l}</NavLink>
            ))}
          </nav>
          <button className="pill" onClick={exp.run}><Download size={14} />{exp.label}</button>
          <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </header>
      <main className="pt-6 pb-16 flex flex-col min-h-[calc(100dvh-56px)]"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>
      <ScrollRestoration />
    </>
  )
}

const router = createBrowserRouter([{
  element: <Shell />,
  children: [
    { path: '/', element: <Dashboard /> }, { path: '/map', element: <DataMap /> }, { path: '/estimate', element: <Estimation /> },
    { path: '/case-study', element: <CaseStudy /> }, { path: '/methodology', element: <Methodology /> }, { path: '/data-sources', element: <DataSources /> },
    { path: '/roadmap', element: <Roadmap /> }, { path: '/about', element: <About /> }, { path: '*', element: <Dashboard /> },
  ],
}], { basename: '/admin' })

export default function AdminApp() { return <RouterProvider router={router} /> }
