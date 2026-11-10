import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ClipboardList, UsersRound, X } from 'lucide-react'
import { useAuth } from '../../app/AuthProvider'
import { PageHeader } from '../../components/PageHeader'
import { supabase } from '../../lib/supabase'

type ScheduleRow = { id: string; service_date: string }
type AssignmentRow = { schedule_id: string; volunteer_profile_id: string }
type AttendanceRow = { schedule_id: string; volunteer_profile_id: string; was_absent: boolean }
type ProfileRow = { id: string; display_name: string }
type VolunteerReport = { id: string; name: string; services: number; presences: number; absences: number }

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber, 0).getDate()
}

export function ReportsPage() {
  const { role } = useAuth()
  const [month, setMonth] = useState(currentMonth)
  const [rows, setRows] = useState<VolunteerReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!supabase || role !== 'admin') {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    const startDate = `${month}-01`
    const endDate = `${month}-${String(lastDayOfMonth(month)).padStart(2, '0')}`
    const { data: scheduleData, error: scheduleError } = await supabase
      .from('ministry_schedules')
      .select('id,service_date')
      .gte('service_date', startDate)
      .lte('service_date', endDate)

    if (scheduleError) {
      setError('Não foi possível carregar as escalas deste mês.')
      setRows([])
      setLoading(false)
      return
    }

    const schedules = (scheduleData ?? []) as ScheduleRow[]
    if (!schedules.length) {
      setRows([])
      setLoading(false)
      return
    }
    const scheduleIds = schedules.map(schedule => schedule.id)
    const [assignmentResult, attendanceResult, profileResult] = await Promise.all([
      supabase.from('ministry_schedule_assignments').select('schedule_id,volunteer_profile_id').in('schedule_id', scheduleIds),
      supabase.from('ministry_schedule_attendance').select('schedule_id,volunteer_profile_id,was_absent').in('schedule_id', scheduleIds),
      supabase.from('profiles').select('id,display_name'),
    ])

    if (assignmentResult.error || attendanceResult.error || profileResult.error) {
      setError('Não foi possível carregar presenças e faltas. Confira se a migration de presença está aplicada e se o perfil tem acesso de administrador.')
      setRows([])
      setLoading(false)
      return
    }

    const assignments = (assignmentResult.data ?? []) as AssignmentRow[]
    const attendance = (attendanceResult.data ?? []) as AttendanceRow[]
    const profiles = (profileResult.data ?? []) as ProfileRow[]
    const names = new Map(profiles.map(profile => [profile.id, profile.display_name]))
    const attendanceByPersonAndSchedule = new Map(
      attendance.map(item => [`${item.schedule_id}:${item.volunteer_profile_id}`, item.was_absent]),
    )
    const uniqueAssignments = new Map<string, AssignmentRow>()
    for (const assignment of assignments) {
      uniqueAssignments.set(`${assignment.schedule_id}:${assignment.volunteer_profile_id}`, assignment)
    }

    const reportByVolunteer = new Map<string, VolunteerReport>()
    for (const [key, assignment] of uniqueAssignments) {
      const volunteer = reportByVolunteer.get(assignment.volunteer_profile_id) ?? {
        id: assignment.volunteer_profile_id,
        name: names.get(assignment.volunteer_profile_id) ?? 'Voluntário sem perfil ativo',
        services: 0,
        presences: 0,
        absences: 0,
      }
      volunteer.services += 1
      if (attendanceByPersonAndSchedule.get(key) === true) volunteer.absences += 1
      else volunteer.presences += 1
      reportByVolunteer.set(assignment.volunteer_profile_id, volunteer)
    }

    setRows([...reportByVolunteer.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
    setLoading(false)
  }, [month, role])

  useEffect(() => { void load() }, [load])

  const totals = useMemo(() => rows.reduce((result, row) => ({
    volunteers: result.volunteers + 1,
    services: result.services + row.services,
    presences: result.presences + row.presences,
    absences: result.absences + row.absences,
  }), { volunteers: 0, services: 0, presences: 0, absences: 0 }), [rows])

  if (role !== 'admin') return null

  return <div className="animate-in space-y-5">
    <PageHeader icon={ClipboardList} eyebrow="MINISTÉRIO DE BOAS-VINDAS" title="Relatório de presença" description="Acompanhe presenças e faltas da equipe por mês."/>

    <section className="rounded-2xl border border-[#E5DDCF] bg-white p-4 shadow-[0_3px_12px_rgba(0,0,0,.035)] sm:p-5">
      <label className="block max-w-xs text-sm font-medium">Mês do relatório<input aria-label="Mês do relatório" type="month" className="form-input mt-1.5 h-11 w-full" value={month} onChange={event => setMonth(event.target.value)}/></label>
    </section>

    {error && <p role="alert" className="status-negative rounded-lg border px-3 py-2 text-sm">{error}</p>}

    <section aria-label="Resumo mensal" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-2xl border border-[#E5DDCF] bg-white p-4"><div className="flex items-center justify-between"><span className="text-sm text-[#68645C]">Voluntários escalados</span><UsersRound size={18} className="text-[#8A6729]"/></div><p className="mt-3 text-2xl font-semibold">{loading ? '—' : totals.volunteers}</p></article>
      <article className="rounded-2xl border border-[#CFE5D3] bg-[#F1F8F1] p-4"><div className="flex items-center justify-between"><span className="text-sm text-[#46634B]">Presenças</span><Check size={18} className="text-[#46634B]"/></div><p className="mt-3 text-2xl font-semibold text-[#365D41]">{loading ? '—' : totals.presences}</p></article>
      <article className="rounded-2xl border border-[#E8C8C4] bg-[#FFF5F3] p-4"><div className="flex items-center justify-between"><span className="text-sm text-[#8A4038]">Faltas</span><X size={18} className="text-[#9B3B32]"/></div><p className="mt-3 text-2xl font-semibold text-[#9B3B32]">{loading ? '—' : totals.absences}</p></article>
      <article className="rounded-2xl border border-[#E5DDCF] bg-white p-4"><div className="flex items-center justify-between"><span className="text-sm text-[#68645C]">Escalas no mês</span><CalendarDays size={18} className="text-[#8A6729]"/></div><p className="mt-3 text-2xl font-semibold">{loading ? '—' : totals.services}</p></article>
    </section>

    <section className="overflow-hidden rounded-2xl border border-[#E5DDCF] bg-white shadow-[0_3px_12px_rgba(0,0,0,.035)]">
      <header className="border-b border-[#EEE8DC] bg-[#FBF9F4] px-4 py-4 sm:px-5"><h2 className="font-semibold">Presenças e faltas por voluntário</h2><p className="mt-1 text-xs text-[#68645C]">Cada pessoa conta uma vez por culto, mesmo que tenha mais de uma função.</p></header>
      {loading ? <p role="status" className="px-4 py-8 text-center text-sm text-[#68645C]">Carregando relatório...</p> : rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-white text-xs text-[#68645C]"><tr><th className="px-4 py-3 font-medium sm:px-5">Voluntário</th><th className="px-4 py-3 text-center font-medium">Cultos escalados</th><th className="px-4 py-3 text-center font-medium">Presenças</th><th className="px-4 py-3 text-center font-medium">Faltas</th></tr></thead><tbody>{rows.map(person => <tr key={person.id} className="border-t border-[#EEE8DC]"><td className="px-4 py-3 font-medium sm:px-5">{person.name}</td><td className="px-4 py-3 text-center">{person.services}</td><td className="px-4 py-3 text-center"><span className="status-positive inline-flex min-w-9 justify-center rounded-full border px-2 py-1 text-xs font-semibold">{person.presences}</span></td><td className="px-4 py-3 text-center"><span className={person.absences ? 'status-negative inline-flex min-w-9 justify-center rounded-full border px-2 py-1 text-xs font-semibold' : 'inline-flex min-w-9 justify-center rounded-full border border-[#E5DDCF] bg-[#F8F8F5] px-2 py-1 text-xs font-semibold text-[#68645C]'}>{person.absences}</span></td></tr>)}</tbody></table></div> : <p className="px-4 py-8 text-center text-sm text-[#68645C]">Nenhum voluntário foi escalado neste mês.</p>}
    </section>
  </div>
}
