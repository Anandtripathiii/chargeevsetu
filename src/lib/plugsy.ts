// Plugsy pilot demo: sample home chargers around the visitor and major cities, with simulated live status.
// shortcut: sample listings are generated in the browser; replace with real host sign-ups (home_chargers table) as they grow.
import { useEffect, useMemo, useState } from 'react'
import type { HomeCharger, PlugStatus } from './backend'

export type Listing = HomeCharger & { rating: number; reviews: number; mins?: number; sample?: boolean }

const CITIES: [string, [string, number, number][]][] = [
  ['Delhi', [['Saket', 77.21, 28.525], ['Dwarka', 77.05, 28.585], ['Rohini', 77.11, 28.735], ['Lajpat Nagar', 77.24, 28.567], ['Janakpuri', 77.085, 28.62]]],
  ['Gurugram', [['DLF Phase 3', 77.095, 28.49], ['Sohna Road', 77.04, 28.41], ['Sector 56', 77.105, 28.425]]],
  ['Noida', [['Sector 62', 77.365, 28.625], ['Sector 18', 77.325, 28.57], ['Greater Noida West', 77.43, 28.6]]],
  ['Ghaziabad', [['Indirapuram', 77.37, 28.645], ['Raj Nagar Ext.', 77.44, 28.7]]],
  ['Mumbai', [['Andheri West', 72.835, 19.135], ['Powai', 72.905, 19.12], ['Bandra', 72.84, 19.06], ['Thane', 72.975, 19.2]]],
  ['Pune', [['Baner', 73.785, 18.56], ['Kharadi', 73.94, 18.55], ['Kothrud', 73.81, 18.505]]],
  ['Bengaluru', [['Whitefield', 77.75, 12.97], ['Koramangala', 77.625, 12.935], ['HSR Layout', 77.645, 12.91], ['Hebbal', 77.59, 13.035], ['Jayanagar', 77.585, 12.93]]],
  ['Hyderabad', [['Gachibowli', 78.35, 17.44], ['Kondapur', 78.36, 17.47], ['Banjara Hills', 78.445, 17.415]]],
  ['Chennai', [['Anna Nagar', 80.21, 13.085], ['Velachery', 80.22, 12.98], ['OMR', 80.23, 12.9]]],
  ['Kolkata', [['Salt Lake', 88.41, 22.58], ['New Town', 88.47, 22.58], ['Ballygunge', 88.365, 22.525]]],
  ['Ahmedabad', [['Satellite', 72.525, 23.03], ['Bopal', 72.47, 23.035]]],
  ['Jaipur', [['Vaishali Nagar', 75.745, 26.91], ['Malviya Nagar', 75.81, 26.855]]],
  ['Lucknow', [['Gomti Nagar', 81.0, 26.855], ['Hazratganj', 80.945, 26.85]]],
  ['Chandigarh', [['Sector 35', 76.76, 30.725], ['Mohali Ph 7', 76.72, 30.71]]],
  ['Kochi', [['Kakkanad', 76.345, 10.015], ['Edappally', 76.31, 10.025]]],
  ['Indore', [['Vijay Nagar', 75.895, 22.75]]],
  ['Patna', [['Boring Road', 85.12, 25.615], ['Kankarbagh', 85.16, 25.595]]],
  ['Bhubaneswar', [['Patia', 85.82, 20.355]]],
]
const NAMES = ['Aarav', 'Meera', 'Kabir', 'Isha', 'Rohan', 'Ananya', 'Vikram', 'Priya', 'Arjun', 'Sneha', 'Rahul', 'Kavya', 'Sanjay', 'Pooja', 'Imran', 'Fatima', 'Harpreet', 'Lakshmi', 'Suresh', 'Neha', 'Joseph', 'Divya', 'Manoj', 'Ritu']
const SPOTS = ['Covered parking', 'Society basement', 'Independent house', 'Villa garage', 'Shop front', 'Office lot (evenings)', 'Gated community', 'Bungalow porch', 'Cafe parking', 'Clinic parking']
const KINDS: [HomeCharger['type'], number, string, number][] = [
  ['AC', 3.3, '15A socket', 9], ['AC', 3.3, 'Bharat AC-001', 10], ['AC', 7.4, 'Type 2', 13], ['AC', 7.4, 'Type 2', 12], ['AC', 11, 'Type 2', 15], ['DC', 25, 'CCS2', 19], ['DC', 30, 'CCS2', 21],
]
const START: PlugStatus[] = ['free', 'free', 'free', 'free', 'busy', 'busy', 'booked', 'offline']

/** Small seeded PRNG so a city's sample listings stay the same between visits. */
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

function make(id: string, area: string, lon: number, lat: number, r: () => number, spread: number): Listing {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const [type, power_kw, connector, price] = pick(KINDS)
  const status = pick(START)
  return {
    id, host_id: `sample-host-${id}`, host_name: pick(NAMES), title: `${pick(SPOTS)} · ${type} ${power_kw} kW`, area,
    lon: lon + (r() - 0.5) * spread, lat: lat + (r() - 0.5) * spread, type, power_kw, connector, price_kwh: price + Math.round(r() * 3),
    hours: pick(['7:00–22:00', '6:00–23:00', '24 hours', '18:00–8:00', '9:00–21:00']), status, verified: r() > 0.2, photos: [],
    created_at: '2026-10-01T00:00:00Z', rating: Math.round((3.8 + r() * 1.2) * 10) / 10, reviews: 3 + Math.floor(r() * 80),
    mins: status === 'busy' ? 10 + Math.floor(r() * 50) : undefined, sample: true,
  }
}

/** ~300 sample listings in big cities, plus 14 around the visitor if their location is known. */
export function sampleListings(me: [number, number] | null): Listing[] {
  const out: Listing[] = []
  CITIES.forEach(([city, spots], ci) => spots.forEach(([loc, lon, lat], si) => {
    const r = rng(ci * 100 + si + 1)
    for (let k = 0; k < 6; k++) out.push(make(`sample-${ci}-${si}-${k}`, `${loc}, ${city}`, lon, lat, r, 0.05))
  }))
  if (me) {
    const r = rng(Math.round(me[0] * 100) * 7 + Math.round(me[1] * 100))
    for (let k = 0; k < 14; k++) out.push(make(`sample-me-${k}`, 'Near you', me[0], me[1], r, 0.07))
  }
  return out
}

/** Simulated real time: every few seconds some chargers get plugged in, unplugged, booked or go offline. */
export function useLiveStatus(list: Listing[], everyMs = 3500): Listing[] {
  const [live, setLive] = useState(list)
  useEffect(() => setLive(list), [list])
  useEffect(() => {
    const id = setInterval(() => setLive((cur) => cur.map((c) => {
      if (!c.sample) return c
      if (c.status === 'busy') { const mins = (c.mins ?? 20) - 3; return mins <= 0 || Math.random() < 0.04 ? { ...c, status: 'free', mins: undefined } : { ...c, mins } }
      if (Math.random() > 0.05) return c
      const to: PlugStatus = c.status === 'free' ? (Math.random() < 0.7 ? 'busy' : 'booked') : c.status === 'booked' ? 'busy' : Math.random() < 0.5 ? 'free' : 'offline'
      return { ...c, status: to, mins: to === 'busy' ? 15 + Math.floor(Math.random() * 45) : undefined }
    })), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return live
}

export const useSamples = (me: [number, number] | null) => useMemo(() => sampleListings(me), [me])
