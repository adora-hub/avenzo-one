'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'avenzaone-theme'

type ThemeToggleProps = {
  variant?: 'compact' | 'account'
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const storedTheme = window.localStorage.getItem(STORAGE_KEY)
  if (storedTheme === 'dark' || storedTheme === 'light') return storedTheme
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function persistTheme(theme: Theme) {
  window.localStorage.setItem(STORAGE_KEY, theme)
  document.cookie = `${STORAGE_KEY}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`
}

export function ThemeToggle({ variant = 'compact' }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())

  useEffect(() => {
    const storedTheme = getStoredTheme()
    document.documentElement.dataset.theme = storedTheme
    persistTheme(storedTheme)
    setTheme(storedTheme)
  }, [])

  function toggleTheme() {
    const nextTheme: Theme = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = nextTheme
    persistTheme(nextTheme)
    setTheme(nextTheme)
  }

  const isDark = theme === 'dark'
  const actionLabel = isDark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'

  if (variant === 'account') {
    return (
      <button
        className="theme-toggle account-theme-toggle"
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={actionLabel}
        onClick={toggleTheme}
      >
        <span className="account-theme-copy">
          <strong>ธีมหน้าจอ</strong>
          <small>{isDark ? 'กำลังใช้โหมดมืด' : 'กำลังใช้โหมดสว่าง'}</small>
        </span>
        <span className={`account-theme-switch ${isDark ? 'active' : ''}`} aria-hidden="true">
          <span />
        </span>
      </button>
    )
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={actionLabel}
      title={actionLabel}
    >
      <span aria-hidden="true">{isDark ? '☀' : '◐'}</span>
      <span>{isDark ? 'สว่าง' : 'มืด'}</span>
    </button>
  )
}
