const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Escape text for HTML (station names, host names … come from open data and users). */
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ENT[c])

const RAW = Symbol('raw')
type Raw = { [RAW]: string }
/** Mark a string built by our own code (already escaped) as safe HTML inside `safeHtml`. */
export const raw = (html: string): Raw => ({ [RAW]: html })
/** Tagged template for tooltip HTML: every interpolated value is escaped unless wrapped in raw(). */
export const safeHtml = (s: TemplateStringsArray, ...v: unknown[]) =>
  s.reduce((out, part, i) => out + part + (i < v.length ? (typeof v[i] === 'object' && v[i] !== null && RAW in (v[i] as object) ? (v[i] as Raw)[RAW] : esc(v[i])) : ''), '')

export const tooltipBox = (html: string) => ({
  html,
  style: {
    background: 'var(--panel-solid)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: '10px',
    padding: '10px 12px', fontSize: '12px', lineHeight: '1.5', maxWidth: '290px', boxShadow: 'var(--shadow)',
  },
})

// self-check: hostile names are neutralised, raw() passes through
if (import.meta.env?.DEV && safeHtml`<b>${'<img src=x onerror=alert(1)>'}</b>${raw('<br/>')}` !== '<b>&lt;img src=x onerror=alert(1)&gt;</b><br/>') throw new Error('tip escaping broken')
