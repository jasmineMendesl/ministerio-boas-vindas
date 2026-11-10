import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { Bookmark, CalendarDays, Check, ClipboardCopy, Eye, MessageSquare, Pencil, Plus, QrCode, Search, Trash2, UserRound, UsersRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/PageHeader'
import { PageTabs } from '../../components/PageTabs'
import { useAuth } from '../../app/AuthProvider'
import { supabase } from '../../lib/supabase'
import { buildPublicVisitorUrl, filterVisitors, firstVisit, formatVisitorPhone, type VisitorPerson, type VisitorVisit } from './visitor-data'
import { isValidPrayerRequest, isValidServiceDate, normalizeBrazilianPhone, normalizePrayerRequest, normalizeVisitorName } from '../../../supabase/functions/_shared/visitor-validation'
import { matchesServiceDay, type ServiceDayFilter } from '../../lib/service-day'

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const services = ['Todos os cultos', 'Domingo às 10h', 'Domingo às 18h', 'Quinta às 19h15']
type ServiceGiftReport = { id: string; serviceDate: string; serviceLabel: string; giftsDelivered: number; responsible: string }
type ServiceGiftReportRow = { id: string; service_date: string; service_label: string; gifts_delivered: number; responsible_user_id: string; responsible_profile: { display_name: string } | null }
type VisitorTab = 'gifts' | 'visitors'
type VisitorSourceFilter = 'qr' | 'all'
function localDateInput() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }

function formatDate(value: string, includeTime = false) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  return new Date(date).toLocaleString('pt-BR', includeTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' })
}

function visitorVisitMatchesFilters(visit: VisitorVisit, month: number, year: number, serviceDay: ServiceDayFilter) {
  const value = visit.visitedOn ?? visit.registeredAt
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return (month === 0 || date.getMonth() + 1 === month)
    && (year === 0 || date.getFullYear() === year)
    && matchesServiceDay(value, serviceDay)
}

function MetricCard({ icon: Icon, label, value, helper }: { icon: LucideIcon; label: string; value: string | number; helper: string }) {
  return <article className="flex min-w-0 items-center gap-3 rounded-xl border border-[#E5DDCF] bg-white px-3 py-3.5 shadow-[0_2px_7px_rgba(0,0,0,.025)] sm:gap-3.5 sm:px-4"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#F0E6D2] text-[#8A6729]"><Icon size={17} strokeWidth={1.8}/></div><div className="min-w-0"><p className="truncate text-xs text-[#68645C]">{label}</p><p className="mt-0.5 text-xl font-semibold leading-6 tracking-tight text-[#161616]">{value}</p><p className="mt-0.5 truncate text-xs text-[#68645C]">{helper}</p></div></article>
}

export function VisitorsPage() {
  const { session, role } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [people, setPeople] = useState<VisitorPerson[]>([])
  const [visitorsLoading, setVisitorsLoading] = useState(true)
  const [visitorsError, setVisitorsError] = useState('')
  const [visitorNotesError, setVisitorNotesError] = useState('')
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [serviceDay, setServiceDay] = useState<ServiceDayFilter>('all')
  const [visitorSource, setVisitorSource] = useState<VisitorSourceFilter>('qr')
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualVisitedOn, setManualVisitedOn] = useState(localDateInput)
  const [manualPrayerRequest, setManualPrayerRequest] = useState('')
  const [manualContactConsent, setManualContactConsent] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<VisitorPerson | null>(null)
  const [editPerson, setEditPerson] = useState<VisitorPerson | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editVisitedOn, setEditVisitedOn] = useState(localDateInput)
  const [editPrayerRequest, setEditPrayerRequest] = useState('')
  const [editContactConsent, setEditContactConsent] = useState(false)
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [personToDelete, setPersonToDelete] = useState<VisitorPerson | null>(null)
  const [visitorDeleting, setVisitorDeleting] = useState(false)
  const [visitorDeleteError, setVisitorDeleteError] = useState('')
  const [notePerson, setNotePerson] = useState<VisitorPerson | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [copied, setCopied] = useState(false)
  const [giftReports, setGiftReports] = useState<ServiceGiftReport[]>([])
  const [activeVisitorTab, setActiveVisitorTab] = useState<VisitorTab>(() => searchParams.get('tab') === 'gifts' ? 'gifts' : 'visitors')
  const [giftPage, setGiftPage] = useState(1)
  const [giftPageSize, setGiftPageSize] = useState<5 | 10 | 25>(5)
  const [showGiftReport, setShowGiftReport] = useState(false)
  const [showGiftReportConfirmation, setShowGiftReportConfirmation] = useState(false)
  const [reportToDelete, setReportToDelete] = useState<ServiceGiftReport | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [giftReportDate, setGiftReportDate] = useState(localDateInput)
  const [giftReportService, setGiftReportService] = useState(services[1])
  const [giftReportQuantity, setGiftReportQuantity] = useState('0')
  const [giftReportError, setGiftReportError] = useState('')
  const [giftReportSaving, setGiftReportSaving] = useState(false)
  const [giftReportsLoading, setGiftReportsLoading] = useState(true)
  const [giftReportsError, setGiftReportsError] = useState('')

  const today = new Date()
  const visitorFormUrl = useMemo(() => buildPublicVisitorUrl(window.location.origin, import.meta.env.BASE_URL), [])
  const filteredPeople = filterVisitors(people, search, month, year, undefined, serviceDay)
  const visiblePeople = visitorSource === 'qr'
    ? filteredPeople.filter(person => person.visits.some(visit => visit.source === 'qr' && visitorVisitMatchesFilters(visit, month, year, serviceDay)))
    : filteredPeople
  const bookmarksDelivered = giftReports.reduce((total, report) => total + report.giftsDelivered, 0)
  const giftPageCount = Math.max(1, Math.ceil(giftReports.length / giftPageSize))
  const currentGiftPage = Math.min(giftPage, giftPageCount)
  const paginatedGiftReports = giftReports.slice((currentGiftPage - 1) * giftPageSize, currentGiftPage * giftPageSize)
  const giftFirstVisible = giftReports.length ? (currentGiftPage - 1) * giftPageSize + 1 : 0
  const giftLastVisible = Math.min(currentGiftPage * giftPageSize, giftReports.length)
  const qrRegistrations = people.reduce((total, person) => total + person.visits.filter(visit => visit.source === 'qr').length, 0)
  const fillRate = bookmarksDelivered > 0 ? Math.round((qrRegistrations / bookmarksDelivered) * 100) : 0

  async function loadVisitors() {
    if (!supabase || !session?.user.id) {
      setVisitorsError('Conecte-se com uma conta autorizada para consultar visitantes.')
      setVisitorsLoading(false)
      return
    }
    setVisitorsLoading(true)
    const { data, error } = await supabase.from('visitors')
      .select('id,person_id,source,registered_at,visited_on,contact_consent,person:people!visitors_person_id_fkey(id,full_name,phone_normalized),prayer:visitor_prayer_requests(request_text)')
      .order('registered_at', { ascending: false })
    if (error) {
      setVisitorsError('Não foi possível carregar os visitantes. Confira a conexão e as permissões do perfil.')
      setPeople([])
      setVisitorsLoading(false)
      return
    }

    const rows = (data ?? []) as unknown as Array<{ id: string; person_id: string; source: 'qr' | 'staff'; registered_at: string; visited_on: string; contact_consent: boolean; person: { id: string; full_name: string; phone_normalized: string }; prayer: { request_text: string } | Array<{ request_text: string }> | null }>
    const personIds = [...new Set(rows.map(row => row.person_id))]
    const [giftResult, noteResult] = personIds.length ? await Promise.all([
      supabase.from('gift_deliveries').select('id,person_id,delivered_at,gift_type,quantity,responsible_user_id,responsible_profile:profiles!gift_deliveries_responsible_user_id_fkey(display_name)').in('person_id', personIds).order('delivered_at', { ascending: false }),
      supabase.from('visitor_staff_notes').select('person_id,note').in('person_id', personIds),
    ]) : [{ data: [], error: null }, { data: [], error: null }]

    const giftRows = (giftResult.data ?? []) as unknown as Array<{ id: string; person_id: string; delivered_at: string; gift_type: string; quantity: number; responsible_profile: { display_name: string } | null }>
    const noteRows = (noteResult.data ?? []) as Array<{ person_id: string; note: string }>
    const groupedGifts = new Map<string, VisitorPerson['gifts']>()
    for (const gift of giftRows) groupedGifts.set(gift.person_id, [...(groupedGifts.get(gift.person_id) ?? []), {
      id: gift.id, deliveredAt: gift.delivered_at, giftType: gift.gift_type, quantity: gift.quantity, responsible: gift.responsible_profile?.display_name ?? null,
    }])
    const noteByPerson = new Map(noteRows.map(item => [item.person_id, item.note]))
    const personMap = new Map<string, VisitorPerson>()
    for (const row of [...rows].reverse()) {
      const existing = personMap.get(row.person_id)
      const visit = { id: row.id, registeredAt: row.registered_at, source: row.source, serviceLabel: 'Culto', visitedOn: row.visited_on, contactConsent: row.contact_consent }
      if (existing) {
        existing.visits.push(visit)
        existing.prayerRequest = (Array.isArray(row.prayer) ? row.prayer[0]?.request_text : row.prayer?.request_text) ?? null
      }
      else personMap.set(row.person_id, {
        id: row.person.id, fullName: row.person.full_name, phoneNormalized: row.person.phone_normalized,
        visits: [visit], gifts: groupedGifts.get(row.person_id) ?? [], prayerRequest: (Array.isArray(row.prayer) ? row.prayer[0]?.request_text : row.prayer?.request_text) ?? null,
        staffNote: noteByPerson.get(row.person_id) ?? '',
      })
    }
    setPeople([...personMap.values()])
    setVisitorsError('')
    setVisitorNotesError(noteResult.error ? 'Anotações internas indisponíveis até aplicar a migration de integração.' : '')
    setVisitorsLoading(false)
  }

  async function loadGiftReports() {
    if (!supabase || !session?.user.id) {
      setGiftReportsError('Supabase ou sessao da equipe indisponivel.')
      setGiftReportsLoading(false)
      return
    }
    setGiftReportsLoading(true)
    const { data, error } = await supabase.from('visitor_service_gift_reports')
      .select('id,service_date,service_label,gifts_delivered,responsible_user_id,responsible_profile:profiles!visitor_service_gift_reports_responsible_user_id_fkey(display_name)')
      .order('service_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) {
      setGiftReportsError('Nao foi possivel carregar os fechamentos. Confira se as migrations e permissoes foram aplicadas.')
      setGiftReports([])
    } else {
      setGiftReportsError('')
      setGiftReports((data as unknown as ServiceGiftReportRow[]).map(row => ({
        id: row.id, serviceDate: row.service_date, serviceLabel: row.service_label, giftsDelivered: row.gifts_delivered,
        responsible: row.responsible_profile?.display_name ?? (row.responsible_user_id === session.user.id ? session.user.email ?? 'Lider da equipe' : 'Lider da equipe'),
      })))
    }
    setGiftReportsLoading(false)
  }

  useEffect(() => { void loadVisitors(); void loadGiftReports() }, [session?.user.id])

  useEffect(() => {
    if (searchParams.get('tab') === 'gifts') setActiveVisitorTab('gifts')
    if (searchParams.get('register') !== '1') return
    const date = searchParams.get('date')
    const service = searchParams.get('service')
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) setGiftReportDate(date)
    if (service && services.slice(1).includes(service)) setGiftReportService(service)
    setShowGiftReport(true)
    setSearchParams({ tab: 'gifts' }, { replace: true })
  }, [searchParams, setSearchParams])
  useEffect(() => {
    let active = true
    QRCode.toDataURL(visitorFormUrl, { width: 144, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#8A6729', light: '#ffffff' } })
      .then(image => { if (active) setQrImage(image) })
      .catch(() => { if (active) setQrImage('') })
    return () => { active = false }
  }, [visitorFormUrl])

  async function handleGiftReportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setGiftReportError('')
    const quantity = Number(giftReportQuantity)
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000) { setGiftReportError('Informe uma quantidade inteira entre 0 e 1000.'); return }
    if (!supabase || !session?.user.id) { setGiftReportError('Sua sessao nao esta ativa. Entre novamente para registrar.'); return }
    setShowGiftReportConfirmation(true)
  }

  async function confirmGiftReportSave() {
    if (!supabase || !session?.user.id) { setGiftReportError('Sua sessão não está ativa. Entre novamente para registrar.'); setShowGiftReportConfirmation(false); return }
    const quantity = Number(giftReportQuantity)
    setGiftReportSaving(true)
    const { error } = await supabase.from('visitor_service_gift_reports').insert({
      service_date: giftReportDate, service_label: giftReportService, gifts_delivered: quantity, responsible_user_id: session.user.id,
    })
    setGiftReportSaving(false)
    if (error) {
      setGiftReportError(error.code === '23505' ? 'Ja existe um fechamento para este culto e data.' : 'Nao foi possivel salvar. Confira a conexao e as permissoes do perfil.')
      setShowGiftReportConfirmation(false)
      return
    }
    await loadGiftReports()
    setGiftPage(1)
    setNotice('Fechamento de mimos registrado no Supabase.')
    setShowGiftReport(false); setGiftReportQuantity('0')
    setShowGiftReportConfirmation(false)
  }

  async function deleteGiftReport() {
    if (!supabase || !reportToDelete || role !== 'admin') return
    setDeleteSaving(true); setDeleteError('')
    const { error } = await supabase.from('visitor_service_gift_reports').delete().eq('id', reportToDelete.id)
    setDeleteSaving(false)
    if (error) { setDeleteError('Não foi possível excluir o fechamento. Atualize a tela e tente novamente.'); return }
    setReportToDelete(null)
    setNotice('Fechamento excluído.')
    await loadGiftReports()
  }
  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError('')
    const fullName = normalizeVisitorName(manualName)
    const phoneNormalized = normalizeBrazilianPhone(manualPhone)
    if (!fullName) { setFormError('Informe um nome válido, com pelo menos 2 caracteres.'); return }
    if (!phoneNormalized) { setFormError('Confira o telefone e inclua o DDD.'); return }
    if (!isValidServiceDate(manualVisitedOn, localDateInput())) { setFormError('Informe uma data válida, hoje ou anterior, para o culto.'); return }
    if (!isValidPrayerRequest(manualPrayerRequest)) { setFormError('O pedido de oração deve ter até 2.000 caracteres.'); return }
    if (!supabase || !session?.user.id) { setFormError('Sua sessão não está ativa. Entre novamente para cadastrar.'); return }
    const { error: visitError } = await supabase.rpc('register_staff_visitor_details', {
      p_full_name: fullName,
      p_phone_normalized: phoneNormalized,
      p_visited_on: manualVisitedOn,
      p_contact_consent: manualContactConsent,
      p_prayer_request: normalizePrayerRequest(manualPrayerRequest),
    })
    if (visitError) { setFormError('Não foi possível salvar o cadastro. Confira sua conexão e as permissões do perfil.'); return }
    await loadVisitors()
    setNotice('Cadastro e visita registrados no Supabase.')
    setManualName(''); setManualPhone(''); setManualVisitedOn(localDateInput()); setManualPrayerRequest(''); setManualContactConsent(false); setShowManualForm(false)
  }

  function openNote(person: VisitorPerson) {
    setNotePerson(person); setNoteDraft(person.staffNote)
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!notePerson) return
    if (!supabase || !session?.user.id) { setNotice('Sua sessão não está ativa para salvar informações internas.'); return }
    const note = noteDraft.trim()
    const result = note
      ? await supabase.from('visitor_staff_notes').upsert({ person_id: notePerson.id, note, updated_by: session.user.id }, { onConflict: 'person_id' })
      : await supabase.from('visitor_staff_notes').delete().eq('person_id', notePerson.id)
    if (result.error) { setNotice('Não foi possível salvar a informação. Aplique as migrations pendentes e tente novamente.'); return }
    await loadVisitors()
    setNotice('Informação interna salva no Supabase.')
    setNotePerson(null); setNoteDraft('')
  }

  function openEdit(person: VisitorPerson) {
    const latestVisit = [...person.visits].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))[0]
    setEditPerson(person)
    setEditName(person.fullName)
    setEditPhone(formatVisitorPhone(person.phoneNormalized))
    setEditVisitedOn(latestVisit?.visitedOn ?? localDateInput())
    setEditPrayerRequest(person.prayerRequest ?? '')
    setEditContactConsent(latestVisit?.contactConsent ?? false)
    setEditError('')
  }

  async function saveVisitorEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editPerson) return
    const fullName = normalizeVisitorName(editName)
    const phoneNormalized = normalizeBrazilianPhone(editPhone)
    const latestVisit = [...editPerson.visits].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))[0]
    if (!fullName) { setEditError('Informe um nome válido, com pelo menos 2 caracteres.'); return }
    if (!phoneNormalized) { setEditError('Confira o telefone e inclua o DDD.'); return }
    if (!isValidServiceDate(editVisitedOn, localDateInput())) { setEditError('Informe uma data válida, hoje ou anterior, para o culto.'); return }
    if (!isValidPrayerRequest(editPrayerRequest)) { setEditError('O pedido de oração deve ter até 2.000 caracteres.'); return }
    if (!supabase || !session?.user.id || !latestVisit) { setEditError('Não foi possível identificar a visita. Atualize a tela e tente novamente.'); return }
    setEditSaving(true)
    const { error } = await supabase.rpc('update_staff_visitor_details', {
      p_person_id: editPerson.id,
      p_visit_id: latestVisit.id,
      p_full_name: fullName,
      p_phone_normalized: phoneNormalized,
      p_visited_on: editVisitedOn,
      p_contact_consent: editContactConsent,
      p_prayer_request: normalizePrayerRequest(editPrayerRequest),
    })
    setEditSaving(false)
    if (error) {
      setEditError(error.code === '23505' ? 'Este telefone já está vinculado a outra pessoa.' : 'Não foi possível salvar as alterações. Confira a migration e suas permissões.')
      return
    }
    await loadVisitors()
    setNotice('Cadastro do visitante atualizado.')
    setEditPerson(null)
  }

  async function deleteVisitor() {
    if (!supabase || !personToDelete) return
    setVisitorDeleting(true); setVisitorDeleteError('')
    const { error } = await supabase.rpc('delete_staff_visitor', { p_person_id: personToDelete.id })
    setVisitorDeleting(false)
    if (error) { setVisitorDeleteError('Não foi possível excluir este cadastro. Atualize a tela e tente novamente.'); return }
    setPersonToDelete(null)
    setNotice('Cadastro de visitante excluído.')
    await loadVisitors()
  }

  async function copyVisitorLink() {
    try { await navigator.clipboard.writeText(visitorFormUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2200) }
    catch { setNotice('Não foi possível copiar automaticamente. Selecione e copie o endereço exibido.') }
  }

  const availableYears = Array.from({ length: 5 }, (_, index) => today.getFullYear() - index)

  return <div className="animate-in space-y-3.5 text-[#161616] sm:space-y-4">
    <PageHeader icon={UsersRound} eyebrow="MÓDULO DE ACOLHIMENTO · DADOS DO SUPABASE" title="Visitantes" description="Responsável pelo acolhimento das pessoas que visitam a igreja." actions={<Button size="sm" className="h-10 rounded-lg bg-[#8A6729] px-4 text-sm hover:bg-[#6B4F1D]" onClick={() => { setFormError(''); setShowManualForm(true) }}><Plus size={15}/> Cadastrar Visitante</Button>}/>

    {visitorsLoading && <div role="status" className="rounded-lg border border-[#E5DDCF] bg-white px-3 py-2 text-xs text-[#68645C]">Carregando visitantes do Supabase...</div>}
    {visitorsError && <div role="alert" className="status-negative rounded-lg border px-3 py-2 text-xs">{visitorsError}</div>}
    {visitorNotesError && <div role="alert" className="status-pending rounded-lg border px-3 py-2 text-xs">{visitorNotesError}</div>}
    {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2 text-xs"><span>{notice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15}/></button></div>}

    <section aria-label="Indicadores de visitantes" className="grid gap-2.5 sm:grid-cols-3">
      <MetricCard icon={Bookmark} label="Mimos reportados" value={bookmarksDelivered} helper="Soma dos fechamentos de culto"/>
      <MetricCard icon={QrCode} label="Cadastros via QR Code" value={qrRegistrations} helper="Cadastros recebidos pelo formulário"/>
      <MetricCard icon={UsersRound} label="Taxa de Preenchimento" value={`${fillRate}%`} helper="Formulários QR ÷ mimos entregues"/>
    </section>

    <PageTabs ariaLabel="Seções de visitantes" activeId={activeVisitorTab} onChange={value => { setActiveVisitorTab(value); if (value === 'gifts') setSearchParams({ tab: 'gifts' }, { replace: true }); else setSearchParams({}, { replace: true }) }} tabs={[{ id: 'gifts', label: 'Fechamento de mimos', controls: 'gift-reports-panel' }, { id: 'visitors', label: 'Visitantes do QR Code', controls: 'visitors-panel' }]}/>

    {activeVisitorTab === 'gifts' && <section id="gift-reports-panel" role="tabpanel" aria-labelledby="gift-report-title" className="overflow-hidden rounded-xl border border-[#E5DDCF] bg-white shadow-[0_2px_7px_rgba(0,0,0,.025)]">
      <div className="flex flex-col gap-3 border-b border-[#F7F2E8] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 id="gift-report-title" className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={17} className="text-[#8A6729]"/>Fechamento de mimos por culto</h2><p className="mt-1 text-xs text-[#68645C]">O líder, entre os 6 voluntários do culto, informa a data e a quantidade entregue. O sistema identifica quem registrou.</p></div><Button type="button" size="sm" onClick={() => { setGiftReportError(''); setGiftReportDate(localDateInput()); setShowGiftReport(true) }} className="h-9 self-start rounded-lg bg-[#8A6729] px-3 text-xs hover:bg-[#6B4F1D] sm:self-auto"><Plus size={14}/> Registrar fechamento</Button></div>
      {giftReportsError && <p role="alert" className="status-negative border-b px-4 py-2 text-xs">{giftReportsError}</p>}{giftReportsLoading ? <p className="px-4 py-5 text-xs text-[#68645C]">Carregando fechamentos...</p> : giftReports.length ? <div className="overflow-x-auto"><table className="w-full min-w-[460px] text-left text-sm"><thead className="bg-[#FBF9F4] text-xs text-[#68645C]"><tr><th className="px-4 py-2.5 font-medium">Data</th><th className="px-4 py-2.5 font-medium">Culto</th><th className="px-4 py-2.5 font-medium">Mimos entregues</th><th className="px-4 py-2.5 font-medium">Registrado por</th>{role === 'admin' && <th className="px-4 py-2.5 text-right font-medium">Ações</th>}</tr></thead><tbody>{paginatedGiftReports.map(report => <tr key={report.id} className="border-t border-[#F7F2E8]"><td className="px-4 py-3">{new Date(report.serviceDate + 'T12:00:00').toLocaleDateString('pt-BR')}</td><td className="px-4 py-3">{report.serviceLabel}</td><td className="px-4 py-3 font-semibold">{report.giftsDelivered}</td><td className="px-4 py-3 text-xs text-[#68645C]">{report.responsible}</td>{role === 'admin' && <td className="px-4 py-3 text-right"><button type="button" aria-label={`Excluir fechamento de ${report.serviceLabel} em ${report.serviceDate}`} title="Excluir fechamento" onClick={() => { setDeleteError(''); setReportToDelete(report) }} className="inline-grid size-8 place-items-center rounded-lg text-[#B08A3E] hover:bg-[#F5EBD5]"><Trash2 size={15}/></button></td>}</tr>)}</tbody></table><div className="flex flex-col gap-3 border-t border-[#F7F2E8] px-4 py-3 text-xs text-[#68645C] sm:flex-row sm:items-center sm:justify-between"><span>Exibindo {giftFirstVisible}–{giftLastVisible} de {giftReports.length} fechamentos</span><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2">Mostrar<select aria-label="Registros por página" className="h-9 rounded-lg border border-[#E5DDCF] bg-white px-2" value={giftPageSize} onChange={event => { setGiftPageSize(Number(event.target.value) as 5 | 10 | 25); setGiftPage(1) }}><option value={5}>5</option><option value={10}>10</option><option value={25}>25</option></select></label><span className="px-1">Página {currentGiftPage} de {giftPageCount}</span><button type="button" aria-label="Página anterior" disabled={currentGiftPage <= 1} onClick={() => setGiftPage(currentGiftPage - 1)} className="h-9 rounded-lg border border-[#E5DDCF] bg-white px-3 disabled:opacity-50">Anterior</button><button type="button" aria-label="Próxima página" disabled={currentGiftPage >= giftPageCount} onClick={() => setGiftPage(currentGiftPage + 1)} className="h-9 rounded-lg border border-[#E5DDCF] bg-white px-3 disabled:opacity-50">Próxima</button></div></div></div> : <p className="px-4 py-5 text-xs text-[#68645C]">Nenhum fechamento registrado.</p>}
    </section>}

    {activeVisitorTab === 'visitors' && <div id="visitors-panel" role="tabpanel" aria-labelledby="visitor-list-title" className="space-y-3">
    <section aria-labelledby="visitor-list-title" className="overflow-hidden rounded-xl border border-[#E5DDCF] bg-white shadow-[0_2px_7px_rgba(0,0,0,.025)]">
      <div className="grid gap-3 border-b border-[#F7F2E8] px-3 py-3 sm:grid-cols-[minmax(180px,1fr)_minmax(360px,1.6fr)] sm:items-center sm:px-4">
        <div><h2 id="visitor-list-title" className="text-[13px] font-semibold">{visitorSource === 'qr' ? 'Visitantes que preencheram o QR Code' : 'Todos os visitantes cadastrados'}</h2><p className="mt-0.5 text-xs text-[#68645C]">Registros de visita e cadastros recebidos</p></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(160px,1fr)_120px_90px_140px_140px]">
          <label className="relative col-span-2 block sm:col-span-1"><span className="sr-only">Buscar nome ou WhatsApp</span><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#68645C]"/><input className="h-9 w-full rounded-lg border border-[#E5DDCF] bg-[#FBF9F4] pl-8 pr-2 text-xs outline-none focus:border-[#C2A35E]" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou WhatsApp..."/></label>
          <label className="sr-only" htmlFor="visitor-month">Filtrar mês</label><select id="visitor-month" className="h-9 min-w-0 rounded-lg border border-[#E5DDCF] bg-white px-2 text-xs" value={month} onChange={event => setMonth(Number(event.target.value))}><option value={0}>Todos</option>{months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select>
          <label className="sr-only" htmlFor="visitor-year">Filtrar ano</label><select id="visitor-year" className="h-9 min-w-0 rounded-lg border border-[#E5DDCF] bg-white px-2 text-xs" value={year} onChange={event => setYear(Number(event.target.value))}><option value={0}>Todos</option>{availableYears.map(value => <option key={value}>{value}</option>)}</select>
          <label className="sr-only" htmlFor="visitor-service-day">Filtrar culto</label><select id="visitor-service-day" className="h-9 min-w-0 rounded-lg border border-[#E5DDCF] bg-white px-2 text-xs" value={serviceDay} onChange={event => setServiceDay(event.target.value as ServiceDayFilter)}><option value="all">Todos os cultos</option><option value="sunday">Domingo</option><option value="thursday">Quinta-feira</option></select>
          <label className="sr-only" htmlFor="visitor-source">Filtrar origem do cadastro</label><select id="visitor-source" className="h-9 min-w-0 rounded-lg border border-[#E5DDCF] bg-white px-2 text-xs" value={visitorSource} onChange={event => setVisitorSource(event.target.value as VisitorSourceFilter)}><option value="qr">Preencheu QR Code</option><option value="all">Todos os cadastros</option></select>
        </div>
      </div>

      <div className="overflow-x-auto">
          <div className="min-w-[660px]">
          <div className="grid grid-cols-[minmax(140px,1.5fr)_minmax(95px,1fr)_minmax(86px,.9fr)_minmax(110px,1fr)_132px] gap-1.5 bg-[#FBF9F4] px-2 py-2 text-xs font-semibold uppercase tracking-wide text-[#68645C] sm:gap-2 sm:px-3"><span>Nome do visitante</span><span>WhatsApp</span><span>Culto registrado</span><span>Data e envio</span><span className="text-center">Ações</span></div>
          {visiblePeople.map(person => {
            const latestVisit = [...person.visits].filter(visit => visitorVisitMatchesFilters(visit, month, year, serviceDay) && (visitorSource === 'all' || visit.source === 'qr')).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))[0]
            return <article key={person.id} className="grid grid-cols-[minmax(140px,1.5fr)_minmax(95px,1fr)_minmax(86px,.9fr)_minmax(110px,1fr)_132px] items-center gap-1.5 border-t border-[#F7F2E8] px-2 py-2.5 sm:gap-2 sm:px-3">
              <div className="flex min-w-0 items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#F0E6D2] text-[#8A6729]"><UserRound size={15}/></span><div className="min-w-0"><p className="truncate text-xs font-semibold">{person.fullName}</p><p className="truncate text-xs text-[#68645C]">{latestVisit?.source === 'qr' ? 'Formulário público' : 'Cadastro da equipe'}</p></div></div>
              <span className="text-xs text-[#6B4F1D]">{formatVisitorPhone(person.phoneNormalized)}</span>
              <span className="text-xs">{latestVisit ? formatDate(latestVisit.visitedOn ?? latestVisit.registeredAt) : '—'}</span>
              <span className="text-xs leading-4"><span className="block">{latestVisit ? new Date(latestVisit.registeredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span><span className="text-[#68645C]">{latestVisit ? formatDate(latestVisit.registeredAt) : '—'}</span></span>

              <div className="flex items-center justify-center gap-1"><button type="button" aria-label={`Ver detalhes de ${person.fullName}`} title="Ver detalhes e pedido de oração" onClick={() => setSelectedPerson(person)} className="grid size-8 place-items-center rounded-md bg-[#8A6729] text-white transition-colors hover:bg-[#6B4F1D]"><Eye size={15}/></button><button type="button" aria-label={`Adicionar informação para ${person.fullName}`} title="Adicionar informação" onClick={() => openNote(person)} className="grid size-7 place-items-center rounded-md bg-[#F0E6D2] text-[#68645C] hover:bg-[#F0E6D2]"><MessageSquare size={13}/></button><button type="button" aria-label={`Editar visitante ${person.fullName}`} title="Editar visitante" onClick={() => openEdit(person)} className="grid size-7 place-items-center rounded-md bg-[#F0E6D2] text-[#68645C] hover:bg-[#E8DCC4]"><Pencil size={13}/></button><button type="button" aria-label={`Excluir visitante ${person.fullName}`} title="Excluir visitante" onClick={() => { setVisitorDeleteError(''); setPersonToDelete(person) }} className="grid size-7 place-items-center rounded-md bg-[#FCE8E6] text-[#9C3F37] hover:bg-[#F8D7D4]"><Trash2 size={13}/></button></div>
            </article>
          })}
          {visiblePeople.length === 0 && <div className="px-5 py-10 text-center text-xs text-[#68645C]">Nenhum visitante encontrado para os filtros selecionados.</div>}
          <div className="flex items-center justify-between border-t border-[#F7F2E8] px-3 py-2 text-xs text-[#68645C] sm:px-4"><span>Exibindo {visiblePeople.length} de {people.length} pessoas cadastradas</span><span>Página 1 de 1</span></div>
        </div>
      </div>
    </section>

    <section aria-labelledby="visitor-qr-title" className="rounded-xl border border-[#E5DDCF] bg-white p-3.5 shadow-[0_2px_7px_rgba(0,0,0,.025)] sm:p-4">
      <h2 id="visitor-qr-title" className="sr-only">Formulário de visitantes</h2>
      <div className="mx-auto flex max-w-sm flex-col items-center py-2 text-center sm:py-3"><div className="grid size-[138px] place-items-center rounded-xl border border-[#E5DDCF] bg-white p-2 shadow-sm">{qrImage ? <img src={qrImage} alt="QR Code do formulário de visitantes" width={120} height={120}/> : <QrCode size={45} className="text-[#8A6729]"/>}</div><a className="mt-3 max-w-full break-all font-mono text-sm text-[#8A6729] underline underline-offset-2" href={visitorFormUrl} target="_blank" rel="noreferrer">{visitorFormUrl}</a><div className="mt-3 flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={copyVisitorLink} className="h-9 rounded-lg bg-[#F0E6D2] px-3 text-sm"><ClipboardCopy size={14}/>{copied ? 'Link copiado' : 'Copiar link'}</Button><a className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#8A6729] px-3 text-sm font-medium text-white hover:bg-[#6B4F1D]" href={visitorFormUrl} target="_blank" rel="noreferrer">Abrir formulário <ExternalLinkIcon/></a></div></div>
    </section>
    </div>}

    {showGiftReport && !showGiftReportConfirmation && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowGiftReport(false) }}><section role="dialog" aria-modal="true" aria-labelledby="gift-report-form-title" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Fechamento do culto</p><h2 id="gift-report-form-title" className="mt-1 text-lg font-semibold">Registrar mimos entregues</h2><p className="mt-1 text-xs text-muted">Informe quantos foram entregues neste culto.</p></div><button type="button" aria-label="Fechar formulário" onClick={() => setShowGiftReport(false)} className="rounded-lg p-2 text-muted hover:bg-[#F7F2E8]"><X size={17}/></button></div><form className="space-y-3" onSubmit={handleGiftReportSubmit}><label className="block text-xs font-medium">Dia do culto<input className="form-input mt-1.5 h-10 text-sm" type="date" required value={giftReportDate} onChange={event => setGiftReportDate(event.target.value)}/></label><label className="block text-xs font-medium">Culto<select className="form-input mt-1.5 h-10 text-sm" value={giftReportService} onChange={event => setGiftReportService(event.target.value)}>{services.slice(1).map(label => <option key={label}>{label}</option>)}</select></label><label className="block text-xs font-medium">Quantidade de mimos<input className="form-input mt-1.5 h-10 text-sm" type="number" min="0" max="1000" step="1" required value={giftReportQuantity} onChange={event => setGiftReportQuantity(event.target.value)}/></label><div className="rounded-lg bg-[#F7F2E8] px-3 py-2 text-xs text-[#34322E]">Líder responsável: <strong>{session?.user.email ?? 'Equipe de acolhimento'}</strong></div>{giftReportError && <p role="alert" className="status-negative rounded-lg border px-3 py-2 text-xs">{giftReportError}</p>}<p className="text-xs text-muted">O fechamento será associado à sua conta e ficará disponível à equipe autorizada.</p><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" size="sm" onClick={() => setShowGiftReport(false)}>Cancelar</Button><Button type="submit" size="sm"><Check size={14}/> Revisar fechamento</Button></div></form></section></div>}

    {showGiftReportConfirmation && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="gift-report-confirm-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F0E6D2] text-[#8A6729]"><Check size={19}/></span><div><h2 id="gift-report-confirm-title" className="text-lg font-semibold">Confirme os dados do fechamento</h2><p className="mt-1 text-sm text-muted">Revise antes de salvar no sistema.</p></div></div><dl className="mt-5 space-y-3 rounded-xl bg-[#FBF9F4] p-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted">Data do culto</dt><dd className="font-medium">{new Date(`${giftReportDate}T12:00:00`).toLocaleDateString('pt-BR')}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted">Culto</dt><dd className="text-right font-medium">{giftReportService}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted">Mimos entregues</dt><dd className="font-semibold">{giftReportQuantity}</dd></div></dl>{giftReportError && <p role="alert" className="status-negative mt-3 rounded-lg border px-3 py-2 text-sm">{giftReportError}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={giftReportSaving} onClick={() => setShowGiftReportConfirmation(false)}>Voltar e corrigir</Button><Button type="button" size="sm" disabled={giftReportSaving} onClick={() => void confirmGiftReportSave()}>{giftReportSaving ? 'Salvando...' : 'Confirmar e salvar'}</Button></div></section></div>}

    {reportToDelete && role === 'admin' && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-gift-report-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 id="delete-gift-report-title" className="text-lg font-semibold">Excluir fechamento?</h2><p className="mt-2 text-sm leading-6 text-muted">Confirme a exclusão do fechamento de <strong>{reportToDelete.serviceLabel}</strong> em <strong>{new Date(`${reportToDelete.serviceDate}T12:00:00`).toLocaleDateString('pt-BR')}</strong>, com <strong>{reportToDelete.giftsDelivered} mimos</strong>. Esta ação não pode ser desfeita.</p>{deleteError && <p role="alert" className="status-negative mt-3 rounded-lg border px-3 py-2 text-sm">{deleteError}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={deleteSaving} onClick={() => setReportToDelete(null)}>Cancelar</Button><Button type="button" size="sm" disabled={deleteSaving} onClick={() => void deleteGiftReport()} className="bg-red-700 text-white hover:bg-red-800">{deleteSaving ? 'Excluindo...' : 'Excluir fechamento'}</Button></div></section></div>}

    {showManualForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowManualForm(false) }}><section role="dialog" aria-modal="true" aria-labelledby="manual-visitor-title" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Cadastro da equipe</p><h2 id="manual-visitor-title" className="mt-1 text-lg font-semibold">Cadastrar visitante</h2><p className="mt-1 text-xs text-muted">Preencha os mesmos dados do formulário público.</p></div><button type="button" aria-label="Fechar formulário" onClick={() => setShowManualForm(false)} className="rounded-lg p-2 text-muted hover:bg-[#F7F2E8]"><X size={17}/></button></div><form className="space-y-3.5" onSubmit={handleManualSubmit}><label className="block text-xs font-medium">Seu nome <span className="text-[#8A6729]">*</span><input className="form-input mt-1.5 h-11 text-sm" autoComplete="name" maxLength={120} required value={manualName} onChange={event => setManualName(event.target.value)} placeholder="Como podemos chamar você?"/></label><label className="block text-xs font-medium">Telefone com DDD <span className="text-[#8A6729]">*</span><input className="form-input mt-1.5 h-11 text-sm" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} required value={manualPhone} onChange={event => setManualPhone(event.target.value)} placeholder="(11) 99999-0000"/></label><label className="block text-xs font-medium">Dia em que você foi ao culto <span className="text-[#8A6729]">*</span><input className="form-input mt-1.5 h-11 text-sm" type="date" max={localDateInput()} required value={manualVisitedOn} onChange={event => setManualVisitedOn(event.target.value)}/></label><label className="block text-xs font-medium">Deseja deixar um pedido de oração? <span className="font-normal text-[#68645C]">Opcional</span><textarea className="form-input form-textarea mt-1.5 min-h-[88px] text-sm" maxLength={2000} rows={3} value={manualPrayerRequest} onChange={event => setManualPrayerRequest(event.target.value)} placeholder="Se quiser, escreva aqui seu pedido."/></label><label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-[#FBF9F4] px-3 py-3 text-xs leading-5 text-[#68645C]"><input className="mt-1 size-4 shrink-0 accent-[#8A6729]" type="checkbox" checked={manualContactConsent} onChange={event => setManualContactConsent(event.target.checked)}/><span><span className="font-medium">Aceito receber uma mensagem da equipe de Boas-Vindas.</span><span className="block">Opcional. Você pode concluir sem autorizar contato.</span></span></label>{formError && <p role="alert" className="status-negative rounded-lg border px-3 py-2 text-xs">{formError}</p>}<div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" size="sm" onClick={() => setShowManualForm(false)}>Cancelar</Button><Button type="submit" size="sm"><Plus size={14}/> Concluir</Button></div></form></section></div>}

    {selectedPerson && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedPerson(null) }}><section role="dialog" aria-modal="true" aria-labelledby="visitor-detail-title" className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#8A6729]">Detalhes do visitante</p><h2 id="visitor-detail-title" className="mt-1 text-lg font-semibold">{selectedPerson.fullName}</h2><p className="mt-1 text-xs text-muted">{formatVisitorPhone(selectedPerson.phoneNormalized)}</p></div><button type="button" aria-label="Fechar detalhes" onClick={() => setSelectedPerson(null)} className="rounded-lg p-2 text-muted hover:bg-[#F7F2E8]"><X size={17}/></button></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-[#F7F2E8] p-3"><p className="text-xs uppercase text-muted">Visita mais recente</p><p className="mt-1 text-xs font-medium">{formatDate([...selectedPerson.visits].sort((a, b) => (b.visitedOn ?? b.registeredAt).localeCompare(a.visitedOn ?? a.registeredAt))[0]?.visitedOn ?? [...selectedPerson.visits].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))[0]?.registeredAt ?? '')}</p></div><div className="rounded-lg bg-[#F7F2E8] p-3"><p className="text-xs uppercase text-muted">Primeira visita</p><p className="mt-1 text-xs font-medium">{firstVisit(selectedPerson) ? formatDate(firstVisit(selectedPerson)!) : '—'}</p></div></div><section className="mt-4 rounded-xl border border-[#F0E6D2] p-3.5"><h3 className="flex items-center gap-2 text-xs font-semibold"><HeartIcon/> Pedido de oração</h3>{selectedPerson.prayerRequest ? <p className="mt-2 text-sm leading-6 text-[#68645C]">{selectedPerson.prayerRequest}</p> : <p className="mt-2 text-xs text-muted">Nenhum pedido de oração informado.</p>}</section><p className="mt-4 rounded-lg bg-[#F0E6D2] px-3 py-2 text-xs leading-4 text-[#8A6729]">Os dados deste cadastro são consultados no Supabase e visíveis apenas para a equipe autorizada.</p></section></div>}

    {notePerson && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="visitor-note-title" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#8A6729]">Anotação interna</p><h2 id="visitor-note-title" className="mt-1 text-lg font-semibold">Informações do visitante</h2><p className="mt-1 text-xs text-muted">{notePerson.fullName}</p></div><button type="button" aria-label="Fechar informações" onClick={() => setNotePerson(null)} className="rounded-lg p-2 text-muted hover:bg-[#F7F2E8]"><X size={17}/></button></div><form className="mt-4 space-y-3" onSubmit={saveNote}><label className="block text-xs font-medium">Informação para a equipe<textarea className="form-input form-textarea mt-1.5 min-h-[120px] text-sm" maxLength={4000} value={noteDraft} onChange={event => setNoteDraft(event.target.value)} placeholder="Adicione uma informação importante para o acolhimento deste visitante..."/></label><p className="text-xs text-muted">Esta informação interna fica disponível para a equipe autorizada.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setNotePerson(null)}>Cancelar</Button><Button type="submit" size="sm"><Check size={14}/> Salvar informação</Button></div></form></section></div>}

    {editPerson && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !editSaving) setEditPerson(null) }}><section role="dialog" aria-modal="true" aria-labelledby="edit-visitor-title" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#8A6729]">Cadastro da equipe</p><h2 id="edit-visitor-title" className="mt-1 text-lg font-semibold">Editar visitante</h2><p className="mt-1 text-xs text-muted">Nome e telefone são compartilhados com as outras áreas do sistema.</p></div><button type="button" aria-label="Fechar edição" disabled={editSaving} onClick={() => setEditPerson(null)} className="rounded-lg p-2 text-muted hover:bg-[#F7F2E8] disabled:opacity-50"><X size={17}/></button></div><form className="space-y-3.5" onSubmit={saveVisitorEdit}><label className="block text-xs font-medium">Nome completo <span className="text-[#8A6729]">*</span><input className="form-input mt-1.5 h-11 text-sm" autoComplete="name" maxLength={120} required value={editName} onChange={event => setEditName(event.target.value)}/></label><label className="block text-xs font-medium">Telefone com DDD <span className="text-[#8A6729]">*</span><input className="form-input mt-1.5 h-11 text-sm" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} required value={editPhone} onChange={event => setEditPhone(event.target.value)}/></label><label className="block text-xs font-medium">Dia em que foi ao culto <span className="text-[#8A6729]">*</span><input className="form-input mt-1.5 h-11 text-sm" type="date" max={localDateInput()} required value={editVisitedOn} onChange={event => setEditVisitedOn(event.target.value)}/></label><label className="block text-xs font-medium">Pedido de oração <span className="font-normal text-[#68645C]">Opcional</span><textarea className="form-input form-textarea mt-1.5 min-h-[88px] text-sm" maxLength={2000} rows={3} value={editPrayerRequest} onChange={event => setEditPrayerRequest(event.target.value)} placeholder="Se quiser, escreva o pedido de oração."/></label><label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-[#FBF9F4] px-3 py-3 text-xs leading-5 text-[#68645C]"><input className="mt-1 size-4 shrink-0 accent-[#8A6729]" type="checkbox" checked={editContactConsent} onChange={event => setEditContactConsent(event.target.checked)}/><span><span className="font-medium">Aceita receber uma mensagem da equipe.</span><span className="block">Desmarcar remove o consentimento para contato.</span></span></label>{editError && <p role="alert" className="status-negative rounded-lg border px-3 py-2 text-xs">{editError}</p>}<div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" size="sm" disabled={editSaving} onClick={() => setEditPerson(null)}>Cancelar</Button><Button type="submit" size="sm" disabled={editSaving}><Check size={14}/>{editSaving ? 'Salvando...' : 'Salvar alterações'}</Button></div></form></section></div>}

    {personToDelete && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-visitor-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 id="delete-visitor-title" className="text-lg font-semibold">Excluir cadastro de visitante?</h2><p className="mt-2 text-sm leading-6 text-muted">Isso excluirá <strong>{personToDelete.visits.length} registro(s) de visita</strong> de <strong>{personToDelete.fullName}</strong> e os pedidos de oração associados. Se a pessoa também estiver ligada a decisões ou entregas de mimo, o cadastro central será preservado.</p>{visitorDeleteError && <p role="alert" className="status-negative mt-3 rounded-lg border px-3 py-2 text-sm">{visitorDeleteError}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={visitorDeleting} onClick={() => setPersonToDelete(null)}>Cancelar</Button><Button type="button" size="sm" disabled={visitorDeleting} onClick={() => void deleteVisitor()} className="bg-red-700 text-white hover:bg-red-800">{visitorDeleting ? 'Excluindo...' : 'Excluir cadastro'}</Button></div></section></div>}

  </div>
}

function ExternalLinkIcon() { return <span aria-hidden="true" className="text-xs">↗</span> }
function HeartIcon() { return <span aria-hidden="true" className="text-[#B08A3E]">♡</span> }

