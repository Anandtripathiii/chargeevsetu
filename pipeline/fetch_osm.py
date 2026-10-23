"""Fetch OSM layers for India via Overpass: chargers, NH highways, substations, candidate POIs.

Raw responses are cached in data/raw/osm/; re-run with --force to refresh.
Large layers are fetched in 2x2 degree tiles (cached per tile) so no single query times out.
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from common import RAW, overpass, provenance

OUT = RAW / "osm"
OUT.mkdir(parents=True, exist_ok=True)
FORCE = "--force" in sys.argv
# optional layer selection: python fetch_osm.py substations pois
ONLY = {a for a in sys.argv[1:] if not a.startswith("-")} or {"chargers", "highways", "substations", "pois"}
INDIA = 'area["ISO3166-1"="IN"][admin_level=2]->.in;'
# 2x2 degree tiles that touch India (pipeline/india_tiles.json, from the district boundaries).
# Tiles use bbox-only filters (much faster than area filters); build.py clips to India afterwards.
TILES = json.loads((Path(__file__).parent / "india_tiles.json").read_text())
if "--reverse" in sys.argv:  # second worker walks the tiles from the other end
    TILES.reverse()


def cached(name, fn):
    f = OUT / f"{name}.json"
    if f.exists() and not FORCE:
        return json.loads(f.read_text("utf-8"))
    data = fn()
    f.write_text(json.dumps(data), "utf-8")
    return data


def tiled(name, body, out="center"):
    """Run `body` (filter with {bbox}) per tile (cached per tile, 2 in parallel), merge unique elements."""
    tdir = OUT / name
    tdir.mkdir(exist_ok=True)
    failed = []

    def one(t):
        s, w, n, e = t
        f = tdir / f"{s}_{w}.json"
        if f.exists() and not FORCE:
            return json.loads(f.read_text("utf-8"))
        q = lambda bb: overpass(f"[out:json][timeout:300];(" + body.format(bbox=bb) + f");out tags {out} qt;")
        try:
            res = q(f"{s},{w},{n},{e}")
        except RuntimeError:
            try:  # dense tile: retry as four 1-degree quarters
                parts = [q(f"{y},{x},{y + 1},{x + 1}") for y in (s, s + 1) for x in (w, w + 1)]
                res = {"elements": [el for p in parts for el in p.get("elements", [])]}
            except RuntimeError as err:  # one bad tile must not kill the run; it is retried next run (not cached)
                print(f"  ! {name} tile {s}_{w} failed: {err}", flush=True)
                failed.append(f"{s}_{w}")
                return {"elements": []}
        f.write_text(json.dumps(res), "utf-8")
        return res

    def run():
        seen, els = set(), []
        with ThreadPoolExecutor(2) as ex:
            for i, res in enumerate(ex.map(one, TILES)):
                for el in res.get("elements", []):
                    k = (el["type"], el["id"])
                    if k not in seen:
                        seen.add(k)
                        els.append(el)
                print(f"  {name}: tile {i + 1}/{len(TILES)} -> {len(els)} total", flush=True)
        if failed:  # incomplete: don't write the merged cache, so the next run fills the gaps
            raise SystemExit(f"{name}: {len(failed)} tiles failed ({', '.join(failed)}); re-run to retry them")
        return {"elements": els}
    return cached(name, run)


def area_or_tiled(name, area_body, tile_body):
    """Point layers: one India-wide area query (fast when the server is idle), else fall back to tiles."""
    f = OUT / f"{name}.json"
    if f.exists() and not FORCE:
        return json.loads(f.read_text("utf-8"))
    try:
        data = overpass(f"[out:json][timeout:600];{INDIA}({area_body});out tags center qt;", retries=2)
        f.write_text(json.dumps(data), "utf-8")
        return data
    except RuntimeError as err:
        print(f"  area query failed ({err}); falling back to tiles", flush=True)
        return tiled(name, tile_body)


def main():
    if "chargers" in ONLY:
        chargers()
    if "highways" in ONLY:
        highways()
    if "substations" in ONLY:
        substations()
    if "pois" in ONLY:
        pois()


def chargers():
    print("OSM chargers ...")
    ch = cached("chargers", lambda: overpass(
        f"[out:json][timeout:300];{INDIA}(nwr[amenity=charging_station](area.in););out tags center qt;"))
    print(f"  {len(ch['elements'])} charging stations")
    provenance("osm_chargers", name="OpenStreetMap charging stations (amenity=charging_station)",
               url="https://overpass-api.de / maps.mail.ru Overpass mirror", licence="ODbL 1.0",
               records=len(ch["elements"]), source_type="real",
               cleaning="Nodes/ways/relations reduced to a point (way centre); kept operator, sockets, capacity, power tags.",
               limitations="Volunteer-mapped; coverage varies by city. Many operator stations are not yet in OSM.")



def highways():
    print("OSM national highways (tiled) ...")
    hw = tiled("highways", 'way[highway~"^(motorway|trunk|primary)$"][ref~"^ *NH|^ *NE"]({bbox});', out="geom")
    provenance("osm_highways", name="OpenStreetMap national highways (ref NH*/NE*)", url="Overpass API",
               licence="ODbL 1.0", records=len(hw["elements"]), source_type="real",
               cleaning="Ways merged per NH ref, simplified (~200 m tolerance); one-way carriageways count half (dual carriageways are mapped twice).",
               limitations="Some NH segments lack a ref tag in OSM; length is an underestimate of the official ~1.46 lakh km.")



def substations():
    print("OSM substations (tiled) ...")
    ss = area_or_tiled("substations", "nwr[power=substation](area.in);", 'nwr[power=substation]({bbox});')
    provenance("osm_substations", name="OpenStreetMap power substations (power=substation)", url="Overpass API",
               licence="ODbL 1.0", records=len(ss["elements"]), source_type="real",
               cleaning="Reduced to points; voltage kept where tagged.",
               limitations="Proxy for grid readiness only; no DISCOM spare-capacity data.")



def pois():
    print("OSM candidate-site POIs (tiled) ...")
    poi = area_or_tiled("pois", "nwr[amenity=fuel](area.in);nwr[shop=mall](area.in);nwr[tourism=attraction](area.in);"
                               "nwr[landuse=logistics](area.in);",
                        'nwr[amenity=fuel]({bbox});nwr[shop=mall]({bbox});nwr[tourism=attraction]({bbox});nwr[landuse=logistics]({bbox});')
    provenance("osm_pois", name="OpenStreetMap candidate sites (fuel stations, malls, tourist attractions, logistics areas)",
               url="Overpass API", licence="ODbL 1.0", records=len(poi["elements"]), source_type="real",
               cleaning="Reduced to points with a category.", limitations="Completeness varies by region.")


if __name__ == "__main__":
    main()
