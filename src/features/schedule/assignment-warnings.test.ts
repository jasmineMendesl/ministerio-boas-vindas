import { describe, expect, it } from 'vitest'
import { scheduledOnThursdayThisWeek, servedSameServiceLastWeek } from './assignment-warnings'

function schedule(id: string, date: string, service = 'Domingo às 10h', assigned = true, absent = false) {
  return { id, service_date: date, service_label: service, assignments: assigned ? [{ volunteer_profile_id: 'person-1' }] : [], attendance: [{ volunteer_profile_id: 'person-1', was_absent: absent }] }
}

describe('assignment warnings', () => {
  const sunday = schedule('current', '2026-11-15')
  it('matches exactly the same service seven days earlier, including year boundaries', () => {
    expect(servedSameServiceLastWeek([schedule('previous', '2026-11-08')], sunday, 'person-1')).toBe(true)
    expect(servedSameServiceLastWeek([schedule('previous', '2026-11-08', 'Domingo às 18h')], sunday, 'person-1')).toBe(false)
    expect(servedSameServiceLastWeek([schedule('previous', '2026-11-01')], sunday, 'person-1')).toBe(false)
    expect(servedSameServiceLastWeek([schedule('previous', '2025-12-28')], schedule('current', '2026-01-04'), 'person-1')).toBe(true)
  })
  it('does not count an absence, an unassigned volunteer or a different person as service', () => {
    expect(servedSameServiceLastWeek([schedule('previous', '2026-11-08', undefined, true, true)], sunday, 'person-1')).toBe(false)
    expect(servedSameServiceLastWeek([schedule('previous', '2026-11-08', undefined, false)], sunday, 'person-1')).toBe(false)
    expect(servedSameServiceLastWeek([schedule('previous', '2026-11-08')], sunday, 'person-2')).toBe(false)
  })
  it('marks Thursday assignments only within the same Monday to Sunday week', () => {
    const thursday = schedule('thursday', '2026-11-12', 'Quinta às 19h15')
    expect(scheduledOnThursdayThisWeek([thursday], sunday, 'person-1')).toBe(true)
    expect(scheduledOnThursdayThisWeek([thursday], schedule('evening', '2026-11-15', 'Domingo às 18h'), 'person-1')).toBe(true)
    expect(scheduledOnThursdayThisWeek([thursday], schedule('next', '2026-11-22'), 'person-1')).toBe(false)
    expect(scheduledOnThursdayThisWeek([thursday], thursday, 'person-1')).toBe(false)
    expect(scheduledOnThursdayThisWeek([thursday], sunday, 'person-2')).toBe(false)
  })
})
