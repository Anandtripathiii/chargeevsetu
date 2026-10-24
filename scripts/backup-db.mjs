// Exports every Supabase table (and the list of accounts, without passwords) to backups/<date>/<table>.json + .csv.
// Run on your own machine:  npm run backup
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (never commit it, never put it in Vercel's
// browser-exposed VITE_* variables). backups/ is git-ignored; keep copies somewhere private (encrypted drive).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(['.env', '.env.local'].filter((f) => fs.existsSync(f)).flatMap((f) => fs.readFileSync(f, 'utf8').split(/\r?\n/))
  .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]))
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.'); process.exit(1) }

const TABLES = ['reviews', 'reports', 'home_chargers', 'home_charger_private', 'bookings', 'install_requests', 'admin_events']
const sb = createClient(url, key, { auth: { persistSession: false } })
const dir = `backups/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
fs.mkdirSync(dir, { recursive: true })

const csvCell = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
function write(name, rows) {
  fs.writeFileSync(`${dir}/${name}.json`, JSON.stringify(rows, null, 1))
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  fs.writeFileSync(`${dir}/${name}.csv`, [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n'))
  console.log(`${name}: ${rows.length} rows`)
}

for (const t of TABLES) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(t).select('*').range(from, from + 999)
    if (error) { console.warn(`${t}: skipped (${error.message})`); break }
    rows.push(...data)
    if (data.length < 1000) break
  }
  write(t, rows)
}
const users = []
for (let page = 1; ; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) { console.warn(`auth users: skipped (${error.message})`); break }
  users.push(...data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, banned_until: u.banned_until ?? null, full_name: u.user_metadata?.full_name ?? null })))
  if (data.users.length < 1000) break
}
write('auth_users', users)
console.log(`Backup written to ${dir}/`)
