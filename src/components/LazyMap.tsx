import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { MapBaseProps } from './MapBase'
import type { MapBaseHandle } from './mapUtil'

const load = () => import('./MapBase')
const MapBase = lazy(load)
let loaded = false

/**
 * MapLibre + deck.gl are ~1.5 MB of JavaScript, too heavy to parse while a phone is still rendering the page.
 * So the page renders first and the map code is fetched on the visitor's first interaction (touch, mouse move,
 * key, scroll) while the map box is on or near the screen, or when they press the placeholder's button.
 * Once loaded, every later map appears immediately.
 */
function useMapReady(el: React.RefObject<HTMLDivElement | null>) {
  const [ready, setReady] = useState(loaded)
  const start = () => load().then(() => { loaded = true; setReady(true) })
  useEffect(() => {
    if (ready || !el.current) return
    let seen = false, armed = false
    const go = () => { if (seen && armed) start() }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { seen = true; go() } }, { rootMargin: '300px' })
    io.observe(el.current)
    const arm = () => { armed = true; go() }
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, arm, { once: true, passive: true }))
    const idle = setTimeout(arm, 1200) // no interaction yet: still load soon, so first-time visitors never see an empty box
    return () => { clearTimeout(idle); io.disconnect(); events.forEach((e) => window.removeEventListener(e, arm)) }
  }, [ready, el])
  return [ready, start] as const
}

function Placeholder({ onLoad }: { onLoad?: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center skeleton !rounded-none" aria-busy={!onLoad}>
      {onLoad
        ? <button className="btn btn-ghost text-xs" onClick={onLoad}>Load interactive map</button>
        : <span className="text-xs text-muted flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent-fill animate-pulse" /> Loading interactive map…</span>}
    </div>
  )
}

/** Drop-in for MapBase that loads the map code lazily; camera calls made before it exists are replayed. */
const LazyMap = forwardRef<MapBaseHandle, MapBaseProps & { onReady?: () => void }>(function LazyMap({ onReady, ...props }, ref) {
  const box = useRef<HTMLDivElement>(null)
  const [ready, start] = useMapReady(box)
  // lets a page hold back map-only data until the map is actually loading
  useEffect(() => { if (ready) onReady?.() }, [ready, onReady])
  const inner = useRef<MapBaseHandle | null>(null)
  const queued = useRef<((h: MapBaseHandle) => void) | null>(null)
  const call = (f: (h: MapBaseHandle) => void) => { if (inner.current) f(inner.current); else queued.current = f }
  useImperativeHandle(ref, () => ({ fit: (b, z) => call((h) => h.fit(b, z)), fly: (x, y, z) => call((h) => h.fly(x, y, z)) }))
  const attach = (h: MapBaseHandle | null) => {
    inner.current = h
    if (h && queued.current) { queued.current(h); queued.current = null }
  }
  return (
    <div ref={box} className={props.className ?? 'absolute inset-0'}>
      {ready ? <Suspense fallback={<Placeholder />}><MapBase ref={attach} {...props} className="absolute inset-0" /></Suspense> : <Placeholder onLoad={start} />}
    </div>
  )
})
export default LazyMap
