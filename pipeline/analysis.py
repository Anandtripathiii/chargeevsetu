"""ChargeEVSetu analysis engine: every formula used by the site lives here.

Mirrored 1:1 in src/lib/model.ts so the browser can recompute live when users move sliders.
tests: pipeline/test_analysis.py checks both stay in agreement (via public/data/selfcheck.json).
"""
import math

import numpy as np
from scipy.optimize import curve_fit

# ---------------------------------------------------------------------------
# 1. Supply vs demand indicators
# ---------------------------------------------------------------------------

def indicators(evs, chargers, population, nh_km, area_km2, fast_chargers=None):
    """Per state/district ratios. Division guarded: zero chargers -> EVs-per-charger = EVs (worst case)."""
    return {
        "evs_per_charger": evs / max(chargers, 1),
        "chargers_per_lakh": chargers / max(population, 1) * 1e5,
        "chargers_per_100km_nh": chargers / nh_km * 100 if nh_km > 0 else None,
        "chargers_per_100km2": chargers / max(area_km2, 1e-9) * 100,
        "fast_share": (fast_chargers / chargers) if fast_chargers is not None and chargers else None,
    }


# ---------------------------------------------------------------------------
# 2. Coverage (Ministry of Power guidelines, 2024)
# ---------------------------------------------------------------------------
CITY_RADIUS_KM = 3.0      # >=1 charger in every 3 km x 3 km grid  -> within ~3 km
HIGHWAY_SPACING_KM = 25.0  # a charger every 25 km on both sides of highways
HEAVY_SPACING_KM = 100.0   # long-range / heavy-duty vehicles


def city_coverage(cell_dist_km, cell_pop):
    """% of urban population (WorldPop cells >= URBAN_DENSITY) within CITY_RADIUS_KM of a charger."""
    d, p = np.asarray(cell_dist_km), np.asarray(cell_pop)
    return float((p * (d <= CITY_RADIUS_KM)).sum() / p.sum() * 100) if p.sum() else 0.0


def highway_gap(segment_dist_km):
    """A highway segment is a gap if the nearest charger is farther than half the spacing (so >25 km run without one)."""
    return segment_dist_km > HIGHWAY_SPACING_KM / 2


# ---------------------------------------------------------------------------
# 3. Gap Score (0-100), transparent weighted index
# ---------------------------------------------------------------------------
GAP_FACTORS = {
    # key: (label, transform, default weight). log1p for heavy-tailed factors so megacities don't flatten everyone else.
    "ev_density":      ("EV density (EVs per km²)",              "log", 0.20),
    "evs_per_charger": ("EVs per public charger (stress)",       "log", 0.30),
    "dist_km":         ("Distance from people to nearest charger", "lin", 0.25),
    "urban_pop":       ("Urban population",                      "log", 0.10),
    "corridor":        ("Highway, tourism & logistics importance", "lin", 0.15),
}


def minmax(values, transform="lin"):
    v = np.asarray(values, dtype=float)
    if transform == "log":
        v = np.log1p(np.maximum(v, 0))
    lo, hi = np.nanmin(v), np.nanmax(v)
    return np.zeros_like(v) if hi - lo < 1e-12 else (v - lo) / (hi - lo)


def gap_scores(rows, weights=None):
    """rows: list of dicts with the GAP_FACTORS keys. Returns 0-100 score per row.
    raw = sum_i w_i * norm_i / sum_i w_i ;  score = 100 * (raw - min raw) / (max raw - min raw)
    so 0 = best-served district and 100 = most underserved under the chosen weights."""
    w = {k: (weights or {}).get(k, d[2]) for k, d in GAP_FACTORS.items()}
    tot = sum(w.values()) or 1
    s = np.zeros(len(rows))
    for k, (_, tf, _) in GAP_FACTORS.items():
        s += w[k] * minmax([r[k] for r in rows], tf)
    return 100 * minmax(s / tot)


def corridor_importance(nh_km_per_100km2, tourism_pois, logistics_pois):
    """0-1 composite: 50% NH density, 30% tourism, 20% logistics (each min-max over districts)."""
    return 0.5 * minmax(nh_km_per_100km2) + 0.3 * minmax(tourism_pois, "log") + 0.2 * minmax(logistics_pois, "log")


CRITICAL_QUANTILE = 0.90  # "critical need" = top 10% of districts by Gap Score


# ---------------------------------------------------------------------------
# 4. Forecasting EV stock
# ---------------------------------------------------------------------------

def cagr_model(t, a, g):
    return a * np.power(1 + g, t)


def logistic_model(t, k, r, t0):
    return k / (1 + np.exp(-r * (t - t0)))


def r2(y, yhat):
    y, yhat = np.asarray(y, float), np.asarray(yhat, float)
    return float(1 - ((y - yhat) ** 2).sum() / ((y - y.mean()) ** 2).sum())


def mape(y, yhat):
    y, yhat = np.asarray(y, float), np.asarray(yhat, float)
    return float(np.mean(np.abs((y - yhat) / y)) * 100)


def fit_models(years, stock, k_bounds=(3e7, 3.5e8)):
    """Fit CAGR (exponential) and logistic S-curve to stock series; t = year - years[0].
    Logistic saturation K is bounded by a plausible share of India's ~35 crore registered vehicles."""
    t = np.asarray(years, float) - years[0]
    y = np.asarray(stock, float)
    (a, g), _ = curve_fit(cagr_model, t, y, p0=(y[0], 0.3), maxfev=20000)
    (k, r, t0), _ = curve_fit(logistic_model, t, y, p0=(1e8, 0.4, t[-1] + 5),
                              bounds=([k_bounds[0], 0.05, 0], [k_bounds[1], 2.0, 40]), maxfev=20000)
    return {
        "cagr": {"a": a, "g": g, "r2": r2(y, cagr_model(t, a, g)), "mape": mape(y, cagr_model(t, a, g))},
        "logistic": {"k": k, "r": r, "t0": t0, "r2": r2(y, logistic_model(t, k, r, t0)),
                     "mape": mape(y, logistic_model(t, k, r, t0))},
        "t0_year": years[0],
    }


# Scenario EV *sales share* path, anchored on India's 30%-by-2030 ambition (base).
# share(year) linear between anchor points; total vehicle sales grow SALES_GROWTH per year.
SCENARIOS = {
    "low":  {2025: 0.08, 2030: 0.18, 2035: 0.30},
    "base": {2025: 0.08, 2030: 0.30, 2035: 0.50},
    "high": {2025: 0.08, 2030: 0.40, 2035: 0.70},
}
SALES_GROWTH = 0.04          # total new-vehicle sales growth per year (all fuels)
FLEET_RETIREMENT = 0.03      # share of EV stock retired per year (old 3W/2W batteries scrapped)


def scenario_stock(stock0, year0, total_sales0, scenario, to_year=2035):
    """Stock_{y+1} = Stock_y * (1 - retirement) + TotalSales_y * EVshare_y."""
    pts = SCENARIOS[scenario]
    keys = sorted(pts)
    out, s, sales = {year0: stock0}, stock0, total_sales0
    for y in range(year0 + 1, to_year + 1):
        sales *= 1 + SALES_GROWTH
        lo = max(k for k in keys if k <= y) if y >= keys[0] else keys[0]
        hi = min((k for k in keys if k >= y), default=keys[-1])
        share = pts[lo] if hi == lo else pts[lo] + (pts[hi] - pts[lo]) * (y - lo) / (hi - lo)
        s = s * (1 - FLEET_RETIREMENT) + sales * share
        out[y] = s
    return out


# ---------------------------------------------------------------------------
# 5. Chargers needed
# ---------------------------------------------------------------------------
# Target EVs per *public* charger by vehicle type. 4W follows EU AFID 2014/94 guidance (~10 EVs per public
# point, also the IEA Global EV Outlook global average). 2W/3W charge mostly at home/depots or swap batteries,
# so far higher ratios; buses charge at depots. All user-adjustable on the site.
TARGET_RATIO = {"2W": 100, "3W": 40, "4W": 10, "Bus": 3, "Goods": 15}
# National EV stock mix (derived from 2025 VAHAN sales mix reported by IESA/FADA: e2W 57%, e3W ~36%, e4W ~7%).
VEHICLE_MIX = {"2W": 0.56, "3W": 0.37, "4W": 0.06, "Bus": 0.004, "Goods": 0.006}
DC_TYPES = {"4W", "Bus", "Goods"}  # need DC fast charging; 2W/3W mostly slow AC


def blended_ratio(mix=VEHICLE_MIX, ratios=TARGET_RATIO):
    """Harmonic blend: total EVs / sum(EVs_type / ratio_type)."""
    return 1 / sum(mix[k] / ratios[k] for k in mix)


def chargers_needed(evs, ratio=None, mix=VEHICLE_MIX, ratios=TARGET_RATIO, existing=0):
    """Required public chargers by type; additional = max(0, required - existing)."""
    ratio = ratio or blended_ratio(mix, ratios)
    scale = blended_ratio(mix, ratios) / ratio  # slider moves all types proportionally
    by_type = {k: evs * mix[k] / ratios[k] * scale for k in mix}
    req = sum(by_type.values())
    return {"required": req, "additional": max(0.0, req - existing), "by_type": by_type,
            "dc": sum(v for k, v in by_type.items() if k in DC_TYPES)}


# ---------------------------------------------------------------------------
# 6. Site recommendation: greedy maximum coverage
# ---------------------------------------------------------------------------
SITE_RADIUS_KM = 3.0
SITE_WEIGHTS = {"demand": 0.6, "supply_gap": 0.25, "grid": 0.1, "highway": 0.05}


def haversine_km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = 0.5 - math.cos((lat2 - lat1) * p) / 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    return 12742 * math.asin(math.sqrt(a))


def cell_score(c):
    """Cell value = demand (pop + POIs) x unmet share, plus grid and highway bonus.  c fields are pre-normalised 0-1."""
    return (SITE_WEIGHTS["demand"] * c["demand"] + SITE_WEIGHTS["supply_gap"] * c["gap"]
            + SITE_WEIGHTS["grid"] * c["grid"] + SITE_WEIGHTS["highway"] * c["hw"])


def greedy_sites(cells, n_hubs, hub_size=10, ratio=None, radius_km=SITE_RADIUS_KM):
    """Capacity-aware greedy siting.

    Each cell j has EVs e_j and C_j chargers within radius. Its share of demand met is
        s_j = min(1, ratio * C_j / E_j),   E_j = EVs of all cells within radius of j
    (nearby chargers are shared by nearby EVs in proportion to demand).
    A hub of `hub_size` chargers at cell k adds hub_size to C_j for every j within radius of k.
    Each round picks the hub with the largest gain  sum_j e_j * (s_j' - s_j) * (0.5 + cell_score(k)).
    Returns picks, % of EVs served before/after, and % of population within radius of a charger before/after."""
    ratio = ratio or blended_ratio()
    nb = [[j for j, o in enumerate(cells) if haversine_km(c["lat"], c["lon"], o["lat"], o["lon"]) <= radius_km] for c in cells]
    E = [sum(cells[j]["evs"] for j in nb[i]) or 1 for i in range(len(cells))]
    C = [c["ch3"] for c in cells]
    served = lambda j, cj: min(1.0, ratio * cj / E[j])
    tot_ev = sum(c["evs"] for c in cells) or 1
    tot_pop = sum(c["pop"] for c in cells) or 1
    before = sum(c["evs"] * served(j, C[j]) for j, c in enumerate(cells)) / tot_ev * 100
    cov_before = sum(c["pop"] for j, c in enumerate(cells) if C[j] > 0) / tot_pop * 100
    picks = []
    for _ in range(n_hubs):
        best, best_gain = -1, 0.0
        for k in range(len(cells)):
            g = sum(cells[j]["evs"] * (served(j, C[j] + hub_size) - served(j, C[j])) for j in nb[k])
            g *= 0.5 + cell_score(cells[k])
            if g > best_gain:
                best, best_gain = k, g
        if best < 0:
            break
        picks.append(best)
        for j in nb[best]:
            C[j] += hub_size
    after = sum(c["evs"] * served(j, C[j]) for j, c in enumerate(cells)) / tot_ev * 100
    cov_after = sum(c["pop"] for j, c in enumerate(cells) if C[j] > 0) / tot_pop * 100
    return picks, before, after, cov_before, cov_after
