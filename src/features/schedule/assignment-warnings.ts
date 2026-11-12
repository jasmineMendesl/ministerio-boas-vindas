type AssignmentSchedule = {
  id: string
  service_date: string
  service_label: string
  assignments: { volunteer_profile_id: string }[]
  attendance?: { volunteer_profile_id: string; was_absent: boolean }[]
}

function dateAtUtc(value: string) {
  return new Date(`${value}T12:00:00Z`)
}

function weekStart(value: string) {
  const date = dateAtUtc(value)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

export function servedSameServiceLastWeek(schedules: AssignmentSchedule[], target: AssignmentSchedule, volunteerId: string) {
  const date = dateAtUtc(target.service_date)
  date.setUTCDate(date.getUTCDate() - 7)
  const previousDate = date.toISOString().slice(0, 10)
  return schedules.some(schedule => schedule.id !== target.id
    && schedule.service_date === previousDate
    && schedule.service_label === target.service_label
    && schedule.assignments.some(item => item.volunteer_profile_id === volunteerId)
    && !schedule.attendance?.some(item => item.volunteer_profile_id === volunteerId && item.was_absent))
}

export function scheduledOnThursdayThisWeek(schedules: AssignmentSchedule[], target: AssignmentSchedule, volunteerId: string) {
  const targetWeek = weekStart(target.service_date)
  return schedules.some(schedule => schedule.id !== target.id
    && dateAtUtc(schedule.service_date).getUTCDay() === 4
    && weekStart(schedule.service_date) === targetWeek
    && schedule.assignments.some(item => item.volunteer_profile_id === volunteerId))
}
