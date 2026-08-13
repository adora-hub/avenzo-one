import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const layout = await readFile(new URL('../src/app/layout.tsx', import.meta.url), 'utf8')
const themeToggle = await readFile(new URL('../src/app/components/theme-toggle.tsx', import.meta.url), 'utf8')

test('root layout restores the saved theme before hydration', () => {
  assert.match(layout, /import\s*\{\s*cookies\s*\}\s*from\s*['"]next\/headers['"]/)
  assert.match(layout, /const\s+cookieStore\s*=\s*await\s+cookies\(\)/)
  assert.match(layout, /data-theme=\{initialTheme\}/)
  assert.doesNotMatch(layout, /beforeInteractive/)
  assert.doesNotMatch(layout, /next\/script/)
})

test('theme toggle initializes from storage instead of forcing light mode', () => {
  assert.match(themeToggle, /useState<Theme>\(\(\)\s*=>\s*getStoredTheme\(\)\)/)
  assert.doesNotMatch(themeToggle, /useState<Theme>\(['"]light['"]\)/)
  assert.match(themeToggle, /document\.cookie\s*=/)
  assert.match(themeToggle, /persistTheme\(nextTheme\)/)
})
