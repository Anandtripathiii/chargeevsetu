import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PickingInfo } from '@deck.gl/core'
import MapBase from '../components/LazyMap'
import type { Kit } from '../components/MapBase'
import { Legend } from '../components/mapUtil'
import { Slider } from '../components/controls'
import { CardTitle, Container, PageHeader, Skeleton, SourceBadge } from '../components/ui'
import { useData, type DistrictRow, type Highways, type StateRow, type Summary } from '../lib/data'
import { useTheme } from '../lib/theme'
import { css, GAP, gradient, ramp } from '../lib/colors'
import { compact, fmt } from '../lib/format'
import { DEFAULT_WEIGHTS, GAP_KEYS, GAP_LABELS, gapScores, type GapKey } from '../lib/model'
import { downloadCsv } from '../lib/csv'
import { tooltipBox } from '../lib/tooltip'

type Seg = Highways['segments'][number]

export default function GapAnalysis() {
  const [theme] = useTheme()
  const { data: districts } = useData<DistrictRow[]>('districts.json')
  const { data: states } = useData<StateRow[]>('states.json')
  const { data: summary } = useData<Summary>('summary.json')
  const { data: corridors } = useData<{ ref: string; km: number; gap: number }[]>('corridors.json')
  const [mapOn, setMapOn] = useState(false)
  const { data: hw } = useData<Highways>(mapOn ? 'highway-gaps.json' : null)
  const [w, setW] = useState<Record<GapKey, number>>(DEFAULT_WEIGHTS)
  const [state, setState] = useState('')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(25)

  // live recompute of every district's score with the chosen weights
  const scored = useMemo(() => {
    if (!districts) return null
    const sc = gapScores(districts, w)
    const rows = districts.map((d, i) => ({ ...d, score: sc[i] }))
    const order = [...rows].sort((a, b) => b.score - a.score)
    order.forEach((r, i) => { (r as typeof r & { liveRank: number }).liveRank = i + 1 })
    return order as (typeof rows[number] & { liveRank: number })[]
  }, [districts, w])

  const critical = scored && summary ? scored.filter((d) => d.score >= summary.critical_threshold).length : null
  const view = useMemo(() => (scored ?? []).filter((d) =>
    (!state || d.state === state) && (!q || d.name.toLowerCase().includes(q.toLowerCase()))), [scored, state, q])

  const sumW = GAP_KEYS.reduce((s, k) => s + w[k], 0) || 1
  const changed = GAP_KEYS.some((k) => Math.abs(w[k] - DEFAULT_WEIGHTS[k]) > 1e-9)

  const layers = ({ PathLayer, ScatterplotLayer }: Kit) => [
    hw && new PathLayer<Seg>({
      id: 'gap-hw', data: hw.segments, getPath: (s) => s[4], getColor: [239, 75, 91, 200], getWidth: 2, widthUnits: 'pixels',
    }),
    scored && new ScatterplotLayer({
      id: 'dist', data: scored, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthMinPixels: 0.5,
      getPosition: (d: DistrictRow) => [d.lon, d.lat],
      getRadius: (d: DistrictRow) => 3 + Math.sqrt(d.evs) / 45,
      getFillColor: (d: { score: number }) => [...ramp(GAP, d.score / 100), 215] as [number, number, number, number],
      getLineColor: theme === 'dark' ? [7, 11, 15, 200] : [255, 255, 255, 220],
      updateTriggers: { getFillColor: w, getLineColor: theme },
      transitions: { getFillColor: 200 },
    }),
  ].filter(Boolean)

  return (
    <>
      <PageHeader eyebrow="Gap Analysis" title="Which districts need chargers most?">
        Every district gets a <b className="text-text">Gap Score from 0 to 100</b> built from five factors. Each factor is scaled 0–1 across all
        640 districts and weighted. Move the sliders to apply your own priorities; the ranking and map update instantly.
      </PageHeader>

      <Container className="grid lg:grid-cols-[340px_1fr] gap-4">
        <div className="card p-5 space-y-5 h-fit lg:sticky lg:top-20">
          <CardTitle right={changed && <button className="text-xs text-accent" onClick={() => setW(DEFAULT_WEIGHTS)}>Reset</button>}>Factor weights</CardTitle>
          {GAP_KEYS.map((k) => (
            <Slider key={k} label={GAP_LABELS[k][0]} value={w[k]} min={0} max={0.6} step={0.05} onChange={(v) => setW({ ...w, [k]: v })}
              fmt={() => `${Math.round((w[k] / sumW) * 100)}%`} hint={GAP_LABELS[k][1]} />
          ))}
          <div className="rounded-lg bg-bg-2 border border-line p-3 text-xs text-muted leading-relaxed">
            <span className="formula !m-0 !p-2 !text-[11px]">Gap = rescale to 0–100 of Σ wᵢ · normᵢ</span>
            <p className="mt-2">EV density, charger stress and urban population use a log scale so megacities don't flatten the rest. <Link to="/methodology#gap" className="text-accent">Details</Link></p>
          </div>
        </div>

        <div className="space-y-4 min-w-0">
          <div className="card overflow-hidden">
            <div className="relative h-[440px]">
              <MapBase basemap={theme} onReady={() => setMapOn(true)} deck={(_, k) => ({ layers: layers(k), getTooltip: ({ object, layer }: PickingInfo) => {
                if (!object || layer?.id !== 'dist') return null
                const d = object as DistrictRow & { score: number; liveRank: number }
                return tooltipBox(`<b>${d.name}</b>, ${d.state}<br/>Gap Score <b>${fmt(d.score, 1)}</b> · rank ${d.liveRank}<br/>EVs per charger ${fmt(d.evs_per_charger)} · avg. ${fmt(d.dist_km, 1)} km to a charger`)
              } })} />
              <div className="absolute left-3 bottom-3 card p-3 w-64 no-print">
                <Legend title="Gap Score · circle size = EVs" stops={gradient(GAP)} lo="0 · best served" hi="100 · most underserved" badge={<SourceBadge type="derived" />} />
                <div className="flex items-center gap-2 text-[11px] text-muted mt-2"><span className="w-5 h-0.5 bg-crit inline-block" /> NH stretch with no charger for 25 km</div>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="card p-4"><div className="text-xs text-muted">Critical districts (score ≥ {summary ? fmt(summary.critical_threshold, 1) : '…'})</div><div className="text-3xl font-display font-bold text-crit tnum mt-1">{critical ?? '…'}</div></div>
            <div className="card p-4"><div className="text-xs text-muted">States with ≥ 1 critical district</div><div className="text-3xl font-display font-bold tnum mt-1">{scored && summary ? new Set(scored.filter((d) => d.score >= summary.critical_threshold).map((d) => d.state)).size : '…'}</div></div>
            <div className="card p-4"><div className="text-xs text-muted">Ranking stability (±50% on any weight)</div><div className="text-3xl font-display font-bold tnum mt-1">{summary ? `≥ ${fmt(Math.min(...Object.entries(summary.sensitivity).filter(([k]) => !k.includes('top50')).map(([, v]) => v)) * 100, 0)}%` : '…'}</div><div className="text-[11px] text-muted">Spearman rank correlation vs. default weights</div></div>
          </div>

          <div className="card p-4">
            <CardTitle right={<button className="btn btn-ghost !py-1.5 !text-xs" onClick={() => downloadCsv('chargeevsetu-gap-ranking.csv', view.map((d) => ({ rank: d.liveRank, district: d.name, state: d.state, gap_score: d.score.toFixed(2), evs_est: d.evs, chargers_est: d.chargers, evs_per_charger: d.evs_per_charger.toFixed(1), avg_km_to_charger: d.dist_km.toFixed(2), urban_share: d.urban_share, nh_km: d.nh_km, weights: GAP_KEYS.map((k) => `${k}=${w[k]}`).join(' ') })))}>Export CSV</button>}>
              Ranked districts
            </CardTitle>
            <div className="flex flex-wrap gap-2 mb-3">
              <input className="input !w-48" placeholder="Search district" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search district" />
              <select className="input !w-56" value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter by state">
                <option value="">All states</option>
                {(states ?? []).map((s) => s.state).sort().map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            {!scored ? <Skeleton className="h-96" /> : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>#</th><th>District</th><th>State</th><th className="text-right">Gap Score</th><th className="text-right">EVs (est.)</th><th className="text-right">EVs / charger</th><th className="text-right">km to charger</th><th>Biggest driver</th></tr></thead>
                  <tbody>
                    {view.slice(0, limit).map((d) => {
                      const top = topFactor(d, scored, w)
                      return (
                        <tr key={d.id}>
                          <td className="text-muted tnum">{d.liveRank}</td>
                          <td className="font-medium">{d.name}</td>
                          <td className="text-muted">{d.state}</td>
                          <td className="text-right"><span className="inline-flex items-center gap-2 tnum font-semibold"><span className="w-12 h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full" style={{ width: `${d.score}%`, background: css(ramp(GAP, d.score / 100)) }} /></span>{fmt(d.score, 1)}</span></td>
                          <td className="text-right tnum">{compact(d.evs)}</td>
                          <td className="text-right tnum">{fmt(d.evs_per_charger)}</td>
                          <td className="text-right tnum">{fmt(d.dist_km, 1)}</td>
                          <td className="text-muted text-xs">{GAP_LABELS[top][0]}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {view.length > limit && <button className="btn btn-ghost mt-3 !text-xs" onClick={() => setLimit(limit + 50)}>Show more ({view.length - limit} left)</button>}
              </div>
            )}
          </div>

          <div className="card p-4">
            <CardTitle right={<SourceBadge type="real" title="OSM highway geometry; gaps computed against official-total charger layer" />}>Highway corridors with the longest gaps</CardTitle>
            {!corridors ? <Skeleton className="h-40" /> : corridors.length === 0 ? (
              <p className="text-sm text-muted">The highway layer is still being processed by the data pipeline.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Highway</th><th className="text-right">Mapped length (km)</th><th className="text-right">Gap length (km)</th><th>Share without a charger every 25 km</th></tr></thead>
                  <tbody>
                    {corridors.map((c) => (
                      <tr key={c.ref}><td className="font-medium">{c.ref}</td><td className="text-right tnum">{fmt(c.km)}</td><td className="text-right tnum text-crit">{fmt(c.gap)}</td>
                        <td><span className="inline-flex items-center gap-2 text-xs tnum"><span className="w-28 h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full bg-crit" style={{ width: `${(c.gap / c.km) * 100}%` }} /></span>{fmt((c.gap / c.km) * 100)}%</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Container>
    </>
  )
}

/** Which weighted factor contributes most to this district's score. */
function topFactor(d: DistrictRow, all: DistrictRow[], w: Record<GapKey, number>): GapKey {
  let best: GapKey = 'evs_per_charger', bv = -1
  for (const k of GAP_KEYS) {
    const tf = (x: number) => (k === 'dist_km' || k === 'corridor' ? x : Math.log1p(Math.max(0, x)))
    const vals = all.map((r) => tf(r[k]))
    const lo = Math.min(...vals), hi = Math.max(...vals)
    const v = hi - lo < 1e-12 ? 0 : ((tf(d[k]) - lo) / (hi - lo)) * w[k]
    if (v > bv) { bv = v; best = k }
  }
  return best
}
