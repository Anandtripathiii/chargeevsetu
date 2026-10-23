import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'
const listeners = new Set<() => void>()
const read = (): Theme => (document.documentElement.classList.contains('light') ? 'light' : 'dark')

function setTheme(t: Theme) {
  document.documentElement.classList.toggle('light', t === 'light')
  try { localStorage.setItem('theme', t) } catch { /* storage blocked: theme just won't persist */ }
  listeners.forEach((l) => l())
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), read)
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')]
}
