import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisStyle, chartAnim, tipStyle } from '../../lib/chartStyle'
import { Segmented } from '../../components/controls'
import { CardTitle, Container, Kpi, PageSkeleton, SourceBadge } from '../../components/ui'
import { useData, type DistrictRow, type Forecast, type StateRow, type Summary } from '../../lib/data'
import { buildRegions } from '../../lib/regions'
import { compact, fmt, pct } from '../../lib/format'
import { blendedRatio, chargersNeeded } from '../../lib/model'
import { css, GAP, ramp } from '../../lib/colors'

const Planner = lazy(() => import('../components/Planner'))

const NCR = new Set(['delhi', 'haryana--gurgaon', 'haryana--faridabad', 'uttar-pradesh--gautam-buddha-nagar', 'uttar-pradesh--ghaziabad'])
const inNcr = (id: string) => NCR.has(id) || id.startsWith('delhi--')
const CASES = [['delhi-ncr', 'Delhi NCR'], ['maharashtra', 'Maharashtra'], ['nh-48-delhi-jaipur', 'NH-48 Delhi–Jaipur']] as const

export default function CaseStudy() {
  const [params, setParams] = useSearchParams()
  const slug = params.get('region') ?? 'delhi-ncr'
  const { data: states } = useData<StateRow[]>('states.json')
  const { data: districts } = useData<DistrictRow[]>('districts.json')
  const { data: summary } = useData<Summary>('summary.json')
  const { data: f } = useData<Forecast>('forecast.json')
  const regions = useMemo(() => (states && summary && f ? buildRegions(states, summary, f.vehicle_mix) : null), [states, summary, f])
  const region = regions?.find((r) => r.slug === slug)
  const cases = CASES.filter(([s]) => regions?.some((r) => r.slug === s))

  if (!regions || !districts || !summary || !f) return <PageSkeleton />
  if (!region) return <Container className="py-16"><p className="text-muted">This case-study region isn't available in the current data build. <Link className="text-accent" to="/case-study">Back to Delhi NCR</Link></p></Container>

  const ds = slug === 'delhi-ncr' ? districts.filter((d) => inNcr(d.id))
    : region.kind === 'state' ? districts.filter((d) => d.state === region.name) : []
  const ratio = Math.round(blendedRatio(region.mix, f.target_ratio)) // same rounding as the planner slider
  const epc = region.evs / Math.max(region.chargers, 1)
  const evs2030 = f.scenarios.base['2030'] * (region.evs / f.stock_2026_official)
  const need2030 = chargersNeeded(evs2030, ratio, region.mix, f.target_ratio, region.chargers)
  const mapped = ds.reduce((s, d) => s + d.real_chargers, 0)
  const worst = [...ds].sort((a, b) => b.gap_score - a.gap_score)
  const byEpc = [...ds].sort((a, b) => b.evs_per_charger - a.evs_per_charger).slice(0, 20)

  return (
    <>
      <Container>
        <section className="card p-6 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Region deep-dive</div>
            {cases.length > 1 && <Segmented value={slug} onChange={(v) => setParams({ region: v }, { replace: true })} options={cases.map(([s, n]) => [s, n])} />}
          </div>
          <h2 className="text-3xl sm:text-[44px] leading-[1.08] font-semibold tracking-[-0.035em] mt-3 max-w-4xl">{region.name}: from {fmt(region.chargers)} chargers to the network it needs by 2030</h2>
          <p className="text-muted mt-4 max-w-3xl text-lg leading-relaxed">
            {region.name} has about <b className="text-text">{compact(region.evs)} EVs</b> and <b className="text-text">{fmt(region.chargers)} public chargers</b>,
            or {fmt(epc)} EVs per charger, against a planning target of about {fmt(ratio)}. Under the base scenario EVs reach {compact(evs2030)} by 2030,
            so roughly <b className="text-warn">{fmt(need2030.additional)} more chargers</b> are needed.
          </p>
        </section>
      </Container>

      <Container className="py-10 space-y-12">
        <Chapter n={1} title="Where things stand today">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="EVs on the road (est.)" value={compact(region.evs)} source="derived" sub="VAHAN state totals split by Census vehicle ownership" />
            <Kpi label="Public chargers (est.)" value={fmt(region.chargers)} source="derived" sub="Official state counts scaled to Mar-2026" />
            <Kpi label="EVs per charger" value={fmt(epc)} source="derived" accent={epc > ratio ? 'warn' : undefined} sub={`target ≈ ${fmt(ratio)}`} />
            <Kpi label="Chargers visible in OSM" value={ds.length ? fmt(mapped) : '–'} source="real" sub={ds.length ? `${pct((mapped / Math.max(region.chargers, 1)) * 100)} of the estimated total` : 'corridor: see map'} />
          </div>
        </Chapter>

        {ds.length > 0 && (
          <Chapter n={2} title="Where the gaps are">
            <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4 [&>*]:min-w-0">
              <div className="card p-4">
                <CardTitle right={<SourceBadge type="derived" />}>EVs per public charger by district</CardTitle>
                <div style={{ height: Math.max(260, Math.min(ds.length, 20) * 24) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byEpc} layout="vertical" margin={{ left: 8, right: 24, top: 14 }}>
                      <CartesianGrid stroke="var(--line)" horizontal={false} />
                      <XAxis type="number" tick={axisStyle} />
                      <YAxis type="category" dataKey="name" tick={axisStyle} width={130} interval={0} />
                      <Tooltip contentStyle={tipStyle} formatter={(v) => fmt(Number(v))} cursor={{ fill: 'var(--line)' }} />
                      <ReferenceLine x={ratio} stroke="var(--accent)" strokeDasharray="4 3" label={{ value: `target ${fmt(ratio)}`, fill: 'var(--accent)', fontSize: 11, position: 'top' }} />
                      <Bar dataKey="evs_per_charger" radius={[0, 5, 5, 0]} {...chartAnim}>
                        {byEpc.map((d) => <Cell key={d.id} fill={css(ramp(GAP, d.gap_score / 100))} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card p-4">
                <CardTitle right={<Link to={`/map?state=${slug === 'delhi-ncr' ? 'delhi' : slug}`} className="text-xs text-accent">Open on map →</Link>}>Highest Gap Scores</CardTitle>
                <table className="tbl">
                  <thead><tr><th>District</th><th className="text-right">Gap</th><th className="text-right">National rank</th><th className="text-right">km to charger</th></tr></thead>
                  <tbody>{worst.slice(0, 8).map((d) => (
                    <tr key={d.id}><td>{d.name}</td><td className="text-right tnum font-semibold"><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: css(ramp(GAP, d.gap_score / 100)) }} />{fmt(d.gap_score, 1)}</td><td className="text-right tnum">{d.rank}</td><td className="text-right tnum">{fmt(d.dist_km, 1)}</td></tr>
                  ))}</tbody>
                </table>
                <p className="text-xs text-muted mt-3">In dense districts the problem is <b>capacity</b>: chargers exist within 3 km, but each serves far more EVs than the target. In outer districts it is <b>distance</b>.</p>
              </div>
            </div>
          </Chapter>
        )}

        <Chapter n={ds.length ? 3 : 2} title="What's coming, and the plan">
          <p className="text-muted -mt-2 mb-4 max-w-3xl">Change the scenario, year or service target to stress-test the plan. Every recommended site comes with its top three reasons and the improvement it brings.</p>
          <Suspense fallback={<PageSkeleton />}><Planner region={region} forecast={f} /></Suspense>
        </Chapter>

        <Chapter n={ds.length ? 4 : 3} title="Recommended actions">
          <div className="grid md:grid-cols-3 gap-4">
            <Action t="Fix capacity in the core" d={`Add DC fast hubs of ~10 chargers at the overloaded sites flagged above; about ${fmt(need2030.dc)} of the 2030 requirement must be DC fast for cars, buses and goods vehicles.`} />
            <Action t="Fill distance gaps at the edges" d="Place AC chargers at fuel stations, malls and transit hubs in outer districts where people live more than 3 km from any charger (the MoP 3 km grid guideline)." />
            <Action t="Co-ordinate with the DISCOM" d="Prefer sites within ~2 km of a substation for quick grid connection, and share the site list with DISCOMs early so upgrades are phased in with demand." />
          </div>
        </Chapter>
      </Container>
    </>
  )
}

function Chapter({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-5">
        <span className="text-accent text-sm font-semibold tnum">0{n}</span>
        <h2 className="text-2xl font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

const Action = ({ t, d }: { t: string; d: string }) => (
  <div className="card p-5"><h3 className="font-semibold">{t}</h3><p className="text-sm text-muted mt-2 leading-relaxed">{d}</p></div>
)
