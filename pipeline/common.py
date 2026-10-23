"""Shared paths, HTTP helper, state-name normalisation and provenance log."""
import json
import math
import os
import re
import time
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
PUB = ROOT / "public" / "data"
for p in (RAW, PROC, PUB):
    p.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "ChargeEVSetu/1.0 (Techfest IITB EV challenge; open-data research)"}
TODAY = date.today().isoformat()

# Overpass mirrors, tried in order (the main instance often returns 429/502 to scripts).
OVERPASS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
if os.environ.get("OVERPASS_PRIMARY") == "de":  # lets a second worker use the other server first
    OVERPASS.reverse()


def overpass(query: str, retries: int = 4) -> dict:
    last = None
    for url in OVERPASS:
        for attempt in range(retries):
            try:
                r = requests.post(url, data={"data": query}, headers=UA, timeout=(15, 330))  # (connect, read): fail fast on unreachable servers
                if r.status_code == 200:
                    return r.json()
                last = f"{url} -> HTTP {r.status_code}"
            except Exception as e:  # network errors: try next attempt / mirror
                last = f"{url} -> {e}"
            time.sleep(10 * (attempt + 1))  # 429/504 under load: back off
    raise RuntimeError(f"All Overpass mirrors failed: {last}")


# Canonical state/UT names (current, 36). Every dataset is mapped onto these.
STATES = [
    "Andaman & Nicobar", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
    "Chhattisgarh", "Dadra & Nagar Haveli and Daman & Diu", "Delhi", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
    "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
]

# Spelling variants seen across PIB, VAHAN, Census, DataMeet, OSM -> canonical.
ALIASES = {
    "andaman & nicobar island": "Andaman & Nicobar", "andaman and nicobar islands": "Andaman & Nicobar",
    "andaman & nicobar islands": "Andaman & Nicobar", "andaman and nicobar": "Andaman & Nicobar",
    "arunanchal pradesh": "Arunachal Pradesh", "nct of delhi": "Delhi", "delhi": "Delhi",
    "u.p": "Uttar Pradesh", "u.p.": "Uttar Pradesh", "up": "Uttar Pradesh",
    "jammu and kashmir": "Jammu & Kashmir", "orissa": "Odisha", "pondicherry": "Puducherry",
    "dadara & nagar havelli": "Dadra & Nagar Haveli and Daman & Diu", "daman & diu": "Dadra & Nagar Haveli and Daman & Diu",
    "dadra and nagar haveli": "Dadra & Nagar Haveli and Daman & Diu", "daman and diu": "Dadra & Nagar Haveli and Daman & Diu",
    "ut of d&nh and d&d": "Dadra & Nagar Haveli and Daman & Diu", "ut of dnh and dd": "Dadra & Nagar Haveli and Daman & Diu",
    "dadra and nagar haveli and daman and diu": "Dadra & Nagar Haveli and Daman & Diu",
    "uttaranchal": "Uttarakhand", "chattisgarh": "Chhattisgarh", "tamilnadu": "Tamil Nadu",
}


def norm_state(name: str) -> str:
    k = re.sub(r"\s+", " ", str(name).strip()).lower()
    if k in ALIASES:
        return ALIASES[k]
    for s in STATES:
        if s.lower() == k:
            return s
    t = k.replace(" and ", " & ")
    for s in STATES:
        if s.lower() == t:
            return s
    raise KeyError(f"Unknown state name: {name!r}")


# ---- provenance -------------------------------------------------------------
PROV_FILE = PROC / "provenance.json"


def provenance(key: str, **entry) -> None:
    """Record where a dataset came from. Merged into public/data/sources.json by build.py."""
    data = json.loads(PROV_FILE.read_text("utf-8")) if PROV_FILE.exists() else {}
    entry.setdefault("fetched", TODAY)
    data[key] = {**data.get(key, {}), **entry}
    PROV_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), "utf-8")


def clean(o):
    """JSON-safe: NaN/inf -> None, numpy scalars -> Python. Browsers reject NaN in JSON."""
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, float) or type(o).__module__ == "numpy":
        try:
            f = float(o)
        except (TypeError, ValueError):
            return o
        if not math.isfinite(f):
            return None
        return int(f) if type(o).__name__.startswith(("int", "uint")) else round(f, 6)
    return o


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(clean(obj), separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    path.write_text(txt, "utf-8")
    print(f"  wrote {path.relative_to(ROOT)} ({len(txt)/1024:.0f} KB)")
