# Security

How ChargeEVSetu protects data, how to rotate keys, restore a backup, and respond to an attack.
For a step-by-step emergency checklist see [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).

## What is protected, and how

| Area | Protection |
|---|---|
| **Secrets** | Browser code uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, which holds the **publishable** key (`sb_publishable_…`, public by design; a legacy anon JWT also works). `npm run build` fails, and the app refuses to connect, if that variable ever holds a secret key. The secret key (`sb_secret_…`) lives in `SUPABASE_SERVICE_ROLE_KEY`; raw REST calls send it only in the `apikey` header (it is not a JWT). The `service_role` key is used only by `scripts/backup-db.mjs` / `scripts/security-tests.mjs` on your own machine (`.env.local`) and, optionally, as a **server-only** Vercel variable for the admin API/middleware. `.env` and `.env.*` are git-ignored (except `.env.example`, placeholders only). |
| **Database** | Row Level Security is on (and forced) for every table. Users read and change only their own rows; public data is read-only; `verified` and every role-like field can only be changed with the service role. Bookings can only be cancelled, never edited. CHECK constraints limit lengths (review ≤ 1000, names ≤ 100), rating 1–5, price ₹5–30/kWh, valid statuses, coordinates inside India. |
| **Spam** | Database triggers: ≤ 5 reviews, 5 reports, 10 bookings per user per hour; ≤ 5 charger listings per day; ≤ 3 install requests per phone per day. Optional Cloudflare Turnstile CAPTCHA on sign-up, login and reset. |
| **Privacy** | Exact host addresses live in `home_charger_private`, readable only by the host and by drivers with a confirmed booking. Public listings show coordinates rounded to ~500 m (enforced by a trigger). No emails or phone numbers are exposed by any public query; list queries return at most 100 rows. Users can delete their account and all their data. |
| **Storage** | Buckets accept only JPG/PNG/WebP up to 5 MB; users can upload, change and delete only inside their own `<user-id>/` folder; report photos are private. |
| **Accounts** | Passwords: at least 8 characters, letters plus a number/symbol, common passwords rejected. Messages never reveal whether an email is registered. Optional 2-step login (TOTP). "Log out everywhere". |
| **Web app** | All input validated with zod before it is sent. No `dangerouslySetInnerHTML`; map tooltips escape every value (`safeHtml`). Content-Security-Policy, HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer, Permissions-Policy (geolocation self only; camera/mic off) in `vercel.json` and `netlify.toml`. |
| **Admin** | `/admin` (pages, scripts, data) and `/api/admin` sit behind HTTP Basic auth in `middleware.ts`: constant-time comparison, ~1 s delay on a wrong password, 10 failures → 15-minute lockout per IP (shared across instances when Upstash Redis is configured), failed attempts logged without passwords. **Admin protection exists on Vercel only**: on Netlify the middleware does not run, so do not deploy the admin bundle there. |
| **Reliability** | Error boundaries on every page and map; maps and search show a retry button on failure; Supabase reads are retried and a banner explains outages while static pages keep working; `/status` checks every service. `npm run build` fails if data files are broken (`scripts/check-data.mjs`). GitHub Actions builds every push. |
| **Dependencies** | `npm audit` must be clean of high/critical issues (CI checks it). |

## Rotating keys

Rotate immediately if a key may have leaked (committed, pasted in chat, shown on screen, laptop lost).

1. **Supabase keys:** Dashboard → Project Settings → API Keys. Create a new `sb_secret_` (or `sb_publishable_`) key, update it everywhere (step 2), then **delete the old key**. New-style keys rotate one at a time without logging users out. After moving to the new keys, *disable the legacy JWT-based keys* (anon / service_role) on the same page so an old leaked JWT stops working.
2. Update the new values in:
   - Vercel → Project → Settings → Environment Variables (`VITE_SUPABASE_ANON_KEY`; `SUPABASE_SERVICE_ROLE_KEY` only if you use the admin API), then **Redeploy**.
   - your local `.env` / `.env.local`.
3. **Admin password:** change `ADMIN_PASSWORD` (and `ADMIN_USER`) in Vercel and redeploy. Use 20+ random characters.
4. **Open Charge Map key:** regenerate at openchargemap.org → My profile → API keys.
5. **Turnstile:** Cloudflare dashboard → Turnstile → rotate the secret, paste it in Supabase → Authentication → Attack Protection.
6. If a secret was committed: rotating is what matters. Rewriting git history does not help once it was pushed.

## Backups and restore

**Make a backup** (weekly, and before any migration):

```bash
# .env.local must contain VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run backup        # -> backups/<date-time>/<table>.json and .csv (+ auth_users)
```

Keep copies off the laptop (encrypted drive). Supabase's paid plans also keep daily backups (Dashboard → Database → Backups).

**Restore:**

1. If the schema is gone, run `supabase/schema.sql` and then every file in `supabase/migrations/` in date order (SQL Editor).
2. Users: accounts cannot be re-imported with passwords. Restore from a Supabase backup (paid) or ask users to sign up again with the same email. User IDs from `auth_users.json` let you re-link rows if you recreate users with the Admin API (`auth.admin.createUser({ id, email, email_confirm: true })`).
3. Tables: Dashboard → Table editor → *Import data from CSV* for each `backups/<date>/<table>.csv`, in this order: `home_chargers`, `home_charger_private`, `bookings`, `reviews`, `reports`, `install_requests`. (Or insert the JSON with the service role.) Rate-limit triggers do not apply to the service role.
4. Check the site and `/status`.

## If the site is attacked

Short version (full checklist in [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)):

- **Spam / abuse:** hide reviews and ban users from Admin → Security; lower the rate limits in the migration; turn on Turnstile.
- **Brute force on /admin:** the lockout handles it; change the admin password if logs show many attempts; set up Upstash Redis for a shared lockout.
- **Suspected data breach:** turn off sign-ups (Supabase → Authentication → Providers → Email → disable sign-ups), rotate all keys, take a backup for evidence, then restore clean data and tell affected users.
- **Defacement / bad deploy:** Vercel → Deployments → *Promote* the last good deployment (instant rollback).

## Running the security tests

```bash
# needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (for creating/deleting test users) in .env.local
npm run security-test
```

It creates two temporary users, attempts each attack with the anon key, prints PASS/FAIL, and deletes the users.
