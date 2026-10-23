import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { LocateFixed, MapPin, Search, SlidersHorizontal, Zap, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from '../lib/theme'
import { haversineKm } from '../lib/model'
import {
  getStation, kmText, loadTile, matches, nearest, NO_FILTER, stationIndex, tileIndex, tilesIn,
  type Filters, type IndexRow, type Station, type TileIndex,
} from '../lib/stations'
import type { ChargerMapHandle } from '../components/ChargerMap'
import StationPanel, { Sheet } from '../components/StationPanel'

const ChargerMap = lazy(() => import('../components/ChargerMap'))
const PIN_ZOOM = 9

type Hit = { kind: 'place'; label: string; sub: string; lon: number; lat: number; zoom: number } | { kind: 'station'; row: IndexRow }

/** Photon (OpenStreetMap) geocoder, limited to India. */
async function geocode(q: string, near?: [number, number] | null): Promise<Hit[]> {
  const u = new URL('https://photon.komoot.io/api/')
  u.searchParams.set('q', q); u.searchParams.set('limit', '5'); u.searchParams.set('bbox', '68,6,98,37')
  if (near) { u.searchParams.set('lon', String(near[0])); u.searchParams.set('lat', String(near[1])) }
  const r = await fetch(u)
  if (!r.ok) return []
  const j = await r.json() as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] }
  return j.features.filter((f) => !f.properties.countrycode || f.properties.countrycode === 'IN').map((f) => {
    const p = f.properties
    const big = ['state', 'country'].includes(p.type) ? 6 : ['city', 'county', 'district'].includes(p.type) ? 11 : 15
    return { kind: 'place' as const, label: p.name ?? p.street ?? q, sub: [p.city, p.state].filter((x) => x && x !== p.name).join(', '), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], zoom: big }
  })
}

export default function MapPage() {
  const [theme] = useTheme()
  const [params] = useSearchParams()
  const map = useRef<ChargerMapHandle>(null)
  const [idx, setIdx] = useState<TileIndex>()
  const [tiles, setTiles] = useState<Record<string, Station[]>>({})
  const [zoom, setZoom] = useState(4)
  const [me, setMe] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const [sel, setSel] = useState<Station | null>(null)
  const [near, setNear] = useState<{ r: IndexRow; d: number }[] | null>(null)
  const [f, setF] = useState<Filters>(NO_FILTER)
  const [showFilters, setShowFilters] = useState(false)
  const [q, setQ] = useState(params.get('q') ?? '')
  const [hits, setHits] = useState<Hit[]>([])
  const [focus, setFocus] = useState(false)
  const searchBox = useRef<HTMLInputElement>(null)

  useEffect(() => { tileIndex().then(setIdx, () => toast.error('Could not load charger data. Please refresh.')) }, [])

  const all = useMemo(() => Object.values(tiles).flat(), [tiles])
  const shown = useMemo(() => all.filter((s) => matches(s, f)), [all, f])
  const plugTypes = useMemo(() => [...new Set(all.flatMap((s) => s.plugs.map((p) => p.type)))].sort(), [all])

  const onView = useCallback((b: [number, number, number, number], z: number) => {
    setZoom(z)
    if (!idx || z < PIN_ZOOM - 1) return
    for (const k of tilesIn(b, idx)) loadTile(k).then((list) => setTiles((t) => (t[k] ? t : { ...t, [k]: list })), () => {})
  }, [idx])

  const locate = useCallback((fly = true) => {
    if (!navigator.geolocation) { searchBox.current?.focus(); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition((p) => {
      const pos: [number, number] = [p.coords.longitude, p.coords.latitude]
      setMe(pos); setLocating(false)
      if (fly) map.current?.fly(pos[0], pos[1], 12)
    }, () => { setLocating(false); searchBox.current?.focus() }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 })
  }, [])

  // open at ?lat&lon&z (links from other pages), a ?q search, or the visitor's city
  const started = useRef(false)
  const ready = useCallback((h: ChargerMapHandle | null) => {
    map.current = h
    if (!h || started.current) return
    started.current = true
    const lat = Number(params.get('lat')), lon = Number(params.get('lon'))
    if (lat && lon) { h.fly(lon, lat, Number(params.get('z')) || 11); locate(false) }
    else if (params.get('q')) geocode(params.get('q')!).then((r) => { const p = r[0]; if (p?.kind === 'place') h.fly(p.lon, p.lat, p.zoom); else locate() })
    else locate()
  }, [params, locate])

  // search suggestions: local stations first, then places
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setHits([]); return }
    let live = true
    const id = setTimeout(async () => {
      const rows = await stationIndex().catch(() => [] as IndexRow[])
      const low = t.toLowerCase()
      const st: Hit[] = rows.filter((r) => r[1].toLowerCase().includes(low) || r[2].toLowerCase().includes(low)).slice(0, 4).map((row) => ({ kind: 'station', row }))
      if (live) setHits(st)
      const places = await geocode(t, me).catch(() => [])
      if (live) setHits([...st, ...places])
    }, 250)
    return () => { live = false; clearTimeout(id) }
  }, [q, me])

  const openStation = async (row: IndexRow) => {
    map.current?.fly(row[3], row[4], 15)
    const s = await getStation(row[0], row[3], row[4])
    if (s) { setSel(s); setNear(null) }
  }
  const pick = (h: Hit) => {
    setFocus(false); searchBox.current?.blur()
    if (h.kind === 'station') { setQ(h.row[1]); openStation(h.row) } else { setQ(h.label); map.current?.fly(h.lon, h.lat, h.zoom) }
  }
  const nearMe = async () => {
    const origin = me ?? null
    if (!origin) { locate(); toast('Allow location to see chargers near you') }
    const list = await nearest(...(origin ?? [77.21, 28.61]))
    setSel(null); setNear(list)
  }
  const dist = sel && me ? kmText(haversineKm(me[1], me[0], sel.lat, sel.lon)) : undefined
  const active = f.kind !== 'all' || f.minKw > 0 || !!f.plug

  return (
    <div className="relative flex-1 min-h-0 mx-2 md:mx-2.5 mb-2 rounded-[20px] overflow-hidden border border-line">
      <Suspense fallback={<div className="absolute inset-0 skeleton !rounded-none" aria-busy="true" />}>
        <div className="absolute inset-0">
          <ChargerMap ref={ready} theme={theme} stations={shown} selected={sel?.id} me={me} onPick={(s) => { setSel(s); setNear(null) }} onView={onView} />
        </div>
      </Suspense>

      {/* search + filters */}
      <div className="absolute z-30 left-3 right-3 top-3 md:right-auto md:w-[380px]">
        <div className="glass !rounded-2xl flex items-center gap-1 pl-3 pr-1.5 h-12">
          <Search size={17} className="text-muted shrink-0" />
          <input ref={searchBox} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) pick(hits[0]) }}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm py-2" placeholder="Search places, addresses or stations" aria-label="Search places, addresses or stations" />
          {q && <button className="icon-btn !w-8 !h-8 !border-0" onClick={() => { setQ(''); setHits([]) }} aria-label="Clear search"><X size={15} /></button>}
          <button className={`icon-btn !w-9 !h-9 ${active ? '!text-accent !border-accent/40' : ''}`} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-label="Filters"><SlidersHorizontal size={15} /></button>
        </div>
        {focus && hits.length > 0 && (
          <ul className="glass !rounded-2xl mt-2 p-1.5 max-h-80 overflow-auto" role="listbox">
            {hits.map((h, i) => (
              <li key={i}><button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)} className="w-full text-left px-3 py-2 rounded-xl hover:bg-hover flex items-center gap-3">
                {h.kind === 'station' ? <Zap size={16} className="text-ok shrink-0" /> : <MapPin size={16} className="text-muted shrink-0" />}
                <span className="min-w-0"><span className="block text-sm truncate">{h.kind === 'station' ? h.row[1] : h.label}</span>
                  <span className="block text-xs text-muted truncate">{h.kind === 'station' ? `Charging station · ${h.row[2]}` : h.sub}</span></span>
              </button></li>
            ))}
          </ul>
        )}
        {showFilters && (
          <div className="glass !rounded-2xl mt-2 p-4 space-y-3 text-sm">
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Charger type">
              {([['all', 'All'], ['ac', 'AC'], ['dc', 'DC fast']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setF({ ...f, kind: k })} aria-pressed={f.kind === k} className={`pill ${f.kind === k ? 'pill-primary' : ''}`}>{l}</button>
              ))}
            </div>
            <label className="block"><span className="text-xs text-muted">Minimum power</span>
              <select className="input mt-1" value={f.minKw} onChange={(e) => setF({ ...f, minKw: Number(e.target.value) })}>
                {[[0, 'Any power'], [7, '7 kW and above'], [22, '22 kW and above'], [50, '50 kW and above'], [100, '100 kW and above']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-xs text-muted">Connector</span>
              <select className="input mt-1" value={f.plug} onChange={(e) => setF({ ...f, plug: e.target.value })}>
                <option value="">Any connector</option>
                {plugTypes.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <p className="text-[11px] text-muted">Power and connector filters hide stations whose details are not known.</p>
            {active && <button className="text-xs text-accent" onClick={() => setF(NO_FILTER)}>Clear filters</button>}
          </div>
        )}
      </div>

      {/* status + near me */}
      <div className="absolute z-10 left-1/2 -translate-x-1/2 bottom-4 md:bottom-5 flex items-center gap-2">
        {zoom < PIN_ZOOM
          ? <span className="glass !rounded-full px-3 py-2 text-xs text-muted whitespace-nowrap">Zoom into a city to see chargers</span>
          : <span className="glass !rounded-full px-3 py-2 text-xs whitespace-nowrap tnum"><span className="inline-block w-2 h-2 rounded-full bg-[#22c55e] mr-1.5" />{shown.length} stations loaded</span>}
        <button className="btn btn-primary !py-2 shadow-lg" onClick={nearMe}>{locating ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} />}Near me</button>
      </div>

      <AnimatePresence>
        {sel && <StationPanel key={sel.id} s={sel} distance={dist} onClose={() => setSel(null)} />}
        {near && !sel && (
          <Sheet key="near" label="Chargers near you" onClose={() => setNear(null)}>
            <h2 className="text-lg font-semibold pr-10">Nearest chargers</h2>
            <p className="text-xs text-muted">{me ? 'From your location' : 'From central Delhi (location not shared)'} · straight-line distance</p>
            <ul className="mt-3">
              {near.map(({ r, d }) => (
                <li key={r[0]}><button onClick={() => openStation(r)} className="w-full text-left py-3 border-b border-line flex items-center gap-3 hover:bg-hover rounded-lg px-2">
                  <span className="grid place-items-center w-8 h-8 rounded-full bg-ok/15 text-ok shrink-0"><Zap size={15} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{r[1]}</span><span className="block text-xs text-muted truncate">{r[5] ? 'DC fast · ' : ''}{r[2]}</span></span>
                  <span className="text-sm tnum text-muted">{kmText(d)}</span>
                </button></li>
              ))}
            </ul>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  )
}
