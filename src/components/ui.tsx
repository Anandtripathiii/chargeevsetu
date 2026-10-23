import { useLayoutEffect, useRef, type ReactNode } from 'react'

export type SourceType = 'real' | 'derived' | 'synthetic'

const BADGE: Record<SourceType, [string, string]> = {
  real: ['Real data', 'text-accent border-accent/30 bg-accent/10'],
  derived: ['Estimated', 'text-warn border-warn/30 bg-warn/10'],
  synthetic: ['Synthetic', 'text-crit border-crit/30 bg-crit/10'],
}

export function SourceBadge({ type, title }: { type: SourceType; title?: string }) {
  const [label, cls] = BADGE[type]
  return (
    <span className={`chip ${cls}`} title={title ?? label}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  )
}

const NUM = /\d[\d,]*(\.\d+)?/

/**
 * Counts the first number in `text` up from 0 the first time it scrolls into view, keeping its prefix, suffix,
 * grouping and decimals ("1.05 cr", "53,123", "12.4%"). Text is written straight to the DOM: no re-render per frame.
 */
export function CountUp({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const done = useRef(false)
  useLayoutEffect(() => {
    const el = ref.current!
    el.textContent = text
    const m = NUM.exec(text)
    if (done.current || !m || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const target = Number(m[0].replace(/,/g, '')), dec = m[1] ? m[1].length - 1 : 0
    const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: m[0].includes(',') })
    const pre = text.slice(0, m.index), post = text.slice(m.index + m[0].length)
    let raf = 0
    const run = () => {
      const t0 = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 900)
        el.textContent = p < 1 ? pre + nf.format(target * (1 - (1 - p) ** 3)) + post : text
        if (p < 1) raf = requestAnimationFrame(tick); else done.current = true
      }
      raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); run() } })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf); el.textContent = text }
  }, [text])
  return <span ref={ref} />
}

/** Big number: strings count up on first view, anything else renders as is. */
export const Num = ({ v }: { v: ReactNode }) => (typeof v === 'string' ? <CountUp text={v} /> : <>{v}</>)

export function Kpi({ label, value, sub, source, accent }: { label: string; value: ReactNode; sub?: ReactNode; source?: SourceType; accent?: 'crit' | 'warn' }) {
  return (
    <div className="card p-5 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted font-medium leading-snug min-w-0">{label}</span>
        {source && <SourceBadge type={source} />}
      </div>
      <span className={`text-[26px] sm:text-[32px] leading-tight font-semibold tracking-[-0.035em] tnum ${accent === 'crit' ? 'text-crit' : accent === 'warn' ? 'text-warn' : ''}`}><Num v={value} /></span>
      {sub && <span className="text-xs text-muted leading-snug">{sub}</span>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />
}

export function PageSkeleton() {
  return (
    <Container className="py-4 space-y-4">
      <div aria-busy="true" aria-label="Loading" className="space-y-4">
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    </Container>
  )
}

/** Lead under the shell's page heading: the page's question in white, the explanation in grey. */
export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <Container className="pb-6">
      <h2 className="text-lg sm:text-xl font-medium">{title}</h2>
      {children && <div className="mt-2 text-sm sm:text-[15px] text-muted max-w-3xl leading-relaxed">{children}</div>}
    </Container>
  )
}

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`max-w-[1440px] w-full mx-auto px-4 md:px-6 ${className}`}>{children}</div>
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="font-medium text-sm">{children}</h2>
      {right}
    </div>
  )
}
