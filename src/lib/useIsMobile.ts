import { useEffect, useState } from 'react'

// Single mobile breakpoint. Above this, layouts stay exactly as the desktop app.
const QUERY = '(max-width: 640px)'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    setIsMobile(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}
