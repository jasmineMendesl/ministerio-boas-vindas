import { useEffect, useMemo, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { Bookmark, CalendarDays, Check, ClipboardCopy, Eye, Gift, MessageSquare, Plus, QrCode, Search, ShieldCheck, UserRound, UsersRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { useAuth } from '../../app/AuthProvider'
import { supabase } from '../../lib/supabase'
import { addManualVisit, buildPublicVisitorUrl, createDemoVisitors, filterVisitors, firstVisit, formatVisitorPhone, type VisitorPerson } from './visitor-data'

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const services = ['Todos os cultos', 'Domingo - Noite (18:30)', 'Domingo Manhã (09:00)']
type ServiceGiftReport = { id: string; serviceDate: string; serviceLabel: string; giftsDelivered: number; responsible: string }
type ServiceGiftReportRow = { id: string; service_date: string; service_label: string; gifts_delivered: number; responsible_user_id: string; responsible_profile: { display_name: string } | null }
function localDateInput() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }

function formatDate(value: string, includeTime = false) {
  return new Date(value).toLocaleString('pt-BR', includeTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' })
}

function MetricCard({ icon: Icon, label, value, helper }: { icon: LucideIcon; label: string; value: string | number; helper: string }) {
  return <article className="flex min-w-0 items-center gap-3 rounded-xl border border-[#E8DED4] bg-white px-3 py-3.5 shadow-[0_2px_7px_rgba(35,47,34,.025)] sm:gap-3.5 sm:px-4"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#F3E9DF] text-[#6F4F28]"><Icon size={17} strokeWidth={1.8}/></div><div className="min-w-0"><p className="truncate text-xs text-[#75675D]">{label}</p><p className="mt-0.5 text-xl font-semibold leading-6 tracking-tight text-[#2B2118]">{value}</p><p className="mt-0.5 truncate text-xs text-[#75675D]">{helper}</p></div></article>
}

export function VisitorsPage() {
  const { session } = useAuth()
  const [people, setPeople] = useState(() => createDemoVisitors())
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [service, setService] = useState(services[0])
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<VisitorPerson | null>(null)
  const [notePerson, setNotePerson] = useState<VisitorPerson | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [copied, setCopied] = useState(false)
  const [giftReports, setGiftReports] = useState<ServiceGiftReport[]>([])
  const [showGiftReport, setShowGiftReport] = useState(false)
  const [giftReportDate, setGiftReportDate] = useState(localDateInput)
  const [giftReportService, setGiftReportService] = useState(services[1])
  const [giftReportQuantity, setGiftReportQuantity] = useState('0')
  const [giftReportError, setGiftReportError] = useState('')
  const [giftReportSaving, setGiftReportSaving] = useState(false)
  const [giftReportsLoading, setGiftReportsLoading] = useState(true)
  const [giftReportsError, setGiftReportsError] = useState('')

  const today = new Date()
  const visitorFormUrl = useMemo(() => buildPublicVisitorUrl(window.location.origin, import.meta.env.BASE_URL), [])
  const filteredPeople = filterVisitors(people, search, month, year, service === services[0] ? undefined : service)
  const bookmarksDelivered = giftReports.reduce((total, report) => total + report.giftsDelivered, 0)
  const qrRegistrations = people.filter(person => person.visits.some(visit => visit.source === 'qr')).length
  const fillRate = people.length ? Math.round((people.filter(person => person.gifts.length > 0).length / people.length) * 100) : 0

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

  useEffect(() => { void loadGiftReports() }, [session?.user.id])
  useEffect(() => {
    let active = true
    QRCode.toDataURL(visitorFormUrl, { width: 144, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#6F4F28', light: '#ffffff' } })
      .then(image => { if (active) setQrImage(image) })
      .catch(() => { if (active) setQrImage('') })
    return () => { active = false }
  }, [visitorFormUrl])

  async function handleGiftReportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setGiftReportError('')
    const quantity = Number(giftReportQuantity)
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000) { setGiftReportError('Informe uma quantidade inteira entre 0 e 1000.'); return }
    if (!supabase || !session?.user.id) { setGiftReportError('Sua sessao nao esta ativa. Entre novamente para registrar.'); return }
    setGiftReportSaving(true)
    const { error } = await supabase.from('visitor_service_gift_reports').insert({
      service_date: giftReportDate, service_label: giftReportService, gifts_delivered: quantity, responsible_user_id: session.user.id,
    })
    setGiftReportSaving(false)
    if (error) {
      setGiftReportError(error.code === '23505' ? 'Ja existe um fechamento para este culto e data.' : 'Nao foi possivel salvar. Confira a conexao e as permissoes do perfil.')
      return
    }
    await loadGiftReports()
    setNotice('Fechamento de mimos registrado no Supabase.')
    setShowGiftReport(false); setGiftReportQuantity('0')
  }
  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError('')
    const result = addManualVisit(people, manualName, manualPhone)
    if (!result.ok) {
      setFormError(result.error === 'name' ? 'Informe um nome válido, com pelo menos 2 caracteres.' : 'Confira o telefone e inclua o DDD.')
      return
    }
    setPeople(result.people)
    setNotice(result.reusedPerson ? 'O cadastro existente foi mantido e uma nova visita foi adicionada à demonstração.' : 'Visitante adicionado à demonstração local.')
    setManualName(''); setManualPhone(''); setShowManualForm(false)
  }

  function registerGift(personId: string) {
    const person = people.find(item => item.id === personId)
    if (!person || person.visits.length !== 1 || person.gifts.length > 0) return
    const delivery = {
      id: globalThis.crypto?.randomUUID?.() ?? `demo-gift-${Date.now()}`,
      deliveredAt: new Date().toISOString(),
      giftType: 'Marca-página de boas-vindas',
      quantity: 1,
      responsible: session?.user.email ?? 'Equipe da recepção',
    }
    setPeople(current => current.map(item => item.id === personId ? { ...item, gifts: [...item.gifts, delivery] } : item))
    setSelectedPerson(current => current?.id === personId ? { ...current, gifts: [...current.gifts, delivery] } : current)
    setNotice('Entrega do marca-página registrada somente nesta demonstração.')
  }

  function openNote(person: VisitorPerson) {
    setNotePerson(person); setNoteDraft(person.staffNote)
  }

  function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!notePerson) return
    setPeople(current => current.map(person => person.id === notePerson.id ? { ...person, staffNote: noteDraft.trim() } : person))
    setNotice('Informação interna salva apenas na demonstração local.')
    setNotePerson(null); setNoteDraft('')
  }

  async function copyVisitorLink() {
    try { await navigator.clipboard.writeText(visitorFormUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2200) }
    catch { setNotice('Não foi possível copiar automaticamente. Selecione e copie o endereço exibido.') }
  }

  const availableYears = Array.from({ length: 5 }, (_, index) => today.getFullYear() - index)

  return <div className="animate-in space-y-3.5 text-[#2B2118] sm:space-y-4">
    <header className="flex flex-col justify-between gap-4 rounded-2xl border border-[#E8DED4] bg-[linear-gradient(110deg,#fff_0%,#fff_72%,#F3E9DF_100%)] p-5 shadow-[0_3px_14px_rgba(60,42,28,.035)] sm:flex-row sm:items-center sm:px-7 sm:py-6">
      <div><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3E9DF] px-3 py-1.5 text-xs font-semibold text-[#6F4F28]"><UsersRound size={13}/>MÓDULO DE ACOLHIMENTO</span><span className="text-xs text-[#75675D]">· Demonstração local</span></div><h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Visitantes</h1><p className="mt-1 text-sm text-[#75675D]">Responsável pelo acolhimento das pessoas que visitam a igreja</p></div>
      <Button size="sm" className="h-10 self-start rounded-lg bg-[#6F4F28] px-4 text-sm hover:bg-[#5C3F20] sm:self-auto" onClick={() => { setFormError(''); setShowManualForm(true) }}><Plus size={15}/> Cadastrar Visitante</Button>
    </header>

    <div role="status" className="flex items-center gap-2 rounded-lg border border-[#F3E9DF] bg-[#F3E9DF] px-3 py-2 text-xs leading-4 text-[#6F4F28]"><ShieldCheck size={14} className="shrink-0"/><span><strong>Demonstração da lista.</strong> Visitantes e pedidos de oração são exemplos locais; fechamentos de mimos são salvos no Supabase.</span></div>
    {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2 text-xs"><span>{notice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15}/></button></div>}

    <section aria-label="Indicadores de visitantes" className="grid gap-2.5 sm:grid-cols-3">
      <MetricCard icon={Bookmark} label="Mimos reportados" value={bookmarksDelivered} helper="Soma dos fechamentos de culto"/>
      <MetricCard icon={QrCode} label="Cadastros via QR Code" value={qrRegistrations} helper="Visitantes fictícios da demonstração"/>
      <MetricCard icon={UsersRound} label="Taxa de Preenchimento" value={`${fillRate}%`} helper="Conversão dos marca-páginas entregues"/>
    </section>

    <section aria-labelledby="gift-report-title" className="overflow-hidden rounded-xl border border-[#E8DED4] bg-white shadow-[0_2px_7px_rgba(35,47,34,.025)]">
      <div className="flex flex-col gap-3 border-b border-[#F8F2EC] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 id="gift-report-title" className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={17} className="text-[#6F4F28]"/>Fechamento de mimos por culto</h2><p className="mt-1 text-xs text-[#75675D]">O líder, entre os 6 voluntários do culto, informa a data e a quantidade entregue. O sistema identifica quem registrou.</p></div><Button type="button" size="sm" onClick={() => { setGiftReportError(''); setGiftReportDate(localDateInput()); setShowGiftReport(true) }} className="h-9 self-start rounded-lg bg-[#6F4F28] px-3 text-xs hover:bg-[#5C3F20] sm:self-auto"><Plus size={14}/> Registrar fechamento</Button></div>
      {giftReportsError && <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{giftReportsError}</p>}{giftReportsLoading ? <p className="px-4 py-5 text-xs text-[#75675D]">Carregando fechamentos...</p> : giftReports.length ? <div className="overflow-x-auto"><table className="w-full min-w-[460px] text-left text-sm"><thead className="bg-[#FBF8F4] text-xs text-[#75675D]"><tr><th className="px-4 py-2.5 font-medium">Data</th><th className="px-4 py-2.5 font-medium">Culto</th><th className="px-4 py-2.5 font-medium">Mimos entregues</th><th className="px-4 py-2.5 font-medium">Registrado por</th></tr></thead><tbody>{giftReports.map(report => <tr key={report.id} className="border-t border-[#F8F2EC]"><td className="px-4 py-3">{new Date(report.serviceDate + 'T12:00:00').toLocaleDateString('pt-BR')}</td><td className="px-4 py-3">{report.serviceLabel}</td><td className="px-4 py-3 font-semibold">{report.giftsDelivered}</td><td className="px-4 py-3 text-xs text-[#75675D]">{report.responsible}</td></tr>)}</tbody></table><p className="border-t border-[#F8F2EC] px-4 py-2 text-xs text-[#75675D]">Registros salvos no Supabase; total acumulado: {bookmarksDelivered} mimo(s).</p></div> : <p className="px-4 py-5 text-xs text-[#75675D]">Nenhum fechamento registrado nesta demonstracao. Registre o total ao final de cada culto.</p>}
    </section>

    <section aria-labelledby="visitor-list-title" className="overflow-hidden rounded-xl border border-[#E8DED4] bg-white shadow-[0_2px_7px_rgba(35,47,34,.025)]">
      <div className="grid gap-3 border-b border-[#F8F2EC] px-3 py-3 sm:grid-cols-[minmax(180px,1fr)_minmax(360px,1.6fr)] sm:items-center sm:px-4">
        <div><h2 id="visitor-list-title" className="text-[13px] font-semibold">Visitantes Cadastrados</h2><p className="mt-0.5 text-xs text-[#75675D]">Preenchimento em tempo real no culto · demonstração local</p></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(130px,1fr)_minmax(140px,1fr)_100px_76px]">
          <label className="relative col-span-2 block sm:col-span-1"><span className="sr-only">Buscar nome ou WhatsApp</span><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#75675D]"/><input className="h-9 w-full rounded-lg border border-[#E8DED4] bg-[#FBF8F4] pl-8 pr-2 text-xs outline-none focus:border-[#A67B5B]" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou WhatsApp..."/></label>
          <label className="sr-only" htmlFor="visitor-service">Filtrar culto</label><select id="visitor-service" className="h-9 min-w-0 rounded-lg border border-[#E8DED4] bg-white px-2 text-xs" value={service} onChange={event => setService(event.target.value)}>{services.map(label => <option key={label}>{label}</option>)}</select>
          <label className="sr-only" htmlFor="visitor-month">Filtrar mês</label><select id="visitor-month" className="h-9 min-w-0 rounded-lg border border-[#E8DED4] bg-white px-2 text-xs" value={month} onChange={event => setMonth(Number(event.target.value))}><option value={0}>Todos</option>{months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select>
          <label className="sr-only" htmlFor="visitor-year">Filtrar ano</label><select id="visitor-year" className="h-9 min-w-0 rounded-lg border border-[#E8DED4] bg-white px-2 text-xs" value={year} onChange={event => setYear(Number(event.target.value))}><option value={0}>Todos</option>{availableYears.map(value => <option key={value}>{value}</option>)}</select>
        </div>
      </div>

      <div className="overflow-x-auto">
          <div className="min-w-[600px]">
          <div className="grid grid-cols-[minmax(140px,1.5fr)_minmax(95px,1fr)_minmax(86px,.9fr)_minmax(110px,1fr)_76px] gap-1.5 bg-[#FBF8F4] px-2 py-2 text-xs font-semibold uppercase tracking-wide text-[#75675D] sm:gap-2 sm:px-3"><span>Nome do visitante</span><span>WhatsApp</span><span>Culto registrado</span><span>Data e envio</span><span className="text-center">Ações</span></div>
          {filteredPeople.map(person => {
            const latestVisit = [...person.visits].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))[0]
            return <article key={person.id} className="grid grid-cols-[minmax(140px,1.5fr)_minmax(95px,1fr)_minmax(86px,.9fr)_minmax(110px,1fr)_76px] items-center gap-1.5 border-t border-[#F8F2EC] px-2 py-2.5 sm:gap-2 sm:px-3">
              <div className="flex min-w-0 items-center gap-2"><span className={`grid size-8 shrink-0 place-items-center rounded-lg bg-[#F3E9DF] text-[#6F4F28]`}><UserRound size={15}/></span><div className="min-w-0"><p className="truncate text-xs font-semibold">{person.fullName}</p><p className="truncate text-xs text-[#75675D]">{latestVisit?.source === 'qr' ? 'Marca-página da Recepção' : 'Cadastro da Equipe'}</p></div></div>
              <span className="text-xs text-[#5C3F20]">{formatVisitorPhone(person.phoneNormalized)}</span>
              <span className="text-xs">{latestVisit ? formatDate(latestVisit.registeredAt) : '—'}</span>
              <span className="text-xs leading-4"><span className="block">{latestVisit ? new Date(latestVisit.registeredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span><span className="text-[#75675D]">{latestVisit ? formatDate(latestVisit.registeredAt) : '—'}</span></span>

              <div className="flex items-center justify-center gap-1"><button type="button" aria-label={`Ver detalhes de ${person.fullName}`} title="Ver detalhes e pedido de oração" onClick={() => setSelectedPerson(person)} className="grid size-8 place-items-center rounded-md bg-[#6F4F28] text-white transition-colors hover:bg-[#5C3F20]"><Eye size={15}/></button><button type="button" aria-label={`Adicionar informação para ${person.fullName}`} title="Adicionar informação" onClick={() => openNote(person)} className="grid size-7 place-items-center rounded-md bg-[#F3E9DF] text-[#75675D] hover:bg-[#F3E9DF]"><MessageSquare size={13}/></button></div>
            </article>
          })}
          {filteredPeople.length === 0 && <div className="px-5 py-10 text-center text-xs text-[#75675D]">Nenhum visitante encontrado para os filtros selecionados.</div>}
          <div className="flex items-center justify-between border-t border-[#F8F2EC] px-3 py-2 text-xs text-[#75675D] sm:px-4"><span>Exibindo {filteredPeople.length} de {people.length} visitantes cadastrados na demonstração</span><span>Página 1 de 1</span></div>
        </div>
      </div>
    </section>

    <section aria-labelledby="visitor-qr-title" className="rounded-xl border border-[#E8DED4] bg-white p-3.5 shadow-[0_2px_7px_rgba(35,47,34,.025)] sm:p-4">
      <h2 id="visitor-qr-title" className="sr-only">Formulário de visitantes</h2>
      <div className="mx-auto flex max-w-sm flex-col items-center py-2 text-center sm:py-3"><div className="grid size-[138px] place-items-center rounded-xl border border-[#E8DED4] bg-white p-2 shadow-sm">{qrImage ? <img src={qrImage} alt="QR Code do formulário de visitantes" width={120} height={120}/> : <QrCode size={45} className="text-[#6F4F28]"/>}</div><a className="mt-3 max-w-full break-all font-mono text-sm text-[#6F4F28] underline underline-offset-2" href={visitorFormUrl} target="_blank" rel="noreferrer">{visitorFormUrl}</a><div className="mt-3 flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={copyVisitorLink} className="h-9 rounded-lg bg-[#F3E9DF] px-3 text-sm"><ClipboardCopy size={14}/>{copied ? 'Link copiado' : 'Copiar link'}</Button><a className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#6F4F28] px-3 text-sm font-medium text-white hover:bg-[#5C3F20]" href={visitorFormUrl} target="_blank" rel="noreferrer">Abrir formulário <ExternalLinkIcon/></a></div></div>
    </section>

    {showGiftReport && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowGiftReport(false) }}><section role="dialog" aria-modal="true" aria-labelledby="gift-report-form-title" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Fechamento do culto</p><h2 id="gift-report-form-title" className="mt-1 text-lg font-semibold">Registrar mimos entregues</h2><p className="mt-1 text-xs text-muted">Informe quantos foram entregues neste culto.</p></div><button type="button" aria-label="Fechar formulário" onClick={() => setShowGiftReport(false)} className="rounded-lg p-2 text-muted hover:bg-[#F8F2EC]"><X size={17}/></button></div><form className="space-y-3" onSubmit={handleGiftReportSubmit}><label className="block text-xs font-medium">Dia do culto<input className="form-input mt-1.5 h-10 text-sm" type="date" required value={giftReportDate} onChange={event => setGiftReportDate(event.target.value)}/></label><label className="block text-xs font-medium">Culto<select className="form-input mt-1.5 h-10 text-sm" value={giftReportService} onChange={event => setGiftReportService(event.target.value)}>{services.slice(1).map(label => <option key={label}>{label}</option>)}</select></label><label className="block text-xs font-medium">Quantidade de mimos<input className="form-input mt-1.5 h-10 text-sm" type="number" min="0" max="1000" step="1" required value={giftReportQuantity} onChange={event => setGiftReportQuantity(event.target.value)}/></label><div className="rounded-lg bg-[#F8F2EC] px-3 py-2 text-xs text-[#5C5147]">Líder responsável: <strong>{session?.user.email ?? 'Equipe de acolhimento'}</strong></div>{giftReportError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{giftReportError}</p>}<p className="text-xs text-muted">O fechamento será associado à sua conta e ficará disponível à equipe autorizada.</p><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" size="sm" onClick={() => setShowGiftReport(false)}>Cancelar</Button><Button type="submit" size="sm" disabled={giftReportSaving}>{giftReportSaving ? 'Salvando...' : <><Check size={14}/> Salvar fechamento</>}</Button></div></form></section></div>}

    {showManualForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowManualForm(false) }}><section role="dialog" aria-modal="true" aria-labelledby="manual-visitor-title" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Cadastro interno · demonstração</p><h2 id="manual-visitor-title" className="mt-1 text-lg font-semibold">Cadastrar visitante</h2><p className="mt-1 text-xs text-muted">A visita será registrada com data e horário atuais.</p></div><button type="button" aria-label="Fechar formulário" onClick={() => setShowManualForm(false)} className="rounded-lg p-2 text-muted hover:bg-[#F8F2EC]"><X size={17}/></button></div><form className="space-y-3" onSubmit={handleManualSubmit}><label className="block text-xs font-medium">Nome completo<input className="form-input mt-1.5 h-10 text-sm" autoComplete="name" maxLength={120} required value={manualName} onChange={event => setManualName(event.target.value)} placeholder="Nome da pessoa"/></label><label className="block text-xs font-medium">WhatsApp / Telefone<input className="form-input mt-1.5 h-10 text-sm" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} required value={manualPhone} onChange={event => setManualPhone(event.target.value)} placeholder="(11) 90000-0000"/></label>{formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p>}<div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" size="sm" onClick={() => setShowManualForm(false)}>Cancelar</Button><Button type="submit" size="sm"><Plus size={14}/> Cadastrar</Button></div></form></section></div>}

    {selectedPerson && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedPerson(null) }}><section role="dialog" aria-modal="true" aria-labelledby="visitor-detail-title" className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#6F4F28]">Detalhes do visitante · exemplo fictício</p><h2 id="visitor-detail-title" className="mt-1 text-lg font-semibold">{selectedPerson.fullName}</h2><p className="mt-1 text-xs text-muted">{formatVisitorPhone(selectedPerson.phoneNormalized)}</p></div><button type="button" aria-label="Fechar detalhes" onClick={() => setSelectedPerson(null)} className="rounded-lg p-2 text-muted hover:bg-[#F8F2EC]"><X size={17}/></button></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-[#F8F2EC] p-3"><p className="text-xs uppercase text-muted">Culto registrado</p><p className="mt-1 text-xs font-medium">{[...selectedPerson.visits].sort((a,b) => b.registeredAt.localeCompare(a.registeredAt))[0]?.serviceLabel}</p></div><div className="rounded-lg bg-[#F8F2EC] p-3"><p className="text-xs uppercase text-muted">Primeira visita</p><p className="mt-1 text-xs font-medium">{firstVisit(selectedPerson) ? formatDate(firstVisit(selectedPerson)!) : '—'}</p></div></div><section className="mt-4 rounded-xl border border-[#F3E9DF] p-3.5"><h3 className="flex items-center gap-2 text-xs font-semibold"><HeartIcon/> Pedido de oração</h3>{selectedPerson.prayerRequest ? <p className="mt-2 text-sm leading-6 text-[#75675D]">{selectedPerson.prayerRequest}</p> : <p className="mt-2 text-xs text-muted">Nenhum pedido de oração informado neste exemplo.</p>}</section><div className="mt-4 flex items-center justify-between gap-3"><div><p className="text-xs uppercase text-muted">Marca-página / Kit</p><p className="mt-1 text-xs font-medium">{selectedPerson.gifts.length ? `Entregue em ${formatDate(selectedPerson.gifts[0].deliveredAt)}` : 'Sem entrega registrada'}</p></div>{selectedPerson.gifts[0]?.responsible && <p className="text-right text-xs text-muted">Responsável<br/><span className="font-medium text-foreground">{selectedPerson.gifts[0].responsible}</span></p>}</div>{selectedPerson.visits.length === 1 && selectedPerson.gifts.length === 0 && <Button type="button" onClick={() => registerGift(selectedPerson.id)} className="mt-4 h-9 w-full rounded-lg bg-[#6F4F28] text-xs hover:bg-[#5C3F20]"><Gift size={15}/> Registrar entrega de marca-página</Button>}<p className="mt-4 rounded-lg bg-[#F3E9DF] px-3 py-2 text-xs leading-4 text-[#6F4F28]">Este é um registro fictício de demonstração; o pedido não foi consultado no Supabase.</p></section></div>}

    {notePerson && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="visitor-note-title" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#6F4F28]">Anotação interna · demonstração</p><h2 id="visitor-note-title" className="mt-1 text-lg font-semibold">Informações do visitante</h2><p className="mt-1 text-xs text-muted">{notePerson.fullName}</p></div><button type="button" aria-label="Fechar informações" onClick={() => setNotePerson(null)} className="rounded-lg p-2 text-muted hover:bg-[#F8F2EC]"><X size={17}/></button></div><form className="mt-4 space-y-3" onSubmit={saveNote}><label className="block text-xs font-medium">Informação para a equipe<textarea className="form-input form-textarea mt-1.5 min-h-[120px] text-sm" maxLength={4000} value={noteDraft} onChange={event => setNoteDraft(event.target.value)} placeholder="Adicione uma informação importante para o acolhimento deste visitante..."/></label><p className="text-xs text-muted">O conteúdo fica somente nesta demonstração e será apagado ao recarregar a página.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setNotePerson(null)}>Cancelar</Button><Button type="submit" size="sm"><Check size={14}/> Salvar informação</Button></div></form></section></div>}

  </div>
}

function ExternalLinkIcon() { return <span aria-hidden="true" className="text-xs">↗</span> }
function HeartIcon() { return <span aria-hidden="true" className="text-[#9B5C42]">♡</span> }
