// Verifies src/lib/model.ts reproduces pipeline/analysis.py: same Gap Scores for all districts,
// same blended EVs-per-charger ratio and chargers needed. Run: npm run selfcheck
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { gapScores, blendedRatio, chargersNeeded, greedySites, parseCells } from '../src/lib/model.ts'

const read = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), 'utf8'))
const districts = read('districts.json')
const check = read('selfcheck.json')
const forecast = read('forecast.json')

const ts = gapScores(districts)
let worst = 0
districts.forEach((d, i) => { worst = Math.max(worst, Math.abs(ts[i] - d.gap_score)) })
assert.ok(worst < 0.01, `gap score mismatch: max diff ${worst}`)

const br = blendedRatio(forecast.vehicle_mix, forecast.target_ratio)
assert.ok(Math.abs(br - check.blended_ratio) < 1e-6, `blended ratio ${br} vs ${check.blended_ratio}`)
const need = chargersNeeded(1e6, br, forecast.vehicle_mix, forecast.target_ratio).required
assert.ok(Math.abs(need - check.chargers_needed_1e6) < 1e-3, `chargers needed ${need} vs ${check.chargers_needed_1e6}`)

// greedy sanity: coverage never decreases and picks are distinct
const cells = read('cells/delhi-ncr.json')
const r = greedySites(parseCells(cells.cols, cells.rows), 20, 10, br)
assert.ok(r.after >= r.before && r.covAfter >= r.covBefore, 'served share / coverage must not fall')
assert.equal(new Set(r.sites.map((s) => `${s.cell.lon},${s.cell.lat}`)).size, r.sites.length)

console.log(`selfcheck OK: ${districts.length} gap scores match (max diff ${worst.toExponential(1)}), ` +
  `blended ratio ${br.toFixed(1)}, Delhi NCR 20 hubs: demand met ${r.before.toFixed(1)}% -> ${r.after.toFixed(1)}%`)
