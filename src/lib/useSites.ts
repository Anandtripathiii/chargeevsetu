import { useEffect, useRef, useState } from 'react'
import type { Cell, SiteResult } from './model'

/** greedySites in a Web Worker; returns the latest finished result (null until the first one). */
export function useSites(cells: Cell[] | null, n: number, size: number, ratio: number) {
  const [res, setRes] = useState<SiteResult | null>(null)
  const worker = useRef<Worker | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    const w = new Worker(new URL('./siteWorker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; res: SiteResult }>) => { if (e.data.id === seq.current) setRes(e.data.res) }
    worker.current = w
    return () => w.terminate()
  }, [])
  useEffect(() => {
    if (!cells || !worker.current) return
    worker.current.postMessage({ id: ++seq.current, cells, n, size, ratio })
  }, [cells, n, size, ratio])
  return res
}
