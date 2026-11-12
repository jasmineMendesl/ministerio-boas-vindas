import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Check, ChevronDown, Info, MessageSquareText, Pencil, Plus, Send, Shuffle, Trash2, UsersRound, X } from 'lucide-react'
import { useAuth } from '../../app/AuthProvider'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../../components/PageHeader'
import { PageTabs } from '../../components/PageTabs'
import { ScheduleHistoryTable } from './ScheduleHistoryTable'
import { ExtraSchedulesPanel } from './ExtraSchedulesPanel'
import { DeleteScheduleDialog } from './DeleteScheduleDialog'
import { CreateScheduleDialog, type NewScheduleAssignment } from './CreateScheduleDialog'
import { scheduledOnThursdayThisWeek, servedSameServiceLastWeek } from './assignment-warnings'
const primaryRoles = [
  ['portaria', 'Portaria'],
  ['seat_direction', 'Direcionamento de assentos'],
] as const
const complementaryRoles = [
  ['leader', 'Líder'],
  ['support', 'Apoio'],
  ['media', 'Mídia'],
  ['opening_prayer', 'Oração inicial'],
  ['male_welcoming', 'Acolhimento masculino'],
  ['female_welcoming', 'Acolhimento feminino'],
  ['equipment_check', 'Conferência de placas e cavaletes'],
  ['app_closing', 'Fechamento no aplicativo'],
] as const
const legacyRoles = [
  ['confession_prayer', 'Oração de Confissão'],
  ['reconciliation_word', 'Palavra de reconciliação'],
  ['closing_prayer', 'Oração Final'],
] as const
const primaryRoleKeys = new Set<string>(primaryRoles.map(([key]) => key))
const complementaryRoleKeys = new Set<string>(complementaryRoles.map(([key]) => key))
const portariaVolunteerLimit = 4
const suggestedTeamSize = 6
const volunteerCouples = [
  ['Jasmine', 'Pedro Caio'],
  ['Bia', 'Gerson'],
  ['Jamison', 'Letícia'],
  ['Gaby', 'Darlan'],
  ['Mikaelly', 'Jhonatan'],
] as const
type Volunteer = { id: string; display_name: string }
type Assignment = { id: string; schedule_id: string; volunteer_profile_id: string; ministry_role: string; volunteer?: Volunteer }
type ScheduleAttendance = { schedule_id: string; volunteer_profile_id: string; was_absent: boolean }
type ServiceLabel = 'Domingo às 10h' | 'Domingo às 18h' | 'Quinta às 19h15'
type Schedule = { id: string; service_date: string; service_label: ServiceLabel; published_at: string | null; special_observation: string | null; assignments: Assignment[]; attendance: ScheduleAttendance[]; visitorsReported: number | null }
type VolunteerUnit = { members: Volunteer[] }
type SuggestedTeam = { schedule: Schedule; volunteers: Volunteer[] }
function normalizeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
}
function mondayOfWeek(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function describeWeek(weekStart: string) {
  const monday = new Date(`${weekStart}T12:00:00`)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }
  return `${monday.toLocaleDateString('pt-BR', dateFormat)} a ${sunday.toLocaleDateString('pt-BR', { ...dateFormat, year: 'numeric' })}`
}

function createWeeklySuggestion(targetSchedules: Schedule[], allSchedules: Schedule[], activeVolunteers: Volunteer[]): { error: string } | { teams: SuggestedTeam[] } {
  const units: VolunteerUnit[] = []
  const pairedIds = new Set<string>()
  const missingCouples: string[] = []
  const startsWithName = (person: Volunteer, name: string) => normalizeName(person.display_name).startsWith(normalizeName(name))

  for (const [firstName, secondName] of volunteerCouples) {
    const first = activeVolunteers.filter(person => startsWithName(person, firstName))
    const second = activeVolunteers.filter(person => startsWithName(person, secondName))
    if (first.length !== 1 || second.length !== 1) {
      missingCouples.push(`${firstName} e ${secondName}`)
      continue
    }
    pairedIds.add(first[0].id)
    pairedIds.add(second[0].id)
    units.push({ members: [first[0], second[0]] })
  }

  if (missingCouples.length) {
    return { error: `Não foi possível localizar um perfil ativo para cada pessoa destes casais: ${missingCouples.join('; ')}.` }
  }

  for (const volunteer of activeVolunteers) {
    if (!pairedIds.has(volunteer.id)) units.push({ members: [volunteer] })
  }
  if (activeVolunteers.length < suggestedTeamSize) {
    return { error: `São necessários pelo menos ${suggestedTeamSize} voluntários ativos para sugerir uma equipe completa por culto.` }
  }

  const weekStart = mondayOfWeek(targetSchedules[0].service_date)
  const previousSchedules = allSchedules.filter(schedule => schedule.service_date < weekStart)
  const workload = new Map(activeVolunteers.map(person => [person.id, 0]))
  const absences = new Map(activeVolunteers.map(person => [person.id, 0]))
  for (const schedule of previousSchedules) {
    const servedOnce = new Set(schedule.assignments.map(assignment => assignment.volunteer_profile_id))
    for (const profileId of servedOnce) workload.set(profileId, (workload.get(profileId) ?? 0) + 1)
    const absentOnce = new Set(schedule.attendance.filter(item => item.was_absent).map(item => item.volunteer_profile_id))
    for (const profileId of absentOnce) absences.set(profileId, (absences.get(profileId) ?? 0) + 1)
  }

  const teams: SuggestedTeam[] = []
  const servedThisWeek = new Map(activeVolunteers.map(person => [person.id, 0]))
  for (const schedule of [...targetSchedules].sort((a, b) => a.service_date.localeCompare(b.service_date) || a.service_label.localeCompare(b.service_label))) {
    type SuggestionOption = { absencePriority: number; workloadCost: number; units: number[] }
    let options: SuggestionOption[] = [{ absencePriority: 0, workloadCost: 0, units: [] }]
    const states: SuggestionOption[][] = Array.from({ length: suggestedTeamSize + 1 }, () => [])
    states[0] = options
    units.forEach((unit, unitIndex) => {
      const size = unit.members.length
      const absenceCost = unit.members.reduce((sum, person) => sum + (servedThisWeek.get(person.id) ?? 0) - (absences.get(person.id) ?? 0), 0)
      const workloadCost = unit.members.reduce((sum, person) => sum + 2 * (workload.get(person.id) ?? 0) + 1, 0)
      for (let count = suggestedTeamSize; count >= size; count--) {
        const additions = states[count - size].map(option => ({ absencePriority: option.absencePriority + absenceCost, workloadCost: option.workloadCost + workloadCost, units: [...option.units, unitIndex] }))
        if (additions.length) {
          states[count] = [...states[count], ...additions]
            .sort((left, right) => left.absencePriority - right.absencePriority || left.workloadCost - right.workloadCost || Math.random() - 0.5)
            .slice(0, 96)
        }
      }
    })
    options = states[suggestedTeamSize]
    if (!options.length) {
      return { error: `Não foi possível formar uma equipe de ${suggestedTeamSize} pessoas sem separar os casais.` }
    }
    const bestOption = options[0]
    const equallyBalanced = options.filter(option => option.absencePriority === bestOption.absencePriority && option.workloadCost === bestOption.workloadCost)
    const chosen = equallyBalanced[Math.floor(Math.random() * equallyBalanced.length)]
    const team = chosen.units.flatMap(unitIndex => units[unitIndex].members)
    team.forEach(person => {
      workload.set(person.id, (workload.get(person.id) ?? 0) + 1)
      servedThisWeek.set(person.id, (servedThisWeek.get(person.id) ?? 0) + 1)
    })
    teams.push({ schedule, volunteers: team })
  }
  return { teams }
}
function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
export function SchedulePage() {
  const { role, session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedScheduleId = searchParams.get('schedule')
  const isAdmin = role === 'admin'
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [newDate, setNewDate] = useState('')
  const [newService, setNewService] = useState<ServiceLabel>('Domingo às 10h')
  const [newObservation, setNewObservation] = useState('')
  const [showObservationField, setShowObservationField] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createError, setCreateError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const scheduleTab = searchParams.get('tab') === 'extra' ? 'extra' : searchParams.get('tab') === 'history' ? 'history' : 'open'
  const [expandedScheduleIds, setExpandedScheduleIds] = useState<string[]>([])
  const [editingScheduleIds, setEditingScheduleIds] = useState<string[]>([])
  const [savingAttendanceKey, setSavingAttendanceKey] = useState('')
  const [suggestionWeek, setSuggestionWeek] = useState('')
  const [weeklySuggestion, setWeeklySuggestion] = useState<{ week: string; teams: SuggestedTeam[] } | null>(null)
  const load = useCallback(async () => {
    if (!supabase) { setError('Supabase não está configurado.'); setLoading(false); return }
    setLoading(true); setError('')
    const [scheduleResult, assignmentResult, profileResult, attendanceResult, visitorReportResult] = await Promise.all([
      supabase.from('ministry_schedules').select('id,service_date,service_label,published_at,special_observation').order('service_date', { ascending: true }),
      supabase.from('ministry_schedule_assignments').select('id,schedule_id,volunteer_profile_id,ministry_role'),
      supabase.from('profiles').select('id,display_name').eq('active', true).order('display_name'),
      isAdmin ? supabase.from('ministry_schedule_attendance').select('schedule_id,volunteer_profile_id,was_absent') : Promise.resolve({ data: [], error: null }),
      supabase.from('visitor_service_gift_reports').select('service_date,service_label,gifts_delivered'),
    ])
    if (scheduleResult.error || assignmentResult.error || profileResult.error || attendanceResult.error || visitorReportResult.error) {
      setError('Não foi possível carregar as escalas. Confira se as migrations de escala e presença estão aplicadas no Supabase.')
      setSchedules([]); setVolunteers([])
    } else {
      const people = (profileResult.data ?? []) as Volunteer[]
      setVolunteers(people)
      const assignments = (assignmentResult.data ?? []) as Assignment[]
      const attendance = (attendanceResult.data ?? []) as ScheduleAttendance[]
      const visitorReports = (visitorReportResult.data ?? []) as { service_date: string; service_label: string; gifts_delivered: number }[]
      setSchedules(((scheduleResult.data ?? []) as Omit<Schedule, 'assignments'>[]).map(schedule => ({
        ...schedule,
        visitorsReported: visitorReports.find(report => report.service_date === schedule.service_date && report.service_label === schedule.service_label)?.gifts_delivered ?? null,
        assignments: assignments.filter(item => item.schedule_id === schedule.id).map(item => ({ ...item, volunteer: people.find(person => person.id === item.volunteer_profile_id) })),
        attendance: attendance.filter(item => item.schedule_id === schedule.id),
      })))
    }
    setLoading(false)
  }, [isAdmin])
  useEffect(() => { void load() }, [load, session?.user.id])
  useEffect(() => {
    if (!requestedScheduleId || loading || !schedules.some(schedule => schedule.id === requestedScheduleId)) return
    setExpandedScheduleIds(current => current.includes(requestedScheduleId) ? current : [...current, requestedScheduleId])
  }, [loading, requestedScheduleId, schedules])
  function toggleScheduleExpanded(scheduleId: string) {
    setExpandedScheduleIds(current => current.includes(scheduleId) ? current.filter(id => id !== scheduleId) : [...current, scheduleId])
  }
  function toggleScheduleEditing(scheduleId: string) {
    setError(''); setNotice('')
    setExpandedScheduleIds(current => current.includes(scheduleId) ? current : [...current, scheduleId])
    setEditingScheduleIds(current => current.includes(scheduleId) ? current.filter(id => id !== scheduleId) : [...current, scheduleId])
  }
  async function toggleVolunteerAbsence(schedule: Schedule, volunteerProfileId: string, wasAbsent: boolean) {
    if (!supabase || !isAdmin) return
    const attendanceKey = `${schedule.id}:${volunteerProfileId}`
    setSavingAttendanceKey(attendanceKey); setError('')
    const nextWasAbsent = !wasAbsent
    const { error: saveError } = await supabase.from('ministry_schedule_attendance').upsert({
      schedule_id: schedule.id,
      volunteer_profile_id: volunteerProfileId,
      was_absent: nextWasAbsent,
    }, { onConflict: 'schedule_id,volunteer_profile_id' })
    setSavingAttendanceKey('')
    if (saveError) { setError('Não foi possível atualizar a falta. Confira a migration e as permissões de admin.'); return }
    setSchedules(current => current.map(item => item.id !== schedule.id ? item : {
      ...item,
      attendance: [
        ...item.attendance.filter(record => record.volunteer_profile_id !== volunteerProfileId),
        { schedule_id: schedule.id, volunteer_profile_id: volunteerProfileId, was_absent: nextWasAbsent },
      ],
    }))
  }
  function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (!supabase || !session?.user.id || !isAdmin || loading || saving || !newDate) return
    setCreateError(''); setShowCreateDialog(true)
  }
  async function saveCreatedSchedule(assignments: NewScheduleAssignment[]) {
    if (!supabase || !session?.user.id || !isAdmin || saving) return
    setSaving(true); setCreateError('')
    try {
      const { data, error: saveError } = await supabase.rpc('create_ministry_schedule_with_assignments', {
        p_service_date: newDate,
        p_service_label: newService,
        p_special_observation: newObservation.trim() || null,
        p_assignments: assignments,
      })
      if (saveError || !data) {
        setCreateError(saveError?.code === '23505' ? 'Já existe uma escala para essa data e culto, ou uma atribuição duplicada.' : 'Não foi possível salvar a escala. Confira a conexão e tente novamente.')
        return
      }
      const historical = newDate < todayKey
      setShowCreateDialog(false)
      setNewDate(''); setNewObservation(''); setShowObservationField(false)
      setNotice('Escala criada com os voluntários selecionados. Publique para avisar a equipe.')
      setSearchParams(historical ? { tab: 'history' } : {})
      setExpandedScheduleIds(current => [...current, data as string])
      await load()
    } catch {
      setCreateError('Não foi possível salvar a escala. Confira a conexão e tente novamente.')
    } finally { setSaving(false) }
  }
  async function addAssignment(schedule: Schedule, ministryRole: string, personId: string) {
    setError(''); setNotice('')
    if (!supabase || !session?.user.id || !isAdmin || !editingScheduleIds.includes(schedule.id) || !personId) return
    if (ministryRole === 'portaria' && schedule.assignments.filter(item => item.ministry_role === 'portaria').length >= portariaVolunteerLimit) {
      setError('Portaria permite no máximo quatro voluntários por culto.')
      return
    }
    setSaving(true)
    const { error: saveError } = await supabase.from('ministry_schedule_assignments').insert({ schedule_id: schedule.id, volunteer_profile_id: personId, ministry_role: ministryRole, created_by: session.user.id })
    setSaving(false)
    if (saveError) { setError(saveError.code === '23505' ? 'Essa pessoa já está nessa função nesta escala.' : 'Não foi possível adicionar a atribuição.'); return }
    setNotice('Voluntário adicionado à escala.'); await load()
  }
  async function removeAssignment(item: Assignment) {
    if (!supabase || !isAdmin || !editingScheduleIds.includes(item.schedule_id)) return
    if (primaryRoleKeys.has(item.ministry_role) && item.schedule_id) {
      const schedule = schedules.find(candidate => candidate.id === item.schedule_id)
      const hasComplementaryAssignments = schedule?.assignments.some(assignment =>
        assignment.volunteer_profile_id === item.volunteer_profile_id && complementaryRoleKeys.has(assignment.ministry_role),
      )
      if (hasComplementaryAssignments) {
        setError('Remova primeiro as responsabilidades complementares desse voluntário para trocar a função principal.')
        return
      }
    }
    const { error: removeError } = await supabase.from('ministry_schedule_assignments').delete().eq('id', item.id)
    if (removeError) { setError('Não foi possível remover essa atribuição.'); return }
    await load()
  }
  async function deleteSchedule(schedule: Schedule) {
    if (!supabase || !isAdmin || deleting) return
    setDeleting(true); setDeleteError(''); setNotice('')
    try {
      const { data, error: removeError } = await supabase.from('ministry_schedules').delete().eq('id', schedule.id).select('id')
      if (removeError || !data?.length) {
        setDeleteError('Não foi possível excluir a escala. Confira sua conexão e as permissões de administrador.'); return
      }
      setSchedules(current => current.filter(item => item.id !== schedule.id))
      setScheduleToDelete(null)
      setNotice('Escala excluída.')
    } catch { setDeleteError('Não foi possível excluir a escala. Confira sua conexão e tente novamente.') }
    finally { setDeleting(false) }
  }
  async function publishSchedule(schedule: Schedule) {
    if (!supabase || !session?.user.id || !isAdmin) return
    if (!schedule.assignments.length) { setError('Adicione ao menos um voluntário antes de publicar.'); return }
    setSaving(true); setError(''); setNotice('')
    const { error: publishError } = await supabase.from('ministry_schedules').update({ published_at: new Date().toISOString(), published_by: session.user.id, updated_by: session.user.id }).eq('id', schedule.id)
    if (publishError) { setSaving(false); setError('Não foi possível publicar. Confira as migrations e as permissões do perfil admin.'); return }
    await load()
    setEditingScheduleIds(current => current.filter(id => id !== schedule.id))
    const { data, error: notifyError } = await supabase.functions.invoke('notify-schedule-published', { body: { scheduleId: schedule.id } })
    setSaving(false)
    if (notifyError) {
      let detail = notifyError.message
      if (notifyError.context instanceof Response) {
        const responseBody = await notifyError.context.clone().json().catch(() => null) as { error?: string } | null
        detail = `${notifyError.context.status}${responseBody?.error ? ` · ${responseBody.error}` : ''}`
      }
      setNotice(`Escala publicada, mas não foi possível enviar os avisos. Detalhe: ${detail}`)
    }
    else if (!data?.configured) setNotice('Escala publicada. As notificações push precisam ser configuradas no Supabase.')
    else if (!data.sent) setNotice('Escala publicada. Nenhum voluntário atribuído ativou notificações neste dispositivo.')
    else setNotice(`Escala publicada e aviso enviado para ${data.sent} dispositivo(s).`)
  }
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const openSchedules = schedules.filter(schedule => schedule.service_date >= todayKey)
  const historicalSchedules = schedules.filter(schedule => schedule.service_date < todayKey)
  const displayedSchedules = (scheduleTab === 'open' ? openSchedules : historicalSchedules).slice().sort((a, b) => scheduleTab === 'open'
    ? a.service_date.localeCompare(b.service_date)
    : b.service_date.localeCompare(a.service_date))
  const availableSuggestionWeeks = [...new Set(openSchedules.map(schedule => mondayOfWeek(schedule.service_date)))].sort()
  useEffect(() => {
    if (suggestionWeek || availableSuggestionWeeks.length === 0) return
    const today = new Date()
    const currentWeek = mondayOfWeek(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
    setSuggestionWeek(availableSuggestionWeeks.includes(currentWeek) ? currentWeek : availableSuggestionWeeks[0] ?? '')
  }, [availableSuggestionWeeks, suggestionWeek])
  const selectedSuggestionSchedules = openSchedules.filter(schedule => suggestionWeek && mondayOfWeek(schedule.service_date) === suggestionWeek)
  function suggestWeek() {
    setError('')
    setWeeklySuggestion(null)
    if (!selectedSuggestionSchedules.length) {
      setError('Crie as escalas da semana antes de gerar uma sugestão.')
      return
    }
    const result = createWeeklySuggestion(selectedSuggestionSchedules, schedules, volunteers)
    if (!('teams' in result)) {
      setError(result.error)
      return
    }
    setWeeklySuggestion({ week: suggestionWeek, teams: result.teams })
  }
  return <div className="animate-in space-y-5">
    <PageHeader icon={CalendarDays} eyebrow="GESTÃO DO MINISTÉRIO DE BOAS-VINDAS" title="Escala de Voluntários" description="Organização das funções e equipes de cada culto."/>
    <PageTabs ariaLabel="Visualização das escalas" activeId={scheduleTab} onChange={value => setSearchParams(value === 'open' ? {} : { tab: value })} tabs={[{ id: 'open', label: 'Escala Atual', badge: `Semana ativa · ${openSchedules.length}` }, { id: 'extra', label: 'Escala extra', controls: 'extra-schedules-panel' }, { id: 'history', label: 'Histórico', badge: `${historicalSchedules.length} cultos` }]}/>
    {scheduleTab === 'extra' ? <ExtraSchedulesPanel /> : <>
    {role === 'team' && <p className="rounded-xl border border-[#E5DDCF] bg-white px-4 py-3 text-sm text-[#68645C]">Você pode consultar as escalas. A criação e as alterações são feitas pelo administrador.</p>}
    {error && <p role="alert" className="status-negative rounded-lg border px-3 py-2 text-sm">{error}</p>}
    {notice && <p role="status" className="status-positive rounded-lg border px-3 py-2 text-sm">{notice}</p>}
    {isAdmin && <form id="schedule-create" onSubmit={createSchedule} className="space-y-3 rounded-2xl border border-[#E5DDCF] bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.025)] sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-semibold uppercase tracking-wide text-[#81796D]">Dia do culto<input aria-label="Dia do culto" className="form-input mt-1.5 h-11 w-full" type="date" required value={newDate} onChange={event => setNewDate(event.target.value)}/></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-[#81796D]">Culto e hor?rio<select aria-label="Culto" className="form-input mt-1.5 h-11 w-full" value={newService} onChange={event => setNewService(event.target.value as ServiceLabel)}><option value="Quinta às 19h15">Quinta • Noite</option><option value="Domingo às 10h">Domingo • Manhã</option><option value="Domingo às 18h">Domingo • Noite</option></select></label>
        <button type="submit" disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8A6729] px-4 text-sm font-semibold text-white disabled:opacity-60"><Plus size={16}/>{saving ? 'Salvando…' : 'Criar escala'}</button>
      </div>
      <div>
        <button type="button" aria-expanded={showObservationField} onClick={() => setShowObservationField(current => !current)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#E5DDCF] px-3 text-sm font-medium text-[#6B4F1D] hover:bg-[#FBF9F4]"><MessageSquareText size={15}/>{showObservationField ? 'Ocultar observação' : newObservation.trim() ? 'Editar observação' : 'Adicionar observação'}</button>
        {showObservationField && <label className="mt-2 block text-sm font-medium">Observação específica desta escala<textarea className="form-input form-textarea mt-1.5 min-h-24 text-sm" maxLength={1200} value={newObservation} onChange={event => setNewObservation(event.target.value)} placeholder="Escreva a recomendação que a equipe deve ler ao abrir esta escala."/><span className="mt-1 block text-xs font-normal text-[#68645C]">Ao publicar, os voluntários receberão um aviso para abrir e ler esta observação.</span></label>}
      </div>
    </form>}
    <details className="group rounded-xl border border-[#E5DDCF] bg-white/80 shadow-[0_2px_8px_rgba(0,0,0,.025)]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#5E4824] [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><Info size={16} className="shrink-0 text-[#8A6729]"/>Orientações para a escala</span>
        <ChevronDown size={16} className="shrink-0 text-[#8A6729] transition-transform group-open:rotate-180"/>
      </summary>
      <ul className="grid gap-x-8 gap-y-3 border-t border-[#EEE8DC] px-4 py-4 text-sm leading-5 text-[#56524A] sm:grid-cols-2">
        <li><strong className="text-[#34322E]">Mídia:</strong> priorizar Bruna, Jasmine ou Naiara. Escalar apenas uma pessoa por culto, dispensada da entrega de brindes enquanto estiver fotografando ou filmando.</li>
        <li><strong className="text-[#34322E]">Acolhimento:</strong> selecionar preferencialmente 2 homens e 2 mulheres para receber pessoas que aceitarem ou se reconciliarem com Jesus.</li>
        <li><strong className="text-[#34322E]">Brindes:</strong> a distribuição é organizada pela liderança durante o culto.</li>
        <li><strong className="text-[#34322E]">Oração inicial:</strong> designar um voluntário.</li>
        <li><strong className="text-[#34322E]">Liderança:</strong> conferir placas e cavaletes, coordenar a equipe e realizar o fechamento no aplicativo.</li>
        <li><strong className="text-[#34322E]">Fechamento:</strong> registrar somente o total de visitantes (brindes entregues) e o total de decisões do culto.</li>
      </ul>
    </details>
    {isAdmin && <section id="schedule-suggestion" aria-label="Sugestão semanal de escala" className="overflow-hidden rounded-2xl border border-[#E5DDCF] bg-white shadow-[0_3px_12px_rgba(0,0,0,.035)]">
      <header className="flex flex-col gap-3 border-b border-[#EEE8DC] bg-[#FBF9F4] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div><span className="inline-flex items-center gap-2 rounded-full bg-[#F0E6D2] px-3 py-1 text-xs font-semibold text-[#6B4F1D]"><Shuffle size={13}/>Sugestão equilibrada</span><h2 className="mt-2 font-semibold">Escala semanal</h2><p className="mt-1 text-xs text-[#68645C]">Prioriza quem teve mais faltas; depois equilibra o histórico de serviço. Os casais são mantidos juntos.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row"><label className="text-xs font-medium text-[#68645C]">Semana<select aria-label="Semana da sugestão" className="form-input mt-1 h-10 w-full sm:min-w-52" value={suggestionWeek} onChange={event => { setSuggestionWeek(event.target.value); setWeeklySuggestion(null) }}><option value="">Selecione uma semana</option>{availableSuggestionWeeks.map(week => <option key={week} value={week}>{describeWeek(week)}</option>)}</select></label><button type="button" disabled={!suggestionWeek || !selectedSuggestionSchedules.length} onClick={suggestWeek} className="inline-flex min-h-10 items-center justify-center gap-2 self-end rounded-lg bg-[#8A6729] px-4 text-sm font-semibold text-white disabled:opacity-50"><Shuffle size={15}/>Gerar sugestão</button></div>
      </header>
      {weeklySuggestion && <div className="space-y-3 p-4 sm:p-5"><p className="inline-flex rounded-full border border-[#D9CCB2] bg-[#F7F2E8] px-3 py-1.5 text-xs font-semibold text-[#6B4F1D]">Sugestão de {describeWeek(weeklySuggestion.week)} · não publicada</p><div className="grid gap-3 lg:grid-cols-3">{weeklySuggestion.teams.map(({ schedule, volunteers: suggestedVolunteers }) => <article key={schedule.id} className="rounded-xl border border-[#E5DDCF] bg-[#FFFEFC] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#8A6729]">{schedule.service_label}</p><p className="mt-1 text-sm font-medium capitalize">{formatDate(schedule.service_date)}</p><div className="mt-3 flex flex-wrap gap-2">{suggestedVolunteers.map(person => <span key={person.id} className="inline-flex rounded-full border border-[#D9CCB2] bg-white px-2.5 py-1 text-xs font-medium text-[#34322E]">{person.display_name}</span>)}</div><p className="mt-3 text-xs text-[#68645C]">6 pessoas sugeridas, incluindo liderança. Casais permanecem juntos.</p></article>)}</div></div>}
      {!weeklySuggestion && !availableSuggestionWeeks.length && <p className="px-4 py-5 text-sm text-[#68645C]">Crie as escalas da semana para habilitar a sugestão.</p>}
    </section>}
    {scheduleTab === 'history' && !loading && <ScheduleHistoryTable canViewAttendance={isAdmin} schedules={historicalSchedules} expandedScheduleIds={expandedScheduleIds} onToggleSchedule={toggleScheduleExpanded} onDeleteSchedule={isAdmin ? id => {
      const schedule = schedules.find(item => item.id === id)
      if (schedule) { setDeleteError(''); setScheduleToDelete(schedule) }
    } : undefined}/>}
    {loading && <p role="status" className="text-sm text-[#68645C]">Carregando escalas…</p>}
    {scheduleTab === 'open' && !loading && !error && displayedSchedules.length === 0 && <section className="rounded-2xl border border-dashed border-[#D9CCB2] bg-white p-8 text-center"><CalendarDays size={24} className="mx-auto text-[#8A6729]"/><h2 className="mt-3 font-semibold">{scheduleTab === 'open' ? 'Nenhuma escala aberta' : 'Nenhuma escala no histórico'}</h2><p className="mt-1 text-sm text-[#68645C]">{scheduleTab === 'open' ? isAdmin ? 'Crie uma escala para um culto de hoje ou futuro.' : 'O administrador ainda não cadastrou escalas atuais.' : 'As escalas de cultos anteriores aparecerão aqui.'}</p></section>}
    {scheduleTab === 'open' && <div className="space-y-3">{displayedSchedules.map(schedule => {
      const isExpanded = expandedScheduleIds.includes(schedule.id)
      const isEditing = editingScheduleIds.includes(schedule.id)
      const volunteerCount = new Set(schedule.assignments.map(item => item.volunteer_profile_id)).size
      const assignedVolunteers = [...new Map(schedule.assignments.map(item => [item.volunteer_profile_id, item.volunteer?.display_name ?? 'Voluntário'])).entries()]
      const repeatVolunteers = isAdmin ? assignedVolunteers.filter(([id]) => servedSameServiceLastWeek(schedules, schedule, id)) : []
      return <section key={schedule.id} className="overflow-hidden rounded-2xl border border-[#E5DDCF] bg-white shadow-[0_3px_12px_rgba(0,0,0,.035)]">
        <header className="flex flex-col gap-3 bg-[#FBF9F4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <button type="button" aria-expanded={isExpanded} onClick={() => toggleScheduleExpanded(schedule.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F0E6D2] text-[#8A6729]"><CalendarDays size={18}/></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs uppercase tracking-wide text-[#68645C]">
                <span>{schedule.service_label}</span><span aria-hidden="true">·</span>
                <span className={schedule.published_at ? 'status-positive rounded-full border px-2 py-0.5' : 'status-pending rounded-full border px-2 py-0.5'}>{schedule.published_at ? 'Publicada' : 'Rascunho'}</span>
              </span>
              <span className="mt-1 block break-words font-semibold capitalize text-[#22201D]">{formatDate(schedule.service_date)}</span>
              <span className="mt-1 block text-xs text-[#68645C]">{volunteerCount} {volunteerCount === 1 ? 'voluntário escalado' : 'voluntários escalados'}</span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-[#8A6729] transition-transform ${isExpanded ? 'rotate-180' : ''}`}/>
          </button>
          {isAdmin && <div className="flex shrink-0 items-center justify-end gap-2">
            <button type="button" aria-label={isEditing ? 'Concluir edição' : 'Editar escala'} title={isEditing ? 'Concluir edição' : 'Editar escala'} aria-pressed={isEditing} onClick={() => toggleScheduleEditing(schedule.id)} className={`grid size-11 shrink-0 place-items-center rounded-lg border ${isEditing ? 'border-[#CFC0A3] bg-[#F0E6D2] text-[#6B4F1D]' : 'border-[#E5DDCF] bg-white text-[#34322E] hover:bg-[#F7F2E8]'}`}>
              {isEditing ? <Check size={17}/> : <Pencil size={17}/>}
            </button>
            {!schedule.published_at && !!schedule.assignments.length && <button type="button" aria-label="Publicar escala" title="Publicar escala" disabled={saving} onClick={() => void publishSchedule(schedule)} className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#8A6729] text-white disabled:opacity-60"><Send size={17}/></button>}
            <button type="button" aria-label={`Excluir escala de ${schedule.service_label} em ${formatDate(schedule.service_date)}`} onClick={() => { setDeleteError(''); setScheduleToDelete(schedule) }} className="grid size-10 shrink-0 place-items-center rounded-lg text-[#8B3C32] hover:bg-red-50"><Trash2 size={16}/></button>
          </div>}
        </header>
        {isExpanded && <>
          {repeatVolunteers.length > 0 && <div aria-label="Avisos de repetição na escala" className="flex flex-wrap gap-2 border-t border-[#EEE8DC] px-4 py-3 sm:px-5">{repeatVolunteers.map(([id, name]) => <span key={id} role="status" className="status-pending inline-flex max-w-full items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5"><Info size={14} className="mt-0.5 shrink-0"/><span><strong>{name}:</strong> essa pessoa serviu nesse culto na semana passada</span></span>)}</div>}
          {schedule.special_observation && <aside aria-label="Observação específica da escala" className="mx-4 my-5 rounded-xl border border-[#F0CDCA] bg-[#FFF3F2] px-4 py-5 sm:mx-5 sm:px-5"><p className="flex items-center gap-2.5 text-sm font-semibold text-[#963F38]"><MessageSquareText size={17} className="shrink-0"/>Observação desta escala</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#713F3A]">{schedule.special_observation}</p></aside>}
          {isEditing && <p className="border-t border-[#EEE8DC] bg-[#FFFDF9] px-4 py-2.5 text-xs leading-5 text-[#68645C] sm:px-5">Modo de edição ativo. As alterações são salvas ao distribuir as funções. Ao terminar, conclua a edição.{!schedule.published_at && ' Publique a escala para avisar os voluntários.'}</p>}
          <div className="divide-y divide-[#EEE8DC]">{[
            { title: 'Funções principais', roles: primaryRoles, assignable: true },
            { title: 'Responsabilidades complementares', roles: complementaryRoles, assignable: true },
            { title: 'Funções anteriores', roles: legacyRoles, assignable: false },
          ].map(group => {
            const visibleRoles = group.roles.filter(([key]) => group.assignable || schedule.assignments.some(item => item.ministry_role === key))
            if (!visibleRoles.length) return null
            return <section key={group.title} aria-label={group.title}>
              <h3 className="bg-[#F7F2E8] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#8A6729] sm:px-5">{group.title}</h3>
              {visibleRoles.map(([key, label]) => {
                const assigned = schedule.assignments.filter(item => item.ministry_role === key)
                const assignedVolunteerIds = group.assignable
                  ? new Set(schedule.assignments.filter(item => group.title === 'Funções principais' ? primaryRoleKeys.has(item.ministry_role) : item.ministry_role === key).map(item => item.volunteer_profile_id))
                  : new Set(assigned.map(item => item.volunteer_profile_id))
                const selectableVolunteers = volunteers.filter(person => {
                  const hasPrimaryRole = schedule.assignments.some(item => item.volunteer_profile_id === person.id && primaryRoleKeys.has(item.ministry_role))
                  const eligibleForGroup = group.title !== 'Responsabilidades complementares' || hasPrimaryRole
                  return eligibleForGroup && !assignedVolunteerIds.has(person.id)
                })
                const portariaFull = key === 'portaria' && assigned.length >= portariaVolunteerLimit
                return <div key={key} className="grid min-w-0 gap-2 px-4 py-3 sm:grid-cols-[minmax(190px,.8fr)_minmax(0,1.5fr)] sm:items-start sm:px-5">
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2 break-words text-sm font-medium">{label}{key === 'portaria' && <span className="rounded-full bg-[#F0E6D2] px-2 py-0.5 text-xs font-medium text-[#6B4F1D]">{assigned.length}/{portariaVolunteerLimit}</span>}</p>
                    {isAdmin && isEditing && group.assignable && <select aria-label={`Selecionar voluntário para ${label}`} className="form-input h-10 w-full text-sm sm:max-w-56" value="" disabled={saving || volunteers.length === 0 || portariaFull || (group.title === 'Responsabilidades complementares' && !schedule.assignments.some(item => primaryRoleKeys.has(item.ministry_role)))} onChange={event => { if (event.target.value) void addAssignment(schedule, key, event.target.value) }}>
                      <option value="">{portariaFull ? 'Limite de quatro voluntários atingido' : group.title === 'Responsabilidades complementares' && !schedule.assignments.some(item => primaryRoleKeys.has(item.ministry_role)) ? 'Adicione uma função principal primeiro' : 'Adicionar voluntário'}</option>
                      {selectableVolunteers.map(person => {
                        const selectedThursday = scheduledOnThursdayThisWeek(schedules, schedule, person.id)
                        return <option key={person.id} value={person.id} className={selectedThursday ? 'text-gray-400' : undefined} style={selectedThursday ? { color: '#9ca3af' } : undefined}>{person.display_name}{selectedThursday ? ' — já escalado na quinta' : ''}</option>
                      })}
                    </select>}
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {assigned.map(item => <span key={item.id} className="inline-flex max-w-full items-center gap-2 rounded-full bg-[#F7F2E8] px-3 py-1.5 text-sm"><UsersRound size={14} className="shrink-0 text-[#8A6729]"/><span className="break-words">{item.volunteer?.display_name ?? 'Voluntário'}</span>{isAdmin && isEditing && <button type="button" aria-label={`Remover ${item.volunteer?.display_name ?? 'voluntário'} da função ${label}`} onClick={() => void removeAssignment(item)} className="ml-1 shrink-0 rounded-full text-[#8B3C32] hover:text-red-800"><X size={14}/></button>}</span>)}
                    {assigned.length === 0 && <span className="text-sm text-[#938B7E]">Ainda sem voluntário</span>}
                  </div>
                </div>
              })}
            </section>
          })}</div>
          {isAdmin && <section aria-label={`Presença e faltas de ${schedule.service_label}`} className="border-t border-[#E5DDCF] bg-[#FBF9F4]">
            <h3 className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#8A6729] sm:px-5">Presenças e faltas</h3>
            <div className="hidden grid-cols-[minmax(130px,.8fr)_minmax(180px,1.2fr)_minmax(220px,auto)] gap-3 border-y border-[#EEE8DC] bg-white px-5 py-2 text-xs font-semibold text-[#68645C] sm:grid"><span>Voluntário</span><span>Função</span><span>Presença</span></div>
            <div className="divide-y divide-[#EEE8DC]">{assignedVolunteers.map(([volunteerId, volunteerName]) => {
              const wasAbsent = schedule.attendance.find(item => item.volunteer_profile_id === volunteerId)?.was_absent ?? false
              const attendanceKey = `${schedule.id}:${volunteerId}`
              const volunteerRoles = [...new Set(schedule.assignments.filter(item => item.volunteer_profile_id === volunteerId).map(item => {
                const role = [...primaryRoles, ...complementaryRoles, ...legacyRoles].find(([key]) => key === item.ministry_role)
                return role?.[1] ?? item.ministry_role
              }))]
              return <div key={volunteerId} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(130px,.8fr)_minmax(180px,1.2fr)_minmax(220px,auto)] sm:items-center sm:px-5">
                <div><span className="text-[11px] font-medium text-[#68645C] sm:hidden">Voluntário</span><p className="break-words text-sm font-medium">{volunteerName}</p></div>
                <div><span className="text-[11px] font-medium text-[#68645C] sm:hidden">Função</span><div className="mt-1 flex flex-wrap gap-1.5 sm:mt-0">{volunteerRoles.map(roleName => <span key={roleName} className="inline-flex rounded-full border border-[#E5DDCF] bg-white px-2.5 py-1 text-xs text-[#4E493F]">{roleName}</span>)}</div></div>
                <div><span className="text-[11px] font-medium text-[#68645C] sm:hidden">Presença</span><div className="mt-1 flex flex-wrap items-center gap-2 sm:mt-0"><span className={wasAbsent ? 'status-negative rounded-full border px-2.5 py-1 text-xs font-medium' : 'status-positive rounded-full border px-2.5 py-1 text-xs font-medium'}>{wasAbsent ? 'Falta' : 'Presente'}</span>{isAdmin && <button type="button" disabled={savingAttendanceKey === attendanceKey} aria-pressed={wasAbsent} onClick={() => void toggleVolunteerAbsence(schedule, volunteerId, wasAbsent)} className={`min-h-9 rounded-lg border px-3 text-xs font-semibold disabled:opacity-60 ${wasAbsent ? 'border-[#D7D9D3] bg-white text-[#565C52]' : 'border-[#E8C8C4] bg-[#FFF1EF] text-[#9B3B32]'}`}>{savingAttendanceKey === attendanceKey ? 'Salvando...' : wasAbsent ? 'Desfazer falta' : 'Marcar falta'}</button>}</div></div>
              </div>
            })}{assignedVolunteers.length === 0 && <p className="px-4 pb-4 text-sm text-[#68645C] sm:px-5">Adicione voluntários à escala para controlar as presenças.</p>}</div>
          </section>}
        </>}
      </section>
    })}</div>}
    </>}
    {isAdmin && showCreateDialog && <CreateScheduleDialog date={newDate} service={newService} volunteers={volunteers} schedules={schedules} saving={saving} error={createError} onCancel={() => { if (!saving) setShowCreateDialog(false) }} onSave={assignments => void saveCreatedSchedule(assignments)}/>}
    {scheduleToDelete && <DeleteScheduleDialog description={`Excluir a escala ${scheduleToDelete.service_label} de ${formatDate(scheduleToDelete.service_date)} e todas as atribuições?`} deleting={deleting} error={deleteError} onCancel={() => setScheduleToDelete(null)} onConfirm={() => void deleteSchedule(scheduleToDelete)}/>}
  </div>
}
