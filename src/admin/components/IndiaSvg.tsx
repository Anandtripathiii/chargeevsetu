import { useMemo, useState } from 'react'
import type { FeatureCollection, Geometry } from 'geojson'
import { useData, type StateRow } from '../../lib/data'
import { css, MAGMA, quantileScale, ramp } from '../../lib/colors'
import { fmt } from '../../lib/format'
import { Skeleton } from '../../components/ui'

// Plain equirectangular projection with latitude correction: good enough for a decorative, static India map.
const K = 20, LAT0 = 37.2, LON0 = 68, COS = Math.cos((22 * Math.PI) / 180)
const px = (lon: number, lat: number) => `${((lon - LON0) * K * COS).toFixed(1)},${((LAT0 - lat) * K).toFixed(1)}`

function pathOf(g: Geometry): string {
  const ring = (r: number[][]) => 'M' + r.map(([x, y]) => px(x, y)).join('L') + 'Z'
  if (g.type === 'Polygon') return g.coordinates.map(ring).join('')
  if (g.type === 'MultiPolygon') return g.coordinates.flatMap((p) => p.map(ring)).join('')
  return ''
}

/** Static SVG choropleth of EVs per public charger by state (no WebGL, loads instantly). */
export default function IndiaSvg({ className = '' }: { className?: string }) {
  const { data: geo } = useData<FeatureCollection>('states.geo.json')
  const { data: states } = useData<StateRow[]>('states.json')
  const [hover, setHover] = useState<StateRow | null>(null)
  const paths = useMemo(() => {
    if (!geo || !states) return null
    const by = new Map(states.map((s) => [s.state, s]))
    const sc = quantileScale(states.map((s) => s.evs_per_charger), true)
    return geo.features.map((f) => {
      const s = by.get(f.properties?.state)!
      return { s, d: pathOf(f.geometry), fill: css(ramp(MAGMA, 0.15 + 0.8 * Math.min(1, Math.max(0, sc.t(s.evs_per_charger))))) }
    })
  }, [geo, states])

  if (!paths) return <Skeleton className={`aspect-[560/640] ${className}`} />
  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 560 640" className="w-full h-auto" role="img" aria-label="Map of India coloured by EVs per public charger in each state">
        {paths.map(({ s, d, fill }) => (
          <path key={s.state} d={d} fill={fill} stroke="var(--bg)" strokeWidth={0.8} className="transition-opacity duration-150 cursor-pointer"
            opacity={hover && hover.state !== s.state ? 0.55 : 1} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      <div className="absolute left-0 bottom-2 card px-3 py-2 text-xs pointer-events-none min-w-44">
        {hover ? (
          <><div className="font-semibold">{hover.state}</div><div className="text-muted tnum">{fmt(hover.evs_per_charger)} EVs per public charger</div></>
        ) : (
          <><div className="font-semibold">EVs per public charger</div><div className="text-muted">Darker = fewer EVs per charger · hover a state</div></>
        )}
      </div>
    </div>
  )
}
