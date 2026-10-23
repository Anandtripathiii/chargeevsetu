"""Self-checks for analysis.py. Run: python pipeline/test_analysis.py"""
import numpy as np

import analysis as A

# Gap Score: 0..100, best and worst rows hit the ends, ordering follows the factors
rows = [{"ev_density": d, "evs_per_charger": e, "dist_km": k, "urban_pop": u, "corridor": c}
        for d, e, k, u, c in [(1, 10, 1, 1e4, 0.1), (50, 300, 8, 1e6, 0.6), (10, 100, 3, 1e5, 0.3)]]
s = A.gap_scores(rows)
assert np.isclose(s.min(), 0) and np.isclose(s.max(), 100) and s[2] < s[1], s
# zero weight on every factor but one: score follows that factor alone
only = {k: 0 for k in A.GAP_FACTORS} | {"dist_km": 1}
assert list(np.argsort(A.gap_scores(rows, only))) == [0, 2, 1]

# Chargers needed: blended ratio sits between the extreme per-type ratios; slider scales linearly
br = A.blended_ratio()
assert min(A.TARGET_RATIO.values()) < br < max(A.TARGET_RATIO.values())
n1, n2 = A.chargers_needed(1e6)["required"], A.chargers_needed(1e6, ratio=br * 2)["required"]
assert np.isclose(n1, 1e6 / br) and np.isclose(n2, n1 / 2)
assert A.chargers_needed(1e6, existing=10**9)["additional"] == 0

# Highway gap rule: > 12.5 km to the nearest charger
assert list(A.highway_gap(np.array([5, 12.5, 13]))) == [False, False, True]

# Greedy siting: served share and coverage never fall; the hub goes to the cell with unmet demand
cells = [{"lon": 77 + i * 0.05, "lat": 28.6, "pop": 1e4, "evs": 500 if i == 3 else 50, "ch3": 0 if i == 3 else 5,
          "demand": 0.5, "gap": 0.5, "grid": 0, "hw": 0} for i in range(6)]
picks, before, after, cb, ca = A.greedy_sites(cells, 1)
assert picks == [3] and after > before and ca >= cb, (picks, before, after)

# Forecast fits recover a clean exponential
yrs = list(range(2018, 2026))
fit = A.fit_models(yrs, [1e6 * 1.3 ** (y - 2018) for y in yrs])
assert abs(fit["cagr"]["g"] - 0.3) < 1e-3 and fit["cagr"]["r2"] > 0.999

# Scenarios: high > base > low by 2035
sc = {k: A.scenario_stock(8e6, 2025, 2.9e7, k)[2035] for k in A.SCENARIOS}
assert sc["high"] > sc["base"] > sc["low"] > 8e6

print("analysis self-checks OK")
