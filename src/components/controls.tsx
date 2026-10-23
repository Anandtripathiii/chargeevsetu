import type { ReactNode } from 'react'
import { Num, SourceBadge, type SourceType } from './ui'

export const Stat = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="min-w-0"><div className="text-[11px] text-muted truncate">{k}</div><div className="font-semibold text-lg tracking-[-0.02em] tnum"><Num v={v} /></div></div>
)

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] uppercase tracking-[0.12em] text-muted font-medium mb-2.5">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

export function Toggle({ on, set, label, sub, badge, small }: { on: boolean; set: (v: boolean) => void; label: string; sub?: string; badge?: SourceType; small?: boolean }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none">
      <input type="checkbox" className="sr-only peer" checked={on} onChange={(e) => set(e.target.checked)} />
      <span aria-hidden className={`mt-0.5 shrink-0 w-8 h-[18px] rounded-full relative transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${on ? 'bg-accent-fill' : 'bg-active'}`}>
        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-150 ${on ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 flex-wrap ${small ? 'text-xs' : 'text-sm'}`}>{label}{badge && <SourceBadge type={badge} />}</span>
        {sub && <span className="block text-[11px] text-muted mt-0.5 leading-snug">{sub}</span>}
      </span>
    </label>
  )
}

export function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <select className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

export function Slider({ label, value, min, max, step, onChange, fmt: f = String, hint }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string; hint?: string
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs"><span className="text-muted">{label}</span><span className="font-semibold tnum">{f(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5" />
      {hint && <span className="block text-[11px] text-muted leading-snug">{hint}</span>}
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap max-w-full rounded-full border border-line p-1 bg-bg-2" role="group">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${value === v ? 'bg-accent-fill text-[#0b0b0c] font-semibold' : 'text-muted hover:text-text'}`}>{l}</button>
      ))}
    </div>
  )
}
