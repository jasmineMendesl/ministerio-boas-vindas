import { useMemo, useState } from 'react'
import { BookOpen, CalendarDays, Check, CheckCircle2, Coffee, Clock3, List, Search, UsersRound, XCircle, ClipboardList, ChartNoAxesColumnIncreasing } from 'lucide-react'
import { useAuth } from '../../app/AuthProvider'

type InvitationStatus = 'confirmed' | 'awaiting' | 'absence'
type Invitation = {
  id: string
  name: string
  phone: string
  decision: 'Aceitação' | 'Reconciliação'
  decisionDate: string
  confirmation: InvitationStatus
  attended: boolean | null
  nextStep: string
}

const demoInvitations: Invitation[] = [
  { id: 'demo-1', name: 'Pessoa Exemplo 01', phone: '(11) 90000-0001', decision: 'Aceitação', decisionDate: '02/11/2026', confirmation: 'confirmed', attended: true, nextStep: 'Encaminhada para pequeno grupo' },
  { id: 'demo-2', name: 'Pessoa Exemplo 02', phone: '(11) 90000-0002', decision: 'Reconciliação', decisionDate: '26/10/2026', confirmation: 'confirmed', attended: true, nextStep: 'Inscrição para batismo' },
  { id: 'demo-3', name: 'Família Exemplo 03', phone: '(11) 90000-0003', decision: 'Aceitação', decisionDate: '02/11/2026', confirmation: 'awaiting', attended: null, nextStep: 'A definir no acolhimento' },
  { id: 'demo-4', name: 'Pessoa Exemplo 04', phone: '(11) 90000-0004', decision: 'Reconciliação', decisionDate: '19/10/2026', confirmation: 'confirmed', attended: true, nextStep: 'Encaminhada para pequeno grupo' },
  { id: 'demo-5', name: 'Pessoa Exemplo 05', phone: '(11) 90000-0005', decision: 'Aceitação', decisionDate: '02/11/2026', confirmation: 'absence', attended: false, nextStep: 'Contato pastoral pendente' },
]

const confirmationLabels: Record<InvitationStatus, string> = { confirmed: 'Confirmado', awaiting: 'Aguardando resposta', absence: 'Ausente justificado' }
type QuickFilter = 'all' | InvitationStatus

function MetricCard({ icon: Icon, label, value, tone }: { icon: typeof UsersRound; label: string; value: string; tone: 'neutral' | 'success' | 'waiting' | 'alert' }) {
  const tones = {
    neutral: 'border-[#E8DED4] bg-[#F8F2EC] text-[#5C5147]',
    success: 'border-[#E7D7C8] bg-[#F3E9DF] text-[#6F4F28]',
    waiting: 'border-[#E7D1C3] bg-[#FBF1EA] text-[#9B5C42]',
    alert: 'border-[#E8DED4] bg-[#F5F0E9] text-[#75675D]',
  }
  return <article className={`flex min-w-0 items-center gap-3 rounded-xl border p-3.5 ${tones[tone]}`}><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/80"><Icon size={18}/></span><div className="min-w-0"><p className="text-xs leading-4">{label}</p><p className="mt-1 text-lg font-semibold leading-5">{value}</p></div></article>
}

export function PertencerPage() {
  const { role } = useAuth()
  const [activeTab, setActiveTab] = useState('guests')
  const [query, setQuery] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const filteredInvitations = useMemo(() => demoInvitations.filter(item => {
    const matchesQuery = `${item.name} ${item.phone}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))
    return matchesQuery && (quickFilter === 'all' || item.confirmation === quickFilter)
  }), [query, quickFilter])

  const tabs = [
    { id: 'guests', label: 'Lista de Convidados e Presença', icon: List },
    { id: 'history', label: 'Hist\u00f3rico de caf\u00e9s', icon: Clock3 },
    { id: 'agenda', label: 'Roteiro do Encontro', icon: BookOpen },
    { id: 'volunteers', label: 'Voluntários', icon: Coffee },
  ]

  return <div className="animate-in space-y-4 text-[#2B2118] sm:space-y-5">
    <div role="status" className="rounded-lg border border-[#E8DED4] bg-[#F8F2EC] px-3 py-2.5 text-xs leading-5 text-[#6F4F28]"><strong>Demonstração local.</strong> Os nomes, convites e indicadores abaixo são exemplos fictícios; nada é consultado ou gravado no Supabase.</div>
    {role === 'team' && <div role="status" className="rounded-lg border border-[#E8DED4] bg-white px-3 py-2 text-xs text-[#5C5147]">Acesso de visualização: a equipe pode consultar esta tela, mas não criar nem alterar dados do Projeto Pertencer.</div>}

    <header className="flex flex-col justify-between gap-4 rounded-2xl border border-[#E8DED4] bg-[linear-gradient(110deg,#fff_0%,#fff_72%,#F3E9DF_100%)] p-5 shadow-[0_3px_14px_rgba(60,42,28,.035)] sm:flex-row sm:items-center sm:px-7 sm:py-6">
      <div><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3E9DF] px-3 py-1.5 text-xs font-semibold text-[#6F4F28]"><Coffee size={13}/>MÓDULO PERTENCER</span><span className="text-xs text-[#75675D]">· Demonstração local</span></div><h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#2B2118] sm:text-3xl">Projeto Pertencer</h1><p className="mt-1 text-sm text-[#75675D]">Café de integração e fraternidade</p></div>
      <div className="flex items-center gap-3 rounded-xl border border-[#E8DED4] bg-white/90 p-3 sm:min-w-[220px]"><span className="grid size-11 place-items-center rounded-xl bg-[#F3E9DF] text-[#9B5C42]"><CalendarDays size={19}/></span><div><p className="text-xs text-[#75675D]">Próxima edição</p><p className="mt-1 text-sm font-semibold">Data a definir</p></div></div>
    </header>

    <section className="rounded-2xl border border-[#D9C8B7] bg-white p-4 shadow-[0_3px_14px_rgba(60,42,28,.035)] sm:p-6">
      <div className="flex flex-col justify-between gap-3 border-b border-[#E8DED4] pb-4 sm:flex-row sm:items-start"><div><p className="flex items-center gap-2 text-xs font-medium text-[#6F4F28]"><CalendarDays size={15}/>Edição de demonstração</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Próximo Café: edição ainda não agendada</h2></div><button type="button" disabled title="Cadastro de encontros será implementado em uma etapa futura" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#D9C8B7] bg-[#FBF8F4] px-4 text-sm font-medium text-[#75675D] opacity-70"><CalendarDays size={16}/>Novo Encontro</button></div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4 sm:gap-3">
        <MetricCard icon={UsersRound} label="Convidados totais" value="5 exemplos" tone="neutral"/>
        <MetricCard icon={CheckCircle2} label="Presenças garantidas" value="3 confirmados" tone="success"/>
        <MetricCard icon={Clock3} label="Aguardando resposta" value="1 aguardando" tone="waiting"/>
        <MetricCard icon={XCircle} label="Ausência notificada" value="1 justificada" tone="alert"/>
      </div>
    </section>

    <nav aria-label="Seções do Projeto Pertencer" className="flex gap-1 overflow-x-auto rounded-xl border border-[#D9C8B7] bg-[#F3E9DF] p-1">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)} className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:flex-1 sm:text-sm ${activeTab === id ? 'bg-white text-[#6F4F28] shadow-sm' : 'text-[#5C5147] hover:bg-white/60'}`}><Icon size={15}/><span>{label}</span></button>)}
    </nav>

    {activeTab === 'guests' && <div className="flex flex-col gap-2 rounded-xl border border-[#E8DED4] bg-white p-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4"><div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 text-xs"><span className="shrink-0 text-[#75675D]">Filtro rápido:</span>{(['all', 'confirmed', 'awaiting', 'absence'] as QuickFilter[]).map(value => <button key={value} type="button" aria-pressed={quickFilter === value} onClick={() => setQuickFilter(value)} className={`shrink-0 rounded-full px-3 py-1.5 font-medium ${quickFilter === value ? 'bg-[#E7D7C8] text-[#5C3F20]' : 'bg-[#F8F2EC] text-[#75675D]'}`}>{value === 'all' ? `Todos (${filteredCount('all')})` : `${confirmationLabels[value]} (${filteredCount(value)})`}</button>)}</div></div>}

    {activeTab === 'guests' ? <>
      <section className="overflow-hidden rounded-2xl border border-[#D9C8B7] bg-white shadow-[0_3px_14px_rgba(60,42,28,.035)]">
        <div className="border-b border-[#E8DED4] p-3.5 sm:px-4">
          <label className="relative block w-full sm:max-w-[290px]"><span className="sr-only">Buscar por nome ou contato</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#75675D]"/><input className="h-10 w-full rounded-xl border border-[#D9C8B7] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#A67B5B]" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome ou contato..."/></label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left text-sm">
            <thead className="bg-[#F8F2EC] text-xs font-semibold text-[#5C5147]"><tr><th className="px-4 py-3">Nome do convidado</th><th className="px-3 py-3">Decisão &amp; data</th><th className="px-3 py-3">Confirmação</th><th className="px-3 py-3">Check-in domingo</th><th className="px-4 py-3">Próximo passo pós-café</th></tr></thead>
            <tbody>{filteredInvitations.map(invitation => <tr key={invitation.id} className="border-t border-[#E8DED4] align-middle"><td className="px-4 py-3"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F3E9DF] text-xs font-semibold text-[#6F4F28]">{invitation.name.split(' ').slice(-1)[0].slice(-2).toUpperCase()}</span><div><p className="font-semibold">{invitation.name}</p><p className="mt-0.5 text-xs text-[#75675D]">{invitation.phone}</p></div></div></td><td className="px-3 py-3"><span className="font-medium text-[#6F4F28]">{invitation.decision}</span><p className="mt-0.5 text-xs text-[#75675D]">{invitation.decisionDate}</p></td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${invitation.confirmation === 'confirmed' ? 'bg-[#F3E9DF] text-[#6F4F28]' : invitation.confirmation === 'awaiting' ? 'bg-[#FBF1EA] text-[#9B5C42]' : 'bg-[#F0ECE6] text-[#75675D]'}`}>{invitation.confirmation === 'confirmed' && <Check size={12} className="mr-1 inline"/>}{confirmationLabels[invitation.confirmation]}</span></td><td className="px-3 py-3">{invitation.attended === true ? <span className="inline-flex items-center gap-2 font-medium text-[#6F4F28]"><CheckCircle2 size={16}/>Presente</span> : invitation.attended === false ? <span className="text-xs text-[#75675D]">Ausente justificado</span> : <span className="text-xs text-[#75675D]">Aguardando</span>}</td><td className="px-4 py-3"><span className="inline-flex max-w-[210px] items-center gap-1.5 rounded-lg bg-[#F8F2EC] px-2.5 py-1.5 text-xs text-[#5C5147]"><UsersRound size={13}/>{invitation.nextStep}</span></td></tr>)}</tbody>
          </table>
          {filteredInvitations.length === 0 && <p className="px-5 py-10 text-center text-sm text-[#75675D]">Nenhum registro de demonstração corresponde à busca.</p>}
        </div>
        <div className="flex flex-col gap-2 border-t border-[#E8DED4] bg-[#FBF8F4] px-4 py-3 text-xs text-[#75675D] sm:flex-row sm:items-center sm:justify-between"><span>Exibindo {filteredInvitations.length} de {demoInvitations.length} convidados fictícios</span><span className="inline-flex items-center gap-1 self-end sm:self-auto"><button type="button" disabled className="rounded-md bg-white px-2.5 py-1.5 opacity-50">Anterior</button><span className="rounded-md bg-[#6F4F28] px-2.5 py-1.5 font-semibold text-white">1</span><button type="button" disabled className="rounded-md bg-white px-2.5 py-1.5 opacity-50">Próximo</button></span></div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,1fr)]">
        <section className="rounded-2xl border border-[#D9C8B7] bg-white p-4 sm:p-5"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-semibold"><span className="grid size-8 place-items-center rounded-lg bg-[#F3E9DF] text-[#6F4F28]"><ChartNoAxesColumnIncreasing size={17}/></span>Acompanhamento pós-café</h2><span className="rounded-full bg-[#F3E9DF] px-2.5 py-1 text-xs text-[#6F4F28]">Trimestral · exemplo</span></div><div className="mt-4 flex items-center gap-4 rounded-xl border border-[#E8DED4] bg-[#F8F2EC] p-4"><div className="grid size-16 shrink-0 place-items-center rounded-full border-[5px] border-[#6F4F28] text-base font-bold text-[#6F4F28]">60%</div><div><p className="text-sm font-semibold">Conexão ativa (demonstração)</p><p className="mt-1 text-xs leading-5 text-[#75675D]">3 de 5 pessoas fictícias seguiram para um próximo passo após o café.</p></div></div><div className="mt-4 space-y-3"><Progress label="Encaminhadas a pequeno grupo" value={60}/><Progress label="Inscritas em curso de batismo" value={40} tone="mocha"/></div></section>

      </div>
    </> : <section className="empty-panel min-h-[260px]"><span className="empty-icon"><ClipboardList size={22}/></span><h2 className="mt-4 text-lg font-semibold">{tabs.find(tab => tab.id === activeTab)?.label}</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#75675D]">A estrutura desta seção está preparada. Seu conteúdo será desenvolvido em uma próxima etapa.</p></section>}
  </div>

  function filteredCount(filter: QuickFilter) {
    return filter === 'all' ? demoInvitations.length : demoInvitations.filter(item => item.confirmation === filter).length
  }
}

function Progress({ label, value, tone = 'cafe' }: { label: string; value: number; tone?: 'cafe' | 'mocha' }) {
  return <div><div className="mb-1 flex items-center justify-between text-xs"><span>{label}</span><strong className={tone === 'mocha' ? 'text-[#9B5C42]' : 'text-[#6F4F28]'}>{value}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-[#F0ECE6]"><div className={`h-full rounded-full ${tone === 'mocha' ? 'bg-[#9B5C42]' : 'bg-[#6F4F28]'}`} style={{ width: `${value}%` }}/></div></div>
}
