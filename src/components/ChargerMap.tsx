import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react'
import MapGL, { GeolocateControl, Layer, Marker, NavigationControl, Source, type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { INDIA_BOUNDS, MapChrome, MapError, trackMapErrors, type LayerToggle } from './mapUtil'
import { googleify, STYLE_URL } from './mapStyle'
import type { Station } from '../lib/stations'

export const PIN_ZOOM = 9 // below this stations show as clusters only

export interface ChargerMapHandle { fly: (lon: number, lat: number, zoom?: number) => void; fit: (b: [[number, number], [number, number]]) => void }
interface Props {
  theme: 'dark' | 'light'; stations: Station[]; selected?: string | null; me?: [number, number] | null
  onPick: (s: Station) => void; onView: (b: [number, number, number, number], zoom: number) => void
  layers?: LayerToggle[]; children?: ReactNode
}

const ChargerMap = forwardRef<ChargerMapHandle, Props>(function ChargerMap({ theme, stations, selected, me, onPick, onView, layers, children }, ref) {
  const map = useRef<MapRef>(null)
  const [failed, setFailed] = useState(false)
  const [onErr] = useState(() => trackMapErrors(() => setFailed(true)))
  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations])
  const geo = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: stations.map((s) => ({ type: 'Feature' as const, properties: { id: s.id, dc: s.dc ? 1 : 0 }, geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] } })),
  }), [stations])
  // camera calls made before the map has loaded are queued (latest wins)
  const pending = useRef<(() => void) | null>(null)
  const loaded = useRef(false)
  const run = (f: () => void) => { if (loaded.current && map.current) f(); else pending.current = f }
  useImperativeHandle(ref, () => ({
    fly: (lon, lat, zoom = 13) => run(() => map.current?.flyTo({ center: [lon, lat], zoom, duration: 1200, essential: true })),
    fit: (b) => run(() => map.current?.fitBounds(b, { padding: 40, duration: 900 })),
  }))
  const onLoad = () => { loaded.current = true; googleify(map.current!.getMap(), theme); pending.current?.(); pending.current = null; report() }
  useEffect(() => { if (loaded.current && map.current) googleify(map.current.getMap(), theme) }, [theme])
  const report = () => {
    const m = map.current; if (!m) return
    const b = m.getBounds()
    onView([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], m.getZoom())
  }
  const click = async (e: MapLayerMouseEvent) => {
    const f = e.features?.[0]
    if (!f) return
    if (f.layer.id === 'clusters') {
      const src = map.current!.getSource('stations') as GeoJSONSource
      const z = await src.getClusterExpansionZoom(f.properties.cluster_id as number)
      map.current!.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.5, duration: 500 })
      return
    }
    const s = byId.get(f.properties.id as string)
    if (s) onPick(s)
  }
  const ink = theme === 'dark' ? '#0b0b0c' : '#ffffff'
  return (
    <MapGL ref={map} initialViewState={{ bounds: INDIA_BOUNDS, fitBoundsOptions: { padding: 20 } }} mapStyle={STYLE_URL}
      minZoom={3} maxZoom={18} dragRotate={false} pitchWithRotate={false} attributionControl={{ compact: true }} style={{ width: '100%', height: '100%' }}
      interactiveLayerIds={['clusters', 'pins']} onClick={click} onLoad={onLoad} onMoveEnd={report}
      onError={() => onErr(!!map.current?.getMap().isStyleLoaded())}
      cursor="auto" onMouseEnter={(e) => { e.target.getCanvas().style.cursor = 'pointer' }} onMouseLeave={(e) => { e.target.getCanvas().style.cursor = '' }}>
      <NavigationControl position="bottom-right" showCompass={false} />
      <GeolocateControl position="bottom-right" />
      <Source id="stations" type="geojson" data={geo} cluster clusterMaxZoom={13} clusterRadius={44}>
        <Layer id="clusters" type="circle" filter={['has', 'point_count']}
          paint={{
            'circle-color': '#22c55e', 'circle-opacity': 0.9, 'circle-stroke-color': ink, 'circle-stroke-width': 2,
            'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 23, 200, 28],
          }} />
        <Layer id="cluster-count" type="symbol" filter={['has', 'point_count']}
          layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Bold'] }} paint={{ 'text-color': '#052e16' }} />
        <Layer id="pins" type="circle" filter={['!', ['has', 'point_count']]}
          paint={{
            'circle-color': ['case', ['==', ['get', 'dc'], 1], '#16a34a', '#22c55e'], 'circle-stroke-color': ink, 'circle-stroke-width': 2,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, PIN_ZOOM, 6, 15, 9],
          }} />
        <Layer id="pin-bolt" type="symbol" minzoom={11} filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'dc'], 1]]}
          layout={{ 'text-field': '⚡', 'text-size': 10, 'text-allow-overlap': true, 'text-font': ['Noto Sans Regular'] }} />
        <Layer id="pin-selected" type="circle" filter={['==', ['get', 'id'], selected ?? '']}
          paint={{ 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#f87171', 'circle-stroke-width': 3 }} />
      </Source>
      {me && <Marker longitude={me[0]} latitude={me[1]}><div className="me-dot" aria-label="You are here" /></Marker>}
      {children}
      <MapChrome layers={layers} />
      {failed && <MapError onRetry={() => { setFailed(false); loaded.current = false; map.current?.getMap().setStyle(STYLE_URL); map.current?.getMap().once('style.load', onLoad) }} />}
    </MapGL>
  )
})
export default ChargerMap
