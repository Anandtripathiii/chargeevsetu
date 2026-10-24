// maplibre-gl v6 loads its Web Worker from a separate file (maplibre-gl-worker.mjs) that bundlers do not copy on their own.
// Import it as an asset URL so Vite emits it under /assets/ (same origin, allowed by the CSP's worker-src 'self'),
// and register it before any map is created. Imported first by every map component.
import { getWorkerUrl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

if (getWorkerUrl() !== workerUrl) setWorkerUrl(workerUrl)
