import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, CheckCircle2, Coffee, Search, UsersRound, XCircle, Clock3 } from 'lucide-react'
import { useAuth } from '../../app/AuthProvider'
import { supabase } from '../../lib/supabase'

type Status = 'confirmed' | 'awaiting' | 'absence'
type Invitation = { id: string; name: string; phone: string; decision: string; decisionDate: string; confirmation: Status; attended: boolean | null; nextStep: string }
type Row = { id: string; attendance: 'pending' | 'confirmed' | 'present' | 'absent'; confirmed_at: string | null; attendance_recorded_at: string | null; person: { full_name: string; phone_normalized: string } | { full_name: string; phone_normalized: string }[] | null; follow_up_id: string }
type Event = { id: string; event_date: string; title: string }
const label: Record<Status, string> = { confirmed: 'Confirmado', awaiting: 'Aguardando resposta', absence: 'Ausência registrada' }
const tone: Record<Status, string> = { confirmed: 'status-positive', awaiting: 'status-pending', absence: 'status-negative' }
type Filter = 'all' | Status

function Metric({ icon: Icon, label, value, color }: { icon: typeof UsersRound; label: string; value: number; color: string }) {
  return <article className={`flex min-w-0 items-center gap-3 rounded-xl border p-3.5 ${color}`}><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/80"><Icon size={18}/></span><div><p className="text-xs">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div></article>
}

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { dateStyle: 'long' })
}

export function PertencerPage() {
  const { role, session } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let alive = true
    async function load() {
      if (!supabase || !session?.user.id) { setError('Entre com uma conta autorizada para consultar as edições.'); setLoading(false); return }
      setLoading(true); setError('')
      const today = new Date().toISOString().slice(0, 10)
      const eventResult = await supabase.from('pertencer_events').select('id,event_date,title').gte('event_date', today).order('event_date', { ascending: true }).limit(1)
      if (!alive) return
      if (eventResult.error) { setError('Não foi possível carregar as edições. Verifique as permissões do perfil.'); setEvent(null); setInvitations([]); setLoading(false); return }
      const selectedEvent = (eventResult.data?.[0] as Event | undefined) ?? null
      setEvent(selectedEvent)
      if (!selectedEvent) { setInvitations([]); setLoading(false); return }
      const inviteResult = await supabase.from('event_invitations').select('id,attendance,confirmed_at,attendance_recorded_at,follow_up_id,person:people!event_invitations_person_id_fkey(full_name,phone_normalized)').eq('event_id', selectedEvent.id).order('created_at', { ascending: false })
      if (!alive) return
      if (inviteResult.error) { setError('Não foi possível carregar os convidados.'); setInvitations([]); setLoading(false); return }
      const rows = (inviteResult.data ?? []) as unknown as Row[]
      const followUpIds = [...new Set(rows.map(row => row.follow_up_id).filter(Boolean))]
      const followUps = followUpIds.length ? await supabase.from('follow_ups').select('id,decision_id,status').in('id', followUpIds) : { data: [], error: null }
      const decisionIds = [...new Set((followUps.data ?? []).map((item: { decision_id: string }) => item.decision_id))]
      const decisions = decisionIds.length ? await supabase.from('decisions').select('id,decision_type,decided_on').in('id', decisionIds) : { data: [], error: null }
      if (!alive) return
      const decisionsById = new Map((decisions.data ?? []).map((item: { id: string; decision_type: string; decided_on: string }) => [item.id, item]))
      const followUpsById = new Map((followUps.data ?? []).map((item: { id: string; decision_id: string; status: string }) => [item.id, item]))
      setInvitations(rows.map(row => {
        const person = Array.isArray(row.person) ? row.person[0] : row.person
        const followUp = followUpsById.get(row.follow_up_id)
        const decision = followUp ? decisionsById.get(followUp.decision_id) : undefined
        const status: Status = row.attendance === 'confirmed' || row.attendance === 'present' ? 'confirmed' : row.attendance === 'absent' ? 'absence' : 'awaiting'
        const followStatus = followUp?.status
        const nextStep = followStatus === 'contact_made' || followStatus === 'responded' ? 'Acompanhamento iniciado' : 'Aguardando primeiro contato'
        return { id: row.id, name: person?.full_name ?? 'Pessoa sem nome', phone: person?.phone_normalized ?? '', decision: decision?.decision_type === 'acceptance' ? 'Aceitação' : 'Reconciliação', decisionDate: decision?.decided_on ? formatDate(decision.decided_on) : '—', confirmation: status, attended: row.attendance === 'present' ? true : row.attendance === 'absent' ? false : null, nextStep }
      }))
      setLoading(false)
    }
    void load()
    return () => { alive = false }
  }, [session?.user.id])

  const filtered = useMemo(() => invitations.filter(item => `${item.name} ${item.phone}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')) && (filter === 'all' || item.confirmation === filter)), [invitations, query, filter])
  const counts = { all: invitations.length, confirmed: invitations.filter(item => item.confirmation === 'confirmed').length, awaiting: invitations.filter(item => item.confirmation === 'awaiting').length, absence: invitations.filter(item => item.confirmation === 'absence').length }
  const tabs = ['Lista de convidados', 'Histórico de cafés', 'Roteiro do encontro', 'Voluntários']

  return <div className="animate-in space-y-4 text-[#2B2118] sm:space-y-5">
    {role === 'team' && <div role="status" className="rounded-lg border border-[#E8DED4] bg-white px-3 py-2 text-xs text-[#5C5147]">Acesso de visualização: a equipe pode consultar esta tela, mas não criar nem alterar dados do Projeto Pertencer.</div>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
    <header className="flex flex-col justify-between gap-4 rounded-2xl border border-[#E8DED4] bg-[linear-gradient(110deg,#fff_0%,#fff_72%,#F3E9DF_100%)] p-5 shadow-[0_3px_14px_rgba(60,42,28,.035)] sm:flex-row sm:items-center sm:px-7 sm:py-6">
      <div><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3E9DF] px-3 py-1.5 text-xs font-semibold text-[#6F4F28]"><Coffee size={13}/>MÓDULO PERTENCER</span><span className="text-xs text-[#75675D]">· Conectado ao Supabase</span></div><h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#2B2118] sm:text-3xl">Projeto Pertencer</h1><p className="mt-1 text-sm text-[#75675D]">Café de integração e fraternidade</p></div>
      <div className="flex items-center gap-3 rounded-xl border border-[#E8DED4] bg-white/90 p-3 sm:min-w-[220px]"><span className="grid size-11 place-items-center rounded-xl bg-[#F3E9DF] text-[#9B5C42]"><CalendarDays size={19}/></span><div><p className="text-xs text-[#75675D]">Próxima edição</p><p className="mt-1 text-sm font-semibold">{event ? formatDate(event.event_date) : 'Não agendada'}</p></div></div>
    </header>
    <section className="rounded-2xl border border-[#D9C8B7] bg-white p-4 shadow-[0_3px_14px_rgba(60,42,28,.035)] sm:p-6">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E8DED4] pb-4 sm:flex-row sm:items-start"><div><p className="flex items-center gap-2 text-xs font-medium text-[#6F4F28]"><CalendarDays size={15}/>{event?.title ?? 'Edição do Projeto Pertencer'}</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{event ? `Próximo Café: ${formatDate(event.event_date)}` : 'Nenhuma edição futura cadastrada'}</h2></div></div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4 sm:gap-3"><Metric icon={UsersRound} label="Convidados totais" value={counts.all} color="status-neutral"/><Metric icon={CheckCircle2} label="Presenças confirmadas" value={counts.confirmed} color="status-positive"/><Metric icon={Clock3} label="Aguardando resposta" value={counts.awaiting} color="status-pending"/><Metric icon={XCircle} label="Ausências registradas" value={counts.absence} color="status-negative"/></div>
    </section>
    <nav aria-label="Seções do Projeto Pertencer" className="flex gap-1 overflow-x-auto rounded-xl border border-[#D9C8B7] bg-[#F3E9DF] p-1">{tabs.map((tab, index) => <span key={tab} className={`inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium sm:flex-1 sm:text-sm ${index === 0 ? 'bg-white text-[#6F4F28] shadow-sm' : 'text-[#5C5147]'}`}>{tab}</span>)}</nav>
    <div className="flex flex-col gap-2 rounded-xl border border-[#E8DED4] bg-white p-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4"><div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 text-xs"><span className="shrink-0 text-[#75675D]">Filtro rápido:</span>{(['all', 'confirmed', 'awaiting', 'absence'] as Filter[]).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`shrink-0 rounded-full px-3 py-1.5 font-medium ${filter === value ? 'bg-[#E7D7C8] text-[#5C3F20]' : 'bg-[#F8F2EC] text-[#75675D]'}`}>{value === 'all' ? `Todos (${counts.all})` : `${label[value]} (${counts[value]})`}</button>)}</div></div>
    <section className="overflow-hidden rounded-2xl border border-[#D9C8B7] bg-white shadow-[0_3px_14px_rgba(60,42,28,.035)]"><div className="border-b border-[#E8DED4] p-3.5 sm:px-4"><label className="relative block w-full sm:max-w-[290px]"><span className="sr-only">Buscar por nome ou contato</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#75675D]"/><input className="h-10 w-full rounded-xl border border-[#D9C8B7] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#A67B5B]" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nome ou contato..."/></label></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-left text-sm"><thead className="bg-[#F8F2EC] text-xs font-semibold text-[#5C5147]"><tr><th className="px-4 py-3">Nome do convidado</th><th className="px-3 py-3">Decisão e data</th><th className="px-3 py-3">Confirmação</th><th className="px-3 py-3">Check-in</th><th className="px-4 py-3">Próximo passo</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id} className="border-t border-[#E8DED4] align-middle"><td className="px-4 py-3"><p className="font-semibold">{item.name}</p><p className="mt-0.5 text-xs text-[#75675D]">{item.phone}</p></td><td className="px-3 py-3"><span className="font-medium text-[#6F4F28]">{item.decision}</span><p className="mt-0.5 text-xs text-[#75675D]">{item.decisionDate}</p></td><td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone[item.confirmation]}`}>{item.confirmation === 'confirmed' && <Check size={12} className="mr-1 inline"/>}{label[item.confirmation]}</span></td><td className="px-3 py-3">{item.attended === true ? <span className="status-positive inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs"><CheckCircle2 size={15}/>Presente</span> : item.attended === false ? <span className="status-negative inline-flex rounded-full border px-2.5 py-1 text-xs">Ausente</span> : <span className="status-pending inline-flex rounded-full border px-2.5 py-1 text-xs">Aguardando</span>}</td><td className="px-4 py-3"><span className="text-xs text-[#5C5147]">{item.nextStep}</span></td></tr>)}</tbody></table>{loading ? <p className="px-5 py-10 text-center text-sm text-[#75675D]">Carregando dados...</p> : filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-[#75675D]">Nenhum convite encontrado para esta edição.</p>}</div>
      <div className="border-t border-[#E8DED4] bg-[#FBF8F4] px-4 py-3 text-xs text-[#75675D]">Exibindo {filtered.length} de {invitations.length} convidados</div></section>
  </div>
}
