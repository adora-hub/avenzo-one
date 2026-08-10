'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase('th-TH').replace(/\s+/g, ' ').trim()
}

const quickFilters = [
  { label: 'ความปลอดภัย', query: 'ความปลอดภัย', tone: 'safe' },
  { label: 'Emergency Stop', query: 'Emergency Stop', tone: 'danger' },
  { label: 'Webhook', query: 'Webhook', tone: 'webhook' },
  { label: 'ผู้ทดสอบ', query: 'ผู้ทดสอบ', tone: 'tester' },
  { label: 'อนุมัติ 2 คน', query: 'อนุมัติ', tone: 'approval' },
  { label: 'Shadow', query: 'Shadow', tone: 'shadow' },
  { label: 'Audit Log', query: 'Audit', tone: 'audit' },
] as const

function filterTone(value: string) {
  const normalized = normalizeSearchText(value)
  if (normalized.includes('emergency') || normalized.includes('ย้อนกลับ')) return 'danger'
  if (normalized.includes('webhook')) return 'webhook'
  if (normalized.includes('shadow')) return 'shadow'
  if (normalized.includes('ผู้ทดสอบ') || normalized.includes('tester')) return 'tester'
  if (normalized.includes('อนุมัติ') || normalized.includes('approval')) return 'approval'
  if (normalized.includes('audit') || normalized.includes('ประวัติ')) return 'audit'
  return 'safe'
}

export function LiveControlCardSearch({ children }: { children: ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [resultCount, setResultCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const filterCards = useCallback(() => {
    const list = listRef.current
    if (!list) return

    const normalizedQuery = normalizeSearchText(query)
    const cards = Array.from(list.children).filter((element): element is HTMLElement => element instanceof HTMLElement)
    let visibleCount = 0

    cards.forEach((card) => {
      const searchableText = normalizeSearchText(card.textContent ?? '')
      const matches = !normalizedQuery || searchableText.includes(normalizedQuery)
      card.classList.toggle('is-search-hidden', !matches)
      if (matches) visibleCount += 1
    })

    setTotalCount(cards.length)
    setResultCount(visibleCount)
  }, [query])

  useEffect(() => {
    filterCards()

    const list = listRef.current
    if (!list) return
    const observer = new MutationObserver(filterCards)
    observer.observe(list, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [filterCards])

  function clearSearch() {
    setQuery('')
    searchRef.current?.focus()
  }

  return <section className="live-control-search-shell" aria-label="ค้นหาการ์ดในศูนย์ควบคุม">
    <div className="live-control-search-bar">
      <div className="live-control-search-heading">
        <div><strong>ค้นหาการ์ด</strong><span>ค้นจากชื่อหัวข้อ คำอธิบาย หรือหมายเลข Phase</span></div>
        <span className="feature-count" aria-live="polite">{resultCount} / {totalCount} การ์ด</span>
      </div>
      <div className="live-control-search-field">
        <span aria-hidden="true">⌕</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="เช่น Webhook, ผู้ทดสอบ, Emergency Stop หรือ Phase 1.1.3"
          aria-label="ค้นหาการ์ด"
        />
        {query ? <button className="live-control-search-clear" type="button" onClick={clearSearch} aria-label="ล้างคำค้น">×</button> : null}
      </div>
      <div className="live-control-filter-tags" aria-label="ตัวกรองการ์ดที่ใช้บ่อย">
        {quickFilters.map((filter) => {
          const active = normalizeSearchText(query) === normalizeSearchText(filter.query)
          return <button
            className={`live-control-filter-tag ${filter.tone}${active ? ' active' : ''}`}
            type="button"
            key={filter.query}
            onClick={() => active ? clearSearch() : setQuery(filter.query)}
            aria-pressed={active}
          >{filter.label}{active ? <span aria-hidden="true">×</span> : null}</button>
        })}
        {query && !quickFilters.some((filter) => normalizeSearchText(filter.query) === normalizeSearchText(query))
          ? <button className={`live-control-filter-tag ${filterTone(query)} active custom`} type="button" onClick={clearSearch}>
            <span>{query}</span><span aria-hidden="true">×</span>
          </button>
          : null}
      </div>
    </div>

    {query && resultCount === 0 ? <div className="live-control-search-empty" role="status">
      <strong>ไม่พบการ์ดที่ตรงกับ “{query}”</strong>
      <span>ลองใช้คำสั้นลง เช่น Webhook, Pilot, ผู้ทดสอบ หรือ Audit</span>
      <button className="button secondary" type="button" onClick={clearSearch}>แสดงการ์ดทั้งหมด</button>
    </div> : null}

    <div ref={listRef} className="live-control-card-list">{children}</div>
  </section>
}
