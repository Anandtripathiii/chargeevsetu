import { Link } from 'react-router-dom'
import type { Summary } from '../lib/data'
import { fmt, pct } from '../lib/format'
import { SourceBadge } from './ui'

/** Real mapped chargers vs the official total: the open-data fragmentation problem in one card. */
export function Completeness({ s, link = true }: { s: Summary; link?: boolean }) {
  const share = (s.mapped_chargers / s.public_chargers) * 100
  return (
    <section className="card p-5" aria-labelledby="completeness-title">
      <div className="flex flex-wrap justify-between items-start gap-2">
        <h2 id="completeness-title" className="font-semibold text-lg">Data completeness</h2>
        <SourceBadge type="real" />
      </div>
      <div className="grid sm:grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-4 items-center mt-3">
        <div>
          <p className="text-5xl font-display font-bold tnum text-accent">{pct(share)}</p>
          <p className="text-sm text-muted mt-1"><b className="text-text tnum">{fmt(s.mapped_chargers)}</b> real mapped chargers of <b className="text-text tnum">{fmt(s.public_chargers)}</b> official</p>
        </div>
        <div className="min-w-0">
          <div className="h-3 rounded-full bg-line overflow-hidden" role="img" aria-label={`${pct(share)} of official chargers are in open data`}>
            <div className="h-full bg-accent rounded-full" style={{ width: `${Math.max(share, 0.8)}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-muted mt-1.5 gap-2">
            <span>Open data (OpenStreetMap / Open Charge Map)</span>
            <span className="tnum">Official total, {s.public_chargers_as_of}</span>
          </div>
          <p className="text-sm mt-3 leading-relaxed">
            Open data covers only a small share of India's public chargers. The rest sit in separate operator apps and government portals with no
            open, location-level registry. <b>That fragmentation is the problem ChargeEVSetu solves</b>: it joins official counts, open maps and VAHAN
            vehicle data in one place, and clearly labels every number that has to be estimated.
          </p>
        </div>
      </div>
      {link && <Link to="/data-sources" className="text-sm text-accent mt-3 inline-block">Completeness by state →</Link>}
    </section>
  )
}
