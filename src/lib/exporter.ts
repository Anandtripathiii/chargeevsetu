import { useEffect, useRef, useSyncExternalStore } from 'react'

// The top bar's export pill runs whatever export the current page registers; without one it prints the page (PDF).
type Exporter = { label: string; run: () => void }
let current: Exporter | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Register this page's export action for the top-bar "Export" pill while the page is mounted. */
export function useExport(label: string, run: () => void) {
  const fn = useRef(run)
  fn.current = run
  useEffect(() => {
    const e = { label, run: () => fn.current() }
    current = e
    emit()
    return () => { if (current === e) { current = null; emit() } }
  }, [label])
}

export function useExporter(): Exporter {
  const e = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => current)
  return e ?? { label: 'Export PDF', run: () => window.print() }
}
