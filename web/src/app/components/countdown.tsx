'use client'

import { useEffect, useState } from 'react'

export function Countdown({ expiresAt, initialSeconds }: { expiresAt: string; initialSeconds: number }) {
  const [seconds, setSeconds] = useState(Math.max(0, initialSeconds))

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds(Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt])

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60

  return <strong>{days} วัน {hours} ชม. {minutes} นาที {remaining} วินาที</strong>
}
