// One-off: uploads the team photos from public/team/ into the PRIVATE Supabase bucket "team-photos", then deletes
// the local folder so the photos exist only in Supabase (never in git, never in the public site build).
//   npm run upload-team-photos
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (sb_secret_… or legacy service_role JWT) in .env.local.
// Each person gets a small avatar `<name>.webp` (256 px, what the admin page shows) plus the untouched original in
// `originals/`, so deleting the local folder never loses the full-size photo.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const DIR = 'public/team'
// avatar name -> local file name stems to look for (any of jpg/jpeg/png/webp)
const PEOPLE = { anand: ['anand'], anurag: ['anurag'], saavya: ['saavya'], akshat: ['akshat'], tanishik: ['tanishik', 'tanishq'] }

const env = Object.fromEntries(['.env', '.env.local'].filter((f) => fs.existsSync(f)).flatMap((f) => fs.readFileSync(f, 'utf8').split(/\r?\n/))
  .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]))
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.'); process.exit(1) }
if (!fs.existsSync(DIR)) { console.error(`${DIR}/ not found: nothing to upload (already uploaded?).`); process.exit(1) }

const sb = createClient(url, key, { auth: { persistSession: false } })
const BUCKET = 'team-photos'

// bucket must exist and be private (the migration creates it; this also works before the migration has run)
const { data: bucket } = await sb.storage.getBucket(BUCKET)
if (!bucket) {
  const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 10485760, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] })
  if (error) { console.error(`create bucket: ${error.message}`); process.exit(1) }
} else if (bucket.public) { console.error(`Bucket "${BUCKET}" is PUBLIC. Make it private (run the migration) before uploading.`); process.exit(1) }

const files = fs.readdirSync(DIR)
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const done = []
for (const [name, stems] of Object.entries(PEOPLE)) {
  const file = files.find((f) => stems.includes(path.parse(f).name.toLowerCase()) && MIME[path.extname(f).toLowerCase()])
  if (!file) { console.error(`missing photo for ${name} (looked for ${stems.join('/')}.jpg|jpeg|png|webp)`); process.exit(1) }
  const src = path.join(DIR, file)
  const avatar = await sharp(src).rotate().resize(256, 256, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toBuffer()
  const up1 = await sb.storage.from(BUCKET).upload(`${name}.webp`, avatar, { contentType: 'image/webp', upsert: true, cacheControl: '0' })
  const up2 = await sb.storage.from(BUCKET).upload(`originals/${name}${path.extname(file).toLowerCase()}`, fs.readFileSync(src), { contentType: MIME[path.extname(file).toLowerCase()], upsert: true, cacheControl: '0' })
  if (up1.error || up2.error) { console.error(`upload ${name}: ${(up1.error ?? up2.error).message}`); process.exit(1) }
  done.push(name)
  console.log(`${name}: ${file} (${Math.round(fs.statSync(src).size / 1024)} KB) -> ${name}.webp (${Math.round(avatar.length / 1024)} KB) + original`)
}

// verify every avatar is really there before deleting anything locally
const { data: listed, error } = await sb.storage.from(BUCKET).list('', { limit: 100 })
const have = new Set((listed ?? []).map((f) => f.name))
const missing = done.filter((n) => !have.has(`${n}.webp`))
if (error || missing.length) { console.error(`verification failed (${error?.message ?? `missing ${missing.join(', ')}`}); local files kept.`); process.exit(1) }
fs.rmSync(DIR, { recursive: true, force: true })
console.log(`Uploaded ${done.length} photos to the private "${BUCKET}" bucket and deleted ${DIR}/.`)
