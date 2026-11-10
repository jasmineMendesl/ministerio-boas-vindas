import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { useNavigate, Outlet } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Heart, MessageCircle, Pencil, Search, Share2, Sparkles, Trash2, UsersRound, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/PageHeader'
import { addDecision, type DecisionRecord, type DecisionType } from './decision-data'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/AuthProvider'
import { editableInvitationStatuses, followUpToInvitationStatus, invitationStatusLabels, invitationStatusTones, invitationToFollowUpStatus, type InvitationStatus } from '../pertencer/invitation-status'
import { matchesServiceDay, type ServiceDayFilter } from '../../lib/service-day'
import { normalizeBrazilianPhone, normalizeVisitorName } from '../../../supabase/functions/_shared/visitor-validation'

const decisionLabels: Record<DecisionType, string> = { acceptance: 'Aceitação de Jesus', reconciliation: 'Reconciliação' }
const formatDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { dateStyle: 'medium' })
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('55') && digits.length === 13 ? `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}` : value
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('pt-BR')

type DecisionsContextValue = { records: DecisionRecord[]; setRecords: Dispatch<SetStateAction<DecisionRecord[]>>; notice: string; setNotice: (notice: string) => void; refreshRecords: () => Promise<void>; loading: boolean; eventId: string | null }
const DecisionsContext = createContext<DecisionsContextValue | null>(null)

export function DecisionsModule() {
  const { session } = useAuth()
  const [records, setRecords] = useState<DecisionRecord[]>([])
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [eventId, setEventId] = useState<string | null>(null)
  const refreshRecords = useCallback(async () => {
    if (!supabase || !session?.user.id) { setRecords([]); setEventId(null); setLoading(false); return }
    setLoading(true)
    const localToday = new Date()
    const today = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`
    const [decisionResult, eventResult] = await Promise.all([
      supabase.from('decisions').select('id,person_id,decision_type,baptized,interested_in_baptism,accepts_messages,welcomed_by_user_id,decided_on,notes,person:people!decisions_person_id_fkey(full_name,phone_normalized),welcomed_profile:profiles!decisions_welcomed_by_user_id_fkey(display_name),follow_up:follow_ups!follow_ups_decision_id_person_id_fkey(id,status,contact_date,notes)').order('decided_on', { ascending: false }),
      supabase.from('pertencer_events').select('id').gte('event_date', today).is('closed_at', null).order('event_date', { ascending: true }).limit(1),
    ])
    if (decisionResult.error) {
      setRecords([])
      setNotice('Não foi possível carregar as decisões. Verifique as migrations, conexão e permissões RLS.')
      setLoading(false)
      return
    }
    const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value
    const rows = (decisionResult.data ?? []) as unknown as Array<any>
    const event = eventResult.data?.[0]
    const activeEventId = event?.id ?? null
    setEventId(activeEventId)
    const peopleIds = [...new Set(rows.map(row => row.person_id as string))]
    const invitationsResult = activeEventId && peopleIds.length
      ? await supabase.from('event_invitations').select('id,person_id,follow_up_id,attendance').eq('event_id', activeEventId).in('person_id', peopleIds)
      : { data: [], error: null }
    if (invitationsResult.error) {
      setRecords([])
      setNotice('Não foi possível carregar os status do Projeto Pertencer. Confira as migrations e permissões.')
      setLoading(false)
      return
    }
    const invitationsByPerson = new Map((invitationsResult.data ?? []).map((item: { id: string; person_id: string; attendance: InvitationStatus }) => [item.person_id, item]))
    setRecords(rows.map(row => {
      const person = relation(row.person)
      const welcomedProfile = relation(row.welcomed_profile)
      const followUp = relation(row.follow_up)
      const invitation = invitationsByPerson.get(row.person_id)
      const invitationStatus = invitation?.attendance ?? followUpToInvitationStatus(followUp?.status ?? 'awaiting_first_contact')
      return {
        id: row.id, personId: row.person_id, personName: person?.full_name ?? '', phoneNormalized: person?.phone_normalized ?? '',
        type: row.decision_type, baptized: row.baptized, interestedInBaptism: row.interested_in_baptism,
        acceptsMessages: row.accepts_messages, welcomedBy: welcomedProfile?.display_name ?? 'Equipe autorizada',
        decidedOn: row.decided_on, observations: row.notes ?? '',
        followUp: { id: followUp?.id ?? '', status: invitation ? invitationToFollowUpStatus(invitationStatus) : followUp?.status ?? 'awaiting_first_contact', contactDate: followUp?.contact_date ?? null, observations: followUp?.notes ?? '', contacts: [] },
        invitationId: invitation?.id,
        invitationStatus,
      } satisfies DecisionRecord
    }))
    setNotice('')
    setLoading(false)
  }, [session?.user.id])
  useEffect(() => { void refreshRecords() }, [refreshRecords])
  return <DecisionsContext.Provider value={{ records, setRecords, notice, setNotice, refreshRecords, loading, eventId }}><Outlet/></DecisionsContext.Provider>
}

function useDecisionsContext() {
  const context = useContext(DecisionsContext)
  if (!context) throw new Error('As telas de decisões devem estar dentro de DecisionsModule.')
  return context
}

function Metric({ icon: Icon, label, value, helper, tone = 'green' }: { icon: typeof UsersRound; label: string; value: number; helper: string; tone?: 'green' | 'amber' | 'sage' }) {
  const tones = {
    green: 'bg-[#F0E6D2] text-[#8A6729]',
    amber: 'bg-[#F0E6D2] text-[#B08A3E]',
    sage: 'bg-[#F0E6D2] text-[#B08A3E]',
  }
  return <article className="min-w-0 rounded-2xl border border-[#E5DDCF] bg-white p-3.5 shadow-[0_3px_12px_rgba(0,0,0,.035)] sm:p-4"><div className="flex items-start justify-between gap-2"><p className="min-w-0 text-[13px] font-medium leading-4 text-[#68645C]">{label}</p><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><Icon size={15}/></span></div><div className="mt-2 flex flex-wrap items-baseline gap-x-2"><p className="text-[27px] font-semibold leading-8 tracking-tight text-[#161616]">{value}</p><p className="text-xs text-[#68645C]">{helper}</p></div></article>
}

function Choice({ value, selected, onSelect, title, subtitle }: { value: string; selected: boolean; onSelect: (value: string) => void; title: string; subtitle?: string }) {
  return <button type="button" aria-pressed={selected} onClick={() => onSelect(value)} className={`flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${selected ? 'border-[#D8C79D] bg-[#F0E6D2] text-[#8A6729]' : 'border-[#E5DDCF] bg-white text-[#68645C] hover:border-[#F0E6D2]'}`}><span className={`grid size-3.5 shrink-0 place-items-center rounded-full border ${selected ? 'border-[#8A6729]' : 'border-[#D8C79D]'}`}>{selected && <span className="size-1.5 rounded-full bg-[#8A6729]"/>}</span><span className="min-w-0"><span className="block text-[13px] font-semibold leading-4">{title}</span>{subtitle && <span className="block text-xs leading-4 text-[#68645C]">{subtitle}</span>}</span></button>
}

export function DecisionsPage() {
  const { records, notice, setNotice, loading, refreshRecords, eventId } = useDecisionsContext()
  const { role } = useAuth()
  const navigate = useNavigate()
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<DecisionRecord | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editType, setEditType] = useState<DecisionType>('acceptance')
  const [editBaptized, setEditBaptized] = useState('false')
  const [editAcceptsMessages, setEditAcceptsMessages] = useState('true')
  const [editDecidedOn, setEditDecidedOn] = useState('')
  const [editObservations, setEditObservations] = useState('')
  const [decisionActionError, setDecisionActionError] = useState('')
  const [decisionSaving, setDecisionSaving] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<DecisionRecord | null>(null)
  const [decisionDeleting, setDecisionDeleting] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [serviceDay, setServiceDay] = useState<ServiceDayFilter>('all')
  const recent = useMemo(() => [...records].sort((a, b) => b.decidedOn.localeCompare(a.decidedOn)), [records])
  const filteredRecords = useMemo(() => recent.filter(record =>
    (!dateFrom || record.decidedOn >= dateFrom)
      && (!dateTo || record.decidedOn <= dateTo)
      && matchesServiceDay(record.decidedOn, serviceDay),
  ), [recent, dateFrom, dateTo, serviceDay])
  const currentYear = new Date().getFullYear()
  const yearRecords = records.filter(record => Number(record.decidedOn.slice(0, 4)) === currentYear)
  const currentMonthRecords = yearRecords.filter(record => Number(record.decidedOn.slice(5, 7)) === new Date().getMonth() + 1)

  async function shareScreen() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNotice('Link desta tela copiado.')
    } catch {
      setNotice('Copie o endereço desta página pela barra do navegador.')
    }
  }

  async function updateInvitationStatus(record: DecisionRecord, status: InvitationStatus) {
    if (!supabase || !record.followUp.id || role !== 'admin') return
    setSavingStatusId(record.followUp.id)
    const { error } = await supabase.rpc('set_pertencer_invitation_status', {
      p_follow_up_id: record.followUp.id,
      p_event_id: eventId,
      p_status: status,
    })
    setSavingStatusId(null)
    if (error) { setNotice('Não foi possível atualizar o status do convite. Confira se a migration está aplicada.'); return }
    await refreshRecords()
    setNotice('Status do convite atualizado.')
  }

  function startEditing(record: DecisionRecord) {
    setEditingRecord(record)
    setEditName(record.personName)
    setEditPhone(formatPhone(record.phoneNormalized))
    setEditType(record.type)
    setEditBaptized(String(record.baptized))
    setEditAcceptsMessages(String(record.acceptsMessages))
    setEditDecidedOn(record.decidedOn.slice(0, 10))
    setEditObservations(record.observations)
    setDecisionActionError('')
  }

  async function saveDecisionEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || role !== 'admin' || !editingRecord) return
    const fullName = normalizeVisitorName(editName)
    const phone = normalizeBrazilianPhone(editPhone)
    if (!fullName) { setDecisionActionError('Informe o nome completo.'); return }
    if (!phone) { setDecisionActionError('Confira o telefone e inclua o DDD.'); return }
    if (!editDecidedOn || editDecidedOn > new Date().toISOString().slice(0, 10)) { setDecisionActionError('Informe uma data válida, que não seja futura.'); return }
    if (editObservations.length > 4000) { setDecisionActionError('As observações devem ter até 4.000 caracteres.'); return }
    setDecisionSaving(true); setDecisionActionError('')
    const { error } = await supabase.rpc('admin_update_staff_decision', {
      p_decision_id: editingRecord.id,
      p_full_name: fullName,
      p_phone_normalized: phone,
      p_decision_type: editType,
      p_baptized: editBaptized === 'true',
      p_accepts_messages: editAcceptsMessages === 'true',
      p_decided_on: editDecidedOn,
      p_notes: editObservations.trim() || null,
    })
    setDecisionSaving(false)
    if (error) { setDecisionActionError(error.code === '23505' ? 'Esse telefone já está associado a outra pessoa.' : 'Não foi possível salvar a edição. Confira se a migration está aplicada.'); return }
    setEditingRecord(null)
    setNotice('Decisão atualizada.')
    await refreshRecords()
  }

  async function deleteDecision() {
    if (!supabase || role !== 'admin' || !recordToDelete) return
    setDecisionDeleting(true); setDecisionActionError('')
    const { error } = await supabase.rpc('admin_delete_staff_decision', { p_decision_id: recordToDelete.id })
    setDecisionDeleting(false)
    if (error) { setDecisionActionError('Não foi possível excluir. Confira se a migration está aplicada.'); return }
    setRecordToDelete(null)
    setDecisionActionError('')
    setNotice('Decisão excluída. Os acompanhamentos e convites associados também foram removidos.')
    await refreshRecords()
  }

  return <div className="animate-in min-w-0 space-y-4 text-[#161616] sm:space-y-5">
    <PageHeader eyebrow="MÓDULO PASTORAL · DADOS DO SUPABASE" title="Decisões de Fé e Vidas Transformadas" description="“Digo-vos que assim haverá alegria no céu por um pecador que se arrepende.” — Lucas 15:7" actions={<><Button onClick={() => navigate('/decisoes/nova')} size="sm" className="h-10 min-w-0 rounded-lg bg-[#8A6729] px-3 text-sm sm:px-4"><Heart size={15} fill="currentColor"/>Registrar Nova Decisão</Button><Button type="button" variant="outline" size="icon" onClick={shareScreen} aria-label="Copiar link da tela" title="Copiar link desta tela" className="size-10 shrink-0 rounded-lg bg-white"><Share2 size={15}/></Button></>}/>

    {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-[#F0E6D2] bg-white px-3 py-2.5 text-xs"><span>{notice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={14}/></button></div>}
    {loading && <div role="status" className="rounded-xl border border-[#E5DDCF] bg-white px-3 py-2 text-xs text-[#68645C]">Carregando decisões do Supabase...</div>}

    <section aria-label="Indicadores anuais de decisões" className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 xl:grid-cols-4">
      <Metric icon={UsersRound} label="Total de Decisões no Ano" value={yearRecords.length} helper={`+${currentMonthRecords.length} neste mês`} tone="sage"/>
      <Metric icon={Heart} label="Aceitações de Jesus" value={yearRecords.filter(record => record.type === 'acceptance').length} helper="Novas decisões" tone="green"/>
      <Metric icon={Sparkles} label="Reconciliações" value={yearRecords.filter(record => record.type === 'reconciliation').length} helper="Retorno aos caminhos" tone="amber"/>
    </section>



    <section aria-label="Filtros de decisões por período e culto" className="grid gap-3 rounded-2xl border border-[#E5DDCF] bg-white p-3.5 sm:grid-cols-[1fr_1fr_1fr] sm:items-end sm:p-4">
      <label className="block text-xs font-medium text-[#68645C]">Data inicial<input aria-label="Data inicial das decisões" type="date" className="form-input mt-1.5 h-10 text-sm" value={dateFrom} max={dateTo || undefined} onChange={event => setDateFrom(event.target.value)}/></label>
      <label className="block text-xs font-medium text-[#68645C]">Data final<input aria-label="Data final das decisões" type="date" className="form-input mt-1.5 h-10 text-sm" value={dateTo} min={dateFrom || undefined} onChange={event => setDateTo(event.target.value)}/></label>
      <label className="block text-xs font-medium text-[#68645C]">Culto<select aria-label="Filtrar decisões por culto" className="form-input mt-1.5 h-10 text-sm" value={serviceDay} onChange={event => setServiceDay(event.target.value as ServiceDayFilter)}><option value="all">Todos os cultos</option><option value="sunday">Domingo (10h e 18h)</option><option value="thursday">Quinta-feira (19h15)</option></select></label>
    </section>

    <div>
      <section aria-labelledby="recent-decisions-title" className="min-w-0">
        <div className="mb-2.5 flex flex-col items-start justify-between gap-1 sm:flex-row sm:items-center sm:gap-3"><h2 id="recent-decisions-title" className="text-sm font-semibold">Decisões Registradas</h2><span className="text-xs text-[#68645C]">Mostrando {filteredRecords.length} de {records.length}</span></div>
        <div className="space-y-2.5">
          {filteredRecords.map(record => <article key={record.id} className="min-w-0 rounded-2xl border border-[#E5DDCF] bg-white p-4 shadow-[0_4px_14px_rgba(0,0,0,.035)] sm:p-5">
            <div className="flex min-w-0 items-start gap-2.5"><span className={`grid size-9 shrink-0 place-items-center rounded-xl text-xs font-semibold ${record.type === 'acceptance' ? 'bg-[#F0E6D2] text-[#8A6729]' : 'bg-[#F0E6D2] text-[#B08A3E]'}`}>{initials(record.personName)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="break-words text-left text-sm font-semibold text-[#161616]">{record.personName}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${record.type === 'acceptance' ? 'bg-[#F0E6D2] text-[#8A6729]' : 'bg-[#F0E6D2] text-[#B08A3E]'}`}>{decisionLabels[record.type]}</span></div><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#68645C]"><span className="inline-flex items-center gap-1"><CalendarDays size={12}/>{record.type === 'acceptance' ? 'Aceitou' : 'Reconciliação'} em {formatDate(record.decidedOn)}</span><span className="inline-flex items-center gap-1"><MessageCircle size={12}/>{formatPhone(record.phoneNormalized)}</span></div></div></div>
            <label className="mt-3 block text-xs font-medium text-[#68645C]">Status do convite<select aria-label={`Status do convite de ${record.personName}`} disabled={role !== 'admin' || !record.followUp.id || savingStatusId === record.followUp.id} value={record.invitationStatus ?? followUpToInvitationStatus(record.followUp.status)} onChange={event => void updateInvitationStatus(record, event.target.value as InvitationStatus)} className={`mt-1.5 h-10 w-full rounded-lg border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-75 ${invitationStatusTones[record.invitationStatus ?? followUpToInvitationStatus(record.followUp.status)]}`}><option value="absent" disabled>{invitationStatusLabels.absent} (histórico)</option>{editableInvitationStatuses.map(status => <option key={status} value={status}>{invitationStatusLabels[status]}</option>)}</select></label>
            <div className="mt-2.5 grid gap-2 rounded-xl border border-[#F7F2E8] bg-[#F7F2E8] p-2.5 sm:grid-cols-2"><div><p className="text-xs text-[#68645C]">Batismo nas águas</p><p className="mt-1 inline-flex items-center gap-1 text-xs font-medium"><span className="text-[#B08A3E]">◉</span>{record.baptized ? 'Já batizada' : 'Ainda não batizada'}</p></div><div className="sm:col-span-2"><p className="text-xs text-[#68645C]">Registrado por</p><p className="mt-1 text-xs font-medium">{record.welcomedBy}</p></div></div>
            {record.observations && <p className="mt-2 text-xs leading-4 text-[#68645C]">{record.observations}</p>}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"><a href={`https://wa.me/${record.phoneNormalized.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" aria-label={`Abrir conversa no WhatsApp com ${record.personName}`} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#8A6729] px-3 text-sm font-medium text-white hover:bg-[#6B4F1D] sm:w-auto"><MessageCircle size={15}/> WhatsApp</a>{role === 'admin' && <div className="flex gap-2"><button type="button" onClick={() => startEditing(record)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-[#E5DDCF] bg-white px-3 text-sm font-medium text-[#34322E] hover:bg-[#FBF9F4] sm:flex-none"><Pencil size={15}/>Editar</button><button type="button" onClick={() => { setRecordToDelete(record); setDecisionActionError('') }} aria-label={`Excluir decisão de ${record.personName}`} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-[#E8C8C4] bg-[#FFF1EF] px-3 text-sm font-medium text-[#9B3B32] hover:bg-[#FDE4E1] sm:flex-none"><Trash2 size={15}/>Excluir</button></div>}</div>
          </article>)}
          {filteredRecords.length === 0 && <div className="rounded-2xl border border-dashed border-[#E5DDCF] bg-white px-5 py-10 text-center"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-[#F0E6D2] text-[#8A6729]"><Search size={17}/></span><h3 className="mt-3 text-sm font-semibold">Nenhuma decisão encontrada</h3><p className="mt-1 text-xs text-[#68645C]">Ajuste o período ou selecione outro culto.</p></div>}
        </div>
      </section>

    </div>
    {editingRecord && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/45 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !decisionSaving) setEditingRecord(null) }}><section role="dialog" aria-modal="true" aria-labelledby="edit-decision-title" className="my-auto max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#8A6729]">Administração</p><h2 id="edit-decision-title" className="mt-1 text-lg font-semibold">Editar decisão</h2><p className="mt-1 text-sm text-[#68645C]">Atualize os dados desta decisão registrada.</p><p className="mt-2 text-xs leading-5 text-[#68645C]">Nome e telefone pertencem ao cadastro da pessoa e também serão atualizados nos outros registros dela.</p></div><button type="button" aria-label="Fechar edição" disabled={decisionSaving} onClick={() => setEditingRecord(null)} className="rounded-lg p-2 text-[#68645C] hover:bg-[#F7F2E8]"><X size={17}/></button></div><form onSubmit={saveDecisionEdit} className="mt-5 space-y-4"><label className="block text-sm font-medium">Nome completo<input className="form-input mt-1.5 h-10 text-sm" maxLength={120} required value={editName} onChange={event => setEditName(event.target.value)}/></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">WhatsApp<input className="form-input mt-1.5 h-10 text-sm" type="tel" inputMode="tel" maxLength={30} required value={editPhone} onChange={event => setEditPhone(event.target.value)}/></label><label className="block text-sm font-medium">Data da decisão<input className="form-input mt-1.5 h-10 text-sm" type="date" max={new Date().toISOString().slice(0, 10)} required value={editDecidedOn} onChange={event => setEditDecidedOn(event.target.value)}/></label></div><fieldset><legend className="mb-2 text-sm font-medium">Tipo de decisão</legend><div className="grid gap-2 sm:grid-cols-2"><Choice value="acceptance" selected={editType === 'acceptance'} onSelect={value => setEditType(value as DecisionType)} title="Aceitação"/><Choice value="reconciliation" selected={editType === 'reconciliation'} onSelect={value => setEditType(value as DecisionType)} title="Reconciliação"/></div></fieldset><fieldset><legend className="mb-2 text-sm font-medium">Já é batizado(a) nas águas?</legend><div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2"><Choice value="true" selected={editBaptized === 'true'} onSelect={setEditBaptized} title="Sim, já batizado(a)"/><Choice value="false" selected={editBaptized === 'false'} onSelect={setEditBaptized} title="Não"/></div></fieldset><fieldset><legend className="mb-2 text-sm font-medium">Aceita receber mensagem da igreja?</legend><div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2"><Choice value="true" selected={editAcceptsMessages === 'true'} onSelect={setEditAcceptsMessages} title="Sim, aceita receber"/><Choice value="false" selected={editAcceptsMessages === 'false'} onSelect={setEditAcceptsMessages} title="Não deseja receber"/></div></fieldset><label className="block text-sm font-medium">Observações<textarea className="form-input form-textarea mt-1.5 min-h-24 text-sm" maxLength={4000} value={editObservations} onChange={event => setEditObservations(event.target.value)}/></label>{decisionActionError && <p role="alert" className="status-negative rounded-lg border px-3 py-2 text-sm">{decisionActionError}</p>}<div className="flex flex-col-reverse gap-2 border-t border-[#E5DDCF] pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={decisionSaving} onClick={() => setEditingRecord(null)} className="min-h-10 px-4 text-sm">Cancelar</Button><Button type="submit" disabled={decisionSaving} className="min-h-10 bg-[#8A6729] px-5 text-sm">{decisionSaving ? 'Salvando...' : 'Salvar alterações'}</Button></div></form></section></div>}
    {recordToDelete && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-decision-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#FFF1EF] text-[#9B3B32]"><Trash2 size={18}/></span><div><h2 id="delete-decision-title" className="text-lg font-semibold">Excluir esta decisão?</h2><p className="mt-1 text-sm text-[#68645C]">A decisão de {recordToDelete.personName} será removida. O acompanhamento, o histórico e os convites associados também serão excluídos. O cadastro da pessoa será mantido.</p></div></div>{decisionActionError && <p role="alert" className="status-negative mt-3 rounded-lg border px-3 py-2 text-sm">{decisionActionError}</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={decisionDeleting} onClick={() => { setRecordToDelete(null); setDecisionActionError('') }} className="min-h-10 px-4 text-sm">Cancelar</Button><Button type="button" disabled={decisionDeleting} onClick={() => void deleteDecision()} className="min-h-10 bg-[#9B3B32] px-4 text-sm hover:bg-[#812F28]">{decisionDeleting ? 'Excluindo...' : 'Confirmar exclusão'}</Button></div></section></div>}
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
      interestedInBaptism: false,
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
    const { data: decisionId, error: saveError } = await supabase.rpc('register_staff_decision', {
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
    if (typeof decisionId === 'string') {
      try {
        await supabase.functions.invoke('notify-decision-created', { body: { decisionId } })
      } catch { /* A falha na notificação não desfaz o cadastro da decisão. */ }
    }
    await refreshRecords()
    setNotice('Decisão registrada e pendência de primeiro contato criada no Supabase.')
    navigate('/decisoes')
  }

  return <main className="animate-in mx-auto w-full min-w-0 max-w-3xl space-y-4 text-[#161616] sm:space-y-5">
    <PageHeader eyebrow="MÓDULO PASTORAL" title="Registrar nova decisão" description="Registre a decisão e inicie o acompanhamento da pessoa." actions={<Button type="button" variant="outline" size="sm" onClick={() => navigate('/decisoes')} className="min-h-10 rounded-lg px-3 text-sm"><ArrowLeft size={15}/> Voltar para decisões</Button>}/>
    <form onSubmit={submitDecision} className="min-w-0 space-y-5 rounded-2xl border border-[#E5DDCF] bg-white p-4 shadow-[0_4px_14px_rgba(0,0,0,.04)] sm:p-7">
      <label className="block text-sm font-medium">Nome completo <span className="text-red-600">*</span><input className="form-input mt-2 h-11 text-sm" autoComplete="name" maxLength={120} required value={name} onChange={event => setName(event.target.value)} placeholder="Nome completo da pessoa"/></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">WhatsApp <span className="text-red-600">*</span><input className="form-input mt-2 h-11 text-sm" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} required value={phone} onChange={event => setPhone(event.target.value)} placeholder="(11) 90000-0000"/></label>
        <label className="block text-sm font-medium">Data da decisão <span className="text-red-600">*</span><input className="form-input mt-2 h-11 text-sm" type="date" required max={new Date().toISOString().slice(0, 10)} value={decidedOn} onChange={event => setDecidedOn(event.target.value)}/></label>
      </div>
      <fieldset><legend className="mb-2 text-sm font-medium">Tipo de decisão espiritual <span className="text-red-600">*</span></legend><div className="grid gap-2 sm:grid-cols-2"><Choice value="acceptance" selected={newType === 'acceptance'} onSelect={value => setNewType(value as DecisionType)} title="Aceitação" subtitle="Primeira vez com Jesus"/><Choice value="reconciliation" selected={newType === 'reconciliation'} onSelect={value => setNewType(value as DecisionType)} title="Reconciliação" subtitle="Retorno à igreja"/></div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">Já é batizado(a) nas águas?</legend><div className="grid grid-cols-1 gap-2 rounded-xl bg-[#F7F2E8] p-1.5 min-[420px]:grid-cols-2"><Choice value="true" selected={baptized === 'true'} onSelect={setBaptized} title="Sim, já batizado(a)"/><Choice value="false" selected={baptized === 'false'} onSelect={setBaptized} title="Não"/></div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">Aceita receber mensagem da igreja?</legend><div className="grid grid-cols-1 gap-2 rounded-xl bg-[#F7F2E8] p-1.5 min-[420px]:grid-cols-2"><Choice value="true" selected={acceptsMessages === 'true'} onSelect={setAcceptsMessages} title="Sim, aceita receber"/><Choice value="false" selected={acceptsMessages === 'false'} onSelect={setAcceptsMessages} title="Não deseja receber"/></div></fieldset>
      <label className="block text-sm font-medium">Pedido de oração ou observação pastoral<textarea className="form-input form-textarea mt-2 min-h-[110px] text-sm" maxLength={4000} value={observations} onChange={event => setObservations(event.target.value)} placeholder="Observações relevantes para o acompanhamento"/></label>
      {error && <p role="alert" className="status-negative rounded-lg border px-3 py-2.5 text-sm">{error}</p>}
      <div className="flex flex-col-reverse gap-2 border-t border-[#E5DDCF] pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => navigate('/decisoes')} className="h-10 px-4 text-sm">Cancelar</Button><Button type="submit" className="h-10 rounded-lg bg-[#8A6729] px-5 text-sm">Registrar decisão</Button></div>
      <p className="text-xs leading-5 text-[#68645C]">A decisão e a pendência de acompanhamento serão gravadas no Supabase.</p>
    </form>
  </main>
}


