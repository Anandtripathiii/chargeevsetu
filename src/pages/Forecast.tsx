import { useMemo, useState } from 'react'
import type { Feature, FeatureCollection } from 'geojson'
import type { PickingInfo } from '@deck.gl/core'
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend as RLegend } from 'recharts'
import MapBase from '../components/LazyMap'
import type { Kit } from '../components/MapBase'
import { Legend } from '../components/mapUtil'
import { Segmented } from '../components/controls'
import { CardTitle, Container, Kpi, PageHeader, Skeleton } from '../components/ui'
import { useData, type DistrictRow, type Forecast as F, type StateRow } from '../lib/data'
import { useTheme } from '../lib/theme'
import { css, gradient, HEAT, quantileScale, ramp } from '../lib/colors'
import { compact, fmt } from '../lib/format'
import { blendedRatio, chargersNeeded, VEHICLE_TYPES } from '../lib/model'
import { axisStyle, chartAnim, tipStyle } from '../lib/chartStyle'
import { tooltipBox } from '../lib/tooltip'

type Scn = 'low' | 'base' | 'high'
const SCN: [Scn, string][] = [['low', 'Slow'], ['base', 'Normal'], ['high', 'Fast']]
const YEARS = ['2027', '2030', '2035'] as const
const VT: Record<string, string> = { '2W': 'Scooters & bikes', '3W': 'Autos & e-rickshaws', '4W': 'Cars', Bus: 'Buses', Goods: 'Goods vehicles' }

export default function Forecast() {
  const [theme] = useTheme()
  const { data: f } = useData<F>('forecast.json')
  const { data: states } = useData<StateRow[]>('states.json')
  const { data: districts } = useData<DistrictRow[]>('districts.json')
  const [mapOn, setMapOn] = useState(false)
  const { data: geo } = useData<FeatureCollection>(mapOn ? 'states.geo.json' : null)
  const [year, setYear] = useState<(typeof YEARS)[number]>('2030')
  const [scn, setScn] = useState<Scn>('base')
  const [state, setState] = useState('')

  const ratio = f ? blendedRatio(f.vehicle_mix, f.target_ratio) : 44
  const national = f?.scenarios[scn][year] ?? 0
  const totalEvs = useMemo(() => (states ?? []).reduce((a, s) => a + s.evs, 0) || 1, [states])

  const rows = useMemo(() => (f && states ? states.map((s) => {
    const evs = national * (s.evs / totalEvs)
    const need = chargersNeeded(evs, ratio, s.mix, f.target_ratio, s.chargers)
    return { name: s.state, evs, now: s.chargers, ...need }
  }).sort((a, b) => b.additional - a.additional) : []), [f, states, national, totalEvs, ratio])
  const byName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows])
  const scale = useMemo(() => quantileScale(rows.map((r) => r.additional), true), [rows])

  const sel = state ? byName.get(state) : null
  const indiaNeed = useMemo(() => (f ? chargersNeeded(national, ratio, f.vehicle_mix, f.target_ratio, rows.reduce((a, r) => a + r.now, 0)) : null), [f, national, ratio, rows])
  const focus = sel ?? (indiaNeed && { name: 'India', evs: national, now: rows.reduce((a, r) => a + r.now, 0), ...indiaNeed })

  const distRows = useMemo(() => {
    if (!sel || !districts || !f) return []
    const st = states!.find((s) => s.state === state)!
    const ds = districts.filter((d) => d.state === state)
    const tot = ds.reduce((a, d) => a + d.evs, 0) || 1
    return ds.map((d) => {
      const evs = sel.evs * (d.evs / tot)
      return { name: d.name, evs, ...chargersNeeded(evs, ratio, st.mix, f.target_ratio, d.chargers) }
    }).sort((a, b) => b.additional - a.additional)
  }, [sel, districts, f, states, state, ratio])

  const chart = useMemo(() => {
    if (!f) return []
    const pts: Record<number, Record<string, number>> = {}
    f.history.forEach((h) => { pts[h.year] = { year: h.year, actual: h.stock } })
    for (const [k] of SCN) for (const [y, v] of Object.entries(f.scenarios[k])) { pts[+y] = { ...(pts[+y] ?? { year: +y }), [k]: v } }
    return Object.values(pts).sort((a, b) => a.year - b.year)
  }, [f])

  const layers = ({ GeoJsonLayer }: Kit) => [geo && new GeoJsonLayer({
    id: 'fc', data: geo, pickable: true, stroked: true, lineWidthMinPixels: 0.6,
    getFillColor: (ft: Feature) => { const r = byName.get(ft.properties?.state); return r ? [...ramp(HEAT, scale.t(r.additional)), ft.properties?.state === state ? 255 : 200] as [number, number, number, number] : [0, 0, 0, 0] },
    getLineColor: (ft: Feature) => (ft.properties?.state === state ? [248, 113, 113, 255] : theme === 'dark' ? [11, 11, 12, 220] : [255, 255, 255, 230]),
    getLineWidth: (ft: Feature) => (ft.properties?.state === state ? 3 : 1), lineWidthUnits: 'pixels',
    updateTriggers: { getFillColor: [byName, state], getLineColor: [state, theme], getLineWidth: state }, transitions: { getFillColor: 500 },
    onClick: (i: PickingInfo) => setState((i.object as Feature)?.properties?.state ?? ''),
  })].filter(Boolean)

  return (
    <>
      <PageHeader title="How much charging will India need?">
        Pick a year and a growth scenario. Numbers are <b className="text-text">estimates, not a guarantee</b>: they show the scale of what is coming.
      </PageHeader>
      <Container className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Segmented value={year} options={YEARS.map((y) => [y, y])} onChange={setYear} />
          <Segmented value={scn} options={SCN} onChange={setScn} />
          <select className="input !w-56" value={state} onChange={(e) => setState(e.target.value)} aria-label="Choose a state">
            <option value="">All of India</option>
            {(states ?? []).map((s) => s.state).sort().map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label={`EVs in ${focus?.name ?? '…'} by ${year} (estimated)`} value={focus ? compact(focus.evs) : '…'} sub={`${SCN.find((s) => s[0] === scn)![1]} growth`} />
          <Kpi label="Charging points needed" value={focus ? compact(focus.required) : '…'} sub={`About 1 point per ${fmt(ratio)} EVs`} />
          <Kpi label="Extra points to add" value={focus ? compact(focus.additional) : '…'} accent="warn" sub={focus ? `On top of ~${compact(focus.now)} today` : ''} />
          <Kpi label="Of which DC fast" value={focus ? compact(focus.dc) : '…'} sub="For cars, buses and trucks" />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="map-card">
            <div className="relative h-[420px]">
              <MapBase basemap={theme} onReady={() => setMapOn(true)} deck={(_, k) => ({ layers: layers(k), getTooltip: ({ object }: PickingInfo) => {
                const r = object && byName.get((object as Feature).properties?.state)
                return r ? tooltipBox(`<b>${r.name}</b><br/>~${compact(r.evs)} EVs by ${year}<br/>~${compact(r.additional)} extra charging points needed`) : null
              } })} />
              <div className="absolute left-3 bottom-3 glass p-3 w-60"><Legend title="Extra charging points needed" stops={gradient(HEAT)} lo={compact(scale.lo)} hi={compact(scale.hi)} /></div>
            </div>
          </div>
          <div className="card p-5">
            <CardTitle>EVs on the road: history and scenarios</CardTitle>
            {!f ? <Skeleton className="h-80" /> : (
              <div className="h-[340px]">
                <ResponsiveContainer>
                  <AreaChart data={chart} margin={{ left: 0, right: 8, top: 8 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="year" tick={axisStyle} tickLine={false} axisLine={false} />
                    <YAxis tick={axisStyle} tickFormatter={(v) => compact(v)} tickLine={false} axisLine={false} width={56} />
                    <Tooltip contentStyle={tipStyle} formatter={(v) => compact(Number(v))} />
                    <RLegend wrapperStyle={{ fontSize: 12 }} />
                    <Area dataKey="actual" name="Actual" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} {...chartAnim} />
                    <Line dataKey="low" name="Slow" stroke={css(HEAT[1])} dot={false} strokeWidth={scn === 'low' ? 3 : 1.5} {...chartAnim} />
                    <Area dataKey="base" name="Normal" stroke={css(HEAT[3])} fill={css(HEAT[3])} fillOpacity={scn === 'base' ? 0.12 : 0} dot={false} strokeWidth={scn === 'base' ? 3 : 1.5} {...chartAnim} />
                    <Line dataKey="high" name="Fast" stroke={css(HEAT[4])} dot={false} strokeWidth={scn === 'high' ? 3 : 1.5} {...chartAnim} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
          <div className="card p-5">
            <CardTitle>{sel ? `Districts of ${state}: biggest shortages` : 'States with the biggest shortages'}</CardTitle>
            {!rows.length ? <Skeleton className="h-64" /> : (
              <div className="overflow-x-auto max-h-[420px]" data-lenis-prevent>
                <table className="tbl">
                  <thead><tr><th>#</th><th>{sel ? 'District' : 'State'}</th><th className="text-right">EVs by {year}</th><th className="text-right">Extra points</th></tr></thead>
                  <tbody>
                    {(sel ? distRows : rows).slice(0, 20).map((r, i) => (
                      <tr key={r.name} className={sel ? '' : 'cursor-pointer'} onClick={() => !sel && setState(r.name)}>
                        <td className="text-muted tnum">{i + 1}</td><td className="font-medium">{r.name}</td>
                        <td className="text-right tnum">{compact(r.evs)}</td><td className="text-right tnum font-semibold">{compact(r.additional)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="card p-5">
              <CardTitle>Points needed by vehicle type{focus ? ` · ${focus.name}` : ''}</CardTitle>
              {focus && VEHICLE_TYPES.map((k) => {
                const v = focus.byType[k], max = Math.max(...VEHICLE_TYPES.map((x) => focus.byType[x]))
                return (
                  <div key={k} className="mb-2.5">
                    <div className="flex justify-between text-sm"><span>{VT[k]}</span><span className="tnum font-semibold">{compact(v)}</span></div>
                    <div className="h-2 rounded-full bg-active mt-1 overflow-hidden"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(v / max) * 100}%`, background: f?.dc_types.includes(k) ? css(HEAT[4]) : css(HEAT[1]) }} /></div>
                  </div>
                )
              })}
              <p className="text-[11px] text-muted">Purple: needs DC fast charging. Yellow: slow AC charging is fine.</p>
            </div>
            <div className="card p-5 text-sm">
              <CardTitle right={<span className="chip text-warn border-warn/30 bg-warn/10">Estimate, not a guarantee</span>}>How this is estimated</CardTitle>
              <ul className="space-y-2 text-muted list-disc pl-4">
                <li>We fit a growth curve to yearly EV registrations from 2018 to 2025 (VAHAN).</li>
                <li><b className="text-text">Slow, Normal and Fast</b> scenarios bend that curve down or up, in line with government and industry targets.</li>
                <li>Each state and district keeps its current share of India’s EVs.</li>
                <li>One public charging point is assumed per {f ? `${f.target_ratio['2W']} scooters, ${f.target_ratio['3W']} autos, ${f.target_ratio['4W']} cars, ${f.target_ratio.Bus} buses and ${f.target_ratio.Goods} goods vehicles` : '…'}.</li>
                <li>Home charging, battery swapping and new technology could change these numbers a lot.</li>
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </>
  )
}
