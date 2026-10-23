# Decisions log

Choices made while building ChargeEVSetu, with the reason for each. Newest considerations are inline.

## Project & stack
| Decision | Why |
|---|---|
| Project lives in `C:\chargeEVsetu` | Requested by the owner (the session started in `C:\Windows\System32`, a system folder). |
| Name **ChargeEVSetu**, subtitle "EV Infra Map India", tagline "Bridging India's EV charging gap" | Owner's branding instruction. |
| Vite 8 + React 19 + TypeScript + Tailwind 4 + React Router 7 (lazy routes) | Fast builds, code-split pages, static output. |
| **MapLibre GL 5.24** (not 6.x) | deck.gl 9.4's MapLibre overlay crashes with MapLibre 6 (`transform._nearZ` undefined), and v6's split worker failed under Vite dev. v5 is the stable pairing. |
| deck.gl `MapboxOverlay` in **interleaved** mode, polygons inserted below the basemap's first label layer | Place names stay readable over choropleths; charger clusters (MapLibre native clustering) draw on top. |
| CARTO dark-matter / positron basemaps | Free, no API key, matching dark and light themes. |
| Recharts for charts; page and card entrances are a 220 ms CSS keyframe (Framer Motion was tried, then removed) | Removing the motion library cut the shared JS bundle from 147 KB to 103 KB gzipped. Motion respects `prefers-reduced-motion`. |
| No backend: Python pipeline writes static JSON/GeoJSON to `public/data/` | Loads instantly, deploys free, no server to fail during judging. |
| District GeoJSON loaded per state only when a state is opened | Keeps first load small (states file ≈ 340 KB raw, far less gzipped). |
| Home-page India map is a hand-projected **SVG**, not WebGL | Hero renders instantly without pulling MapLibre into the first page. |

## Data
| Decision | Why |
|---|---|
| Official charger totals: **PIB annexure Aug 2025** (MoP, 29,277, state-wise) scaled to **Lok Sabha USQ 1956 (BHEL portal, 52,718, 31-Mar-2026)** | The newest state split plus the newest national total. Parsed from the PDFs, with totals checksummed. |
| EV stock: **PIB 1947389** (VAHAN state-wise, 03-Aug-2023) scaled to **USQ 1956 national 1,00,23,396 (26-Jul-2026)** | The VAHAN dashboard is a stateful JSF app and unattended scraping is brittle. Parliament replies are official VAHAN figures. A manual-export parser plus `data/raw/vahan/README.md` is provided for exact figures. |
| Telangana EVs (missing in the 2023 table) = per-person rate of AP, KA, TN, KL | Neighbouring-state proxy, marked Estimated. |
| Boundaries: **DataMeet Census-2011 districts** (640), joined to Census 2011 tables on census code | One consistent source for geometry and population; exact code join, so no fuzzy name matching is needed. Telangana and Ladakh are split out by district. |
| District EV split by **vehicle-owning households** (Census 2W + 2×car) × (0.5 + urban share) | Better than population alone and fulfils the "population × urbanisation" brief. Marked Estimated. |
| **WorldPop 2020 1 km** grid, rescaled to district 2026 population | Real population surface for coverage, distance and site cells. |
| OSM chargers: **608** found; India area query checked against a bbox count | Real result: OSM lists ~1.2% of official chargers. Reported as a finding. |
| **Modelled (synthetic) charger locations** fill each district to its estimated total, sampled ∝ population^1.5 (seed 42) | Without them, distance and coverage metrics would describe 1% of the network. They are labelled Synthetic, off by default on the map, and documented. |
| Highways: OSM `motorway/trunk/primary` with `ref ~ NH/NE`, 2°×2° tiles, cached per tile, two Overpass servers in parallel | India-wide area queries timed out. bbox tiles are fast. Results are clipped to India in the build. Natural Earth roads were downloaded as a fallback but not used (no NH numbers). |
| One-way carriageways count half their length | Dual carriageways are mapped as two one-way ways; counting both gave 165,395 km, more than the official ~1.46 lakh km. Halving them gives 116,933 km, a sensible lower bound (some NH stretches lack a ref tag). |
| POIs limited to fuel, malls, attractions and logistics | Parking, hospitals and hotels made the Overpass load too slow. The four kept are the most typical charger hosts. |
| OCM skipped (no `OCM_API_KEY`) | The API returns 403 without a key. Fetch, merge and dedupe code is in place and runs as soon as a key is added. |
| JSON writer converts NaN to null and uses `allow_nan=False` | A NaN in `chargers.json` made the browser's JSON parse fail silently. Fixed at the root. |

## Method
| Decision | Why |
|---|---|
| Gap Score = weighted min–max factors (log for heavy-tailed), then **rescaled 0–100** | Makes "0–100" literal (0 = best served, 100 = worst). Without the rescale, scores clustered at 9–49 because the factors pull against each other. |
| Default weights: stress 30%, distance 25%, EV density 20%, corridor 15%, urban pop 10% | The first draft (demand-heavy) ranked well-covered metros top. The weights now emphasise *unmet* need. Users can change them live. |
| "Critical" = top 10% of districts | A stable, relative definition that doesn't depend on the score scale. |
| Forecast: CAGR and logistic both reported, but **planning uses policy scenarios** (30% EV sales by 2030 = base) | The logistic K hits its bound (still early on the S-curve), and both fits back-test at ~29% error. Honest reporting beats a falsely precise curve. |
| Target EVs per charger by vehicle type (4W 10 per EU AFID / IEA; 2W 100; 3W 40; bus 3; goods 15), blended ≈ 44 | Reflects home, depot and swap charging for 2W/3W. Every value is user-adjustable. |
| **Capacity-aware greedy** site selection (hubs of 10 chargers; served share = min(1, ratio·C/E)) | Pure 3 km distance coverage is already ~98% in metros with the official count, so it can't guide urban siting. Capacity is the real urban gap. Greedy gives the standard (1−1/e) approximation. |
| Python formulas mirrored in `src/lib/model.ts`, verified by `npm run selfcheck` | Sliders recompute in the browser while the numbers stay identical to the pipeline. The self-check caught a rounding mismatch, since fixed. |
| Site candidates capped at the 2,500 most-populated 2 km cells per region | Keeps the in-browser optimiser under ~200 ms. |
| Base path configurable (`BASE_PATH`) | The same build works at `/` (Vercel/Netlify) and `/repo/` (GitHub Pages). |
| Map code (MapLibre + deck.gl, ~1.5 MB) loads on the visitor's first interaction or the "Load interactive map" button (`src/components/LazyMap.tsx`) | On a mid-range phone, parsing it during page load blocked the main thread for 4–7 s. Pages, numbers and charts now render first; camera moves requested earlier are replayed. |
| Heavy data split out: `chargers-modelled.json` (52k synthetic points, only when that layer is on), `highway-gaps.json` + `corridors.json` for Gap Analysis, `districts.json` only after a state is opened or a search starts | `chargers.json` went from 1.8 MB to 52 KB and Gap Analysis from 2.3 MB of highways to a 0.5 KB table. |
| Planner (charts + site map) lazy-loaded on Plan & Estimate and Case Study | The header and region picker paint before Recharts loads. |
