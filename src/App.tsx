import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Layout from './components/Layout'
import { PageSkeleton } from './components/ui'
import Home from './pages/Home' // eager: the landing page paints with the first bundle (LCP)

const MapPage = lazy(() => import('./pages/MapPage'))
const GapAnalysis = lazy(() => import('./pages/GapAnalysis'))
const Estimation = lazy(() => import('./pages/Estimation'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CaseStudy = lazy(() => import('./pages/CaseStudy'))
const Methodology = lazy(() => import('./pages/Methodology'))
const DataSources = lazy(() => import('./pages/DataSources'))
const Roadmap = lazy(() => import('./pages/Roadmap'))
const About = lazy(() => import('./pages/About'))
const NotFound = lazy(() => import('./pages/NotFound'))

const s = (el: React.ReactNode) => <Suspense fallback={<PageSkeleton />}>{el}</Suspense>

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/map', element: s(<MapPage />) },
      { path: '/gaps', element: s(<GapAnalysis />) },
      { path: '/estimate', element: s(<Estimation />) },
      { path: '/dashboard', element: s(<Dashboard />) },
      { path: '/case-study', element: s(<CaseStudy />) },
      { path: '/methodology', element: s(<Methodology />) },
      { path: '/data-sources', element: s(<DataSources />) },
      { path: '/roadmap', element: s(<Roadmap />) },
      { path: '/about', element: s(<About />) },
      { path: '*', element: s(<NotFound />) },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' })

export default function App() {
  return <RouterProvider router={router} />
}
