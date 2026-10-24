import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Feature, FeatureCollection } from 'geojson'
import type { PickingInfo } from '@deck.gl/core'
import { MapPin, PlugZap, Plus, X } from 'lucide-react'
import MapBase from '../components/LazyMap'
import type { Kit } from '../components/MapBase'
import { bboxOf, INDIA_BOUNDS, Legend, type MapBaseHandle } from '../components/mapUtil'
import { CardTitle, Skeleton } from '../components/ui'
import { BigNum, Field, Meaning, ToolPage, type TourStep } from '../components/tool'
import { stationIndex, type IndexRow } from '../lib/stations'
import { useData, type DistrictRow, type StateRow } from '../lib/data'
import { useTheme } from '../lib/theme'
import { css, gradient, HEAT, ramp } from '../lib/colors'
import { compact, fmt } from '../lib/format'
import { FACTOR_INFO, FACTORS, score4, stateScores, type Factor, type Scored } from '../lib/gap4'
import { tooltipBox } from '../lib/tooltip'

const TOUR: TourStep[] = [
  { target: 'controls', title: 'Pick a state', text: 'Choose a state on the left, or click one on the map. Its districts appear, coloured by how underserved they are.' },
  { target: 'map', title: 'Click a district', text: 'Dark purple = few chargers for many EVs or long distances to a charger. Yellow = well served. Green dots are real public chargers.' },
  { target: 'results', title: 'Read why', text: 'The right panel explains in plain words why the district scores high. “Plan chargers here” opens the Planning Lab on that spot.' },
]

/** Plain-language reasons for a district's score: its biggest factors. */
function why(d: Scored): string[] {
  const say: Record<Factor, string> = {
    demand: `About ${fmt(d.evs_per_charger)} EVs share each public charging point (a comfortable level is under 20).`,
    access: `People live about ${fmt(d.dist_km, 1)} km from the nearest public charger on average.`,
    spread: `Each charger has to cover roughly ${fmt(d.area_km2 / (d.chargers + 1))} km² of land, so chargers are far apart.`,
    highway: `${d.nh_km ? fmt((100 * d.nh_gap_km) / d.nh_km) : 0}% of its national-highway length has no charger for 25 km.`,
  }
  return [...FACTORS].sort((a, b) => d.parts[b] - d.parts[a]).filter((k) => d.parts[k] >= 6).slice(0, 3).map((k) => say[k])
}

const heat = (v: number, a = 210) => [...ramp(HEAT, v / 100), a] as [number, number, number, number]

function Breakdown({ d }: { d: Scored }) {
  return (
    <div className="space-y-3">
      {FACTORS.map((k) => (
        <div key={k}>
          <div className="flex justify-between text-sm"><span>{FACTOR_INFO[k][0]}</span><span className="tnum font-semibold">{d.parts[k].toFixed(0)}<span className="text-muted font-normal"> / 25</span></span></div>
          <div className="h-2 rounded-full bg-active mt-1 overflow-hidden"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${d.parts[k] * 4}%`, background: css(ramp(HEAT, d.parts[k] / 25)) }} /></div>
          <p className="text-[11px] text-muted mt-0.5">{FACTOR_INFO[k][1]}</p>
        </div>
      ))}
    </div>
  )
}

export default function GapAnalysis() {
  const [theme] = useTheme()
  const map = useRef<MapBaseHandle>(null)
  const { data: districts } = useData<DistrictRow[]>('districts.json')
  const { data: states } = useData<StateRow[]>('states.json')
  const [mapOn, setMapOn] = useState(false)
  const { data: statesGeo } = useData<FeatureCollection>(mapOn ? 'states.geo.json' : null)
  const [state, setState] = useState('')
  const st = states?.find((s) => s.state === state)
  const { data: distGeo } = useData<FeatureCollection>(mapOn && st ? `districts/${st.slug}.geo.json` : null)
  const [pick, setPick] = useState<string | null>(null)
  const [compare, setCompare] = useState<string[]>([])
  const [real, setReal] = useState<IndexRow[]>([])
  const [showCh, setShowCh] = useState(true)
  useEffect(() => { stationIndex().then(setReal, () => {}) }, [])

  const scored = useMemo(() => (districts ? score4(districts) : null), [districts])
  const byId = useMemo(() => new Map((scored ?? []).map((d) => [d.id, d])), [scored])
  const sScore = useMemo(() => (scored ? stateScores(scored) : new Map<string, number>()), [scored])
  const inView = useMemo(() => (scored ?? []).filter((d) => !state || d.state === state).sort((a, b) => b.score - a.score), [scored, state])
  const sel = pick ? byId.get(pick) : undefined

  const totals = useMemo(() => {
    const rows = (states ?? []).filter((s) => !state || s.state === state)
    const evs = rows.reduce((a, s) => a + s.evs, 0), stations = rows.reduce((a, s) => a + s.official_chargers_2025, 0), points = rows.reduce((a, s) => a + s.chargers, 0)
    return { evs, stations, points, ratio: points ? evs / points : 0 }
  }, [states, state])

  const chooseState = (name: string) => {
    setState(name); setPick(null)
    const f = statesGeo?.features.find((x) => x.properties?.state === name)
    map.current?.fit(f ? bboxOf(f.geometry as Parameters<typeof bboxOf>[0]) : INDIA_BOUNDS, 8)
  }
  const toggleCompare = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? [...c.slice(1), id] : [...c, id]))

  const layers = ({ GeoJsonLayer, ScatterplotLayer }: Kit) => [
    statesGeo && new GeoJsonLayer({
      id: 'states', data: statesGeo, pickable: true, stroked: true, filled: true, lineWidthMinPixels: 0.6,
      getFillColor: (f: Feature) => (state && f.properties?.state === state ? [0, 0, 0, 0] : heat(sScore.get(f.properties?.state) ?? 0, state ? 70 : 200)),
      getLineColor: theme === 'dark' ? [11, 11, 12, 220] : [255, 255, 255, 230],
      updateTriggers: { getFillColor: [state, sScore], getLineColor: theme }, transitions: { getFillColor: 400 },
      onClick: (i: PickingInfo) => { const n = (i.object as Feature)?.properties?.state; if (n && n !== state) chooseState(n) },
    }),
    distGeo && st && new GeoJsonLayer({
      id: 'districts', data: distGeo, pickable: true, stroked: true, filled: true, lineWidthMinPixels: 0.8,
      getFillColor: (f: Feature) => heat(byId.get(f.properties?.id)?.score ?? 0, f.properties?.id === pick ? 255 : 215),
      getLineColor: (f: Feature) => (f.properties?.id === pick ? [248, 113, 113, 255] : theme === 'dark' ? [11, 11, 12, 200] : [255, 255, 255, 230]),
      getLineWidth: (f: Feature) => (f.properties?.id === pick ? 3 : 1), lineWidthUnits: 'pixels',
      updateTriggers: { getFillColor: [pick, byId], getLineColor: [pick, theme], getLineWidth: pick },
      onClick: (i: PickingInfo) => setPick((i.object as Feature)?.properties?.id ?? null),
    }),
    showCh && new ScatterplotLayer<IndexRow>({
      id: 'chargers', data: real, getPosition: (r) => [r[3], r[4]], radiusUnits: 'pixels', getRadius: 3, stroked: true, lineWidthMinPixels: 1,
      getFillColor: [22, 163, 74, 255], getLineColor: [255, 255, 255, 255],
    }),
  ].filter(Boolean)

  const tip = ({ object, layer }: PickingInfo) => {
    const p = (object as Feature | undefined)?.properties
    if (!p) return null
    if (layer?.id === 'states') return tooltipBox(`<b>${p.state}</b><br/>Gap Score <b>${fmt(sScore.get(p.state) ?? 0)}</b> / 100<br/><span style="opacity:.7">Click to see districts</span>`)
    const d = byId.get(p.id)
    return d ? tooltipBox(`<b>${d.name}</b>, ${d.state}<br/>Gap Score <b>${fmt(d.score)}</b> / 100 · #${d.pos} in India`) : null
  }

  const reasons = sel ? why(sel) : []
  return (
    <ToolPage
      title="Where is EV charging missing?"
      lead={<>Every district gets a <b className="text-text">Gap Score from 0 to 100</b>. Higher means more underserved: many EVs per charger, long distances, or highways without chargers. Pick a state, then click a district to see why.</>}
      tour={TOUR}
      controls={
        <>
          <Field label="State" tip="Pick a state to see its districts. ‘All of India’ colours whole states.">
            <select className="input" value={state} onChange={(e) => chooseState(e.target.value)} aria-label="Choose a state">
              <option value="">All of India</option>
              {(states ?? []).map((s) => s.state).sort().map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          {state && <button className="pill" onClick={() => chooseState('')}><X size={14} />Back to India</button>}
          <Field label="Most underserved" tip="Districts with the highest Gap Score. Click one to see why.">
            {!scored ? <Skeleton className="h-64" /> : (
              <ol className="space-y-0.5 max-h-[380px] overflow-auto -mx-2" data-lenis-prevent>
                {inView.slice(0, 15).map((d, i) => (
                  <li key={d.id}>
                    <button onClick={() => { if (!state) chooseState(d.state); setPick(d.id) }}
                      className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-hover ${pick === d.id ? 'bg-active' : ''}`}>
                      <span className="w-4 text-[11px] text-muted tnum">{i + 1}</span>
                      <span className="min-w-0 flex-1"><span className="block text-sm truncate">{d.name}</span><span className="block text-[11px] text-muted truncate">{d.state}</span></span>
                      <span className="w-7 text-right text-sm font-semibold tnum">{fmt(d.score)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Field>
        </>
      }
      map={
        <div className="map-card h-[460px] md:h-[620px]">
          <MapBase ref={map} basemap={theme} onReady={() => setMapOn(true)} layers={[{ label: 'Real public chargers', on: showCh, set: setShowCh, color: '#16a34a' }]}
            deck={(_, k) => ({ layers: layers(k), getTooltip: tip })} />
          <div className="absolute left-3 bottom-3 glass p-3 w-60 no-print space-y-2">
            <Legend title={state ? 'District Gap Score' : 'State Gap Score'} stops={gradient(HEAT)} lo="0 · well served" hi="100 · underserved" />
            <div className="flex items-center gap-1.5 text-[11px] text-muted"><span className="w-2.5 h-2.5 rounded-full bg-[#16a34a] ring-2 ring-white" />Real public charger</div>
          </div>
        </div>
      }
      results={
        <>
          <div className="grid grid-cols-2 gap-2">
            <BigNum label="EVs" value={states ? compact(totals.evs) : '…'} tip="Registered electric vehicles (VAHAN), shared out by state. Estimated." />
            <BigNum label="Public stations" value={states ? fmt(totals.stations) : '…'} tip="Official count of public charging stations, Ministry of Power, Aug 2025." />
            <BigNum label="EVs per charging point" value={states ? fmt(totals.ratio) : '…'} tone="warn" tip="How many EVs share one public charging point. Lower is better; about 20 or less is comfortable." />
            <BigNum label="Charging points" value={states ? compact(totals.points) : '…'} tip="Estimated individual charging points (one station usually has several)." />
          </div>
          <div className="card p-4">
            {!sel ? (
              <>
                <h2 className="font-semibold">Why is this area underserved?</h2>
                <p className="text-sm text-muted mt-1">{state ? 'Click a district on the map or in the list.' : 'Choose a state, or click one on the map, to see its districts.'}</p>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="font-semibold text-lg leading-tight">{sel.name}</h2><p className="text-xs text-muted">{sel.state} · #{sel.pos} most underserved of {scored!.length} districts</p></div>
                  <div className="text-right"><div className="text-3xl font-semibold tnum" style={{ color: css(ramp(HEAT, Math.max(0.35, sel.score / 100))) }}>{fmt(sel.score)}</div><div className="text-[11px] text-muted">out of 100</div></div>
                </div>
                <h3 className="mt-3 text-sm font-semibold">Why is this area underserved?</h3>
                {reasons.length ? <ul className="mt-1 space-y-1.5 text-sm list-disc pl-4">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  : <p className="text-sm text-muted mt-1">It is fairly well served: no single problem stands out.</p>}
                <div className="mt-3"><Meaning>{sel.score >= 60 ? `${sel.name} needs new public chargers more than most of India.` : sel.score >= 35 ? `${sel.name} is in the middle: some parts need more chargers.` : `${sel.name} is better served than most districts.`}</Meaning></div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link className="btn btn-primary justify-center !text-xs" to={`/plan?region=${st?.slug ?? ''}&lat=${sel.lat}&lon=${sel.lon}`}><PlugZap size={14} />Plan chargers here</Link>
                  <Link className="btn btn-ghost justify-center !text-xs" to={`/map?lat=${sel.lat}&lon=${sel.lon}&z=10`}><MapPin size={14} />See chargers</Link>
                </div>
                <details className="mt-3"><summary className="text-xs text-accent cursor-pointer">Score breakdown</summary><div className="mt-2"><Breakdown d={sel} /></div></details>
                <button className="mt-2 text-xs text-accent flex items-center gap-1" onClick={() => toggleCompare(sel.id)}><Plus size={12} />{compare.includes(sel.id) ? 'Remove from compare' : 'Compare with another district'}</button>
              </>
            )}
          </div>
        </>
      }
      below={
        <>
          {compare.length > 0 && (
            <div className="card p-5">
              <CardTitle right={<button className="text-xs text-accent" onClick={() => setCompare([])}>Clear</button>}>Compare districts</CardTitle>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th /> {compare.map((id) => <th key={id}>{byId.get(id)?.name}<div className="font-normal text-[11px]">{byId.get(id)?.state}</div></th>)}</tr></thead>
                  <tbody>
                    <tr><td className="font-medium">Gap Score</td>{compare.map((id) => <td key={id} className="tnum font-semibold">{fmt(byId.get(id)?.score)}</td>)}</tr>
                    {FACTORS.map((k) => <tr key={k}><td>{FACTOR_INFO[k][0]}</td>{compare.map((id) => <td key={id} className="tnum">{fmt(byId.get(id)?.parts[k])} / 25</td>)}</tr>)}
                    <tr><td>EVs (estimated)</td>{compare.map((id) => <td key={id} className="tnum">{compact(byId.get(id)?.evs)}</td>)}</tr>
                    <tr><td>EVs per charging point (est.)</td>{compare.map((id) => <td key={id} className="tnum">{fmt(byId.get(id)?.evs_per_charger)}</td>)}</tr>
                    <tr><td>Avg distance to a charger</td>{compare.map((id) => <td key={id} className="tnum">{fmt(byId.get(id)?.dist_km, 1)} km</td>)}</tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-xs text-muted">District numbers are estimated from state totals, population and mapped chargers. Use them to compare places, not as exact counts.</p>
        </>
      }
    />
  )
}
