"""VAHAN dashboard data.

The VAHAN dashboard (vahan.parivahan.gov.in/vahan4dashboard) is a JSF/PrimeFaces app with session-bound
ViewState and captcha-free but stateful AJAX exports, so an unattended scrape is brittle. We therefore:
  1. use official VAHAN figures published in Parliament replies (see fetch_official.py), and
  2. parse any manual dashboard exports dropped into data/raw/vahan/ (instructions in its README.md).

Parsed manual exports override the derived state EV stock in build.py.
Output: data/processed/vahan_manual.csv with columns state, year, category, count  (empty if no files).
"""
import re

import pandas as pd

from common import PROC, RAW, norm_state, provenance

DIR = RAW / "vahan"
CATS = {  # VAHAN vehicle-class words -> our categories
    "two wheeler": "2W", "m-cycle": "2W", "scooter": "2W", "moped": "2W",
    "three wheeler": "3W", "e-rickshaw": "3W", "e-cart": "3W",
    "motor car": "4W", "four wheeler": "4W", "lmv": "4W", "cab": "4W",
    "bus": "Bus", "goods": "Goods", "truck": "Goods",
}


def category(label: str) -> str | None:
    l = label.lower()
    return next((v for k, v in CATS.items() if k in l), None)


def parse_file(f) -> pd.DataFrame:
    """Expects the dashboard's 'Vehicle Class' x 'Month/Year' Excel/CSV export, one file per state.
    File name must contain the state, e.g. 'Maharashtra_2025.xlsx' (year optional if a column has it)."""
    raw = pd.read_excel(f, header=None) if f.suffix.lower() in (".xlsx", ".xls") else pd.read_csv(f, header=None)
    # find header row: the one containing 'Vehicle Class'
    hdr = next(i for i, r in raw.iterrows() if any("vehicle class" in str(c).lower() for c in r.values))
    df = raw.iloc[hdr + 1 :].copy()
    df.columns = [str(c).strip() for c in raw.iloc[hdr].values]
    cls_col = next(c for c in df.columns if "vehicle class" in c.lower())
    total_col = next((c for c in df.columns if c.upper() == "TOTAL"), df.columns[-1])
    state = norm_state(re.sub(r"[_\-]?\d{4}.*$", "", f.stem).replace("_", " "))
    year = int(m.group(0)) if (m := re.search(r"20\d\d", f.stem)) else None
    rows = []
    for _, r in df.iterrows():
        cat = category(str(r[cls_col]))
        v = pd.to_numeric(str(r[total_col]).replace(",", ""), errors="coerce")
        if cat and pd.notna(v):
            rows.append((state, year, cat, int(v)))
    return pd.DataFrame(rows, columns=["state", "year", "category", "count"])


def main():
    files = [f for f in DIR.glob("*") if f.suffix.lower() in (".xlsx", ".xls", ".csv")]
    out = pd.concat([parse_file(f) for f in files], ignore_index=True) if files else \
        pd.DataFrame(columns=["state", "year", "category", "count"])
    out = out.groupby(["state", "year", "category"], dropna=False, as_index=False)["count"].sum() if len(out) else out
    out.to_csv(PROC / "vahan_manual.csv", index=False)
    print(f"VAHAN manual exports: {len(files)} files, {len(out)} rows")
    provenance("vahan_manual", name="VAHAN dashboard manual exports (state x vehicle class x year, fuel = Electric)",
               url="https://vahan.parivahan.gov.in/vahan4dashboard/", licence="Government of India (public dashboard)",
               records=len(out), source_type="real",
               status="ok" if files else "no files yet: see data/raw/vahan/README.md",
               limitations="Manual export; automate via the dashboard's report API in the roadmap.")


if __name__ == "__main__":
    main()
