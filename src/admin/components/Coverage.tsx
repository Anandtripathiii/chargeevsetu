import { useEffect, useState } from 'react'
import { CardTitle, SourceBadge } from '../../components/ui'
import { tileIndex, type TileIndex } from '../../lib/stations'
import { fmt } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'

const OCM_EXPORT = '2026-04-22' // date of the Open Charge Map open export merged into the tiles

/** Per-state data quality: real mapped stations (OSM + OCM, de-duplicated) vs the official count. */
export default function Coverage() {
  const [idx, setIdx] = useState<TileIndex>()
  useEffect(() => { tileIndex().then(setIdx, () => {}) }, [])
  if (!idx?.states) return null
  const rows = Object.entries(idx.states).map(([state, r]) => ({ state, ...r, share: r.official ? (100 * r.mapped) / r.official : 0 })).sort((a, b) => b.official - a.official)
  const tot = rows.reduce((a, r) => ({ mapped: a.mapped + r.mapped, official: a.official + r.official }), { mapped: 0, official: 0 })
  return (
    <div className="card p-4">
      <CardTitle right={<button className="btn text-xs" onClick={() => downloadCsv('chargeevsetu-data-quality.csv', rows)}>Download CSV</button>}>
        Data quality by state: real mapped stations vs official count
      </CardTitle>
      <p className="text-sm text-muted mb-3">
        <b className="text-text">{fmt(idx.count)}</b> real stations mapped ({fmt(idx.sources.osm)} with OpenStreetMap, {fmt(idx.sources.ocm)} with Open Charge Map, merged within 50 m)
        against <b className="text-text">{fmt(tot.official)}</b> official public stations ({fmt((100 * tot.mapped) / tot.official, 0)}%). Map tiles built {idx.built}.
      </p>
      <div className="overflow-x-auto max-h-[480px]" data-lenis-prevent>
        <table className="tbl">
          <thead><tr><th>State / UT</th><th className="text-right">Mapped (real)</th><th className="text-right">Official (MoP)</th><th>Coverage</th><th className="text-right">OSM</th><th className="text-right">OCM</th><th>Last updated</th><th>Type</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.state}>
              <td className="font-medium">{r.state}</td>
              <td className="text-right tnum">{fmt(r.mapped)}</td>
              <td className="text-right tnum">{fmt(r.official)}</td>
              <td><div className="flex items-center gap-2"><span className="w-20 h-1.5 rounded-full bg-active overflow-hidden"><span className="block h-full bg-ok" style={{ width: `${Math.min(100, r.share)}%` }} /></span><span className="tnum text-xs">{fmt(r.share, 0)}%</span></div></td>
              <td className="text-right tnum">{fmt(r.osm)}</td>
              <td className="text-right tnum">{fmt(r.ocm)}</td>
              <td className="text-xs text-muted whitespace-nowrap">OSM {idx.built} · OCM {OCM_EXPORT}</td>
              <td><SourceBadge type="real" title="Station locations are real; the official count is a Ministry of Power total" /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-2">Real = a published location from an open source. EV counts, district charger counts and planning cells elsewhere in the app are estimates (badged “Estimated”). Private operator apps are not scraped.</p>
    </div>
  )
}
