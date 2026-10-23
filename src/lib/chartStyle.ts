export const axisStyle = { fontSize: 11, fill: 'var(--muted)' }
export const tipStyle = { background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12, color: 'var(--text)' }
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
/** Spread on Recharts series: bars grow / lines draw on mount, off for reduced-motion users. */
export const chartAnim = { isAnimationActive: !reduced, animationDuration: 800, animationEasing: 'ease-out' as const }
