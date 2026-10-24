import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Legend as RLegend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts'
import type { PickingInfo } from '@deck.gl/core'
import MapBase from '../../components/LazyMap'
import type { MapBaseHandle } from '../../components/mapUtil'
import { Segmented, Slider } from '../../components/controls'
import { CardTitle, Kpi, Skeleton, SourceBadge } from '../../components/ui'
import { useData, type Cells, type Forecast } from '../../lib/data'
import { useTheme } from '../../lib/theme'
import { compact, fmt, pct } from '../../lib/format'
import { blendedRatio, cagrModel, chargersNeeded, logisticModel, parseCells, VEHICLE_TYPES, type Site } from '../../lib/model'
import type { Region } from '../../lib/regions'
import { downloadCsv } from '../../lib/csv'
import { useExport } from '../../lib/exporter'
import { esc, raw, safeHtml, tooltipBox } from '../../lib/tooltip'
import { useSites } from '../../lib/useSites'

export type Scenario = 'low' | 'base' | 'high'
const SC_COLOR = { low: '#19b6d2', base: '#b5f23d', high: '#f5b84a' }
const YEARS = Array.from({ length: 10 }, (_, i) => 2026 + i)

import { axisStyle, chartAnim, tipStyle } from '../../lib/chartStyle'

/** Forecast + requirement + site recommendation for one region. Used by Plan & Estimate and the Case Study. */
export default function Planner({ region, forecast, initialYear = 2030 }: { region: Region; forecast: Forecast; initialYear?: number }) {
  const [theme] = useTheme()
  const [scenario, setScenario] = useState<Scenario>('base')
  const [year, setYear] = useState(initialYear)
  const defaultRatio = Math.round(blendedRatio(region.mix, forecast.target_ratio))
  const [ratio, setRatio] = useState(defaultRatio)
  useEffect(() => setRatio(defaultRatio), [defaultRatio])
  const share = region.evs / forecast.stock_2026_official
  const evsAt = (y: number, sc: Scenario = scenario) => forecast.scenarios[sc][String(y)] * share

  const need = chargersNeeded(evsAt(year), ratio, region.mix, forecast.target_ratio, region.chargers)
  const yearly = YEARS.map((y) => {
    const n = chargersNeeded(evsAt(y), ratio, region.mix, forecast.target_ratio, region.chargers)
    return { year: y, evs: evsAt(y), required: n.required, additional: n.additional, dc: n.dc, ac: n.ac }
  })

  const chart = useMemo(() => {
    const f = forecast.fits, t0 = f.t0_year
    const hist = new Map(forecast.history.map((h) => [h.year, h.stock]))
    return Array.from({ length: 2035 - 2018 + 1 }, (_, i) => {
      const y = 2018 + i
      const row: Record<string, number | undefined> = { year: y }
      if (hist.has(y)) row.actual = hist.get(y)! * share
      if (y >= 2018) {
        row.cagr = cagrModel(y - t0, f.cagr.a, f.cagr.g) * share
        row.logistic = logisticModel(y - t0, f.logistic.k, f.logistic.r, f.logistic.t0) * share
      }
      if (y >= 2025) for (const k of ['low', 'base', 'high'] as const) row[k] = forecast.scenarios[k][String(y)] * share
      return row
    })
  }, [forecast, share])

  // ---- sites ----
  const { data: cells } = useData<Cells>(region.hasCells ? `cells/${region.slug}.json` : null)
  const parsed = useMemo(() => (cells ? parseCells(cells.cols, cells.rows) : null), [cells])
  const hubSize = 10
  const suggested = Math.max(5, Math.min(150, Math.ceil(need.additional / hubSize)))
  const [hubs, setHubs] = useState<number | null>(null)
  const nHubs = hubs ?? suggested
  const deferredHubs = useDeferredValue(nHubs)
  const deferredRatio = useDeferredValue(ratio)
  const sites = useSites(parsed, deferredHubs, hubSize, deferredRatio)
  const mapRef = useRef<MapBaseHandle>(null)
  useEffect(() => {
    if (!parsed?.length) return
    const xs = parsed.map((c) => c.lon), ys = parsed.map((c) => c.lat)
    mapRef.current?.fit([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], 11)
  }, [parsed])

  const exportCsv = () => {
    downloadCsv(`chargeevsetu-${region.slug}-plan.csv`, [
      ...yearly.map((y) => ({ section: 'requirement', region: region.name, scenario, year: y.year, evs: Math.round(y.evs), required_chargers: Math.round(y.required), additional_chargers: Math.round(y.additional), dc_fast: Math.round(y.dc), ac_slow: Math.round(y.ac), target_evs_per_charger: ratio, lon: '', lat: '', why: '' })),
      ...(sites?.sites ?? []).map((s) => ({ section: 'site', region: region.name, scenario, year, evs: Math.round(s.cell.evs), required_chargers: hubSize, additional_chargers: hubSize, dc_fast: '', ac_slow: '', target_evs_per_charger: ratio, lon: s.cell.lon, lat: s.cell.lat, why: s.reasons.join(' | ') })),
    ])
  }

  useExport('Export plan CSV', exportCsv)

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-end gap-x-8 gap-y-4 no-print">
        <div>
          <div className="text-xs text-muted mb-1.5">Scenario</div>
          <Segmented value={scenario} onChange={setScenario} options={[['low', 'Low'], ['base', 'Base (30% by 2030)'], ['high', 'High']]} />
        </div>
        <div className="w-56"><Slider label="Target year" value={year} min={2026} max={2035} step={1} onChange={setYear} /></div>
        <div className="w-64"><Slider label="Target EVs per public charger" value={ratio} min={10} max={150} step={1} onChange={setRatio}
          hint={`Default ${defaultRatio} = blend of per-vehicle benchmarks (4W: ${forecast.target_ratio['4W']}, EU AFID / IEA)`} /></div>
        <div className="ml-auto flex gap-2">
          <button className="btn btn-ghost !text-xs" onClick={exportCsv}>Export CSV</button>
          <button className="btn btn-primary !text-xs" onClick={() => window.print()}>Print 1-page report</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label={`EVs in ${year} (${scenario})`} value={compact(evsAt(year))} sub={`today ≈ ${compact(region.evs)}`} source="derived" />
        <Kpi label={`Public chargers needed by ${year}`} value={fmt(need.required)} sub={`at ${ratio} EVs per charger`} source="derived" />
        <Kpi label="Existing (2026)" value={fmt(region.chargers)} sub={`${fmt(region.evs / Math.max(region.chargers, 1))} EVs per charger today`} source={region.kind === 'india' ? 'real' : 'derived'} />
        <Kpi label="Additional chargers to build" value={fmt(need.additional)} sub={`${fmt(need.dc)} DC fast · ${fmt(need.ac)} AC`} source="derived" accent="warn" />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="card p-4">
          <CardTitle right={<SourceBadge type="derived" />}>EV stock forecast · {region.name}</CardTitle>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ left: 4, right: 12, top: 6 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="year" tick={axisStyle} />
                <YAxis tick={axisStyle} tickFormatter={(v) => compact(v)} width={58} />
                <Tooltip contentStyle={tipStyle} formatter={(v) => compact(Number(v))} />
                <RLegend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="actual" name="VAHAN stock (back-calc.)" stroke="var(--text)" strokeWidth={2.5} dot={{ r: 3 }} {...chartAnim} />
                <Line dataKey="cagr" name={`CAGR fit (R² ${forecast.fits.cagr.r2.toFixed(3)})`} stroke="#8ea3b1" strokeDasharray="4 4" dot={false} {...chartAnim} />
                <Line dataKey="logistic" name={`S-curve fit (R² ${forecast.fits.logistic.r2.toFixed(3)})`} stroke="#b07cff" strokeDasharray="2 3" dot={false} {...chartAnim} />
                {(['low', 'base', 'high'] as const).map((k) => (
                  <Line key={k} dataKey={k} name={`${k[0].toUpperCase()}${k.slice(1)} scenario`} stroke={SC_COLOR[k]} strokeWidth={k === scenario ? 3 : 1.5} dot={false} {...chartAnim} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted mt-2">
            Better statistical fit: <b>{forecast.best_fit === 'cagr' ? 'CAGR' : 'S-curve'}</b> (MAPE {fmt(forecast.fits[forecast.best_fit].mape, 1)}%). Back-test on 2023–25 after fitting 2018–22:
            CAGR {fmt(forecast.backtest_mape.cagr, 1)}%, S-curve {fmt(forecast.backtest_mape.logistic, 1)}% error. Unconstrained trend fits overshoot, so planning uses policy scenarios.
          </p>
        </div>
        <div className="card p-4">
          <CardTitle>Chargers needed by vehicle type ({year})</CardTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={VEHICLE_TYPES.map((k) => ({ type: k, chargers: need.byType[k] }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="var(--line)" horizontal={false} />
                <XAxis type="number" tick={axisStyle} tickFormatter={(v) => compact(v)} />
                <YAxis type="category" dataKey="type" tick={axisStyle} width={44} />
                <Tooltip contentStyle={tipStyle} formatter={(v) => fmt(Number(v))} cursor={{ fill: 'var(--line)' }} />
                <Bar dataKey="chargers" fill="var(--accent)" radius={[0, 6, 6, 0]} {...chartAnim} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted">2W and 3W mostly use slow AC or battery swapping; cars, buses and goods vehicles need DC fast charging.</p>
        </div>
      </div>

      <div className="card p-4 overflow-x-auto">
        <CardTitle right={<SourceBadge type="derived" />}>Year-by-year plan · {scenario} scenario</CardTitle>
        <table className="tbl">
          <thead><tr><th>Year</th>{yearly.map((y) => <th key={y.year} className="text-right">{y.year}</th>)}</tr></thead>
          <tbody>
            <tr><td className="text-muted">EVs</td>{yearly.map((y) => <td key={y.year} className="text-right tnum">{compact(y.evs)}</td>)}</tr>
            <tr><td className="text-muted">Chargers required</td>{yearly.map((y) => <td key={y.year} className="text-right tnum">{compact(y.required)}</td>)}</tr>
            <tr><td className="font-semibold">Additional to build</td>{yearly.map((y) => <td key={y.year} className="text-right tnum font-semibold">{compact(y.additional)}</td>)}</tr>
            <tr><td className="text-muted">of which DC fast (new)</td>{yearly.map((y) => <td key={y.year} className="text-right tnum">{compact(y.dc - Math.min(y.dc, region.chargers * 0.31))}</td>)}</tr>
          </tbody>
        </table>
      </div>

      {region.hasCells ? (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          <div className="map-card h-[480px] print:h-auto">
            <div className="absolute inset-0 print:hidden">
              <MapBase ref={mapRef} basemap={theme} deck={(_, { ScatterplotLayer }) => ({
                layers: sites ? [
                  new ScatterplotLayer({ id: 'demand', data: parsed!, getPosition: (c: { lon: number; lat: number }) => [c.lon, c.lat], getRadius: 900, getFillColor: (c: { ch3: number; evs: number }) => c.ch3 === 0 ? [239, 75, 91, 70] : [142, 163, 177, 40] }),
                  new ScatterplotLayer<Site>({ id: 'halo', data: sites.sites, getPosition: (s) => [s.cell.lon, s.cell.lat], getRadius: 3000, getFillColor: [181, 242, 61, 30], getLineColor: [181, 242, 61, 160], stroked: true, lineWidthMinPixels: 1 }),
                  new ScatterplotLayer<Site>({ id: 'sites', data: sites.sites, pickable: true, getPosition: (s) => [s.cell.lon, s.cell.lat], getRadius: 7, radiusUnits: 'pixels', getFillColor: [255, 255, 255, 255], getLineColor: [181, 242, 61, 255], stroked: true, lineWidthMinPixels: 3 }),
                ] : [],
                getTooltip: ({ object, layer }: PickingInfo) => layer?.id === 'sites' && object
                  ? tooltipBox(safeHtml`<b>Site #${(object as Site).rank}</b> · hub of ${hubSize} chargers<br/>${raw((object as Site).reasons.map((r) => `• ${esc(r)}`).join('<br/>'))}`) : null,
              })} />
            </div>
            <div className="absolute left-3 top-3 card px-3 py-2 text-xs no-print">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-white border-[3px] border-accent" /> Recommended hub ({hubSize} chargers)</div>
              <div className="flex items-center gap-2 mt-1"><span className="w-3 h-3 rounded-full bg-crit/50" /> Populated 2 km cell with no charger within 3 km</div>
            </div>
          </div>
          <div className="card p-4 space-y-4">
            <CardTitle right={<SourceBadge type="derived" />}>Recommended sites</CardTitle>
            <div className="no-print"><Slider label="Number of new hubs" value={nHubs} min={5} max={300} step={5} onChange={setHubs}
              fmt={(v) => `${v} hubs · ${fmt(v * hubSize)} chargers`} hint={`Suggested ${suggested} hubs ≈ the ${year} requirement (capped at 150 for display)`} /></div>
            {!sites ? <Skeleton className="h-40" /> : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <BeforeAfter label="EV demand met" a={sites.before} b={sites.after} />
                  <BeforeAfter label="Residents ≤ 3 km of a charger" a={sites.covBefore} b={sites.covAfter} />
                </div>
                <ol className="space-y-3 max-h-[300px] overflow-y-auto pr-1 print:max-h-none">
                  {sites.sites.slice(0, 12).map((s) => (
                    <li key={s.rank} className="text-xs border-l-2 border-accent pl-3">
                      <div className="font-semibold text-sm">#{s.rank} · {titleCase(s.cell.district.split('--')[1] ?? '')} <span className="text-muted font-normal tnum">({s.cell.lat.toFixed(3)}, {s.cell.lon.toFixed(3)})</span></div>
                      <ul className="text-muted mt-0.5 space-y-0.5">{s.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="card p-4 text-sm text-muted">Site recommendations work for a state, Delhi NCR or a corridor. Choose one above to see recommended locations.</div>
      )}
    </div>
  )
}

const titleCase = (slug: string) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

function BeforeAfter({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="font-semibold tracking-[-0.03em] text-lg tnum">{pct(a)} <span className="text-muted">→</span> <span className="text-accent">{pct(b)}</span></div>
    </div>
  )
}
