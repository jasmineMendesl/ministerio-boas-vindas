export type ServiceDayFilter = 'all' | 'sunday' | 'thursday'
export type ServiceDay = Exclude<ServiceDayFilter, 'all'> | 'other'

export function getServiceDay(value: string): ServiceDay {
  if (!value) return 'other'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return 'other'
  if (date.getDay() === 0) return 'sunday'
  if (date.getDay() === 4) return 'thursday'
  return 'other'
}

export function matchesServiceDay(value: string, filter: ServiceDayFilter): boolean {
  return filter === 'all' || getServiceDay(value) === filter
}
