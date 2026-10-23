/**
 * Browser mirror of pipeline/analysis.py, so sliders recompute live.
 * Keep formulas identical; scripts/selfcheck.mjs compares against public/data/selfcheck.json.
 */
import type { Mix } from './data'

export type GapKey = 'ev_density' | 'evs_per_charger' | 'dist_km' | 'urban_pop' | 'corridor'
export const GAP_KEYS: GapKey[] = ['ev_density', 'evs_per_charger', 'dist_km', 'urban_pop', 'corridor']
export const GAP_TRANSFORM: Record<GapKey, 'log' | 'lin'> = {
  ev_density: 'log', evs_per_charger: 'log', dist_km: 'lin', urban_pop: 'log', corridor: 'lin',
}
export const DEFAULT_WEIGHTS: Record<GapKey, number> = {
  ev_density: 0.2, evs_per_charger: 0.3, dist_km: 0.25, urban_pop: 0.1, corridor: 0.15,
}
export const GAP_LABELS: Record<GapKey, [string, string]> = {
  ev_density: ['EV density', 'EVs per km². More EVs in a small area means more charging demand.'],
  evs_per_charger: ['Charger stress', 'EVs per public charger. Higher means existing chargers are overloaded.'],
  dist_km: ['Distance to charger', 'Average distance from residents to the nearest charger (population-weighted).'],
  urban_pop: ['Urban population', 'People living in towns and cities, where most public charging happens.'],
  corridor: ['Corridor importance', 'National-highway density (50%), tourism (30%) and logistics/fuel sites (20%).'],
}

const tf = (v: number, t: 'log' | 'lin') => (t === 'log' ? Math.log1p(Math.max(v, 0)) : v)

/** Min-max normalise each factor across all rows, raw = Σ wᵢ·normᵢ / Σ wᵢ, then rescale raw to 0-100
 *  (0 = best-served district, 100 = most underserved). Dividing by Σ wᵢ is skipped: the rescale cancels it. */
export function gapScores(rows: Record<GapKey, number>[], weights: Record<GapKey, number> = DEFAULT_WEIGHTS): number[] {
  const out = new Array(rows.length).fill(0)
  for (const k of GAP_KEYS) {
    const v = rows.map((r) => tf(r[k], GAP_TRANSFORM[k]))
    let lo = Infinity, hi = -Infinity
    for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x }
    const span = hi - lo
    if (span < 1e-12) continue
    for (let i = 0; i < v.length; i++) out[i] += weights[k] * (v[i] - lo) / span
  }
  let lo = Infinity, hi = -Infinity
  for (const x of out) { if (x < lo) lo = x; if (x > hi) hi = x }
  return out.map((x) => (hi - lo < 1e-12 ? 0 : (100 * (x - lo)) / (hi - lo)))
}

/** Per-factor normalised contribution (0-1) for one row — used for "why" explanations. */
export function factorParts(rows: Record<GapKey, number>[], i: number): Record<GapKey, number> {
  const res = {} as Record<GapKey, number>
  for (const k of GAP_KEYS) {
    const v = rows.map((r) => tf(r[k], GAP_TRANSFORM[k]))
    const lo = Math.min(...v), hi = Math.max(...v)
    res[k] = hi - lo < 1e-12 ? 0 : (v[i] - lo) / (hi - lo)
  }
  return res
}

// ---------------- chargers needed ----------------
export const VEHICLE_TYPES = ['2W', '3W', '4W', 'Bus', 'Goods'] as const
export const DC_TYPES = new Set(['4W', 'Bus', 'Goods'])

export function blendedRatio(mix: Mix, ratios: Mix): number {
  return 1 / VEHICLE_TYPES.reduce((s, k) => s + mix[k] / ratios[k], 0)
}

export function chargersNeeded(evs: number, ratio: number, mix: Mix, ratios: Mix, existing = 0) {
  const scale = blendedRatio(mix, ratios) / ratio
  const byType = Object.fromEntries(VEHICLE_TYPES.map((k) => [k, (evs * mix[k] / ratios[k]) * scale])) as Mix
  const required = VEHICLE_TYPES.reduce((s, k) => s + byType[k], 0)
  const dc = VEHICLE_TYPES.filter((k) => DC_TYPES.has(k)).reduce((s, k) => s + byType[k], 0)
  return { required, additional: Math.max(0, required - existing), byType, dc, ac: required - dc }
}

// ---------------- forecast ----------------
export const cagrModel = (t: number, a: number, g: number) => a * Math.pow(1 + g, t)
export const logisticModel = (t: number, k: number, r: number, t0: number) => k / (1 + Math.exp(-r * (t - t0)))

// ---------------- site selection ----------------
export const SITE_RADIUS_KM = 3
export const SITE_WEIGHTS = { demand: 0.6, supply_gap: 0.25, grid: 0.1, highway: 0.05 }

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p = Math.PI / 180
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p)) / 2
  return 12742 * Math.asin(Math.sqrt(a))
}

export interface Cell {
  lon: number; lat: number; pop: number; evs: number; ch3: number; dist: number; demand: number; gap: number; grid: number; hw: number
  pois: number; ss_km: number; hw_km: number; district: string
}

export const cellScore = (c: Cell) =>
  SITE_WEIGHTS.demand * c.demand + SITE_WEIGHTS.supply_gap * c.gap + SITE_WEIGHTS.grid * c.grid + SITE_WEIGHTS.highway * c.hw

export interface Site { cell: Cell; gain: number; reasons: string[]; rank: number; servedBefore: number; servedAfter: number }
export interface SiteResult { sites: Site[]; before: number; after: number; covBefore: number; covAfter: number; hubSize: number }

/**
 * Capacity-aware greedy siting (mirrors analysis.greedy_sites).
 * Cell j: EVs e_j, chargers within 3 km C_j, EVs within 3 km E_j.
 * Share of demand met s_j = min(1, ratio·C_j / E_j). A hub of `hubSize` chargers at k adds hubSize to C_j
 * for all j within 3 km. Each round picks the hub with the largest Σ e_j·Δs_j × (0.5 + cellScore(k)).
 */
export function greedySites(cells: Cell[], nHubs: number, hubSize = 10, ratio = 44.3, radiusKm = SITE_RADIUS_KM): SiteResult {
  const B = 0.03 // ~3 km buckets for neighbour search
  const buckets = new Map<string, number[]>()
  cells.forEach((c, i) => {
    const k = `${Math.floor(c.lon / B)}|${Math.floor(c.lat / B)}`
    const arr = buckets.get(k)
    if (arr) arr.push(i); else buckets.set(k, [i])
  })
  const nb = cells.map((c) => {
    const bx = Math.floor(c.lon / B), by = Math.floor(c.lat / B), out: number[] = []
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++)
      for (const j of buckets.get(`${bx + dx}|${by + dy}`) ?? [])
        if (haversineKm(c.lat, c.lon, cells[j].lat, cells[j].lon) <= radiusKm) out.push(j)
    return out
  })
  const E = nb.map((ns) => ns.reduce((s, j) => s + cells[j].evs, 0) || 1)
  const C = cells.map((c) => c.ch3)
  const served = (j: number, cj: number) => Math.min(1, (ratio * cj) / E[j])
  const totEv = cells.reduce((s, c) => s + c.evs, 0) || 1
  const totPop = cells.reduce((s, c) => s + c.pop, 0) || 1
  const servedPct = () => (cells.reduce((s, c, j) => s + c.evs * served(j, C[j]), 0) / totEv) * 100
  const covPct = () => (cells.reduce((s, c, j) => s + (C[j] > 0 ? c.pop : 0), 0) / totPop) * 100
  const before = servedPct(), covBefore = covPct()
  const sites: Site[] = []
  const used = new Set<number>()
  for (let it = 0; it < nHubs; it++) {
    let best = -1, bestGain = 0, bestRaw = 0
    for (let k = 0; k < cells.length; k++) {
      if (used.has(k)) continue
      let raw = 0
      for (const j of nb[k]) raw += cells[j].evs * (served(j, C[j] + hubSize) - served(j, C[j]))
      const g = raw * (0.5 + cellScore(cells[k]))
      if (g > bestGain) { best = k; bestGain = g; bestRaw = raw }
    }
    if (best < 0) break
    used.add(best)
    const sb = served(best, C[best])
    for (const j of nb[best]) C[j] += hubSize
    sites.push({ cell: cells[best], gain: bestRaw, rank: it + 1, servedBefore: sb * 100, servedAfter: served(best, C[best]) * 100,
      reasons: reasons(cells[best], bestRaw, sb, E[best], ratio) })
  }
  return { sites, before, after: servedPct(), covBefore, covAfter: covPct(), hubSize }
}

function reasons(c: Cell, gain: number, served: number, localEvs: number, ratio: number): string[] {
  const n = (x: number) => Math.round(x).toLocaleString('en-IN')
  const r: [number, string][] = [
    [1 - served, c.ch3 === 0
      ? `No public charger within 3 km for ~${n(localEvs)} EVs`
      : `Overloaded: ${c.ch3} chargers within 3 km serve ~${n(localEvs)} EVs (${n(localEvs / c.ch3)} per charger vs target ${n(ratio)})`],
    [Math.min(gain / 400, 1), `Adds charging for ~${n(gain)} EVs that are unserved today`],
    [c.demand, `High demand: ~${n(c.pop)} residents and ~${n(c.evs)} EVs in this 2 km cell`],
    [c.grid, `Grid-ready: power substation ${c.ss_km.toFixed(1)} km away`],
    [c.hw, `National-highway corridor ${c.hw_km.toFixed(1)} km away`],
    [Math.min(c.pois / 8, 1), `${c.pois} candidate host sites nearby (fuel stations, malls, logistics)`],
  ]
  return r.sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1])
}

export function parseCells(cols: string[], rows: (number | string)[][]): Cell[] {
  return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])) as unknown as Cell)
}
