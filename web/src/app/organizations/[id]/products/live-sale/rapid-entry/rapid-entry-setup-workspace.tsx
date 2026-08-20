'use client'

import { useState } from 'react'
import { RapidEntryTable } from './rapid-entry-table'
import { RapidNamingTemplateBuilder } from './rapid-naming-template-builder'
import { RapidPrefixAssistant } from './rapid-prefix-assistant'
import type { RapidRangeSelection } from './rapid-prefix-assistant'

type Props = {
  canManage: boolean
}

export function RapidEntrySetupWorkspace({ canManage }: Props) {
  const [selectedRange, setSelectedRange] = useState<RapidRangeSelection | null>(null)
  const [namingTemplate, setNamingTemplate] = useState('PayDay-{code}')

  return <div className="live-sale-rapid-setup-stack">
    <RapidPrefixAssistant canManage={canManage} onRangeSelect={setSelectedRange} />
    <RapidNamingTemplateBuilder selectedRange={selectedRange} canManage={canManage} onTemplateChange={setNamingTemplate} />
    <RapidEntryTable selectedRange={selectedRange} namingTemplate={namingTemplate} canManage={canManage} />
  </div>
}
