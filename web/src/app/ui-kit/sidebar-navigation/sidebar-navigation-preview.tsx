'use client'

import { useState } from 'react'

type NavigationGroup = {
  id: string
  label: string
  description: string
  items: string[]
}

const navigationGroups: NavigationGroup[] = [
  {
    id: 'access',
    label: 'ผู้ใช้ แผนและสิทธิ์',
    description: 'จัดการผู้ดูแล แพ็กเกจ และสิทธิ์ใช้งาน',
    items: ['ผู้ดูแลระบบ', 'Feature Catalog', 'Plans & Prices', 'แจ้งเตือน Subscription'],
  },
  {
    id: 'billing',
    label: 'การเงินและการชำระเงิน',
    description: 'Invoice หลักฐาน และระบบรับชำระเงิน',
    items: ['Billing & Invoice', 'ตรวจหลักฐานโอน', 'ตรวจความพร้อม Production', 'ศูนย์ควบคุม Live'],
  },
  {
    id: 'security',
    label: 'ความปลอดภัย',
    description: 'การยืนยันตัวตนและนโยบายบัญชี',
    items: ['ตั้งค่า MFA'],
  },
]

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? 'open' : ''} viewBox="0 0 20 20" aria-hidden="true">
      <path d="m6.5 8 3.5 3.5L13.5 8" />
    </svg>
  )
}

function RailIcon({ name }: { name: 'menu' | 'home' | 'shield' }) {
  if (name === 'menu') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" /></svg>
  }

  if (name === 'home') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1Z" /></svg>
  }

  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5.5 5.7v5.6c0 4 2.6 7.6 6.5 9.2 3.9-1.6 6.5-5.2 6.5-9.2V5.7Z" /><path d="M9.5 12h5M12 9.5v5" /></svg>
}

export function SidebarNavigationPreview() {
  const [isDark, setIsDark] = useState(false)
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  const [activeItem, setActiveItem] = useState('ภาพรวม')
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    access: false,
    billing: false,
    security: false,
  })

  function toggleGroup(groupId: string) {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }))
  }

  return (
    <section className={`sidebar-kit-workbench ${isDark ? 'dark' : ''}`}>
      <div className="sidebar-kit-toolbar">
        <div>
          <strong>Interactive Preview</strong>
          <span>ทดลองย่อ–ขยาย Sidebar เปิดหมวดงาน และเลือกเมนูได้</span>
        </div>
        <button
          className="sidebar-kit-theme-control"
          type="button"
          role="switch"
          aria-checked={isDark}
          onClick={() => setIsDark((current) => !current)}
        >
          <span><strong>โหมดมืด</strong><small>ตรวจสีและความชัดเจน</small></span>
          <i className={isDark ? 'active' : ''} aria-hidden="true"><b /></i>
        </button>
      </div>

      <div className={`sidebar-kit-canvas ${isPanelOpen ? '' : 'panel-closed'}`}>
        <aside className="sidebar-kit-rail" aria-label="แถบนำทางหลัก">
          <button
            className="sidebar-kit-rail-button menu"
            type="button"
            aria-label={isPanelOpen ? 'ยุบเมนู' : 'ขยายเมนู'}
            aria-expanded={isPanelOpen}
            onClick={() => setIsPanelOpen((current) => !current)}
          >
            <RailIcon name="menu" />
          </button>
          <button
            className={`sidebar-kit-rail-button ${activeItem === 'ภาพรวม' ? 'active' : ''}`}
            type="button"
            aria-label="ภาพรวม"
            onClick={() => setActiveItem('ภาพรวม')}
          >
            <RailIcon name="home" />
          </button>
          <button
            className={`sidebar-kit-rail-button ${activeItem !== 'ภาพรวม' ? 'active' : ''}`}
            type="button"
            aria-label="Platform Admin"
            onClick={() => setIsPanelOpen(true)}
          >
            <RailIcon name="shield" />
          </button>
          <button className="sidebar-kit-rail-avatar" type="button" aria-label="เปิดเมนูบัญชี">ธ</button>
        </aside>

        {isPanelOpen && (
          <aside className="sidebar-kit-sidebar" aria-label="ตัวอย่างเมนู Platform Admin">
            <div className="sidebar-kit-brand">
              <span>A</span>
              <div><strong>AVENZAONE</strong><small>Platform Admin</small></div>
            </div>

            <nav className="sidebar-kit-navigation">
              <button
                className={`sidebar-kit-direct-link ${activeItem === 'ภาพรวม' ? 'active' : ''}`}
                type="button"
                aria-current={activeItem === 'ภาพรวม' ? 'page' : undefined}
                onClick={() => setActiveItem('ภาพรวม')}
              >
                <RailIcon name="home" />
                <span><strong>ภาพรวม</strong><small>สถานะและกิจกรรมของระบบ</small></span>
              </button>

              {navigationGroups.map((group) => {
                const isOpen = openGroups[group.id]
                return (
                  <div className={`sidebar-kit-group ${isOpen ? 'open' : ''}`} key={group.id}>
                    <button
                      className="sidebar-kit-group-trigger"
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`sidebar-kit-group-${group.id}`}
                      onClick={() => toggleGroup(group.id)}
                    >
                      <Chevron open={isOpen} />
                      <span><strong>{group.label}</strong><small>{group.description}</small></span>
                    </button>
                    <div id={`sidebar-kit-group-${group.id}`} className="sidebar-kit-submenu" hidden={!isOpen}>
                      {group.items.map((item) => (
                        <button
                          className={activeItem === item ? 'active' : ''}
                          type="button"
                          aria-current={activeItem === item ? 'page' : undefined}
                          onClick={() => setActiveItem(item)}
                          key={item}
                        >
                          <span>{item}</span>
                          {activeItem === item && <i aria-hidden="true" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </nav>
          </aside>
        )}

        <div className="sidebar-kit-content-preview">
          <div className="sidebar-kit-content-header">
            <span className="eyebrow">CURRENT PAGE</span>
            <h2>{activeItem}</h2>
            <p>{activeItem === 'ภาพรวม' ? 'ภาพรวมเป็นเมนูตรง เปิดหน้าแรกได้ทันทีโดยไม่มีเมนูย่อย' : 'เมนูภายในหมวดงานช่วยจัดฟังก์ชันจำนวนมากให้ค้นหาและใช้งานได้ง่ายขึ้น'}</p>
          </div>
          <div className="sidebar-kit-demo-grid">
            <article><span>ตำแหน่งปัจจุบัน</span><strong>Platform Admin / {activeItem}</strong></article>
            <article><span>รูปแบบเมนู</span><strong>{activeItem === 'ภาพรวม' ? 'เมนูหลักแบบเปิดตรง' : 'หัวข้อหลัก → เมนูรอง'}</strong></article>
            <article className="wide"><span>หลักการออกแบบ</span><strong>แถบไอคอนหลักอยู่ถาวร ปุ่มสามขีดควบคุม Sidebar และเมนูแรกเปิดหน้าได้ทันที</strong></article>
          </div>
        </div>
      </div>
    </section>
  )
}
