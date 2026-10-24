// Shared layout for the planning tools (Gap Analysis, Planning Lab, Forecast, Delivery Hubs):
// title + one plain line + "How to use" · controls (left) · map card (centre) · results (right). Stacks on phones.
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp, Info as InfoIcon, X } from 'lucide-react'
import { Container, Num } from './ui'

export interface TourStep { target?: string; title: string; text: string }

/** Step-by-step guided tour: highlights `[data-tour=target]` and explains it in a floating card. */
export function Tour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0)
  const step = steps[i]
  useEffect(() => { if (open) setI(0) }, [open])
  useEffect(() => {
    if (!open || !step?.target) return
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
    el?.classList.add('tour-focus')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return () => el?.classList.remove('tour-focus')
  }, [open, step])
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open || !step) return null
  const last = i === steps.length - 1
  return createPortal(
    <div role="dialog" aria-label="How to use this page" className="fixed z-[120] left-1/2 -translate-x-1/2 bottom-4 w-[min(420px,calc(100%-32px))] card !animate-none p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted">Step {i + 1} of {steps.length}</div>
        <button className="icon-btn !w-8 !h-8" onClick={onClose} aria-label="Close tour"><X size={15} /></button>
      </div>
      <h2 className="font-semibold text-lg mt-1">{step.title}</h2>
      <p className="text-sm text-muted mt-1 leading-relaxed">{step.text}</p>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1">{steps.map((_, j) => <span key={j} className={`h-1.5 rounded-full transition-all ${j === i ? 'w-5 bg-accent-fill' : 'w-1.5 bg-active'}`} />)}</div>
        <div className="flex gap-2">
          {i > 0 && <button className="btn btn-ghost !py-2" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn btn-primary !py-2" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? 'Got it' : 'Next'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Small ⓘ that explains a number in plain words (hover, focus or tap). */
export function Info({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group align-middle" tabIndex={0} aria-label={text}>
      <InfoIcon size={13} className="text-muted cursor-help" aria-hidden />
      <span role="tooltip" className="pointer-events-none absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-60 rounded-lg bg-[#111827] text-white text-xs font-normal leading-snug p-2.5 shadow-xl opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity normal-case tracking-normal">{text}</span>
    </span>
  )
}

/** Big plain number with a tooltip. */
export function BigNum({ label, value, tip, sub, tone }: { label: string; value: ReactNode; tip: string; sub?: ReactNode; tone?: 'ok' | 'warn' | 'crit' }) {
  const c = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'crit' ? 'text-crit' : ''
  return (
    <div className="rounded-xl bg-bg-2 border border-line p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted">{label}<Info text={tip} /></div>
      <div className={`mt-0.5 text-2xl font-semibold tracking-[-0.03em] tnum ${c}`}><Num v={value} /></div>
      {sub && <div className="text-[11px] text-muted leading-snug">{sub}</div>}
    </div>
  )
}

/** The plain "What this means" sentence under the results. */
export const Meaning = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm leading-relaxed"><b>What this means: </b>{children}</div>
)

export function ToolPage({ title, lead, tour, controls, map, results, below, intro }: {
  title: string; lead: ReactNode; tour: TourStep[]; controls: ReactNode; map: ReactNode; results: ReactNode; below?: ReactNode; intro?: ReactNode
}) {
  const [touring, setTouring] = useState(false)
  return (
    <Container className="space-y-4 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <h1 className="rise text-[26px] sm:text-[32px] leading-tight font-semibold tracking-[-0.035em]">{title}</h1>
          <p className="rise mt-1.5 text-sm sm:text-[15px] text-muted leading-relaxed">{lead}</p>
        </div>
        <button className="btn btn-ghost shrink-0" onClick={() => setTouring(true)}><CircleHelp size={16} />How to use</button>
      </header>
      {intro}
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_340px] items-start">
        <aside data-tour="controls" className="card p-4 space-y-4 min-w-0 lg:sticky lg:top-20">{controls}</aside>
        <div data-tour="map" className="min-w-0">{map}</div>
        <section data-tour="results" className="space-y-3 min-w-0" aria-label="Results">{results}</section>
      </div>
      {below}
      <Tour steps={tour} open={touring} onClose={() => setTouring(false)} />
    </Container>
  )
}

/** Label above a control in the left panel. */
export const Field = ({ label, tip, children }: { label: string; tip?: string; children: ReactNode }) => (
  <div>
    <div className="flex items-center gap-1.5 text-xs font-medium text-muted mb-1.5">{label}{tip && <Info text={tip} />}</div>
    {children}
  </div>
)
