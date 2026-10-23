import { useEffect, useState } from 'react'
import type { SourceType } from '../components/ui'

export type Mix = Record<'2W' | '3W' | '4W' | 'Bus' | 'Goods', number>

export interface StateRow {
  state: string; slug: string; id: number; pop: number; area_km2: number; urban_pop: number
  evs: number; ev_stock_2023: number | null; chargers: number; official_chargers_2025: number; real_chargers: number
  completeness: number; nh_km: number; nh_gap_km: number; coverage: number | null; coverage_mapped: number | null
  fast_share_mapped: number | null; gap_score: number; critical_districts: number; districts: number; mix: Mix
  evs_per_charger: number; chargers_per_lakh: number; chargers_per_100km_nh: number | null; chargers_per_100km2: number
  source: Record<string, SourceType>
}

export interface DistrictRow {
  id: string; name: string; state: string; lon: number; lat: number; pop: number; pop2011: number; urban_share: number
  area_km2: number; evs: number; chargers: number; real_chargers: number; nh_km: number; nh_gap_km: number; dist_km: number
  coverage: number | null; coverage_mapped: number | null; tourism_pois: number; logistics_pois: number
  ev_density: number; evs_per_charger: number; urban_pop: number; corridor: number; gap_score: number; rank: number
  source: Record<string, SourceType>
}

export interface Summary {
  generated: string; ev_stock: number; ev_stock_as_of: string; public_chargers: number; public_chargers_as_of: string
  fast_car_chargers: number; evs_per_charger: number; mapped_chargers: number; modelled_chargers: number; mapped_share: number
  nh_km_mapped: number; nh_gap_km: number; nh_gap_share: number | null; nh_routes: number; nh_routes_with_gaps: number
  critical_districts: number; districts: number; critical_threshold: number; urban_coverage: number
  urban_coverage_mapped: number; population: number; substations: number; pois: number
  ev_penetration_fy26: number; ev_penetration_fy20: number; sensitivity: Record<string, number>
  regions: { name: string; slug: string; cells: number; corridor: boolean; evs: number; pop: number; chargers: number }[]
  gap_factors: Record<string, { label: string; transform: 'log' | 'lin'; weight: number }>
  urban_density: number; city_radius_km: number; highway_spacing_km: number
}

export interface Forecast {
  history: { year: number; stock: number; registrations: number }[]
  fits: {
    cagr: { a: number; g: number; r2: number; mape: number }
    logistic: { k: number; r: number; t0: number; r2: number; mape: number }
    t0_year: number
  }
  best_fit: 'cagr' | 'logistic'; backtest_mape: { cagr: number; logistic: number }
  scenarios: Record<'low' | 'base' | 'high', Record<string, number>>
  scenario_anchors: Record<string, Record<string, number>>; sales_growth: number; retirement: number
  total_sales_2025: number; stock_2026_official: number
  charger_history: { date: string; chargers: number; src: string }[]
  target_ratio: Mix; vehicle_mix: Mix; blended_ratio: number; dc_types: string[]
}

export interface Chargers {
  operators: string[]; states: string[]; cols: string[]
  real: [number, number, number, number, number | null, number, number][]
  real_meta: { name: string; sources: string[]; sockets: number | null }[]
}
/** chargers-modelled.json: synthetic locations, fetched only when that map layer is on */
export interface ModelledChargers {
  synthetic: [number, number, number, number, null, number, number][]
}

export interface Highways { cols: string[]; segments: [string, number, number, number, [number, number][]][] }

export interface Cells { region: string; source_type: SourceType; cols: string[]; rows: (number | string)[][] }

export interface SourceEntry {
  name: string; url?: string; licence?: string; records?: number; source_type: SourceType; fetched: string
  cleaning?: string; limitations?: string; status?: string; total?: number; as_of?: string
}

const cache = new Map<string, Promise<unknown>>()

export function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(`${import.meta.env.BASE_URL}data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(path)) // allow retry after a failed load
    cache.set(path, p)
  }
  return cache.get(path) as Promise<T>
}

/** Fetch a JSON file from /public/data once per session. Returns undefined while loading. */
export function useData<T>(path: string | null): { data: T | undefined; error: string | null } {
  const [state, setState] = useState<{ path: string | null; data?: T; error: string | null }>({ path, error: null })
  useEffect(() => {
    if (!path) return
    let live = true
    load<T>(path).then(
      (data) => live && setState({ path, data, error: null }),
      (e: Error) => live && setState({ path, error: e.message }),
    )
    return () => { live = false }
  }, [path])
  return state.path === path ? { data: state.data, error: state.error } : { data: undefined, error: null }
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
