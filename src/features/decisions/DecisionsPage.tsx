import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { useNavigate, Outlet } from 'react-router-dom'
import { ArrowLeft, CalendarDays, CheckCircle2, Heart, MessageCircle, Search, Share2, Sparkles, UsersRound, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { addDecision, type DecisionRecord, type DecisionType, type FollowUpStatus } from './decision-data'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/AuthProvider'

const statusLabels: Record<FollowUpStatus, string> = {
  awaiting_first_contact: 'Aguardando primeiro contato', contact_made: 'Contato realizado',
  awaiting_response: 'Aguardando resposta', responded: 'Respondeu', invited: 'Convidado para o Pertencer',
  awaiting_confirmation: 'Aguardando confirmação', confirmed: 'Confirmado', attended: 'Participou',
  no_show: 'Não compareceu', declined: 'Não participará', unable_to_contact: 'Não foi possível contatar',
}
const decisionLabels: Record<DecisionType, string> = { acceptance: 'Aceitação de Jesus', reconciliation: 'Reconciliação' }
const formatDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { dateStyle: 'medium' })
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('55') && digits.length === 13 ? `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}` : value
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('pt-BR')

type DecisionsContextValue = { records: DecisionRecord[]; setRecords: Dispatch<SetStateAction<DecisionRecord[]>>; notice: string; setNotice: (notice: string) => void; refreshRecords: () => Promise<void>; loading: boolean }
const DecisionsContext = createContext<DecisionsContextValue | null>(null)

export function DecisionsModule() {
  const { session } = useAuth()
  const [records, setRecords] = useState<DecisionRecord[]>([])
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const refreshRecords = useCallback(async () => {
    if (!supabase || !session?.user.id) { setRecords([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('decisions').select('id,person_id,decision_type,baptized,interested_in_baptism,accepts_messages,welcomed_by_user_id,decided_on,notes,person:people!decisions_person_id_fkey(full_name,phone_normalized),welcomed_profile:profiles!decisions_welcomed_by_user_id_fkey(display_name),follow_up:follow_ups!follow_ups_decision_id_person_id_fkey(id,status,contact_date,notes)')
      .order('decided_on', { ascending: false })
    if (error) {
      setRecords([])
      setNotice('Não foi possível carregar as decisões. Verifique as migrations, conexão e permissões RLS.')
      setLoading(false)
      return
    }
    const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value
    const rows = (data ?? []) as unknown as Array<any>
    setRecords(rows.map(row => {
      const person = relation(row.person)
      const welcomedProfile = relation(row.welcomed_profile)
      const followUp = relation(row.follow_up)
      return {
        id: row.id, personId: row.person_id, personName: person?.full_name ?? '', phoneNormalized: person?.phone_normalized ?? '',
        type: row.decision_type, baptized: row.baptized, interestedInBaptism: row.interested_in_baptism,
        acceptsMessages: row.accepts_messages, welcomedBy: welcomedProfile?.display_name ?? 'Equipe autorizada',
        decidedOn: row.decided_on, observations: row.notes ?? '',
        followUp: { id: followUp?.id ?? '', status: followUp?.status ?? 'awaiting_first_contact', contactDate: followUp?.contact_date ?? null, observations: followUp?.notes ?? '', contacts: [] },
      } satisfies DecisionRecord
    }))
    setNotice('')
    setLoading(false)
  }, [session?.user.id])
  useEffect(() => { void refreshRecords() }, [refreshRecords])
  return <DecisionsContext.Provider value={{ records, setRecords, notice, setNotice, refreshRecords, loading }}><Outlet/></DecisionsContext.Provider>
}

function useDecisionsContext() {
  const context = useContext(DecisionsContext)
  if (!context) throw new Error('As telas de decisões devem estar dentro de DecisionsModule.')
  return context
}

function Metric({ icon: Icon, label, value, helper, tone = 'green' }: { icon: typeof UsersRound; label: string; value: number; helper: string; tone?: 'green' | 'amber' | 'sage' }) {
  const tones = {
    green: 'bg-[#F3E9DF] text-[#6F4F28]',
    amber: 'bg-[#F3E9DF] text-[#9B5C42]',
    sage: 'bg-[#F3E9DF] text-[#9B5C42]',
  }
  return <article className="rounded-2xl border border-[#E8DED4] bg-white p-3.5 shadow-[0_3px_12px_rgba(43,58,45,.035)] sm:p-4"><div className="flex items-start justify-between gap-2"><p className="text-xs font-medium text-[#75675D] sm:text-xs">{label}</p><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><Icon size={15}/></span></div><div className="mt-2 flex items-baseline gap-2"><p className="text-[27px] font-semibold leading-8 tracking-tight text-[#2B2118]">{value}</p><p className="text-xs text-[#75675D]">{helper}</p></div></article>
}

function Choice({ value, selected, onSelect, title, subtitle }: { value: string; selected: boolean; onSelect: (value: string) => void; title: string; subtitle?: string }) {
  return <button type="button" aria-pressed={selected} onClick={() => onSelect(value)} className={`flex min-h-10 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${selected ? 'border-[#C0977D] bg-[#F3E9DF] text-[#6F4F28]' : 'border-[#E8DED4] bg-white text-[#75675D] hover:border-[#F3E9DF]'}`}><span className={`grid size-3.5 shrink-0 place-items-center rounded-full border ${selected ? 'border-[#6F4F28]' : 'border-[#C0977D]'}`}>{selected && <span className="size-1.5 rounded-full bg-[#6F4F28]"/>}</span><span className="min-w-0"><span className="block text-xs font-semibold leading-4">{title}</span>{subtitle && <span className="block text-xs leading-3 text-[#75675D]">{subtitle}</span>}</span></button>
}

function statusTone(status: FollowUpStatus) {
  if (status === 'contact_made' || status === 'responded' || status === 'confirmed' || status === 'attended') return 'status-positive'
  if (status === 'unable_to_contact' || status === 'no_show' || status === 'declined') return 'status-negative'
  return 'status-pending'
}

export function DecisionsPage() {
  const { records, notice, setNotice, loading } = useDecisionsContext()
  const navigate = useNavigate()
  const recent = useMemo(() => [...records].sort((a, b) => b.decidedOn.localeCompare(a.decidedOn)), [records])
  const currentYear = new Date().getFullYear()
  const yearRecords = records.filter(record => Number(record.decidedOn.slice(0, 4)) === currentYear)
  const currentMonthRecords = yearRecords.filter(record => Number(record.decidedOn.slice(5, 7)) === new Date().getMonth() + 1)
  const interestedPeople = new Set(records.filter(record => record.interestedInBaptism).map(record => record.personId)).size

  async function shareScreen() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNotice('Link desta tela copiado.')
    } catch {
      setNotice('Copie o endereço desta página pela barra do navegador.')
    }
  }

  return <div className="animate-in space-y-4 text-[#2B2118] sm:space-y-5">
    <header className="rounded-2xl border border-[#E8DED4] bg-[linear-gradient(110deg,#fff_0%,#fff_72%,#F3E9DF_100%)] px-4 py-4 shadow-[0_4px_18px_rgba(43,58,45,.04)] sm:px-6 sm:py-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#F3E9DF] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[#6F4F28]">✦ Módulo pastoral</span><span className="text-xs text-[#75675D]">· Dados do Supabase</span></div><h1 className="text-[24px] font-semibold leading-tight tracking-[-.035em] sm:text-[29px]">Decisões de Fé e Vidas Transformadas</h1><p className="mt-1.5 text-xs italic leading-5 text-[#75675D]">“Digo-vos que assim haverá alegria no céu por um pecador que se arrepende.” <span className="not-italic">— Lucas 15:7</span></p></div><div className="flex shrink-0 items-center gap-2"><Button onClick={() => navigate('/decisoes/nova')} size="sm" className="h-9 rounded-lg bg-[#6F4F28] px-3 text-xs sm:h-10 sm:px-4 sm:text-xs"><Heart size={14} fill="currentColor"/> Registrar Nova Decisão</Button><Button type="button" variant="outline" size="icon" onClick={shareScreen} aria-label="Copiar link da tela" title="Copiar link desta tela" className="size-9 rounded-lg bg-white sm:size-10"><Share2 size={14}/></Button></div></div>
    </header>

    {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-[#F3E9DF] bg-white px-3 py-2.5 text-xs"><span>{notice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={14}/></button></div>}
    {loading && <div role="status" className="rounded-xl border border-[#E8DED4] bg-white px-3 py-2 text-xs text-[#75675D]">Carregando decisões do Supabase...</div>}

    <section aria-label="Indicadores anuais de decisões" className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
      <Metric icon={UsersRound} label="Total de Decisões no Ano" value={yearRecords.length} helper={`+${currentMonthRecords.length} neste mês`} tone="sage"/>
      <Metric icon={Heart} label="Aceitações de Jesus" value={yearRecords.filter(record => record.type === 'acceptance').length} helper="Novas decisões" tone="green"/>
      <Metric icon={Sparkles} label="Reconciliações" value={yearRecords.filter(record => record.type === 'reconciliation').length} helper="Retorno aos caminhos" tone="amber"/>
      <Metric icon={CheckCircle2} label="Interesse em Batismo" value={interestedPeople} helper="Pessoas interessadas" tone="sage"/>
    </section>



    <div>
      <section aria-labelledby="recent-decisions-title" className="min-w-0">
        <div className="mb-2.5 flex items-center justify-between gap-3"><h2 id="recent-decisions-title" className="text-[13px] font-semibold">Decisões Registradas Recentemente</h2><span className="text-xs text-[#75675D]">Mostrando {recent.length} de {records.length}</span></div>
        <div className="space-y-2.5">
          {recent.map(record => <article key={record.id} className="rounded-2xl border border-[#E8DED4] bg-white p-3.5 shadow-[0_4px_14px_rgba(43,58,45,.035)] sm:p-4">
            <div className="flex items-start gap-2.5"><span className={`grid size-9 shrink-0 place-items-center rounded-xl text-xs font-semibold ${record.type === 'acceptance' ? 'bg-[#F3E9DF] text-[#6F4F28]' : 'bg-[#F3E9DF] text-[#9B5C42]'}`}>{initials(record.personName)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="text-left text-xs font-semibold text-[#2B2118]">{record.personName}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${record.type === 'acceptance' ? 'bg-[#F3E9DF] text-[#6F4F28]' : 'bg-[#F3E9DF] text-[#9B5C42]'}`}>{decisionLabels[record.type]}</span><span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(record.followUp.status)}`}>{statusLabels[record.followUp.status]}</span></div><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#75675D]"><span className="inline-flex items-center gap-1"><CalendarDays size={10}/>{record.type === 'acceptance' ? 'Aceitou' : 'Reconciliação'} em {formatDate(record.decidedOn)}</span><span className="inline-flex items-center gap-1"><MessageCircle size={10}/>{formatPhone(record.phoneNormalized)}</span></div></div></div>
            <div className="mt-2.5 grid gap-2 rounded-xl border border-[#F8F2EC] bg-[#F8F2EC] p-2.5 sm:grid-cols-2"><div><p className="text-xs text-[#75675D]">Batismo nas águas</p><p className="mt-1 inline-flex items-center gap-1 text-xs font-medium"><span className="text-[#9B5C42]">◉</span>{record.baptized ? 'Já batizada' : 'Ainda não batizada'}</p></div><div><p className="text-xs text-[#75675D]">Interesse em se batizar</p><p className="mt-1 inline-flex items-center gap-1 text-xs font-medium"><span className="text-[#9B5C42]">◉</span>{record.interestedInBaptism ? 'Sim, tem interesse' : 'Não no momento'}</p></div><div className="sm:col-span-2"><p className="text-xs text-[#75675D]">Acolhido por</p><p className="mt-1 text-xs font-medium">{record.welcomedBy}</p></div></div>
            {record.observations && <p className="mt-2 text-xs leading-4 text-[#75675D]">{record.observations}</p>}
            <div className="mt-3"><a href={`https://wa.me/${record.phoneNormalized.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" aria-label={`Abrir conversa no WhatsApp com ${record.personName}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#6F4F28] px-3 text-xs font-medium text-white hover:bg-[#5C3F20]"><MessageCircle size={14}/> WhatsApp</a></div>
          </article>)}
          {recent.length === 0 && <div className="rounded-2xl border border-dashed border-[#E8DED4] bg-white px-5 py-10 text-center"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-[#F3E9DF] text-[#6F4F28]"><Search size={17}/></span><h3 className="mt-3 text-sm font-semibold">Nenhuma decisão encontrada</h3><p className="mt-1 text-xs text-[#75675D]">Nenhuma decisão registrada.</p></div>}
        </div>
      </section>

    </div>
  </div>
}

export function DecisionRegistrationPage() {
  const { records, setNotice, refreshRecords } = useDecisionsContext()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [newType, setNewType] = useState<DecisionType>('acceptance')
  const [baptized, setBaptized] = useState('false')
  const [interestedInBaptism, setInterestedInBaptism] = useState('true')
  const [acceptsMessages, setAcceptsMessages] = useState('true')
  const [decidedOn, setDecidedOn] = useState(new Date().toISOString().slice(0, 10))
  const [observations, setObservations] = useState('')

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const result = addDecision(records, {
      fullName: name,
      phone,
      type: newType,
      baptized: baptized === 'true',
      interestedInBaptism: interestedInBaptism === 'true',
      acceptsMessages: acceptsMessages === 'true',
      decidedOn,
      observations,
    })

    if (!result.ok) {
      setError(result.error === 'name' ? 'Informe o nome completo.' : result.error === 'phone' ? 'Confira o telefone e inclua o DDD.' : result.error === 'date' ? 'Informe uma data válida, que não seja futura.' : 'As observações excedem o limite de 4.000 caracteres.')
      return
    }

    if (!supabase || !session?.user.id) { setError('Sua sessão não está ativa. Entre novamente para registrar a decisão.'); return }
    const record = result.records[0]
    const { error: saveError } = await supabase.rpc('register_staff_decision', {
      p_full_name: record.personName,
      p_phone_normalized: record.phoneNormalized,
      p_decision_type: record.type,
      p_baptized: record.baptized,
      p_interested_in_baptism: record.interestedInBaptism,
      p_accepts_messages: record.acceptsMessages,
      p_decided_on: record.decidedOn,
      p_notes: record.observations || null,
    })
    if (saveError) { setError('Não foi possível registrar a decisão. Confira as migrations e as permissões do perfil.'); return }
    await refreshRecords()
    setNotice('Decisão registrada e pendência de primeiro contato criada no Supabase.')
    navigate('/decisoes')
  }

  return <main className="animate-in mx-auto w-full max-w-3xl space-y-5 text-[#2B2118]">
    <Button type="button" variant="outline" size="sm" onClick={() => navigate('/decisoes')} className="h-9 rounded-lg px-3 text-xs"><ArrowLeft size={15}/> Voltar para decisões</Button>
    <header className="rounded-2xl border border-[#E8DED4] bg-[linear-gradient(110deg,#fff_0%,#fff_72%,#F3E9DF_100%)] p-5 shadow-[0_4px_18px_rgba(43,58,45,.04)] sm:p-7">
      <span className="rounded-full bg-[#F3E9DF] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[#6F4F28]">Módulo pastoral</span>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Registrar nova decisão</h1>
      <p className="mt-2 text-sm text-[#75675D]">Registre a decisão e inicie o acompanhamento da pessoa.</p>
    </header>
    <form onSubmit={submitDecision} className="space-y-5 rounded-2xl border border-[#E8DED4] bg-white p-5 shadow-[0_4px_14px_rgba(43,58,45,.04)] sm:p-7">
      <label className="block text-sm font-medium">Nome completo <span className="text-red-600">*</span><input className="form-input mt-2 h-11 text-sm" autoComplete="name" maxLength={120} required value={name} onChange={event => setName(event.target.value)} placeholder="Nome completo da pessoa"/></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">WhatsApp <span className="text-red-600">*</span><input className="form-input mt-2 h-11 text-sm" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} required value={phone} onChange={event => setPhone(event.target.value)} placeholder="(11) 90000-0000"/></label>
        <label className="block text-sm font-medium">Data da decisão <span className="text-red-600">*</span><input className="form-input mt-2 h-11 text-sm" type="date" required max={new Date().toISOString().slice(0, 10)} value={decidedOn} onChange={event => setDecidedOn(event.target.value)}/></label>
      </div>
      <fieldset><legend className="mb-2 text-sm font-medium">Tipo de decisão espiritual <span className="text-red-600">*</span></legend><div className="grid gap-2 sm:grid-cols-2"><Choice value="acceptance" selected={newType === 'acceptance'} onSelect={value => setNewType(value as DecisionType)} title="Aceitação" subtitle="Primeira vez com Jesus"/><Choice value="reconciliation" selected={newType === 'reconciliation'} onSelect={value => setNewType(value as DecisionType)} title="Reconciliação" subtitle="Retorno à igreja"/></div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">Já é batizado(a) nas águas?</legend><div className="flex gap-2 rounded-xl bg-[#F8F2EC] p-1.5"><Choice value="true" selected={baptized === 'true'} onSelect={setBaptized} title="Sim, já batizado(a)"/><Choice value="false" selected={baptized === 'false'} onSelect={setBaptized} title="Não"/></div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">Tem interesse em se batizar?</legend><div className="flex gap-2 rounded-xl bg-[#F8F2EC] p-1.5"><Choice value="true" selected={interestedInBaptism === 'true'} onSelect={setInterestedInBaptism} title="Sim, tem interesse"/><Choice value="false" selected={interestedInBaptism === 'false'} onSelect={setInterestedInBaptism} title="Não no momento"/></div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">Aceita receber mensagem da igreja?</legend><div className="flex gap-2 rounded-xl bg-[#F8F2EC] p-1.5"><Choice value="true" selected={acceptsMessages === 'true'} onSelect={setAcceptsMessages} title="Sim, aceita receber"/><Choice value="false" selected={acceptsMessages === 'false'} onSelect={setAcceptsMessages} title="Não deseja receber"/></div></fieldset>
      <label className="block text-sm font-medium">Pedido de oração ou observação pastoral<textarea className="form-input form-textarea mt-2 min-h-[110px] text-sm" maxLength={4000} value={observations} onChange={event => setObservations(event.target.value)} placeholder="Observações relevantes para o acompanhamento"/></label>
      {error && <p role="alert" className="status-negative rounded-lg border px-3 py-2.5 text-sm">{error}</p>}
      <div className="flex flex-col-reverse gap-2 border-t border-[#E8DED4] pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => navigate('/decisoes')} className="h-10 px-4 text-sm">Cancelar</Button><Button type="submit" className="h-10 rounded-lg bg-[#6F4F28] px-5 text-sm">Registrar decisão</Button></div>
      <p className="text-xs leading-5 text-[#75675D]">A decisão e a pendência de acompanhamento serão gravadas no Supabase.</p>
    </form>
  </main>
}


