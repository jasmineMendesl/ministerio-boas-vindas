import { describe, expect, it } from 'vitest'
import { groupVolunteerRoles, scheduleNotification } from '../../../supabase/functions/_shared/schedule-notifications'

describe('schedule notification messages', () => {
  it('includes the service, time and volunteer role', () => {
    expect(scheduleNotification({ kind: 'service', name: 'Domingo às 10h', roles: ['portaria'] })).toEqual({
      title: 'Nova escala publicada', body: 'Você está escalado para Domingo às 10h, na função Portaria. Acesse para ver.',
    })
  })
  it('keeps the assignment message and appends the observation alert', () => {
    expect(scheduleNotification({ kind: 'service', name: 'Quinta às 19h15', roles: ['leader', 'opening_prayer'], observation: 'Chegar antes' }).body)
      .toBe('Você está escalado para Quinta às 19h15, na função Líder, Oração inicial. Acesse para ver. Atenção: essa escala tem observação.')
    expect(scheduleNotification({ kind: 'service', name: 'Domingo às 18h', observation: '  ' }).body).not.toContain('Atenção')
  })
  it('uses the extra schedule title and time', () => {
    expect(scheduleNotification({ kind: 'extra', name: 'Encontro especial', time: '17:30:00' })).toEqual({
      title: 'Escala extra publicada', body: 'Você está escalado para Encontro especial às 17:30. Acesse para ver.',
    })
  })
  it('includes the assigned role for Projeto Pertencer', () => {
    expect(scheduleNotification({ kind: 'pertencer', roles: ['Recepção'] })).toEqual({
      title: 'Nova escala publicada', body: 'Você está escalado para o Projeto Pertencer, na função Recepção. Acesse para ver.',
    })
  })
  it('groups each person’s own roles once without mixing recipients or including unassigned items', () => {
    const groups = groupVolunteerRoles([
      { volunteer_profile_id: 'a', role: 'portaria' }, { volunteer_profile_id: 'b', role: 'media' },
      { volunteer_profile_id: 'a', role: 'leader' }, { volunteer_profile_id: 'a', role: 'portaria' },
      { volunteer_profile_id: null, role: 'support' },
    ])
    expect([...groups]).toEqual([['a', ['portaria', 'leader']], ['b', ['media']]])
  })
})
