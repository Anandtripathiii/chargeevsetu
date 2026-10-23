"""Clean -> merge -> analyse -> write the static site data in public/data/.

Inputs come from fetch_*.py (data/raw, data/processed). Every output record carries source_type
("real" | "derived" | "synthetic"); every dataset has an entry in public/data/sources.json.
"""
import difflib
import json
import re

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
import shapely
from shapely.geometry import LineString, MultiLineString, mapping
from shapely.ops import unary_union

import analysis as A
from common import PROC, PROV_FILE, PUB, RAW, STATES, TODAY, norm_state, provenance, write_json

RNG = np.random.default_rng(42)
TELANGANA = {"Adilabad", "Hyderabad", "Karimnagar", "Khammam", "Mahbubnagar", "Medak", "Nalgonda",
             "Nizamabad", "Rangareddy", "Warangal"}
POP_GROWTH_2011_2026 = 1.46e9 / 1.2109e9   # UN WPP 2024 India 2026 / Census 2011 (uniform; see limitations)
URBAN_DENSITY = 1500                        # people/km² threshold for an "urban" 1 km cell (GHS-SMOD / Eurostat urban centre)
CORRIDORS = {"NH-48 Delhi-Jaipur": ("NH-48", (75.6, 26.75, 77.35, 28.75))}
CORRIDOR_KM = 10
NCR = {"Delhi": None, "Haryana": {"Gurgaon", "Faridabad"}, "Uttar Pradesh": {"Gautam Buddha Nagar", "Ghaziabad"}}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def km_xy(lon, lat):
    """Equirectangular projection to km, good enough for nearest-neighbour within India."""
    lat = np.asarray(lat, float)
    return np.c_[np.asarray(lon, float) * 111.32 * np.cos(np.radians(22)), lat * 110.57]


def rnd(x, n=4):
    return round(float(x), n)


# ---------------------------------------------------------------------------
def load_districts():
    g = gpd.read_file(RAW / "boundaries" / "2011_Dist.shp").to_crs(4326)
    c = pd.read_csv(RAW / "census" / "india-districts-census-2011.csv")
    g = g.merge(c, left_on="censuscode", right_on="District code", how="left")
    disputed = g[g.DISTRICT == "Data Not Available"].geometry
    g = g[g.DISTRICT != "Data Not Available"].copy()
    g["state"] = [
        "Telangana" if (s == "Andhra Pradesh" and d in TELANGANA) else
        "Ladakh" if d in ("Leh (ladakh)", "Kargil") else norm_state(s)
        for s, d in zip(g.ST_NM, g.DISTRICT)]
    g["name"] = g.DISTRICT.str.replace("Leh (ladakh)", "Leh", regex=False)
    g["id"] = [f"{slug(s)}--{slug(n)}" for s, n in zip(g.state, g.name)]
    g["pop2011"] = g.Population.fillna(0)
    g["pop"] = g.pop2011 * POP_GROWTH_2011_2026
    g["urban_share"] = (g.Urban_Households / g.Households).fillna(0).clip(0, 1)
    g["veh_hh"] = g.Households_with_Scooter_Motorcycle_Moped.fillna(0) + 2 * g.Households_with_Car_Jeep_Van.fillna(0)
    g["area_km2"] = g.to_crs(6933).area / 1e6
    g = g[["id", "name", "state", "pop2011", "pop", "urban_share", "veh_hh", "area_km2", "geometry"]].reset_index(drop=True)
    provenance("boundaries", name="District & state boundaries (Census 2011 districts, DataMeet)",
               url="https://github.com/datameet/maps/tree/master/Districts/Census_2011", licence="CC BY 2.5 IN (DataMeet)",
               records=len(g), source_type="real",
               cleaning="Telangana districts split from Andhra Pradesh; Leh & Kargil moved to Ladakh; states dissolved from "
                        "districts; geometry simplified (states ~1 km, districts ~500 m).",
               limitations="2011 district map (640 districts). India now has ~780 districts; new districts sit inside their "
                           "parent 2011 district.")
    provenance("census", name="Census of India 2011 district tables (population, households, urban households, vehicle ownership)",
               url="https://github.com/nishusharma1608/India-Census-2011-Analysis (Census 2011 PCA/HH tables)",
               licence="Government of India open data", records=len(c), source_type="real",
               cleaning="Joined on census district code; urban share = urban households / households.",
               limitations="2026 population = 2011 x 1.206 (UN WPP national growth) for every district -> marked Estimated.")
    return g, disputed


def load_worldpop(districts):
    """1 km population cells with district index. Returns DataFrame lon, lat, pop, d (district row)."""
    import rasterio
    from rasterio import features
    f = RAW / "worldpop" / "ind_pop_2020_1km.tif"
    with rasterio.open(f) as src:
        arr = src.read(1).astype("float32")
        arr[arr < 0] = 0
        shapes = ((geom, i + 1) for i, geom in enumerate(districts.geometry))
        did = features.rasterize(shapes, out_shape=arr.shape, transform=src.transform, fill=0, dtype="int32")
        rows, cols = np.nonzero((arr > 1) & (did > 0))
        xs, ys = rasterio.transform.xy(src.transform, rows, cols)
    cells = pd.DataFrame({"lon": np.asarray(xs), "lat": np.asarray(ys), "pop": arr[rows, cols], "d": did[rows, cols] - 1})
    # rescale to 2026 district population so cells agree with the district table
    scale = districts["pop"].values[cells.d] / cells.groupby("d")["pop"].transform("sum").values
    cells["pop"] = cells["pop"] * np.nan_to_num(scale, nan=1.0)
    provenance("worldpop", name="WorldPop 2020 population grid, 1 km, UN-adjusted (India)",
               url="https://hub.worldpop.org/geodata/summary?id=31751 (ind_ppp_2020_1km_Aggregated_UNadj.tif)",
               licence="CC BY 4.0", records=len(cells), source_type="real",
               cleaning="Cells assigned to districts by rasterising boundaries; rescaled to each district's 2026 population.",
               limitations="Modelled population surface (random-forest dasymetric).")
    return cells


def osm_points(name):
    f = RAW / "osm" / f"{name}.json"
    if not f.exists():
        return []
    out = []
    for el in json.loads(f.read_text("utf-8"))["elements"]:
        if "lat" in el:
            out.append((el["lon"], el["lat"], el.get("tags", {})))
        elif "center" in el:
            out.append((el["center"]["lon"], el["center"]["lat"], el.get("tags", {})))
    return out


DC_SOCKETS = ("ccs", "chademo", "type2_combo", "gb_t", "tesla_supercharger")
OPERATOR_CANON = {  # normalise frequent operator spellings
    "tata": "Tata Power", "statiq": "Statiq", "chargezone": "ChargeZone", "charge zone": "ChargeZone",
    "jio": "Jio-bp", "ather": "Ather Grid", "eesl": "EESL", "indian oil": "IndianOil", "iocl": "IndianOil",
    "bpcl": "BPCL", "bharat petroleum": "BPCL", "hpcl": "HPCL", "hindustan petroleum": "HPCL", "zeon": "Zeon",
    "glida": "Glida", "fortum": "Glida", "relux": "Relux", "kazam": "Kazam", "bolt": "Bolt.Earth", "ntpc": "NTPC",
    "mg ": "MG Motor", "ola": "Ola", "evre": "EVRE", "electreefi": "Electreefi", "chargegrid": "ChargeGrid",
    "kseb": "KSEB", "tneb": "TANGEDCO", "bescom": "BESCOM", "msedcl": "MSEDCL", "tesla": "Tesla", "shell": "Shell Recharge",
}


def canon_operator(op):
    if not op:
        return "Unknown"
    l = op.lower() + " "
    return next((v for k, v in OPERATOR_CANON.items() if k in l), op.strip()[:40])


def kw_of(tags):
    vals = []
    for k, v in tags.items():
        if k.endswith(":output") or k == "charging_station:output":
            vals += [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*kw", str(v).lower())]
    return max(vals) if vals else None


def load_chargers():
    rows = []
    for lon, lat, t in osm_points("chargers"):
        kw = kw_of(t)
        dc = any(t.get(f"socket:{s}") not in (None, "no", "0") for s in DC_SOCKETS) or (kw or 0) >= 25
        rows.append({"lon": lon, "lat": lat, "operator": canon_operator(t.get("operator") or t.get("brand") or t.get("network")),
                     "name": t.get("name", ""), "kw": kw, "dc": dc,
                     "sockets": int(t["capacity"]) if str(t.get("capacity", "")).isdigit() else None, "sources": ["osm"]})
    n_osm = len(rows)
    ocm_f = RAW / "ocm" / "ocm_in.json"
    merged = added = 0
    if ocm_f.exists():
        tree = cKDTree(km_xy([r["lon"] for r in rows], [r["lat"] for r in rows])) if rows else None
        for p in json.loads(ocm_f.read_text("utf-8")):
            ai = p.get("AddressInfo") or {}
            if ai.get("Latitude") is None:
                continue
            op = canon_operator((p.get("OperatorInfo") or {}).get("Title"))
            name = ai.get("Title", "")
            kws = [c.get("PowerKW") or 0 for c in (p.get("Connections") or [])]
            dup = None
            if tree is not None:
                for j in tree.query_ball_point(km_xy([ai["Longitude"]], [ai["Latitude"]])[0], r=0.05):
                    o = rows[j]
                    # same place (<=50 m) and same/unknown operator or similar name -> one charger
                    if o["operator"] in ("Unknown", op) or op == "Unknown" or \
                            difflib.SequenceMatcher(None, o["name"].lower(), name.lower()).ratio() > 0.5:
                        dup = o
                        break
            if dup:
                dup["sources"].append("ocm")
                dup["kw"] = max(dup["kw"] or 0, max(kws, default=0)) or None
                dup["dc"] = dup["dc"] or max(kws, default=0) >= 25
                merged += 1
            else:
                rows.append({"lon": ai["Longitude"], "lat": ai["Latitude"], "operator": op, "name": name,
                             "kw": max(kws, default=0) or None, "dc": max(kws, default=0) >= 25, "sockets": len(kws) or None,
                             "sources": ["ocm"]})
                added += 1
    df = pd.DataFrame(rows)
    df["source_type"] = "real"
    print(f"  chargers: OSM {n_osm}, OCM merged {merged}, OCM added {added} -> {len(df)} unique")
    provenance("merge_chargers", name="Merged real charger points (OSM + OCM, de-duplicated)", source_type="real",
               records=len(df), url="derived in pipeline/build.py",
               cleaning=f"OSM {n_osm}; OCM duplicates merged {merged}; OCM new {added}. Rule: <=50 m apart and same/unknown "
                        "operator or name similarity > 0.5 -> one charger with both sources listed.",
               limitations="Mapped points cover only part of the official total; see completeness per state.")
    return df


def load_highways(districts):
    f = RAW / "osm" / "highways.json"
    if not f.exists():
        return gpd.GeoDataFrame(columns=["ref", "geometry"], geometry="geometry", crs=4326)
    by_ref = {}
    for el in json.loads(f.read_text("utf-8"))["elements"]:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        ref = re.split(r"[;,]", el["tags"].get("ref", ""))[0].replace(" ", "").upper()
        ref = re.sub(r"^NH0*", "NH-", ref)
        t = el["tags"]
        # dual carriageways are mapped as two one-way ways: each counts as half a road length
        oneway = t.get("oneway") in ("yes", "1", "-1") or (t.get("highway") == "motorway" and t.get("oneway") != "no")
        by_ref.setdefault((ref, oneway), []).append(LineString([(p["lon"], p["lat"]) for p in el["geometry"]]))
    lines = []
    for (ref, oneway), ls in by_ref.items():
        m = shapely.line_merge(MultiLineString(ls)).simplify(0.002)
        for part in getattr(m, "geoms", [m]):
            if part.length > 0:
                lines.append({"ref": ref, "w": 0.5 if oneway else 1.0, "geometry": part})
    return gpd.GeoDataFrame(lines, geometry="geometry", crs=4326)


def segments(hw, seg_km=5.0):
    """Split highway lines into ~seg_km pieces (in projected metres), return GeoDataFrame in 4326."""
    p = hw.to_crs(7755)  # India-wide projected CRS (metres)
    out = []
    for ref, w, geom in zip(p.ref, p.w, p.geometry):
        n = max(1, int(round(geom.length / (seg_km * 1000))))
        pts = [geom.interpolate(i / n, normalized=True) for i in range(n + 1)]
        for a, b in zip(pts[:-1], pts[1:]):
            out.append({"ref": ref, "len_km": w * a.distance(b) / 1000, "geometry": LineString([a, b])})
    return gpd.GeoDataFrame(out, geometry="geometry", crs=7755).to_crs(4326)


# ---------------------------------------------------------------------------
def main():
    off_ch = pd.read_csv(PROC / "official_chargers_state.csv")
    off_ev = pd.read_csv(PROC / "official_ev_state_2023.csv")
    nat = json.loads((PROC / "official_national.json").read_text("utf-8"))
    vahan_manual = pd.read_csv(PROC / "vahan_manual.csv") if (PROC / "vahan_manual.csv").exists() else pd.DataFrame()

    print("districts ...")
    D, disputed = load_districts()
    print("worldpop ...")
    cells = load_worldpop(D)

    # ---- state table ------------------------------------------------------
    S = D.assign(urban_pop=D["pop"] * D.urban_share).groupby("state").agg(
        pop=("pop", "sum"), area_km2=("area_km2", "sum"), urban_pop=("urban_pop", "sum")).reset_index()
    S = S.merge(off_ch, on="state", how="left").merge(off_ev, on="state", how="left")
    assert set(S.state) == set(STATES), set(STATES) ^ set(S.state)

    # EV stock 2026 per state (derived): 2023 official state share x 2026 official national total.
    # Telangana & Lakshadweep missing in the 2023 table -> per-capita rate of peer states.
    peers = {"Telangana": ["Andhra Pradesh", "Karnataka", "Tamil Nadu", "Kerala"], "Lakshadweep": ["Andaman & Nicobar", "Puducherry"]}
    S["ev_src"] = np.where(S.ev_stock_2023.notna(), "derived", "derived-peer")
    for st, ps in peers.items():
        pr = S[S.state.isin(ps)]
        S.loc[S.state == st, "ev_stock_2023"] = (pr.ev_stock_2023.sum() / pr["pop"].sum()) * S.loc[S.state == st, "pop"]
    S["evs"] = S.ev_stock_2023 / S.ev_stock_2023.sum() * nat["ev_stock_total"]
    # Chargers 2026 per state (derived): Aug-2025 official state split scaled to the Mar-2026 BHEL national total.
    S["chargers"] = S.official_chargers_2025 / S.official_chargers_2025.sum() * nat["public_chargers_total"]

    # vehicle mix: national default, replaced by VAHAN manual exports where available
    mix = {s: dict(A.VEHICLE_MIX) for s in S.state}
    mix_src = {s: "derived" for s in S.state}
    if len(vahan_manual):
        for st, g in vahan_manual.groupby("state"):
            latest = g[g.year == g.year.max()] if g.year.notna().any() else g
            tot = latest["count"].sum()
            if tot > 0:
                mix[st] = {k: float(latest[latest.category == k]["count"].sum() / tot) for k in A.VEHICLE_MIX}
                mix_src[st] = "real"

    # ---- district split (derived) ----------------------------------------
    # EVs: vehicle-owning households (2W + 2x car, Census 2011) x (0.5 + urban share)
    D["w_ev"] = D.veh_hh * (0.5 + D.urban_share)
    # Chargers: public chargers cluster in cities -> urban population ^1.2
    D["w_ch"] = (D["pop"] * D.urban_share) ** 1.2 + 1
    for col, w in (("evs", "w_ev"), ("chargers_est", "w_ch")):
        tot = S.set_index("state")["evs" if col == "evs" else "chargers"]
        D[col] = D[w] / D.groupby("state")[w].transform("sum") * D.state.map(tot)

    # ---- real chargers -> districts --------------------------------------
    print("chargers ...")
    C = load_chargers()
    Cg = gpd.GeoDataFrame(C, geometry=gpd.points_from_xy(C.lon, C.lat), crs=4326)
    Cg = gpd.sjoin(Cg, D[["id", "state", "geometry"]], how="inner", predicate="within").drop(columns="index_right")
    prov = json.loads(PROV_FILE.read_text("utf-8"))["merge_chargers"]
    provenance("merge_chargers", records=len(Cg), cleaning=prov["cleaning"].split(" Dropped")[0] +
               f" Dropped {len(C) - len(Cg)} points outside India's district boundaries (offshore / across the border).")
    real_by_d = Cg.groupby("id").size()
    D["real_chargers"] = D.id.map(real_by_d).fillna(0).astype(int)
    D["chargers"] = np.maximum(D.chargers_est, D.real_chargers)

    # ---- modelled (synthetic) charger locations ---------------------------
    # Fill each district up to its derived total by sampling WorldPop cells with p ~ pop^1.5 (chargers follow dense demand).
    synth = []
    cell_groups = cells.groupby("d")
    for i, r in D.iterrows():
        n = int(round(r.chargers - r.real_chargers))
        if n <= 0 or i not in cell_groups.groups:
            continue
        cg = cells.loc[cell_groups.groups[i]]
        p = cg["pop"].values ** 1.5
        idx = RNG.choice(len(cg), size=n, p=p / p.sum())
        jit = RNG.uniform(-0.0045, 0.0045, size=(n, 2))
        for k, j in enumerate(idx):
            synth.append((cg.lon.values[j] + jit[k, 0], cg.lat.values[j] + jit[k, 1], i))
    Sy = pd.DataFrame(synth, columns=["lon", "lat", "d"])
    # national fast share (official: 16,561 of 52,718) applied to modelled points
    fast_share = nat["fast_car_chargers"] / nat["public_chargers_total"]
    Sy["dc"] = RNG.random(len(Sy)) < fast_share
    print(f"  modelled locations: {len(Sy)}")
    provenance("modelled_chargers", name="Modelled charger locations (to reach official totals)", source_type="synthetic",
               records=len(Sy), url="generated in pipeline/build.py",
               cleaning="Per district: derived official total minus mapped real points; positions sampled from WorldPop cells "
                        f"with probability ~ population^1.5 (seed 42); DC share {fast_share:.1%} from Lok Sabha USQ 453.",
               limitations="Positions are statistical placeholders, not real stations. Used only so distance/coverage metrics "
                           "reflect the official charger count; switch them off on the map to see mapped points only.")

    all_xy = np.vstack([km_xy(Cg.lon, Cg.lat), km_xy(Sy.lon, Sy.lat)])
    tree_all = cKDTree(all_xy)
    tree_real = cKDTree(km_xy(Cg.lon, Cg.lat))
    cxy = km_xy(cells.lon, cells.lat)
    cells["dist"] = np.minimum(tree_all.query(cxy, k=1)[0], 80)
    cells["dist_real"] = np.minimum(tree_real.query(cxy, k=1)[0], 300)
    cells["urban"] = cells["pop"] >= URBAN_DENSITY  # 1 km² cells, so cell population == density

    def cov(g, col):
        u = g[g.urban]
        return float((u["pop"] * (u[col] <= A.CITY_RADIUS_KM)).sum() / u["pop"].sum() * 100) if len(u) else None

    cg = cells.groupby("d")
    D["dist_km"] = cg.apply(lambda g: np.average(g.dist, weights=g["pop"])).reindex(D.index).fillna(cells.dist.max())
    D["coverage"] = cg.apply(lambda g: cov(g, "dist")).reindex(D.index)
    D["coverage_mapped"] = cg.apply(lambda g: cov(g, "dist_real")).reindex(D.index)
    D["urban_cell_pop"] = cg.apply(lambda g: g[g.urban]["pop"].sum()).reindex(D.index).fillna(0)

    # ---- highways & gaps ---------------------------------------------------
    print("highways ...")
    hw = load_highways(D)
    seg = segments(hw) if len(hw) else gpd.GeoDataFrame(columns=["ref", "len_km", "geometry"], geometry="geometry", crs=4326)
    if len(seg):
        mid = seg.geometry.interpolate(0.5, normalized=True)
        mxy = km_xy(mid.x, mid.y)
        seg["dist"] = tree_all.query(mxy, k=1)[0]
        seg["gap"] = A.highway_gap(seg["dist"].values)
        segp = gpd.GeoDataFrame(seg[["ref", "len_km", "gap"]], geometry=mid, crs=4326)
        segp = gpd.sjoin(segp, D[["id", "geometry"]], how="left", predicate="within")
        seg["district"] = segp.groupby(level=0)["id"].first().values
        seg = seg[seg.district.notna()].reset_index(drop=True)  # bbox tiles also return Nepal/Bangladesh roads
        nh =seg.groupby("district").len_km.sum()
        gap_km = seg[seg.gap].groupby("district").len_km.sum()
    else:
        nh = gap_km = pd.Series(dtype=float)
    D["nh_km"] = D.id.map(nh).fillna(0)
    D["nh_gap_km"] = D.id.map(gap_km).fillna(0)

    # ---- POIs, substations -------------------------------------------------
    def pts_df(name, cat_fn):
        p = osm_points(name)
        df = pd.DataFrame([(lo, la, cat_fn(t)) for lo, la, t in p], columns=["lon", "lat", "cat"])
        return df[df.cat.notna()] if len(df) else df

    def poi_cat(t):
        if t.get("tourism") in ("attraction", "hotel"):
            return "tourism"
        if t.get("landuse") == "logistics":
            return "logistics"
        if t.get("shop") == "mall":
            return "mall"
        return t.get("amenity")

    P = pts_df("pois", poi_cat)
    SS = pts_df("substations", lambda t: t.get("voltage", "") or "sub")
    for name, df in (("tourism", P[P.cat == "tourism"] if len(P) else P), ("logistics", P[P.cat.isin(["logistics", "fuel"])] if len(P) else P)):
        if len(df):
            j = gpd.sjoin(gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df.lon, df.lat), crs=4326), D[["id", "geometry"]], predicate="within")
            D[f"{name}_pois"] = D.id.map(j.groupby("id").size()).fillna(0)
        else:
            D[f"{name}_pois"] = 0.0

    # ---- gap score ---------------------------------------------------------
    D["ev_density"] = D.evs / D.area_km2
    D["evs_per_charger"] = D.evs / D.chargers.clip(lower=1)
    D["urban_pop"] = D["pop"] * D.urban_share
    D["corridor"] = A.corridor_importance(D.nh_km / D.area_km2 * 100, D.tourism_pois, D.logistics_pois)
    D["gap_score"] = A.gap_scores(D[list(A.GAP_FACTORS)].to_dict("records"))
    D["rank"] = D.gap_score.rank(ascending=False, method="first").astype(int)
    CRIT = float(D.gap_score.quantile(A.CRITICAL_QUANTILE))

    # Sensitivity: rank stability when each weight is perturbed +-50% (Spearman vs default)
    sens = {}
    for k in A.GAP_FACTORS:
        for f in (0.5, 1.5):
            w = {kk: v[2] * (f if kk == k else 1) for kk, v in A.GAP_FACTORS.items()}
            alt = A.gap_scores(D[list(A.GAP_FACTORS)].to_dict("records"), w)
            sens[f"{k}x{f}"] = float(pd.Series(alt).rank().corr(D.gap_score.rank(), method="spearman"))
            top = set(np.argsort(-alt)[:50])
            sens[f"{k}x{f}_top50_overlap"] = len(top & set(np.argsort(-D.gap_score.values)[:50])) / 50

    # ---- state aggregates --------------------------------------------------
    agg = D.groupby("state").agg(real_chargers=("real_chargers", "sum"), nh_km=("nh_km", "sum"), nh_gap_km=("nh_gap_km", "sum"),
                                 districts=("id", "count"))
    S = S.merge(agg, left_on="state", right_index=True, how="left")
    sc = cells.assign(state=D.state.values[cells.d])
    cov_s = sc.groupby("state").apply(lambda g: cov(g, "dist"))
    covm_s = sc.groupby("state").apply(lambda g: cov(g, "dist_real"))
    S["coverage"] = S.state.map(cov_s)
    S["coverage_mapped"] = S.state.map(covm_s)
    real_dc = Cg.groupby("state").dc.mean()
    S["fast_share_mapped"] = S.state.map(real_dc)
    S["completeness"] = S.real_chargers / S.official_chargers_2025.clip(lower=1) * 100
    S["gap_score"] = S.state.map(D.assign(w=D.gap_score * D["pop"]).groupby("state").w.sum() / D.groupby("state")["pop"].sum())
    S["critical_districts"] = S.state.map(D[D.gap_score >= CRIT].groupby("state").size()).fillna(0).astype(int)

    # ---- forecast ----------------------------------------------------------
    print("forecast ...")
    reg = {int(k): v for k, v in nat["annual_registrations"].items()}
    jan_jul_2026 = reg[2025] * 1.15 * 7 / 12  # derived: 2025 pace +15% for 7 months
    stock = {2025: nat["ev_stock_total"] - jan_jul_2026}
    for y in range(2025, 2018, -1):
        stock[y - 1] = stock[y] - reg[y]
    years = sorted(stock)
    fits = A.fit_models(years, [stock[y] for y in years])
    back = A.fit_models(years[:5], [stock[y] for y in years[:5]])  # backtest: fit 2018-2022, test 2023-2025
    test_years = years[5:]
    tt = np.array(test_years) - years[0]
    back_err = {
        "cagr": A.mape([stock[y] for y in test_years], A.cagr_model(tt, back["cagr"]["a"], back["cagr"]["g"])),
        "logistic": A.mape([stock[y] for y in test_years], A.logistic_model(tt, back["logistic"]["k"], back["logistic"]["r"], back["logistic"]["t0"])),
    }
    best = "logistic" if fits["logistic"]["mape"] <= fits["cagr"]["mape"] else "cagr"
    total_sales_2025 = reg[2025] / 0.08  # 8% EV share in 2025 (VAHAN via IESA)
    scen = {k: A.scenario_stock(stock[2025], 2025, total_sales_2025, k) for k in A.SCENARIOS}
    forecast = {
        "history": [{"year": y, "stock": rnd(stock[y], 0), "registrations": reg.get(y)} for y in years],
        "fits": fits, "best_fit": best, "backtest_mape": back_err,
        "scenarios": {k: {str(y): rnd(v, 0) for y, v in s.items()} for k, s in scen.items()},
        "scenario_anchors": A.SCENARIOS, "sales_growth": A.SALES_GROWTH, "retirement": A.FLEET_RETIREMENT,
        "total_sales_2025": rnd(total_sales_2025, 0), "stock_2026_official": nat["ev_stock_total"],
        "charger_history": [
            {"date": "2024-02", "chargers": 12146, "src": "PIB Feb 2024 (MoP)"},
            {"date": "2025-08", "chargers": 29277, "src": "PIB annexure Aug 2025 (MoP)"},
            {"date": "2026-03", "chargers": 52718, "src": "Lok Sabha USQ 1956 (BHEL portal)"},
        ],
        "target_ratio": A.TARGET_RATIO, "vehicle_mix": A.VEHICLE_MIX, "blended_ratio": A.blended_ratio(),
        "dc_types": sorted(A.DC_TYPES),
    }
    provenance("forecast", name="EV stock forecast (CAGR & logistic fits; Low/Base/High scenarios)", source_type="derived",
               url="computed in pipeline/analysis.py", records=len(years),
               cleaning=f"Stock series back-calculated from the official 26-Jul-2026 stock minus annual registrations "
                        f"(Jan-Jul 2026 estimated at {jan_jul_2026:,.0f}).",
               limitations="State forecasts assume each state keeps its current share of national EV stock.")

    # ---- recommendation cells per region ----------------------------------
    print("candidate cells ...")
    sxy = km_xy(SS.lon, SS.lat) if len(SS) else None
    tree_ss = cKDTree(sxy) if sxy is not None and len(sxy) else None
    seg_mid = seg.geometry.interpolate(0.5, normalized=True) if len(seg) else None
    tree_hw = cKDTree(km_xy(seg_mid.x, seg_mid.y)) if seg_mid is not None else None
    tree_poi = cKDTree(km_xy(P.lon, P.lat)) if len(P) else None

    regions = {s: D.index[D.state == s] for s in STATES}
    regions["Delhi NCR"] = D.index[[(st in NCR and (NCR[st] is None or nm in NCR[st])) for st, nm in zip(D.state, D.name)]]
    # corridor regions: cells within CORRIDOR_KM of a named NH inside a bounding box
    for name, (ref, (x0, y0, x1, y1)) in CORRIDORS.items():
        if not len(seg):
            break
        m = seg_mid[(seg.ref == ref).values & (seg_mid.x.between(x0, x1)).values & (seg_mid.y.between(y0, y1)).values]
        if len(m):
            near = cKDTree(km_xy(m.x, m.y)).query(cxy, k=1)[0] <= CORRIDOR_KM
            regions[name] = cells.index[near]
    region_meta = []
    os_cells = PUB / "cells"
    for rname, idx in regions.items():
        is_corr = rname in CORRIDORS
        cc = (cells.loc[idx] if is_corr else cells[cells.d.isin(idx)]).copy()
        if not len(cc):
            continue
        # aggregate 1 km -> 2 km cells
        cc["gx"] = np.floor(cc.lon / 0.0167).astype(int)
        cc["gy"] = np.floor(cc.lat / 0.0167).astype(int)
        g2 = cc.groupby(["gx", "gy"]).agg(lon=("lon", "mean"), lat=("lat", "mean"), pop=("pop", "sum"),
                                          dist=("dist", "min"), d=("d", "first")).reset_index(drop=True)
        xy = km_xy(g2.lon, g2.lat)
        g2["pois"] = [len(x) for x in tree_poi.query_ball_point(xy, r=1.5)] if tree_poi is not None else 0
        g2["ss_km"] = tree_ss.query(xy, k=1)[0] if tree_ss is not None else 99
        g2["hw_km"] = tree_hw.query(xy, k=1)[0] if tree_hw is not None else 99
        # keep the most populous cells (cap keeps the browser greedy fast)
        g2 = g2.sort_values("pop", ascending=False).head(2500).reset_index(drop=True)
        xy = km_xy(g2.lon, g2.lat)
        # EVs in the cell (district EVs per person x cell population) and chargers within 3 km (real + modelled)
        g2["evs"] = g2["pop"].values * (D.evs.values / D["pop"].values)[g2.d.values]
        g2["ch3"] = [len(x) for x in tree_all.query_ball_point(xy, r=A.SITE_RADIUS_KM)]
        dem = A.minmax(g2["pop"], "log") * 0.75 + A.minmax(g2.pois, "log") * 0.25
        out = {
            "region": rname, "source_type": "derived",
            "cols": ["lon", "lat", "pop", "evs", "ch3", "dist", "demand", "gap", "grid", "hw", "pois", "ss_km", "hw_km", "district"],
            "rows": [[rnd(r.lon), rnd(r.lat), int(r.pop), int(r.evs), int(r.ch3), rnd(r.dist, 2), rnd(dm, 3), rnd(min(r.dist / 10, 1), 3),
                      rnd(max(0, 1 - r.ss_km / 10), 3), rnd(max(0, 1 - r.hw_km / 5), 3), int(r.pois), rnd(r.ss_km, 1),
                      rnd(r.hw_km, 1), D.id[r.d]] for r, dm in zip(g2.itertuples(), dem)],
        }
        write_json(os_cells / f"{slug(rname)}.json", out)
        all_cc_xy = km_xy(cc.lon, cc.lat)
        region_meta.append({"name": rname, "slug": slug(rname), "cells": len(g2), "corridor": is_corr,
                            "evs": float((cc["pop"].values * (D.evs.values / D["pop"].values)[cc.d.values]).sum()),
                            "pop": float(cc["pop"].sum()),
                            # chargers (real + modelled) whose nearest 1 km cell is in this region
                            "chargers": int((cKDTree(all_cc_xy).query(all_xy, k=1)[0] <= 0.75).sum())})

    # ---- outputs -------------------------------------------------------------
    print("writing ...")
    ST_IDX = {s: i for i, s in enumerate(STATES)}
    states_geo = D.dissolve("state").geometry
    states_geo.loc["Ladakh"] = unary_union([states_geo.loc["Ladakh"], *disputed])
    feats = []
    for st, geom in states_geo.items():
        feats.append({"type": "Feature", "id": ST_IDX[st], "properties": {"state": st},
                      "geometry": mapping(geom.simplify(0.01, preserve_topology=True))})
    write_json(PUB / "states.geo.json", {"type": "FeatureCollection", "features": _round_geo(feats, 3)})

    for st in STATES:
        sub = D[D.state == st]
        feats = [{"type": "Feature", "properties": {"id": i}, "geometry": mapping(g.simplify(0.004, preserve_topology=True))}
                 for i, g in zip(sub.id, sub.geometry)]
        write_json(PUB / "districts" / f"{slug(st)}.geo.json", {"type": "FeatureCollection", "features": _round_geo(feats, 3)})

    d_out = []
    for r in D.itertuples():
        c = r.geometry.representative_point()
        d_out.append({
            "id": r.id, "name": r.name, "state": r.state, "lon": rnd(c.x, 3), "lat": rnd(c.y, 3),
            "pop": int(r.pop), "pop2011": int(r.pop2011), "urban_share": rnd(r.urban_share, 3), "area_km2": rnd(r.area_km2, 0),
            "evs": int(r.evs), "chargers": int(round(r.chargers)), "real_chargers": int(r.real_chargers),
            "nh_km": rnd(r.nh_km, 1), "nh_gap_km": rnd(r.nh_gap_km, 1), "dist_km": rnd(r.dist_km, 4),
            "coverage": None if pd.isna(r.coverage) else rnd(r.coverage, 1),
            "coverage_mapped": None if pd.isna(r.coverage_mapped) else rnd(r.coverage_mapped, 1),
            "tourism_pois": int(r.tourism_pois), "logistics_pois": int(r.logistics_pois),
            "ev_density": rnd(r.ev_density, 6), "evs_per_charger": rnd(r.evs_per_charger, 4), "urban_pop": rnd(r.urban_pop, 1),
            "corridor": rnd(r.corridor, 6), "gap_score": rnd(r.gap_score, 2), "rank": int(r.rank),
            "source": {"evs": "derived", "chargers": "derived", "pop": "derived", "real_chargers": "real", "boundary": "real"},
        })
    write_json(PUB / "districts.json", d_out)

    s_out = []
    for r in S.itertuples():
        ind = A.indicators(r.evs, r.chargers, r.pop, r.nh_km, r.area_km2)
        s_out.append({
            "state": r.state, "slug": slug(r.state), "id": ST_IDX[r.state], "pop": int(r.pop), "area_km2": rnd(r.area_km2, 0),
            "urban_pop": rnd(r.urban_pop, 1), "evs": int(r.evs), "ev_stock_2023": None if r.ev_src != "derived" else int(r.ev_stock_2023),
            "chargers": int(round(r.chargers)), "official_chargers_2025": int(r.official_chargers_2025),
            "real_chargers": int(r.real_chargers), "completeness": rnd(r.completeness, 2), "nh_km": rnd(r.nh_km, 0),
            "nh_gap_km": rnd(r.nh_gap_km, 0), "coverage": None if pd.isna(r.coverage) else rnd(r.coverage, 1),
            "coverage_mapped": None if pd.isna(r.coverage_mapped) else rnd(r.coverage_mapped, 1),
            "fast_share_mapped": None if pd.isna(r.fast_share_mapped) else rnd(r.fast_share_mapped, 3),
            "gap_score": rnd(r.gap_score, 1), "critical_districts": int(r.critical_districts), "districts": int(r.districts),
            "mix": {k: rnd(v, 4) for k, v in mix[r.state].items()},
            **{k: (None if v is None else rnd(v, 3)) for k, v in ind.items() if k != "fast_share"},
            "source": {"evs": "derived", "ev_stock_2023": "real" if r.ev_src == "derived" else "derived",
                       "chargers": "derived", "official_chargers_2025": "real", "real_chargers": "real",
                       "mix": mix_src[r.state], "pop": "derived"},
        })
    write_json(PUB / "states.json", s_out)

    ops = sorted(Cg.operator.unique())
    op_idx = {o: i for i, o in enumerate(ops)}
    write_json(PUB / "chargers.json", {
        "operators": ops + ["Modelled location"], "states": STATES,
        "cols": ["lon", "lat", "dc", "operator", "kw", "state", "src"],  # src 0 = real (osm/ocm), 1 = synthetic
        "real": [[rnd(r.lon), rnd(r.lat), int(bool(r.dc)), op_idx[r.operator], None if pd.isna(r.kw) else rnd(r.kw, 0),
                  ST_IDX[r.state], 0] for r in Cg.itertuples()],
        "real_meta": [{"name": r.name, "sources": r.sources, "sockets": None if pd.isna(r.sockets) else int(r.sockets)} for r in Cg.itertuples()],
    })
    # modelled points live in their own file so the map only downloads them when that layer is switched on
    # (sampled positions, so ~100 m precision is plenty)
    write_json(PUB / "chargers-modelled.json", {
        "synthetic": [[rnd(r.lon, 3), rnd(r.lat, 3), int(r.dc), len(ops), None, ST_IDX[D.state[r.d]], 1] for r in Sy.itertuples()],
    })

    write_json(PUB / "highways.json", {
        "cols": ["ref", "gap", "dist_km", "len_km", "coords"],
        "segments": [[r.ref, int(r.gap), rnd(r.dist, 1), rnd(r.len_km, 2), [[rnd(x, 3), rnd(y, 3)] for x, y in r.geometry.coords]]
                     for r in seg.itertuples()] if len(seg) else [],
    })
    # Gap Analysis page: gap stretches only, plus the per-route table, so it doesn't download every highway
    gaps = seg[seg.gap] if len(seg) else seg
    write_json(PUB / "highway-gaps.json", {
        "cols": ["ref", "gap", "dist_km", "len_km", "coords"],
        "segments": [[r.ref, 1, rnd(r.dist, 1), rnd(r.len_km, 2), [[rnd(x, 3), rnd(y, 3)] for x, y in r.geometry.coords]] for r in gaps.itertuples()],
    })
    routes = seg.assign(gap_km=seg.len_km * seg.gap).groupby("ref").agg(km=("len_km", "sum"), gap=("gap_km", "sum")).reset_index() if len(seg) else None
    write_json(PUB / "corridors.json", [] if routes is None else
               [{"ref": r.ref, "km": rnd(r.km, 1), "gap": rnd(r.gap, 1)} for r in routes[routes.km > 50].sort_values("gap", ascending=False).head(12).itertuples()])
    write_json(PUB / "substations.json", [[rnd(x, 3), rnd(y, 3)] for x, y in zip(SS.lon, SS.lat)] if len(SS) else [])

    # population density layer: 5 km aggregated cells for a hexagon/heat layer
    pc = cells.assign(gx=np.floor(cells.lon / 0.1), gy=np.floor(cells.lat / 0.1)).groupby(["gx", "gy"]).agg(
        lon=("lon", "mean"), lat=("lat", "mean"), pop=("pop", "sum")).reset_index(drop=True)
    pc = pc[pc["pop"] > 5000]
    write_json(PUB / "population.json", [[rnd(a, 3), rnd(b, 3), int(p)] for a, b, p in zip(pc.lon, pc.lat, pc["pop"])])

    write_json(PUB / "forecast.json", (forecast))

    hw_total = float(seg.len_km.sum()) if len(seg) else 0
    hw_gap = float(seg[seg.gap].len_km.sum()) if len(seg) else 0
    summary = {
        "generated": TODAY,
        "ev_stock": nat["ev_stock_total"], "ev_stock_as_of": nat["ev_stock_as_of"],
        "public_chargers": nat["public_chargers_total"], "public_chargers_as_of": nat["public_chargers_as_of"],
        "fast_car_chargers": nat["fast_car_chargers"],
        "evs_per_charger": nat["ev_stock_total"] / nat["public_chargers_total"],
        "mapped_chargers": int(len(Cg)), "modelled_chargers": int(len(Sy)),
        "mapped_share": len(Cg) / nat["public_chargers_total"] * 100,
        "nh_km_mapped": rnd(hw_total, 0), "nh_gap_km": rnd(hw_gap, 0), "nh_gap_share": rnd(hw_gap / hw_total * 100, 1) if hw_total else None,
        "nh_routes": int(seg.ref.nunique()) if len(seg) else 0,
        "nh_routes_with_gaps": int(seg[seg.gap].ref.nunique()) if len(seg) else 0,
        "critical_districts": int((D.gap_score >= CRIT).sum()), "districts": len(D),
        "critical_threshold": round(CRIT, 1),
        "urban_coverage": cov(cells, "dist"), "urban_coverage_mapped": cov(cells, "dist_real"),
        "population": int(D["pop"].sum()), "substations": len(SS), "pois": len(P),
        "ev_penetration_fy26": nat["ev_penetration_fy26"], "ev_penetration_fy20": nat["ev_penetration_fy20"],
        "sensitivity": sens, "regions": region_meta,
        "gap_factors": {k: {"label": v[0], "transform": v[1], "weight": v[2]} for k, v in A.GAP_FACTORS.items()},
        "urban_density": URBAN_DENSITY, "city_radius_km": A.CITY_RADIUS_KM, "highway_spacing_km": A.HIGHWAY_SPACING_KM,
    }
    write_json(PUB / "summary.json", (summary))

    # self-check fixture for src/lib/model.ts (same inputs -> same scores)
    sample = D.sort_values("rank").head(25)
    write_json(PUB / "selfcheck.json", {
        "rows": sample[list(A.GAP_FACTORS)].to_dict("records"),
        "all_rows_minmax": {k: [float(D[k].min()), float(D[k].max())] for k in A.GAP_FACTORS},
        "default_scores": [rnd(x, 4) for x in sample.gap_score],
        "blended_ratio": A.blended_ratio(),
        "chargers_needed_1e6": A.chargers_needed(1e6)["required"],
    })

    # provenance -> sources.json
    prov = json.loads((PROC / "provenance.json").read_text("utf-8"))
    write_json(PUB / "sources.json", prov)
    write_sources_md(prov)
    D.drop(columns="geometry").to_csv(PROC / "districts.csv", index=False)
    S.to_csv(PROC / "states.csv", index=False)
    print("done.")


def write_sources_md(prov):
    """DATA_SOURCES.md, generated from the same provenance entries the site shows."""
    badge = {"real": "Real", "derived": "Estimated (derived)", "synthetic": "Synthetic"}
    lines = ["# Data sources", "", "_Generated by `pipeline/build.py` on " + TODAY + ". Do not edit by hand._", "",
             "| Dataset | Type | Records | Fetched | Licence | Status |", "|---|---|---:|---|---|---|"]
    for e in prov.values():
        lines.append(f"| {e['name']} | {badge.get(e.get('source_type'), '?')} | {e.get('records', '')} | {e.get('fetched', '')} | "
                     f"{e.get('licence', '')} | {e.get('status', 'ok')} |")
    for e in prov.values():
        lines += ["", f"## {e['name']}", "", f"- **Type:** {badge.get(e.get('source_type'), '?')}",
                  f"- **Source:** {e.get('url', '')}", f"- **Fetched:** {e.get('fetched', '')}" + (f" (data as of {e['as_of']})" if e.get("as_of") else ""),
                  f"- **Licence:** {e.get('licence', 'n/a')}", f"- **Records:** {e.get('records', 'n/a')}"]
        if e.get("status"):
            lines.append(f"- **Status:** {e['status']}")
        if e.get("cleaning"):
            lines.append(f"- **Cleaning:** {e['cleaning']}")
        if e.get("limitations"):
            lines.append(f"- **Known limitations:** {e['limitations']}")
    (PUB.parent.parent / "DATA_SOURCES.md").write_text("\n".join(lines) + "\n", "utf-8")


def _round_geo(feats, nd):
    def r(c):
        return [r(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], nd), round(c[1], nd)]
    for f in feats:
        f["geometry"]["coordinates"] = r(f["geometry"]["coordinates"])
    return feats


if __name__ == "__main__":
    main()
