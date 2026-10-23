// Infrastructure Gap Score (0-100) from four equal factors, each 0-25 points. Higher = more underserved.
import type { DistrictRow } from './data'

export type Factor = 'demand' | 'access' | 'spread' | 'highway'
export const FACTORS: Factor[] = ['demand', 'access', 'spread', 'highway']
export const FACTOR_INFO: Record<Factor, [string, string]> = {
  demand: ['Demand vs charging supply', 'How many EVs share each public charging point.'],
  access: ['Geographic accessibility', 'How far people typically live from the nearest charger.'],
  spread: ['Charger distribution', 'How much land each charger has to cover. Few chargers over a big area score badly.'],
  highway: ['Highway coverage', 'Share of national-highway length with no charger for 25 km.'],
}

const raw = (d: DistrictRow): Record<Factor, number> => ({
  demand: Math.log1p(d.evs_per_charger),
  access: d.dist_km,
  spread: Math.log1p(d.area_km2 / (d.chargers + 1)),
  highway: d.nh_km > 0 ? d.nh_gap_km / d.nh_km : 0,
})

export type Scored = DistrictRow & { score: number; parts: Record<Factor, number>; pos: number }

/** Min-max scale each factor across all districts (2nd–98th percentile, clipped), 25 points each. */
export function score4(rows: DistrictRow[]): Scored[] {
  const r = rows.map(raw)
  const span = Object.fromEntries(FACTORS.map((k) => {
    const v = r.map((x) => x[k]).sort((a, b) => a - b)
    return [k, [v[Math.floor(v.length * 0.02)], v[Math.floor(v.length * 0.98)]]]
  })) as Record<Factor, [number, number]>
  const out = rows.map((d, i) => {
    const parts = Object.fromEntries(FACTORS.map((k) => {
      const [lo, hi] = span[k]
      return [k, hi - lo < 1e-12 ? 0 : 25 * Math.min(1, Math.max(0, (r[i][k] - lo) / (hi - lo)))]
    })) as Record<Factor, number>
    return { ...d, parts, score: FACTORS.reduce((s, k) => s + parts[k], 0), pos: 0 }
  })
  ;[...out].sort((a, b) => b.score - a.score).forEach((d, i) => { d.pos = i + 1 })
  return out
}

/** EV-weighted average of district scores, per state. */
export function stateScores(d: Scored[]): Map<string, number> {
  const acc = new Map<string, [number, number]>()
  for (const x of d) { const a = acc.get(x.state) ?? [0, 0]; a[0] += x.score * (x.evs + 1); a[1] += x.evs + 1; acc.set(x.state, a) }
  return new Map([...acc].map(([k, [s, w]]) => [k, s / w]))
}
