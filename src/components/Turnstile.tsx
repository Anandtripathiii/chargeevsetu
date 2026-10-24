import { useEffect, useRef } from 'react'

// Cloudflare Turnstile ("I am human" check). Only active when VITE_TURNSTILE_SITE_KEY is set; Supabase verifies the token
// (Authentication -> Attack Protection -> CAPTCHA). Without a key this renders nothing and logins work as before.
export const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

type TS = { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void }
let script: Promise<TS> | null = null
const load = () => (script ??= new Promise<TS>((ok, fail) => {
  const s = document.createElement('script')
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  s.async = true
  s.onload = () => ok((window as unknown as { turnstile: TS }).turnstile)
  s.onerror = () => { script = null; fail(new Error('captcha failed to load')) }
  document.head.appendChild(s)
}))

/** Calls onToken with a fresh token (or '' when it expires). Change `key` on the element to get a new challenge. */
export default function Turnstile({ onToken }: { onToken: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!TURNSTILE_KEY || !box.current) return
    let id: string | undefined, ts: TS | undefined, dead = false
    load().then((t) => {
      if (dead || !box.current) return
      ts = t
      id = t.render(box.current, { sitekey: TURNSTILE_KEY, callback: onToken, 'expired-callback': () => onToken(''), 'error-callback': () => onToken(''), theme: 'auto', size: 'flexible' })
    }, () => onToken(''))
    return () => { dead = true; if (id && ts) ts.remove(id) }
  }, [onToken])
  return TURNSTILE_KEY ? <div ref={box} className="min-h-[65px]" /> : null
}
