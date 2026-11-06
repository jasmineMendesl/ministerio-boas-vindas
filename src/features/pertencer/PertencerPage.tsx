import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Check, CheckCircle2, Coffee, Search, UsersRound, XCircle, Clock3, Save, UserPlus, ClipboardList } from 'lucide-react'
import { useAuth } from '../../app/AuthProvider'
import { supabase } from '../../lib/supabase'

type Status = 'confirmed' | 'awaiting' | 'absence'
type Invitation = { id: string; name: string; phone: string; decision: string; decisionDate: string; confirmation: Status; attended: boolean | null; nextStep: string }
type Row = { id: string; attendance: 'pending' | 'confirmed' | 'present' | 'absent'; confirmed_at: string | null; attendance_recorded_at: string | null; person: { full_name: string; phone_normalized: string } | { full_name: string; phone_normalized: string }[] | null; follow_up_id: string }
type Event = { id: string; event_date: string; title: string }
type Volunteer = { id: string; display_name: string }
type AgendaRecord = { sequence: number; title: string; volunteer_id: string | null }
const agendaItems = ['Oração inicial', 'Dinâmica', 'Saudação Breve', 'Apresentação da Igreja', 'Oração Final e explicar o projeto', 'Recepção', 'Mídia']
const label: Record<Status, string> = { confirmed: 'Confirmado', awaiting: 'Aguardando resposta', absence: 'Ausência registrada' }
const tone: Record<Status, string> = { confirmed: 'status-positive', awaiting: 'status-pending', absence: 'status-negative' }
type Filter = 'all' | Status

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
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [agendaLoading, setAgendaLoading] = useState(false)
  const [savingAgenda, setSavingAgenda] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [activeTab, setActiveTab] = useState('guests')
  const [volunteerName, setVolunteerName] = useState('')
  const [addingVolunteer, setAddingVolunteer] = useState(false)
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
    const inviteResult = await supabase.from('event_invitations').select('id,attendance,confirmed_at,attendance_recorded_at,follow_up_id,person:people!event_invitations_person_id_fkey(full_name,phone_normalized)').eq('event_id', selectedEvent.id).order('created_at', { ascending: false })
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
      const status: Status = row.attendance === 'confirmed' || row.attendance === 'present' ? 'confirmed' : row.attendance === 'absent' ? 'absence' : 'awaiting'
      const nextStep = followUp?.status === 'contact_made' || followUp?.status === 'responded' ? 'Acompanhamento iniciado' : 'Aguardando primeiro contato'
      return { id: row.id, name: person?.full_name ?? 'Pessoa sem nome', phone: person?.phone_normalized ?? '', decision: decision?.decision_type === 'acceptance' ? 'Aceitação' : 'Reconciliação', decisionDate: decision?.decided_on ? formatDate(decision.decided_on) : '—', confirmation: status, attended: row.attendance === 'present' ? true : row.attendance === 'absent' ? false : null, nextStep }
    }))
    setLoading(false)
  }, [session?.user.id])

  const loadAgenda = useCallback(async () => {
    if (!supabase || !session?.user.id || !event) return
    setAgendaLoading(true)
    const [volunteerResult, agendaResult] = await Promise.all([
      supabase.from('pertencer_volunteers').select('id,display_name').eq('active', true).order('display_name'),
      supabase.from('pertencer_agenda_items').select('sequence,title,volunteer_id').eq('event_id', event.id).order('sequence'),
    ])
    if (volunteerResult.error || agendaResult.error) {
      setError('Não foi possível carregar o roteiro ou os voluntários. Confira se a migration do roteiro está aplicada.')
      setAgendaLoading(false)
      return
    }
    setVolunteers((volunteerResult.data ?? []) as Volunteer[])
    const nextAssignments: Record<number, string> = {}
    for (const item of (agendaResult.data ?? []) as AgendaRecord[]) if (item.volunteer_id) nextAssignments[item.sequence] = item.volunteer_id
    setAssignments(nextAssignments)
    setAgendaLoading(false)
  }, [event, session?.user.id])

  useEffect(() => { void loadEventAndGuests() }, [loadEventAndGuests])
  useEffect(() => { if (activeTab === 'agenda' && event) void loadAgenda() }, [activeTab, event, loadAgenda])

  const filtered = useMemo(() => invitations.filter(item => `${item.name} ${item.phone}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')) && (filter === 'all' || item.confirmation === filter)), [invitations, query, filter])
  const counts = { all: invitations.length, confirmed: invitations.filter(item => item.confirmation === 'confirmed').length, awaiting: invitations.filter(item => item.confirmation === 'awaiting').length, absence: invitations.filter(item => item.confirmation === 'absence').length }
  const tabs = [{ id: 'guests', label: 'Lista de convidados' }, { id: 'history', label: 'Histórico de cafés' }, { id: 'agenda', label: 'Roteiro do encontro' }]

  async function addVolunteer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(''); setError('')
    const displayName = volunteerName.trim().replace(/\s+/g, ' ')
    if (!displayName || !supabase) return
    setAddingVolunteer(true)
    const { data: savedVolunteer, error: saveError } = await supabase.from('pertencer_volunteers').insert({ display_name: displayName }).select('id,display_name').single()
    setAddingVolunteer(false)
    if (saveError) { setError(saveError.code === '23505' ? 'Esse voluntário já está cadastrado.' : 'Não foi possível cadastrar o voluntário.'); return }
    if (savedVolunteer) setVolunteers(current => [...current, savedVolunteer as Volunteer].sort((a, b) => a.display_name.localeCompare(b.display_name, 'pt-BR')))
    setVolunteerName(''); setNotice('Voluntário adicionado à lista.')
  }

  async function saveAgenda() {
    if (!supabase || !event || !isAdmin) return
    setSavingAgenda(true); setError(''); setNotice('')
    const rows = agendaItems.map((title, index) => ({ event_id: event.id, sequence: index + 1, title, volunteer_id: assignments[index + 1] || null }))
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
    setEvent(data as Event); setNotice('Edição cadastrada. Agora você pode montar o roteiro.')
  }

  return <div className="animate-in space-y-4 text-[#2B2118] sm:space-y-5">
    {role === 'team' && <div role="status" className="rounded-lg border border-[#E8DED4] bg-white px-3 py-2 text-xs text-[#5C5147]">Acesso de visualização: a equipe pode consultar esta tela, mas não criar nem alterar dados do Projeto Pertencer.</div>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">{notice}</div>}
    <header className="flex flex-col justify-between gap-4 rounded-2xl border border-[#E8DED4] bg-[linear-gradient(110deg,#fff_0%,#fff_72%,#F3E9DF_100%)] p-5 shadow-[0_3px_14px_rgba(60,42,28,.035)] sm:flex-row sm:items-center sm:px-7 sm:py-6">
      <div><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3E9DF] px-3 py-1.5 text-xs font-semibold text-[#6F4F28]"><Coffee size={13}/>MÓDULO PERTENCER</span><span className="text-xs text-[#75675D]">· Conectado ao Supabase</span></div><h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#2B2118] sm:text-3xl">Projeto Pertencer</h1><p className="mt-1 text-sm text-[#75675D]">Café de integração e fraternidade</p></div>
      <div className="flex items-center gap-3 rounded-xl border border-[#E8DED4] bg-white/90 p-3 sm:min-w-[220px]"><span className="grid size-11 place-items-center rounded-xl bg-[#F3E9DF] text-[#9B5C42]"><CalendarDays size={19}/></span><div><p className="text-xs text-[#75675D]">Próxima edição</p><p className="mt-1 text-sm font-semibold">{event ? formatDate(event.event_date) : 'Não agendada'}</p></div></div>
    </header>
    <section className="rounded-2xl border border-[#D9C8B7] bg-white p-4 shadow-[0_3px_14px_rgba(60,42,28,.035)] sm:p-6">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E8DED4] pb-4 sm:flex-row sm:items-start"><div><p className="flex items-center gap-2 text-xs font-medium text-[#6F4F28]"><CalendarDays size={15}/>{event?.title ?? 'Edição do Projeto Pertencer'}</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{event ? `Próximo Café: ${formatDate(event.event_date)}` : 'Nenhuma edição futura cadastrada'}</h2></div></div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4 sm:gap-3"><Metric icon={UsersRound} label="Convidados totais" value={counts.all} color="status-neutral"/><Metric icon={CheckCircle2} label="Presenças confirmadas" value={counts.confirmed} color="status-positive"/><Metric icon={Clock3} label="Aguardando resposta" value={counts.awaiting} color="status-pending"/><Metric icon={XCircle} label="Ausências registradas" value={counts.absence} color="status-negative"/></div>
    </section>
    <nav aria-label="Seções do Projeto Pertencer" className="flex gap-1 overflow-x-auto rounded-xl border border-[#D9C8B7] bg-[#F3E9DF] p-1">{tabs.map(tab => <button key={tab.id} type="button" aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)} className={`inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium sm:flex-1 sm:text-sm ${activeTab === tab.id ? 'bg-white text-[#6F4F28] shadow-sm' : 'text-[#5C5147]'}`}>{tab.label}</button>)}</nav>

    {activeTab === 'guests' && <>
      <div className="flex flex-col gap-2 rounded-xl border border-[#E8DED4] bg-white p-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4"><div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 text-xs"><span className="shrink-0 text-[#75675D]">Filtro rápido:</span>{(['all', 'confirmed', 'awaiting', 'absence'] as Filter[]).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`shrink-0 rounded-full px-3 py-1.5 font-medium ${filter === value ? 'bg-[#E7D7C8] text-[#5C3F20]' : 'bg-[#F8F2EC] text-[#75675D]'}`}>{value === 'all' ? `Todos (${counts.all})` : `${label[value]} (${counts[value]})`}</button>)}</div></div>
      <section className="overflow-hidden rounded-2xl border border-[#D9C8B7] bg-white shadow-[0_3px_14px_rgba(60,42,28,.035)]"><div className="border-b border-[#E8DED4] p-3.5 sm:px-4"><label className="relative block w-full sm:max-w-[290px]"><span className="sr-only">Buscar por nome ou contato</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#75675D]"/><input className="h-10 w-full rounded-xl border border-[#D9C8B7] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#A67B5B]" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nome ou contato..."/></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-left text-sm"><thead className="bg-[#F8F2EC] text-xs font-semibold text-[#5C5147]"><tr><th className="px-4 py-3">Nome do convidado</th><th className="px-3 py-3">Decisão e data</th><th className="px-3 py-3">Confirmação</th><th className="px-3 py-3">Check-in</th><th className="px-4 py-3">Próximo passo</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id} className="border-t border-[#E8DED4] align-middle"><td className="px-4 py-3"><p className="font-semibold">{item.name}</p><p className="mt-0.5 text-xs text-[#75675D]">{item.phone}</p></td><td className="px-3 py-3"><span className="font-medium text-[#6F4F28]">{item.decision}</span><p className="mt-0.5 text-xs text-[#75675D]">{item.decisionDate}</p></td><td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone[item.confirmation]}`}>{item.confirmation === 'confirmed' && <Check size={12} className="mr-1 inline"/>}{label[item.confirmation]}</span></td><td className="px-3 py-3">{item.attended === true ? <span className="status-positive inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs"><CheckCircle2 size={15}/>Presente</span> : item.attended === false ? <span className="status-negative inline-flex rounded-full border px-2.5 py-1 text-xs">Ausente</span> : <span className="status-pending inline-flex rounded-full border px-2.5 py-1 text-xs">Aguardando</span>}</td><td className="px-4 py-3"><span className="text-xs text-[#5C5147]">{item.nextStep}</span></td></tr>)}</tbody></table>{loading ? <p className="px-5 py-10 text-center text-sm text-[#75675D]">Carregando dados...</p> : filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-[#75675D]">Nenhum convite encontrado para esta edição.</p>}</div>
        <div className="border-t border-[#E8DED4] bg-[#FBF8F4] px-4 py-3 text-xs text-[#75675D]">Exibindo {filtered.length} de {invitations.length} convidados</div></section>
    </>}

    {activeTab === 'agenda' && <section className="space-y-5 rounded-2xl border border-[#D9C8B7] bg-white p-4 shadow-[0_3px_14px_rgba(60,42,28,.035)] sm:p-6">
      <header><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#6F4F28]"><ClipboardList size={15}/> Roteiro do café</p><h2 className="mt-2 text-xl font-semibold">Programação e voluntários</h2><p className="mt-1 text-sm text-[#75675D]">Defina quem ficará responsável por cada parte desta edição.</p></header>
      {!event && isAdmin && <form onSubmit={createEvent} className="grid gap-3 rounded-xl border border-[#E8DED4] bg-[#FBF8F4] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="block text-xs font-medium">Data do café<input className="form-input mt-1.5 h-10 text-sm" type="date" min={localDate()} required value={newEventDate} onChange={e => setNewEventDate(e.target.value)}/></label><label className="block text-xs font-medium">Nome da edição<input className="form-input mt-1.5 h-10 text-sm" maxLength={120} required value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)}/></label><button type="submit" disabled={creatingEvent} className="inline-flex h-10 items-center justify-center rounded-lg bg-[#6F4F28] px-4 text-sm font-medium text-white disabled:opacity-60">{creatingEvent ? 'Salvando…' : 'Criar edição'}</button></form>}
      {!event && !isAdmin && <p className="rounded-xl bg-[#FBF8F4] p-4 text-sm text-[#75675D]">O roteiro estará disponível quando uma edição futura for cadastrada.</p>}
      {event && <>
        {isAdmin && <form onSubmit={addVolunteer} className="flex flex-col gap-2 rounded-xl border border-[#E8DED4] bg-[#FBF8F4] p-4 sm:flex-row"><label className="flex-1 text-xs font-medium">Adicionar voluntário à lista<input className="form-input mt-1.5 h-10 text-sm" maxLength={120} required value={volunteerName} onChange={e => setVolunteerName(e.target.value)} placeholder="Nome da pessoa que serve"/></label><button type="submit" disabled={addingVolunteer} className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#D9C8B7] bg-white px-4 text-sm font-medium text-[#6F4F28] disabled:opacity-60"><UserPlus size={15}/>{addingVolunteer ? 'Adicionando…' : 'Adicionar'}</button></form>}
        {agendaLoading ? <p role="status" className="text-sm text-[#75675D]">Carregando roteiro e voluntários…</p> : <div className="space-y-2">{agendaItems.map((item, index) => <label key={item} className="grid gap-2 rounded-xl border border-[#E8DED4] p-3 sm:grid-cols-[48px_minmax(0,1fr)_minmax(200px,.8fr)] sm:items-center"><span className="grid size-9 place-items-center rounded-lg bg-[#F3E9DF] text-sm font-semibold text-[#6F4F28]">{String(index + 1).padStart(2, '0')}</span><span className="text-sm font-medium">{item}</span><select aria-label={`Voluntário responsável por ${item}`} disabled={!isAdmin} className="h-10 rounded-lg border border-[#D9C8B7] bg-white px-3 text-sm disabled:bg-[#F8F2EC]" value={assignments[index + 1] ?? ''} onChange={e => setAssignments(current => ({ ...current, [index + 1]: e.target.value }))}><option value="">{volunteers.length ? 'Selecionar voluntário' : 'Nenhum voluntário cadastrado'}</option>{volunteers.map(volunteer => <option key={volunteer.id} value={volunteer.id}>{volunteer.display_name}</option>)}</select></label>)}</div>}
        {isAdmin && <div className="flex justify-end"><button type="button" onClick={() => void saveAgenda()} disabled={savingAgenda || agendaLoading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#6F4F28] px-4 text-sm font-medium text-white disabled:opacity-60"><Save size={15}/>{savingAgenda ? 'Salvando…' : 'Salvar roteiro'}</button></div>}
        {!isAdmin && <p className="text-xs text-[#75675D]">Somente administradores podem cadastrar voluntários ou alterar as atribuições.</p>}
      </>}
    </section>}

    {activeTab === 'history' && <section className="empty-panel min-h-[260px]"><span className="empty-icon"><ClipboardList size={22}/></span><h2 className="mt-4 text-lg font-semibold">{tabs.find(tab => tab.id === activeTab)?.label}</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#75675D]">Esta seção será implementada em uma próxima etapa.</p></section>}
  </div>
}
