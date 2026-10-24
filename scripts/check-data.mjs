// Data gate run before every build: if a data file is broken, `npm run build` fails and bad data never goes live.
// Checks: every JSON parses and is non-empty; coordinates inside India; no duplicate IDs; Gap Scores 0-100;
// tile/index counts match; the CSP hash still matches the inline theme script.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const D = 'public/data'
const errors = []
const fail = (m) => errors.push(m)
const read = (f) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'))
const inIndia = (lon, lat) => Number.isFinite(lon) && Number.isFinite(lat) && lon >= 68 && lon <= 98 && lat >= 6 && lat <= 37.5

// 1. every JSON file parses and is not empty
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
let files = 0
for (const f of walk(D).filter((f) => f.endsWith('.json'))) {
  files++
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'))
    if (j == null || (Array.isArray(j) && !j.length) || (typeof j === 'object' && !Object.keys(j).length)) fail(`${f}: empty`)
  } catch (e) { fail(`${f}: invalid JSON (${e.message})`) }
}

// 2. charger tiles: coordinates, unique ids, counts match the index
const idx = read('tiles/index.json')
const ids = new Set()
let total = 0
for (const key of idx.tiles) {
  const list = read(`tiles/${idx.z}/${key}.json`)
  total += list.length
  for (const s of list) {
    if (!inIndia(s.lon, s.lat)) fail(`tile ${key}: station ${s.id} outside India (${s.lon}, ${s.lat})`)
    if (ids.has(s.id)) fail(`duplicate station id ${s.id}`)
    ids.add(s.id)
    if (!s.name || !Array.isArray(s.src) || !s.src.length) fail(`station ${s.id}: missing name or source`)
  }
}
if (total !== idx.count) fail(`tiles hold ${total} stations but index says ${idx.count}`)
if (idx.count < 500) fail(`only ${idx.count} stations: the charger data looks truncated`)
const rows = read('stations-index.json')
if (rows.length !== idx.count) fail(`stations-index has ${rows.length} rows, tiles have ${idx.count}`)
if (rows.some((r) => !ids.has(r[0]))) fail('stations-index refers to ids missing from the tiles')
const stateSum = Object.values(idx.states ?? {}).reduce((s, r) => s + r.mapped, 0)
if (idx.states && stateSum !== idx.count) fail(`per-state mapped counts add to ${stateSum}, not ${idx.count}`)

// 3. districts and states
const districts = read('districts.json')
const dIds = new Set()
for (const d of districts) {
  if (dIds.has(d.id)) fail(`duplicate district id ${d.id}`)
  dIds.add(d.id)
  if (!(d.gap_score >= 0 && d.gap_score <= 100)) fail(`district ${d.id}: gap score ${d.gap_score} outside 0-100`)
  if (!inIndia(d.lon, d.lat)) fail(`district ${d.id}: centre outside India`)
  if (d.evs < 0 || d.chargers < 0 || d.pop < 0) fail(`district ${d.id}: negative count`)
}
const states = read('states.json')
if (states.length !== 36) fail(`states.json has ${states.length} states/UTs, expected 36`)
for (const s of states) {
  if (!(s.gap_score >= 0 && s.gap_score <= 100)) fail(`state ${s.state}: gap score out of range`)
  if (!(s.official_chargers_2025 >= 0)) fail(`state ${s.state}: bad official count`)
}
for (const h of read('hubs.json')) if (!inIndia(h.lon, h.lat)) fail(`hub area outside India (${h.lon}, ${h.lat})`)
const fc = read('forecast.json')
for (const k of ['low', 'base', 'high']) if (!fc.scenarios?.[k]?.['2030']) fail(`forecast: missing ${k} 2030`)

// 4. CSP must allow the inline theme script (else the site breaks silently after an index.html edit)
const sha = (f) => [...fs.readFileSync(f, 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`)
const csp = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).headers.find((h) => h.source === '/(.*)')?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
for (const f of ['index.html', 'admin/index.html']) for (const h of sha(f)) if (!csp.includes(h)) fail(`${f}: inline script hash ${h} missing from the CSP in vercel.json`)
if (!fs.readFileSync('netlify.toml', 'utf8').includes(csp)) fail('netlify.toml CSP differs from vercel.json')

if (errors.length) {
  console.error(`DATA CHECK FAILED (${errors.length}):\n- ${errors.slice(0, 30).join('\n- ')}`)
  process.exit(1)
}
console.log(`data check ok: ${files} files, ${idx.count} stations in ${idx.tiles.length} tiles, ${districts.length} districts, ${states.length} states`)
