// Attack tests against the live Supabase project, using only the public ANON key for every attack.
// Creates three throw-away users (A attacker, B victim, C host), tries each attack, prints PASS/FAIL, then deletes them.
//   npm run security-test
// Needs in .env / .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY (only to create
// and delete the confirmed test users; never used for an attack). Without the service key, only logged-out tests run.
// If CAPTCHA (Turnstile) is enabled in Supabase, password logins from this script are refused: run it with CAPTCHA off.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(['.env', '.env.local'].filter((f) => fs.existsSync(f)).flatMap((f) => fs.readFileSync(f, 'utf8').split(/\r?\n/))
  .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]))
const get = (k) => process.env[k] || env[k]
const URL_ = get('VITE_SUPABASE_URL'), ANON = get('VITE_SUPABASE_ANON_KEY'), SERVICE = get('SUPABASE_SERVICE_ROLE_KEY')
if (!URL_ || !ANON) { console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.'); process.exit(1) }

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const anon = createClient(URL_, ANON, opts)
const admin = SERVICE ? createClient(URL_, SERVICE, opts) : null
const results = []
const log = (status, name, note = '') => { results.push({ status, name }); console.log(`${status.padEnd(4)}  ${name}${note ? `  (${note})` : ''}`) }
/** fn returns true when the attack was BLOCKED. */
async function test(name, fn) {
  try { const r = await fn(); log(r === true ? 'PASS' : 'FAIL', name, typeof r === 'string' ? r : '') }
  catch (e) { log('FAIL', name, `test error: ${e.message}`) }
}
const rows = (r) => (r.error ? 0 : (r.data?.length ?? 0))
const blocked = (r) => !!r.error || rows(r) === 0

// ---------------- logged out ----------------
console.log('\n# Logged-out visitor (anon key, no session)')
for (const t of ['reports', 'bookings', 'bookings_view', 'home_charger_private', 'install_requests', 'admin_events', 'review_flags']) {
  await test(`anon cannot read ${t}`, async () => blocked(await anon.from(t).select('*').limit(5)))
}
await test('anon CAN read public reviews (safe data)', async () => !(await anon.from('reviews').select('id, rating, body, author').limit(1)).error)
await test('public listings expose no email/phone/address columns', async () => {
  const r = await anon.from('home_chargers_public').select('*').limit(1)
  if (r.error) return `view missing: run migration 20261026 (${r.error.message})`
  const cols = r.data[0] ? Object.keys(r.data[0]) : []
  return !cols.some((c) => /email|phone|contact|address|host_id/i.test(c))
})
await test('anon cannot call delete_my_account', async () => !!(await anon.rpc('delete_my_account')).error)
await test('anon cannot list users (auth admin API)', async () => !!(await anon.auth.admin.listUsers()).error)
await test('team photos: anon cannot list, download or sign', async () => {
  const l = await anon.storage.from('team-photos').list()
  const d = await anon.storage.from('team-photos').download('anand.webp')
  const g = await anon.storage.from('team-photos').createSignedUrl('anand.webp', 60)
  const p = await fetch(`${URL_}/storage/v1/object/public/team-photos/anand.webp`)
  return (l.error || !l.data?.length) && !!d.error && !!g.error && !p.ok
})
if (admin) await test('team photos: signed URL stops working after it expires', async () => {
  const s = await admin.storage.from('team-photos').createSignedUrl('anand.webp', 1)
  if (s.error) return `no photo uploaded yet (${s.error.message})`
  await new Promise((ok) => setTimeout(ok, 3000))
  const r = await fetch(s.data.signedUrl)
  return r.status >= 400 && r.status < 500
})
await test('anon cannot insert a review', async () => !!(await anon.from('reviews').insert({ station_id: 'sec-test', rating: 5, body: 'x', author: 'x', user_id: '00000000-0000-0000-0000-000000000000' })).error)

if (!admin) {
  console.log('\nSKIP  logged-in attack tests: add SUPABASE_SERVICE_ROLE_KEY to .env.local to create test users.')
} else {
  const stamp = Date.now().toString(36)
  const pw = `T3st!${crypto.randomUUID()}`
  const users = {}
  const clients = {}
  try {
    for (const k of ['A', 'B', 'C']) {
      const { data, error } = await admin.auth.admin.createUser({ email: `sectest-${k.toLowerCase()}-${stamp}@example.com`, password: pw, email_confirm: true, user_metadata: { full_name: `Test ${k}` } })
      if (error) throw new Error(`create user ${k}: ${error.message}`)
      users[k] = data.user
      clients[k] = createClient(URL_, ANON, opts)
      const s = await clients[k].auth.signInWithPassword({ email: data.user.email, password: pw })
      if (s.error) throw new Error(`login ${k}: ${s.error.message}`)
    }
    const { A, B, C } = clients
    const idA = users.A.id, idB = users.B.id

    // victim data (created through the normal anon-key API)
    const charger = (host) => ({ title: 'Security test charger', area: 'Test area', lon: 77.2, lat: 28.6, type: 'AC', power_kw: 7.4, connector: 'Type 2', price_kwh: 12, hours: '9-5', host_name: 'Test' })
    const chB = await B.from('home_chargers').insert({ ...charger(), host_id: idB }).select().single()
    if (chB.error) throw new Error(`B charger: ${chB.error.message}`)
    await B.from('home_charger_private').insert({ charger_id: chB.data.id, host_id: idB, address: '12 Secret Lane, Test City' })
    const chC = await C.from('home_chargers').insert({ ...charger(), host_id: users.C.id }).select().single()
    await admin.from('home_chargers').update({ status: 'free' }).in('id', [chB.data.id, chC.data.id])
    const bookB = await B.rpc('book_charger', { p_charger: chC.data.id, p_start: new Date(Date.now() + 864e5).toISOString(), p_hours: 1 })
    const revB = await B.from('reviews').insert({ station_id: 'sec-test-1', rating: 4, body: 'victim review', author: 'Test B', user_id: idB }).select().single()
    const repB = await B.from('reports').insert({ station_id: 'sec-test-1', kind: 'other', note: 'victim report', user_id: idB }).select().single()

    console.log('\n# Logged in as A, attacking B')
    await test("A cannot read B's booking", async () => blocked(await A.from('bookings').select('*').eq('user_id', idB)))
    if (bookB.data) {
      await test("A cannot update B's booking", async () => { await A.from('bookings').update({ status: 'cancelled' }).eq('id', bookB.data.id); return (await admin.from('bookings').select('status').eq('id', bookB.data.id).single()).data?.status === 'confirmed' })
      await test("A cannot delete B's booking", async () => { await A.from('bookings').delete().eq('id', bookB.data.id); return rows(await admin.from('bookings').select('id').eq('id', bookB.data.id)) === 1 })
      await test("B cannot change own booking's amount", async () => { await B.from('bookings').update({ amount: 1, status: 'cancelled' }).eq('id', bookB.data.id); return (await admin.from('bookings').select('amount').eq('id', bookB.data.id).single()).data?.amount > 1 })
    } else log('FAIL', 'setup: B could not book', bookB.error?.message)
    await test("A cannot update B's charger", async () => { await A.from('home_chargers').update({ price_kwh: 29 }).eq('id', chB.data.id); return (await admin.from('home_chargers').select('price_kwh').eq('id', chB.data.id).single()).data?.price_kwh == 12 })
    await test("A cannot delete B's charger", async () => { await A.from('home_chargers').delete().eq('id', chB.data.id); return rows(await admin.from('home_chargers').select('id').eq('id', chB.data.id)) === 1 })
    await test("A cannot read B's exact address", async () => blocked(await A.from('home_charger_private').select('address').eq('charger_id', chB.data.id)))
    await test("A cannot get B's address via booking_address", async () => !bookB.data || !(await A.rpc('booking_address', { p_booking: bookB.data.id })).data)
    await test("A cannot update B's review", async () => { await A.from('reviews').update({ body: 'hacked' }).eq('id', revB.data.id); return (await admin.from('reviews').select('body').eq('id', revB.data.id).single()).data?.body === 'victim review' })
    await test("A cannot delete B's review", async () => { await A.from('reviews').delete().eq('id', revB.data.id); return rows(await admin.from('reviews').select('id').eq('id', revB.data.id)) === 1 })
    await test("A cannot read B's reports", async () => blocked(await A.from('reports').select('*').eq('user_id', idB)))
    await test("A cannot update/delete B's reports", async () => { await A.from('reports').update({ note: 'x' }).eq('id', repB.data.id); await A.from('reports').delete().eq('id', repB.data.id); return (await admin.from('reports').select('note').eq('id', repB.data.id).single()).data?.note === 'victim report' })
    await test("A cannot read B's profile/email (auth admin API)", async () => !!(await A.auth.admin.getUserById(idB)).error)
    await test('A cannot read install requests (phone numbers)', async () => blocked(await A.from('install_requests').select('phone')))
    await test('booker CAN read the address with a confirmed booking', async () => {
      const ch = await A.from('home_chargers').insert({ ...charger(), host_id: idA }).select().single()
      await A.from('home_charger_private').insert({ charger_id: ch.data.id, host_id: idA, address: '7 Host Road, Test City' })
      await admin.from('home_chargers').update({ status: 'free' }).eq('id', ch.data.id)
      await B.rpc('book_charger', { p_charger: ch.data.id, p_start: new Date(Date.now() + 2 * 864e5).toISOString(), p_hours: 1 })
      return rows(await B.from('home_charger_private').select('address').eq('charger_id', ch.data.id)) === 1 || 'needs migration 20261026'
    })

    console.log('\n# Privilege escalation')
    await test('A cannot make itself admin (app_metadata role)', async () => {
      await A.auth.updateUser({ data: { role: 'admin', is_admin: true } }) // user_metadata is user-editable, so the app never trusts it
      const { data } = await admin.auth.admin.getUserById(idA)
      return !data.user.app_metadata?.role && !data.user.app_metadata?.is_admin
    })
    await test('A cannot verify its own charger', async () => {
      const ch = await A.from('home_chargers').select('id').eq('host_id', idA).limit(1).single()
      await A.from('home_chargers').update({ verified: true }).eq('id', ch.data.id)
      return (await admin.from('home_chargers').select('verified').eq('id', ch.data.id).single()).data?.verified === false
    })
    await test('A cannot hide/unhide reviews', async () => {
      const own = await A.from('reviews').insert({ station_id: 'sec-test-own', rating: 3, body: 'own', author: 'A', user_id: idA }).select().single()
      if (own.error) return own.error.message
      await A.from('reviews').update({ hidden: true }).eq('id', own.data.id)
      const r = await admin.from('reviews').select('hidden').eq('id', own.data.id).single()
      return r.error ? 'needs migration 20261026' : r.data.hidden === false
    })

    console.log('\n# Bad input')
    await test('rating 10 is rejected', async () => !!(await A.from('reviews').insert({ station_id: 'sec-test-2', rating: 10, body: 'x', author: 'A', user_id: idA })).error)
    await test('50,000-character review is rejected', async () => !!(await A.from('reviews').insert({ station_id: 'sec-test-3', rating: 3, body: 'x'.repeat(50000), author: 'A', user_id: idA })).error)
    await test('negative price is rejected', async () => !!(await A.from('home_chargers').insert({ ...charger(), price_kwh: -5, host_id: idA })).error)
    await test("review with B's user_id is rejected", async () => !!(await A.from('reviews').insert({ station_id: 'sec-test-4', rating: 3, body: 'x', author: 'B', user_id: idB })).error)
    await test("charger with B's host_id is rejected", async () => !!(await A.from('home_chargers').insert({ ...charger(), host_id: idB })).error)

    console.log('\n# Storage')
    await test('non-image upload is rejected', async () => !!(await A.storage.from('charger-photos').upload(`${idA}/evil.html`, new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), { contentType: 'text/html' })).error)
    await test("upload into B's folder is rejected", async () => !!(await A.storage.from('charger-photos').upload(`${idB}/x.png`, new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), { contentType: 'image/png' })).error)
    await test('file over 5 MB is rejected', async () => !!(await A.storage.from('charger-photos').upload(`${idA}/big.png`, new Blob([new Uint8Array(5.5e6)], { type: 'image/png' }), { contentType: 'image/png' })).error)

    console.log('\n# Rate limits')
    await test('20 quick reviews: at most 5 per hour accepted', async () => {
      let ok = 0
      for (let i = 0; i < 20; i++) if (!(await C.from('reviews').insert({ station_id: `sec-rl-${i}`, rating: 4, body: 'spam', author: 'C', user_id: users.C.id })).error) ok++
      return ok <= 5 ? true : `${ok} accepted`
    })
  } catch (e) {
    log('FAIL', 'setup', e.message)
  } finally {
    for (const u of Object.values(users)) {
      for (const b of ['charger-photos', 'report-photos']) {
        const { data } = await admin.storage.from(b).list(u.id)
        if (data?.length) await admin.storage.from(b).remove(data.map((f) => `${u.id}/${f.name}`))
      }
      await admin.auth.admin.deleteUser(u.id) // cascades to every row the user owns
    }
    if (Object.keys(users).length) console.log(`\nCleaned up ${Object.keys(users).length} test users.`)
  }
}

const failed = results.filter((r) => r.status === 'FAIL')
console.log(`\n${results.length - failed.length}/${results.length} PASS${failed.length ? `, ${failed.length} FAIL` : ''}`)
process.exit(failed.length ? 1 : 0)
