// Real charging stations, served as static z7 tiles (scripts/build-map-data.mjs). Only tiles on screen are fetched.
import { load } from './data'
import { haversineKm } from './model'

export interface Plug { type: string; count: number | null; kw: number | null }
export interface Station {
  id: string; lon: number; lat: number; name: string; operator: string | null; dc: boolean; kw: number | null; plugs: Plug[]
  points: number | null; swap?: boolean; price: string | null; hours: string | null; address: string | null; access: string | null
  vehicles?: string[]; src: string[]; area: string
}
export interface TileIndex { z: number; tiles: string[]; count: number; built: string }
/** [id, name, area, lon, lat, dc] */
export type IndexRow = [string, string, string, number, number, 0 | 1]

export const tileIndex = () => load<TileIndex>('tiles/index.json')
export const stationIndex = () => load<IndexRow[]>('stations-index.json')
export const loadTile = (key: string) => load<Station[]>(`tiles/7/${key}.json`)

export function tileOf(lon: number, lat: number, z = 7): [number, number] {
  const n = 2 ** z, r = (lat * Math.PI) / 180
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)]
}

/** Tile keys "x/y" covering a lon/lat box, limited to tiles that exist. */
export function tilesIn(b: [number, number, number, number], idx: TileIndex): string[] {
  const [x0, y1] = tileOf(b[0], b[1], idx.z), [x1, y0] = tileOf(b[2], b[3], idx.z)
  const have = new Set(idx.tiles), out: string[] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (have.has(`${x}/${y}`)) out.push(`${x}/${y}`)
  return out
}

export async function getStation(id: string, lon: number, lat: number): Promise<Station | undefined> {
  return (await loadTile(tileOf(lon, lat).join('/')).catch(() => [])).find((s) => s.id === id)
}

export async function nearest(lon: number, lat: number, n = 10) {
  const idx = await stationIndex()
  return idx.map((r) => ({ r, d: haversineKm(lat, lon, r[4], r[3]) })).sort((a, b) => a.d - b.d).slice(0, n)
}

export const kmText = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(d < 10 ? 1 : 0)} km`)
export const directions = (lat: number, lon: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`

export interface Filters { kind: 'all' | 'ac' | 'dc'; minKw: number; plug: string }
export const NO_FILTER: Filters = { kind: 'all', minKw: 0, plug: '' }
export function matches(s: Station, f: Filters) {
  if (f.kind === 'dc' && !s.dc) return false
  if (f.kind === 'ac' && s.dc) return false
  if (f.minKw && (s.kw ?? 0) < f.minKw) return false
  if (f.plug && !s.plugs.some((p) => p.type === f.plug)) return false
  return true
}
