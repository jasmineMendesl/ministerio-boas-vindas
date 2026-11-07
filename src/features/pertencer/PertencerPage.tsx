import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, CheckCircle2, Coffee, Search, UsersRound, XCircle, Clock3, Save, ClipboardList } from 'lucide-react'
import { useAuth } from '../../app/AuthProvider'
import { supabase } from '../../lib/supabase'
import { editableInvitationStatuses, invitationStatusLabels, invitationStatusTones, type InvitationStatus } from './invitation-status'

type Invitation = { id: string; followUpId: string; name: string; phone: string; decision: string; decisionDate: string; confirmation: InvitationStatus; attended: boolean }
type Row = { id: string; attendance: InvitationStatus; attended: boolean; confirmed_at: string | null; attendance_recorded_at: string | null; person: { full_name: string; phone_normalized: string } | { full_name: string; phone_normalized: string }[] | null; follow_up_id: string }
type Event = { id: string; event_date: string; title: string }
type HistoryGuest = { id: string; attendance: InvitationStatus; attended: boolean; name: string; phone: string }
type HistoryEdition = Event & { guests: HistoryGuest[] }
type Volunteer = { id: string; display_name: string }
type AgendaRecord = { sequence: number; title: string; volunteer_profile_id: string | null }
const agendaItems = ['Oração inicial', 'Dinâmica', 'Saudação Breve', 'Apresentação da Igreja', 'Oração Final e explicar o projeto', 'Recepção', 'Mídia']
const label = invitationStatusLabels
const tone = invitationStatusTones
type Filter = 'all' | Exclude<InvitationStatus, 'absent'>

function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }
function formatDate(value: string) { return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { dateStyle: 'long' }) }
function Metric({ icon: Icon, label, value, color }: { icon: typeof UsersRound; label: string; value: number; color: string }) {
  return <article className={`flex min-w-0 items-center gap-3 rounded-xl border p-3.5 ${color}`}><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/80"><Icon size={18}/></span><div><p className="text-xs">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div></article>
}

export function PertencerPage() {
  const { role, session } = useAuth()
  const isAdmin = role === 'admin'
  const [event, setEvent] = useState<Event | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [historyEditions, setHistoryEditions] = useState<HistoryEdition[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [agendaLoading, setAgendaLoading] = useState(false)
  const [savingAgenda, setSavingAgenda] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null)
  const [savingCheckinId, setSavingCheckinId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('guests')
  const [newEventDate, setNewEventDate] = useState('')
  const [newEventTitle, setNewEventTitle] = useState('Projeto Pertencer')
  const [creatingEvent, setCreatingEvent] = useState(false)

  const loadEventAndGuests = useCallback(async () => {
    if (!supabase || !session?.user.id) { setError('Entre com uma conta autorizada para consultar as edições.'); setLoading(false); return }
    setLoading(true); setError('')
    const today = localDate()
    const eventResult = await supabase.from('pertencer_events').select('id,event_date,title').gte('event_date', today).order('event_date', { ascending: true }).limit(1)
    if (eventResult.error) { setError('Não foi possível carregar as edições. Verifique as permissões do perfil.'); setEvent(null); setInvitations([]); setLoading(false); return }
    const selectedEvent = (eventResult.data?.[0] as Event | undefined) ?? null
    setEvent(selectedEvent)
    if (!selectedEvent) { setInvitations([]); setLoading(false); return }
    const inviteResult = await supabase.from('event_invitations').select('id,attendance,attended,confirmed_at,attendance_recorded_at,follow_up_id,person:people!event_invitations_person_id_fkey(full_name,phone_normalized)').eq('event_id', selectedEvent.id).order('created_at', { ascending: false })
    if (inviteResult.error) { setError('Não foi possível carregar os convidados.'); setInvitations([]); setLoading(false); return }
    const rows = (inviteResult.data ?? []) as unknown as Row[]
    const followUpIds = [...new Set(rows.map(row => row.follow_up_id).filter(Boolean))]
    const followUps = followUpIds.length ? await supabase.from('follow_ups').select('id,decision_id,status').in('id', followUpIds) : { data: [], error: null }
    const decisionIds = [...new Set((followUps.data ?? []).map((item: { decision_id: string }) => item.decision_id))]
    const decisions = decisionIds.length ? await supabase.from('decisions').select('id,decision_type,decided_on').in('id', decisionIds) : { data: [], error: null }
    const decisionsById = new Map((decisions.data ?? []).map((item: { id: string; decision_type: string; decided_on: string }) => [item.id, item]))
    const followUpsById = new Map((followUps.data ?? []).map((item: { id: string; decision_id: string; status: string }) => [item.id, item]))
    setInvitations(rows.map(row => {
      const person = Array.isArray(row.person) ? row.person[0] : row.person
      const followUp = followUpsById.get(row.follow_up_id)
      const decision = followUp ? decisionsById.get(followUp.decision_id) : undefined
      return { id: row.id, followUpId: row.follow_up_id, name: person?.full_name ?? 'Pessoa sem nome', phone: person?.phone_normalized ?? '', decision: decision?.decision_type === 'acceptance' ? 'Aceitação' : 'Reconciliação', decisionDate: decision?.decided_on ? formatDate(decision.decided_on) : '—', confirmation: row.attendance, attended: row.attended }
    }))
    setLoading(false)
  }, [session?.user.id])

  const loadHistory = useCallback(async () => {
    if (!supabase || !session?.user.id) { setHistoryError('Entre com uma conta autorizada para consultar o histórico.'); setHistoryLoading(false); return }
    setHistoryLoading(true); setHistoryError('')
    const editionsResult = await supabase.from('pertencer_events').select('id,event_date,title').lt('event_date', localDate()).order('event_date', { ascending: false })
    if (editionsResult.error) { setHistoryError('Não foi possível carregar o histórico de cafés.'); setHistoryEditions([]); setHistoryLoading(false); return }
    const editions = (editionsResult.data ?? []) as Event[]
    if (!editions.length) { setHistoryEditions([]); setHistoryLoading(false); return }
    const invitationsResult = await supabase.from('event_invitations').select('id,event_id,attendance,attended,person:people!event_invitations_person_id_fkey(full_name,phone_normalized)').in('event_id', editions.map(item => item.id)).order('created_at', { ascending: false })
    if (invitationsResult.error) { setHistoryError('Não foi possível carregar os convidados das edições anteriores.'); setHistoryEditions([]); setHistoryLoading(false); return }
    const guestRows = (invitationsResult.data ?? []) as unknown as Array<{ id: string; event_id: string; attendance: InvitationStatus; attended: boolean; person: { full_name: string; phone_normalized: string } | { full_name: string; phone_normalized: string }[] | null }>
    const guestsByEvent = new Map<string, HistoryGuest[]>()
    for (const row of guestRows) {
      const person = Array.isArray(row.person) ? row.person[0] : row.person
      guestsByEvent.set(row.event_id, [...(guestsByEvent.get(row.event_id) ?? []), { id: row.id, attendance: row.attendance, attended: row.attended, name: person?.full_name ?? 'Pessoa sem nome', phone: person?.phone_normalized ?? '' }])
    }
    setHistoryEditions(editions.map(item => ({ ...item, guests: guestsByEvent.get(item.id) ?? [] })))
    setHistoryLoading(false)
  }, [session?.user.id])

  const loadAgenda = useCallback(async () => {
    if (!supabase || !session?.user.id || !event) return
    setAgendaLoading(true)
    const [volunteerResult, agendaResult] = await Promise.all([
      supabase.from('profiles').select('id,display_name').eq('active', true).order('display_name'),
      supabase.from('pertencer_agenda_items').select('sequence,title,volunteer_profile_id').eq('event_id', event.id).order('sequence'),
    ])
    if (volunteerResult.error || agendaResult.error) {
      setError('Não foi possível carregar o roteiro ou os perfis dos voluntários. Confira se as migrations estão aplicadas.')
      setAgendaLoading(false)
      return
    }
    setVolunteers((volunteerResult.data ?? []) as Volunteer[])
    const nextAssignments: Record<number, string> = {}
    for (const item of (agendaResult.data ?? []) as AgendaRecord[]) if (item.volunteer_profile_id) nextAssignments[item.sequence] = item.volunteer_profile_id
    setAssignments(nextAssignments)
    setAgendaLoading(false)
  }, [event, session?.user.id])

  useEffect(() => { void loadEventAndGuests() }, [loadEventAndGuests])
  useEffect(() => { if (activeTab === 'agenda' && event) void loadAgenda() }, [activeTab, event, loadAgenda])
  useEffect(() => { if (activeTab === 'history') void loadHistory() }, [activeTab, loadHistory])

  const filtered = useMemo(() => invitations.filter(item => `${item.name} ${item.phone}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')) && (filter === 'all' || (filter === 'present' ? item.attended : item.confirmation === filter))), [invitations, query, filter])
  const counts = {
    all: invitations.length,
    pending: invitations.filter(item => item.confirmation === 'pending').length,
    no_response: invitations.filter(item => item.confirmation === 'no_response').length,
    declined: invitations.filter(item => item.confirmation === 'declined').length,
    confirmed: invitations.filter(item => item.confirmation === 'confirmed').length,
    present: invitations.filter(item => item.attended).length,
  }
  const tabs = [{ id: 'guests', label: 'Lista de convidados' }, { id: 'history', label: 'Histórico de cafés' }, { id: 'agenda', label: 'Roteiro do encontro' }]

  async function updateInvitationStatus(invitation: Invitation, status: Exclude<InvitationStatus, 'absent'>) {
    if (!supabase || !event || !isAdmin) return
    setSavingStatusId(invitation.id); setError(''); setNotice('')
    const { error: updateError } = await supabase.rpc('set_pertencer_invitation_status', {
      p_follow_up_id: invitation.followUpId,
      p_event_id: event.id,
      p_status: status,
    })
    setSavingStatusId(null)
    if (updateError) { setError('Não foi possível atualizar o status do convite.'); return }
    setNotice('Status do convite atualizado.')
    await loadEventAndGuests()
  }

  async function updateCheckin(invitationId: string, attended: boolean) {
    if (!supabase || !isAdmin) return
    setSavingCheckinId(invitationId); setError(''); setNotice('')
    const { error: updateError } = await supabase.rpc('set_pertencer_invitation_attendance', {
      p_invitation_id: invitationId,
      p_attended: attended,
    })
    setSavingCheckinId(null)
    if (updateError) { setError('Não foi possível salvar a presença. Confira se a migration de check-in foi aplicada.'); return }
    setNotice('Presença da edição atualizada.')
    if (activeTab === 'history') await loadHistory()
    else await loadEventAndGuests()
  }

  async function saveAgenda() {
    if (!supabase || !event || !isAdmin) return
    setSavingAgenda(true); setError(''); setNotice('')
    const rows = agendaItems.map((title, index) => ({ event_id: event.id, sequence: index + 1, title, volunteer_profile_id: assignments[index + 1] || null }))
    const { error: saveError } = await supabase.from('pertencer_agenda_items').upsert(rows, { onConflict: 'event_id,sequence' })
    setSavingAgenda(false)
    if (saveError) { setError('Não foi possível salvar as atribuições do roteiro.'); return }
    setNotice('Roteiro salvo para esta edição.')
  }

  async function createEvent(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault(); setError(''); setNotice('')
    if (!supabase || !isAdmin) return
    setCreatingEvent(true)
    const { data, error: createError } = await supabase.from('pertencer_events').insert({ event_date: newEventDate, title: newEventTitle.trim() || 'Projeto Pertencer' }).select('id,event_date,title').single()
    setCreatingEvent(false)
    if (createError || !data) { setError(createError?.code === '23505' ? 'Já existe uma edição nesta data.' : 'Não foi possível cadastrar a edição.'); return }
    setEvent(data as Event)
    await loadEventAndGuests()
    setNotice('Edição cadastrada. Os convites pendentes e o roteiro já estão disponíveis.')
  }

  return <div className="animate-in space-y-4 text-[#161616] sm:space-y-5">
    {role === 'team' && <div role="status" className="rounded-lg border border-[#E5DDCF] bg-white px-3 py-2 text-xs text-[#34322E]">Acesso de visualização: a equipe pode consultar esta tela, mas não criar nem alterar dados do Projeto Pertencer.</div>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">{notice}</div>}
    <header className="flex flex-col justify-between gap-4 rounded-2xl border border-[#E5DDCF] bg-[linear-gradient(110deg,#fff_0%,#fff_72%,#F0E6D2_100%)] p-5 shadow-[0_3px_14px_rgba(0,0,0,.035)] sm:flex-row sm:items-center sm:px-7 sm:py-6">
      <div><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#F0E6D2] px-3 py-1.5 text-xs font-semibold text-[#8A6729]"><Coffee size={13}/>MÓDULO PERTENCER</span><span className="text-xs text-[#68645C]">· Conectado ao Supabase</span></div><h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#161616] sm:text-3xl">Projeto Pertencer</h1><p className="mt-1 text-sm text-[#68645C]">Café de integração e fraternidade</p></div>
      <div className="flex items-center gap-3 rounded-xl border border-[#E5DDCF] bg-white/90 p-3 sm:min-w-[220px]"><span className="grid size-11 place-items-center rounded-xl bg-[#F0E6D2] text-[#B08A3E]"><CalendarDays size={19}/></span><div><p className="text-xs text-[#68645C]">Próxima edição</p><p className="mt-1 text-sm font-semibold">{event ? formatDate(event.event_date) : 'Não agendada'}</p></div></div>
    </header>
    <section className="rounded-2xl border border-[#D9CCB2] bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.035)] sm:p-6">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E5DDCF] pb-4 sm:flex-row sm:items-start"><div><p className="flex items-center gap-2 text-xs font-medium text-[#8A6729]"><CalendarDays size={15}/>{event?.title ?? 'Edição do Projeto Pertencer'}</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{event ? `Próximo Café: ${formatDate(event.event_date)}` : 'Nenhuma edição futura cadastrada'}</h2></div></div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6 sm:gap-3"><Metric icon={UsersRound} label="Convidados" value={counts.all} color="status-neutral"/><Metric icon={Clock3} label="Pendente" value={counts.pending} color="status-pending"/><Metric icon={Clock3} label="Não respondido" value={counts.no_response} color="status-pending"/><Metric icon={XCircle} label="Não vai comparecer" value={counts.declined} color="status-negative"/><Metric icon={CheckCircle2} label="Vai comparecer" value={counts.confirmed} color="status-positive"/><Metric icon={CheckCircle2} label="Compareceu" value={counts.present} color="status-positive"/></div>
    </section>
    <nav aria-label="Seções do Projeto Pertencer" className="flex gap-1 overflow-x-auto rounded-xl border border-[#D9CCB2] bg-[#F0E6D2] p-1">{tabs.map(tab => <button key={tab.id} type="button" aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)} className={`inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium sm:flex-1 sm:text-sm ${activeTab === tab.id ? 'bg-white text-[#8A6729] shadow-sm' : 'text-[#34322E]'}`}>{tab.label}</button>)}</nav>

    {activeTab === 'guests' && <>
      <div className="flex flex-col gap-2 rounded-xl border border-[#E5DDCF] bg-white p-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4"><div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 text-xs"><span className="shrink-0 text-[#68645C]">Filtro rápido:</span>{(['all', ...editableInvitationStatuses] as Filter[]).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`shrink-0 rounded-full px-3 py-1.5 font-medium ${filter === value ? 'bg-[#EBDCBB] text-[#6B4F1D]' : 'bg-[#F7F2E8] text-[#68645C]'}`}>{value === 'all' ? `Todos (${counts.all})` : `${label[value]} (${counts[value]})`}</button>)}</div></div>
      <section className="overflow-hidden rounded-2xl border border-[#D9CCB2] bg-white shadow-[0_3px_14px_rgba(0,0,0,.035)]"><div className="border-b border-[#E5DDCF] p-3.5 sm:px-4"><label className="relative block w-full sm:max-w-[290px]"><span className="sr-only">Buscar por nome ou contato</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#68645C]"/><input className="h-10 w-full rounded-xl border border-[#D9CCB2] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#C2A35E]" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nome ou contato..."/></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-[#F7F2E8] text-xs font-semibold text-[#34322E]"><tr><th className="px-4 py-3">Nome do convidado</th><th className="px-3 py-3">Decisão e data</th><th className="px-3 py-3">Status do convite</th><th className="px-3 py-3">Check-in</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id} className="border-t border-[#E5DDCF] align-middle"><td className="px-4 py-3"><p className="font-semibold">{item.name}</p><p className="mt-0.5 text-xs text-[#68645C]">{item.phone}</p></td><td className="px-3 py-3"><span className="font-medium text-[#8A6729]">{item.decision}</span><p className="mt-0.5 text-xs text-[#68645C]">{item.decisionDate}</p></td><td className="px-3 py-3">{isAdmin ? <select aria-label={`Status do convite de ${item.name}`} value={item.confirmation} disabled={savingStatusId === item.id} onChange={e => { if (e.target.value !== 'absent') void updateInvitationStatus(item, e.target.value as Exclude<InvitationStatus, 'absent'>) }} className={`h-9 max-w-[190px] rounded-lg border px-2 text-xs font-medium ${tone[item.confirmation]} disabled:opacity-60`}><option value="absent" disabled>{label.absent} (histórico)</option>{editableInvitationStatuses.map(status => <option key={status} value={status}>{label[status]}</option>)}</select> : <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone[item.confirmation]}`}>{label[item.confirmation]}</span>}</td><td className="px-3 py-3">{isAdmin ? <select aria-label={`Check-in de ${item.name}`} value={item.attended ? 'true' : 'false'} disabled={savingCheckinId === item.id} onChange={e => void updateCheckin(item.id, e.target.value === 'true')} className={`h-9 rounded-lg border px-2 text-xs font-medium ${item.attended ? 'status-positive' : 'status-negative'} disabled:opacity-60`}><option value="true">Veio</option><option value="false">Não veio</option></select> : item.attended ? <span className="status-positive inline-flex rounded-full border px-2.5 py-1 text-xs">Veio</span> : <span className="status-negative inline-flex rounded-full border px-2.5 py-1 text-xs">Não veio</span>}</td></tr>)}</tbody></table>{loading ? <p className="px-5 py-10 text-center text-sm text-[#68645C]">Carregando dados...</p> : filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-[#68645C]">Nenhum convite encontrado para esta edição.</p>}</div>
        <div className="border-t border-[#E5DDCF] bg-[#FBF9F4] px-4 py-3 text-xs text-[#68645C]">Exibindo {filtered.length} de {invitations.length} convidados</div></section>
    </>}

    {activeTab === 'agenda' && <section className="space-y-5 rounded-2xl border border-[#D9CCB2] bg-white p-4 shadow-[0_3px_14px_rgba(0,0,0,.035)] sm:p-6">
      <header><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#8A6729]"><ClipboardList size={15}/> Roteiro do café</p><h2 className="mt-2 text-xl font-semibold">Programação e voluntários</h2><p className="mt-1 text-sm text-[#68645C]">Defina quem ficará responsável por cada parte desta edição.</p></header>
      {!event && isAdmin && <form onSubmit={createEvent} className="grid gap-3 rounded-xl border border-[#E5DDCF] bg-[#FBF9F4] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="block text-xs font-medium">Data do café<input className="form-input mt-1.5 h-10 text-sm" type="date" min={localDate()} required value={newEventDate} onChange={e => setNewEventDate(e.target.value)}/></label><label className="block text-xs font-medium">Nome da edição<input className="form-input mt-1.5 h-10 text-sm" maxLength={120} required value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)}/></label><button type="submit" disabled={creatingEvent} className="inline-flex h-10 items-center justify-center rounded-lg bg-[#8A6729] px-4 text-sm font-medium text-white disabled:opacity-60">{creatingEvent ? 'Salvando…' : 'Criar edição'}</button></form>}
      {!event && !isAdmin && <p className="rounded-xl bg-[#FBF9F4] p-4 text-sm text-[#68645C]">O roteiro estará disponível quando uma edição futura for cadastrada.</p>}
      {event && <>
        {agendaLoading ? <p role="status" className="text-sm text-[#68645C]">Carregando roteiro e voluntários…</p> : <div className="space-y-2">{agendaItems.map((item, index) => <label key={item} className="grid gap-2 rounded-xl border border-[#E5DDCF] p-3 sm:grid-cols-[48px_minmax(0,1fr)_minmax(200px,.8fr)] sm:items-center"><span className="grid size-9 place-items-center rounded-lg bg-[#F0E6D2] text-sm font-semibold text-[#8A6729]">{String(index + 1).padStart(2, '0')}</span><span className="text-sm font-medium">{item}</span><select aria-label={`Voluntário responsável por ${item}`} disabled={!isAdmin} className="h-10 rounded-lg border border-[#D9CCB2] bg-white px-3 text-sm disabled:bg-[#F7F2E8]" value={assignments[index + 1] ?? ''} onChange={e => setAssignments(current => ({ ...current, [index + 1]: e.target.value }))}><option value="">{volunteers.length ? 'Selecionar voluntário' : 'Nenhum voluntário cadastrado'}</option>{volunteers.map(volunteer => <option key={volunteer.id} value={volunteer.id}>{volunteer.display_name}</option>)}</select></label>)}</div>}
        {isAdmin && <div className="flex justify-end"><button type="button" onClick={() => void saveAgenda()} disabled={savingAgenda || agendaLoading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#8A6729] px-4 text-sm font-medium text-white disabled:opacity-60"><Save size={15}/>{savingAgenda ? 'Salvando…' : 'Salvar roteiro'}</button></div>}
        {!isAdmin && <p className="text-xs text-[#68645C]">Somente administradores podem cadastrar voluntários ou alterar as atribuições.</p>}
      </>}
    </section>}

    {activeTab === 'history' && <section className="space-y-4">{historyError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{historyError}</p>}{historyLoading ? <p role="status" className="rounded-xl border border-[#E5DDCF] bg-white p-6 text-center text-sm text-[#68645C]">Carregando histórico de cafés...</p> : historyEditions.length ? historyEditions.map(edition => <article key={edition.id} className="overflow-hidden rounded-2xl border border-[#D9CCB2] bg-white shadow-[0_3px_14px_rgba(0,0,0,.035)]"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5DDCF] bg-[#FBF9F4] px-4 py-3"><div><p className="text-xs font-medium text-[#8A6729]">{edition.title}</p><h2 className="mt-1 font-semibold">Café de {formatDate(edition.event_date)}</h2></div><span className="rounded-full bg-[#F0E6D2] px-3 py-1 text-xs text-[#68645C]">{edition.guests.length} convidado(s)</span></header>{edition.guests.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-left text-sm"><thead className="bg-white text-xs font-semibold text-[#34322E]"><tr><th className="px-4 py-3">Convidado</th><th className="px-3 py-3">Status do convite</th><th className="px-3 py-3">Presença</th></tr></thead><tbody>{edition.guests.map(guest => <tr key={guest.id} className="border-t border-[#E5DDCF]"><td className="px-4 py-3"><p className="font-semibold">{guest.name}</p><p className="mt-0.5 text-xs text-[#68645C]">{guest.phone}</p></td><td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone[guest.attendance]}`}>{label[guest.attendance]}</span></td><td className="px-3 py-3">{isAdmin ? <select aria-label={`Presença de ${guest.name} em ${edition.title}`} value={guest.attended ? 'true' : 'false'} disabled={savingCheckinId === guest.id} onChange={e => void updateCheckin(guest.id, e.target.value === 'true')} className={`h-9 rounded-lg border px-2 text-xs font-medium ${guest.attended ? 'status-positive' : 'status-negative'} disabled:opacity-60`}><option value="true">Veio</option><option value="false">Não veio</option></select> : guest.attended ? <span className="status-positive inline-flex rounded-full border px-2.5 py-1 text-xs">Veio</span> : <span className="status-negative inline-flex rounded-full border px-2.5 py-1 text-xs">Não veio</span>}</td></tr>)}</tbody></table></div> : <p className="px-4 py-6 text-center text-sm text-[#68645C]">Nenhum convidado foi associado a esta edição.</p>}</article>) : <section className="empty-panel min-h-[260px]"><span className="empty-icon"><ClipboardList size={22}/></span><h2 className="mt-4 text-lg font-semibold">Histórico de cafés</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#68645C]">As edições anteriores aparecerão aqui automaticamente a partir do dia seguinte ao café, com seus convidados e presenças.</p></section>}</section>}
  </div>
}
