'use client'

import { useId, useState } from 'react'

type Props = {
  label: string
  description: string
}

export function RapidInfoHint({ label, description }: Props) {
  const tooltipId = useId()
  const [open, setOpen] = useState(false)

  return <span className="live-sale-rapid-info-hint">
    <button
      type="button"
      aria-label={`ดูคำแนะนำ${label}`}
      aria-expanded={open}
      aria-controls={tooltipId}
      aria-describedby={open ? tooltipId : undefined}
      onClick={() => setOpen((current) => !current)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >i</button>
    <span id={tooltipId} role="tooltip" hidden={!open}>{description}</span>
  </span>
}
