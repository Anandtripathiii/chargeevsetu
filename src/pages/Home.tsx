import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Bike, Building2, Car, Crosshair, FlaskConical, Landmark, Map as MapIcon, PlugZap, Search, TrendingUp, Users, Zap } from 'lucide-react'
import { Container, Kpi } from '../components/ui'
import { useData, type Summary } from '../lib/data'
import { compact, fmt } from '../lib/format'

const FEATURES = [
  ['/map', MapIcon, 'Charging map', 'Find chargers near you, filter by plug and power, read reviews and get directions.'],
  ['/gaps', Crosshair, 'Gap analysis', 'See which states and districts have too few chargers for their EVs, and why.'],
  ['/plan', FlaskConical, 'Planning lab', 'Find the best spots for new chargers and test “what if” changes to the network.'],
  ['/forecast', TrendingUp, 'Forecast', 'How many EVs and charging points India may need in 2027, 2030 and 2035.'],
  ['/delivery', Bike, 'Delivery hubs', 'Shared charging for delivery riders near busy store areas.'],
  ['/plugsy', PlugZap, 'Plugsy', 'Book a neighbour’s home charger, or share yours and earn.'],
] as const

const WHO = [
  [Car, 'EV owners', 'Find a working charger quickly and know what to expect before you arrive.'],
  [Users, 'Researchers', 'District-level charging gaps and demand estimates in one place.'],
  [Landmark, 'Government planners', 'Spot underserved districts and highways, and compare options.'],
  [Building2, 'Charging operators', 'Pick high-demand sites and size new stations with confidence.'],
] as const

const up = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export default function Home() {
  const { data: s } = useData<Summary>('summary.json')
  return (
    <Container className="space-y-16">
      <section className="card relative overflow-hidden">
        <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(50% 70% at 85% 20%, color-mix(in srgb, var(--accent-fill) 16%, transparent), transparent 70%), radial-gradient(40% 60% at 10% 100%, rgba(34,197,94,.10), transparent 70%)' }} />
        <motion.div className="relative p-6 sm:p-10 lg:p-14 max-w-3xl" initial="hidden" animate="show" transition={{ staggerChildren: 0.08 }}>
          <motion.h1 variants={up} className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-[-0.04em]">
            Every EV charger in India, <span className="text-accent">one map away.</span>
          </motion.h1>
          <motion.p variants={up} className="mt-5 text-lg text-muted leading-relaxed">
            ChargeEVSetu helps you find public chargers, see where charging is missing, plan new stations and share home chargers with your neighbours.
          </motion.p>
          <motion.div variants={up} className="mt-8 flex flex-wrap gap-3">
            <Link to="/map" className="btn btn-primary !text-base !px-6 !py-3"><Zap size={18} />Open EV charging map</Link>
            <Link to="/plugsy" className="btn btn-ghost !py-3"><PlugZap size={16} />Plugsy home chargers</Link>
          </motion.div>
          <motion.form variants={up} action="map" className="mt-6 flex items-center gap-2 max-w-md" role="search">
            <label className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" className="input !pl-9 !py-2.5" placeholder="Search a city or area, e.g. Pune" aria-label="Search a city or area" />
            </label>
          </motion.form>
        </motion.div>
      </section>

      <section>
        <h2 className="text-2xl sm:text-3xl font-semibold">The problem</h2>
        <p className="mt-2 text-muted max-w-2xl">EVs are growing fast, but chargers are uneven and information about them is scattered across many apps.</p>
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="EVs on Indian roads" value={s ? compact(s.ev_stock) : '…'} sub={`VAHAN registrations, as of ${s?.ev_stock_as_of ?? '…'}`} />
          <Kpi label="Public charging points" value={s ? fmt(s.public_chargers) : '…'} sub={`Ministry of Power, Lok Sabha reply, as of ${s?.public_chargers_as_of ?? '…'}`} />
          <Kpi label="EVs per public charger" value={s ? fmt(s.evs_per_charger) : '…'} sub="Many places have far more" accent="warn" />
          <Kpi label="Share of new vehicles that are electric" value={s ? `${s.ev_penetration_fy26}%` : '…'} sub={s ? `Up from ${s.ev_penetration_fy20}% in FY20 (VAHAN)` : ''} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl sm:text-3xl font-semibold">What you can do here</h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(([to, Icon, t, d]) => (
            <Link key={to} to={to} className="card p-5 group hover:border-accent/40 transition-colors">
              <span className="grid place-items-center w-10 h-10 rounded-xl bg-accent/10 text-accent"><Icon size={19} /></span>
              <h3 className="mt-4 font-semibold flex items-center gap-2">{t}<ArrowRight size={15} className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition" /></h3>
              <p className="mt-1 text-sm text-muted leading-relaxed">{d}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl sm:text-3xl font-semibold">Who it helps</h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {WHO.map(([Icon, t, d]) => (
            <div key={t} className="card p-5">
              <Icon size={20} className="text-ok" />
              <h3 className="mt-3 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </Container>
  )
}
