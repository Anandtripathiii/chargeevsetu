import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Slider } from '../../components/controls'
import { CardTitle } from '../../components/ui'
import { useData, type DistrictRow } from '../../lib/data'
import { DEFAULT_WEIGHTS, GAP_KEYS, GAP_LABELS, gapScores, type GapKey } from '../../lib/model'
import { fmt } from '../../lib/format'

/** Gap Score model weights, adjustable, with the district ranking recomputed live. */
export default function GapWeights() {
  const { data: districts } = useData<DistrictRow[]>('districts.json')
  const [w, setW] = useState<Record<GapKey, number>>(DEFAULT_WEIGHTS)
  const top = useMemo(() => {
    if (!districts) return []
    const sc = gapScores(districts, w), base = gapScores(districts, DEFAULT_WEIGHTS)
    const rankBase = new Map([...districts.keys()].sort((a, b) => base[b] - base[a]).map((i, r) => [i, r + 1]))
    return [...districts.keys()].sort((a, b) => sc[b] - sc[a]).slice(0, 12).map((i, r) => ({ d: districts[i], score: sc[i], rank: r + 1, was: rankBase.get(i)! }))
  }, [districts, w])
  const sum = GAP_KEYS.reduce((s, k) => s + w[k], 0) || 1
  return (
    <div className="card p-5">
      <CardTitle right={<button className="text-xs text-accent flex items-center gap-1" onClick={() => setW(DEFAULT_WEIGHTS)}><RotateCcw size={12} />Defaults</button>}>Estimation controls: Gap Score weights (live)</CardTitle>
      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <div className="space-y-4">
          {GAP_KEYS.map((k) => (
            <Slider key={k} label={`${GAP_LABELS[k][0]} · ${fmt((100 * w[k]) / sum)}% of score`} value={w[k]} min={0} max={1} step={0.05}
              onChange={(v) => setW({ ...w, [k]: v })} fmt={(v) => v.toFixed(2)} hint={GAP_LABELS[k][1]} />
          ))}
        </div>
        <div>
          <div className="text-xs text-muted mb-2">Most underserved districts with these weights (rank change vs default)</div>
          <ol className="space-y-1">
            {top.map(({ d, score, rank, was }) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-xs text-muted tnum">{rank}</span>
                <span className="flex-1 min-w-0 truncate">{d.name} <span className="text-muted text-xs">· {d.state}</span></span>
                <span className={`text-xs tnum ${was > rank ? 'text-ok' : was < rank ? 'text-crit' : 'text-muted'}`}>{was === rank ? '=' : was > rank ? `▲${was - rank}` : `▼${rank - was}`}</span>
                <b className="w-8 text-right tnum">{fmt(score)}</b>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
