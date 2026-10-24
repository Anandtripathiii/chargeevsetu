# Incident response: what to do if ChargeEVSetu is hacked

Work through the steps in order. Write down what you do and when, as you go, in a private note: times, IPs, what you changed.
Keys and settings referred to below are explained in [SECURITY.md](SECURITY.md).

## 1. Detect: is something wrong?

Signs: strange reviews or listings, users reporting logins they did not make, the site looks different, a spike of
failed admin logins, a Supabase usage spike, or an email from Supabase / Vercel / GitHub about a leaked key.

Check, in this order:
- **Admin → Security**: failed admin logins (IPs), recent sign-ups (many in minutes = bot), flagged reviews, reports.
- **Supabase → Logs** (Auth, API, Postgres): unusual IPs, many 401/403s, mass deletes or updates.
- **Vercel → Deployments**: was there a deploy you did not make? **Vercel → Logs**: `admin_login_failed` lines.
- **GitHub → Security / commits**: unknown commits or new collaborators; secret-scanning alerts.
- `/status`: is each service up?

## 2. Contain (first 15 minutes)

1. **Stop new damage:**
   - Turn off sign-ups: Supabase → Authentication → Providers → Email → *Allow new users to sign up* off.
   - Turn on CAPTCHA if it is off: Supabase → Authentication → Attack Protection.
   - Ban abusive accounts and hide their reviews: Admin → Security.
2. **Defaced site or bad deploy:** Vercel → Deployments → pick the last good one → *Promote to Production*.
3. **Admin under attack:** change `ADMIN_PASSWORD` in Vercel and redeploy. Lockouts already slow guessing.
4. **Take an evidence backup before you change data:** `npm run backup`. Keep this copy separate.

## 3. Rotate keys (assume every secret is known to the attacker)

1. Supabase: roll the API keys / JWT secret (Settings → API). This logs everyone out.
2. Update `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (if used), `ADMIN_USER` / `ADMIN_PASSWORD` in Vercel → redeploy.
3. Update your local `.env` / `.env.local`.
4. Rotate the Turnstile secret, the Open Charge Map key, and any GitHub / Vercel tokens you use.
5. Turn on 2-factor login for the Supabase, Vercel, GitHub and Cloudflare accounts of everyone on the team.

## 4. Fix the hole

- Re-run every migration in `supabase/migrations/` (they are idempotent) so RLS, limits and triggers are as designed.
- `npm run security-test` must show all PASS.
- If the cause was code: fix it, push, and wait for CI (GitHub Actions) to go green before deploying.
- `npm audit`: upgrade anything high or critical.

## 5. Restore clean data

1. Compare the evidence backup with the last good backup to find what changed (rows, users, times).
2. Delete or fix bad rows (Table editor, or SQL with the service role), or restore tables from the last good backup
   (see *Backups and restore* in SECURITY.md).
3. Check `/status` and click through: map, login, a Plugsy booking.
4. Turn sign-ups back on.

## 6. Inform people

- **Users affected** (their data was read or changed): email them within 72 hours. Say what happened, what data,
  what you did, and what they should do (change password, turn on 2-step login, watch for phishing).
- **Personal data breach in India:** under the Digital Personal Data Protection Act, 2023 you must inform the
  Data Protection Board and affected users. If it is a cyber-security incident, report it to CERT-In
  (incident@cert-in.org.in) within 6 hours of noticing it.
- **Team / organisers / judges:** a short honest note.

## 7. Learn

Within a week, write down: what happened, how it was found, how long it took, what fixed it, and what will
stop it happening again (a new test in `scripts/security-tests.mjs`, a tighter limit, a monitoring alert).
