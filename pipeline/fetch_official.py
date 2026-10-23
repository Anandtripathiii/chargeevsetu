"""Official government figures (PIB / Lok Sabha), parsed from the saved source documents.

Produces data/processed/official_chargers_state.csv, official_ev_state_2023.csv, official_national.json
"""
import html
import json
import re

import pandas as pd
import requests
from pypdf import PdfReader

from common import PROC, RAW, UA, norm_state, provenance

OFF = RAW / "official"
OFF.mkdir(parents=True, exist_ok=True)

DOCS = {
    "pib_chargers_aug2025.pdf": "https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/aug/doc202581598101.pdf",
    "pib_1947389.html": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=1947389",
    "ls_AU1956_NQ8q4A.pdf": "https://sansad.in/getFile/lsapps/loksabhaquestions/annex/188/AU1956_NQ8q4A.pdf",
    "ls_AU453_QsLfVk.pdf": "https://sansad.in/getFile/lsapps/loksabhaquestions/annex/188/AU453_QsLfVk.pdf",
}


def download():
    for name, url in DOCS.items():
        f = OFF / name
        if f.exists() and f.stat().st_size > 5000:
            continue
        r = requests.get(url, headers={**UA, "User-Agent": "Mozilla/5.0"}, timeout=90)
        r.raise_for_status()
        f.write_bytes(r.content)


def pdf_text(name):
    return "\n".join(p.extract_text() for p in PdfReader(OFF / name).pages)


def num(s):
    return int(s.replace(",", ""))


def main():
    download()

    # 1. State-wise public charging stations (PIB annexure, MoP inputs, Aug 2025)
    t = pdf_text("pib_chargers_aug2025.pdf")
    rows = re.findall(r"^\s*\d+\s+(.+?)\s+([\d,]+)\s*$", t, flags=re.M)
    ch = pd.DataFrame([(norm_state(n), num(v)) for n, v in rows], columns=["state", "official_chargers_2025"])
    total = num(re.search(r"Total\s+([\d,]+)", t).group(1))
    assert ch.official_chargers_2025.sum() == total, (ch.official_chargers_2025.sum(), total)
    ch.to_csv(PROC / "official_chargers_state.csv", index=False)
    provenance("official_chargers", name="State-wise public EV charging stations (Ministry of Power inputs, PIB annexure)",
               url=DOCS["pib_chargers_aug2025.pdf"], licence="Government of India (GODL / public record)",
               records=len(ch), source_type="real", total=total, as_of="Aug 2025",
               cleaning="Parsed from PDF; state names normalised; row total checked against printed total (29,277).",
               limitations="Counts stations, not connectors. Telangana/Andhra split as reported.")

    # 2. State-wise EV stock as on 03.08.2023 + year-wise registrations (PIB 1947389, Lok Sabha)
    h = (OFF / "pib_1947389.html").read_text("utf-8", errors="ignore")
    h = re.sub(r"<script.*?</script>|<style.*?</style>", "", h, flags=re.S)
    h = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h)))
    seg = h[h.find("as on 03.08.2023 1 ") : h.find("Grand Total")]
    pairs = re.findall(r"(?<![\d,])\d{1,2} ([A-Za-z][A-Za-z&. ]*?) ([\d,]+)", seg.split("as on 03.08.2023 ", 1)[1])
    ev = pd.DataFrame([(norm_state(n), num(v)) for n, v in pairs], columns=["state", "ev_stock_2023"])
    gt = num(re.search(r"Grand Total ([\d,]+)", h).group(1))
    assert ev.ev_stock_2023.sum() == gt, (ev.ev_stock_2023.sum(), gt, len(ev))
    ev.to_csv(PROC / "official_ev_state_2023.csv", index=False)
    yr = {int(y): num(v) for y, v in re.findall(r"(20(?:18|19|20|21|22)) (\d{6,7})", h)}
    provenance("official_ev_state", name="State-wise registered EVs as on 03-08-2023 (VAHAN, Lok Sabha reply via PIB)",
               url=DOCS["pib_1947389.html"], licence="Government of India (public record)", records=len(ev),
               source_type="real", total=gt, as_of="2023-08-03",
               cleaning="Parsed from press-release HTML; names normalised; total checked (28,30,565).",
               limitations="Telangana and Lakshadweep not reported (Telangana not on central VAHAN then).")

    # 3. National anchors from Lok Sabha replies, July 2026
    a = pdf_text("ls_AU1956_NQ8q4A.pdf")
    b = pdf_text("ls_AU453_QsLfVk.pdf")
    nat = {
        "ev_stock_total": num(re.search(r"is\s*([\d,]{9,})\s*for all categories", a).group(1)),
        "ev_stock_as_of": "2026-07-26",
        "public_chargers_total": num(re.search(r"there are ([\d,]+) EV Charging stations", a).group(1)),
        "public_chargers_as_of": "2026-03-31",
        "fast_car_chargers": num(re.search(r"out of which ([\d,]+) public", b).group(1)),
        "ev_penetration_fy20": 0.71, "ev_penetration_fy26": 8.26,
        # Calendar-year registrations. 2018-2022: PIB 1947389 (VAHAN). 2023-2025: VAHAN totals as
        # reported by FADA/IESA (secondary reporting of the same dashboard).
        "annual_registrations": {**yr, 2023: 1530000, 2024: 1950000, 2025: 2300000},
        "annual_registrations_secondary_years": [2023, 2024, 2025],
    }
    assert nat["ev_stock_total"] > 9_000_000 and nat["public_chargers_total"] > 40_000, nat
    (PROC / "official_national.json").write_text(json.dumps(nat, indent=2), "utf-8")
    provenance("official_national", name="National EV stock & charger totals (Lok Sabha USQ 1956 & 453, July 2026)",
               url=DOCS["ls_AU1956_NQ8q4A.pdf"] + " ; " + DOCS["ls_AU453_QsLfVk.pdf"],
               licence="Government of India (public record)", source_type="real",
               cleaning="Values parsed from reply text.",
               limitations="BHEL-portal charger total has no state split; we scale the 2025 state split to it.")
    provenance("annual_registrations", name="Year-wise EV registrations 2018-2025",
               url="PIB 1947389 (2018-22); FADA / IESA reporting of VAHAN (2023: 1.53M, 2024: 1.95M, 2025: 2.3M)",
               licence="Public record / press", source_type="real",
               limitations="2023-25 are rounded figures from secondary reports of VAHAN, not the dashboard itself.")
    print(f"official: {len(ch)} charger rows, {len(ev)} EV rows, national EVs {nat['ev_stock_total']:,}")


if __name__ == "__main__":
    main()
