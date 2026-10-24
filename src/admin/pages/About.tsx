import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Container, PageHeader } from '../../components/ui'
import { TEAM } from '../team'

const LIBS = [
  ['React 19, React Router 7, Vite, TypeScript', 'MIT'], ['Framer Motion, Lucide icons', 'MIT / ISC'], ['Tailwind CSS 4', 'MIT'], ['MapLibre GL JS 6', 'BSD-3'], ['deck.gl 9 (layers, aggregation, MapLibre overlay)', 'MIT'],
  ['react-map-gl 8', 'MIT'], ['Recharts 3', 'MIT'], ['pandas, GeoPandas, Shapely, SciPy, NumPy, rasterio, pypdf, requests', 'BSD / MIT / Apache-2.0'],
  ['OpenFreeMap "liberty" vector tiles', 'OpenFreeMap terms; © OpenMapTiles, © OSM contributors'], ['Inter (self-hosted via Fontsource)', 'OFL'],
]
const DATA = [
  'Press Information Bureau: state-wise public EV charging stations (Ministry of Power inputs, Aug 2025); state-wise registered EVs (VAHAN, 03-Aug-2023)',
  'Lok Sabha Unstarred Questions 1956 and 453 (July 2026): national EV stock (VAHAN) and public chargers (BHEL portal)',
  'OpenStreetMap via Overpass API: charging stations, national highways, substations, fuel stations, malls, attractions, logistics (ODbL)',
  'Census of India 2011 district tables; DataMeet Census-2011 district boundaries (CC BY 2.5 IN)',
  'WorldPop 2020 1 km population grid, UN-adjusted (CC BY 4.0)',
  'Open Charge Map (CC BY 4.0): open export of India POIs, or the API when a key is configured',
]

export default function About() {
  return (
    <>
      <PageHeader title="About ChargeEVSetu">
        ChargeEVSetu ("setu" means bridge) is our submission to the Techfest IIT Bombay EV Infrastructure Challenge 1: mapping and integrating nationwide EV charger
        installations based on vehicle population using VAHAN data. Our goal is to bridge India's EV charging gap with a method any planner can check.
      </PageHeader>
      <Container className="grid lg:grid-cols-2 gap-4">
        <section className="card p-5">
          <h2 className="font-semibold text-lg">Team</h2>
          <p className="text-accent font-semibold mt-1">{TEAM.name}</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm mt-2 [&>dd]:[overflow-wrap:anywhere]">
            <dt className="text-muted">Team ID</dt><dd className="tnum">{TEAM.teamId}</dd>
            <dt className="text-muted">Competition ID</dt><dd className="tnum">{TEAM.competitionId}</dd>
            <dt className="text-muted">Contact</dt><dd><a href={`mailto:${TEAM.contact}`} className="text-accent">{TEAM.contact}</a></dd>
          </dl>
          <ul className="mt-4 grid sm:grid-cols-2 gap-3">
            {TEAM.members.map(([n, role]) => (
              <li key={n} className="rounded-xl border border-line p-3 flex items-center gap-3">
                <Avatar name={n} />
                <div><div className="font-medium text-sm">{n}</div><div className="text-xs text-muted">{role}</div></div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold text-lg">Disclosure of AI tools</h2>
          <p className="text-sm text-muted mt-2 leading-relaxed">
            This platform was built with the help of <b className="text-text">Claude (Anthropic)</b>, an AI coding assistant, used through Claude Code to write the data
            pipeline, the analysis code and the web interface, and to research public data sources. The team reviewed the method, the data
            choices and the results. AI was not used to generate any data values: every number comes from a listed dataset or a documented formula.
            Where real data was unavailable, synthetic placeholders are clearly labelled.
          </p>
          <p className="text-sm text-muted mt-3">Design decisions are logged in <code>DECISIONS.md</code> and data provenance in <code>DATA_SOURCES.md</code> in the repository.</p>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold text-lg">Open-source libraries</h2>
          <table className="tbl mt-2"><tbody>{LIBS.map(([n, l]) => <tr key={n}><td>{n}</td><td className="text-muted text-right">{l}</td></tr>)}</tbody></table>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold text-lg">Datasets</h2>
          <ul className="text-sm text-muted mt-2 space-y-2 list-disc pl-4">{DATA.map((d) => <li key={d}>{d}</li>)}</ul>
          <Link to="/data-sources" className="text-sm text-accent mt-3 inline-block">Full provenance table →</Link>
        </section>
      </Container>
    </>
  )
}

/** Team photo from the private bucket via a short-lived signed URL (admin API); initials if it cannot load. */
function Avatar({ name }: { name: string }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(' ').map((w) => w[0]).join('')
  const key = name.split(' ')[0].toLowerCase()
  const ring = 'w-10 h-10 shrink-0 rounded-full ring-2 ring-accent/40 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.35)]'
  return failed
    ? <span aria-hidden className={`${ring} bg-accent/15 text-accent grid place-items-center font-semibold`}>{initials}</span>
    : <img src={`/api/admin/team-photo?name=${encodeURIComponent(key)}`} alt={`Photo of ${name}`} width={40} height={40} loading="lazy" decoding="async"
        referrerPolicy="no-referrer" className={`${ring} object-cover bg-accent/15`} onError={() => setFailed(true)} />
}
