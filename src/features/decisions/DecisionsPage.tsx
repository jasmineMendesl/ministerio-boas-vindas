import { useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Check, Clock3, HeartHandshake, History, MessageCircle, Plus, Search, UserRound, UsersRound, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { addDecision, createDemoDecisions, filterDecisions, recordContact, type DecisionRecord, type DecisionType, type FollowUpStatus } from './decision-data'
import { createDemoVisitors } from '../visitors/visitor-data'

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const statusLabels: Record<FollowUpStatus, string> = {
  awaiting_first_contact: 'Aguardando primeiro contato', contact_made: 'Contato realizado',
  awaiting_response: 'Aguardando resposta', responded: 'Respondeu', unable_to_contact: 'Não foi possível contatar',
}
const decisionLabels: Record<DecisionType, string> = { acceptance: 'Aceitação', reconciliation: 'Reconciliação' }
const formatDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { dateStyle: 'medium' })
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('55') && digits.length === 13 ? `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}` : value
}

function Metric({ icon: Icon, label, value, helper }: { icon: typeof UsersRound; label: string; value: number; helper: string }) {
  return <article className="panel flex min-w-0 items-start gap-4 p-4 sm:p-5"><div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#eef1e9] text-primary"><Icon size={19} strokeWidth={1.8} /></div><div className="min-w-0"><p className="text-xs font-medium text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-[11px] text-muted">{helper}</p></div></article>
}

export function DecisionsPage() {
  const [records, setRecords] = useState(() => createDemoDecisions())
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [type, setType] = useState<DecisionType | 'all'>('all')
  const [status, setStatus] = useState<FollowUpStatus | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)
  const [contactTarget, setContactTarget] = useState<DecisionRecord | null>(null)
  const [contactNote, setContactNote] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [newType, setNewType] = useState<DecisionType>('acceptance')
  const [baptized, setBaptized] = useState('false')
  const [decidedOn, setDecidedOn] = useState(new Date().toISOString().slice(0, 10))
  const [observations, setObservations] = useState('')

  const filtered = filterDecisions(records, search, month, year, type, status)
  const dateFiltered = useMemo(() => records.filter(record => {
    const date = new Date(`${record.decidedOn}T12:00:00`)
    return (month === 0 || date.getMonth() + 1 === month) && (year === 0 || date.getFullYear() === year)
  }), [records, month, year])
  const awaiting = new Set(records.filter(record => record.followUp.status === 'awaiting_first_contact').map(record => record.personId)).size
  const contacted = records.reduce((total, record) => total + record.followUp.contacts.length, 0)
  const peopleHistory = selectedPerson ? records.filter(record => record.personId === selectedPerson).sort((a, b) => b.decidedOn.localeCompare(a.decidedOn)) : []
  const years = Array.from(new Set([new Date().getFullYear(), ...records.map(record => Number(record.decidedOn.slice(0, 4)))] )).sort((a, b) => b - a)

  function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const result = addDecision(records, { fullName: name, phone, type: newType, baptized: baptized === 'true', decidedOn, observations }, new Date(), undefined, createDemoVisitors())
    if (!result.ok) {
      setError(result.error === 'name' ? 'Informe o nome completo.' : result.error === 'phone' ? 'Confira o telefone e inclua o DDD.' : result.error === 'date' ? 'Informe uma data válida, que não seja futura.' : 'As observações excedem o limite de 4.000 caracteres.')
      return
    }
    setRecords(result.records)
    setNotice(result.personReused ? 'A pessoa já estava nesta demonstração; a nova decisão foi adicionada ao histórico individual.' : 'Decisão e pendência de primeiro contato adicionadas à demonstração.')
    setName(''); setPhone(''); setObservations(''); setNewType('acceptance'); setBaptized('false'); setDecidedOn(new Date().toISOString().slice(0, 10)); setShowForm(false)
  }

  function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!contactTarget) return
    setRecords(current => recordContact(current, contactTarget.id, contactNote))
    setNotice('Contato registrado na demonstração; nenhum convite ao Projeto Pertencer foi criado.')
    setContactTarget(null); setContactNote('')
  }

  return <div className="animate-in space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.17em] text-primary">Cuidado e fé</p><h1 className="text-3xl font-semibold tracking-tight sm:text-[34px]">Aceitações / Reconciliações</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted">Cada decisão tem seu próprio registro e acompanhamento, preservando o histórico da pessoa.</p></div><Button onClick={() => { setError(''); setShowForm(true) }}><Plus size={17} /> Registrar decisão</Button></header>

    <div role="status" className="flex items-start gap-3 rounded-2xl border border-[#d6dfc4] bg-[#eef1e9] px-4 py-3 text-sm text-[#354c38]"><span className="mt-0.5 rounded-full bg-white p-1 text-primary"><Check size={14} /></span><p><strong>Demonstração fictícia.</strong> Os registros exibidos e as alterações ficam somente na memória desta página. Nenhum dado pessoal é consultado ou gravado no Supabase.</p></div>
    {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground"><span>{notice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={16} /></button></div>}

    <section aria-label="Indicadores de decisões" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={CalendarDays} label="Decisões no período" value={dateFiltered.length} helper="Registros no intervalo selecionado" />
      <Metric icon={HeartHandshake} label="Aceitações de Jesus" value={dateFiltered.filter(record => record.type === 'acceptance').length} helper="Decisões no período" />
      <Metric icon={UsersRound} label="Reconciliações" value={dateFiltered.filter(record => record.type === 'reconciliation').length} helper="Decisões no período" />
      <Metric icon={Clock3} label="Pessoas aguardando primeiro contato" value={awaiting} helper="Pessoas com pendência aberta" />
      <Metric icon={MessageCircle} label="Contatos realizados" value={contacted} helper="Registros de contato na demonstração" />
    </section>

    <section aria-labelledby="decisions-list-title" className="min-w-0">
      <div className="mb-4 flex flex-col gap-3"><div><h2 id="decisions-list-title" className="text-lg font-semibold">Registros de decisão</h2><p className="mt-1 text-xs text-muted">{filtered.length} {filtered.length === 1 ? 'registro' : 'registros'} encontrados · pendências não criam convites automaticamente</p></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(190px,1.5fr)_140px_115px_170px_190px]">
          <label className="relative block"><span className="sr-only">Buscar por nome ou telefone</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"/><input className="form-input h-10 pl-9" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou telefone" /></label>
          <label className="sr-only" htmlFor="decision-month">Filtrar por mês</label><select id="decision-month" className="form-input h-10" value={month} onChange={event => setMonth(Number(event.target.value))}><option value={0}>Todos os meses</option>{months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select>
          <label className="sr-only" htmlFor="decision-year">Filtrar por ano</label><select id="decision-year" className="form-input h-10" value={year} onChange={event => setYear(Number(event.target.value))}><option value={0}>Todos os anos</option>{years.map(item => <option key={item} value={item}>{item}</option>)}</select>
          <label className="sr-only" htmlFor="decision-type">Filtrar por tipo</label><select id="decision-type" className="form-input h-10" value={type} onChange={event => setType(event.target.value as DecisionType | 'all')}><option value="all">Todos os tipos</option><option value="acceptance">Aceitação</option><option value="reconciliation">Reconciliação</option></select>
          <label className="sr-only" htmlFor="decision-status">Filtrar por acompanhamento</label><select id="decision-status" className="form-input h-10" value={status} onChange={event => setStatus(event.target.value as FollowUpStatus | 'all')}><option value="all">Todas as situações</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="hidden grid-cols-[minmax(150px,1.3fr)_minmax(120px,1fr)_minmax(130px,1fr)_minmax(120px,1fr)_minmax(155px,1.4fr)_auto] gap-3 bg-[#f6f7f3] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted lg:grid"><span>Pessoa</span><span>Telefone</span><span>Tipo</span><span>Batismo</span><span>Acompanhamento</span><span>Data</span></div>
        {filtered.map(record => <article key={record.id} className="grid gap-3 border-t border-border p-4 first:border-t-0 lg:grid-cols-[minmax(150px,1.3fr)_minmax(120px,1fr)_minmax(130px,1fr)_minmax(120px,1fr)_minmax(155px,1.4fr)_auto] lg:items-center">
          <button type="button" onClick={() => setSelectedPerson(record.personId)} className="flex min-w-0 items-center gap-3 text-left"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef1e9] text-primary"><UserRound size={17}/></span><span className="truncate text-sm font-semibold underline-offset-4 hover:underline">{record.personName}</span></button>
          <div className="flex justify-between gap-3 lg:block"><span className="text-xs text-muted lg:hidden">Telefone</span><span className="text-sm">{formatPhone(record.phoneNormalized)}</span></div>
          <div className="flex justify-between gap-3 lg:block"><span className="text-xs text-muted lg:hidden">Tipo</span><span className="text-sm">{decisionLabels[record.type]}</span></div>
          <div className="flex justify-between gap-3 lg:block"><span className="text-xs text-muted lg:hidden">Batismo</span><span className="text-sm">{record.baptized ? 'Batizada' : 'Não batizada'}</span></div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between lg:block"><span className="text-xs text-muted lg:hidden">Acompanhamento</span><span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-medium ${record.followUp.status === 'awaiting_first_contact' ? 'bg-[#fff4df] text-[#835b19]' : 'bg-[#eef1e9] text-primary'}`}>{statusLabels[record.followUp.status]}</span></div>
          <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted lg:hidden">Decisão · {formatDate(record.decidedOn)}</span><span className="hidden text-sm lg:inline">{formatDate(record.decidedOn)}</span>{['awaiting_first_contact', 'contact_made'].includes(record.followUp.status) && <Button type="button" variant="outline" size="sm" onClick={() => setContactTarget(record)}><MessageCircle size={14}/> Registrar contato</Button>}</div>
        </article>)}
        {filtered.length === 0 && <div className="px-5 py-12 text-center"><div className="empty-icon mx-auto"><Search size={21}/></div><h3 className="mt-4 font-semibold">Nenhuma decisão encontrada</h3><p className="mt-1 text-sm text-muted">Tente outro nome, período ou situação.</p></div>}
      </div>
    </section>

    {showForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="decision-form-title" className="my-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Cadastro interno · demonstração</p><h2 id="decision-form-title" className="mt-1 text-xl font-semibold">Registrar decisão</h2><p className="mt-1 text-sm text-muted">Uma pendência de primeiro contato será criada para esta decisão.</p></div><button type="button" aria-label="Fechar formulário" onClick={() => setShowForm(false)} className="rounded-lg p-2 text-muted hover:bg-[#f6f7f3]"><X size={18}/></button></div>
      <form onSubmit={submitDecision} className="space-y-4"><label className="block text-sm font-medium">Nome completo<input className="form-input mt-2" autoComplete="name" maxLength={120} required value={name} onChange={event => setName(event.target.value)} /></label><label className="block text-sm font-medium">Telefone com DDD<input className="form-input mt-2" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} required value={phone} onChange={event => setPhone(event.target.value)} placeholder="(11) 99999-0000" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Tipo<select className="form-input mt-2" value={newType} onChange={event => setNewType(event.target.value as DecisionType)}><option value="acceptance">Aceitação</option><option value="reconciliation">Reconciliação</option></select></label><label className="block text-sm font-medium">Batismo<select className="form-input mt-2" value={baptized} onChange={event => setBaptized(event.target.value)}><option value="false">Não batizada</option><option value="true">Batizada</option></select></label></div><label className="block text-sm font-medium">Data da decisão<input className="form-input mt-2" type="date" required max={new Date().toISOString().slice(0, 10)} value={decidedOn} onChange={event => setDecidedOn(event.target.value)} /></label><label className="block text-sm font-medium">Observações<textarea className="form-input form-textarea mt-2" maxLength={4000} value={observations} onChange={event => setObservations(event.target.value)} /></label>{error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button><Button type="submit"><Plus size={16}/> Salvar decisão</Button></div></form></section></div>}

    {contactTarget && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="contact-form-title" className="my-auto w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-7"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Acompanhamento</p><h2 id="contact-form-title" className="mt-1 text-xl font-semibold">Registrar contato</h2><p className="mt-1 text-sm text-muted">{contactTarget.personName} · {decisionLabels[contactTarget.type]}</p></div><button type="button" aria-label="Fechar formulário de contato" onClick={() => setContactTarget(null)} className="rounded-lg p-2 text-muted hover:bg-[#f6f7f3]"><X size={18}/></button></div><form className="space-y-4" onSubmit={submitContact}><label className="block text-sm font-medium">Observações do contato<textarea className="form-input form-textarea mt-2" maxLength={4000} value={contactNote} onChange={event => setContactNote(event.target.value)} placeholder="Anote o resultado do contato" /></label><p className="rounded-xl bg-[#eef1e9] p-3 text-xs leading-5 text-[#354c38]">O registro move o acompanhamento para “Contato realizado”. Nenhum convite ao café será criado.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setContactTarget(null)}>Cancelar</Button><Button type="submit"><MessageCircle size={15}/> Confirmar contato</Button></div></form></section></div>}

    {selectedPerson && peopleHistory.length > 0 && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedPerson(null) }}><section role="dialog" aria-modal="true" aria-labelledby="decision-history-title" className="my-auto w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Histórico individual</p><h2 id="decision-history-title" className="mt-1 text-xl font-semibold">{peopleHistory[0].personName}</h2><p className="mt-1 text-sm text-muted">{formatPhone(peopleHistory[0].phoneNormalized)}</p></div><button type="button" aria-label="Fechar histórico" onClick={() => setSelectedPerson(null)} className="rounded-lg p-2 text-muted hover:bg-[#f6f7f3]"><X size={18}/></button></div><ol className="mt-5 space-y-3">{peopleHistory.map(record => <li key={record.id} className="rounded-2xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{decisionLabels[record.type]} · {formatDate(record.decidedOn)}</span><span className="rounded-full bg-[#eef1e9] px-2.5 py-1 text-[11px] text-primary">{record.baptized ? 'Batizada' : 'Não batizada'}</span></div>{record.observations && <p className="mt-2 text-sm text-muted">{record.observations}</p>}<p className="mt-3 text-xs font-medium text-muted">Acompanhamento · {statusLabels[record.followUp.status]}</p>{record.followUp.contacts.length > 0 && <ul className="mt-2 space-y-2 border-l border-border pl-3">{record.followUp.contacts.map(contact => <li key={contact.id} className="text-xs text-muted"><span className="font-medium text-foreground">{new Date(contact.contactedAt).toLocaleString('pt-BR')}</span>{contact.observations && <span> · {contact.observations}</span>}</li>)}</ul>}</li>)}</ol><p className="mt-5 flex items-center gap-2 rounded-xl bg-[#eef1e9] p-3 text-xs text-[#354c38]"><History size={14}/> Este histórico contém somente dados de demonstração.</p></section></div>}
  </div>
}
