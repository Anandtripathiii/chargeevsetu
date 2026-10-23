# Redesign status

All redesign work is done and committed locally. It is **not pushed**: run `git push origin main` once approved, and Vercel will redeploy.

## Done
- Design tokens: dark (#0B0B0C / #18181B, lime #B5F23D) and light (#F6F7F4); Inter font; restyled cards, glass panels, pills, inputs, buttons and skeletons.
- Shell: slim sidebar with a sliding active indicator and tooltips (a bottom bar on phones); top bar with tabs, search, animated theme toggle, bell and team chip; page heading with date, Share and Export pills.
- Animations: page fade and slide, staggered cards and rows, count-up numbers, charts that draw in, map arcs that draw in, pulsing city points; reduced motion respected.
- Map: States glass panel (search, filter view, tier badge, view and compare buttons), corridor arcs (solid where covered, dashed where routes have ≥ 50 km of gaps), "<State> performance" card with change badges, "Export map" CSV.
- Exports wired: map, dashboard and gap CSVs, planner CSV; print-to-PDF elsewhere.
- Checks: `npm run build` OK, `npm run lint` has no errors, `npm run selfcheck` OK. Every page checked in dark and light at 1440px and 390px wide: no console errors, no horizontal overflow.

## Known limits
- Charts animate when they mount, not when they scroll into view.
- On phones the bottom icon bar scrolls sideways, because there are 10 icons.
