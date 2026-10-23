const inr = new Intl.NumberFormat('en-IN')

/** Indian grouping: 10023396 -> 1,00,23,396 */
export const fmt = (n: number | null | undefined, digits = 0) =>
  n == null || !Number.isFinite(n) ? '–' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n)

/** Compact Indian units: 1.0 crore, 52.7 thousand */
export function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–'
  const a = Math.abs(n)
  if (a >= 1e7) return `${(n / 1e7).toFixed(a >= 1e8 ? 1 : 2)} cr`
  if (a >= 1e5) return `${(n / 1e5).toFixed(a >= 1e6 ? 1 : 2)} lakh`
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return inr.format(Math.round(n))
}

export const pct = (n: number | null | undefined, d = 1) => (n == null || !Number.isFinite(n) ? '–' : `${n.toFixed(d)}%`)
