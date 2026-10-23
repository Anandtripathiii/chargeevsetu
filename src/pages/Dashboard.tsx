import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Legend as RLegend,
} from 'recharts'
import { CardTitle, Container, Kpi, PageHeader, PageSkeleton, SourceBadge } from '../components/ui'
import { Segmented } from '../components/controls'
import { axisStyle, tipStyle } from '../lib/chartStyle'
import { useData, type DistrictRow, type Forecast, type StateRow, type Summary } from '../lib/data'
import { compact, fmt, pct } from '../lib/format'
import { downloadCsv } from '../lib/csv'
import { css, GAP, ramp } from '../lib/colors'
import { VEHICLE_TYPES } from '../lib/model'

type Veh = 'all' | (typeof VEHICLE_TYPES)[number]
const MIX_COLORS = ['#2ee6a6', '#19b6d2', '#f5b84a', '#b07cff', '#ef4b5b']

export default function Dashboard() {
  const { data: s } = useData<Summary>('summary.json')
  const { data: states } = useData<StateRow[]>('states.json')
  const { data: districts } = useData<DistrictRow[]>('districts.json')
  const { data: f } = useData<Forecast>('forecast.json')
  const [veh, setVeh] = useState<Veh>('all')
  const [topN, setTopN] = useState<'15' | '36'>('15')
  const [focus, setFocus] = useState('')

  const target = f ? f.blended_ratio : 44
  const rows = useMemo(() => (states ?? []).map((st) => {
    const evs = st.evs * (veh === 'all' ? 1 : st.mix[veh])
    return { ...st, evsV: evs, epc: evs / Math.max(st.chargers, 1) }
  }), [states, veh])

  // header paints immediately; the data-driven body follows
  const header = (
    <PageHeader eyebrow="Decision-support dashboard" title="India's charging gap at a glance">
        One screen for planners: supply against demand by state, growth trends, the most critical districts and data quality.
        Use the filters to focus on a vehicle type or a state.
      </PageHeader>
  )
  if (!s || !states || !districts || !f) return <>{header}<PageSkeleton /></>

  const nat = veh === 'all' ? s.ev_stock : s.ev_stock * f.vehicle_mix[veh]
  const byEpc = [...rows].sort((a, b) => b.epc - a.epc).slice(0, Number(topN))
  const growth = (() => {
    const pts = new Map<number, { year: number; evs?: number; chargers?: number }>()
    f.history.forEach((h) => pts.set(h.year, { year: h.year, evs: h.stock }))
    pts.set(2026.55, { year: 2026.55, evs: s.ev_stock })
    f.charger_history.forEach((c) => {
      const y = Number(c.date.slice(0, 4)) + (Number(c.date.slice(5, 7)) - 1) / 12
      pts.set(y, { ...(pts.get(y) ?? { year: y }), chargers: c.chargers })
    })
    return [...pts.values()].sort((a, b) => a.year - b.year)
  })()
  const scatter = rows.filter((r) => r.evsV > 500)
  const xs = scatter.map((r) => r.evsV)
  const balanced = [{ x: Math.min(...xs), y: Math.min(...xs) / target }, { x: Math.max(...xs), y: Math.max(...xs) / target }]
  const topD = [...districts].filter((d) => !focus || d.state === focus).sort((a, b) => b.gap_score - a.gap_score).slice(0, 10)
  const mix = VEHICLE_TYPES.map((k, i) => ({ name: k, value: f.vehicle_mix[k], fill: MIX_COLORS[i] }))
  const indicators = [...states].sort((a, b) => b.evs_per_charger - a.evs_per_charger).map((r) => ({
    state: r.state, evs_per_charger: Math.round(r.evs_per_charger), chargers_per_lakh: r.chargers_per_lakh,
    chargers_per_100km_nh: r.chargers_per_100km_nh, chargers_per_100km2: r.chargers_per_100km2, urban_coverage_pct: r.coverage,
    fast_share_mapped_pct: r.fast_share_mapped != null ? r.fast_share_mapped * 100 : null, nh_gap_pct: r.nh_km ? (r.nh_gap_km / r.nh_km) * 100 : null,
  }))
  const completeness = [...states].sort((a, b) => b.official_chargers_2025 - a.official_chargers_2025).slice(0, 15)

  return (
    <>
      {header}
      <Container className="space-y-4">
        <div className="card p-4 flex flex-wrap gap-x-8 gap-y-3 items-end no-print">
          <div><div className="text-xs text-muted mb-1.5">Vehicle type</div>
            <Segmented value={veh} onChange={setVeh} options={[['all', 'All EVs'], ...VEHICLE_TYPES.map((t) => [t, t] as [Veh, string])]} /></div>
          <div><div className="text-xs text-muted mb-1.5">States shown</div>
            <Segmented value={topN} onChange={setTopN} options={[['15', 'Top 15'], ['36', 'All 36']]} /></div>
          <label className="block"><span className="text-xs text-muted">Highlight a state</span>
            <select className="input mt-1 !w-56" value={focus} onChange={(e) => setFocus(e.target.value)}>
              <option value="">None</option>{states.map((x) => x.state).sort().map((x) => <option key={x}>{x}</option>)}
            </select></label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Kpi label="Public charging stations" value={fmt(s.public_chargers)} sub={`as of ${s.public_chargers_as_of}`} source="real" />
          <Kpi label={veh === 'all' ? 'EVs on the road' : `${veh} EVs (est.)`} value={compact(nat)} sub={`VAHAN, ${s.ev_stock_as_of}`} source={veh === 'all' ? 'real' : 'derived'} />
          <Kpi label="EVs per public charger" value={fmt(nat / s.public_chargers)} sub={`all-EV target ≈ ${fmt(target)}`} source={veh === 'all' ? 'real' : 'derived'} accent="warn" />
          <Kpi label="Fast (DC) chargers for cars" value={pct((s.fast_car_chargers / s.public_chargers) * 100, 0)} sub={`${fmt(s.fast_car_chargers)} stations`} source="real" />
          <Kpi label="Critical districts" value={fmt(s.critical_districts)} sub={`top 10% by Gap Score (≥ ${fmt(s.critical_threshold, 1)})`} source="derived" accent="crit" />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card p-4">
            <CardTitle right={<SourceBadge type="derived" />}>EVs per public charger by state{veh !== 'all' && ` · ${veh}`}</CardTitle>
            <div style={{ height: Math.max(560, byEpc.length * 22) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byEpc} layout="vertical" margin={{ left: 8, right: 24, top: 14 }}>
                  <CartesianGrid stroke="var(--line)" horizontal={false} />
                  <XAxis type="number" tick={axisStyle} />
                  <YAxis type="category" dataKey="state" tick={axisStyle} width={130} interval={0} />
                  <Tooltip contentStyle={tipStyle} formatter={(v) => fmt(Number(v))} cursor={{ fill: 'var(--line)' }} />
                  {veh === 'all' && <ReferenceLine x={target} stroke="var(--accent)" strokeDasharray="4 3" label={{ value: `target ${fmt(target)}`, fill: 'var(--accent)', fontSize: 11, position: 'top' }} />}
                  <Bar dataKey="epc" name="EVs per charger" radius={[0, 5, 5, 0]} isAnimationActive={false}>
                    {byEpc.map((r) => <Cell key={r.state} fill={r.state === focus ? 'var(--text)' : css(ramp(GAP, Math.min(1, r.epc / (target * 8))))} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-4">
              <CardTitle right={<SourceBadge type="real" title="EV stock: VAHAN (back-calculated from registrations); chargers: PIB / Lok Sabha" />}>EV growth vs charger growth</CardTitle>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={growth} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="year" type="number" domain={[2018, 2026.7]} tick={axisStyle} tickFormatter={(v) => String(Math.floor(v))} ticks={[2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]} />
                    <YAxis yAxisId="ev" tick={axisStyle} tickFormatter={(v) => compact(v)} width={56} />
                    <YAxis yAxisId="ch" orientation="right" tick={axisStyle} tickFormatter={(v) => compact(v)} width={48} />
                    <Tooltip contentStyle={tipStyle} formatter={(v) => fmt(Number(v))} labelFormatter={(v) => String(Math.floor(Number(v)))} />
                    <RLegend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="ev" dataKey="evs" name="EVs on road (left)" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                    <Line yAxisId="ch" dataKey="chargers" name="Public chargers (right)" stroke="#f5b84a" strokeWidth={2.5} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted">EVs on the road grew about 6× since 2021. Public chargers jumped from 12k to 53k in two years, still short of the target ratio.</p>
            </div>
            <div className="card p-4">
              <CardTitle>National EV mix by vehicle type</CardTitle>
              <div className="flex items-center gap-4">
                <div className="h-44 w-44 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={mix} dataKey="value" innerRadius={45} outerRadius={75} paddingAngle={2} isAnimationActive={false} stroke="none" /><Tooltip contentStyle={tipStyle} formatter={(v) => pct(Number(v) * 100)} /></PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="text-sm space-y-1.5">
                  {mix.map((m) => <li key={m.name} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: m.fill }} />{m.name}<b className="ml-2 tnum">{pct(m.value * 100, 1)}</b></li>)}
                  <li className="text-xs text-muted pt-1 flex items-center gap-1.5 flex-wrap"><SourceBadge type="derived" /> from the 2025 VAHAN sales mix (IESA/FADA)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card p-4">
            <CardTitle right={<SourceBadge type="derived" />}>EVs vs chargers by state (log scale)</CardTitle>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ left: 4, right: 16, top: 8 }}>
                  <CartesianGrid stroke="var(--line)" />
                  <XAxis type="number" dataKey="x" name="EVs" scale="log" domain={['auto', 'auto']} tick={axisStyle} tickFormatter={(v) => compact(v)} />
                  <YAxis type="number" dataKey="y" name="Chargers" scale="log" domain={['auto', 'auto']} tick={axisStyle} tickFormatter={(v) => compact(v)} width={50} />
                  <ZAxis range={[60, 60]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                    const p = payload?.[0]?.payload as { name?: string; x: number; y: number } | undefined
                    return p?.name ? <div style={tipStyle} className="px-3 py-2"><b>{p.name}</b><br />EVs {compact(p.x)} · chargers {fmt(p.y)}<br />{fmt(p.x / p.y)} EVs per charger</div> : null
                  }} />
                  <Scatter data={balanced} line={{ stroke: 'var(--accent)', strokeDasharray: '5 4' }} shape={() => <g />} isAnimationActive={false} />
                  <Scatter data={scatter.map((r) => ({ name: r.state, x: r.evsV, y: Math.max(r.chargers, 1) }))} isAnimationActive={false}>
                    {scatter.map((r) => <Cell key={r.state} fill={r.state === focus ? 'var(--text)' : r.epc > target ? '#ef4b5b' : '#2ee6a6'} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted">Dashed line = balanced at {fmt(target)} EVs per charger. Red states sit below it and need more chargers than they have.</p>
          </div>

          <div className="card p-4">
            <CardTitle right={<Link to="/gaps" className="text-xs text-accent">Full ranking →</Link>}>Top 10 critical districts{focus && ` · ${focus}`}</CardTitle>
            <ol className="space-y-2.5">
              {topD.map((d, i) => (
                <li key={d.id} className="grid grid-cols-[22px_1fr_auto] items-center gap-3 text-sm">
                  <span className="text-muted tnum">{i + 1}</span>
                  <div className="min-w-0">
                    <span className="truncate block font-medium">{d.name} <span className="text-muted font-normal">· {d.state}</span></span>
                    <div className="h-1.5 rounded-full bg-line mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${d.gap_score}%`, background: css(ramp(GAP, d.gap_score / 100)) }} /></div>
                  </div>
                  <span className="tnum font-semibold w-10 text-right">{fmt(d.gap_score, 1)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="card p-4">
          <CardTitle right={<SourceBadge type="real" />}>Data quality: chargers mapped in OpenStreetMap vs the official count (15 largest states)</CardTitle>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={completeness} margin={{ left: 4, right: 8, bottom: 40 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="state" tick={{ ...axisStyle, fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={axisStyle} tickFormatter={(v) => compact(v)} />
                <Tooltip contentStyle={tipStyle} formatter={(v) => fmt(Number(v))} cursor={{ fill: 'var(--line)' }} />
                <RLegend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="official_chargers_2025" name="Official (MoP, Aug 2025)" fill="#19b6d2" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="real_chargers" name="Mapped in OSM" fill="#2ee6a6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <CardTitle right={<button className="btn text-xs" onClick={() => downloadCsv('chargeevsetu-state-indicators.csv', indicators)}>Download CSV</button>}>
            Supply vs demand indicators by state
          </CardTitle>
          <ul className="md:hidden space-y-2">
            {indicators.map((r) => (
              <li key={r.state} className="rounded-xl border border-line p-3">
                <div className="flex justify-between gap-2 items-baseline"><span className="font-medium">{r.state}</span>
                  <span className="text-xs text-muted"><b className="text-text tnum text-sm">{fmt(r.evs_per_charger)}</b> EVs / charger</span></div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-2 [&>div]:flex [&>div]:justify-between [&>div]:gap-2 [&_dt]:text-muted [&_dd]:tnum">
                  <div><dt>Per lakh people</dt><dd>{fmt(r.chargers_per_lakh, 1)}</dd></div>
                  <div><dt>Per 100 km NH</dt><dd>{r.chargers_per_100km_nh != null ? fmt(r.chargers_per_100km_nh, 1) : '–'}</dd></div>
                  <div><dt>Per 100 km²</dt><dd>{fmt(r.chargers_per_100km2, 2)}</dd></div>
                  <div><dt>Urban ≤ 3 km</dt><dd>{r.urban_coverage_pct != null ? pct(r.urban_coverage_pct) : '–'}</dd></div>
                  <div><dt>Fast (mapped)</dt><dd>{r.fast_share_mapped_pct != null ? pct(r.fast_share_mapped_pct) : '–'}</dd></div>
                  <div><dt>NH with gaps</dt><dd>{r.nh_gap_pct != null ? pct(r.nh_gap_pct) : '–'}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>State / UT</th><th className="text-right">EVs per charger</th><th className="text-right">Chargers / lakh people</th><th className="text-right">Chargers / 100 km NH</th>
              <th className="text-right">Chargers / 100 km²</th><th className="text-right">Urban pop. ≤ 3 km</th><th className="text-right">Fast share (mapped)</th><th className="text-right">NH length with gaps</th></tr></thead>
            <tbody>{indicators.map((r) => (
              <tr key={r.state}>
                <td className="font-medium">{r.state}</td>
                <td className="text-right tnum">{fmt(r.evs_per_charger)}</td>
                <td className="text-right tnum">{fmt(r.chargers_per_lakh, 1)}</td>
                <td className="text-right tnum">{r.chargers_per_100km_nh != null ? fmt(r.chargers_per_100km_nh, 1) : '–'}</td>
                <td className="text-right tnum">{fmt(r.chargers_per_100km2, 2)}</td>
                <td className="text-right tnum">{r.urban_coverage_pct != null ? pct(r.urban_coverage_pct) : '–'}</td>
                <td className="text-right tnum">{r.fast_share_mapped_pct != null ? pct(r.fast_share_mapped_pct) : '–'}</td>
                <td className="text-right tnum">{r.nh_gap_pct != null ? pct(r.nh_gap_pct) : '–'}</td>
              </tr>
            ))}</tbody>
          </table>
          </div>
          <p className="text-xs text-muted mt-2 flex flex-wrap items-center gap-2"><SourceBadge type="derived" />
            Charger counts are official state totals scaled to {s.public_chargers_as_of}. Fast share uses only OSM points with a power tag; the official national fast-charger share is {pct((s.fast_car_chargers / s.public_chargers) * 100)}.</p>
        </div>
      </Container>
    </>
  )
}
