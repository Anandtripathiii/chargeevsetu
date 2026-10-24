import { useEffect, useMemo, useRef, useState } from 'react'
import type { PickingInfo } from '@deck.gl/core'
import { MousePointerClick, PowerOff, RotateCcw, Sparkles, Sun } from 'lucide-react'
import MapBase from '../components/LazyMap'
import type { Kit } from '../components/MapBase'
import { bboxOf, Legend, type MapBaseHandle } from '../components/mapUtil'
import { CardTitle, Container, PageHeader, Skeleton } from '../components/ui'
import { useData, type Cells, type Forecast, type StateRow, type Summary } from '../lib/data'
import { useTheme } from '../lib/theme'
import { gradient, HEAT, ramp } from '../lib/colors'
import { compact, fmt, pct } from '../lib/format'
import { blendedRatio, cellScore, chargersNeeded, parseCells, type Cell, type Site } from '../lib/model'
import { buildRegions } from '../lib/regions'
import { useSites } from '../lib/useSites'
import { changes, evaluate, prepare, type Virtual } from '../lib/network'
import { stationIndex, type IndexRow } from '../lib/stations'
import { tooltipBox } from '../lib/tooltip'

type Mode = 'add' | 'stress'
const HUB = 10

/** Split a hub's points by the region's vehicle mix: 2W/3W on AC, cars on DC fast, buses/trucks on high-power DC. */
function hubPlan(mix: Forecast['vehicle_mix'], ratios: Forecast['target_ratio'], solar: 'grid' | 'battery') {
  const need = chargersNeeded(1000, blendedRatio(mix, ratios), mix, ratios)
  const share = (k: keyof typeof need.byType) => need.byType[k] / need.required
  const heavy = Math.max(share('Bus') + share('Goods') > 0.05 ? 1 : 0, Math.round(HUB * (share('Bus') + share('Goods'))))
  const car = Math.max(2, Math.round(HUB * share('4W')))
  const light = Math.max(0, HUB - car - heavy)
  const kwhDay = light * 3.3 * 6 + car * 30 * 4 + heavy * 120 * 3
  const kwp = Math.round((kwhDay * 0.3) / 4.5) // solar covers ~30% of daily energy at 4.5 sun-hours
  const battery = solar === 'battery' ? Math.round(kwhDay * 0.15) : 0
  const cost = light * 0.6 + car * 9 + heavy * 30 + kwp * 0.45 + battery * 0.18 // ₹ lakh
  return { light, car, heavy, kwhDay, kwp, battery, cost }
}

export default function PlanningLab() {
  const [theme] = useTheme()
  const map = useRef<MapBaseHandle>(null)
  const { data: states } = useData<StateRow[]>('states.json')
  const { data: summary } = useData<Summary>('summary.json')
  const { data: forecast } = useData<Forecast>('forecast.json')
  const regions = useMemo(() => (states && summary && forecast ? buildRegions(states, summary, forecast.vehicle_mix).filter((r) => r.hasCells && r.kind !== 'corridor') : []), [states, summary, forecast])
  const [slug, setSlug] = useState('delhi-ncr')
  const region = regions.find((r) => r.slug === slug)
  const { data: raw } = useData<Cells>(`cells/${slug}.json`)
  const cells = useMemo(() => (raw ? parseCells(raw.cols, raw.rows) as Cell[] : null), [raw])
  const ratio = forecast ? blendedRatio(forecast.vehicle_mix, forecast.target_ratio) : 44.3
  const res = useSites(cells, 8, HUB, ratio)
  const [solar, setSolar] = useState<'grid' | 'battery'>('grid')
  const plan = forecast && region ? hubPlan(region.mix, forecast.target_ratio, solar) : null
  const [open, setOpen] = useState(0)

  // what-if state
  const [mode, setMode] = useState<Mode>('add')
  const [cap, setCap] = useState(10)
  const [added, setAdded] = useState<Virtual[]>([])
  const [off, setOff] = useState<Set<string>>(new Set())
  const [real, setReal] = useState<IndexRow[]>([])
  useEffect(() => { setAdded([]); setOff(new Set()) }, [slug])
  useEffect(() => {
    if (!cells?.length) return
    const xs = cells.map((c) => c.lon), ys = cells.map((c) => c.lat)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    stationIndex().then((rows) => setReal(rows.filter((r) => r[3] >= x0 && r[3] <= x1 && r[4] >= y0 && r[4] <= y1)), () => {})
    map.current?.fit(bboxOf({ type: 'MultiPoint', coordinates: [[x0, y0], [x1, y1]] }), 10)
  }, [cells])

  const prep = useMemo(() => (cells ? prepare(cells) : null), [cells])
  const base = useMemo(() => (cells && prep ? evaluate(cells, prep, ratio) : null), [cells, prep, ratio])
  const removed = useMemo(() => real.filter((r) => off.has(r[0])).map((r) => [r[3], r[4]] as [number, number]), [real, off])
  const mod = useMemo(() => (cells && prep ? evaluate(cells, prep, ratio, added, removed) : null), [cells, prep, ratio, added, removed])
  const diff = useMemo(() => (cells && base && mod ? changes(cells, base, mod) : null), [cells, base, mod])
  const maxPop = useMemo(() => (cells ? Math.max(...cells.map((c) => c.pop)) : 1), [cells])

  const layers = ({ ScatterplotLayer }: Kit) => [
    cells && new ScatterplotLayer<Cell>({
      id: 'cells', data: cells, getPosition: (c) => [c.lon, c.lat], radiusUnits: 'meters', getRadius: 900, pickable: true,
      getFillColor: (c) => [...ramp(HEAT, cellScore(c)), Math.round(40 + 140 * Math.sqrt(c.pop / maxPop))] as [number, number, number, number],
      updateTriggers: { getFillColor: maxPop }, transitions: { getFillColor: 300 },
    }),
    new ScatterplotLayer<IndexRow>({
      id: 'real', data: real, getPosition: (r) => [r[3], r[4]], radiusUnits: 'pixels', getRadius: 5, pickable: true, stroked: true, lineWidthMinPixels: 1.5,
      getFillColor: (r) => (off.has(r[0]) ? [120, 120, 120, 200] : [34, 197, 94, 255]), getLineColor: theme === 'dark' ? [11, 11, 12] : [255, 255, 255],
      updateTriggers: { getFillColor: off, getLineColor: theme },
      onClick: (i: PickingInfo) => { if (mode !== 'stress' || !i.object) return; const id = (i.object as IndexRow)[0]; setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }) },
    }),
    res && new ScatterplotLayer<Site>({
      id: 'sites', data: res.sites, getPosition: (s) => [s.cell.lon, s.cell.lat], radiusUnits: 'pixels', getRadius: 9, pickable: true, stroked: true, lineWidthMinPixels: 2,
      getFillColor: [248, 113, 113, 230], getLineColor: [255, 255, 255, 255],
    }),
    new ScatterplotLayer<Virtual>({
      id: 'virtual', data: added, getPosition: (v) => [v.lon, v.lat], radiusUnits: 'meters', getRadius: 3000, stroked: true, filled: true, lineWidthMinPixels: 2,
      getFillColor: [248, 113, 113, 40], getLineColor: [248, 113, 113, 255],
    }),
  ].filter(Boolean)

  const click = (i: PickingInfo) => {
    if (mode !== 'add' || !i.coordinate || i.layer?.id === 'real') return
    setAdded((a) => [...a, { id: String(Date.now()), lon: i.coordinate![0], lat: i.coordinate![1], points: cap }])
  }
  const tip = ({ object, layer }: PickingInfo) => {
    if (!object) return null
    if (layer?.id === 'real') { const r = object as IndexRow; return tooltipBox(`<b>${r[1]}</b><br/>${mode === 'stress' ? 'Click to switch off / on' : 'Existing charger'}`) }
    if (layer?.id === 'sites') { const s = object as Site; return tooltipBox(`<b>Recommended site #${s.rank}</b><br/>Suitability ${fmt(cellScore(s.cell) * 100)}/100`) }
    const c = object as Cell
    return tooltipBox(`~${compact(c.pop)} people · ~${compact(c.evs)} EVs (est.)<br/>Demand score ${fmt(cellScore(c) * 100)}/100`)
  }

  return (
    <>
      <PageHeader title="Plan new charging stations">
        See the best places for new chargers, then test your own ideas: add stations, switch off existing ones, and compare. All results are <b className="text-text">estimates</b>.
      </PageHeader>
      <Container className="space-y-4">
        <select className="input !w-64" value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Choose a region">
          {regions.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
        </select>

        <div className="grid lg:grid-cols-[1fr_380px] gap-4">
          <div className="map-card">
            <div className="relative h-[480px] md:h-[600px]">
              <MapBase ref={map} basemap={theme} deck={(_, k) => ({ layers: layers(k), getTooltip: tip, onClick: click, getCursor: ({ isHovering }) => (isHovering ? 'pointer' : mode === 'add' ? 'crosshair' : 'grab') })} />
              <div className="absolute left-3 top-3 glass p-2 flex gap-1 no-print">
                <button className={`pill ${mode === 'add' ? 'pill-primary' : ''}`} onClick={() => setMode('add')}><MousePointerClick size={14} />Add stations</button>
                <button className={`pill ${mode === 'stress' ? 'pill-primary' : ''}`} onClick={() => setMode('stress')}><PowerOff size={14} />Stress test</button>
              </div>
              <div className="absolute left-3 bottom-3 glass p-3 w-60 no-print space-y-2">
                <Legend title="Charging demand (estimated)" stops={gradient(HEAT)} lo="Low" hi="High" />
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />Charger</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-accent-fill" />Recommended</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-accent-fill" />Your station (3 km)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 min-w-0">
            <div className="card p-5">
              <CardTitle right={(added.length > 0 || off.size > 0) && <button className="text-xs text-accent flex items-center gap-1" onClick={() => { setAdded([]); setOff(new Set()) }}><RotateCcw size={12} />Reset</button>}>
                {mode === 'add' ? 'What-if: add stations' : 'Stress test: switch off stations'}
              </CardTitle>
              {mode === 'add' ? (
                <>
                  <p className="text-sm text-muted">Click anywhere on the map to drop a station.</p>
                  <div className="mt-3 flex gap-1.5 flex-wrap" role="group" aria-label="Station size">
                    {[4, 10, 20].map((n) => <button key={n} onClick={() => setCap(n)} className={`pill ${cap === n ? 'pill-primary' : ''}`}>{n} points</button>)}
                  </div>
                </>
              ) : <p className="text-sm text-muted">Click green chargers to switch them off and see which areas lose access. {off.size > 0 && <b className="text-text">{off.size} switched off.</b>}</p>}

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-bg-2 border border-line p-3"><div className="text-[11px] text-muted">Original network</div>
                  <div className="mt-1"><b className="tnum">{base ? pct(base.access, 0) : '…'}</b> <span className="text-muted text-xs">people within 3 km</span></div>
                  <div><b className="tnum">{base ? pct(base.met, 0) : '…'}</b> <span className="text-muted text-xs">demand met</span></div></div>
                <div className="rounded-xl bg-accent/10 border border-accent/30 p-3"><div className="text-[11px] text-muted">Your network</div>
                  <div className="mt-1"><b className="tnum">{mod ? pct(mod.access, 0) : '…'}</b> <Delta a={base?.access} b={mod?.access} /></div>
                  <div><b className="tnum">{mod ? pct(mod.met, 0) : '…'}</b> <Delta a={base?.met} b={mod?.met} /></div></div>
              </div>
              {diff && (diff.gained.length > 0 || diff.lost.length > 0) && (
                <div className="mt-3 text-xs space-y-1">
                  {diff.gained.map(([d, p]) => <div key={`g${d}`} className="flex justify-between"><span className="text-ok">+ {d.split('--')[1]?.replace(/-/g, ' ') ?? d}</span><span className="tnum">{compact(p)} people gain access</span></div>)}
                  {diff.lost.map(([d, p]) => <div key={`l${d}`} className="flex justify-between"><span className="text-crit">− {d.split('--')[1]?.replace(/-/g, ' ') ?? d}</span><span className="tnum">{compact(p)} people lose access</span></div>)}
                </div>
              )}
            </div>

            <div className="card p-5">
              <CardTitle right={<span className="chip text-warn border-warn/30 bg-warn/10">Estimated</span>}><span className="flex items-center gap-2"><Sparkles size={15} className="text-accent" />Recommended locations</span></CardTitle>
              {!res ? <Skeleton className="h-48" /> : (
                <ol className="space-y-2 max-h-[520px] overflow-auto" data-lenis-prevent>
                  {res.sites.map((s, i) => (
                    <li key={i} className="rise rounded-xl border border-line">
                      <button className="w-full text-left p-3 flex items-center gap-3" onClick={() => { setOpen(i); map.current?.fly(s.cell.lon, s.cell.lat, 12.5) }}>
                        <span className="grid place-items-center w-7 h-7 rounded-full bg-accent-fill text-[#0b0b0c] text-xs font-semibold shrink-0">{s.rank}</span>
                        <span className="min-w-0 flex-1 text-sm truncate">{s.cell.district.split('--')[1]?.replace(/-/g, ' ') ?? 'Area'}</span>
                        <span className="text-xs text-muted">Suitability</span><b className="tnum">{fmt(cellScore(s.cell) * 100)}</b>
                      </button>
                      {open === i && plan && (
                        <div className="px-3 pb-3 text-sm space-y-3">
                          <ul className="text-muted text-xs space-y-1 list-disc pl-4">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-bg-2 p-2"><div className="font-semibold tnum">{plan.light}</div><div className="text-[10px] text-muted">AC 3.3 kW · scooters, autos</div></div>
                            <div className="rounded-lg bg-bg-2 p-2"><div className="font-semibold tnum">{plan.car}</div><div className="text-[10px] text-muted">DC 30–60 kW · cars</div></div>
                            <div className="rounded-lg bg-bg-2 p-2"><div className="font-semibold tnum">{plan.heavy}</div><div className="text-[10px] text-muted">DC 120 kW · buses, trucks</div></div>
                          </div>
                          <div className="rounded-lg bg-bg-2 p-3">
                            <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-medium"><Sun size={14} className="text-warn" />Solar option</span>
                              <span className="flex gap-1">{(['grid', 'battery'] as const).map((k) => <button key={k} onClick={() => setSolar(k)} className={`pill !h-7 !text-[11px] ${solar === k ? 'pill-primary' : ''}`}>{k === 'grid' ? 'Grid backup' : 'Battery backup'}</button>)}</span></div>
                            <p className="text-xs text-muted mt-2">~{fmt(plan.kwhDay)} kWh/day. A {plan.kwp} kWp rooftop or canopy covers about 30%{plan.battery ? `, with a ${plan.battery} kWh battery for evening peaks` : ', with the grid as backup'}.</p>
                            <p className="text-xs mt-1">Rough setup cost: <b>₹{fmt(plan.cost, 0)} lakh</b> <span className="text-muted">(hardware + solar, excluding land and grid connection)</span></p>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {res && <p className="text-[11px] text-muted mt-3">With all 8 sites ({HUB} points each), demand met goes from {pct(res.before, 0)} to {pct(res.after, 0)} (estimated).</p>}
            </div>
          </div>
        </div>
      </Container>
    </>
  )
}

function Delta({ a, b }: { a?: number; b?: number }) {
  if (a == null || b == null) return null
  const d = b - a
  if (Math.abs(d) < 0.05) return <span className="text-xs text-muted">no change</span>
  return <span className={`text-xs tnum ${d > 0 ? 'text-ok' : 'text-crit'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)} pts</span>
}

