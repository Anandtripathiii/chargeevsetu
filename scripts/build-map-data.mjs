// Builds the public map data from the raw OpenStreetMap export:
//   public/data/tiles/7/{x}/{y}.json  real stations, cut into z7 web-mercator tiles (the map loads only visible tiles)
//   public/data/stations-index.json   compact list for search / "near me"
//   public/data/hubs.json             estimated delivery hub areas (dense urban cells)
// Usage: node scripts/build-map-data.mjs [path/to/overpass.json]   (default data/raw/osm/chargers_full.json)
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'

const SRC = process.argv[2] || 'data/raw/osm/chargers_full.json'
const OUT = 'public/data'
const Z = 7

const km = (a, b) => {
  const p = Math.PI / 180
  const h = 0.5 - Math.cos((b[1] - a[1]) * p) / 2 + Math.cos(a[1] * p) * Math.cos(b[1] * p) * (1 - Math.cos((b[0] - a[0]) * p)) / 2
  return 12742 * Math.asin(Math.sqrt(h))
}
export const tileOf = (lon, lat, z = Z) => {
  const n = 2 ** z, r = (lat * Math.PI) / 180
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)]
}
const kw = (s) => { const m = /([\d.]+)\s*(k?w)?/i.exec(s || ''); if (!m) return null; const v = Number(m[1]); return /^w$/i.test(m[2] || '') || v > 1000 ? v / 1000 : v }

const PLUGS = { type2_combo: 'CCS2', ccs: 'CCS2', gb_dc: 'GB/T', multi: 'Multiple', chademo: 'CHAdeMO', type2: 'Type 2', type1: 'Type 1', type1_combo: 'CCS1', gb_t: 'GB/T', type7: 'Bharat AC/DC', bharat_ac001: 'Bharat AC-001', bharat_dc001: 'Bharat DC-001', type3c: 'Type 3', schuko: '15A socket', tesla_supercharger: 'Tesla' }
const DC_PLUGS = new Set(['CCS2', 'CHAdeMO', 'CCS1', 'GB/T', 'Bharat DC-001', 'Tesla'])

function station(e) {
  const t = e.tags || {}
  const lon = e.lon ?? e.center?.lon, lat = e.lat ?? e.center?.lat
  if (lon == null) return null
  const plugs = []
  for (const [k, v] of Object.entries(t)) {
    const m = /^socket:([a-z0-9_]+)$/.exec(k)
    if (!m || v === 'no' || v === '0') continue
    plugs.push({ type: PLUGS[m[1]] || m[1], count: Number(v) || null, kw: kw(t[`${k}:output`]) })
  }
  const maxKw = Math.max(0, ...plugs.map((p) => p.kw || 0), kw(t['charging_station:output']) || 0) || null
  const dc = plugs.some((p) => DC_PLUGS.has(p.type)) || (maxKw ?? 0) >= 25
  const addr = [t['addr:housenumber'], t['addr:street'], t['addr:place'], t['addr:city'] || t['addr:district'], t['addr:postcode']].filter(Boolean).join(', ')
  const vehicles = ['motorcar', 'scooter', 'motorcycle', 'bus', 'truck'].filter((v) => t[v] === 'yes')
  return {
    id: `${e.type[0]}${e.id}`, lon: +lon.toFixed(5), lat: +lat.toFixed(5),
    name: t['name:en'] || t.name || t.brand || t.operator || 'EV charging station',
    operator: t.operator || t.brand || t.network || null,
    dc, kw: maxKw, plugs, points: Number(t.capacity) || plugs.reduce((s, p) => s + (p.count || 0), 0) || null,
    swap: t['charging_station:battery_swapping'] === 'yes' || undefined,
    price: t.charge || (t.fee === 'no' ? 'Free' : null), hours: t.opening_hours || null, address: addr || null,
    access: t.access || null, vehicles: vehicles.length ? vehicles : undefined, src: ['OpenStreetMap'],
  }
}

const richness = (s) => Object.values(s).filter((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length)).length

/** Merge duplicates: within 60 m and same name (or one is unnamed); keeps the record with more details. */
export function dedupe(list) {
  const out = []
  for (const s of list.sort((a, b) => richness(b) - richness(a))) {
    const dup = out.find((o) => km([o.lon, o.lat], [s.lon, s.lat]) < 0.06 &&
      (o.name === s.name || o.name === 'EV charging station' || s.name === 'EV charging station'))
    if (!dup) { out.push(s); continue }
    for (const [k, v] of Object.entries(s)) if (dup[k] == null && v != null) dup[k] = v
    dup.src = [...new Set([...dup.src, ...s.src])]
  }
  return out
}

// self-check: two nearby copies merge, a distant one stays
assert.equal(dedupe([
  { id: 'a', lon: 77, lat: 28, name: 'X', src: ['OpenStreetMap'] },
  { id: 'b', lon: 77.0002, lat: 28.0002, name: 'X', price: '₹18/kWh', src: ['OpenStreetMap'] },
  { id: 'c', lon: 77.1, lat: 28, name: 'X', src: ['OpenStreetMap'] },
]).length, 2)
assert.deepEqual(tileOf(77.2, 28.6), [91, 53])

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8')).elements
const districts = JSON.parse(fs.readFileSync(`${OUT}/districts.json`, 'utf8'))
const near = (lon, lat) => districts.reduce((b, d) => { const x = km([lon, lat], [d.lon, d.lat]); return x < b[0] ? [x, d] : b }, [Infinity, null])[1]

const stations = dedupe(raw.map(station).filter(Boolean))
for (const s of stations) { const d = near(s.lon, s.lat); s.area = `${d.name}, ${d.state}` }

fs.rmSync(`${OUT}/tiles`, { recursive: true, force: true })
const tiles = new Map()
for (const s of stations) {
  const k = tileOf(s.lon, s.lat).join('/')
  if (!tiles.has(k)) tiles.set(k, [])
  tiles.get(k).push(s)
}
for (const [k, list] of tiles) {
  const f = `${OUT}/tiles/${Z}/${k}.json`
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, JSON.stringify(list))
}
fs.writeFileSync(`${OUT}/tiles/index.json`, JSON.stringify({ z: Z, tiles: [...tiles.keys()], count: stations.length, built: new Date().toISOString().slice(0, 10) }))
fs.writeFileSync(`${OUT}/stations-index.json`, JSON.stringify(stations.map((s) => [s.id, s.name, s.area, s.lon, s.lat, s.dc ? 1 : 0])))

// Estimated delivery hub areas: the densest 2 km cells of big cities.
// shortcut: assumes ~1 quick-commerce store per 40k residents; swap in real store points when an open list exists.
const CITY_REGIONS = { 'delhi-ncr': 'Delhi NCR', maharashtra: 'Mumbai / Pune', karnataka: 'Bengaluru', telangana: 'Hyderabad', 'tamil-nadu': 'Chennai', 'west-bengal': 'Kolkata', gujarat: 'Ahmedabad / Surat', rajasthan: 'Jaipur', 'uttar-pradesh': 'Lucknow / Kanpur', kerala: 'Kochi / Thiruvananthapuram' }
const hubs = []
for (const [slug, city] of Object.entries(CITY_REGIONS)) {
  const j = JSON.parse(fs.readFileSync(`${OUT}/cells/${slug}.json`, 'utf8'))
  const ix = Object.fromEntries(j.cols.map((c, i) => [c, i]))
  j.rows.filter((r) => r[ix.pop] >= 60000).sort((a, b) => b[ix.pop] - a[ix.pop]).slice(0, 40).forEach((r) => {
    const lon = r[ix.lon], lat = r[ix.lat], pop = r[ix.pop]
    if (hubs.some((h) => km([h.lon, h.lat], [lon, lat]) < 1.5)) return
    const stores = Math.max(1, Math.round(pop / 40000))
    const nearby = stations.filter((s) => km([s.lon, s.lat], [lon, lat]) <= 2).length
    hubs.push({ lon, lat, city, pop, stores, riders: stores * 25, kwh: Math.round(stores * 25 * 0.7 * 3), chargers2km: nearby })
  })
}
fs.writeFileSync(`${OUT}/hubs.json`, JSON.stringify(hubs))
console.log(`${raw.length} raw -> ${stations.length} stations in ${tiles.size} tiles; ${hubs.length} hub areas`)
