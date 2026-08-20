import { FoundationError } from './errors'

export type FoundationCursor = { timestamp: string; id: string }

export function encodeFoundationCursor(cursor: FoundationCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeFoundationCursor(value?: string | null): FoundationCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as FoundationCursor
    if (!parsed.timestamp || Number.isNaN(Date.parse(parsed.timestamp))
      || !/^[0-9a-f-]{36}$/i.test(parsed.id)) {
      throw new Error('invalid cursor')
    }
    return parsed
  } catch {
    throw new FoundationError('validation_failed', 400)
  }
}

