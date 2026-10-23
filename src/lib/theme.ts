import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'
const listeners = new Set<() => void>()
const read = (): Theme => (document.documentElement.classList.contains('light') ? 'light' : 'dark')

let fade: ReturnType<typeof setTimeout>
function setTheme(t: Theme) {
  // View Transitions cross-fade when available; colour transitions otherwise
  const doc = document as Document & { startViewTransition?: (f: () => void) => unknown }
  if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) { doc.startViewTransition(() => apply(t, false)); return }
  apply(t, true)
}
function apply(t: Theme, animate: boolean) {
  const el = document.documentElement
  if (animate) {
    el.classList.add('theme-fade')
    clearTimeout(fade)
    fade = setTimeout(() => el.classList.remove('theme-fade'), 350)
  }
  el.classList.toggle('light', t === 'light')
  try { localStorage.setItem('theme', t) } catch { /* storage blocked: theme just won't persist */ }
  listeners.forEach((l) => l())
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), read)
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')]
}
