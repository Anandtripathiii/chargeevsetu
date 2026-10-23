import { Link } from 'react-router-dom'
import { Container, PageHeader, PageSkeleton, SourceBadge } from '../../components/ui'
import { useData, type Forecast, type Summary } from '../../lib/data'
import { fmt, pct } from '../../lib/format'
import { DEFAULT_WEIGHTS, GAP_KEYS, GAP_LABELS, SITE_WEIGHTS } from '../../lib/model'

const FLOW = [
  ['Fetch', 'OSM Overpass · PIB / Lok Sabha PDFs · Census 2011 · WorldPop · DataMeet boundaries · (OCM, VAHAN exports)', 'data/raw/'],
  ['Clean', 'Parse PDFs, normalise 36 state names, split Telangana & Ladakh, simplify geometry, checksum totals', 'data/processed/'],
  ['Merge', 'De-duplicate chargers (50 m + operator/name), assign to districts, scale official totals to 2026', 'pipeline/build.py'],
  ['Analyse', 'Indicators, coverage, highway gaps, Gap Score, forecasts, candidate cells', 'pipeline/analysis.py'],
  ['Publish', 'Static JSON / GeoJSON, then the browser mirrors the model for live sliders', 'public/data/ · src/lib/model.ts'],
]

export default function Methodology() {
  const { data: s } = useData<Summary>('summary.json')
  const { data: f } = useData<Forecast>('forecast.json')
  if (!s || !f) return <PageSkeleton />
  const tot = GAP_KEYS.reduce((a, k) => a + DEFAULT_WEIGHTS[k], 0)

  return (
    <>
      <PageHeader title="A transparent, defensible method">
        Every number on this site comes from a formula on this page, applied to a dataset on the <Link to="/data-sources" className="text-accent">Data Sources</Link> page.
        All formulas live in one Python module (<code>pipeline/analysis.py</code>), mirrored line for line in the browser (<code>src/lib/model.ts</code>).
        An automated self-check confirms both give the same Gap Score for all {s.districts} districts.
      </PageHeader>
      <Container>
        <div className="card p-5 overflow-x-auto">
          <h2 className="font-semibold mb-4">Data pipeline</h2>
          <ol className="flex items-stretch gap-2 min-w-[880px]">
            {FLOW.map(([t, d, p], i) => (
              <li key={t} className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-full rounded-xl border border-line bg-bg-2 p-3">
                  <div className="text-xs text-accent font-semibold tnum">0{i + 1}</div>
                  <div className="font-semibold">{t}</div>
                  <p className="text-xs text-muted mt-1 leading-relaxed">{d}</p>
                  <code className="text-[10px] text-muted block mt-2">{p}</code>
                </div>
                {i < FLOW.length - 1 && <svg width="16" height="16" viewBox="0 0 24 24" className="text-accent shrink-0" aria-hidden><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none" /></svg>}
              </li>
            ))}
          </ol>
        </div>
      </Container>

      <Container className="prose-ev"><div className="max-w-4xl">
        <h2>1. Integrating the data</h2>
        <p><strong>Chargers.</strong> Public charger points come from OpenStreetMap (and Open Charge Map when an API key is set). Two records are the same charger when they are within 50 m and either share an operator, have an unknown operator, or have similar names (string similarity &gt; 0.5). The merged record keeps both sources.</p>
        <span className="formula">{`duplicate(a, b) = distance(a, b) ≤ 50 m  AND  (operatorₐ = operator_b  OR  unknown  OR  similarity(nameₐ, name_b) > 0.5)`}</span>
        <p><strong>Official totals.</strong> The Ministry of Power's state split (29,277 stations, Aug 2025) is scaled to the latest national total from the BHEL portal ({fmt(s.public_chargers)}, Mar 2026). VAHAN's state EV stock (03-Aug-2023) is scaled to the national stock of {fmt(s.ev_stock)} (Jul 2026). Telangana, missing from the 2023 table, uses the per-person EV rate of its neighbouring states.</p>
        <span className="formula">{`EVs_state,2026      = EVs_state,2023 / Σ EVs_2023 × EVs_India,2026
Chargers_state,2026 = Chargers_state,2025 / Σ Chargers_2025 × Chargers_India,2026`}</span>
        <p><strong>District split</strong> (marked Estimated). EVs follow vehicle-owning households from Census 2011, tilted towards cities. Chargers follow urban population, because public chargers cluster in cities.</p>
        <span className="formula">{`w_EV(d)      = (households with 2-wheeler + 2 × households with car)ᵈ × (0.5 + urban shareᵈ)
w_charger(d) = (population × urban share)ᵈ ^ 1.2
EVs_d = EVs_state × w_EV(d) / Σ w_EV       Chargers_d = max(mapped_d, Chargers_state × w_charger(d) / Σ w_charger)`}</span>
        <p><strong>Modelled locations</strong> (marked Synthetic). Only {pct(s.mapped_share)} of official chargers appear in OSM. To measure distances against the full official count, each district's missing chargers are placed in WorldPop 1 km cells with probability ∝ population<sup>1.5</sup> (fixed random seed). The map lets you switch these off.</p>

        <h2>2. Supply and demand indicators</h2>
        <span className="formula">{`EVs per charger         = EVs / chargers
Chargers per lakh people = chargers / population × 100,000
Chargers per 100 km NH   = chargers / NH km × 100
Charger density          = chargers / area km² × 100`}</span>

        <h2>3. Coverage (Ministry of Power guidelines, 2024)</h2>
        <p><strong>City coverage:</strong> the guideline asks for at least one charger in every 3 km × 3 km grid. We measure the share of urban residents (WorldPop cells with ≥ {fmt(s.urban_density)} people per km²) who live within {s.city_radius_km} km of a charger.</p>
        <span className="formula">{`Urban coverage = Σ pop(urban cells with nearest charger ≤ 3 km) / Σ pop(urban cells)`}</span>
        <p><strong>Highway gaps:</strong> chargers are required every {s.highway_spacing_km} km along highways. Each national highway is split into ~5 km segments; a segment is a <b>gap</b> when its nearest charger is more than 12.5 km away, meaning a driver would go more than 25 km without one.</p>

        <h2 id="gap">4. Gap Score (0–100)</h2>
        <p>Five factors, each min–max scaled across all districts. Heavy-tailed factors are log-scaled first, so a few megacities don't flatten everyone else. The weighted sum is rescaled so 0 is the best-served district and 100 the most underserved. "Critical" means the top 10% (score ≥ {fmt(s.critical_threshold, 1)}).</p>
        <span className="formula">{`normᵢ(d) = (xᵢ(d) − minᵢ) / (maxᵢ − minᵢ)          (x = log(1 + value) for log factors)
raw(d)   = Σ wᵢ · normᵢ(d) / Σ wᵢ
Gap(d)   = 100 × (raw(d) − min raw) / (max raw − min raw)`}</span>
        <div className="overflow-x-auto not-prose">
          <table className="tbl my-3">
            <thead><tr><th>Factor</th><th>Meaning</th><th>Scale</th><th className="text-right">Default weight</th></tr></thead>
            <tbody>{GAP_KEYS.map((k) => (
              <tr key={k}><td className="font-medium">{GAP_LABELS[k][0]}</td><td className="text-muted">{GAP_LABELS[k][1]}</td><td>{s.gap_factors[k]?.transform === 'log' ? 'log' : 'linear'}</td><td className="text-right tnum">{pct((DEFAULT_WEIGHTS[k] / tot) * 100, 0)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p><strong>Sensitivity.</strong> Raising or lowering any single weight by 50% keeps the district ranking's Spearman correlation at or above {pct(Math.min(...Object.entries(s.sensitivity).filter(([k]) => !k.includes('top50')).map(([, v]) => v)) * 100, 0)}, and the top-50 list overlaps by at least {pct(Math.min(...Object.entries(s.sensitivity).filter(([k]) => k.includes('top50')).map(([, v]) => v)) * 100, 0)}. The ranking is robust to reasonable disagreement about weights.</p>

        <h2>5. Forecasting EV stock</h2>
        <p>The annual stock series is rebuilt from the official July 2026 stock minus each year's VAHAN registrations. Two models are fitted to 2018–2025:</p>
        <span className="formula">{`CAGR:      S(t) = a · (1 + g)^t                          g = ${pct(f.fits.cagr.g * 100, 1)}/yr   R² = ${f.fits.cagr.r2.toFixed(3)}   MAPE = ${fmt(f.fits.cagr.mape, 1)}%
Logistic:  S(t) = K / (1 + e^(−r(t − t₀)))               R² = ${f.fits.logistic.r2.toFixed(3)}   MAPE = ${fmt(f.fits.logistic.mape, 1)}%`}</span>
        <p>Back-test (fit 2018–22, predict 2023–25): CAGR {fmt(f.backtest_mape.cagr, 1)}% error, logistic {fmt(f.backtest_mape.logistic, 1)}%. India is still on the early, near-exponential part of the S-curve, so the data cannot yet pin down the saturation level K. Pure trend fits overshoot, so planning uses <b>policy scenarios</b> anchored on the national ambition of 30% EV sales by 2030:</p>
        <span className="formula">{`Stock(y+1) = Stock(y) × (1 − ${f.retirement}) + TotalSales(y) × EVshare(y)        TotalSales grows ${pct(f.sales_growth * 100, 0)}/yr
EV share of sales:  Low 8% → 18% (2030) → 30% (2035) · Base 8% → 30% → 50% · High 8% → 40% → 70%`}</span>

        <h2>6. Chargers needed</h2>
        <p>Target EVs per public charger by vehicle type: 4W {f.target_ratio['4W']} (EU AFID 2014/94 guidance and the IEA Global EV Outlook global average), 2W {f.target_ratio['2W']}, 3W {f.target_ratio['3W']}, bus {f.target_ratio.Bus}, goods {f.target_ratio.Goods}. These reflect that two- and three-wheelers mostly charge at home or depots, or swap batteries. Blending with the vehicle mix gives a default of <b>{fmt(f.blended_ratio, 1)} EVs per charger</b>. All of these can be changed on the planning page.</p>
        <span className="formula">{`blended ratio = 1 / Σ_type (mix_type / ratio_type)
required      = Σ_type EVs × mix_type / ratio_type        additional = max(0, required − existing)
DC fast       = required for 4W + bus + goods`}</span>

        <h2>7. Site selection: capacity-aware greedy optimisation</h2>
        <p>The region is divided into 2 km cells (WorldPop). Each cell knows its residents, EVs, chargers within 3 km, candidate host sites (fuel stations, malls, logistics), and distance to the nearest substation and national highway. A cell's demand is shared with the chargers around it:</p>
        <span className="formula">{`served share s_j = min(1, ratio × C_j / E_j)       C_j = chargers within 3 km, E_j = EVs within 3 km
gain(k) = Σ_(j within 3 km of k) e_j × (s_j after a 10-charger hub at k − s_j before) × (0.5 + score_k)
score_k = ${SITE_WEIGHTS.demand} × demand + ${SITE_WEIGHTS.supply_gap} × supply gap + ${SITE_WEIGHTS.grid} × grid readiness + ${SITE_WEIGHTS.highway} × highway proximity`}</span>
        <p>Each round picks the cell with the largest gain and updates C. Greedy selection is the standard method for coverage problems: for pure coverage it is provably within 1 − 1/e (≈ 63%) of optimal, and in practice it is close to optimal while running in milliseconds in the browser. For each site we report the top three reasons and the before/after share of EV demand met and residents within 3 km.</p>

        <h2>8. Assumptions and limitations</h2>
        <ul>
          <li>District EVs and chargers are <b>estimated splits</b> of official state totals. The VAHAN dashboard export (instructions in <code>data/raw/vahan/README.md</code>) replaces them with exact figures.</li>
          <li>Boundaries are the 2011 Census districts (640). Newer districts sit inside their parent district.</li>
          <li>2026 population = Census 2011 × UN national growth (×1.21), applied uniformly.</li>
          <li>Modelled charger locations are statistical placeholders, used only so that distance metrics reflect the official count.</li>
          <li>OSM national highways with a ref tag cover part of the ~1.46 lakh km network. Gap lengths are lower bounds on the real figure.</li>
          <li>Substations are a proxy for grid readiness. DISCOM spare capacity is not public.</li>
          <li>State forecasts assume each state keeps its current share of national EV stock.</li>
        </ul>
        <p className="flex items-center gap-2 flex-wrap">Badges used across the site: <SourceBadge type="real" /> published by a government source or OSM · <SourceBadge type="derived" /> computed from real data with stated assumptions · <SourceBadge type="synthetic" /> statistical placeholder.</p>
      </div></Container>
    </>
  )
}
