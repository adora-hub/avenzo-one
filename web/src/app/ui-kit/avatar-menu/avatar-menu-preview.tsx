'use client'

import { useEffect, useRef, useState } from 'react'

type IconName = 'chevron' | 'devices' | 'invite' | 'logout' | 'profile' | 'settings' | 'workspace'

function MenuIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    chevron: <path d="m8 10 4 4 4-4" />,
    devices: <><rect x="4" y="5" width="12" height="9" rx="2" /><path d="M8 18h4M10 14v4M18 8h2v9h-5v-2" /></>,
    invite: <><path d="M12 5v14M5 12h14" /></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></>,
    profile: <><circle cx="12" cy="8" r="3" /><path d="M5.5 19c.8-3.2 3-5 6.5-5s5.7 1.8 6.5 5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" /></>,
    workspace: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h3M15 13h1" /></>,
  }

  return <svg aria-hidden="true" viewBox="0 0 24 24">{paths[name]}</svg>
}

function AccountMenu({ variant }: { variant: 'light' | 'dark' }) {
  const [open, setOpen] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <section className={`avatar-kit-preview avatar-kit-preview-${variant}`} aria-label={`ตัวอย่างเมนูบัญชีโหมด${variant === 'light' ? 'สว่าง' : 'มืด'}`}>
      <div className="avatar-kit-preview-label">
        <span>{variant === 'light' ? 'LIGHT MODE' : 'DARK MODE'}</span>
        <strong>{variant === 'light' ? 'โหมดสว่าง' : 'โหมดมืด'}</strong>
      </div>

      <div className="avatar-kit-demo-bar">
        <span className="avatar-kit-demo-brand">AVENZAONE</span>
        <div className="avatar-kit-account" ref={containerRef}>
          <button
            className="avatar-kit-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="avatar-kit-avatar" aria-hidden="true">ร</span>
            <span className="avatar-kit-trigger-copy">
              <strong>ธนาธิป</strong>
              <small>Super Admin</small>
            </span>
            <span className={`avatar-kit-chevron ${open ? 'open' : ''}`}><MenuIcon name="chevron" /></span>
          </button>

          {open ? (
            <div className="avatar-kit-menu" role="menu" aria-label="เมนูบัญชี">
              <header className="avatar-kit-identity">
                <span className="avatar-kit-avatar avatar-kit-avatar-large" aria-hidden="true">ร</span>
                <span>
                  <strong>ธนาธิป</strong>
                  <small>stadretstillchi2@gmail.com</small>
                </span>
                <em>Super Admin</em>
              </header>

              <div className="avatar-kit-menu-group">
                <span className="avatar-kit-group-label">บัญชีและการจัดการ</span>
                <button type="button" role="menuitem"><MenuIcon name="profile" /><span>โปรไฟล์ของฉัน</span></button>
                <button type="button" role="menuitem"><MenuIcon name="settings" /><span>ตั้งค่าบัญชี</span></button>
              </div>

              <div className="avatar-kit-menu-group">
                <button type="button" role="menuitem"><MenuIcon name="devices" /><span>อุปกรณ์และ Session</span></button>
                <button type="button" role="menuitem"><MenuIcon name="workspace" /><span>สลับ Workspace</span></button>
                <button type="button" role="menuitem"><MenuIcon name="invite" /><span>เชิญสมาชิก</span></button>
              </div>

              <div className="avatar-kit-menu-group avatar-kit-menu-danger">
                <button type="button" role="menuitem"><MenuIcon name="logout" /><span>ออกจากระบบ</span></button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <p className="avatar-kit-demo-hint">กดที่ Avatar เพื่อทดลองเปิด–ปิดเมนู · กด Esc เพื่อปิด</p>
    </section>
  )
}

export function AvatarMenuPreview() {
  return (
    <div className="avatar-kit-grid">
      <AccountMenu variant="light" />
      <AccountMenu variant="dark" />
    </div>
  )
}
