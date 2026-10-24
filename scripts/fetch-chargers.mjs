// Downloads every open, legally reusable public charger list for all of India into data/raw/:
//   OpenStreetMap (Overpass, ODbL)  -> data/raw/osm/chargers_full.json   (whole country; falls back to 2x2° tiles)
//   Open Charge Map (CC BY 4.0)     -> data/raw/ocm/ocm_in.json          (needs OCM_API_KEY in .env; paged by 4° boxes)
// Private operator apps (Tata Power, Statiq, ChargeZone, Jio-bp …) are not scraped: no open licence.
// Usage: node scripts/fetch-chargers.mjs   then   node scripts/build-map-data.mjs
import fs from 'node:fs'

const UA = { 'User-Agent': 'ChargeEVSetu/1.0 (open data research)' }
const save = (f, d) => { fs.mkdirSync(f.replace(/[^/]+$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d)) }

async function overpass(q) {
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const r = await fetch(url, { method: 'POST', headers: UA, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(330000) })
      if (r.ok) return (await r.json()).elements
    } catch { /* next mirror */ }
  }
  throw new Error('Overpass failed')
}

async function osm() {
  try {
    return await overpass('[out:json][timeout:300];area["ISO3166-1"="IN"][admin_level=2]->.in;nwr["amenity"="charging_station"](area.in);out center tags;')
  } catch {
    // shortcut: bbox tiles include a little of neighbouring countries; build-map-data drops points far from any Indian district
    const tiles = JSON.parse(fs.readFileSync('pipeline/india_tiles.json', 'utf8'))
    const seen = new Map()
    for (const [s, w, n, e] of tiles) for (const el of await overpass(`[out:json][timeout:120];nwr["amenity"="charging_station"](${s},${w},${n},${e});out center tags;`)) seen.set(`${el.type}${el.id}`, el)
    return [...seen.values()]
  }
}

function ocmKey() {
  if (process.env.OCM_API_KEY) return process.env.OCM_API_KEY
  const m = /^OCM_API_KEY=(.*)$/m.exec(fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '')
  return m?.[1].trim().replace(/^"|"$/g, '') || null
}

async function ocm(key) {
  const out = new Map()
  for (let lat = 6; lat < 37; lat += 4) for (let lon = 68; lon < 98; lon += 4) {
    const u = new URL('https://api.openchargemap.io/v3/poi')
    Object.entries({ countrycode: 'IN', maxresults: 5000, compact: 'true', verbose: 'false', boundingbox: `(${lat},${lon}),(${lat + 4},${lon + 4})` }).forEach(([k, v]) => u.searchParams.set(k, v))
    const r = await fetch(u, { headers: { ...UA, 'X-API-Key': key } })
    if (!r.ok) throw new Error(`OCM HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`)
    for (const p of await r.json()) out.set(p.ID, p)
  }
  return [...out.values()]
}

const els = await osm()
save('data/raw/osm/chargers_full.json', { elements: els })
console.log(`OSM: ${els.length} charging stations`)
const key = ocmKey()
if (key) { const p = await ocm(key); save('data/raw/ocm/ocm_in.json', p); console.log(`OCM: ${p.length} POIs`) }
else console.log('OCM: OCM_API_KEY is empty in .env -> skipped (get a free key at openchargemap.org/site/develop/api)')
