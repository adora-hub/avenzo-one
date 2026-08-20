const IDENTIFIER_SEQUENCE_PATTERN = /^(.*?)(\d+)$/

export function identifierSequenceCandidates(
  value: string,
  offset = 1,
  count = 100,
) {
  const normalized = value.trim().toUpperCase()
  const safeOffset = Math.max(1, Math.trunc(offset))
  const safeCount = Math.min(100, Math.max(1, Math.trunc(count)))
  const match = normalized.match(IDENTIFIER_SEQUENCE_PATTERN)

  if (!match) {
    return Array.from({ length: safeCount }, (_, index) => (
      `${normalized}-${String(safeOffset + index + 1).padStart(3, '0')}`
    ))
  }

  const prefix = match[1]
  const current = Number(match[2])
  const digits = match[2].length
  return Array.from({ length: safeCount }, (_, index) => (
    `${prefix}${String(current + safeOffset + index).padStart(digits, '0')}`
  ))
}
export function nextIdentifierOutsideSet(
  value: string,
  unavailable: ReadonlySet<string>,
) {
  const normalizedUnavailable = new Set(
    Array.from(unavailable, (item) => item.trim().toUpperCase()).filter(Boolean),
  )

  for (let offset = 1; offset <= 10_000; offset += 100) {
    const candidate = identifierSequenceCandidates(value, offset, 100)
      .find((item) => !normalizedUnavailable.has(item))
    if (candidate) return candidate
  }

  return ''
}