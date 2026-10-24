import type { ReactNode } from 'react'
import { Bike, Home, Map as MapIcon, PowerOff } from 'lucide-react'
import { Container, PageHeader } from '../../components/ui'

// Small schematic visuals (inline SVG, theme-aware via currentColor / CSS vars).
const HubVisual = () => (
  <svg viewBox="0 0 240 120" className="w-full h-auto" aria-hidden>
    {[[40, 30], [60, 95], [190, 28], [200, 90], [120, 18]].map(([x, y], i) => <g key={i}><line x1={x} y1={y} x2={120} y2={62} stroke="#2563eb" strokeWidth="2" /><circle cx={x} cy={y} r="9" fill="#f97316" /></g>)}
    <circle cx="120" cy="62" r="40" fill="#2563eb" fillOpacity=".1" stroke="#2563eb" strokeDasharray="4 3" />
    <circle cx="120" cy="62" r="11" fill="#2563eb" stroke="white" strokeWidth="3" />
    <circle cx="20" cy="70" r="5" fill="#16a34a" /><circle cx="225" cy="60" r="5" fill="#16a34a" />
  </svg>
)
const PlugsyVisual = () => (
  <svg viewBox="0 0 240 120" className="w-full h-auto" aria-hidden>
    {[[30, 40, '#16a34a'], [70, 80, '#f97316'], [110, 35, '#16a34a'], [150, 85, '#2563eb'], [190, 45, '#94a3b8'], [210, 95, '#16a34a']].map(([x, y, c], i) => (
      <g key={i}><path d={`M${x} ${+y + 10} l-9 -9 a12 12 0 1 1 18 0 z`} fill={c as string} /><circle cx={x} cy={+y - 3} r="4" fill="white" /></g>
    ))}
    <text x="12" y="116" fontSize="10" fill="currentColor" opacity=".7">free · busy · booked · offline</text>
  </svg>
)
const ClosureVisual = () => (
  <svg viewBox="0 0 240 120" className="w-full h-auto" aria-hidden>
    {Array.from({ length: 40 }, (_, i) => { const x = 16 + (i % 10) * 23, y = 16 + Math.floor(i / 10) * 28, lost = x > 120 && y < 80; return <circle key={i} cx={x} cy={y} r="8" fill={lost ? '#9333ea' : '#22c55e'} opacity={lost ? 0.75 : 0.35} /> })}
    <circle cx="170" cy="44" r="8" fill="#94a3b8" stroke="white" strokeWidth="2" /><line x1="164" y1="38" x2="176" y2="50" stroke="white" strokeWidth="2" />
    <circle cx="60" cy="72" r="8" fill="#16a34a" stroke="white" strokeWidth="2" />
  </svg>
)
const TileVisual = () => (
  <svg viewBox="0 0 240 120" className="w-full h-auto" aria-hidden>
    {Array.from({ length: 18 }, (_, i) => { const x = 10 + (i % 6) * 38, y = 8 + Math.floor(i / 6) * 36; const on = [1, 2, 7, 8, 9, 14].includes(i); return <rect key={i} x={x} y={y} width="34" height="32" rx="4" fill={on ? '#cdeac4' : 'none'} stroke="currentColor" strokeOpacity=".25" /> })}
    <rect x="44" y="8" width="110" height="104" rx="6" fill="none" stroke="#f87171" strokeWidth="2.5" />
    <circle cx="70" cy="30" r="6" fill="#22c55e" /><circle cx="105" cy="58" r="9" fill="#22c55e" /><text x="101" y="62" fontSize="9" fill="#052e16">12</text>
  </svg>
)

function Card({ icon, title, visual, what, why, link }: { icon: ReactNode; title: string; visual: ReactNode; what: string; why: string; link: [string, string] }) {
  return (
    <article className="card p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2.5"><span className="grid place-items-center w-9 h-9 rounded-full bg-accent/15 text-accent">{icon}</span><h2 className="font-semibold text-lg">{title}</h2></div>
      <div className="rounded-xl border border-line bg-bg-2 p-3 text-muted">{visual}</div>
      <p className="text-sm"><b>What it is: </b>{what}</p>
      <p className="text-sm text-muted"><b className="text-text">Why it matters: </b>{why}</p>
      <a className="btn btn-ghost justify-center mt-auto" href={link[0]}>{link[1]} →</a>
    </article>
  )
}

export default function Innovations() {
  return (
    <>
      <PageHeader title="Our innovations">Four ideas that go beyond a charger map, each live on the public site.</PageHeader>
      <Container className="grid md:grid-cols-2 gap-4">
        <Card icon={<Bike size={18} />} title="Shared delivery-rider hubs" visual={<HubVisual />} link={['/delivery', 'Open Delivery Hubs']}
          what="One shared charging hub serves several quick-commerce dark stores within 3 km, paid for by fleet operators."
          why="Delivery riders top up 2–3 times a day. Moving them to hubs frees public chargers for everyone else and cuts the distance riders ride to charge." />
        <Card icon={<Home size={18} />} title="Plugsy peer-to-peer charging" visual={<PlugsyVisual />} link={['/plugsy', 'Open Plugsy']}
          what="Home owners list their charger with a price and hours; drivers book a slot, charge and pay per kWh. Live status: free, busy, booked, offline."
          why="India has far more private chargers than public ones. Sharing them adds capacity with no new hardware, and hosts earn from idle chargers." />
        <Card icon={<PowerOff size={18} />} title="What-if and charger-closure planning" visual={<ClosureVisual />} link={['/plan', 'Open Planning Lab']}
          what="Planners add chargers by type (scooter AC, car DC, bus DC) and see people gaining access and cost, or switch chargers off to see who loses access."
          why="Turns a static gap map into a decision tool: test a budget, compare before/after, export the plan as CSV or PDF." />
        <Card icon={<MapIcon size={18} />} title="Google-style tiled map of real chargers" visual={<TileVisual />} link={['/map', 'Open EV map']}
          what="Real stations from OpenStreetMap and Open Charge Map, merged within 50 m, cut into map tiles so only what is on screen loads."
          why="Works on a basic phone anywhere in India, and is honest: each state shows the official count next to how many we have mapped." />
      </Container>
    </>
  )
}
