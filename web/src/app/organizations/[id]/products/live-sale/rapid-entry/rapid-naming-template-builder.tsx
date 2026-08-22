'use client'

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { RapidRangeSelection } from './rapid-prefix-assistant'
import { RapidInfoHint } from './rapid-info-hint'
import { RapidSelectCombobox } from './rapid-select-combobox'

type Props = {
  selectedRange: RapidRangeSelection | null
  canManage: boolean
  onTemplateChange?: (template: string) => void
}

type NamingPreset = 'code-only' | 'live-code' | 'campaign-code' | 'custom'

const MAX_PRODUCT_NAME_LENGTH = 120

const PRESETS: Array<{ id: NamingPreset; label: string; example: string }> = [
  { id: 'code-only', label: 'ใช้รหัสอย่างเดียว', example: 'A120' },
  { id: 'live-code', label: 'ชื่อ Live + รหัส', example: 'เทศกาล Live A120' },
  { id: 'campaign-code', label: 'Campaign + รหัส', example: 'PayDay-A120' },
  { id: 'custom', label: 'กำหนดรูปแบบเอง', example: 'ต่างหูรอบค่ำ-A120' },
]

function codeFor(range: RapidRangeSelection, number: number) {
  return `${range.prefix}${String(number).padStart(3, '0')}`
}

function baseTemplate(preset: NamingPreset, campaign: string, customPattern: string) {
  if (preset === 'code-only') return '{code}'
  if (preset === 'live-code') return `${campaign || 'Live'} {code}`
  if (preset === 'campaign-code') return `${campaign || 'Campaign'}-{code}`
  return customPattern.trim()
}

function enforceCodeToken(template: string) {
  const trimmed = template.trim()
  if (!trimmed) return '{code}'
  if (trimmed.includes('{code}')) return trimmed
  return `${trimmed}-{code}`
}

function renderName(template: string, code: string) {
  return template
    .replaceAll('{code}', code)
    .replaceAll('{campaign}', 'PayDay')
    .replaceAll('{date}', '21-08-2026')
    .replaceAll('{branch}', 'BKK-01')
    .replaceAll('{seller}', 'แม่ค้า A')
    .replace(/\s+/g, ' ')
    .trim()
}

export function RapidNamingTemplateBuilder({ selectedRange, canManage, onTemplateChange }: Props) {
  const [preset, setPreset] = useState<NamingPreset>('campaign-code')
  const [campaign, setCampaign] = useState('PayDay')
  const [customPattern, setCustomPattern] = useState('สินค้า Live {code}')

  const rawTemplate = baseTemplate(preset, campaign.trim(), customPattern)
  const normalizedTemplate = enforceCodeToken(rawTemplate)
  const previewNumbers = selectedRange
    ? [selectedRange.start, selectedRange.start + 1, selectedRange.start + 2, selectedRange.end]
    : []
  const previewNames = selectedRange
    ? previewNumbers.map((number) => renderName(normalizedTemplate, codeFor(selectedRange, number)))
    : []
  const tooLong = previewNames.some((name) => name.length > MAX_PRODUCT_NAME_LENGTH)
  const duplicateCount = new Set(previewNames).size !== previewNames.length

  useEffect(() => {
    onTemplateChange?.(normalizedTemplate)
  }, [normalizedTemplate, onTemplateChange])

  function updateCampaign(event: ChangeEvent<HTMLInputElement>) {
    setCampaign(event.target.value.slice(0, 60))
  }

  function updateCustomPattern(event: ChangeEvent<HTMLInputElement>) {
    setCustomPattern(event.target.value.slice(0, 100))
  }

  return <section className="live-sale-naming-builder" aria-labelledby="rapidNamingTitle">
    <header className="live-sale-rapid-section-header">
      <div className="live-sale-rapid-section-title">
        <span aria-hidden="true">2</span>
        <div>
          <h3 id="rapidNamingTitle">ตั้งชื่อสินค้า</h3>
          <p>ชื่อทุกแถวมีรหัสขายกำกับ เพื่อให้นำไปใช้จริงได้ทันทีและไม่ต้องกลับมาแก้ซ้ำ</p>
        </div>
      </div>
    </header>

    {!selectedRange ? <div className="live-sale-naming-empty" role="status">
      <strong>เลือกช่วงรหัสก่อนตั้งชื่อสินค้า</strong>
      <span>กด “ใช้ช่วงที่แนะนำ” ในขั้นตอนที่ 1 แล้วเลือกรูปแบบชื่อที่ต้องการได้ทันที</span>
    </div> : <div className="live-sale-naming-body">
      <div className="live-sale-naming-fields">
        <label className="live-sale-naming-mode-field" htmlFor="rapidNamingPreset">
          <span className="live-sale-rapid-field-label"><span>รูปแบบชื่อสินค้า <b>*</b></span><RapidInfoHint label=" รูปแบบชื่อสินค้า" description="เลือกรูปแบบชื่อที่เหมาะกับ Live นี้ ระบบจะเติมรหัสขายให้แต่ละรายการโดยอัตโนมัติ" /></span>
          <RapidSelectCombobox id="rapidNamingPreset" value={preset} options={PRESETS.map((item) => ({ value: item.id, label: item.label, description: item.example }))} onChange={(value) => setPreset(value as NamingPreset)} disabled={!canManage} />
        </label>
        {preset !== 'code-only' && preset !== 'custom' && <label>
          <span className="live-sale-rapid-field-label"><span>ชื่อ Live / Campaign <b>*</b></span><RapidInfoHint label=" ชื่อ Live หรือ Campaign" description="ชื่อที่ช่วยแยกงาน Live หรือแคมเปญ เช่น PayDay หรือ เทศกาล Live" /></span>
          <input value={campaign} onChange={updateCampaign} disabled={!canManage} maxLength={60} placeholder="เช่น PayDay หรือ เทศกาล Live" />
          <small>{campaign.length}/60 ตัวอักษร</small>
        </label>}
        {preset === 'custom' && <label>
          <span className="live-sale-rapid-field-label"><span>รูปแบบที่กำหนดเอง <b>*</b></span><RapidInfoHint label=" รูปแบบที่กำหนดเอง" description="กำหนดชื่อได้เอง โดยระบบจะเติมรหัสขายเพื่อป้องกันชื่อซ้ำ" /></span>
          <input value={customPattern} onChange={updateCustomPattern} disabled={!canManage} maxLength={100} aria-describedby="rapidCustomTemplateHelp" placeholder="เช่น ต่างหูรอบค่ำ-{code}" />
          <small id="rapidCustomTemplateHelp">ใช้ Token เช่น {'{code}'}, {'{campaign}'}, {'{date}'}, {'{branch}'} หรือ {'{seller}'}</small>
        </label>}
        {preset === 'code-only' && <div className="live-sale-naming-code-note" role="status">
          <strong>ใช้รหัสขายเป็นชื่อสินค้า</strong>
          <span>ระบบจะสร้างชื่อจากรหัสในช่วงที่เลือกโดยตรง เช่น {codeFor(selectedRange, selectedRange.start)}</span>
        </div>}
      </div>

      {(tooLong || duplicateCount) && <p className="live-sale-naming-error" role="alert">{tooLong ? `ชื่อสินค้าต้องไม่เกิน ${MAX_PRODUCT_NAME_LENGTH} ตัวอักษร` : 'พบชื่อซ้ำในช่วงที่เลือก กรุณาตรวจ Template'}</p>}
    </div>}
  </section>
}
