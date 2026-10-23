import { useEffect, useMemo, useRef, useState } from 'react'
import type { PickingInfo } from '@deck.gl/core'
import { Bike, Building2, IndianRupee, MousePointerClick, RotateCcw, ShieldCheck } from 'lucide-react'
import MapBase from '../components/LazyMap'
import type { Kit } from '../components/MapBase'
import { bboxOf, Legend, type MapBaseHandle } from '../components/mapUtil'
import { CardTitle, Container, Kpi, PageHeader, Skeleton } from '../components/ui'
import { useData } from '../lib/data'
import { useTheme } from '../lib/theme'
import { gradient, HEAT, ramp } from '../lib/colors'
import { compact, fmt, pct } from '../lib/format'
import { haversineKm } from '../lib/model'
import { stationIndex, type IndexRow } from '../lib/stations'
import { tooltipBox } from '../lib/tooltip'

interface HubArea { lon: number; lat: number; city: string; pop: number; stores: number; riders: number; kwh: number; chargers2km: number }
interface Shared { lon: number; lat: number; areas: number; riders: number; points: number; user?: boolean }
const R = 3 // km a rider will ride to a shared hub

/** Greedy: put each hub where it reaches the most riders who have no charger within 2 km. */
function recommend(areas: HubArea[], n = 5): Shared[] {
  const left = new Set(areas.map((_, i) => i).filter((i) => areas[i].chargers2km === 0))
  const out: Shared[] = []
  for (let k = 0; k < n && left.size; k++) {
    let best: number[] = []
    let bestRiders = 0
    for (const i of left) {
      const reach = [...left].filter((j) => haversineKm(areas[i].lat, areas[i].lon, areas[j].lat, areas[j].lon) <= R)
      const r = reach.reduce((s, j) => s + areas[j].riders, 0)
      if (r > bestRiders) { bestRiders = r; best = reach }
    }
    if (!best.length) break
    const w = best.reduce((s, j) => s + areas[j].riders, 0)
    out.push({
      lon: best.reduce((s, j) => s + areas[j].lon * areas[j].riders, 0) / w, lat: best.reduce((s, j) => s + areas[j].lat * areas[j].riders, 0) / w,
      areas: best.length, riders: bestRiders, points: Math.max(4, Math.ceil((bestRiders * 0.7) / 6)),
    })
    best.forEach((j) => left.delete(j))
  }
  return out
}

export default function Delivery() {
  const [theme] = useTheme()
  const map = useRef<MapBaseHandle>(null)
  const { data: hubs } = useData<HubArea[]>('hubs.json')
  const cities = useMemo(() => [...new Set((hubs ?? []).map((h) => h.city))], [hubs])
  const [city, setCity] = useState('Delhi NCR')
  const areas = useMemo(() => (hubs ?? []).filter((h) => h.city === city), [hubs, city])
  const [real, setReal] = useState<IndexRow[]>([])
  const [mine, setMine] = useState<Shared[]>([])
  useEffect(() => { stationIndex().then(setReal, () => {}) }, [])
  useEffect(() => {
    setMine([])
    if (areas.length) map.current?.fit(bboxOf({ type: 'MultiPoint', coordinates: areas.map((a) => [a.lon, a.lat]) }), 11)
  }, [areas])

  const recs = useMemo(() => recommend(areas), [areas])
  const maxKwh = Math.max(1, ...areas.map((a) => a.kwh))
  const riders = areas.reduce((s, a) => s + a.riders, 0)
  const lacking = areas.filter((a) => a.chargers2km === 0)
  const covered = (hubsList: Shared[]) => areas.reduce((s, a) => s + (a.chargers2km > 0 || hubsList.some((h) => haversineKm(a.lat, a.lon, h.lat, h.lon) <= R) ? a.riders : 0), 0)
  const now = riders ? (100 * covered([])) / riders : 0
  const withRecs = riders ? (100 * covered(recs)) / riders : 0
  const withMine = riders ? (100 * covered([...recs, ...mine])) / riders : 0

  const layers = ({ ScatterplotLayer }: Kit) => [
    new ScatterplotLayer<HubArea>({
      id: 'areas', data: areas, getPosition: (a) => [a.lon, a.lat], radiusUnits: 'meters', getRadius: 800, pickable: true, stroked: true, lineWidthMinPixels: 2,
      getFillColor: (a) => [...ramp(HEAT, a.kwh / maxKwh), 170] as [number, number, number, number],
      getLineColor: (a) => (a.chargers2km === 0 ? [147, 51, 234, 255] : [0, 0, 0, 0]), updateTriggers: { getFillColor: maxKwh },
    }),
    new ScatterplotLayer<IndexRow>({
      id: 'real', data: real, getPosition: (r) => [r[3], r[4]], radiusUnits: 'pixels', getRadius: 4.5, stroked: true, lineWidthMinPixels: 1.5, pickable: true,
      getFillColor: [34, 197, 94, 255], getLineColor: theme === 'dark' ? [11, 11, 12] : [255, 255, 255], updateTriggers: { getLineColor: theme },
    }),
    new ScatterplotLayer<Shared>({
      id: 'shared', data: [...recs, ...mine], getPosition: (h) => [h.lon, h.lat], radiusUnits: 'meters', getRadius: R * 1000, stroked: true, lineWidthMinPixels: 2, pickable: true,
      getFillColor: (h) => (h.user ? [248, 113, 113, 30] : [248, 113, 113, 45]), getLineColor: [248, 113, 113, 255],
    }),
  ]
  const click = (i: PickingInfo) => {
    if (!i.coordinate || i.layer?.id === 'shared') return
    const [lon, lat] = i.coordinate
    const reach = areas.filter((a) => a.chargers2km === 0 && haversineKm(a.lat, a.lon, lat, lon) <= R)
    const r = reach.reduce((s, a) => s + a.riders, 0)
    setMine((m) => [...m, { lon, lat, areas: reach.length, riders: r, points: Math.max(4, Math.ceil((r * 0.7) / 6)), user: true }])
  }
  const tip = ({ object, layer }: PickingInfo) => {
    if (!object) return null
    if (layer?.id === 'areas') { const a = object as HubArea; return tooltipBox(`<b>Estimated hub area</b><br/>~${a.stores} delivery stores · ~${a.riders} riders<br/>~${fmt(a.kwh)} kWh/day of rider charging<br/>${a.chargers2km ? `${a.chargers2km} public charger(s) within 2 km` : '<b>No public charger within 2 km</b>'}`) }
    if (layer?.id === 'real') return tooltipBox(`<b>${(object as IndexRow)[1]}</b><br/>Public charger`)
    const h = object as Shared
    return tooltipBox(`<b>${h.user ? 'Your proposed hub' : 'Recommended shared hub'}</b><br/>Serves ${h.areas} store area(s), ~${h.riders} riders<br/>~${h.points} charging / swap points`)
  }

  return (
    <>
      <PageHeader title="Charging for delivery riders">
        Quick-commerce and food-delivery riders ride all day on electric scooters. Shared charging hubs near busy store areas keep them off public chargers and on the road.
      </PageHeader>
      <Container className="space-y-4">
        <select className="input !w-64" value={city} onChange={(e) => setCity(e.target.value)} aria-label="Choose a city">
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Estimated hub areas" value={hubs ? fmt(areas.length) : '…'} sub="Dense areas likely to host delivery stores" />
          <Kpi label="Riders (estimated)" value={hubs ? compact(riders) : '…'} sub="~25 riders per store" />
          <Kpi label="Areas with no charger within 2 km" value={hubs ? fmt(lacking.length) : '…'} accent="crit" />
          <Kpi label="Riders with nearby charging" value={hubs ? pct(now, 0) : '…'} sub={hubs ? `${pct(withRecs, 0)} with the recommended hubs` : ''} />
        </div>

        <div className="grid lg:grid-cols-[1fr_380px] gap-4">
          <div className="card !p-0 overflow-hidden">
            <div className="relative h-[480px] md:h-[580px]">
              <MapBase ref={map} basemap={theme} deck={(_, k) => ({ layers: layers(k), getTooltip: tip, onClick: click, getCursor: ({ isHovering }) => (isHovering ? 'pointer' : 'crosshair') })} />
              <div className="absolute left-3 top-3 glass px-3 py-2 text-xs flex items-center gap-2"><MousePointerClick size={14} className="text-accent" />Click the map to propose a hub</div>
              <div className="absolute left-3 bottom-3 glass p-3 w-64 space-y-2">
                <Legend title="Rider charging demand (estimated)" stops={gradient(HEAT)} lo="Low" hi="High" />
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-[#9333ea]" />No charger nearby</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />Public charger</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-accent-fill" />Shared hub (3 km)</span>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4 min-w-0">
            <div className="card p-5">
              <CardTitle right={mine.length > 0 && <button className="text-xs text-accent flex items-center gap-1" onClick={() => setMine([])}><RotateCcw size={12} />Reset</button>}>Recommended shared hubs</CardTitle>
              {!hubs ? <Skeleton className="h-40" /> : !recs.length ? <p className="text-sm text-muted">Every hub area here already has a charger within 2 km.</p> : (
                <ol className="space-y-2">
                  {[...recs, ...mine].map((h, i) => (
                    <li key={i} className="rise">
                      <button className="w-full text-left rounded-xl border border-line p-3 flex items-center gap-3 hover:bg-hover" onClick={() => map.current?.fly(h.lon, h.lat, 13)}>
                        <span className={`grid place-items-center w-7 h-7 rounded-full text-xs font-semibold shrink-0 ${h.user ? 'border-2 border-accent-fill text-accent' : 'bg-accent-fill text-[#0b0b0c]'}`}>{i + 1}</span>
                        <span className="min-w-0 flex-1 text-sm">{h.user ? 'Your hub' : 'Shared hub'} · {h.areas} store area{h.areas === 1 ? '' : 's'}<span className="block text-xs text-muted">~{h.riders} riders · {h.points} charge/swap points</span></span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {mine.length > 0 && <p className="text-sm mt-3">Riders with nearby charging: <b className="tnum">{pct(withRecs, 0)}</b> → <b className="tnum text-ok">{pct(withMine, 0)}</b></p>}
            </div>
            <div className="card p-5 text-sm space-y-3">
              <CardTitle>How shared hubs pay for themselves</CardTitle>
              <div className="flex gap-3"><Building2 size={18} className="text-accent shrink-0" /><p className="text-muted"><b className="text-text">Fleet operators pay</b> a monthly fee per rider or per kWh, so riders charge for free during shifts.</p></div>
              <div className="flex gap-3"><Bike size={18} className="text-accent shrink-0" /><p className="text-muted"><b className="text-text">Several stores share one hub</b> within a short ride, instead of each store building its own.</p></div>
              <div className="flex gap-3"><IndianRupee size={18} className="text-accent shrink-0" /><p className="text-muted"><b className="text-text">Off-peak and swap pricing</b> keeps costs low. Hub owners earn from fleet contracts, not public queues.</p></div>
              <div className="flex gap-3"><ShieldCheck size={18} className="text-accent shrink-0" /><p className="text-muted"><b className="text-text">Public chargers stay free</b> for car and scooter owners.</p></div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted">Hub areas are estimated from population density and are not actual store locations. Rider counts and energy use are rough guides (~3 kWh per rider per day, 70% electric).</p>
      </Container>
    </>
  )
}
