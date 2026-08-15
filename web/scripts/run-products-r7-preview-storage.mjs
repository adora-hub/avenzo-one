import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const EXPECTED_PREVIEW_REF = 'kenhlerbirchcpzgnfsh'
const BUCKET = 'product-images'

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) return []
    return [[match[1], match[2].trim().replace(/^"|"$/g, '')]]
  }))
}

const [mode, storagePath, filePath] = process.argv.slice(2)
if (!['upload', 'remove'].includes(mode) || !storagePath) {
  throw new Error('usage: node run-products-r7-preview-storage.mjs <upload|remove> <storage-path> [file-path]')
}

const env = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'))
const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
const projectRef = url.hostname.split('.')[0]
if (projectRef !== EXPECTED_PREVIEW_REF) throw new Error('preview_project_guard_failed')
if (!env.SUPABASE_SECRET_KEY) throw new Error('preview_secret_key_missing')

const supabase = createClient(url.origin, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

if (mode === 'upload') {
  if (!filePath) throw new Error('upload_file_path_required')
  const file = await readFile(filePath)
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: 'image/png',
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw error
  console.log(JSON.stringify({ ok: true, projectRef, mode, bytes: file.byteLength }))
} else {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath])
  if (error) throw error
  console.log(JSON.stringify({ ok: true, projectRef, mode }))
}
