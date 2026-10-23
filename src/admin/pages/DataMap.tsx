import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { PickingInfo } from '@deck.gl/core'
import type { Feature, FeatureCollection } from 'geojson'
import MapBase from '../../components/LazyMap'
import type { Kit } from '../../components/MapBase'
import { bboxOf, INDIA_BOUNDS, Legend, type MapBaseHandle } from '../../components/mapUtil'
import { ArrowDownRight, ArrowUpRight, Eye, GitCompareArrows, Search, SlidersHorizontal, X } from 'lucide-react'
import { Group, Select, Stat, Toggle } from '../../components/controls'
import { Num, SourceBadge, Skeleton } from '../../components/ui'
import { useData, type Cells, type Chargers, type DistrictRow, type Highways, type ModelledChargers, type StateRow, type Summary } from '../../lib/data'
import { useTheme } from '../../lib/theme'
import { css, GAP, gradient, MAGMA, quantileScale, ramp, VIRIDIS } from '../../lib/colors'
import { compact, fmt, pct } from '../../lib/format'
import { greedySites, parseCells, VEHICLE_TYPES, type Site } from '../../lib/model'
import { tooltipBox } from '../../lib/tooltip'
import { downloadCsv } from '../../lib/csv'
import { useExport } from '../../lib/exporter'

type Metric = 'gap' | 'ev_density' | 'evs_per_charger' | 'none'
type Veh = 'all' | (typeof VEHICLE_TYPES)[number]
type Seg = Highways['segments'][number]
const METRICS: Record<Exclude<Metric, 'none'>, { label: string; ramp: typeof VIRIDIS; log: boolean }> = {
  gap: { label: 'Gap Score (0-100)', ramp: GAP, log: false },
  ev_density: { label: 'EV density (EVs per km²)', ramp: VIRIDIS, log: true },
  evs_per_charger: { label: 'EVs per public charger', ramp: MAGMA, log: true },
}

// Major intercity corridors drawn as arcs between their end cities, styled by the NH route's mapped gap length.
const CITIES: Record<string, [number, number]> = {
  Delhi: [77.21, 28.61], Mumbai: [72.88, 19.08], Bengaluru: [77.59, 12.97], Chennai: [80.27, 13.08], Kolkata: [88.36, 22.57], Nagpur: [79.09, 21.15],
  Hyderabad: [78.49, 17.39], Ahmedabad: [72.57, 23.02], Pune: [73.86, 18.52], Kochi: [76.27, 9.93], Chandigarh: [76.78, 30.73],
}
const ROUTES: [string, string, string][] = [
  ['Delhi', 'Ahmedabad', 'NH-48'], ['Ahmedabad', 'Mumbai', 'NH-48'], ['Mumbai', 'Bengaluru', 'NH-48'], ['Bengaluru', 'Chennai', 'NH-48'],
  ['Delhi', 'Kolkata', 'NH-19'], ['Kolkata', 'Chennai', 'NH-16'], ['Delhi', 'Nagpur', 'NH-44'], ['Nagpur', 'Hyderabad', 'NH-44'],
  ['Hyderabad', 'Bengaluru', 'NH-44'], ['Pune', 'Hyderabad', 'NH-65'], ['Mumbai', 'Kochi', 'NH-66'], ['Delhi', 'Chandigarh', 'NH-44'],
]
const GAP_ROUTE_KM = 50 // a route with at least this many km of uncovered stretches is drawn dashed
type Arc = { ref: string; from: string; to: string; gapKm: number; path: [number, number][] }

/** Quadratic curve between two lon/lat points, bowed sideways by 18% of their distance. */
function curve([x0, y0]: [number, number], [x1, y1]: [number, number], n = 48): [number, number][] {
  const cx = (x0 + x1) / 2 - (y1 - y0) * 0.18, cy = (y0 + y1) / 2 + (x1 - x0) * 0.18
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t
    return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]
  })
}

export default function MapPage() {
  const [params, setParams] = useSearchParams()
  const [theme] = useTheme()
  const [basemap, setBasemap] = useState<'dark' | 'light'>(theme)
  useEffect(() => setBasemap(theme), [theme])

  const { data: summary } = useData<Summary>('summary.json')
  const { data: states } = useData<StateRow[]>('states.json')
  const { data: statesGeo } = useData<FeatureCollection>('states.geo.json')

  const [metric, setMetric] = useState<Metric>((params.get('metric') as Metric) || 'gap')
  const [layers, setLayers] = useState({
    chargers: true, modelled: false, heat: false, highways: params.get('layer') === 'highways',
    substations: false, population: false, recs: params.get('layer') === 'recs',
  })
  const [arcsOn, setArcsOn] = useState(true)
  const set = (k: keyof typeof layers) => (v: boolean) => setLayers((l) => ({ ...l, [k]: v }))
  const [view, setView] = useState<'states' | 'layers'>('states')
  const [cmpSlug, setCmp] = useState<string | null>(null)
  const [details, setDetails] = useState(false)
  const [chargerType, setChargerType] = useState<'all' | 'ac' | 'dc'>('all')
  const [operator, setOperator] = useState(-1)
  const [veh, setVeh] = useState<Veh>('all')
  const [panelOpen, setPanelOpen] = useState(false)
  const [hoverDistrict, setHoverDistrict] = useState<string | null>(null)
  const [selDistrict, setSelDistrict] = useState<string | null>(params.get('district'))
  const selSlug = params.get('state')
  const sel = states?.find((s) => s.slug === selSlug) ?? null
  const [q, setQ] = useState('')
  // district table is only needed once a state is open or the visitor searches
  const { data: districts } = useData<DistrictRow[]>(sel || q ? 'districts.json' : null)

  const { data: chargers } = useData<Chargers>(layers.chargers ? 'chargers.json' : null)
  const { data: modelled } = useData<ModelledChargers>(layers.chargers && layers.modelled ? '../admin/data/chargers-modelled.json' : null)
  const { data: highways } = useData<Highways>(layers.highways ? 'highways.json' : null)
  const { data: substations } = useData<[number, number][]>(layers.substations ? 'substations.json' : null)
  const { data: population } = useData<[number, number, number][]>(layers.population ? 'population.json' : null)
  const { data: distGeo } = useData<FeatureCollection>(sel ? `districts/${sel.slug}.geo.json` : null)
  const { data: cells } = useData<Cells>(layers.recs && sel ? `cells/${sel.slug}.json` : null)
  const showArcs = arcsOn && !sel
  const { data: gapSegs } = useData<Highways>(showArcs ? 'highway-gaps.json' : null)
  const cmp = states?.find((s) => s.slug === cmpSlug) ?? null

  useExport('Export map', () => states && downloadCsv('chargeevsetu-map-states.csv', states.map((s) => ({
    state: s.state, evs_2026_est: s.evs, public_chargers: s.chargers, evs_per_charger: s.evs_per_charger.toFixed(1), gap_score: s.gap_score.toFixed(2),
    urban_pop_within_3km_pct: s.coverage, chargers_per_lakh: s.chargers_per_lakh, nh_km: s.nh_km, nh_gap_km: s.nh_gap_km,
  }))))

  // ---- corridor arcs: draw in once, then stay ----
  const arcs = useMemo<Arc[]>(() => {
    if (!gapSegs) return []
    const gapKm = new Map<string, number>()
    gapSegs.segments.forEach((g) => { if (g[1]) gapKm.set(g[0], (gapKm.get(g[0]) ?? 0) + g[3]) })
    return ROUTES.map(([from, to, ref]) => ({ ref, from, to, gapKm: gapKm.get(ref) ?? 0, path: curve(CITIES[from], CITIES[to]) }))
  }, [gapSegs])
  const [drawn, setDrawn] = useState(0)
  useEffect(() => {
    if (!arcs.length || drawn) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setDrawn(1)
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1400)
      setDrawn(1 - (1 - p) ** 3)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcs])
  const arcPaths = useMemo(() => {
    const out: Arc[] = []
    for (const a of arcs) {
      const path = a.path.slice(0, Math.max(2, Math.ceil(drawn * (a.path.length - 1)) + 1))
      if (a.gapKm < GAP_ROUTE_KM) out.push({ ...a, path })
      else for (let i = 0; i < path.length - 1; i += 2) out.push({ ...a, path: [path[i], path[i + 1]] }) // dashes
    }
    return out
  }, [arcs, drawn])
  const mapRef = useRef<MapBaseHandle>(null)
  const stateByName = useMemo(() => new Map(states?.map((s) => [s.state, s])), [states])
  const distById = useMemo(() => new Map(districts?.map((d) => [d.id, d])), [districts])

  useEffect(() => {
    if (!statesGeo) return
    if (!sel) return mapRef.current?.fit(INDIA_BOUNDS, 5)
    const f = statesGeo.features.find((x) => x.properties?.state === sel.state)
    if (f) mapRef.current?.fit(bboxOf(f.geometry as never), 9)
  }, [sel, statesGeo])

  const selectState = (slug: string | null, district: string | null = null) => {
    const p = new URLSearchParams(params)
    if (slug) p.set('state', slug); else p.delete('state')
    if (district) p.set('district', district); else p.delete('district')
    setParams(p, { replace: true })
    setSelDistrict(district)
  }

  // ---- metric values (vehicle filter scales EV-based metrics by the state's vehicle mix) ----
  const share = (mix?: StateRow['mix']) => (veh === 'all' || !mix ? 1 : mix[veh])
  const stateVal = (s: StateRow) =>
    metric === 'gap' ? s.gap_score : metric === 'ev_density' ? (s.evs * share(s.mix)) / s.area_km2 : (s.evs * share(s.mix)) / Math.max(s.chargers, 1)
  const distVal = (d: DistrictRow) => {
    const mx = stateByName.get(d.state)?.mix
    return metric === 'gap' ? d.gap_score : metric === 'ev_density' ? d.ev_density * share(mx) : d.evs_per_charger * share(mx)
  }
  const m = metric === 'none' ? null : METRICS[metric]
  const scale = useMemo(() => {
    if (!m) return null
    const vals = sel ? (districts ?? []).filter((d) => d.state === sel.state).map(distVal) : (states ?? []).map(stateVal)
    return quantileScale(vals, m.log)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, veh, sel, states, districts])

  // ---- chargers ----
  const chargerRows = useMemo(() => {
    if (!chargers) return []
    const rows = layers.modelled && modelled ? [...chargers.real, ...modelled.synthetic] : chargers.real
    return rows.filter((r) =>
      (chargerType === 'all' || (chargerType === 'dc') === (r[2] === 1)) &&
      (operator < 0 || r[3] === operator) && (!sel || r[5] === sel.id))
  }, [chargers, modelled, layers.modelled, chargerType, operator, sel])

  const chargerGeo = useMemo<FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: layers.heat ? [] : chargerRows.map((r) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [r[0], r[1]] }, properties: { dc: r[2], syn: r[6] },
    })),
  }), [chargerRows, layers.heat])

  // ---- recommendations ----
  const recs = useMemo(() => (cells ? greedySites(parseCells(cells.cols, cells.rows), 30) : null), [cells])

  const line: [number, number, number] = basemap === 'dark' ? [230, 238, 243] : [13, 27, 38]
  const deckLayers = (beforeId: string | undefined, { GeoJsonLayer, HeatmapLayer, PathLayer, ScatterplotLayer }: Kit) => [
    !sel && statesGeo && new GeoJsonLayer({
      beforeId, id: 'states', data: statesGeo, pickable: true, stroked: true, filled: true,
      getFillColor: (f: Feature) => {
        const s = stateByName.get(f.properties?.state)
        return s && scale && m ? [...ramp(m.ramp, scale.t(stateVal(s))), 170] : [0, 0, 0, 0]
      },
      getLineColor: [...line, 90] as [number, number, number, number], lineWidthMinPixels: 0.8, autoHighlight: true, highlightColor: [181, 242, 61, 80],
      onClick: (i: PickingInfo<Feature>) => { const s = stateByName.get(i.object?.properties?.state); if (s) selectState(s.slug) },
      updateTriggers: { getFillColor: [metric, veh, scale], getLineColor: basemap },
    }),
    sel && statesGeo && new GeoJsonLayer({
      beforeId, id: 'states-mask', data: statesGeo, pickable: true, filled: true, stroked: true,
      getFillColor: (f: Feature) => (f.properties?.state === sel.state ? [0, 0, 0, 0] : basemap === 'dark' ? [7, 11, 15, 150] : [245, 248, 250, 160]),
      getLineColor: [142, 163, 177, 120], lineWidthMinPixels: 0.6,
      onClick: (i: PickingInfo<Feature>) => { const s = stateByName.get(i.object?.properties?.state); if (s && s.slug !== sel.slug) selectState(s.slug) },
      updateTriggers: { getFillColor: [sel.state, basemap] },
    }),
    sel && distGeo && new GeoJsonLayer({
      beforeId, id: 'districts', data: distGeo, pickable: true, stroked: true, filled: true,
      getFillColor: (f: Feature) => {
        const d = distById.get(f.properties?.id)
        return d && scale && m ? [...ramp(m.ramp, scale.t(distVal(d))), 175] : [0, 0, 0, 0]
      },
      getLineColor: (f: Feature): [number, number, number, number] => (f.properties?.id === selDistrict ? [181, 242, 61, 255] : [...line, 110]),
      getLineWidth: (f: Feature) => (f.properties?.id === selDistrict ? 3 : 1), lineWidthUnits: 'pixels',
      autoHighlight: true, highlightColor: [181, 242, 61, 80],
      onHover: (i: PickingInfo<Feature>) => setHoverDistrict(i.object?.properties?.id ?? null),
      onClick: (i: PickingInfo<Feature>) => setSelDistrict(i.object?.properties?.id ?? null),
      updateTriggers: { getFillColor: [metric, veh, scale], getLineColor: [selDistrict, basemap], getLineWidth: selDistrict },
    }),
    layers.population && population && new HeatmapLayer<[number, number, number]>({
      id: 'population', data: population, getPosition: (d) => [d[0], d[1]], getWeight: (d) => d[2],
      radiusPixels: 22, threshold: 0.04, colorRange: VIRIDIS.slice(1) as never, opacity: 0.75,
    }),
    layers.chargers && layers.heat && new HeatmapLayer<number[]>({
      id: 'charger-heat', data: chargerRows, getPosition: (d) => [d[0], d[1]], radiusPixels: 26, intensity: 1.4,
      threshold: 0.03, colorRange: MAGMA.slice(2) as never,
    }),
    layers.highways && highways && new PathLayer<Seg>({
      id: 'highways', data: highways.segments, getPath: (s) => s[4], pickable: true, capRounded: true, widthUnits: 'pixels',
      getColor: (s) => (s[1] ? [239, 75, 91, 235] : basemap === 'dark' ? [181, 242, 61, 150] : [10, 157, 110, 190]),
      getWidth: (s) => (s[1] ? 3 : 2), updateTriggers: { getColor: basemap },
    }),
    layers.substations && substations && new ScatterplotLayer<[number, number]>({
      id: 'substations', data: substations, getPosition: (d) => d, getRadius: 2, radiusUnits: 'pixels', getFillColor: [245, 184, 74, 150],
    }),
    showArcs && new PathLayer<Arc>({
      id: 'arcs-glow', data: arcPaths, getPath: (a) => a.path, widthUnits: 'pixels', getWidth: 9, capRounded: true,
      getColor: (a) => (a.gapKm < GAP_ROUTE_KM ? [181, 242, 61, 42] : [255, 92, 100, 38]),
    }),
    showArcs && new PathLayer<Arc>({
      id: 'arcs', data: arcPaths, getPath: (a) => a.path, widthUnits: 'pixels', getWidth: 2.2, capRounded: true, pickable: true,
      getColor: (a) => (a.gapKm < GAP_ROUTE_KM ? (basemap === 'dark' ? [181, 242, 61, 235] : [77, 124, 15, 235]) : [255, 92, 100, 235]),
      updateTriggers: { getColor: basemap },
    }),
    recs && new ScatterplotLayer<Site>({
      id: 'recs-halo', data: recs.sites, getPosition: (s) => [s.cell.lon, s.cell.lat], getRadius: 3000,
      getFillColor: [181, 242, 61, 35], getLineColor: [181, 242, 61, 190], stroked: true, lineWidthMinPixels: 1,
    }),
    recs && new ScatterplotLayer<Site>({
      id: 'recs', data: recs.sites, getPosition: (s) => [s.cell.lon, s.cell.lat], getRadius: 7, radiusUnits: 'pixels',
      getFillColor: [255, 255, 255, 255], getLineColor: [181, 242, 61, 255], lineWidthMinPixels: 3, stroked: true, pickable: true,
    }),
  ].filter(Boolean)

  const getTooltip = ({ object, layer }: PickingInfo) => {
    if (!object || !layer) return null
    if (layer.id === 'states') {
      const s = stateByName.get((object as Feature).properties?.state)
      return s ? tooltipBox(`<b>${s.state}</b><br/>EVs: ${compact(s.evs)} · Chargers: ${fmt(s.chargers)}<br/>EVs per charger: ${fmt(s.evs_per_charger)} · Gap Score: ${fmt(s.gap_score, 1)}<br/><span style="opacity:.7">Click to open districts</span>`) : null
    }
    if (layer.id === 'districts') {
      const d = distById.get((object as Feature).properties?.id)
      return d ? tooltipBox(`<b>${d.name}</b>, ${d.state}<br/>EVs (est.): ${compact(d.evs)} · Chargers (est.): ${fmt(d.chargers)}<br/>EVs per charger: ${fmt(d.evs_per_charger)}<br/>Gap Score: ${fmt(d.gap_score, 1)} · rank ${d.rank} of ${districts?.length}`) : null
    }
    if (layer.id === 'highways') {
      const s = object as Seg
      return tooltipBox(`<b>${s[0]}</b><br/>Nearest charger: ${s[2]} km<br/>${s[1] ? '<b style="color:var(--crit)">Gap: no charger within 12.5 km either side</b>' : 'Covered at ≤ 25 km spacing'}`)
    }
    if (layer.id === 'arcs') {
      const a = object as Arc
      return tooltipBox(`<b>${a.from} → ${a.to}</b> · ${a.ref}<br/>${fmt(a.gapKm)} km of the whole ${a.ref} has no charger within 12.5 km either side<br/><span style="opacity:.7">${a.gapKm < GAP_ROUTE_KM ? 'Solid: largely covered' : `Dashed: ≥ ${GAP_ROUTE_KM} km of gap stretches`}</span>`)
    }
    if (layer.id === 'recs') {
      const s = object as Site
      return tooltipBox(`<b>Recommended site #${s.rank}</b> · why here?<br/>${s.reasons.map((r) => `• ${r}`).join('<br/>')}`)
    }
    return null
  }

  // ---- search ----
  const results = useMemo(() => {
    if (q.trim().length < 2 || !states || !districts) return []
    const l = q.trim().toLowerCase()
    return [
      ...districts.filter((d) => d.name.toLowerCase().includes(l)).map((d) => ({ label: d.name, sub: d.state, state: stateByName.get(d.state)!.slug, district: d.id })),
    ].slice(0, 8)
  }, [q, states, districts, stateByName])

  const flyToDistrict = (id: string) => { const d = distById.get(id); if (d) setTimeout(() => mapRef.current?.fly(d.lon, d.lat, 8.5), 750) }
  const dFocus = (selDistrict ?? hoverDistrict) ? distById.get((selDistrict ?? hoverDistrict)!) ?? null : null

  // ---- states list: sorted worst gap first; tiers are thirds of that ranking ----
  const ranked = useMemo(() => [...(states ?? [])].sort((a, b) => b.gap_score - a.gap_score), [states])
  const tier = (s: StateRow) => {
    const i = ranked.indexOf(s) / Math.max(ranked.length, 1)
    return i < 1 / 3 ? ['High gap', 'text-crit border-crit/30 bg-crit/10'] : i < 2 / 3 ? ['Moderate', 'text-warn border-warn/30 bg-warn/10'] : ['Low gap', 'text-accent border-accent/30 bg-accent/10']
  }
  const listed = ranked.filter((s) => !q.trim() || s.state.toLowerCase().includes(q.trim().toLowerCase()))
  const usedCities = [...new Set(ROUTES.flatMap(([a, b]) => [a, b]))]

  return (
    <div className="relative flex-1 min-h-[480px] mx-4 md:mx-6 mb-4 rounded-[20px] overflow-hidden border border-line">
      <MapBase ref={mapRef} basemap={basemap} nav="top-right" deck={(labelId, k) => ({ layers: deckLayers(labelId, k), getTooltip })}>
        {({ Source, Layer, Marker }) => (
          <>
            {layers.chargers && !layers.heat && (
              <Source id="chargers" type="geojson" data={chargerGeo} cluster clusterRadius={42} clusterMaxZoom={11}>
                <Layer id="clusters" type="circle" filter={['has', 'point_count']} paint={{
                  'circle-color': ['step', ['get', 'point_count'], '#a1a1aa', 50, '#b5f23d', 500, '#f5b84a'],
                  'circle-radius': ['step', ['get', 'point_count'], 13, 50, 18, 500, 25],
                  'circle-opacity': 0.88, 'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(255,255,255,0.55)',
                }} />
                <Layer id="cluster-count" type="symbol" filter={['has', 'point_count']}
                  layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Open Sans Bold'] }}
                  paint={{ 'text-color': '#0b0b0c' }} />
                <Layer id="charger-pt" type="circle" filter={['!', ['has', 'point_count']]} paint={{
                  'circle-color': ['case', ['==', ['get', 'syn'], 1], '#8ea3b1', ['==', ['get', 'dc'], 1], '#f5b84a', '#b5f23d'],
                  'circle-radius': ['case', ['==', ['get', 'syn'], 1], 3, 5],
                  'circle-stroke-width': ['case', ['==', ['get', 'syn'], 1], 0, 1.5], 'circle-stroke-color': '#0b0b0c',
                }} />
              </Source>
            )}
            {showArcs && arcs.length > 0 && usedCities.map((c) => (
              <Marker key={c} longitude={CITIES[c][0]} latitude={CITIES[c][1]} anchor="left" offset={[-5, 0]}>
                <span className="flex items-center gap-1.5 pointer-events-none select-none">
                  <span className="relative w-2.5 h-2.5 rounded-full bg-accent-fill pulse-dot shadow-[0_0_10px_var(--accent-fill)]" />
                  <span className="rounded-md bg-[#0b0b0c]/85 text-white text-[10px] font-medium px-1.5 py-0.5 border border-white/10">{c}</span>
                </span>
              </Marker>
            ))}
          </>
        )}
      </MapBase>

      <button className="no-print lg:hidden absolute top-3 left-3 z-20 btn btn-primary !py-2 shadow-lg" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen} aria-controls="map-panel">
        {panelOpen ? <><X size={15} /> Close</> : <><SlidersHorizontal size={15} /> States & layers</>}
      </button>

      <aside id="map-panel" className={`no-print absolute z-10 left-3 top-16 lg:top-3 bottom-3 w-[min(340px,calc(100%-24px))] glass flex flex-col transition-transform duration-200 ${panelOpen ? 'translate-x-0' : '-translate-x-[110%]'} lg:translate-x-0`}>
        <div className="p-4 pb-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">{view === 'states' ? 'States' : 'Layers & filters'} {view === 'states' && <span className="text-muted text-sm tnum">{ranked.length || ''}</span>}</h2>
            <button className={`icon-btn !w-8 !h-8 ${view === 'layers' ? '!text-accent !bg-accent/10' : ''}`} onClick={() => setView(view === 'states' ? 'layers' : 'states')}
              aria-pressed={view === 'layers'} aria-label="Show layers and filters" title="Layers & filters"><SlidersHorizontal size={15} /></button>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
            <input id="map-search" className="input !pl-9" placeholder="Search a state or district" aria-label="Search a state or district" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            {results.length > 0 && (
              <ul className="absolute z-20 left-0 right-0 mt-1 card !animate-none py-1 max-h-72 overflow-auto">
                {results.map((r) => (
                  <li key={r.label + r.sub}>
                    <button className="w-full text-left px-3 py-2 hover:bg-hover text-sm" onClick={() => { selectState(r.state, r.district); setQ(''); if (r.district) flyToDistrict(r.district) }}>
                      {r.label} <span className="text-muted text-xs">· {r.sub}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3 min-h-0">
          {view === 'states' ? (
            !states ? <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
              <ul className="space-y-1">
                {listed.map((s) => {
                  const [tl, tc] = tier(s)
                  const active = sel?.slug === s.slug
                  return (
                    <li key={s.slug} className="rise">
                      <div className={`flex items-center gap-1.5 rounded-xl pl-3 pr-1.5 py-2 transition-colors ${active ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-hover'}`}>
                        <button className="flex-1 min-w-0 text-left" onClick={() => selectState(active ? null : s.slug)} aria-pressed={active}>
                          <span className="flex items-center gap-2"><span className="truncate text-sm">{s.state}</span><span className={`chip !text-[10px] !px-1.5 ${tc}`}>{tl}</span></span>
                          <span className="text-[11px] text-muted tnum">{fmt(s.chargers)} chargers · gap {fmt(s.gap_score, 1)}</span>
                        </button>
                        <button className="grid place-items-center w-7 h-7 rounded-lg text-muted hover:text-text hover:bg-active transition-colors" onClick={() => selectState(s.slug)} aria-label={`View ${s.state} on the map`} title="View"><Eye size={15} /></button>
                        <button className={`grid place-items-center w-7 h-7 rounded-lg transition-colors ${cmpSlug === s.slug ? 'text-accent bg-accent/10' : 'text-muted hover:text-text hover:bg-active'}`}
                          onClick={() => setCmp(cmpSlug === s.slug ? null : s.slug)} aria-pressed={cmpSlug === s.slug} aria-label={`Compare with ${s.state}`} title="Compare"><GitCompareArrows size={15} /></button>
                      </div>
                    </li>
                  )
                })}
                {!listed.length && <li className="text-sm text-muted px-3 py-2">No state matches. Districts appear above.</li>}
              </ul>
            )
          ) : (
            <div className="space-y-5 pt-1">
              <Group title="Colour the map by">
                <div className="grid grid-cols-2 gap-1.5">
                  {(['gap', 'ev_density', 'evs_per_charger', 'none'] as Metric[]).map((k) => (
                    <button key={k} onClick={() => setMetric(k)} aria-pressed={metric === k}
                      className={`text-xs rounded-xl px-2 py-2 border transition-colors ${metric === k ? 'border-accent/40 text-accent bg-accent/10' : 'border-line text-muted hover:text-text'}`}>
                      {k === 'none' ? 'No colour' : k === 'gap' ? 'Gap Score' : k === 'ev_density' ? 'EV density' : 'EVs per charger'}
                    </button>
                  ))}
                </div>
              </Group>

              <Group title="Layers">
                <Toggle on={arcsOn} set={setArcsOn} label="Corridor arcs · dashed = gaps" badge="real"
                  sub={`Major NH routes between cities; dashed where the route has ≥ ${GAP_ROUTE_KM} km with no charger for 25 km. National view only.`} />
                <Toggle on={layers.chargers} set={set('chargers')} label="Charging stations" badge="real" sub={chargers ? `${fmt(chargers.real.length)} mapped in OpenStreetMap · amber = DC fast` : undefined} />
                {layers.chargers && (
                  <div className="pl-10 space-y-2.5">
                    <div className="flex gap-1.5">
                      {(['points', 'heat'] as const).map((k) => (
                        <button key={k} onClick={() => set('heat')(k === 'heat')} aria-pressed={(k === 'heat') === layers.heat}
                          className={`text-xs rounded-full px-2.5 py-1 border ${(k === 'heat') === layers.heat ? 'border-accent/40 text-accent bg-accent/10' : 'border-line text-muted'}`}>
                          {k === 'points' ? 'Clustered points' : 'Heatmap'}
                        </button>
                      ))}
                    </div>
                    <Toggle small on={layers.modelled} set={set('modelled')} label="Add modelled locations" badge="synthetic"
                      sub={summary ? `${fmt(summary.modelled_chargers)} placeholders that, with the mapped points, bring the map to about the official ${fmt(summary.public_chargers)}` : undefined} />
                  </div>
                )}
                <Toggle on={layers.highways} set={set('highways')} label="National highways · gaps in red" badge="real"
                  sub={summary?.nh_km_mapped ? `${fmt(summary.nh_gap_km)} of ${fmt(summary.nh_km_mapped)} km have no charger for 25 km` : undefined} />
                <Toggle on={layers.substations} set={set('substations')} label="Power substations (grid readiness)" badge="real" />
                <Toggle on={layers.population} set={set('population')} label="Population density" badge="real" />
                <Toggle on={layers.recs} set={set('recs')} label="Recommended new sites" badge="derived"
                  sub={!sel ? 'Pick a state to compute sites' : recs ? `Top 30 hubs (10 chargers each): EV demand met ${pct(recs.before)} → ${pct(recs.after)}` : layers.recs ? 'Computing…' : undefined} />
              </Group>

              <Group title="Filters">
                <Select label="State" value={sel?.slug ?? ''} onChange={(v) => selectState(v || null)}
                  options={[['', 'All India'], ...(states ?? []).slice().sort((a, b) => a.state.localeCompare(b.state)).map((s) => [s.slug, s.state] as [string, string])]} />
                {sel && (
                  <Select label="District" value={selDistrict ?? ''} onChange={(v) => { setSelDistrict(v || null); const d = distById.get(v); if (d) mapRef.current?.fly(d.lon, d.lat, 8.5) }}
                    options={[['', 'All districts'], ...(districts ?? []).filter((d) => d.state === sel.state).sort((a, b) => a.name.localeCompare(b.name)).map((d) => [d.id, d.name] as [string, string])]} />
                )}
                <Select label="Charger type" value={chargerType} onChange={(v) => setChargerType(v as 'all')} options={[['all', 'AC + DC'], ['ac', 'AC (slow)'], ['dc', 'DC (fast)']]} />
                <Select label="Operator" value={String(operator)} onChange={(v) => setOperator(Number(v))}
                  options={[['-1', 'All operators'], ...(chargers?.operators.slice(0, -1) ?? []).map((o, i) => [String(i), o] as [string, string]).sort((a, b) => a[1].localeCompare(b[1]))]} />
                <Select label="Vehicle category (EV colouring)" value={veh} onChange={(v) => setVeh(v as Veh)}
                  options={[['all', 'All EVs'], ...VEHICLE_TYPES.map((t) => [t, t === 'Goods' ? 'Goods carriers' : t === 'Bus' ? 'Buses' : t] as [string, string])]} />
              </Group>

              <Group title="Basemap">
                <div className="flex gap-1.5">
                  {(['dark', 'light'] as const).map((b) => (
                    <button key={b} onClick={() => setBasemap(b)} aria-pressed={basemap === b} className={`text-xs rounded-full px-3 py-1.5 border capitalize ${basemap === b ? 'border-accent/40 text-accent bg-accent/10' : 'border-line text-muted'}`}>{b}</button>
                  ))}
                </div>
              </Group>
              <p className="text-[11px] text-muted leading-relaxed">
                © OpenStreetMap contributors (ODbL) · basemap © CARTO. Totals: Ministry of Power, BHEL portal, VAHAN (Parliament replies). <Link to="/data-sources" className="text-accent">All sources →</Link>
              </p>
            </div>
          )}
        </div>

        {m && scale && (
          <div className="border-t border-line p-4">
            <Legend title={`${m.label} · ${sel ? 'districts' : 'states'}`} stops={gradient(m.ramp)}
              lo={`${fmt(scale.lo, scale.lo < 10 ? 1 : 0)}${metric === 'gap' ? ' · better served' : ''}`}
              hi={`${fmt(scale.hi, 0)}${metric === 'gap' ? ' · most underserved' : '+'}`}
              badge={<SourceBadge type="derived" title="Official state totals scaled to 2026; district values are modelled splits" />} />
          </div>
        )}
      </aside>

      {sel && states && (
        <div className="no-print hidden md:block absolute z-10 right-14 top-3 w-[min(320px,calc(100%-24px))]">
          <StateCard s={sel} d={dFocus} districts={(districts ?? []).filter((d) => d.state === sel.state)} onBack={() => selectState(null)} />
        </div>
      )}

      <div className="no-print absolute z-10 left-3 right-3 bottom-3 lg:left-auto lg:w-[min(560px,calc(100%-376px))] flex flex-col gap-3">
        {sel && details && (
          <div className="md:hidden">
            <StateCard s={sel} d={dFocus} districts={(districts ?? []).filter((d) => d.state === sel.state)} onBack={() => selectState(null)} />
          </div>
        )}
        {!states || !summary ? (
          <div className="glass p-4 space-y-3"><Skeleton className="h-5 w-40" /><div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div></div>
        ) : (
          <Performance s={sel} cmp={cmp?.slug === sel?.slug ? null : cmp} states={states} summary={summary}
            onClearCmp={() => setCmp(null)} details={details} onDetails={sel ? () => setDetails((x) => !x) : undefined} />
        )}
      </div>
    </div>
  )
}

/** "<State> performance": 4 KPIs with % badges vs the comparison state, or vs a natural baseline when none is picked. */
function Performance({ s, cmp, states, summary, onClearCmp, details, onDetails }: {
  s: StateRow | null; cmp: StateRow | null; states: StateRow[]; summary: Summary; onClearCmp: () => void; details: boolean; onDetails?: () => void
}) {
  const avgGap = states.reduce((a, x) => a + x.gap_score, 0) / states.length
  const official = states.reduce((a, x) => a + x.official_chargers_2025, 0)
  const v = s
    ? { chargers: s.chargers, evs: s.evs, epc: s.evs_per_charger, gap: s.gap_score }
    : { chargers: summary.public_chargers, evs: summary.ev_stock, epc: summary.evs_per_charger, gap: avgGap }
  // [label, value, baseline, baseline label, higher is better]
  const kpis: [string, string, number | null, string, boolean][] = cmp
    ? [
        ['Chargers', fmt(v.chargers), cmp.chargers, `vs ${cmp.state}`, true],
        ['EVs', compact(v.evs), cmp.evs, `vs ${cmp.state}`, true],
        ['EVs per charger', fmt(v.epc), cmp.evs_per_charger, `vs ${cmp.state}`, false],
        ['Gap Score', fmt(v.gap, 1), cmp.gap_score, `vs ${cmp.state}`, false],
      ]
    : [
        ['Chargers', fmt(v.chargers), s ? s.official_chargers_2025 : official, "vs Aug '25", true],
        ['EVs', compact(v.evs), s?.ev_stock_2023 ?? null, s ? 'vs 2023' : 'VAHAN total', true],
        ['EVs per charger', fmt(v.epc), s ? summary.evs_per_charger : null, s ? 'vs India' : 'national ratio', false],
        [s ? 'Gap Score' : 'Avg. Gap Score', fmt(v.gap, 1), s ? avgGap : null, s ? 'vs India avg' : `mean of ${states.length} states`, false],
      ]
  const raw = [v.chargers, v.evs, v.epc, v.gap]
  return (
    <section className="glass p-3.5 sm:p-5" aria-label={`${s?.state ?? 'All India'} performance`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-medium truncate">{s?.state ?? 'All India'} performance</h2>
        <div className="flex items-center gap-1.5 shrink-0">
          {cmp && <button className="chip text-accent border-accent/30 bg-accent/10" onClick={onClearCmp} aria-label={`Stop comparing with ${cmp.state}`}><GitCompareArrows size={11} />{cmp.state}<X size={11} /></button>}
          {onDetails && <button className="md:hidden chip" onClick={onDetails} aria-expanded={details}>{details ? 'Hide details' : 'Details'}</button>}
          <SourceBadge type={s ? 'derived' : 'real'} />
        </div>
      </div>
      <div key={s?.slug ?? 'india'} className="grid grid-cols-4 gap-x-3 sm:gap-x-4 gap-y-3">
        {kpis.map(([label, value, base, vs, up], i) => {
          const d = base ? (raw[i] / base - 1) * 100 : null
          const good = d != null && (d >= 0) === up
          return (
            <div key={label} className="min-w-0">
              <div className="text-[11px] text-muted truncate">{label}</div>
              <div className="text-base sm:text-2xl font-semibold tracking-[-0.035em] tnum leading-tight mt-0.5"><Num v={value} /></div>
              {d != null && Number.isFinite(d) ? (
                <div className="flex items-center gap-1 mt-1" title={`${d >= 0 ? '+' : ''}${d.toFixed(1)}% ${vs}`}>
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold tnum ${good ? 'text-accent bg-accent/10' : 'text-crit bg-crit/10'}`}>
                    {d >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}{Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}%
                  </span>
                  <span className="text-[10px] text-muted truncate">{vs}</span>
                </div>
              ) : <div className="text-[10px] text-muted mt-1 truncate">{vs}</div>}
            </div>
          )
        })}
      </div>
      {!s && <p className="hidden sm:block text-[11px] text-muted mt-3">{pct(summary.mapped_share)} of these chargers are mapped in OSM. Click a state on the map or in the list to zoom in. Use the compare button to benchmark against another state.</p>}
    </section>
  )
}

function StateCard({ s, d, districts, onBack }: { s: StateRow; d: DistrictRow | null; districts: DistrictRow[]; onBack: () => void }) {
  const top = [...districts].sort((a, b) => b.gap_score - a.gap_score).slice(0, 5)
  const max = Math.max(...Object.values(s.mix))
  return (
    <div className="glass p-4 space-y-4 max-h-[40dvh] md:max-h-[calc(100dvh-420px)] md:min-h-[220px] overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <button onClick={onBack} className="text-xs text-accent hover:underline">← All India</button>
          <h2 className="text-lg font-semibold mt-0.5">{s.state}</h2>
        </div>
        <SourceBadge type="derived" title="2026 values: official state splits scaled to national 2026 totals" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat k="EVs (2026 est.)" v={compact(s.evs)} />
        <Stat k="Public chargers" v={fmt(s.chargers)} />
        <Stat k="EVs per charger" v={fmt(s.evs_per_charger)} />
        <Stat k="Urban pop. ≤ 3 km" v={pct(s.coverage)} />
        <Stat k="Chargers / lakh people" v={fmt(s.chargers_per_lakh, 1)} />
        <Stat k="Mapped vs official" v={pct(s.completeness)} />
      </div>
      <div>
        <div className="text-xs font-semibold mb-2">EV mix by vehicle type</div>
        <div className="space-y-1.5">
          {Object.entries(s.mix).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-10 text-muted">{k}</span>
              <div className="flex-1 h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${(v / max) * 100}%` }} /></div>
              <span className="w-12 text-right tnum">{pct(v * 100, 1)}</span>
            </div>
          ))}
        </div>
      </div>
      {d && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 text-xs space-y-1">
          <div className="font-semibold text-sm">{d.name}</div>
          <div>EVs (est.) {compact(d.evs)} · chargers {fmt(d.chargers)} ({d.real_chargers} mapped)</div>
          <div>Gap Score <b>{fmt(d.gap_score, 1)}</b> · national rank {d.rank}</div>
          <div>Avg. distance to a charger {fmt(d.dist_km, 1)} km · NH {fmt(d.nh_km)} km</div>
        </div>
      )}
      <div>
        <div className="text-xs font-semibold mb-2">Most underserved districts</div>
        <ol className="space-y-1">
          {top.map((x, i) => (
            <li key={x.id} className="flex justify-between text-xs">
              <span><span className="text-muted mr-1.5">{i + 1}.</span>{x.name}</span>
              <span className="tnum font-semibold"><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: css(ramp(GAP, x.gap_score / 100)) }} />{fmt(x.gap_score, 1)}</span>
            </li>
          ))}
        </ol>
      </div>
      <Link to={`/estimate?region=${s.slug}`} className="btn btn-primary w-full justify-center !text-sm">Plan chargers for {s.state} →</Link>
    </div>
  )
}
