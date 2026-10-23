# ChargeEVSetu · EV Infra Map India

**Bridging India's EV charging gap.** A static web platform that maps India's public EV chargers against VAHAN vehicle data,
scores every district's charging gap, forecasts needs to 2030–2035 and recommends new charger sites.
Built for the Techfest IIT Bombay EV Infrastructure Challenge 1.

- **Real data:** official charger and EV totals (PIB / Lok Sabha replies), OpenStreetMap chargers, highways and substations, Census 2011, WorldPop.
- **Transparent method:** every formula is in `pipeline/analysis.py` and on the Methodology page, and the browser mirror is verified by `npm run selfcheck`.
- **No backend:** the pipeline writes static JSON, and the site deploys to any static host.

## Quick start (site only)

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build in dist/
npm run preview      # serve the production build
npm run selfcheck    # verify browser model == Python pipeline
.venv/Scripts/python pipeline/test_analysis.py   # unit self-checks for every formula
```

The processed data in `public/data/` is committed, so the site runs without the pipeline.

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

- **Vercel:** import the repo; `vercel.json` handles SPA routes and caching.
- **Netlify:** import the repo; `netlify.toml` sets build command, publish dir and SPA redirect.
- **GitHub Pages:** push to `main`; `.github/workflows/pages.yml` builds with `BASE_PATH=/<repo>/` and publishes.
  Enable Pages → "GitHub Actions" in the repo settings.

## Project structure

```
pipeline/            Python data pipeline (fetch_*, build, analysis, run_all)
data/raw/            raw downloads (OSM tiles, PDFs, Census, WorldPop, boundaries)
data/processed/      cleaned tables + provenance.json
public/data/         site data: summary, states, districts, chargers (+ chargers-modelled), highways (+ highway-gaps, corridors), forecast, cells/, districts/, sources
src/lib/model.ts     browser mirror of analysis.py (live sliders)
src/lib/data.ts      typed, cached data loading
src/components/      layout, map base (MapLibre + deck.gl), planner, UI kit
src/pages/           Home, Map, Gap Analysis, Plan & Estimate, Dashboard, Case Study, Methodology, Data Sources, Roadmap, About
scripts/selfcheck.mjs  TS-vs-Python consistency test
DECISIONS.md         design and data decisions with reasons
DATA_SOURCES.md      generated provenance for every dataset
```

## Data honesty

Every displayed number carries a badge: **Real data** (published by government or OSM), **Estimated** (derived from real data with
stated assumptions) or **Synthetic** (statistical placeholder, used only for modelled charger locations). See `DATA_SOURCES.md`.

## Team

**Team Marlbros FC** · Team ID TM-78A67E4AA8A · Competition ID EV-00F7B9BF04B9
Anand Tripathi (Leader), Anurag Singh, Saavya Verma, Akshat Mishra, Tanishik Tripathi · anandtripathiiiofficial@gmail.com
