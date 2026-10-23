import { Container, PageHeader } from '../components/ui'

const PHASES = [
  ['Now', 'Prototype (this site)', ['Open data from OSM, PIB, Lok Sabha replies, Census, WorldPop', 'Transparent Gap Score with live weights', 'Forecasts, charger sizing and greedy site selection', 'Static site: free hosting, loads in seconds']],
  ['0–3 months', 'Official data hookups', ['Automatic monthly VAHAN pull (state × RTO × vehicle class)', 'BHEL / BEE national charger registry feed, replacing modelled locations', 'Live operator APIs (OCPI) from Tata Power, Statiq, ChargeZone, Jio-bp', 'Open Charge Map merge enabled by default']],
  ['3–6 months', 'Real-time and grid-aware', ['Real-time charger availability and uptime (OCPI status)', 'DISCOM feeder and transformer spare-capacity layer', 'Charger utilisation analytics to find overloaded stations', 'District boundaries updated to the current ~780 districts']],
  ['6–12 months', 'Platform for governments', ['State-government login: private planning workspaces and approvals', 'Tender support: export site packages with land and grid details', 'All vehicle categories incl. e-trucks and e-buses depot planning', 'Battery-swap network planning for 2W/3W fleets']],
  ['12 months+', 'National open infrastructure', ['Public open API (REST + vector tiles) for researchers and operators', 'Scenario sharing between MHI, ICAT, states and cities', 'Integration with PM E-DRIVE disbursement tracking', 'Multi-lingual UI for district officials']],
] as const

export default function Roadmap() {
  return (
    <>
      <PageHeader title="From prototype to a national platform">
        The pipeline and the browser model are deliberately simple and modular. Each data source is one script, every metric is one formula,
        and outputs are static files. Swapping an estimate for an official feed is a local change, not a rebuild.
      </PageHeader>
      <Container>
        <ol className="relative border-l-2 border-line ml-3 space-y-8">
          {PHASES.map(([when, title, items], i) => (
            <li key={when} className="pl-8 relative rise">
              <span className={`absolute -left-[11px] top-1 w-5 h-5 rounded-full border-4 border-bg ${i === 0 ? 'bg-accent-fill shadow-[0_0_16px_var(--accent-fill)]' : 'bg-active'}`} />
              <div className="text-xs font-semibold text-accent uppercase tracking-wider">{when}</div>
              <h2 className="text-xl font-semibold mt-0.5">{title}</h2>
              <ul className="grid sm:grid-cols-2 gap-2 mt-3">
                {items.map((t) => <li key={t} className="card px-4 py-3 text-sm">{t}</li>)}
              </ul>
            </li>
          ))}
        </ol>
        <div className="card p-5 mt-10 grid md:grid-cols-3 gap-6 text-sm">
          <div><h3 className="font-semibold">Scales technically</h3><p className="text-muted mt-1">Pre-computed tiles and JSON on a CDN serve any number of users. WebGL rendering handles 50k+ points at 60 fps. Heavy maths runs once in the pipeline.</p></div>
          <div><h3 className="font-semibold">Scales institutionally</h3><p className="text-muted mt-1">Formulas and weights are visible and adjustable, so each state can apply its own priorities without changing the shared data.</p></div>
          <div><h3 className="font-semibold">Scales economically</h3><p className="text-muted mt-1">Open data plus static hosting costs almost nothing. A paid tier is only needed for real-time feeds and authenticated workspaces.</p></div>
        </div>
      </Container>
    </>
  )
}
