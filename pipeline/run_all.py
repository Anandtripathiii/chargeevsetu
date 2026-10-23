"""Run the whole data pipeline: fetch -> clean -> merge -> analyse -> public/data/.

    python pipeline/run_all.py            # use cached raw downloads where present
    python pipeline/run_all.py --force    # re-download OSM layers

Each fetch step is isolated: if one source fails, its error is logged and the build continues
with whatever data is available (see DATA_SOURCES.md for what was used).
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
STEPS = ["fetch_official.py", "fetch_osm.py", "fetch_ocm.py", "fetch_vahan.py", "build.py"]

failed = []
for step in STEPS:
    print(f"\n=== {step} ===", flush=True)
    args = [sys.executable, "-X", "utf8", str(HERE / step), *[a for a in sys.argv[1:] if step == "fetch_osm.py"]]
    if subprocess.call(args, cwd=HERE) != 0:
        failed.append(step)
        if step == "build.py":
            sys.exit("build failed")
print("\nDone." + (f" Steps with errors (fallbacks used): {', '.join(failed)}" if failed else " All steps OK."))
