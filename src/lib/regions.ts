import type { DistrictRow, Mix, StateRow, Summary } from './data'

export interface Region { slug: string; name: string; kind: 'india' | 'state' | 'region' | 'corridor'; evs: number; chargers: number; pop: number; mix: Mix; hasCells: boolean }

/** Planning regions: All India, multi-district regions and corridors (from the pipeline), and every state/UT. */
export function buildRegions(states: StateRow[], summary: Summary, nationalMix: Mix): Region[] {
  const meta = new Map(summary.regions.map((r) => [r.slug, r]))
  const extra = summary.regions.filter((r) => !states.some((s) => s.slug === r.slug))
  return [
    { slug: 'india', name: 'All India', kind: 'india', evs: summary.ev_stock, chargers: summary.public_chargers, pop: summary.population, mix: nationalMix, hasCells: false },
    ...extra.map((r) => ({ slug: r.slug, name: r.name, kind: r.corridor ? 'corridor' as const : 'region' as const, evs: r.evs, chargers: r.chargers, pop: r.pop, mix: nationalMix, hasCells: true })),
    ...[...states].sort((a, b) => a.state.localeCompare(b.state)).map((s) => ({
      slug: s.slug, name: s.state, kind: 'state' as const, evs: s.evs, chargers: s.chargers, pop: s.pop, mix: s.mix, hasCells: meta.has(s.slug),
    })),
  ]
}

export const districtsOf = (r: Region, districts: DistrictRow[], states: StateRow[]) =>
  r.kind === 'state' ? districts.filter((d) => d.state === states.find((s) => s.slug === r.slug)?.state) : []
