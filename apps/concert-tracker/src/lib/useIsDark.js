import { useEffect, useState } from 'react'

/** True when the effective theme is dark: explicit setting, else the OS preference. */
export function useIsDark(theme) {
  const [sys, setSys] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const fn = (e) => setSys(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return theme === 'dark' ? true : theme === 'light' ? false : sys
}

