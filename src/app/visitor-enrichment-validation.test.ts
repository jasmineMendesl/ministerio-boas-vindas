import { describe, expect, it } from 'vitest'
import {
  isValidPrayerRequest,
  isValidServiceDate,
  normalizePrayerRequest,
} from '../../supabase/functions/_shared/visitor-validation.ts'

describe('campos adicionais do cadastro público', () => {
  it('aceita somente data de culto válida, existente e não futura', () => {
    expect(isValidServiceDate('2026-11-05', '2026-11-05')).toBe(true)
    expect(isValidServiceDate('2026-11-04', '2026-11-05')).toBe(true)
    expect(isValidServiceDate('2026-02-30', '2026-11-05')).toBe(false)
    expect(isValidServiceDate('2026-11-06', '2026-11-05')).toBe(false)
  })

  it('normaliza pedido de oração opcional e limita tamanho e controles', () => {
    expect(normalizePrayerRequest('  Ore pela minha família.  ')).toBe('Ore pela minha família.')
    expect(normalizePrayerRequest('  ')).toBeNull()
    expect(isValidPrayerRequest('pedido'.repeat(334))).toBe(false)
    expect(isValidPrayerRequest('pedido\u0000inválido')).toBe(false)
  })
})
