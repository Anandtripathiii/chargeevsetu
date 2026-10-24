// Google-Maps-like look for every map: OpenFreeMap "liberty" (free, keyless vector tiles) recoloured per theme.
import type { Map as MLMap } from 'maplibre-gl'

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

const PALETTE = {
  light: {
    land: '#f5f3ef', residential: '#efece6', park: '#cdeac4', wood: '#c3e2b8', water: '#aadaff', building: '#e8e4de',
    road: '#ffffff', casing: '#dadce0', major: '#ffffff', majorCasing: '#c9ccd1', motorway: '#fde293', motorwayCasing: '#f2c94c',
    rail: '#c4c4c4', boundary: '#9aa0a6', text: '#3c4043', halo: '#ffffff', waterText: '#4a7fb5',
  },
  dark: {
    land: '#1d2025', residential: '#22262c', park: '#1f3326', wood: '#1c3024', water: '#17263c', building: '#2a2e35',
    road: '#3a3f47', casing: '#2a2e35', major: '#4a505a', majorCasing: '#2a2e35', motorway: '#6b5a2c', motorwayCasing: '#3e3520',
    rail: '#3a3f47', boundary: '#6b7280', text: '#d1d5db', halo: '#15171b', waterText: '#7aa7d9',
  },
}

function paint(m: MLMap, id: string, prop: string, v: string) {
  // shortcut: ignores layers a future liberty version renames; the map still renders with its default colours
  try { m.setPaintProperty(id, prop as Parameters<MLMap['setPaintProperty']>[1], v as Parameters<MLMap['setPaintProperty']>[2]) } catch { /* layer missing */ }
}

/** Recolour the loaded liberty style for the theme. Safe to call again on theme change. */
export function googleify(m: MLMap, theme: 'dark' | 'light') {
  const p = PALETTE[theme]
  for (const l of m.getStyle()?.layers ?? []) {
    const id = l.id
    if (id === 'natural_earth' || id === 'building-3d') { m.setLayoutProperty(id, 'visibility', 'none'); continue }
    if (l.type === 'background') paint(m, id, 'background-color', p.land)
    else if (l.type === 'fill') {
      if (id === 'water') paint(m, id, 'fill-color', p.water)
      else if (id === 'park' || id === 'landcover_grass' || id === 'landuse_pitch' || id === 'landuse_cemetery') paint(m, id, 'fill-color', p.park)
      else if (id === 'landcover_wood') paint(m, id, 'fill-color', p.wood)
      else if (id === 'landuse_residential') paint(m, id, 'fill-color', p.residential)
      else if (id === 'building') { paint(m, id, 'fill-color', p.building); paint(m, id, 'fill-outline-color', p.casing) }
    } else if (l.type === 'line') {
      if (id.startsWith('waterway')) paint(m, id, 'line-color', p.water)
      else if (id.startsWith('boundary')) paint(m, id, 'line-color', p.boundary)
      else if (id.includes('rail')) paint(m, id, 'line-color', p.rail)
      else if (id.includes('motorway')) paint(m, id, 'line-color', id.endsWith('casing') ? p.motorwayCasing : p.motorway)
      else if (id.includes('trunk_primary')) paint(m, id, 'line-color', id.endsWith('casing') ? p.majorCasing : p.major)
      else if (/^(road|bridge|tunnel)_/.test(id)) paint(m, id, 'line-color', id.endsWith('casing') ? p.casing : p.road)
      else if (id === 'park_outline') paint(m, id, 'line-color', p.park)
    } else if (l.type === 'symbol') {
      const water = id.startsWith('water')
      paint(m, id, 'text-color', water ? p.waterText : p.text)
      paint(m, id, 'text-halo-color', p.halo)
    }
  }
}
