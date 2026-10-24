import { useState, type ReactNode } from 'react'
import { Layers, Maximize2, Minimize2, RotateCcw, WifiOff } from 'lucide-react'

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

export interface LayerToggle { label: string; on: boolean; set: (v: boolean) => void; color?: string }

/** Top-right buttons shared by every map: layer switcher and full screen (of the whole map card, so overlays stay visible). */
export function MapChrome({ layers }: { layers?: LayerToggle[] }) {
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  const fullscreen = (e: React.MouseEvent) => {
    const card = (e.currentTarget as HTMLElement).closest('.map-card') ?? (e.currentTarget as HTMLElement).parentElement!.parentElement!
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else card.requestFullscreen?.().then(() => { setFull(true); document.addEventListener('fullscreenchange', () => setFull(!!document.fullscreenElement), { once: true }) }).catch(() => {})
  }
  return (
    <div className="absolute right-2.5 top-2.5 z-20 flex flex-col items-end gap-2 no-print">
      {!!layers?.length && (
        <div className="relative">
          <button className="map-btn" onClick={() => setOpen(!open)} aria-pressed={open} aria-label="Map layers" title="Map layers"><Layers size={17} /></button>
          {open && (
            <div className="absolute right-11 top-0 w-56 card !animate-none p-3 space-y-2 text-sm">
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted">Show on map</div>
              {layers.map((l) => (
                <label key={l.label} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={l.on} onChange={(e) => l.set(e.target.checked)} className="accent-[var(--accent-fill)]" />
                  {l.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />}
                  <span className="leading-tight">{l.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <button className="map-btn" onClick={fullscreen} aria-label={full ? 'Exit full screen' : 'Full screen'} title={full ? 'Exit full screen' : 'Full screen'}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
    </div>
  )
}

/** Shown over a map whose tiles or style failed to load: never a blank map. */
export function MapError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="absolute inset-0 z-30 grid place-items-center bg-bg-2/85 backdrop-blur-sm p-4">
      <div className="card p-5 text-center max-w-xs">
        <WifiOff className="mx-auto text-warn" size={26} />
        <h2 className="font-semibold mt-2">The map could not load</h2>
        <p className="text-sm text-muted mt-1">The map service may be busy or your connection dropped. The numbers on this page still work.</p>
        <button className="btn btn-primary mt-3 mx-auto" onClick={onRetry}><RotateCcw size={15} />Retry</button>
      </div>
    </div>
  )
}

/** Counts map load errors; a style failure or a burst of tile failures marks the map as failed. */
export function trackMapErrors(onFail: () => void) {
  let recent: number[] = []
  return (styleLoaded: boolean) => {
    const now = Date.now()
    recent = recent.filter((t) => now - t < 10000).concat(now)
    if (!styleLoaded || recent.length >= 8) { recent = []; onFail() }
  }
}
