# ChargeEVSetu

**Find, plan and share EV charging across India.** A public web app with a Google-Maps-style charger map, district gap analysis,
a planning lab (what-if and stress tests), EV demand forecasts, delivery-rider hub planning and **Plugsy**, community home-charger sharing.

- **Public site** (`/`): Home, Charging map, Gap analysis, Planning lab, Forecast, Delivery hubs, Plugsy. Only real charger locations are shown; anything modelled says "Estimated".
- **Admin area** (`/admin`): data quality, all map layers (including modelled ones), case study, methodology, data sources, roadmap, team. Password-protected on the server and built as a separate bundle.
- **Backend:** Supabase (auth, Postgres + RLS, Realtime, Storage). Without keys the site runs in **Demo mode** on local sample data.

## Quick start (site only)

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build in dist/
npm run preview      # serve the production build
npm run selfcheck    # verify browser model == Python pipeline, gap score + what-if checks
.venv/Scripts/python pipeline/test_analysis.py   # unit self-checks for every formula
```

The processed data in `public/data/` is committed, so the site runs without the pipeline.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Used by | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | the **anon / public** key (never the service-role key) |
| `ADMIN_USER` | `middleware.ts` | username for `/admin` |
| `ADMIN_PASSWORD` | `middleware.ts` | long random password. If either admin variable is missing, `/admin` returns 503 (locked) |

For local development put the two `VITE_` variables in `.env.local`. Leave them out to use Demo mode.

## Supabase setup

1. Create a free project at https://supabase.com.
2. SQL Editor → paste and run `supabase/schema.sql` (tables, Row Level Security policies, booking function, Realtime, storage buckets).
3. Authentication → Providers: keep **Email** on (magic link). Turn on **Google** and paste a Google OAuth client ID/secret
   (Google Cloud Console → Credentials → OAuth client, redirect URI `https://<project>.supabase.co/auth/v1/callback`).
4. Authentication → URL Configuration: set the Site URL to your production domain and add it (and `http://localhost:5173`) to Redirect URLs.
5. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel and redeploy.
6. To verify a Plugsy host, set `verified = true` on their row in Table Editor (hosts cannot verify themselves). Problem reports are in the `reports` table; photos in the private `report-photos` bucket.

Payments are **demo only** (`payment = 'demo'`); plug in a payment provider before charging real money.

## Rebuild the charger map tiles

The public map only uses real stations, cut into static z7 tiles so the browser loads only what is on screen.

```bash
# 1. fresh OpenStreetMap export (any Overpass server)
curl -A "ChargeEVSetu" --data-urlencode 'data=[out:json][timeout:180];area["ISO3166-1"="IN"][admin_level=2]->.in;nwr["amenity"="charging_station"](area.in);out center tags;'   https://overpass-api.de/api/interpreter -o data/raw/osm/chargers_full.json
# 2. merge duplicates, write public/data/tiles/7/x/y.json, stations-index.json and hubs.json
node scripts/build-map-data.mjs
```

To add another source, convert it to the same Overpass-style JSON (or extend `station()` in the script); duplicates within 60 m are merged.

## Refresh the data (pipeline)

Requires Python 3.11–3.13 (Windows: use the python.org / `py` launcher build, not MSYS2's Python, which lacks GeoPandas wheels).

```bash
python -m venv .venv
.venv/Scripts/python -m pip install pandas geopandas shapely pyogrio rasterio scipy numpy requests openpyxl pypdf   # Linux/macOS: .venv/bin/python
.venv/Scripts/python pipeline/run_all.py            # uses cached downloads in data/raw/
.venv/Scripts/python pipeline/run_all.py --force    # re-download OSM layers (~1-2 h, tiled Overpass queries)
```

Steps (each can also be run on its own from `pipeline/`):

| Script | Does |
|---|---|
| `fetch_official.py` | Downloads and parses PIB / Lok Sabha documents: state-wise chargers, state-wise EVs, national totals |
| `fetch_osm.py` | Overpass: chargers, NH highways, substations, candidate POIs (2°×2° tiles, cached; `--reverse` + `OVERPASS_PRIMARY=de` for a 2nd worker) |
| `fetch_ocm.py` | Open Charge Map (needs `OCM_API_KEY` in `.env`; skipped otherwise) |
| `fetch_vahan.py` | Parses any VAHAN dashboard exports placed in `data/raw/vahan/` (see the README there) |
| `build.py` | Cleans, merges, de-duplicates, splits to districts, runs `analysis.py`, writes `public/data/*` and `DATA_SOURCES.md` |
| `analysis.py` | All formulas: indicators, coverage, highway gaps, Gap Score, forecasts, chargers needed, greedy siting |

Raw downloads go to `data/raw/`, intermediate tables to `data/processed/`, and site data to `public/data/`.
Two large inputs are not in git; download them once before running `build.py`:
- WorldPop 2020 1 km UN-adjusted grid → `data/raw/worldpop/ind_pop_2020_1km.tif` (https://hub.worldpop.org/geodata/summary?id=31751, file `ind_ppp_2020_1km_Aggregated_UNadj.tif`, renamed)
- DataMeet Census-2011 district boundaries → `data/raw/boundaries/2011_Dist.{shp,shx,dbf,prj}` (https://github.com/datameet/maps/tree/master/Districts/Census_2011)

The Census CSV, official PDFs and OSM tile cache are fetched or kept in `data/raw/` by the scripts.

### Optional upgrades
- **Open Charge Map:** copy `.env.example` to `.env`, add a free key, re-run the pipeline.
- **Exact VAHAN figures:** follow `data/raw/vahan/README.md` to export per-state tables. States with exports switch from "Estimated" to "Real data".

## Deploy

- **Vercel (recommended):** import the repo, add the environment variables above. `vercel.json` handles SPA routes and caching;
  `middleware.ts` (Vercel Routing Middleware) protects every `/admin` path. Admin-only code is emitted to `dist/admin/assets/`.
- Other static hosts work for the public site, but `/admin` is only protected on Vercel.
- **Netlify:** import the repo; `netlify.toml` sets build command, publish dir and SPA redirect.
- **GitHub Pages:** push to `main`; `.github/workflows/pages.yml` builds with `BASE_PATH=/<repo>/` and publishes.
  Enable Pages → "GitHub Actions" in the repo settings.

## Project structure

```
pipeline/            Python data pipeline (fetch_*, build, analysis, run_all)
data/raw/            raw downloads (OSM tiles, PDFs, Census, WorldPop, boundaries)
data/processed/      cleaned tables + provenance.json
public/data/         site data: summary, states, districts, tiles/ (real stations), stations-index, hubs, forecast, cells/, districts/
public/admin/data/   admin-only data (modelled charger locations), behind the admin password
src/lib/backend.ts   Supabase / Demo-mode API: auth, reviews, reports, Plugsy
src/lib/model.ts     browser mirror of analysis.py; gap4.ts (4-factor score), network.ts (what-if)
src/components/      layout + nav, charger map (MapLibre), deck.gl map base, station panel, UI kit
src/pages/           public pages: Home, Map, Gap Analysis, Planning Lab, Forecast, Delivery, Plugsy
src/admin/           admin app (separate entry admin/index.html)
supabase/schema.sql  database schema + RLS
middleware.ts        /admin basic auth (Vercel)
scripts/selfcheck.mjs  TS-vs-Python consistency test
DECISIONS.md         design and data decisions with reasons
DATA_SOURCES.md      generated provenance for every dataset
```

## Data honesty

Public pages show only real charger locations (OpenStreetMap) and label every modelled value "Estimated".
Modelled charger locations exist only in the admin area. See `DATA_SOURCES.md`.

## Team

**Team Marlbros FC** · Team ID TM-78A67E4AA8A · Competition ID EV-00F7B9BF04B9
Anand Tripathi (Leader), Anurag Singh, Saavya Verma, Akshat Mishra, Tanishik Tripathi · anandtripathiiiofficial@gmail.com
