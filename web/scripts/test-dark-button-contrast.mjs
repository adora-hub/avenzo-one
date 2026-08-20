import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')
const darkTheme = css.match(/html\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
const sharedButton = css.match(/\.button\s*\{([^}]*)\}/)?.[1] ?? ''
const hoverButton = css.match(/\.button:not\(:disabled\):hover\s*\{([^}]*)\}/)?.[1] ?? ''

function darkToken(name) {
  return darkTheme.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
}

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16) / 255)
  const linear = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

test('dark theme exposes visible semantic borders for primary buttons', () => {
  assert.match(darkTheme, /--button-primary-border:\s*#[0-9a-f]{6}/i)
  assert.match(darkTheme, /--button-primary-hover-border:\s*#[0-9a-f]{6}/i)
  assert.doesNotMatch(darkTheme, /--button-primary-border:\s*var\(--surface-(?:background|elevated)\)/i)
})

test('dark primary button surface contrasts with its card and text', () => {
  const surface = darkToken('surface-background')
  const background = darkToken('button-primary-background')
  const text = darkToken('button-primary-text')

  assert.ok(surface && background && text, 'Dark button and surface colors must be explicit six-digit hex values')
  assert.ok(contrast(background, surface) >= 3, 'Primary button must have at least 3:1 contrast against the card')
  assert.ok(contrast(background, text) >= 4.5, 'Primary button text must have at least 4.5:1 contrast')
})

test('shared buttons render and preserve their semantic border', () => {
  assert.match(sharedButton, /border:\s*1px\s+solid\s+var\(--button-primary-border\)/i)
  assert.doesNotMatch(sharedButton, /border:\s*0(?:\s*;|$)/i)
  assert.match(hoverButton, /border-color:\s*var\(--button-primary-hover-border\)/i)
})
