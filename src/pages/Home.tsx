import { Link } from 'react-router-dom'
import IndiaSvg from '../components/IndiaSvg'
import { Container, Kpi, Skeleton, SourceBadge } from '../components/ui'
import { Completeness } from '../components/Completeness'
import { useData, type DistrictRow, type Summary } from '../lib/data'
import { compact, fmt, pct } from '../lib/format'

const STEPS = [
  ['Integrate', 'Merge OpenStreetMap charger points with official Ministry of Power counts, VAHAN EV registrations, Census population and highways.', 'M4 7h16M4 12h10M4 17h7'],
  ['Measure', 'Compute EVs per charger, chargers per lakh people, 3 km city coverage and 25 km highway gaps for every state and district.', 'M4 19V9m6 10V5m6 14v-7m4 7H2'],
  ['Score', 'Combine five factors into a transparent 0–100 Gap Score. You can see and change every weight.', 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z'],
  ['Plan', 'Forecast EVs to 2030 and 2035, size the chargers needed, and pick the best new sites with a greedy optimiser.', 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
] as const

export default function Home() {
  const { data: s } = useData<Summary>('summary.json')
  const { data: districts } = useData<DistrictRow[]>('districts.json')
  const top = districts ? [...districts].sort((a, b) => a.rank - b.rank).slice(0, 5) : null

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="absolute inset-0 opacity-70" style={{ background: 'radial-gradient(55% 50% at 78% 35%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%), radial-gradient(40% 40% at 8% 95%, color-mix(in srgb, var(--accent-2) 12%, transparent), transparent 70%)' }} />
        <Container className="relative grid lg:grid-cols-[1.15fr_1fr] gap-10 items-center py-12 lg:py-20">
          <div>
            <div className="chip text-accent border-accent/40 bg-accent/10 mb-5">Techfest IIT Bombay · EV Infrastructure Challenge 1</div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05]">
              Where should India build its <span className="text-accent">next EV chargers?</span>
            </h1>
            <p className="mt-5 text-lg text-muted max-w-xl leading-relaxed">
              <b className="text-text">ChargeEVSetu</b> maps public chargers against VAHAN vehicle data, finds the districts and highways
              that are falling behind, and recommends where new chargers will help most. Open data, open method.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/map" className="btn btn-primary">Open the national map →</Link>
              <Link to="/dashboard" className="btn btn-ghost">Decision dashboard</Link>
              <Link to="/case-study" className="btn btn-ghost">Delhi NCR case study</Link>
            </div>
            <p className="mt-6 text-xs text-muted">Bridging India's EV charging gap · EV data as of {s?.ev_stock_as_of ?? '…'} · every number traces to the <Link to="/data-sources" className="text-accent">Data Sources</Link> page</p>
          </div>
          <IndiaSvg className="max-w-[440px] w-full mx-auto" />
        </Container>
      </section>

      <Container className="py-12">
        <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
          <h2 className="text-2xl font-bold">India at a glance</h2>
          <span className="text-xs text-muted">Badges show whether a number is official, estimated or synthetic</span>
        </div>
        {!s ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Kpi label="Public charging stations" value={fmt(s.public_chargers)} sub={`as of ${s.public_chargers_as_of} (BHEL portal) · ${fmt(s.mapped_chargers)} mapped in OSM`} source="real" />
            <Kpi label="EVs on the road" value={compact(s.ev_stock)} sub={`VAHAN, ${s.ev_stock_as_of}`} source="real" />
            <Kpi label="EVs per public charger" value={fmt(s.evs_per_charger)} sub="National average · planning target ≈ 44" source="real" accent="warn" />
            <Kpi label="NH km with no charger for 25 km" value={s.nh_km_mapped ? pct(s.nh_gap_share) : '…'} sub={s.nh_km_mapped ? `${fmt(s.nh_gap_km)} of ${fmt(s.nh_km_mapped)} km of mapped NH` : 'Highway layer processing'} source="derived" accent="crit" />
            <Kpi label="Districts in critical need" value={fmt(s.critical_districts)} sub={`Gap Score ≥ ${s.critical_threshold}, of ${s.districts} districts`} source="derived" accent="crit" />
          </div>
        )}
      </Container>

      <Container className="py-6">
        <h2 className="text-2xl font-bold mb-6">How it works, in four steps</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(([t, d, icon], i) => (
            <div key={t} className="card p-5 rise" style={{ animationDelay: `${100 + i * 60}ms` }}>
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-accent/15 text-accent grid place-items-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={icon} /></svg>
                </span>
                <span className="text-xs text-muted font-semibold tracking-wider">STEP {i + 1}</span>
              </div>
              <h3 className="mt-3 font-semibold text-lg">{t}</h3>
              <p className="text-sm text-muted mt-1.5 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
        <Link to="/methodology" className="mt-4 inline-block text-sm text-accent">Read the full methodology and formulas →</Link>
      </Container>

      <Container className="pt-12">
        {s ? <Completeness s={s} /> : <Skeleton className="h-48" />}
      </Container>

      <Container className="py-6 pb-12 grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex justify-between items-start gap-2"><h3 className="font-semibold">In cities, capacity matters more than distance</h3><SourceBadge type="derived" /></div>
          <p className="text-4xl font-display font-bold mt-3 tnum">{s ? `${pct(s.urban_coverage_mapped, 0)} → ${pct(s.urban_coverage, 0)}` : '…'}</p>
          <p className="text-sm text-muted mt-1">of urban residents live within 3 km of a charger: mapped chargers only, vs. the full official count. Most city dwellers are near a charger, but each one serves far too many EVs.</p>
        </div>
        <div className="card p-5">
          <div className="flex justify-between items-start gap-2"><h3 className="font-semibold">Most underserved districts</h3><SourceBadge type="derived" /></div>
          {top ? (
            <ol className="mt-3 space-y-1.5 text-sm">
              {top.map((d) => <li key={d.id} className="flex justify-between gap-2"><span className="truncate"><span className="text-muted mr-2">{d.rank}.</span>{d.name}, <span className="text-muted">{d.state}</span></span><b className="tnum">{fmt(d.gap_score, 1)}</b></li>)}
            </ol>
          ) : <Skeleton className="h-32 mt-3" />}
          <Link to="/gaps" className="text-sm text-accent mt-3 inline-block">Full ranking with adjustable weights →</Link>
        </div>
      </Container>
    </>
  )
}
