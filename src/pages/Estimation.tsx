import { lazy, Suspense, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Container, PageHeader, PageSkeleton } from '../components/ui'
import { useData, type Forecast, type StateRow, type Summary } from '../lib/data'
import { buildRegions } from '../lib/regions'

// charts + map are heavy: the header and region picker render first
const Planner = lazy(() => import('../components/Planner'))

export default function Estimation() {
  const [params, setParams] = useSearchParams()
  const { data: states } = useData<StateRow[]>('states.json')
  const { data: summary } = useData<Summary>('summary.json')
  const { data: forecast } = useData<Forecast>('forecast.json')
  const regions = useMemo(() => (states && summary && forecast ? buildRegions(states, summary, forecast.vehicle_mix) : null), [states, summary, forecast])
  const region = regions?.find((r) => r.slug === (params.get('region') ?? 'delhi-ncr')) ?? regions?.[0]

  return (
    <>
      <PageHeader title="How many chargers, and where?">
        Pick a state, region or corridor. Choose a growth scenario, a target year and a service standard (EVs per public charger).
        You get the forecast, the chargers required each year, and recommended sites with a "why here" for each one.
      </PageHeader>
      <Container className="mb-4 no-print">
        <label className="text-xs text-muted" htmlFor="region">Region</label>
        <select id="region" className="input !w-80 mt-1 block" value={region?.slug ?? ''} onChange={(e) => setParams({ region: e.target.value }, { replace: true })}>
          {regions && (['india', 'region', 'corridor', 'state'] as const).map((k) => (
            <optgroup key={k} label={{ india: 'National', region: 'Metro regions', corridor: 'Highway corridors', state: 'States & UTs' }[k]}>
              {regions.filter((r) => r.kind === k).map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
            </optgroup>
          ))}
        </select>
      </Container>
      <Container>
        {!region || !forecast ? <PageSkeleton /> : (
          <>
            <h2 className="hidden print:block text-2xl font-semibold mb-2">ChargeEVSetu planning report · {region.name}</h2>
            <Suspense fallback={<PageSkeleton />}><Planner key={region.slug} region={region} forecast={forecast} /></Suspense>
          </>
        )}
      </Container>
    </>
  )
}
