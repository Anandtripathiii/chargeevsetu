import { useEffect, useMemo, useRef, useState } from 'react'
import type { PickingInfo } from '@deck.gl/core'
import { ArrowRight, Bike, Building2, ChevronLeft, ChevronRight, Hand, PlugZap, RotateCcw, ShieldCheck } from 'lucide-react'
import MapBase from '../components/LazyMap'
import type { Kit } from '../components/MapBase'
import { bboxOf, type MapBaseHandle } from '../components/mapUtil'
import { BigNum, Field, Meaning, ToolPage, type TourStep } from '../components/tool'
import { useData } from '../lib/data'
import { useTheme } from '../lib/theme'
import { compact, fmt } from '../lib/format'
import { haversineKm } from '../lib/model'
import { kmText, stationIndex, type IndexRow } from '../lib/stations'
import { tooltipBox } from '../lib/tooltip'

interface HubArea { lon: number; lat: number; city: string; pop: number; stores: number; riders: number; kwh: number; chargers2km: number }
interface Shared { lon: number; lat: number; areas: number; riders: number; points: number }
const R = 3 // km a rider will ride to a shared hub
const SESSIONS_PER_RIDER = 2 // top-up charges per rider per day
const SESSIONS_PER_CHARGER = 12 // what one public charger can handle per day

/** Greedy: put each hub where it reaches the most riders who have no charger within 2 km. */
function recommend(areas: HubArea[], n = 3): Shared[] {
  const left = new Set(areas.map((_, i) => i).filter((i) => areas[i].chargers2km === 0))
  if (!left.size) areas.forEach((_, i) => left.add(i)) // every area has a charger nearby: still show a shared hub
  const out: Shared[] = []
  for (let k = 0; k < n && left.size; k++) {
    let best: number[] = [], bestRiders = 0
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

const STEPS = [
  ['These are delivery dark-store areas', 'Quick-commerce and food apps run small “dark stores” in busy neighbourhoods. Each circle is an estimated area with several stores.'],
  ['Riders charge many times a day', 'About 25 riders work from each store and ride 100+ km a day on electric scooters, so they need 2–3 top-ups daily. Hotter colour = more charging demand.'],
  ['Public chargers nearby are few or far', 'Green dots are real public chargers. Each line shows how far riders from a store must go to the nearest one.'],
  ['Our idea: one shared hub for several stores', 'Instead of every store building its own charger, one shared hub serves all stores within 3 km. Lines connect the stores to the hub.'],
  ['Result', 'Riders ride less to charge, more riders are covered, and public chargers are freed up for everyone else.'],
] as const

const TOUR: TourStep[] = [
  { target: 'controls', title: 'Walk through the idea', text: 'Use Next to go step by step. The map animates each part of the story.' },
  { target: 'map', title: 'Watch the map', text: 'Circles are delivery store areas, the heat shows rider charging demand, green dots are public chargers and the big ring is the shared hub.' },
  { target: 'results', title: 'See the numbers', text: 'The result step compares before and after. Turn on “Try it yourself” and drag the hub to see the numbers change.' },
]

/** 0→1 over ~0.9 s whenever `key` changes (respects reduced motion). */
function useGrow(key: unknown) {
  const [t, setT] = useState(1)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setT(1); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => { const p = Math.min(1, (now - t0) / 900); setT(1 - (1 - p) ** 3); if (p < 1) raf = requestAnimationFrame(tick) }
    setT(0); raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [key])
  return t
}

export default function Delivery() {
  const [theme] = useTheme()
  const map = useRef<MapBaseHandle>(null)
  const { data: hubs } = useData<HubArea[]>('hubs.json')
  const cities = useMemo(() => [...new Set((hubs ?? []).map((h) => h.city))], [hubs])
  const [city, setCity] = useState('Delhi NCR')
  const areas = useMemo(() => (hubs ?? []).filter((h) => h.city === city), [hubs, city])
  const [all, setAll] = useState<IndexRow[]>([])
  const [step, setStep] = useState(0)
  const [tryIt, setTryIt] = useState(false)
  const [moved, setMoved] = useState<Shared[] | null>(null)
  const t = useGrow(`${step}-${city}`)
  useEffect(() => { stationIndex().then(setAll, () => {}) }, [])
  useEffect(() => {
    setMoved(null)
    if (areas.length) map.current?.fit(bboxOf({ type: 'MultiPoint', coordinates: areas.map((a) => [a.lon, a.lat]) }), 12)
  }, [areas])

  const box = useMemo(() => areas.length ? bboxOf({ type: 'MultiPoint', coordinates: areas.map((a) => [a.lon, a.lat]) }) : null, [areas])
  const real = useMemo(() => (box ? all.filter((r) => r[3] > box[0][0] - 0.3 && r[3] < box[1][0] + 0.3 && r[4] > box[0][1] - 0.3 && r[4] < box[1][1] + 0.3) : []), [all, box])
  const recs = useMemo(() => recommend(areas), [areas])
  const hubsNow = moved ?? recs
  const nearestCharger = useMemo(() => areas.map((a) => real.reduce((b, r) => { const d = haversineKm(a.lat, a.lon, r[4], r[3]); return d < b.d ? { d, r } : b }, { d: Infinity, r: null as IndexRow | null })), [areas, real])

  const stats = useMemo(() => {
    const riders = areas.reduce((s, a) => s + a.riders, 0) || 1
    let before = 0, after = 0, coveredBefore = 0, coveredAfter = 0, toHub = 0
    areas.forEach((a, i) => {
      const dc = Math.min(nearestCharger[i].d, 25)
      const dh = Math.min(...hubsNow.map((h) => haversineKm(a.lat, a.lon, h.lat, h.lon)), Infinity)
      before += dc * a.riders; after += Math.min(dc, dh) * a.riders
      if (dc <= 2) coveredBefore += a.riders
      if (dc <= 2 || dh <= R) coveredAfter += a.riders
      if (dh <= R) toHub += a.riders
    })
    return { riders, avgBefore: before / riders, avgAfter: after / riders, coveredBefore, coveredAfter, toHub, freed: Math.round((toHub * SESSIONS_PER_RIDER) / SESSIONS_PER_CHARGER) }
  }, [areas, nearestCharger, hubsNow])

  const lerp = (a: [number, number], b: [number, number], k: number): [number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
  const layers = ({ ScatterplotLayer, HeatmapLayer, PathLayer }: Kit) => {
    const grow = (n: number) => (step === n ? t : 1) // only the newest step animates
    const L = []
    if (step >= 1) L.push(new HeatmapLayer<HubArea>({ id: 'heat', data: areas, getPosition: (a) => [a.lon, a.lat], getWeight: (a) => a.kwh * grow(1), radiusPixels: 60, intensity: 1.2, threshold: 0.05, updateTriggers: { getWeight: [t, step] } }))
    L.push(new ScatterplotLayer<HubArea>({
      id: 'areas', data: areas, getPosition: (a) => [a.lon, a.lat], radiusUnits: 'meters', getRadius: 700 * grow(0), pickable: true, stroked: true, lineWidthMinPixels: 2,
      getFillColor: [249, 115, 22, step >= 1 ? 90 : 170], getLineColor: [194, 65, 12, 255], updateTriggers: { getRadius: [t, step], getFillColor: step },
    }))
    if (step >= 2) {
      L.push(new PathLayer({
        id: 'to-charger', data: areas.map((a, i) => ({ a, r: nearestCharger[i].r, d: nearestCharger[i].d })).filter((x) => x.r && x.d < 25),
        getPath: (x: { a: HubArea; r: IndexRow }) => [[x.a.lon, x.a.lat], lerp([x.a.lon, x.a.lat], [x.r[3], x.r[4]], grow(2))],
        getColor: [100, 116, 139, 200], getWidth: 2, widthUnits: 'pixels', updateTriggers: { getPath: [t, step] },
      }))
      L.push(new ScatterplotLayer<IndexRow>({
        id: 'real', data: real, getPosition: (r) => [r[3], r[4]], radiusUnits: 'pixels', getRadius: 5 * grow(2), stroked: true, lineWidthMinPixels: 1.5, pickable: true,
        getFillColor: [22, 163, 74, 255], getLineColor: [255, 255, 255], updateTriggers: { getRadius: [t, step] },
      }))
    }
    if (step >= 3) {
      const links = areas.flatMap((a) => hubsNow.filter((h) => haversineKm(a.lat, a.lon, h.lat, h.lon) <= R).map((h) => ({ a, h })))
      L.push(new PathLayer({
        id: 'links', data: links, getPath: (x: { a: HubArea; h: Shared }) => [[x.a.lon, x.a.lat], lerp([x.a.lon, x.a.lat], [x.h.lon, x.h.lat], grow(3))],
        getColor: [37, 99, 235, 230], getWidth: 3, widthUnits: 'pixels', updateTriggers: { getPath: [t, step, hubsNow] },
      }))
      L.push(new ScatterplotLayer<Shared>({
        id: 'hub', data: hubsNow, getPosition: (h) => [h.lon, h.lat], radiusUnits: 'meters', getRadius: R * 1000 * grow(3), stroked: true, lineWidthMinPixels: 2, pickable: true,
        getFillColor: [37, 99, 235, 30], getLineColor: [37, 99, 235, 255], updateTriggers: { getRadius: [t, step] },
      }))
      L.push(new ScatterplotLayer<Shared>({
        id: 'hub-dot', data: hubsNow, getPosition: (h) => [h.lon, h.lat], radiusUnits: 'pixels', getRadius: 10 * grow(3), stroked: true, lineWidthMinPixels: 3,
        getFillColor: [37, 99, 235, 255], getLineColor: [255, 255, 255, 255], updateTriggers: { getRadius: [t, step] },
      }))
    }
    return L
  }
  const tip = ({ object, layer }: PickingInfo) => {
    if (!object) return null
    if (layer?.id === 'areas') { const a = object as HubArea; return tooltipBox(`<b>Estimated dark-store area</b><br/>~${a.stores} stores · ~${a.riders} riders<br/>~${fmt(a.kwh)} kWh/day of rider charging`) }
    if (layer?.id === 'real') return tooltipBox(`<b>${(object as IndexRow)[1]}</b><br/>Public charger`)
    const h = object as Shared
    return tooltipBox(`<b>Shared hub</b><br/>Serves stores within 3 km<br/>~${h.points} charge / swap points`)
  }
  const click = (i: PickingInfo) => {
    if (!tryIt || !i.coordinate || !hubsNow.length) return
    const [lon, lat] = i.coordinate
    setMoved([{ ...hubsNow[0], lon, lat }, ...hubsNow.slice(1)])
  }
  const go = (n: number) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)))

  return (
    <ToolPage
      title="Charging hubs for delivery riders"
      lead="Delivery riders charge their scooters many times a day and crowd public chargers. Click through the five steps to see our idea: one shared hub for several delivery stores."
      tour={TOUR}
      controls={
        <>
          <Field label="City" tip="Store areas are estimated from population density; they are not real store addresses.">
            <select className="input" value={city} onChange={(e) => { setCity(e.target.value); setStep(0) }} aria-label="Choose a city">
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="The idea, step by step">
            <ol className="space-y-1">
              {STEPS.map(([title], i) => (
                <li key={title}>
                  <button onClick={() => go(i)} aria-current={step === i ? 'step' : undefined}
                    className={`w-full text-left flex items-start gap-2.5 rounded-xl p-2 text-sm transition-colors ${step === i ? 'bg-accent/10 border border-accent/40' : 'hover:bg-hover border border-transparent'}`}>
                    <span className={`grid place-items-center w-6 h-6 rounded-full text-xs font-semibold shrink-0 ${i <= step ? 'bg-accent-fill text-[#0b0b0c]' : 'bg-active text-muted'}`}>{i + 1}</span>
                    <span className="leading-snug">{title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </Field>
          <label className="flex items-start gap-2 text-sm cursor-pointer rounded-xl border border-line p-2.5">
            <input type="checkbox" className="mt-0.5" checked={tryIt} onChange={(e) => { setTryIt(e.target.checked); if (e.target.checked) setStep(4) }} />
            <span><b className="flex items-center gap-1.5"><Hand size={14} />Try it yourself</b><span className="text-xs text-muted">Drag the blue hub (or click the map) to move it. Numbers update.</span></span>
          </label>
          {moved && <button className="text-xs text-accent flex items-center gap-1" onClick={() => setMoved(null)}><RotateCcw size={12} />Back to our suggested spot</button>}
        </>
      }
      map={
        <div className="map-card h-[460px] md:h-[600px]">
          <MapBase ref={map} basemap={theme} deck={(_, k) => ({ layers: layers(k), getTooltip: tip, onClick: click, getCursor: ({ isHovering }) => (isHovering ? 'pointer' : tryIt ? 'crosshair' : 'grab') })}>
            {({ Marker }) => tryIt && step >= 3 && hubsNow.map((h, i) => (
              <Marker key={i} longitude={h.lon} latitude={h.lat} draggable
                onDragEnd={(e) => setMoved(hubsNow.map((x, j) => (j === i ? { ...x, lon: e.lngLat.lng, lat: e.lngLat.lat } : x)))}>
                <div className="w-8 h-8 rounded-full bg-[#2563eb] ring-4 ring-white shadow-lg grid place-items-center text-white cursor-grab" title="Drag me"><PlugZap size={15} /></div>
              </Marker>
            ))}
          </MapBase>
          <div className="absolute left-3 right-3 md:right-auto top-3 md:max-w-[340px] glass p-3 no-print">
            <div className="text-[11px] uppercase tracking-[0.12em] text-muted">Step {step + 1} of {STEPS.length}</div>
            <div className="font-semibold leading-snug">{STEPS[step][0]}</div>
            <div className="mt-2 flex gap-1.5">
              <button className="pill !h-8" onClick={() => go(step - 1)} disabled={step === 0}><ChevronLeft size={14} />Back</button>
              <button className="pill pill-primary !h-8" onClick={() => go(step + 1)} disabled={step === STEPS.length - 1}>Next<ChevronRight size={14} /></button>
            </div>
          </div>
          <div className="absolute left-3 bottom-3 glass p-3 no-print text-[11px] space-y-1">
            {[['#f97316', 'Dark-store area (estimated)', 0], ['#ef4444', 'Rider charging demand', 1], ['#16a34a', 'Public charger', 2], ['#2563eb', 'Shared hub (3 km reach)', 3]].filter(([, , s]) => (s as number) <= step).map(([c, l]) => (
              <div key={l as string} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c as string }} />{l}</div>
            ))}
          </div>
        </div>
      }
      results={
        <>
          <div className="card p-4">
            <h2 className="font-semibold">{STEPS[step][0]}</h2>
            <p className="text-sm text-muted mt-1 leading-relaxed">{STEPS[step][1]}</p>
          </div>
          {step < 4 ? (
            <div className="grid grid-cols-2 gap-2">
              <BigNum label="Store areas" value={hubs ? fmt(areas.length) : '…'} tip="Busy neighbourhoods likely to host delivery dark stores (estimated from population density)." />
              <BigNum label="Riders" value={hubs ? compact(stats.riders) : '…'} tip="About 25 riders per store, estimated." />
              {step >= 2 && <BigNum label="Avg ride to a charger" value={kmText(stats.avgBefore)} tone="warn" tip="Average straight-line distance from a store to its nearest real public charger, weighted by riders." />}
              {step >= 3 && <BigNum label="Riders the hub reaches" value={compact(stats.toHub)} tone="ok" tip="Riders whose store is within 3 km of a shared hub." />}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-line overflow-hidden text-sm">
                <div className="grid grid-cols-3 bg-bg-2 text-[11px] text-muted px-3 py-1.5"><span /><span className="text-right">Before</span><span className="text-right">With hub</span></div>
                <div className="grid grid-cols-3 px-3 py-2 border-t border-line items-center"><span className="text-xs text-muted">Avg distance to charge</span><b className="text-right tnum">{kmText(stats.avgBefore)}</b><b className="text-right tnum text-ok">{kmText(stats.avgAfter)}</b></div>
                <div className="grid grid-cols-3 px-3 py-2 border-t border-line items-center"><span className="text-xs text-muted">Riders with charging close by</span><b className="text-right tnum">{compact(stats.coveredBefore)}</b><b className="text-right tnum text-ok">{compact(stats.coveredAfter)}</b></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <BigNum label="Riders served by hub" value={compact(stats.toHub)} tone="ok" tip="Riders whose store is within 3 km of the shared hub(s)." />
                <BigNum label="Public chargers freed" value={`~${fmt(stats.freed)}`} tone="ok" tip={`Riders who switch to the hub stop using public chargers: ${SESSIONS_PER_RIDER} charges per rider per day, one public charger handles ~${SESSIONS_PER_CHARGER} a day.`} />
              </div>
              <Meaning>With {hubsNow.length} shared hub{hubsNow.length > 1 ? 's' : ''}, riders in {city} ride {kmText(Math.max(0, stats.avgBefore - stats.avgAfter))} less on average to charge, and about {fmt(stats.freed)} public chargers stay free for car and scooter owners.</Meaning>
            </>
          )}
        </>
      }
      below={
        <div className="card p-5">
          <h2 className="font-semibold mb-4">How a shared hub pays for itself</h2>
          <div className="grid md:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 text-sm">
            {[[Building2, 'Fleet operators pay', 'Delivery companies pay a monthly fee per rider or per kWh.'], [Bike, 'Riders charge at the hub', 'Several stores share one hub within a short ride. Riders charge free during shifts.'], [ShieldCheck, 'Public chargers stay free', 'Car and scooter owners find public chargers available.']].map(([I, t1, d], i) => {
              const Icon = I as typeof Bike
              return [
                <div key={t1 as string} className="rounded-xl border border-line bg-bg-2 p-4 text-center">
                  <div className="mx-auto grid place-items-center w-11 h-11 rounded-full bg-accent/15 text-accent"><Icon size={20} /></div>
                  <b className="block mt-2">{t1 as string}</b><span className="text-xs text-muted">{d as string}</span>
                </div>,
                i < 2 && <ArrowRight key={`a${i}`} size={22} className="text-accent mx-auto rotate-90 md:rotate-0" />,
              ]
            })}
          </div>
          <p className="text-xs text-muted mt-4">Store areas are estimated from population density, not real store addresses. Rider numbers and energy are rough guides (~25 riders per store, ~3 kWh per rider per day).</p>
        </div>
      }
    />
  )
}
