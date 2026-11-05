export function normalizeBrazilianPhone(input: string): string | null {
  const trimmed = input.trim()
  let digits = trimmed.replace(/\D/g, '')

  if (trimmed.startsWith('+')) {
    if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null
    return `+${digits}`
  }
  if (trimmed.startsWith('00')) {
    digits = digits.slice(2)
    if (!digits.startsWith('55') || (digits.length !== 12 && digits.length !== 13)) return null
    return `+${digits}`
  }
  if (digits.length === 10 || digits.length === 11) return digits.startsWith('0') ? null : `+55${digits}`
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return `+${digits}`
  return null
}

export function normalizeVisitorName(input: string): string | null {
  const name = input.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) return null
  return name
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function isValidServiceDate(value: string, today: string): boolean {
  return isCalendarDate(value) && isCalendarDate(today) && value <= today
}

export function isValidPrayerRequest(value: string): boolean {
  const normalized = value.normalize('NFKC')
  return normalized.length <= 2000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
}

export function normalizePrayerRequest(value: string): string | null {
  if (!isValidPrayerRequest(value)) return null
  const request = value.normalize('NFKC').replace(/\r\n?/g, '\n').trim()
  return request || null
}
