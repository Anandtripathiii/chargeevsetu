import type { ReactNode } from 'react'
import { Container, PageHeader } from '../components/ui'

const Sec = ({ t, children }: { t: string; children: ReactNode }) => (
  <section className="card p-5"><h2 className="font-semibold mb-2">{t}</h2><div className="text-sm text-muted space-y-2 leading-relaxed">{children}</div></section>
)
const UPDATED = '25 October 2026'

export function Privacy() {
  return (
    <>
      <PageHeader title="Privacy policy">In plain words: what we collect, why, and how you stay in control. Last updated {UPDATED}.</PageHeader>
      <Container className="max-w-3xl space-y-3">
        <Sec t="What we collect">
          <p><b className="text-text">Without an account:</b> nothing personal. Maps, gap analysis, planning and forecasts work without logging in. Your location is used only inside your browser to show nearby chargers; we do not store it.</p>
          <p><b className="text-text">With an account:</b> your email, the name you choose, and what you add: reviews, problem reports (with an optional photo), bookings, and chargers you list.</p>
          <p><b className="text-text">Plugsy hosts:</b> the exact address of your charger is private. Others see only an area rounded to about 500 m. The exact address is shown only to a driver with a confirmed booking.</p>
          <p><b className="text-text">Installation requests:</b> your name, phone and city, so an installer can call you.</p>
        </Sec>
        <Sec t="What we never collect">
          <p>No ID numbers (Aadhaar, PAN), no card or bank details (payments in this pilot are a demo), no contacts, no tracking or advertising cookies.</p>
        </Sec>
        <Sec t="Who can see your data">
          <p>Reviews show your chosen name. Everything else is visible only to you, and to a host or driver for a booking you share. Our team can see problem reports and installation requests to act on them. We do not sell data.</p>
          <p>Data is stored with Supabase (database and login). Map tiles come from OpenFreeMap and place search from Photon (OpenStreetMap); they receive the map area or search text, not your account.</p>
        </Sec>
        <Sec t="Your control">
          <p>You can delete your account and all your data at any time: account menu → <b className="text-text">Security & privacy</b> → <b className="text-text">Delete my account and data</b>. You can also turn on 2-step login and log out on all devices there.</p>
          <p>Questions or requests: write to the team via the contact on the About page.</p>
        </Sec>
        <Sec t="Security">
          <p>Data is sent over HTTPS. Each user can only read and change their own records (database row-level security). Photos must be images under 5 MB.</p>
        </Sec>
      </Container>
    </>
  )
}

export function Terms() {
  return (
    <>
      <PageHeader title="Terms of use">The rules for using ChargeEVSetu, in plain words. Last updated {UPDATED}.</PageHeader>
      <Container className="max-w-3xl space-y-3">
        <Sec t="What this site is">
          <p>ChargeEVSetu shows public EV chargers from open data, estimates where charging is missing, and runs Plugsy, a pilot for sharing home chargers. Estimates are labelled as estimates and can be wrong. Always check a charger before you depend on it.</p>
        </Sec>
        <Sec t="Your account">
          <p>Keep your password safe and use a strong one. You are responsible for what you post. One person, one account.</p>
        </Sec>
        <Sec t="Fair use">
          <p>Write honest reviews and reports. Do not post abuse, spam, personal details of others, or false listings. Do not try to break, overload or scrape the service. We may hide content or block accounts that break these rules.</p>
        </Sec>
        <Sec t="Plugsy pilot">
          <p>Sample listings are marked as samples. Payments in the pilot are a demo; no money is charged. Hosts must have a safe, properly installed charger and permission to share it. Drivers must follow the host’s rules and hours.</p>
        </Sec>
        <Sec t="Data sources and liability">
          <p>Charger locations come from OpenStreetMap (ODbL) and Open Charge Map (CC BY 4.0); official counts from the Government of India. The service is provided as is, without guarantees.</p>
        </Sec>
      </Container>
    </>
  )
}
