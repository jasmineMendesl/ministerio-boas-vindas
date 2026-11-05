import { useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Check, CheckCircle2, Clock3, Heart, HeartHandshake, History, MessageCircle, Search, Share2, Sparkles, UsersRound, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { addDecision, createDemoDecisions, filterDecisions, recordContact, type DecisionRecord, type DecisionType, type FollowUpStatus } from './decision-data'
import { createDemoVisitors } from '../visitors/visitor-data'

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const statusLabels: Record<FollowUpStatus, string> = {
  awaiting_first_contact: 'Aguardando primeiro contato', contact_made: 'Contato realizado',
  awaiting_response: 'Aguardando resposta', responded: 'Respondeu', unable_to_contact: 'Não foi possível contatar',
}
const decisionLabels: Record<DecisionType, string> = { acceptance: 'Aceitação de Jesus', reconciliation: 'Reconciliação' }
const formatDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { dateStyle: 'medium' })
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('55') && digits.length === 13 ? `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}` : value
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('pt-BR')

function Metric({ icon: Icon, label, value, helper, tone = 'green' }: { icon: typeof UsersRound; label: string; value: number; helper: string; tone?: 'green' | 'amber' | 'sage' }) {
  const tones = {
    green: 'bg-[#e9f1eb] text-[#416b52]',
    amber: 'bg-[#fbefe3] text-[#a45d1b]',
    sage: 'bg-[#e7f1e8] text-[#548365]',
  }
  return <article className="rounded-2xl border border-[#e8e9e3] bg-white p-3.5 shadow-[0_3px_12px_rgba(43,58,45,.035)] sm:p-4"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-medium text-[#59645a] sm:text-[11px]">{label}</p><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><Icon size={15}/></span></div><div className="mt-2 flex items-baseline gap-2"><p className="text-[27px] font-semibold leading-8 tracking-tight text-[#26342b]">{value}</p><p className="text-[9px] text-[#738074]">{helper}</p></div></article>
}

function Choice({ value, selected, onSelect, title, subtitle }: { value: string; selected: boolean; onSelect: (value: string) => void; title: string; subtitle?: string }) {
  return <button type="button" aria-pressed={selected} onClick={() => onSelect(value)} className={`flex min-h-10 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${selected ? 'border-[#9db8a2] bg-[#eaf2ec] text-[#365c45]' : 'border-[#e8e9e3] bg-white text-[#505a51] hover:border-[#cbd6cb]'}`}><span className={`grid size-3.5 shrink-0 place-items-center rounded-full border ${selected ? 'border-[#427454]' : 'border-[#aab1a9]'}`}>{selected && <span className="size-1.5 rounded-full bg-[#427454]"/>}</span><span className="min-w-0"><span className="block text-[9px] font-semibold leading-4">{title}</span>{subtitle && <span className="block text-[8px] leading-3 text-[#788178]">{subtitle}</span>}</span></button>
}

function statusTone(status: FollowUpStatus) {
  if (status === 'awaiting_first_contact') return 'bg-[#e7f2e9] text-[#3d704b]'
  if (status === 'contact_made' || status === 'responded') return 'bg-[#e8eef2] text-[#476777]'
  if (status === 'unable_to_contact') return 'bg-[#f5ebe3] text-[#9c5d2b]'
  return 'bg-[#fbefe3] text-[#9b672f]'
}

export function DecisionsPage() {
  const [records, setRecords] = useState(() => createDemoDecisions())
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(0)
  const [year, setYear] = useState(new Date().getFullYear())
  const [type, setType] = useState<DecisionType | 'all'>('all')
  const [status, setStatus] = useState<FollowUpStatus | 'all'>('all')
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)
  const [contactTarget, setContactTarget] = useState<DecisionRecord | null>(null)
  const [contactNote, setContactNote] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [newType, setNewType] = useState<DecisionType>('acceptance')
  const [baptized, setBaptized] = useState('false')
  const [interestedInBaptism, setInterestedInBaptism] = useState('true')
  const [acceptsMessages, setAcceptsMessages] = useState('true')
  const [decidedOn, setDecidedOn] = useState(new Date().toISOString().slice(0, 10))
  const [observations, setObservations] = useState('')

  const filtered = filterDecisions(records, search, month, year, type, status)
  const recent = useMemo(() => [...filtered].sort((a, b) => b.decidedOn.localeCompare(a.decidedOn)), [filtered])
  const currentYear = new Date().getFullYear()
  const yearRecords = records.filter(record => Number(record.decidedOn.slice(0, 4)) === currentYear)
  const currentMonthRecords = yearRecords.filter(record => Number(record.decidedOn.slice(5, 7)) === new Date().getMonth() + 1)
  const interestedPeople = new Set(records.filter(record => record.interestedInBaptism).map(record => record.personId)).size
  const peopleHistory = selectedPerson ? records.filter(record => record.personId === selectedPerson).sort((a, b) => b.decidedOn.localeCompare(a.decidedOn)) : []
  const years = Array.from(new Set([currentYear, ...records.map(record => Number(record.decidedOn.slice(0, 4)))] )).sort((a, b) => b - a)
  const statusCounts = (value: FollowUpStatus | 'all') => value === 'all' ? records.length : records.filter(record => record.followUp.status === value).length

  function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const result = addDecision(records, {
      fullName: name, phone, type: newType, baptized: baptized === 'true', interestedInBaptism: interestedInBaptism === 'true',
      acceptsMessages: acceptsMessages === 'true', decidedOn, observations,
    }, new Date(), undefined, createDemoVisitors())
    if (!result.ok) {
      setError(result.error === 'name' ? 'Informe o nome completo.' : result.error === 'phone' ? 'Confira o telefone e inclua o DDD.' : result.error === 'date' ? 'Informe uma data válida, que não seja futura.' : 'As observações excedem o limite de 4.000 caracteres.')
      return
    }
    setRecords(result.records)
    setNotice(result.personReused ? 'A pessoa já estava nesta demonstração; a decisão foi adicionada ao histórico.' : 'Decisão e acompanhamento inicial adicionados à demonstração.')
    setName(''); setPhone(''); setObservations(''); setNewType('acceptance'); setBaptized('false'); setInterestedInBaptism('true'); setAcceptsMessages('true'); setDecidedOn(new Date().toISOString().slice(0, 10))
  }

  function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!contactTarget) return
    setRecords(current => recordContact(current, contactTarget.id, contactNote))
    setNotice('Contato registrado na demonstração; nenhum convite ao Projeto Pertencer foi criado.')
    setContactTarget(null); setContactNote('')
  }

  async function shareScreen() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNotice('Link desta tela copiado.')
    } catch {
      setNotice('Copie o endereço desta página pela barra do navegador.')
    }
  }

  function focusRegistration() {
    const target = document.getElementById('decision-registration-form')
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    document.getElementById('decision-name')?.focus({ preventScroll: true })
  }

  const statusChips: Array<{ value: FollowUpStatus | 'all'; label: string; icon?: typeof Clock3; className: string }> = [
    { value: 'all', label: 'Todas', className: 'bg-[#416b52] text-white' },
    { value: 'awaiting_first_contact', label: 'Aguardando primeiro contato', icon: Clock3, className: 'bg-[#e9f2eb] text-[#477251]' },
    { value: 'contact_made', label: 'Contato realizado', icon: CheckCircle2, className: 'bg-[#ecefeb] text-[#68746a]' },
    { value: 'awaiting_response', label: 'Aguardando resposta', icon: Clock3, className: 'bg-[#fbefe3] text-[#9a642c]' },
  ]

  return <div className="animate-in space-y-4 text-[#26332a] sm:space-y-5">
    <header className="rounded-2xl border border-[#e8e9e3] bg-[linear-gradient(110deg,#fff_0%,#fff_72%,#eef5ee_100%)] px-4 py-4 shadow-[0_4px_18px_rgba(43,58,45,.04)] sm:px-6 sm:py-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#e0eee3] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-wide text-[#436a4d]">✦ Módulo pastoral</span><span className="text-[9px] text-[#858c83]">· Demonstração local</span></div><h1 className="text-[24px] font-semibold leading-tight tracking-[-.035em] sm:text-[29px]">Decisões de Fé e Vidas Transformadas</h1><p className="mt-1.5 text-[10px] italic leading-5 text-[#69766b]">“Digo-vos que assim haverá alegria no céu por um pecador que se arrepende.” <span className="not-italic">— Lucas 15:7</span></p></div><div className="flex shrink-0 items-center gap-2"><Button onClick={focusRegistration} size="sm" className="h-9 rounded-lg bg-[#3d684f] px-3 text-[10px] sm:h-10 sm:px-4 sm:text-xs"><Heart size={14} fill="currentColor"/> Registrar Nova Decisão</Button><Button type="button" variant="outline" size="icon" onClick={shareScreen} aria-label="Copiar link da tela" title="Copiar link desta tela" className="size-9 rounded-lg bg-white sm:size-10"><Share2 size={14}/></Button></div></div>
    </header>

    {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-[#e4e8e0] bg-white px-3 py-2.5 text-xs"><span>{notice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={14}/></button></div>}
    <div role="status" className="flex items-center gap-2 rounded-xl border border-[#dce7da] bg-[#eff5ec] px-3 py-2 text-[10px] text-[#42624a]"><Check size={13}/><span><strong>Dados fictícios.</strong> Registros e alterações ficam na memória da página; não há leitura ou gravação no Supabase.</span></div>

    <section aria-label="Indicadores anuais de decisões" className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
      <Metric icon={UsersRound} label="Total de Decisões no Ano" value={yearRecords.length} helper={`+${currentMonthRecords.length} neste mês`} tone="sage"/>
      <Metric icon={Heart} label="Aceitações de Jesus" value={yearRecords.filter(record => record.type === 'acceptance').length} helper="Novas decisões" tone="green"/>
      <Metric icon={Sparkles} label="Reconciliações" value={yearRecords.filter(record => record.type === 'reconciliation').length} helper="Retorno aos caminhos" tone="amber"/>
      <Metric icon={CheckCircle2} label="Interesse em Batismo" value={interestedPeople} helper="Pessoas interessadas" tone="sage"/>
    </section>

    <section aria-label="Pesquisa e filtros das decisões" className="rounded-2xl border border-[#e8e9e3] bg-white p-3 shadow-[0_3px_12px_rgba(43,58,45,.035)] sm:p-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(105px,145px))]">
        <label className="relative block"><span className="sr-only">Buscar por nome ou telefone</span><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#79847a]"/><input className="h-9 w-full rounded-lg border border-[#e4e6df] bg-[#f7f7f3] pl-9 pr-3 text-[10px] outline-none focus:border-[#93aa95]" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou telefone..."/></label>
        <label className="sr-only" htmlFor="decision-month">Filtrar por mês</label><select id="decision-month" className="h-9 rounded-lg border border-[#e4e6df] bg-white px-2.5 text-[10px]" value={month} onChange={event => setMonth(Number(event.target.value))}><option value={0}>Todos os meses</option>{months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select>
        <label className="sr-only" htmlFor="decision-year">Filtrar por ano</label><select id="decision-year" className="h-9 rounded-lg border border-[#e4e6df] bg-white px-2.5 text-[10px]" value={year} onChange={event => setYear(Number(event.target.value))}><option value={0}>Todos os anos</option>{years.map(item => <option key={item} value={item}>{item}</option>)}</select>
        <label className="sr-only" htmlFor="decision-type">Filtrar por tipo de decisão</label><select id="decision-type" className="h-9 rounded-lg border border-[#e4e6df] bg-white px-2.5 text-[10px]" value={type} onChange={event => setType(event.target.value as DecisionType | 'all')}><option value="all">Todos os tipos</option><option value="acceptance">Aceitação</option><option value="reconciliation">Reconciliação</option></select>
      </div>
      <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Filtrar por situação do acompanhamento">{statusChips.map(chip => { const Icon = chip.icon; return <button key={chip.value} type="button" aria-pressed={status === chip.value} onClick={() => setStatus(chip.value)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-medium transition-colors ${status === chip.value ? chip.className : 'bg-[#f0f0ec] text-[#626a62] hover:bg-[#e8ebe5]'}`}>{Icon && <Icon size={11}/>} {chip.label} ({statusCounts(chip.value)})</button> })}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{status === 'all' && Object.entries(statusLabels).filter(([key]) => !statusChips.some(chip => chip.value === key)).map(([key, label]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key as FollowUpStatus)} className="rounded-full bg-[#f0f0ec] px-2.5 py-1 text-[8px] text-[#626a62] hover:bg-[#e8ebe5]">{label} ({statusCounts(key as FollowUpStatus)})</button>)}</div>
    </section>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(315px,.9fr)] xl:gap-5">
      <section aria-labelledby="recent-decisions-title" className="min-w-0">
        <div className="mb-2.5 flex items-center justify-between gap-3"><h2 id="recent-decisions-title" className="text-[13px] font-semibold">Decisões Registradas Recentemente</h2><span className="text-[9px] text-[#778078]">Mostrando {recent.length} de {records.length}</span></div>
        <div className="space-y-2.5">
          {recent.map(record => <article key={record.id} className="rounded-2xl border border-[#e8e9e3] bg-white p-3.5 shadow-[0_4px_14px_rgba(43,58,45,.035)] sm:p-4">
            <div className="flex items-start gap-2.5"><span className={`grid size-9 shrink-0 place-items-center rounded-xl text-[10px] font-semibold ${record.type === 'acceptance' ? 'bg-[#e7f1e9] text-[#416d51]' : 'bg-[#fbede0] text-[#a75e21]'}`}>{initials(record.personName)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><button type="button" onClick={() => setSelectedPerson(record.personId)} className="text-left text-[11px] font-semibold text-[#26332a] hover:underline">{record.personName}</button><span className={`rounded-full px-2 py-0.5 text-[8px] font-medium ${record.type === 'acceptance' ? 'bg-[#eaf2ec] text-[#416d51]' : 'bg-[#fbefe3] text-[#a15f2c]'}`}>{decisionLabels[record.type]}</span><span className={`rounded-full px-2 py-0.5 text-[8px] font-medium ${statusTone(record.followUp.status)}`}>{statusLabels[record.followUp.status]}</span></div><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[#69746b]"><span className="inline-flex items-center gap-1"><CalendarDays size={10}/>{record.type === 'acceptance' ? 'Aceitou' : 'Reconciliação'} em {formatDate(record.decidedOn)}</span><span className="inline-flex items-center gap-1"><MessageCircle size={10}/>{formatPhone(record.phoneNormalized)}</span></div></div></div>
            <div className="mt-2.5 grid gap-2 rounded-xl border border-[#eeeee8] bg-[#f7f6f2] p-2.5 sm:grid-cols-2"><div><p className="text-[8px] text-[#768076]">Batismo nas águas</p><p className="mt-1 inline-flex items-center gap-1 text-[9px] font-medium"><span className="text-[#55745b]">◉</span>{record.baptized ? 'Já batizada' : 'Ainda não batizada'}</p></div><div><p className="text-[8px] text-[#768076]">Interesse em se batizar</p><p className="mt-1 inline-flex items-center gap-1 text-[9px] font-medium"><span className="text-[#55745b]">◉</span>{record.interestedInBaptism ? 'Sim, tem interesse' : 'Não no momento'}</p></div><div className="sm:col-span-2"><p className="text-[8px] text-[#768076]">Acolhido por</p><p className="mt-1 text-[9px] font-medium">{record.welcomedBy}</p></div></div>
            {record.observations && <p className="mt-2 text-[9px] leading-4 text-[#737c73]">{record.observations}</p>}
            <div className="mt-2.5 flex flex-wrap items-center gap-2"><Button type="button" size="sm" onClick={() => setContactTarget(record)} className="h-7 rounded-lg bg-[#3d684f] px-2.5 text-[9px]"><MessageCircle size={11}/> Registrar contato</Button><button type="button" onClick={() => setSelectedPerson(record.personId)} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[9px] font-medium text-[#647064] hover:bg-[#f1f2ed]"><History size={11}/> Histórico</button><span className="ml-auto text-[8px] text-[#778078]">{record.acceptsMessages ? 'Aceita mensagem' : 'Não autorizou mensagem'}</span></div>
          </article>)}
          {recent.length === 0 && <div className="rounded-2xl border border-dashed border-[#dfe3dc] bg-white px-5 py-10 text-center"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-[#edf3ee] text-[#4c7157]"><Search size={17}/></span><h3 className="mt-3 text-sm font-semibold">Nenhuma decisão encontrada</h3><p className="mt-1 text-[10px] text-[#778078]">Ajuste a pesquisa ou os filtros.</p></div>}
        </div>
      </section>

      <section id="decision-registration-form" aria-labelledby="decision-form-title" className="rounded-2xl border border-[#e8e9e3] bg-white p-3.5 shadow-[0_4px_14px_rgba(43,58,45,.04)] sm:p-4">
        <div className="mb-3 flex items-start justify-between gap-2 border-b border-[#eeeeea] pb-3"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-[#eaf2ec] text-[#477252]"><HeartHandshake size={15}/></span><div><h2 id="decision-form-title" className="text-[12px] font-semibold">Registrar Nova Decisão</h2><p className="text-[8px] text-[#798279]">Cadastro imediato de altar / culto</p></div></div><span className="rounded bg-[#f0f0ec] px-2 py-1 text-[8px] text-[#707970]">Formulário Ágil</span></div>
        <form onSubmit={submitDecision} className="space-y-2.5">
          <label className="block text-[9px] font-medium">Nome Completo <span className="text-red-600">*</span><input id="decision-name" className="form-input mt-1 h-9 rounded-lg text-[10px]" autoComplete="name" maxLength={120} required value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Lucas Gabriel da Silva"/></label>
          <div className="grid grid-cols-2 gap-2"><label className="block text-[9px] font-medium">WhatsApp <span className="text-red-600">*</span><input className="form-input mt-1 h-9 rounded-lg text-[10px]" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} required value={phone} onChange={event => setPhone(event.target.value)} placeholder="(11) 90000-0000"/></label><label className="block text-[9px] font-medium">Data da Decisão <span className="text-red-600">*</span><input className="form-input mt-1 h-9 rounded-lg px-2 text-[10px]" type="date" required max={new Date().toISOString().slice(0, 10)} value={decidedOn} onChange={event => setDecidedOn(event.target.value)}/></label></div>
          <fieldset><legend className="mb-1 text-[9px] font-medium">Tipo de Decisão Espiritual <span className="text-red-600">*</span></legend><div className="flex gap-1.5"><Choice value="acceptance" selected={newType === 'acceptance'} onSelect={value => setNewType(value as DecisionType)} title="Aceitação" subtitle="1ª vez com Jesus"/><Choice value="reconciliation" selected={newType === 'reconciliation'} onSelect={value => setNewType(value as DecisionType)} title="Reconciliação" subtitle="Retorno à igreja"/></div></fieldset>
          <fieldset><legend className="mb-1 text-[9px] font-medium">Já é batizado(a) nas águas?</legend><div className="flex gap-1.5 rounded-lg bg-[#f3f2ed] p-1"><Choice value="true" selected={baptized === 'true'} onSelect={setBaptized} title="Sim, já batizado(a)"/><Choice value="false" selected={baptized === 'false'} onSelect={setBaptized} title="Não"/></div></fieldset>
          <fieldset><legend className="mb-1 text-[9px] font-medium">Tem interesse em se batizar?</legend><div className="flex gap-1.5 rounded-lg bg-[#f3f2ed] p-1"><Choice value="true" selected={interestedInBaptism === 'true'} onSelect={setInterestedInBaptism} title="Sim, tem interesse"/><Choice value="false" selected={interestedInBaptism === 'false'} onSelect={setInterestedInBaptism} title="Não no momento"/></div></fieldset>
          <fieldset><legend className="mb-1 text-[9px] font-medium">Aceita receber mensagem da igreja?</legend><div className="flex gap-1.5 rounded-lg bg-[#f3f2ed] p-1"><Choice value="true" selected={acceptsMessages === 'true'} onSelect={setAcceptsMessages} title="Sim, aceita receber"/><Choice value="false" selected={acceptsMessages === 'false'} onSelect={setAcceptsMessages} title="Não deseja receber"/></div></fieldset>
          <label className="block text-[9px] font-medium">Pedido de Oração ou Observação Pastoral<textarea className="form-input form-textarea mt-1 min-h-[62px] rounded-lg text-[10px]" maxLength={4000} value={observations} onChange={event => setObservations(event.target.value)} placeholder="Ex.: Motivo de saúde na família, libertação, buscando direcionamento profissional..."/></label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-2.5 py-2 text-[9px] text-red-700">{error}</p>}
          <Button type="submit" className="h-9 w-full rounded-lg bg-[#3d684f] text-[10px]">Registrar decisão</Button>
        </form>
        <p className="mt-2 text-[8px] leading-4 text-[#7b837b]">Interesse, consentimento e acolhedor são informações temporárias desta demonstração; a integração requer campos e permissões Supabase.</p>
      </section>
    </div>

    {contactTarget && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="contact-form-title" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-primary">Acompanhamento fictício</p><h2 id="contact-form-title" className="mt-1 text-base font-semibold">Registrar contato</h2><p className="mt-1 text-[10px] text-muted">{contactTarget.personName} · {decisionLabels[contactTarget.type]}</p></div><button type="button" aria-label="Fechar formulário de contato" onClick={() => setContactTarget(null)} className="rounded-lg p-2 text-muted hover:bg-[#f6f7f3]"><X size={16}/></button></div><form className="space-y-3" onSubmit={submitContact}><label className="block text-[10px] font-medium">Observações do contato<textarea className="form-input form-textarea mt-1 min-h-[95px] rounded-lg text-xs" maxLength={4000} value={contactNote} onChange={event => setContactNote(event.target.value)} placeholder="Anote o resultado do contato"/></label><p className="rounded-lg bg-[#eef1e9] p-2.5 text-[9px] leading-4 text-[#354c38]">O acompanhamento será atualizado. Nenhum convite ao Projeto Pertencer será criado nesta etapa.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setContactTarget(null)}>Cancelar</Button><Button type="submit" size="sm"><MessageCircle size={13}/> Salvar contato</Button></div></form></section></div>}

    {selectedPerson && peopleHistory.length > 0 && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedPerson(null) }}><section role="dialog" aria-modal="true" aria-labelledby="decision-history-title" className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-primary">Histórico individual · demonstração</p><h2 id="decision-history-title" className="mt-1 text-lg font-semibold">{peopleHistory[0].personName}</h2><p className="mt-1 text-xs text-muted">{formatPhone(peopleHistory[0].phoneNormalized)}</p></div><button type="button" aria-label="Fechar histórico" onClick={() => setSelectedPerson(null)} className="rounded-lg p-2 text-muted hover:bg-[#f6f7f3]"><X size={16}/></button></div><ol className="mt-4 space-y-2.5">{peopleHistory.map(record => <li key={record.id} className="rounded-xl border border-[#e8e9e3] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold">{decisionLabels[record.type]} · {formatDate(record.decidedOn)}</span><span className={`rounded-full px-2 py-1 text-[8px] ${statusTone(record.followUp.status)}`}>{statusLabels[record.followUp.status]}</span></div><p className="mt-1.5 text-[9px] text-[#69746b]">{record.baptized ? 'Batizada' : 'Não batizada'} · {record.interestedInBaptism ? 'Tem interesse em batismo' : 'Sem interesse neste momento'}</p>{record.observations && <p className="mt-2 text-[10px] text-muted">{record.observations}</p>}{record.followUp.contacts.length > 0 && <ul className="mt-2 space-y-1 border-l border-[#dce5dd] pl-2.5">{record.followUp.contacts.map(contact => <li key={contact.id} className="text-[9px] text-muted"><span className="font-medium text-foreground">{new Date(contact.contactedAt).toLocaleString('pt-BR')}</span>{contact.observations && ` · ${contact.observations}`}</li>)}</ul>}</li>)}</ol></section></div>}
  </div>
}
