import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CalendarDays, ChevronDown, Info, Plus, Trash2, UsersRound, X } from 'lucide-react'
import { useAuth } from '../../app/AuthProvider'
import { supabase } from '../../lib/supabase'
const primaryRoles = [
  ['portaria_01', 'Portaria 01 — Recepção'],
  ['portaria_02', 'Portaria 02 — Estacionamento'],
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
type Volunteer = { id: string; display_name: string }
type Assignment = { id: string; schedule_id: string; volunteer_profile_id: string; ministry_role: string; volunteer?: Volunteer }
type ServiceLabel = 'Domingo às 10h' | 'Domingo às 18h' | 'Quinta às 19h15'
type Schedule = { id: string; service_date: string; service_label: ServiceLabel; published_at: string | null; assignments: Assignment[] }
function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
export function SchedulePage() {
  const { role, session } = useAuth()
  const isAdmin = role === 'admin'
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [newDate, setNewDate] = useState('')
  const [newService, setNewService] = useState<ServiceLabel>('Domingo às 10h')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    if (!supabase) { setError('Supabase não está configurado.'); setLoading(false); return }
    setLoading(true); setError('')
    const [scheduleResult, assignmentResult, profileResult] = await Promise.all([
      supabase.from('ministry_schedules').select('id,service_date,service_label,published_at').order('service_date', { ascending: true }),
      supabase.from('ministry_schedule_assignments').select('id,schedule_id,volunteer_profile_id,ministry_role'),
      supabase.from('profiles').select('id,display_name').eq('active', true).order('display_name'),
    ])
    if (scheduleResult.error || assignmentResult.error || profileResult.error) {
      setError('Não foi possível carregar as escalas. A migration de escalas precisa estar aplicada no Supabase.')
      setSchedules([]); setVolunteers([])
    } else {
      const people = (profileResult.data ?? []) as Volunteer[]
      setVolunteers(people)
      const assignments = (assignmentResult.data ?? []) as Assignment[]
      setSchedules(((scheduleResult.data ?? []) as Omit<Schedule, 'assignments'>[]).map(schedule => ({
        ...schedule,
        assignments: assignments.filter(item => item.schedule_id === schedule.id).map(item => ({ ...item, volunteer: people.find(person => person.id === item.volunteer_profile_id) })),
      })))
    }
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load, session?.user.id])
  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (!supabase || !session?.user.id || !isAdmin) return
    setSaving(true)
    const { error: saveError } = await supabase.from('ministry_schedules').insert({ service_date: newDate, service_label: newService, created_by: session.user.id, updated_by: session.user.id })
    setSaving(false)
    if (saveError) { setError(saveError.code === '23505' ? 'Já existe uma escala para essa data.' : 'Não foi possível criar a escala.'); return }
    setNewDate(''); setNotice('Escala criada. Agora adicione as funções e voluntários.'); await load()
  }
  async function addAssignment(schedule: Schedule, ministryRole: string, personId: string) {
    setError(''); setNotice('')
    if (!supabase || !session?.user.id || !isAdmin || !personId) return
    setSaving(true)
    const { error: saveError } = await supabase.from('ministry_schedule_assignments').insert({ schedule_id: schedule.id, volunteer_profile_id: personId, ministry_role: ministryRole, created_by: session.user.id })
    setSaving(false)
    if (saveError) { setError(saveError.code === '23505' ? 'Essa pessoa já está nessa função nesta escala.' : 'Não foi possível adicionar a atribuição.'); return }
    setNotice('Voluntário adicionado à escala.'); await load()
  }
  async function removeAssignment(item: Assignment) {
    if (!supabase || !isAdmin) return
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
    if (!supabase || !isAdmin || !window.confirm(`Excluir a escala ${schedule.service_label} de ${formatDate(schedule.service_date)} e todas as atribuições?`)) return
    const { error: deleteError } = await supabase.from('ministry_schedules').delete().eq('id', schedule.id)
    if (deleteError) { setError('Não foi possível excluir a escala.'); return }
    setNotice('Escala excluída.'); await load()
  }
  async function publishSchedule(schedule: Schedule) {
    if (!supabase || !session?.user.id || !isAdmin) return
    if (!schedule.assignments.length) { setError('Adicione ao menos um voluntário antes de publicar.'); return }
    setSaving(true); setError(''); setNotice('')
    const { error: publishError } = await supabase.from('ministry_schedules').update({ published_at: new Date().toISOString(), published_by: session.user.id, updated_by: session.user.id }).eq('id', schedule.id)
    if (publishError) { setSaving(false); setError('Não foi possível publicar. Confira as migrations e as permissões do perfil admin.'); return }
    await load()
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
  return <div className="animate-in space-y-5">
    <header className="rounded-2xl border border-[#E5DDCF] bg-[linear-gradient(110deg,#fff_0%,#fff_72%,#F0E6D2_100%)] p-5 sm:p-7">
      <span className="inline-flex items-center gap-2 rounded-full bg-[#F0E6D2] px-3 py-1.5 text-xs font-semibold text-[#8A6729]"><CalendarDays size={14}/>MINISTÉRIO DE BOAS-VINDAS</span>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Escala de voluntários</h1>
      <p className="mt-1 text-sm text-[#68645C]">Funções e equipes de cada culto.</p>
    </header>
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
    {role === 'team' && <p className="rounded-xl border border-[#E5DDCF] bg-white px-4 py-3 text-sm text-[#68645C]">Você pode consultar as escalas. A criação e as alterações são feitas pelo administrador.</p>}
    {error && <p role="alert" className="status-negative rounded-lg border px-3 py-2 text-sm">{error}</p>}
    {notice && <p role="status" className="status-positive rounded-lg border px-3 py-2 text-sm">{notice}</p>}
    {isAdmin && <form onSubmit={createSchedule} className="flex flex-col gap-3 rounded-2xl border border-[#E5DDCF] bg-white p-4 sm:flex-row sm:items-end sm:p-5">
      <label className="flex-1 text-sm font-medium">Dia do culto<input aria-label="Dia do culto" className="form-input mt-1.5 h-11 w-full" type="date" required value={newDate} onChange={event => setNewDate(event.target.value)}/></label>
      <label className="flex-1 text-sm font-medium">Culto<select aria-label="Culto" className="form-input mt-1.5 h-11 w-full" value={newService} onChange={event => setNewService(event.target.value as ServiceLabel)}><option>Domingo às 10h</option><option>Domingo às 18h</option><option>Quinta às 19h15</option></select></label>
      <button type="submit" disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8A6729] px-4 text-sm font-semibold text-white disabled:opacity-60"><Plus size={16}/>{saving ? 'Salvando…' : 'Criar escala'}</button>
    </form>}
    {loading && <p role="status" className="text-sm text-[#68645C]">Carregando escalas…</p>}
    {!loading && !error && schedules.length === 0 && <section className="rounded-2xl border border-dashed border-[#D9CCB2] bg-white p-8 text-center"><CalendarDays size={24} className="mx-auto text-[#8A6729]"/><h2 className="mt-3 font-semibold">Nenhuma escala cadastrada</h2><p className="mt-1 text-sm text-[#68645C]">{isAdmin ? 'Crie uma escala para começar a atribuir as funções.' : 'O administrador ainda não cadastrou escalas.'}</p></section>}
    <div className="space-y-4">{schedules.map(schedule => <section key={schedule.id} className="overflow-hidden rounded-2xl border border-[#E5DDCF] bg-white shadow-[0_3px_12px_rgba(0,0,0,.035)]">
      <header className="flex flex-col gap-3 border-b border-[#E5DDCF] bg-[#FBF9F4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F0E6D2] text-[#8A6729]"><CalendarDays size={18}/></span><div className="min-w-0"><p className="break-words text-xs uppercase tracking-wide text-[#68645C]">{schedule.service_label} · {schedule.published_at ? 'Publicada' : 'Rascunho'}</p><h2 className="break-words font-semibold capitalize">{formatDate(schedule.service_date)}</h2></div></div>{isAdmin && <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0"><button type="button" disabled={saving || !schedule.assignments.length} onClick={() => void publishSchedule(schedule)} className="min-h-10 min-w-0 flex-1 rounded-lg bg-[#8A6729] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 sm:flex-none">{schedule.published_at ? 'Publicar atualização' : 'Publicar escala'}</button><button type="button" aria-label={`Excluir escala de ${schedule.service_label} em ${formatDate(schedule.service_date)}`} onClick={() => void deleteSchedule(schedule)} className="grid size-10 shrink-0 place-items-center rounded-lg text-[#8B3C32] hover:bg-red-50"><Trash2 size={16}/></button></div>}</header>
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
        return <div key={key} className="grid min-w-0 gap-2 px-4 py-3 sm:grid-cols-[minmax(190px,.8fr)_minmax(0,1.5fr)] sm:items-start sm:px-5"><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="break-words text-sm font-medium">{label}</p>{isAdmin && group.assignable && <select aria-label={`Selecionar voluntário para ${label}`} className="form-input h-10 w-full text-sm sm:max-w-56" value="" disabled={saving || volunteers.length === 0 || (group.title === 'Responsabilidades complementares' && !schedule.assignments.some(item => primaryRoleKeys.has(item.ministry_role)))} onChange={event => { if (event.target.value) void addAssignment(schedule, key, event.target.value) }}><option value="">{group.title === 'Responsabilidades complementares' && !schedule.assignments.some(item => primaryRoleKeys.has(item.ministry_role)) ? 'Adicione uma função principal primeiro' : 'Adicionar voluntário'}</option>{selectableVolunteers.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select>}</div><div className="flex min-w-0 flex-wrap gap-2">{assigned.map(item => <span key={item.id} className="inline-flex max-w-full items-center gap-2 rounded-full bg-[#F7F2E8] px-3 py-1.5 text-sm"><UsersRound size={14} className="shrink-0 text-[#8A6729]"/><span className="break-words">{item.volunteer?.display_name ?? 'Voluntário'}</span>{isAdmin && <button type="button" aria-label={`Remover ${item.volunteer?.display_name ?? 'voluntário'} da função ${label}`} onClick={() => void removeAssignment(item)} className="ml-1 shrink-0 rounded-full text-[#8B3C32] hover:text-red-800"><X size={14}/></button>}</span>)}{assigned.length === 0 && <span className="text-sm text-[#938B7E]">Ainda sem voluntário</span>}</div></div>
          })}
        </section>
      })}</div>
    </section>)}</div>
  </div>
}
