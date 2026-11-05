import { describe, expect, it } from 'vitest'
import { normalizeBrazilianPhone, normalizeVisitorName } from '../../supabase/functions/_shared/visitor-validation.ts'

describe('validação do cadastro público', () => {
  it('normaliza telefones brasileiros para E.164 sem confundir o DDD 55 com o código do país', () => {
    expect(normalizeBrazilianPhone('(11) 98765-4321')).toBe('+5511987654321')
    expect(normalizeBrazilianPhone('55 11 98765-4321')).toBe('+5511987654321')
    expect(normalizeBrazilianPhone('+1 (202) 555-0123')).toBe('+12025550123')
    expect(normalizeBrazilianPhone('invalid')).toBeNull()
  })

  it('limpa espaços do nome e rejeita conteúdo vazio ou controles', () => {
    expect(normalizeVisitorName('  Maria   da Silva  ')).toBe('Maria da Silva')
    expect(normalizeVisitorName(' ')).toBeNull()
    expect(normalizeVisitorName('João\u0000Silva')).toBeNull()
  })
})
