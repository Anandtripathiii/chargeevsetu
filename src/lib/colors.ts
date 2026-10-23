// Colour-blind-safe sequential ramps (matplotlib viridis / magma), sampled at 9 stops.
type RGB = [number, number, number]
export const VIRIDIS: RGB[] = [
  [68, 1, 84], [71, 44, 122], [59, 81, 139], [44, 113, 142], [33, 144, 141], [39, 173, 129], [92, 200, 99], [170, 220, 50], [253, 231, 37],
]
export const MAGMA: RGB[] = [
  [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191],
]
// Gap ramp: viridis-like low end, red only for the critical top (matches "red only for critical gaps").
export const GAP: RGB[] = [[33, 102, 172], [67, 147, 195], [146, 197, 222], [209, 229, 240], [253, 219, 199], [244, 165, 130], [214, 96, 77], [178, 24, 43]]

export function ramp(stops: RGB[], t: number): RGB {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i
  const a = stops[i], b = stops[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f].map(Math.round) as RGB
}

export const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

/** Quantile breaks so choropleths use the full ramp even for skewed data. */
export function quantileScale(values: number[], log = false) {
  const v = values.filter((x) => Number.isFinite(x)).map((x) => (log ? Math.log1p(Math.max(0, x)) : x)).sort((a, b) => a - b)
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))]
  const lo = q(0.02), hi = q(0.98)
  const t = (x: number) => {
    const y = log ? Math.log1p(Math.max(0, x)) : x
    return hi - lo < 1e-12 ? 0.5 : (y - lo) / (hi - lo)
  }
  const inv = (tt: number) => { const y = lo + tt * (hi - lo); return log ? Math.expm1(y) : y }
  return { t, inv, lo: inv(0), hi: inv(1) }
}

export const gradient = (r: RGB[]) => `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => css(ramp(r, t))).join(',')})`

/** Gap / forecast heat: yellow → orange → purple (colour-blind safe, no red). */
export const HEAT: RGB[] = [[254, 240, 138], [252, 196, 64], [249, 140, 40], [214, 82, 150], [147, 51, 234], [88, 28, 135]]
/** Charger pins */
export const GREEN: RGB = [34, 197, 94]
