// What-if / stress-test model on the 2 km planning cells: chargers within 3 km of each cell, before vs after edits.
import { haversineKm, SITE_RADIUS_KM, type Cell } from './model.ts'

export interface Virtual { id: string; lon: number; lat: number; points: number }
export interface NetResult { access: number; met: number; points: number; perCell: Float64Array }

const B = 0.03 // ~3 km buckets
function bucketize(cells: Cell[]) {
  const m = new Map<string, number[]>()
  cells.forEach((c, i) => { const k = `${Math.floor(c.lon / B)}|${Math.floor(c.lat / B)}`; const a = m.get(k); if (a) a.push(i); else m.set(k, [i]) })
  return m
}
/** Indices of cells within 3 km of a point. */
function around(cells: Cell[], buckets: Map<string, number[]>, lon: number, lat: number) {
  const bx = Math.floor(lon / B), by = Math.floor(lat / B), out: number[] = []
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++)
    for (const j of buckets.get(`${bx + dx}|${by + dy}`) ?? []) if (haversineKm(lat, lon, cells[j].lat, cells[j].lon) <= SITE_RADIUS_KM) out.push(j)
  return out
}

export function prepare(cells: Cell[]) {
  const buckets = bucketize(cells)
  const E = cells.map((c) => around(cells, buckets, c.lon, c.lat).reduce((s, j) => s + cells[j].evs, 0) || 1)
  return { buckets, E }
}
export type Prep = ReturnType<typeof prepare>

/**
 * access = % of residents with ≥1 charging point within 3 km; met = % of EV charging demand covered when one
 * point serves `ratio` EVs, shared by all EVs within 3 km. Removed stations take `ptsPerStation` points away.
 */
export function evaluate(cells: Cell[], prep: Prep, ratio: number, added: Virtual[] = [], removed: [number, number][] = [], ptsPerStation = 2): NetResult {
  const C = new Float64Array(cells.map((c) => c.ch3))
  for (const v of added) for (const j of around(cells, prep.buckets, v.lon, v.lat)) C[j] += v.points
  for (const [lon, lat] of removed) for (const j of around(cells, prep.buckets, lon, lat)) C[j] = Math.max(0, C[j] - ptsPerStation)
  let pop = 0, popOk = 0, ev = 0, evOk = 0, points = 0
  cells.forEach((c, j) => {
    pop += c.pop; ev += c.evs; points += c.ch3
    if (C[j] > 0.5) popOk += c.pop
    evOk += c.evs * Math.min(1, (ratio * C[j]) / prep.E[j])
  })
  points += added.reduce((s, v) => s + v.points, 0) - removed.length * ptsPerStation
  return { access: (100 * popOk) / (pop || 1), met: (100 * evOk) / (ev || 1), points: Math.max(0, points), perCell: C }
}

/** People who gain / lose charging access (by district), comparing two runs. */
export function changes(cells: Cell[], a: NetResult, b: NetResult) {
  const lost = new Map<string, number>(), gained = new Map<string, number>()
  cells.forEach((c, j) => {
    const was = a.perCell[j] > 0.5, now = b.perCell[j] > 0.5
    if (was && !now) lost.set(c.district, (lost.get(c.district) ?? 0) + c.pop)
    if (!was && now) gained.set(c.district, (gained.get(c.district) ?? 0) + c.pop)
  })
  const top = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1]).slice(0, 6)
  return { lost: top(lost), gained: top(gained) }
}
