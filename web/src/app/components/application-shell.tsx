'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SignOutButton } from './sign-out-button'
import { ThemeToggle } from './theme-toggle'

type ApplicationShellProps = {
  email: string
  isPlatformAdmin: boolean
  section: 'workspace' | 'platform'
  children: ReactNode
  displayName?: string
  roleLabel?: string
}

const platformOverviewLink = {
  href: '/platform-admin',
  label: 'ภาพรวม',
  description: 'สถานะและกิจกรรมของระบบ',
}

const platformNavigationGroups = [
  { key: 'users-plans', label: 'ผู้ใช้ แผนและสิทธิ์', description: 'จัดการผู้ดูแล แพ็กเกจ และสิทธิ์ใช้งาน', links: [
    { href: '/platform-admin/access', label: 'ผู้ดูแลระบบ' },
    { href: '/platform-admin/features', label: 'Feature Catalog' },
    { href: '/platform-admin/plans', label: 'Plans & Prices' },
    { href: '/platform-admin/subscription-notifications', label: 'แจ้งเตือน Subscription' },
  ] },
  { key: 'billing', label: 'การเงินและการชำระเงิน', description: 'Invoice หลักฐาน และระบบรับชำระเงิน', links: [
    { href: '/platform-admin/billing', label: 'Billing & Invoice' },
    { href: '/platform-admin/billing/transfer-proofs', label: 'ตรวจหลักฐานโอน' },
    { href: '/platform-admin/billing/readiness', label: 'ตรวจความพร้อม Production' },
    { href: '/platform-admin/billing/live-control', label: 'ศูนย์ควบคุม Live' },
  ] },
  { key: 'security', label: 'ความปลอดภัย', description: 'การยืนยันตัวตนและนโยบายบัญชี', links: [
    { href: '/platform-admin/security/mfa', label: 'ตั้งค่า MFA' },
  ] },
]

function Icon({ name }: { name: 'home' | 'workspace' | 'shield' | 'menu' | 'close' | 'user' | 'chevron' | 'devices' }) {
  if (name === 'menu') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
  }
  if (name === 'close') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
  }
  if (name === 'shield') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 8.7 7 10 4.1-1.3 7-5.4 7-10V6l-7-3Zm0 5v8m-4-4h8" /></svg>
  }
  if (name === 'user') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" /></svg>
  }
  if (name === 'chevron') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>
  }
  if (name === 'devices') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="13" height="10" rx="2" /><path d="M7 19h5m-2-4v4" /><rect x="17" y="8" width="4" height="9" rx="1" /></svg>
  }
  if (name === 'workspace') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v5H4zM14 15h6v5h-6z" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" /></svg>
}

function isCurrent(pathname: string, href: string) {
  return href === '/platform-admin' ? pathname === href : pathname.startsWith(href)
}

function navigationGroupForPath(pathname: string) {
  return platformNavigationGroups.find((group) => group.links.some((item) => isCurrent(pathname, item.href)))?.key
}

export function ApplicationShell({ email, isPlatformAdmin, section, children, displayName, roleLabel }: ApplicationShellProps) {
  const pathname = usePathname()
  const [isContextCollapsed, setIsContextCollapsed] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isCompactLayout, setIsCompactLayout] = useState(false)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [openNavigationGroups, setOpenNavigationGroups] = useState<Set<string>>(() => {
    const activeGroup = navigationGroupForPath(pathname)
    return activeGroup ? new Set([activeGroup]) : new Set()
  })
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const accountTriggerRef = useRef<HTMLButtonElement>(null)
  const isAccountPage = pathname.startsWith('/account/security/sessions')
  const workspaceLinks = [{ href: '/dashboard', label: 'ภาพรวม Workspace' }]
  const accountName = displayName?.trim() || email.split('@')[0] || 'บัญชีของฉัน'
  const accountRole = roleLabel?.trim() || (isPlatformAdmin ? 'Platform Admin' : 'สมาชิก Workspace')
  const avatarLabel = Array.from(accountName)[0]?.toUpperCase() || 'A'

  useEffect(() => {
    setIsDrawerOpen(false)
    setIsAccountMenuOpen(false)
    const activeGroup = navigationGroupForPath(pathname)
    setOpenNavigationGroups(activeGroup ? new Set([activeGroup]) : new Set())
  }, [pathname])

  useEffect(() => {
    if (!isAccountMenuOpen) return

    function closeOnOutsideClick(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) setIsAccountMenuOpen(false)
    }

    function closeAccountMenuOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setIsAccountMenuOpen(false)
      accountTriggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    window.addEventListener('keydown', closeAccountMenuOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeAccountMenuOnEscape)
    }
  }, [isAccountMenuOpen])

  useEffect(() => {
    const compactLayout = window.matchMedia('(max-width: 1040px)')

    function syncCompactLayout(event: MediaQueryListEvent | MediaQueryList) {
      setIsCompactLayout(event.matches)
      if (!event.matches) setIsDrawerOpen(false)
    }

    syncCompactLayout(compactLayout)
    compactLayout.addEventListener('change', syncCompactLayout)
    return () => compactLayout.removeEventListener('change', syncCompactLayout)
  }, [])

  useEffect(() => {
    if (!isDrawerOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsDrawerOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isDrawerOpen])

  function toggleNavigation() {
    if (window.matchMedia('(max-width: 1040px)').matches) {
      setIsDrawerOpen((current) => !current)
      return
    }

    setIsContextCollapsed((current) => !current)
  }

  function toggleNavigationGroup(groupKey: string) {
    setOpenNavigationGroups((current) => {
      const next = new Set(current)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  return (
    <div className={`app-shell ${isContextCollapsed ? 'context-collapsed' : ''} ${isDrawerOpen ? 'drawer-open' : ''}`}>
      <aside className="app-rail" aria-label="เมนูหลัก">
        <button
          className="app-menu-button"
          type="button"
          aria-label={isCompactLayout ? (isDrawerOpen ? 'ปิดเมนู' : 'เปิดเมนู') : (isContextCollapsed ? 'ขยายเมนู' : 'ย่อเมนู')}
          aria-controls="application-context-navigation"
          aria-expanded={isCompactLayout ? isDrawerOpen : !isContextCollapsed}
          onClick={toggleNavigation}
        >
          <Icon name="menu" />
        </button>
        <nav className="app-rail-nav">
          <Link className={`app-rail-link ${section === 'workspace' ? 'active' : ''}`} href="/dashboard" aria-label="Workspace" aria-current={section === 'workspace' && !isAccountPage ? 'page' : undefined}><Icon name="home" /></Link>
          {isPlatformAdmin && <Link className={`app-rail-link ${section === 'platform' ? 'active' : ''}`} href="/platform-admin" aria-label="Platform Admin" aria-current={section === 'platform' && !isAccountPage ? 'page' : undefined}><Icon name="shield" /></Link>}
        </nav>
        <Link className={`app-rail-account ${isAccountPage ? 'active' : ''}`} href="/account/security/sessions" aria-label="บัญชีของฉัน" aria-current={isAccountPage ? 'page' : undefined}>{avatarLabel}</Link>
      </aside>

      <aside id="application-context-navigation" className="app-context" aria-label="เมนูส่วนงาน">
        <div className="app-context-heading">
          <Link className="app-context-brand" href="/dashboard">AVENZAONE</Link>
          <button className="app-context-close" type="button" aria-label="ปิดเมนู" onClick={() => setIsDrawerOpen(false)}><Icon name="close" /></button>
        </div>
        <div className="app-context-title">{section === 'platform' ? 'Platform Admin' : 'Workspace'}</div>
        <nav className="app-context-nav">
          {section === 'platform'
            ? <>
              <Link
                className={`app-context-direct-link ${isCurrent(pathname, platformOverviewLink.href) ? 'active' : ''}`}
                href={platformOverviewLink.href}
                aria-current={isCurrent(pathname, platformOverviewLink.href) ? 'page' : undefined}
              >
                <Icon name="home" />
                <span><strong>{platformOverviewLink.label}</strong><small>{platformOverviewLink.description}</small></span>
              </Link>
              {platformNavigationGroups.map((group) => {
                const isOpen = openNavigationGroups.has(group.key)
                const containsActiveLink = group.links.some((item) => isCurrent(pathname, item.href))
                const submenuId = `platform-navigation-${group.key}`
                return (
                  <div className={`app-context-group ${containsActiveLink ? 'contains-active' : ''}`} key={group.key}>
                    <button
                      className="app-context-group-trigger"
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={submenuId}
                      onClick={() => toggleNavigationGroup(group.key)}
                    >
                      <Icon name="chevron" />
                      <span><strong>{group.label}</strong><small>{group.description}</small></span>
                    </button>
                    <div id={submenuId} className="app-context-submenu" hidden={!isOpen}>
                      {group.links.map((item) => {
                        const active = isCurrent(pathname, item.href)
                        return <Link key={item.href} className={active ? 'active' : ''} href={item.href} aria-current={active ? 'page' : undefined}>{item.label}</Link>
                      })}
                    </div>
                  </div>
                )
              })}
            </>
            : workspaceLinks.map((item) => {
              const active = isCurrent(pathname, item.href)
              return <Link key={item.href} className={active ? 'active' : ''} href={item.href} aria-current={active ? 'page' : undefined}>{item.label}</Link>
            })}
        </nav>
      </aside>

      <div className="app-stage">
        <header className="app-header">
          <div className="app-header-leading">
            <button
              className="app-header-menu-button"
              type="button"
              aria-label={isDrawerOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
              aria-controls="application-context-navigation"
              aria-expanded={isDrawerOpen}
              onClick={toggleNavigation}
            >
              <Icon name="menu" />
            </button>
            <div className="app-header-title"><Icon name={section === 'platform' ? 'shield' : 'workspace'} /><span>{section === 'platform' ? 'Platform Admin' : 'Workspace'}</span></div>
          </div>
          <div className="app-header-actions">
            <div className="app-account-menu" ref={accountMenuRef}>
              <button
                ref={accountTriggerRef}
                className="app-account-trigger"
                type="button"
                aria-label="เปิดเมนูบัญชี"
                aria-haspopup="menu"
                aria-expanded={isAccountMenuOpen}
                aria-controls="app-account-popover"
                onClick={() => setIsAccountMenuOpen((current) => !current)}
              >
                <span className="app-account-avatar" aria-hidden="true">{avatarLabel}</span>
                <span className="app-account-trigger-copy">
                  <strong>{accountName}</strong>
                  <small>{accountRole}</small>
                </span>
                <span className={`app-account-chevron ${isAccountMenuOpen ? 'open' : ''}`}><Icon name="chevron" /></span>
              </button>
              {isAccountMenuOpen && (
                <div id="app-account-popover" className="app-account-popover" role="menu" aria-label="บัญชีของฉัน">
                  <div className="app-account-identity">
                    <span className="app-account-avatar large" aria-hidden="true">{avatarLabel}</span>
                    <span className="app-account-identity-copy">
                      <strong>{accountName}</strong>
                      <small>{email}</small>
                    </span>
                    <em>{accountRole}</em>
                  </div>
                  <div className="app-account-group">
                    <span className="app-account-group-label">บัญชีและความปลอดภัย</span>
                    <Link role="menuitem" className={`app-account-link ${isAccountPage ? 'active' : ''}`} href="/account/security/sessions" aria-current={isAccountPage ? 'page' : undefined}>
                      <Icon name="devices" />
                      <span><strong>อุปกรณ์และ Session</strong><small>ตรวจสอบอุปกรณ์ที่เข้าสู่ระบบ</small></span>
                    </Link>
                  </div>
                  <div className="app-account-group">
                    <ThemeToggle variant="account" />
                  </div>
                  <div className="app-account-group">
                    <span className="app-account-group-label">สลับพื้นที่ทำงาน</span>
                    {section === 'platform'
                      ? <Link role="menuitem" className="app-account-link" href="/dashboard"><Icon name="workspace" /><span><strong>กลับ Dashboard</strong><small>ไปยัง Workspace ของคุณ</small></span></Link>
                      : isPlatformAdmin && <Link role="menuitem" className="app-account-link" href="/platform-admin"><Icon name="shield" /><span><strong>ไปที่ Platform Admin</strong><small>จัดการระบบและ Billing</small></span></Link>}
                  </div>
                  <div className="app-account-danger">
                    <SignOutButton className="app-account-logout-button" showIcon />
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="app-shell-main">{children}</main>
      </div>

      <button className="app-drawer-backdrop" type="button" aria-label="ปิดเมนู" onClick={() => setIsDrawerOpen(false)} />

      <nav className="app-mobile-nav" aria-label="เมนูมือถือ">
        <Link className={section === 'workspace' && !isAccountPage ? 'active' : ''} href="/dashboard" aria-current={section === 'workspace' && !isAccountPage ? 'page' : undefined}><Icon name="home" /><span>หน้าแรก</span></Link>
        {isPlatformAdmin && <Link className={section === 'platform' && !isAccountPage ? 'active' : ''} href="/platform-admin" aria-current={section === 'platform' && !isAccountPage ? 'page' : undefined}><Icon name="shield" /><span>แอดมิน</span></Link>}
        <Link className={isAccountPage ? 'active' : ''} href="/account/security/sessions" aria-current={isAccountPage ? 'page' : undefined}><Icon name="workspace" /><span>บัญชี</span></Link>
      </nav>
    </div>
  )
}
