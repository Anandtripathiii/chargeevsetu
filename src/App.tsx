import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import { PageSkeleton } from './components/ui'
import Home from './pages/Home' // eager: the landing page paints with the first bundle (LCP)

const MapPage = lazy(() => import('./pages/MapPage'))
const GapAnalysis = lazy(() => import('./pages/GapAnalysis'))
const PlanningLab = lazy(() => import('./pages/PlanningLab'))
const Forecast = lazy(() => import('./pages/Forecast'))
const Delivery = lazy(() => import('./pages/Delivery'))
const Plugsy = lazy(() => import('./pages/Plugsy'))
const NotFound = lazy(() => import('./pages/NotFound'))

const Status = lazy(() => import('./pages/Status'))
const Privacy = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Privacy })))
const Terms = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Terms })))

// every page gets its own error boundary: one crash never blanks the whole site
const s = (el: React.ReactNode) => <ErrorBoundary label="This page"><Suspense fallback={<PageSkeleton />}>{el}</Suspense></ErrorBoundary>

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <ErrorBoundary label="The site"><RouteError /></ErrorBoundary>,
    children: [
      { path: '/', element: <ErrorBoundary label="This page"><Home /></ErrorBoundary> },
      { path: '/status', element: s(<Status />) },
      { path: '/privacy', element: s(<Privacy />) },
      { path: '/terms', element: s(<Terms />) },
      { path: '/map', element: s(<MapPage />) },
      { path: '/gaps', element: s(<GapAnalysis />) },
      { path: '/plan', element: s(<PlanningLab />) },
      { path: '/forecast', element: s(<Forecast />) },
      { path: '/delivery', element: s(<Delivery />) },
      { path: '/plugsy', element: s(<Plugsy />) },
      { path: '*', element: s(<NotFound />) },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' })

export default function App() {
  return <RouterProvider router={router} />
}

/** Router-level errors (e.g. a crash in the layout): rethrow so the boundary shows its friendly card. */
function RouteError(): never { throw new Error('route error') }
