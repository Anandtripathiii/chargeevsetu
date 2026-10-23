# VAHAN manual export (5 minutes per state)

The site already runs on official VAHAN numbers from Parliament replies. Exporting from the dashboard
replaces our *estimated* 2026 state split with exact figures by vehicle class.

1. Open https://vahan.parivahan.gov.in/vahan4dashboard/ → **Vahan Dashboard** → "Tabular Summary".
2. Set filters:
   - **Type:** Actual Value
   - **State:** one state (e.g. Maharashtra), **RTO:** All Vahan4 Running Office
   - **Y-Axis:** Vehicle Class  **X-Axis:** Fuel
   - **Year Type:** Calendar Year, **Year:** e.g. 2025
3. Click **Refresh**, then the Excel icon to download.
4. In the downloaded sheet keep only the **ELECTRIC(BOV)** column as the "TOTAL" column
   (or set X-Axis = Month Wise with the Fuel filter on the left panel ticked to ELECTRIC(BOV) only).
5. Save as `data/raw/vahan/<State>_<Year>.xlsx`, e.g. `Maharashtra_2025.xlsx`, `Tamil_Nadu_2024.xlsx`.
6. Run `python pipeline/run_all.py`. The parser (`pipeline/fetch_vahan.py`) picks up every file here;
   states with exports switch from the "Estimated" to the "Real data" badge automatically.

RTO/district level: choose a specific RTO in step 2 and name the file `<State>_<Year>_RTO-<code>.xlsx`
(district aggregation by RTO code is on the roadmap).
