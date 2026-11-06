import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CalendarDays, Plus, Trash2, UsersRound, X } from 'lucide-react'
import { useAuth } from '../../app/AuthProvider'
import { supabase } from '../../lib/supabase'

const roles = [
  ['leader', 'Líder'],
  ['support', 'Apoio'],
  ['confession_prayer', 'Oração de Confissão'],
  ['reconciliation_word', 'Palavra de reconciliação'],
  ['seat_direction', 'Direcionar os irmãos para os lugares vagos'],
  ['opening_prayer', 'Oração Inicial'],
  ['closing_prayer', 'Oração Final'],
] as const

type Volunteer = { id: string; display_name: string; email: string | null }
type Assignment = { id: string; schedule_id: string; volunteer_profile_id: string; ministry_role: string; volunteer?: Volunteer }
type ServiceLabel = 'Domingo às 10h' | 'Domingo às 18h' | 'Quinta às 19h15'
type Schedule = { id: string; service_date: string; service_label: ServiceLabel; assignments: Assignment[] }

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function SchedulePage() {
  const { role, session, refreshProfile } = useAuth()
  const isAdmin = role === 'admin'
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [editingNames, setEditingNames] = useState<Record<string, string>>({})
  const [newDate, setNewDate] = useState('')
  const [newService, setNewService] = useState<ServiceLabel>('Domingo às 10h')
  const [selectedPeople, setSelectedPeople] = useState<Record<string, string>>({})
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!supabase) { setError('Supabase não está configurado.'); setLoading(false); return }
    setLoading(true); setError('')
    const [scheduleResult, assignmentResult, profileResult] = await Promise.all([
      supabase.from('ministry_schedules').select('id,service_date,service_label').order('service_date', { ascending: true }),
      supabase.from('ministry_schedule_assignments').select('id,schedule_id,volunteer_profile_id,ministry_role'),
      supabase.from('profiles').select('id,display_name').eq('active', true).order('display_name'),
    ])
    if (scheduleResult.error || assignmentResult.error || profileResult.error) {
      setError('Não foi possível carregar as escalas. A migration de escalas precisa estar aplicada no Supabase.')
      setSchedules([]); setVolunteers([])
    } else {
      const directoryResult = isAdmin ? await supabase.rpc('admin_list_volunteer_profiles') : null
      if (directoryResult?.error) { setError('Não foi possível carregar os e-mails de login para relacionar os nomes dos voluntários.'); setLoading(false); return }
      const people = (isAdmin ? (directoryResult?.data ?? []) : (profileResult.data ?? [])) as Volunteer[]
      setVolunteers(people)
      setEditingNames(Object.fromEntries(people.map(person => [person.id, person.display_name])))
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

  async function addAssignment(event: FormEvent<HTMLFormElement>, schedule: Schedule) {
    event.preventDefault(); setError(''); setNotice('')
    const personId = selectedPeople[schedule.id]
    const ministryRole = selectedRoles[schedule.id] ?? roles[0][0]
    if (!supabase || !session?.user.id || !isAdmin || !personId) return
    setSaving(true)
    const { error: saveError } = await supabase.from('ministry_schedule_assignments').insert({ schedule_id: schedule.id, volunteer_profile_id: personId, ministry_role: ministryRole, created_by: session.user.id })
    setSaving(false)
    if (saveError) { setError(saveError.code === '23505' ? 'Essa pessoa já está nessa função nesta escala.' : 'Não foi possível adicionar a atribuição.'); return }
    setNotice('Voluntário adicionado à escala.'); await load()
  }

  async function removeAssignment(item: Assignment) {
    if (!supabase || !isAdmin) return
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

  async function saveVolunteerName(person: Volunteer) {
    if (!supabase || !isAdmin) return
    const displayName = editingNames[person.id]?.trim()
    if (!displayName || displayName.length > 120) { setError('Informe um nome de voluntário com até 120 caracteres.'); return }
    const { error: saveError } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', person.id)
    if (saveError) { setError('Não foi possível salvar o nome desse voluntário.'); return }
    setVolunteers(current => current.map(item => item.id === person.id ? { ...item, display_name: displayName } : item))
    setSchedules(current => current.map(schedule => ({ ...schedule, assignments: schedule.assignments.map(item => item.volunteer_profile_id === person.id ? { ...item, volunteer: { ...person, display_name: displayName } } : item) })))
    if (person.id === session?.user.id) await refreshProfile()
    setNotice(`Nome de voluntário atualizado para ${displayName}.`)
  }

  return <div className="animate-in space-y-5">
    <header className="rounded-2xl border border-[#E5DDCF] bg-[linear-gradient(110deg,#fff_0%,#fff_72%,#F0E6D2_100%)] p-5 sm:p-7">
      <span className="inline-flex items-center gap-2 rounded-full bg-[#F0E6D2] px-3 py-1.5 text-xs font-semibold text-[#8A6729]"><CalendarDays size={14}/>MINISTÉRIO DE BOAS-VINDAS</span>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Escala de voluntários</h1>
      <p className="mt-1 text-sm text-[#68645C]">Funções e equipes de cada culto.</p>
    </header>
    {role === 'team' && <p className="rounded-xl border border-[#E5DDCF] bg-white px-4 py-3 text-sm text-[#68645C]">Você pode consultar as escalas. A criação e as alterações são feitas pelo administrador.</p>}
    {error && <p role="alert" className="status-negative rounded-lg border px-3 py-2 text-sm">{error}</p>}
    {notice && <p role="status" className="status-positive rounded-lg border px-3 py-2 text-sm">{notice}</p>}
    {isAdmin && <form onSubmit={createSchedule} className="flex flex-col gap-3 rounded-2xl border border-[#E5DDCF] bg-white p-4 sm:flex-row sm:items-end sm:p-5">
      <label className="flex-1 text-sm font-medium">Dia do culto<input aria-label="Dia do culto" className="form-input mt-1.5 h-11 w-full" type="date" required value={newDate} onChange={event => setNewDate(event.target.value)}/></label>
      <label className="flex-1 text-sm font-medium">Culto<select aria-label="Culto" className="form-input mt-1.5 h-11 w-full" value={newService} onChange={event => setNewService(event.target.value as ServiceLabel)}><option>Domingo às 10h</option><option>Domingo às 18h</option><option>Quinta às 19h15</option></select></label>
      <button type="submit" disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8A6729] px-4 text-sm font-semibold text-white disabled:opacity-60"><Plus size={16}/>{saving ? 'Salvando…' : 'Criar escala'}</button>
    </form>}
    {isAdmin && <section className="rounded-2xl border border-[#E5DDCF] bg-white p-4 sm:p-5"><h2 className="font-semibold">Nomes dos voluntários</h2><p className="mt-1 text-sm text-[#68645C]">Cada nome fica vinculado ao e-mail usado no login. Ajuste os nomes para aparecerem corretamente nas escalas.</p>{volunteers.length === 0 ? <p className="mt-3 text-sm text-[#938B7E]">Nenhum perfil ativo encontrado.</p> : <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{volunteers.map(person => <div key={person.id} className="grid gap-2 rounded-xl bg-[#FBF9F4] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center"><span className="min-w-0 truncate text-xs text-[#68645C]">{person.email ?? 'E-mail indisponível'}</span><input aria-label={`Nome do voluntário para ${person.email ?? person.id}`} className="form-input h-10" maxLength={120} value={editingNames[person.id] ?? ''} onChange={event => setEditingNames(current => ({ ...current, [person.id]: event.target.value }))}/><button type="button" onClick={() => void saveVolunteerName(person)} className="h-10 rounded-lg border border-[#D9CCB2] bg-white px-3 text-xs font-medium text-[#6B4F1D]">Salvar nome</button></div>)}</div>}</section>}
    {loading && <p role="status" className="text-sm text-[#68645C]">Carregando escalas…</p>}
    {!loading && !error && schedules.length === 0 && <section className="rounded-2xl border border-dashed border-[#D9CCB2] bg-white p-8 text-center"><CalendarDays size={24} className="mx-auto text-[#8A6729]"/><h2 className="mt-3 font-semibold">Nenhuma escala cadastrada</h2><p className="mt-1 text-sm text-[#68645C]">{isAdmin ? 'Crie uma escala para começar a atribuir as funções.' : 'O administrador ainda não cadastrou escalas.'}</p></section>}
    <div className="space-y-4">{schedules.map(schedule => <section key={schedule.id} className="overflow-hidden rounded-2xl border border-[#E5DDCF] bg-white shadow-[0_3px_12px_rgba(0,0,0,.035)]">
      <header className="flex items-center justify-between gap-3 border-b border-[#E5DDCF] bg-[#FBF9F4] px-4 py-4 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F0E6D2] text-[#8A6729]"><CalendarDays size={18}/></span><div><p className="text-xs uppercase tracking-wide text-[#68645C]">{schedule.service_label}</p><h2 className="font-semibold capitalize">{formatDate(schedule.service_date)}</h2></div></div>{isAdmin && <button type="button" aria-label={`Excluir escala de ${schedule.service_label} em ${formatDate(schedule.service_date)}`} onClick={() => void deleteSchedule(schedule)} className="grid size-9 shrink-0 place-items-center rounded-lg text-[#8B3C32] hover:bg-red-50"><Trash2 size={16}/></button>}</header>
      <div className="divide-y divide-[#EEE8DC]">{roles.map(([key, label]) => {
        const assigned = schedule.assignments.filter(item => item.ministry_role === key)
        return <div key={key} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(190px,.8fr)_minmax(0,1.5fr)] sm:items-center sm:px-5"><p className="text-sm font-medium">{label}</p><div className="flex flex-wrap gap-2">{assigned.map(item => <span key={item.id} className="inline-flex items-center gap-2 rounded-full bg-[#F7F2E8] px-3 py-1.5 text-sm"><UsersRound size={14} className="text-[#8A6729]"/>{item.volunteer?.display_name ?? 'Voluntário'}{isAdmin && <button type="button" aria-label={`Remover ${item.volunteer?.display_name ?? 'voluntário'} da função ${label}`} onClick={() => void removeAssignment(item)} className="ml-1 rounded-full text-[#8B3C32] hover:text-red-800"><X size={14}/></button>}</span>)}{assigned.length === 0 && <span className="text-sm text-[#938B7E]">Ainda sem voluntário</span>}</div></div>
      })}</div>
      {isAdmin && <form onSubmit={event => void addAssignment(event, schedule)} className="grid gap-2 border-t border-[#E5DDCF] bg-[#FBF9F4] p-4 sm:grid-cols-[1fr_1.2fr_auto] sm:items-end sm:px-5"><label className="text-xs font-medium">Função<select className="form-input mt-1.5 h-10 w-full" value={selectedRoles[schedule.id] ?? roles[0][0]} onChange={event => setSelectedRoles(current => ({ ...current, [schedule.id]: event.target.value }))}>{roles.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label className="text-xs font-medium">Voluntário<select className="form-input mt-1.5 h-10 w-full" required value={selectedPeople[schedule.id] ?? ''} onChange={event => setSelectedPeople(current => ({ ...current, [schedule.id]: event.target.value }))}><option value="">Selecione um voluntário</option>{volunteers.map(person => <option key={person.id} value={person.id}>{person.display_name}{person.email ? ` · ${person.email}` : ''}</option>)}</select></label><button type="submit" disabled={saving || volunteers.length === 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#8A6729] px-4 text-sm font-medium text-white disabled:opacity-50"><Plus size={15}/>Adicionar função</button></form>}
    </section>)}</div>
  </div>
}
