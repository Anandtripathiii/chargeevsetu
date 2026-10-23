import type { ReactNode } from 'react'

// Light map helpers: no MapLibre / deck.gl imports, so pages can use them before the map code loads.

export const INDIA_BOUNDS: [[number, number], [number, number]] = [[68, 6.5], [97.5, 37]]

export interface MapBaseHandle { fit: (b: [[number, number], [number, number]], maxZoom?: number) => void; fly: (lon: number, lat: number, zoom: number) => void }

/** bbox of any GeoJSON geometry */
export function bboxOf(geom: { type: string; coordinates: unknown }): [[number, number], [number, number]] {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as number[]
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    } else if (Array.isArray(c)) c.forEach(walk)
  }
  walk(geom.coordinates)
  return [[x0, y0], [x1, y1]]
}

export function Legend({ title, stops, lo, hi, badge }: { title: string; stops: string; lo: string; hi: string; badge?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-semibold">{title}</span>
        {badge}
      </div>
      <div className="h-2.5 rounded-full" style={{ background: stops }} />
      <div className="flex justify-between text-[11px] text-muted mt-1 tnum"><span>{lo}</span><span>{hi}</span></div>
    </div>
  )
}
