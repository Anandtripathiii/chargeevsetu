import type { ReactNode } from 'react'

export type SourceType = 'real' | 'derived' | 'synthetic'

const BADGE: Record<SourceType, [string, string]> = {
  real: ['Real data', 'text-accent border-accent/40 bg-accent/10'],
  derived: ['Estimated', 'text-warn border-warn/40 bg-warn/10'],
  synthetic: ['Synthetic', 'text-crit border-crit/40 bg-crit/10'],
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

export function Kpi({ label, value, sub, source, accent }: { label: string; value: ReactNode; sub?: ReactNode; source?: SourceType; accent?: 'crit' | 'warn' }) {
  return (
    <div className="card p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted font-medium truncate">{label}</span>
        {source && <SourceBadge type={source} />}
      </div>
      <span className={`font-display text-2xl sm:text-3xl font-bold tnum ${accent === 'crit' ? 'text-crit' : accent === 'warn' ? 'text-warn' : ''}`}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />
}

export function PageSkeleton() {
  return (
    <div className="max-w-[1400px] w-full mx-auto px-4 py-10 space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-80" />
    </div>
  )
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-[1400px] w-full mx-auto px-4 pt-10 pb-6">
      {eyebrow && <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent mb-2">{eyebrow}</div>}
      <h1 className="text-3xl sm:text-4xl font-bold">{title}</h1>
      {children && <div className="mt-3 text-muted max-w-3xl leading-relaxed">{children}</div>}
    </div>
  )
}

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`max-w-[1400px] w-full mx-auto px-4 ${className}`}>{children}</div>
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="font-semibold text-sm">{children}</h2>
      {right}
    </div>
  )
}
