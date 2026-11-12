import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ role: 'team' as 'team' | 'admin', from: vi.fn() }))
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ role: mocks.role, session: { user: { id: 'user-1' } } }) }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: mocks.from } }))
import { SchedulePage } from './SchedulePage'
import { ScheduleHistoryTable } from './ScheduleHistoryTable'

describe('attendance access', () => {
  afterEach(cleanup)
  it.each(['team', 'admin'] as const)('limits attendance visibility for %s', async role => {
    mocks.role = role
    mocks.from.mockImplementation((table: string) => {
      const rows: Record<string, unknown[]> = {
        ministry_schedules: [{ id: 'schedule-1', service_date: '2099-12-12', service_label: 'Domingo às 10h', published_at: '2026-11-12', special_observation: null }],
        profiles: [{ id: 'user-1', display_name: 'Voluntário' }],
        ministry_schedule_assignments: [{ id: 'assignment-1', schedule_id: 'schedule-1', volunteer_profile_id: 'user-1', ministry_role: 'portaria' }],
        ministry_schedule_attendance: [{ schedule_id: 'schedule-1', volunteer_profile_id: 'user-1', was_absent: true }],
      }
      const query = {
        select: () => query, order: () => query, eq: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve),
      }
      return query
    })
    render(<MemoryRouter><SchedulePage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /Domingo às 10h.*Publicada/ }))
    if (role === 'admin') {
      expect(screen.getByRole('region', { name: 'Presença e faltas de Domingo às 10h' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Desfazer falta' })).toBeTruthy()
      expect(mocks.from).toHaveBeenCalledWith('ministry_schedule_attendance')
    } else {
      expect(screen.queryByRole('region', { name: /Presença e faltas/ })).toBeNull()
      expect(screen.queryByText('Falta')).toBeNull()
      expect(mocks.from).not.toHaveBeenCalledWith('ministry_schedule_attendance')
      expect(screen.getByText('Portaria')).toBeTruthy()
    }
  })

  it.each([false, true])('shows the history absence column only with admin access: %s', async canViewAttendance => {
    render(<ScheduleHistoryTable canViewAttendance={canViewAttendance} schedules={[{
      id: 'history-1', service_date: '2026-11-01', service_label: 'Domingo às 10h', published_at: '2026-11-01', special_observation: null, visitorsReported: null,
      assignments: [], attendance: [{ volunteer_profile_id: 'user-1', was_absent: true }],
    }]} expandedScheduleIds={[]} onToggleSchedule={() => {}} />)
    await screen.findByRole('button', { name: /Ver escala/ })
    expect(Boolean(screen.queryByText('Faltas'))).toBe(canViewAttendance)
  })
})
