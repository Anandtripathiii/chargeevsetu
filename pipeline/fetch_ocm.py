"""Open Charge Map (countrycode=IN). Needs OCM_API_KEY in .env or the environment; skipped if missing."""
import json
import os

import requests

from common import RAW, ROOT, UA, provenance

OUT = RAW / "ocm" / "ocm_in.json"


def api_key():
    if os.environ.get("OCM_API_KEY"):
        return os.environ["OCM_API_KEY"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text("utf-8").splitlines():
            if line.strip().startswith("OCM_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"')
    return None


def main():
    key = api_key()
    if not key:
        print("OCM: no OCM_API_KEY -> skipped")
        provenance("ocm", name="Open Charge Map (countrycode=IN)", url="https://openchargemap.org/site/develop/api",
                   licence="CC BY 4.0", records=0, source_type="real", status="skipped: OCM_API_KEY not set",
                   limitations="Add a free key to .env and re-run `python pipeline/run_all.py` to merge it.")
        return
    r = requests.get("https://api.openchargemap.io/v3/poi", headers={**UA, "X-API-Key": key}, timeout=180,
                     params={"countrycode": "IN", "maxresults": 20000, "compact": "true", "verbose": "false"})
    r.raise_for_status()
    data = r.json()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data), "utf-8")
    print(f"OCM: {len(data)} POIs")
    provenance("ocm", name="Open Charge Map (countrycode=IN)", url="https://api.openchargemap.io/v3/poi?countrycode=IN",
               licence="CC BY 4.0", records=len(data), source_type="real", status="ok",
               cleaning="Connections reduced to max kW and connector types.",
               limitations="Crowd-sourced; some entries stale.")


if __name__ == "__main__":
    main()
