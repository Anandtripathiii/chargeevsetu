import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Layout from './components/Layout'
import { PageSkeleton } from './components/ui'
import Home from './pages/Home' // eager: the landing page paints with the first bundle (LCP)

const MapPage = lazy(() => import('./pages/MapPage'))
const GapAnalysis = lazy(() => import('./pages/GapAnalysis'))
const PlanningLab = lazy(() => import('./pages/PlanningLab'))
const Forecast = lazy(() => import('./pages/Forecast'))
const Delivery = lazy(() => import('./pages/Delivery'))
const Plugsy = lazy(() => import('./pages/Plugsy'))
const NotFound = lazy(() => import('./pages/NotFound'))

const s = (el: React.ReactNode) => <Suspense fallback={<PageSkeleton />}>{el}</Suspense>

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
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
