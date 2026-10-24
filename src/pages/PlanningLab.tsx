import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { PickingInfo } from '@deck.gl/core'
import { Bike, Bus, Car, Download, FileText, MapPin, MousePointerClick, PowerOff, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import MapBase from '../components/LazyMap'
import type { Kit } from '../components/MapBase'
import { type MapBaseHandle } from '../components/mapUtil'
import { Skeleton } from '../components/ui'
import { BigNum, Field, Meaning, ToolPage, type TourStep } from '../components/tool'
import { useData, type Cells, type Forecast, type StateRow, type Summary } from '../lib/data'
import { useTheme } from '../lib/theme'
import { compact, fmt } from '../lib/format'
import { blendedRatio, cellScore, parseCells, type Cell, type Site } from '../lib/model'
import { buildRegions } from '../lib/regions'
import { useSites } from '../lib/useSites'
import { evaluate, prepare, type NetResult, type Virtual } from '../lib/network'
import { stationIndex, type IndexRow } from '../lib/stations'
import { tooltipBox } from '../lib/tooltip'
import { downloadCsv } from '../lib/csv'

type Mode = 'add' | 'close'
type Kind = 'scooter' | 'car' | 'heavy'
// points = AC-equivalent charging points the model counts; cost in ₹ lakh (hardware + install, excl. land and grid upgrade)
const KINDS: Record<Kind, { label: string; sub: string; points: number; cost: number; icon: typeof Bike }> = {
  scooter: { label: 'Scooter / auto AC', sub: '6 × 3.3 kW sockets', points: 6, cost: 3, icon: Bike },
  car: { label: 'Car fast DC', sub: '2 × 60 kW guns', points: 6, cost: 25, icon: Car },
  heavy: { label: 'Bus / truck DC', sub: '2 × 240 kW guns', points: 8, cost: 90, icon: Bus },
}
type Placed = Virtual & { kind: Kind; name: string }
const DEFAULT = { slug: 'bihar', lon: 85.14, lat: 25.6, z: 10 } // Patna: a Tier-2 city where new chargers clearly help

/** "bihar--patna" -> "Patna" */
export const placeName = (district: string) =>
  (district.split('--')[1] ?? district).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
const suitWord = (s: number) => (s >= 70 ? 'high suitability' : s >= 40 ? 'medium suitability' : 'low suitability')

const TOUR: TourStep[] = [
  { target: 'controls', title: '1. Pick an area', text: 'Choose a state or region. The map zooms there. Red dots are places where people have no public charger within 3 km.' },
  { target: 'map', title: '2. Click the map to add a charger', text: 'Pick a charger type first, then click a red area. A 3 km circle shows who the new charger serves.' },
  { target: 'results', title: '3. See the result', text: 'The big numbers show how many more people now have a charger within 3 km, how many EVs it serves and what it costs.' },
  { target: 'mode', title: 'What if a charger closes?', text: 'Switch to this mode and click green chargers to turn them off. Areas that lose easy access turn purple.' },
  { target: 'suggest', title: 'Let us suggest sites', text: '“Auto-suggest best 5 sites” places five chargers where they help the most people. Download your plan as CSV or PDF.' },
]

export default function PlanningLab() {
  const [theme] = useTheme()
  const [params] = useSearchParams()
  const map = useRef<MapBaseHandle>(null)
  const { data: states } = useData<StateRow[]>('states.json')
  const { data: summary } = useData<Summary>('summary.json')
  const { data: forecast } = useData<Forecast>('forecast.json')
  const regions = useMemo(() => (states && summary && forecast ? buildRegions(states, summary, forecast.vehicle_mix).filter((r) => r.hasCells && r.kind !== 'corridor') : []), [states, summary, forecast])
  const [slug, setSlug] = useState(params.get('region') ?? DEFAULT.slug)
  const region = regions.find((r) => r.slug === slug)
  const { data: raw } = useData<Cells>(`cells/${slug}.json`)
  const cells = useMemo(() => (raw ? parseCells(raw.cols, raw.rows) as Cell[] : null), [raw])
  const ratio = forecast ? blendedRatio(forecast.vehicle_mix, forecast.target_ratio) : 44.3
  const res = useSites(cells, 8, 6, ratio)

  const [mode, setMode] = useState<Mode>('add')
  const [kind, setKind] = useState<Kind>('car')
  const [added, setAdded] = useState<Placed[]>([])
  const [off, setOff] = useState<Set<string>>(new Set())
  const [real, setReal] = useState<IndexRow[]>([])
  const [last, setLast] = useState<{ people: number; evs: number; name: string } | null>(null)
  const [show, setShow] = useState({ cells: true, chargers: true, recs: true })

  useEffect(() => { setAdded([]); setOff(new Set()); setLast(null) }, [slug])
  useEffect(() => {
    if (!cells?.length) return
    const xs = cells.map((c) => c.lon), ys = cells.map((c) => c.lat)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    stationIndex().then((rows) => setReal(rows.filter((r) => r[3] >= x0 && r[3] <= x1 && r[4] >= y0 && r[4] <= y1)), () => {})
    const lat = Number(params.get('lat')), lon = Number(params.get('lon'))
    if (lat && lon && slug === params.get('region')) map.current?.fly(lon, lat, 10)
    else if (slug === DEFAULT.slug) map.current?.fly(DEFAULT.lon, DEFAULT.lat, DEFAULT.z)
    else map.current?.fit([[x0, y0], [x1, y1]], 10)
  }, [cells, slug, params])

  const prep = useMemo(() => (cells ? prepare(cells) : null), [cells])
  const removed = useMemo(() => real.filter((r) => off.has(r[0])).map((r) => [r[3], r[4]] as [number, number]), [real, off])
  const run = (a: Placed[], rm: [number, number][]) => evaluate(cells!, prep!, ratio, a, rm)
  const base = useMemo(() => (cells && prep ? evaluate(cells, prep, ratio) : null), [cells, prep, ratio])
  const mod = useMemo(() => (cells && prep ? evaluate(cells, prep, ratio, added, removed) : null), [cells, prep, ratio, added, removed])
  const totals = useMemo(() => cells ? { pop: cells.reduce((s, c) => s + c.pop, 0), evs: cells.reduce((s, c) => s + c.evs, 0) } : { pop: 0, evs: 0 }, [cells])
  const covered = (r: NetResult | null) => (r && cells ? cells.reduce((s, c, j) => s + (r.perCell[j] > 0.5 ? c.pop : 0), 0) : 0)
  const served = (r: NetResult | null) => (r ? (r.met / 100) * totals.evs : 0)
  const budget = added.reduce((s, a) => s + KINDS[a.kind].cost, 0)

  const place = (lon: number, lat: number, name?: string) => {
    if (!cells || !prep) return
    const near = cells.reduce((b, c) => (Math.hypot(c.lon - lon, c.lat - lat) < Math.hypot(b.lon - lon, b.lat - lat) ? c : b), cells[0])
    const v: Placed = { id: `${Date.now()}-${Math.random()}`, lon, lat, points: KINDS[kind].points, kind, name: name ?? placeName(near.district) }
    const before = run(added, removed), after = run([...added, v], removed)
    setLast({ people: covered(after) - covered(before), evs: served(after) - served(before), name: v.name })
    setAdded((a) => [...a, v])
  }
  const suggest = () => {
    if (!res) return
    const vs: Placed[] = res.sites.slice(0, 5).map((s) => ({ id: `s${s.rank}-${Date.now()}`, lon: s.cell.lon, lat: s.cell.lat, points: KINDS[kind].points, kind, name: placeName(s.cell.district) }))
    const before = run(added, removed), after = run([...added, ...vs], removed)
    setLast({ people: covered(after) - covered(before), evs: served(after) - served(before), name: '5 suggested sites' })
    setAdded((a) => [...a, ...vs])
    map.current?.fit([[Math.min(...vs.map((v) => v.lon)) - 0.05, Math.min(...vs.map((v) => v.lat)) - 0.05], [Math.max(...vs.map((v) => v.lon)) + 0.05, Math.max(...vs.map((v) => v.lat)) + 0.05]], 11)
  }
  const reset = () => { setAdded([]); setOff(new Set()); setLast(null) }
  const csv = () => {
    if (!added.length) return toast('Add at least one charger first')
    downloadCsv(`charging-plan-${slug}.csv`, added.map((a, i) => ({ no: i + 1, area: a.name, type: KINDS[a.kind].label, equipment: KINDS[a.kind].sub, lat: a.lat.toFixed(5), lon: a.lon.toFixed(5), cost_lakh_inr: KINDS[a.kind].cost })))
  }

  const status = (j: number) => {
    const was = base!.perCell[j] > 0.5, now = mod!.perCell[j] > 0.5
    return !was && now ? 'gained' : was && !now ? 'lost' : now ? 'ok' : 'none'
  }
  const COL = { gained: [37, 99, 235], lost: [147, 51, 234], ok: [34, 197, 94], none: [239, 68, 68] } as const
  const maxPop = useMemo(() => (cells ? Math.max(...cells.map((c) => c.pop)) : 1), [cells])
  const layers = ({ ScatterplotLayer }: Kit) => [
    show.cells && cells && base && mod && new ScatterplotLayer<Cell>({
      id: 'cells', data: cells, getPosition: (c) => [c.lon, c.lat], radiusUnits: 'meters', getRadius: 900, pickable: true,
      getFillColor: (c, { index }) => { const st = status(index); return [...COL[st], st === 'ok' ? 35 : Math.round(70 + 130 * Math.sqrt(c.pop / maxPop))] as [number, number, number, number] },
      updateTriggers: { getFillColor: [mod, maxPop] }, transitions: { getFillColor: 300 },
    }),
    added.length > 0 && new ScatterplotLayer<Placed>({
      id: 'circle', data: added, getPosition: (v) => [v.lon, v.lat], radiusUnits: 'meters', getRadius: 3000, stroked: true, filled: true, lineWidthMinPixels: 2,
      getFillColor: [37, 99, 235, 28], getLineColor: [37, 99, 235, 230],
    }),
    show.chargers && new ScatterplotLayer<IndexRow>({
      id: 'real', data: real, getPosition: (r) => [r[3], r[4]], radiusUnits: 'pixels', getRadius: mode === 'close' ? 7 : 5, pickable: true, stroked: true, lineWidthMinPixels: 1.5,
      getFillColor: (r) => (off.has(r[0]) ? [120, 120, 120, 220] : [22, 163, 74, 255]), getLineColor: [255, 255, 255],
      updateTriggers: { getFillColor: off, getRadius: mode },
      onClick: (i: PickingInfo) => {
        if (mode !== 'close' || !i.object) return
        const id = (i.object as IndexRow)[0]
        setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
      },
    }),
    show.recs && res && new ScatterplotLayer<Site>({
      id: 'sites', data: res.sites, getPosition: (s) => [s.cell.lon, s.cell.lat], radiusUnits: 'pixels', getRadius: 9, pickable: true, stroked: true, lineWidthMinPixels: 2,
      getFillColor: [248, 113, 113, 235], getLineColor: [255, 255, 255, 255],
    }),
    added.length > 0 && new ScatterplotLayer<Placed>({
      id: 'added', data: added, getPosition: (v) => [v.lon, v.lat], radiusUnits: 'pixels', getRadius: 8, stroked: true, lineWidthMinPixels: 2,
      getFillColor: [37, 99, 235, 255], getLineColor: [255, 255, 255, 255],
    }),
  ].filter(Boolean)

  const click = (i: PickingInfo) => {
    if (mode !== 'add' || !i.coordinate || i.layer?.id === 'real') return
    if (i.layer?.id === 'sites') { const s = i.object as Site; return place(s.cell.lon, s.cell.lat, placeName(s.cell.district)) }
    place(i.coordinate[0], i.coordinate[1])
  }
  const tip = ({ object, layer }: PickingInfo) => {
    if (!object) return null
    if (layer?.id === 'real') { const r = object as IndexRow; return tooltipBox(`<b>${r[1]}</b><br/>${mode === 'close' ? (off.has(r[0]) ? 'Turned off · click to turn on' : 'Click to turn off') : 'Existing public charger'}`) }
    if (layer?.id === 'sites') { const s = object as Site; const sc = Math.round(cellScore(s.cell) * 100); return tooltipBox(`<b>Suggested site #${s.rank} · ${placeName(s.cell.district)}</b><br/>${sc}/100 = ${suitWord(sc)}<br/>Click to add a charger here`) }
    const c = object as Cell
    return tooltipBox(`<b>${placeName(c.district)}</b><br/>~${compact(c.pop)} people · ~${compact(c.evs)} EVs (est.)<br/>${c.ch3 ? `${c.ch3} charging points within 3 km` : '<b>No public charger within 3 km</b>'}`)
  }

  const gained = covered(mod) - covered(base)
  const evDelta = served(mod) - served(base)
  const pct = (r: NetResult | null) => (r ? `${r.access.toFixed(0)}%` : '…')

  return (
    <ToolPage
      title="Plan new charging stations"
      lead="Test your own ideas on a real map: add chargers or close existing ones and see, in plain numbers, how many people gain or lose a charger nearby. All results are estimates."
      tour={TOUR}
      intro={
        <ol className="grid sm:grid-cols-3 gap-2 text-sm">
          {[['Pick an area', 'Choose a state in the controls panel'], ['Add or remove chargers on the map', 'Click a red area to add one'], ['See how many more people get a charger nearby', 'Results appear next to the map']].map(([t, s], i) => (
            <li key={t} className="card p-3 flex items-center gap-3">
              <span className="grid place-items-center w-8 h-8 rounded-full bg-accent-fill text-[#0b0b0c] font-semibold shrink-0">{i + 1}</span>
              <span className="min-w-0"><b className="block leading-tight">{t}</b><span className="text-xs text-muted">{s}</span></span>
            </li>
          ))}
        </ol>
      }
      controls={
        <>
          <Field label="1 · Area" tip="The state or region to plan for. Each dot on the map is a 2 km square of people.">
            <select className="input" value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Choose an area">
              {regions.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
            </select>
          </Field>
          <div data-tour="mode">
            <Field label="2 · What do you want to try?">
              <div className="grid gap-1.5">
                <button className={`pill justify-start ${mode === 'add' ? 'pill-primary' : ''}`} onClick={() => setMode('add')}><MousePointerClick size={14} />Try adding new chargers</button>
                <button className={`pill justify-start ${mode === 'close' ? 'pill-primary' : ''}`} onClick={() => setMode('close')}><PowerOff size={14} />What if a charger closes?</button>
              </div>
            </Field>
            <p className="text-[11px] text-muted mt-1.5 leading-snug">{mode === 'add' ? 'Click anywhere on the map (best: a red area) to place a charger.' : 'Turn off existing chargers to see which areas would lose easy charging access. Click a green charger to toggle it off / on.'}</p>
          </div>
          {mode === 'add' && (
            <Field label="3 · Charger type" tip="Approximate cost per station: hardware and installation, without land or a new grid connection.">
              <div className="grid gap-1.5">
                {(Object.keys(KINDS) as Kind[]).map((k) => {
                  const K = KINDS[k], I = K.icon
                  return (
                    <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                      className={`text-left rounded-xl border p-2.5 flex items-center gap-2.5 transition-colors ${kind === k ? 'border-accent bg-accent/10' : 'border-line hover:bg-hover'}`}>
                      <I size={18} className={kind === k ? 'text-accent' : 'text-muted'} />
                      <span className="min-w-0 flex-1"><b className="block text-sm leading-tight">{K.label}</b><span className="text-[11px] text-muted">{K.sub}</span></span>
                      <span className="text-xs font-semibold tnum">~₹{K.cost} L</span>
                    </button>
                  )
                })}
              </div>
            </Field>
          )}
          <div data-tour="suggest" className="grid gap-1.5">
            <button className="btn btn-primary justify-center" onClick={suggest} disabled={!res}><Wand2 size={15} />Auto-suggest best 5 sites</button>
            <div className="grid grid-cols-2 gap-1.5">
              <button className="btn btn-ghost justify-center !px-2 !text-xs" onClick={csv}><Download size={14} />Plan CSV</button>
              <button className="btn btn-ghost justify-center !px-2 !text-xs" onClick={() => (added.length ? window.print() : toast('Add at least one charger first'))}><FileText size={14} />Plan PDF</button>
            </div>
            {(added.length > 0 || off.size > 0) && <button className="text-xs text-accent flex items-center gap-1 justify-center mt-1" onClick={reset}><RotateCcw size={12} />Start again</button>}
          </div>
        </>
      }
      map={
        <div className="map-card h-[460px] md:h-[620px]">
          <MapBase ref={map} basemap={theme}
            layers={[
              { label: 'Who has a charger nearby', on: show.cells, set: (v) => setShow({ ...show, cells: v }), color: '#ef4444' },
              { label: 'Existing public chargers', on: show.chargers, set: (v) => setShow({ ...show, chargers: v }), color: '#16a34a' },
              { label: 'Suggested sites', on: show.recs, set: (v) => setShow({ ...show, recs: v }), color: '#f87171' },
            ]}
            deck={(_, k) => ({ layers: layers(k), getTooltip: tip, onClick: click, getCursor: ({ isHovering }) => (isHovering ? 'pointer' : mode === 'add' ? 'crosshair' : 'grab') })} />
          <div className="absolute left-3 bottom-3 glass p-3 no-print text-[11px] space-y-1 max-w-[240px]">
            <div className="text-xs font-semibold mb-1">Charger within 3 km?</div>
            {[['#ef4444', 'No: people without easy charging'], ['#22c55e', 'Yes: already served'], ['#2563eb', 'Newly served by your chargers'], ['#9333ea', 'Lost access (charger closed)'], ['#16a34a', 'Existing charger', true], ['#f87171', 'Suggested site', true]].map(([c, l, dot]) => (
              <div key={l as string} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot ? 'ring-2 ring-white' : ''}`} style={{ background: c as string }} />{l}</div>
            ))}
          </div>
        </div>
      }
      results={
        <>
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold">{mode === 'add' ? 'Your result' : 'If these chargers close'}</h2>
            {last && mode === 'add' && (
              last.people > 0 || last.evs > 1
                ? <div className="rounded-xl bg-[#2563eb]/10 border border-[#2563eb]/30 p-3">
                    <div className="text-xs text-muted">Last added: {last.name}</div>
                    <div className="text-xl font-semibold tnum text-[#2563eb]">+{fmt(Math.max(0, last.people))} people</div>
                    <div className="text-sm">now have a charger within 3 km</div>
                    <div className="text-lg font-semibold tnum mt-1">+{fmt(Math.max(0, last.evs))} EVs served</div>
                  </div>
                : <div className="rounded-xl bg-warn/10 border border-warn/30 p-3 text-sm"><b>No change at {last.name}.</b> This area already has chargers nearby. Try a red area.</div>
            )}
            {!last && mode === 'add' && <p className="text-sm text-muted">Click a red area on the map to add your first charger.</p>}
            {mode === 'close' && <p className="text-sm text-muted">{off.size ? `${off.size} charger${off.size > 1 ? 's' : ''} turned off.` : 'Click a green charger on the map to turn it off.'}</p>}
            <div className="grid grid-cols-2 gap-2">
              <BigNum label="People gaining access" value={`${gained >= 0 ? '+' : '−'}${compact(Math.abs(gained))}`} tone={gained > 0 ? 'ok' : gained < 0 ? 'crit' : undefined}
                tip="Change in people who live within 3 km of at least one public charger, compared with today." />
              <BigNum label="EVs served" value={`${evDelta >= 0 ? '+' : '−'}${compact(Math.abs(evDelta))}`} tone={evDelta > 0 ? 'ok' : evDelta < 0 ? 'crit' : undefined}
                tip={`Extra EVs whose charging need is covered, if one charging point serves about ${fmt(ratio)} EVs.`} />
              <BigNum label="Stations added" value={String(added.length)} tip="Chargers you placed on the map." />
              <BigNum label="Budget (approx.)" value={`₹${fmt(budget)} L`} tip="Sum of approximate costs: hardware and installation, without land or a new grid connection. 1 lakh = ₹1,00,000." sub={budget >= 100 ? `≈ ₹${(budget / 100).toFixed(1)} crore` : undefined} />
            </div>
            <div className="rounded-xl border border-line overflow-hidden text-sm">
              <div className="grid grid-cols-3 bg-bg-2 text-[11px] text-muted px-3 py-1.5"><span /><span className="text-right">Today</span><span className="text-right">Your plan</span></div>
              <div className="grid grid-cols-3 px-3 py-1.5 border-t border-line"><span className="text-muted text-xs">People with a charger within 3 km</span><b className="text-right tnum">{pct(base)}</b><b className="text-right tnum">{pct(mod)}</b></div>
              <div className="grid grid-cols-3 px-3 py-1.5 border-t border-line"><span className="text-muted text-xs">EV charging need covered</span><b className="text-right tnum">{base ? `${base.met.toFixed(0)}%` : '…'}</b><b className="text-right tnum">{mod ? `${mod.met.toFixed(0)}%` : '…'}</b></div>
            </div>
            <Meaning>
              {mode === 'close' && off.size
                ? gained < 0 ? `Closing these chargers would leave about ${compact(-gained)} people with no charger within 3 km (purple on the map).` : 'Other chargers nearby still cover these areas, so nobody loses easy access.'
                : added.length
                  ? `Your ${added.length} charger${added.length > 1 ? 's' : ''} would give about ${compact(Math.max(0, gained))} more people in ${region?.name ?? 'this area'} a charger within 3 km, for roughly ₹${fmt(budget)} lakh.`
                  : `Today about ${pct(base)} of people in ${region?.name ?? 'this area'} live within 3 km of a public charger. Red areas are where a new one helps most.`}
            </Meaning>
          </div>

          <div className="card p-4">
            <h2 className="font-semibold flex items-center gap-2 mb-3"><Sparkles size={15} className="text-accent" />Recommended locations</h2>
            {!res ? <Skeleton className="h-40" /> : (
              <ol className="space-y-2 max-h-[420px] overflow-auto" data-lenis-prevent>
                {res.sites.map((s) => {
                  const sc = Math.round(cellScore(s.cell) * 100)
                  return (
                    <li key={s.rank} className="rounded-xl border border-line p-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid place-items-center w-7 h-7 rounded-full bg-accent-fill text-[#0b0b0c] text-xs font-semibold shrink-0">{s.rank}</span>
                        <span className="min-w-0 flex-1"><b className="block text-sm truncate">{placeName(s.cell.district)}</b>
                          <span className="text-xs text-muted">{sc}/100 = {suitWord(sc)}</span></span>
                      </div>
                      <p className="text-xs text-muted mt-1.5 leading-snug">{s.reasons[0]}</p>
                      <div className="mt-2 flex gap-1.5">
                        <button className="pill !h-7 !text-[11px]" onClick={() => map.current?.fly(s.cell.lon, s.cell.lat, 12.5)}><MapPin size={12} />Show on map</button>
                        <button className="pill !h-7 !text-[11px]" onClick={() => { setMode('add'); place(s.cell.lon, s.cell.lat, placeName(s.cell.district)) }}>+ Add charger here</button>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
            <p className="text-[11px] text-muted mt-2">Suitability (0–100) mixes how many people and EVs live there, how few chargers are near, and how close the power grid and highways are.</p>
          </div>
        </>
      }
      below={added.length > 0 && (
        <div className="hidden print:block">
          <h2 className="text-xl font-semibold">My charging plan · {region?.name}</h2>
          <table className="tbl mt-2"><thead><tr><th>#</th><th>Area</th><th>Type</th><th>Cost (₹ lakh)</th></tr></thead>
            <tbody>{added.map((a, i) => <tr key={a.id}><td>{i + 1}</td><td>{a.name}</td><td>{KINDS[a.kind].label}</td><td>{KINDS[a.kind].cost}</td></tr>)}</tbody></table>
          <p className="mt-2">+{fmt(gained)} people gain a charger within 3 km · +{fmt(evDelta)} EVs served · total ≈ ₹{fmt(budget)} lakh (estimate)</p>
        </div>
      )}
    />
  )
}
