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
