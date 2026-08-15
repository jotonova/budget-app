import { useEffect } from 'react'

/** Close-on-Escape for modal overlays (keyboard accessibility). */
export function useEscape(onEscape: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEscape])
}
