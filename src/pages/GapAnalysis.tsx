import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Feature, FeatureCollection } from 'geojson'
import type { PickingInfo } from '@deck.gl/core'
import { MapPin, Plus, X } from 'lucide-react'
import MapBase from '../components/LazyMap'
import type { Kit } from '../components/MapBase'
import { bboxOf, INDIA_BOUNDS, Legend, type MapBaseHandle } from '../components/mapUtil'
import { CardTitle, Container, Kpi, PageHeader, Skeleton } from '../components/ui'
import { useData, type DistrictRow, type StateRow } from '../lib/data'
import { useTheme } from '../lib/theme'
import { css, gradient, HEAT, ramp } from '../lib/colors'
import { compact, fmt } from '../lib/format'
import { FACTOR_INFO, FACTORS, score4, stateScores, type Scored } from '../lib/gap4'
import { tooltipBox } from '../lib/tooltip'

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

  const layers = ({ GeoJsonLayer }: Kit) => [
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
  ].filter(Boolean)

  const tip = ({ object, layer }: PickingInfo) => {
    const p = (object as Feature | undefined)?.properties
    if (!p) return null
    if (layer?.id === 'states') return tooltipBox(`<b>${p.state}</b><br/>Gap Score <b>${fmt(sScore.get(p.state) ?? 0)}</b> / 100<br/><span style="opacity:.7">Click to see districts</span>`)
    const d = byId.get(p.id)
    return d ? tooltipBox(`<b>${d.name}</b>, ${d.state}<br/>Gap Score <b>${fmt(d.score)}</b> / 100 · #${d.pos} in India`) : null
  }

  return (
    <>
      <PageHeader title="Where is EV charging missing?">
        Every district gets an <b className="text-text">Infrastructure Gap Score out of 100</b>. Higher means more underserved. Pick a state, then tap a district to see why.
      </PageHeader>
      <Container className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !w-64" value={state} onChange={(e) => chooseState(e.target.value)} aria-label="Choose a state">
            <option value="">All of India</option>
            {(states ?? []).map((s) => s.state).sort().map((s) => <option key={s}>{s}</option>)}
          </select>
          {state && <button className="pill" onClick={() => chooseState('')}><X size={14} />Back to India</button>}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Registered EVs (estimated)" value={states ? compact(totals.evs) : '…'} sub="VAHAN totals shared out by state" />
          <Kpi label="Public charging stations" value={states ? fmt(totals.stations) : '…'} sub="Ministry of Power, Aug 2025" />
          <Kpi label="Charging points (estimated)" value={states ? fmt(totals.points) : '…'} sub="National total shared out by state" />
          <Kpi label="EVs per charging point" value={states ? fmt(totals.ratio) : '…'} accent="warn" sub="Lower is better" />
        </div>

        <div className="grid lg:grid-cols-[1fr_380px] gap-4">
          <div className="card overflow-hidden !p-0">
            <div className="relative h-[460px] md:h-[560px]">
              <MapBase ref={map} basemap={theme} onReady={() => setMapOn(true)} deck={(_, k) => ({ layers: layers(k), getTooltip: tip })} />
              <div className="absolute left-3 bottom-3 glass p-3 w-60 no-print">
                <Legend title={state ? 'District Gap Score' : 'State Gap Score'} stops={gradient(HEAT)} lo="0 · well served" hi="100 · underserved" />
              </div>
            </div>
          </div>

          <div className="space-y-4 min-w-0">
            <div className="card p-5">
              {!sel ? (
                <>
                  <CardTitle>Why this score?</CardTitle>
                  <p className="text-sm text-muted">{state ? 'Tap a district on the map or in the list below.' : 'Choose a state, or tap one on the map, to see its districts.'}</p>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="font-semibold text-lg leading-tight">{sel.name}</h2><p className="text-xs text-muted">{sel.state} · #{sel.pos} most underserved of {scored!.length}</p></div>
                    <div className="text-right"><div className="text-3xl font-semibold tnum" style={{ color: css(ramp(HEAT, Math.max(0.35, sel.score / 100))) }}>{fmt(sel.score)}</div><div className="text-[11px] text-muted">out of 100</div></div>
                  </div>
                  <div className="mt-4"><Breakdown d={sel} /></div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link className="btn btn-ghost justify-center !text-xs" to={`/map?lat=${sel.lat}&lon=${sel.lon}&z=10`}><MapPin size={14} />View on map</Link>
                    <button className="btn btn-ghost justify-center !text-xs" onClick={() => toggleCompare(sel.id)}><Plus size={14} />{compare.includes(sel.id) ? 'Remove' : 'Compare'}</button>
                  </div>
                </>
              )}
            </div>

            <div className="card p-5">
              <CardTitle>Most underserved{state ? ` in ${state}` : ' in India'}</CardTitle>
              {!scored ? <Skeleton className="h-64" /> : (
                <ol className="space-y-1 max-h-[340px] overflow-auto -mx-2" data-lenis-prevent>
                  {inView.slice(0, 15).map((d, i) => (
                    <li key={d.id} className="rise">
                      <button onClick={() => { if (!state) chooseState(d.state); setPick(d.id) }}
                        className={`w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-hover ${pick === d.id ? 'bg-active' : ''}`}>
                        <span className="w-5 text-xs text-muted tnum">{i + 1}</span>
                        <span className="min-w-0 flex-1"><span className="block text-sm truncate">{d.name}</span><span className="block text-[11px] text-muted truncate">{d.state}</span></span>
                        <span className="w-10 h-1.5 rounded-full bg-active overflow-hidden"><span className="block h-full" style={{ width: `${d.score}%`, background: css(ramp(HEAT, d.score / 100)) }} /></span>
                        <span className="w-7 text-right text-sm font-semibold tnum">{fmt(d.score)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>

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
      </Container>
    </>
  )
}
