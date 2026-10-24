import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import MapGL, { GeolocateControl, Layer, Marker, NavigationControl, Source, useControl, type MapRef } from 'react-map-gl/maplibre'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import { GeoJsonLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { INDIA_BOUNDS, MapChrome, type LayerToggle, type MapBaseHandle } from './mapUtil'
import { googleify, STYLE_URL } from './mapStyle'
import 'maplibre-gl/dist/maplibre-gl.css'

export const BASEMAPS = { dark: STYLE_URL, light: STYLE_URL } // one style, recoloured per theme by googleify

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ ...props, interleaved: true }))
  overlay.setProps(props)
  return null
}

/** Layer classes and map components, handed to the page so it never imports MapLibre / deck.gl itself (they load lazily). */
export const kit = { GeoJsonLayer, PathLayer, ScatterplotLayer, HeatmapLayer, Source, Layer, Marker }
export type Kit = typeof kit

export interface MapBaseProps {
  basemap: 'dark' | 'light'
  deck: (labelLayerId: string | undefined, k: Kit) => MapboxOverlayProps
  children?: (k: Kit) => ReactNode
  initialBounds?: [[number, number], [number, number]]
  className?: string
  nav?: 'top-right' | 'bottom-right'
  /** entries for the map's layer switcher button */
  layers?: LayerToggle[]
}

/** MapLibre basemap + deck.gl overlay (interleaved so deck layers sit inside the map's WebGL context). */
const MapBase = forwardRef<MapBaseHandle, MapBaseProps>(
  function MapBase({ basemap, deck, children, initialBounds = INDIA_BOUNDS, className, nav = 'bottom-right', layers }, ref) {
    const map = useRef<MapRef>(null)
    // first label layer of the basemap: polygon layers go beneath it so place names stay readable
    const [labelId, setLabelId] = useState<string>()
    const styled = useRef(false) // recolour once per style load (setPaintProperty itself fires styledata)
    // Camera moves requested before the map exists/has its style (react-map-gl creates the map
    // asynchronously) are queued; only the latest one runs.
    const pending = useRef<(() => void) | null>(null)
    const flush = () => {
      if (!pending.current || !map.current?.getMap().isStyleLoaded()) return
      const f = pending.current
      pending.current = null
      f()
    }
    const run = (f: () => void) => { pending.current = f; flush() }
    const onStyle = () => {
      const m = map.current?.getMap()
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__map = m
      if (m && !styled.current && m.getStyle()) { styled.current = true; googleify(m, basemap); setLabelId(m.getStyle().layers.find((l) => l.type === 'symbol')?.id) }
      flush()
    }
    useEffect(() => { const m = map.current?.getMap(); if (m?.isStyleLoaded()) googleify(m, basemap) }, [basemap])
    useImperativeHandle(ref, () => ({
      fit: (b, maxZoom = 9) => run(() => { map.current?.fitBounds(b, { padding: 60, duration: 700, maxZoom }) }),
      fly: (lon, lat, zoom) => run(() => { map.current?.flyTo({ center: [lon, lat], zoom, duration: 700 }) }),
    }))
    return (
      <div className={className ?? 'absolute inset-0'}>
        <MapGL
          ref={map}
          initialViewState={{ bounds: initialBounds, fitBoundsOptions: { padding: 20 } }}
          mapStyle={BASEMAPS[basemap]}
          minZoom={3}
          maxZoom={15}
          dragRotate={false}
          pitchWithRotate={false}
          attributionControl={{ compact: true }}
          style={{ width: '100%', height: '100%' }}
          onStyleData={onStyle}
          onLoad={onStyle}
          onIdle={flush}
        >
          <NavigationControl position={nav} showCompass={false} />
          <GeolocateControl position={nav} showUserLocation />
          <DeckOverlay {...deck(labelId, kit)} />
          {children?.(kit)}
        </MapGL>
        <MapChrome layers={layers} />
      </div>
    )
  },
)
export default MapBase
