import { useEffect, useMemo, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  ExternalLink,
  Gift,
  History,
  Plus,
  QrCode,
  Search,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { useAuth } from '../../app/AuthProvider'
import {
  addManualVisit,
  buildPublicVisitorUrl,
  createDemoVisitors,
  filterVisitors,
  firstVisit,
  formatVisitorPhone,
} from './visitor-data'

const months = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function formatDate(value: string, includeTime = false) {
  return new Date(value).toLocaleString('pt-BR', includeTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'medium' })
}

function isSameLocalDay(left: string, right: Date) {
  const date = new Date(left)
  return date.getFullYear() === right.getFullYear()
    && date.getMonth() === right.getMonth()
    && date.getDate() === right.getDate()
}

function MetricCard({ icon: Icon, label, value, helper }: {
  icon: LucideIcon
  label: string
  value: number
  helper: string
}) {
  return <article className="panel flex min-w-0 items-start gap-4 p-4 sm:p-5">
    <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#eef1e9] text-primary"><Icon size={19} strokeWidth={1.8} /></div>
    <div className="min-w-0"><p className="text-xs font-medium text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-[11px] text-muted">{helper}</p></div>
  </article>
}

export function VisitorsPage() {
  const { session } = useAuth()
  const [people, setPeople] = useState(() => createDemoVisitors())
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [qrImage, setQrImage] = useState('')
  const [copied, setCopied] = useState(false)

  const today = new Date()
  const currentMonth = today.getMonth() + 1
  const currentYear = today.getFullYear()
  const visitorFormUrl = useMemo(
    () => buildPublicVisitorUrl(window.location.origin, import.meta.env.BASE_URL),
    [],
  )
  const filteredPeople = filterVisitors(people, search, month, year)
  const selectedPerson = people.find(person => person.id === selectedPersonId) ?? null
  const visitorsThisMonth = filterVisitors(people, '', currentMonth, currentYear).length
  const visitorsToday = people.filter(person => person.visits.some(visit => isSameLocalDay(visit.registeredAt, today))).length
  const giftsThisMonth = people.reduce((total, person) => total + person.gifts
    .filter(gift => {
      const deliveredAt = new Date(gift.deliveredAt)
      return deliveredAt.getMonth() + 1 === currentMonth && deliveredAt.getFullYear() === currentYear
    })
    .reduce((quantity, gift) => quantity + gift.quantity, 0), 0)

  useEffect(() => {
    let active = true
    QRCode.toDataURL(visitorFormUrl, {
      width: 176,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#425b46', light: '#ffffff' },
    }).then(image => {
      if (active) setQrImage(image)
    }).catch(() => {
      if (active) setQrImage('')
    })
    return () => { active = false }
  }, [visitorFormUrl])

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    const result = addManualVisit(people, manualName, manualPhone)
    if (!result.ok) {
      setFormError(result.error === 'name'
        ? 'Informe um nome válido, com pelo menos 2 caracteres.'
        : 'Confira o telefone e inclua o DDD.')
      return
    }

    setPeople(result.people)
    setNotice(result.reusedPerson
      ? 'Este telefone já tinha cadastro: uma nova visita foi adicionada à mesma pessoa.'
      : 'Pessoa e primeira visita adicionadas aos dados de demonstração.')
    setManualName('')
    setManualPhone('')
    setShowManualForm(false)
  }

  function registerGift(personId: string) {
    const deliveredAt = new Date().toISOString()
    const delivery = {
      id: globalThis.crypto?.randomUUID?.() ?? `demo-gift-${Date.now()}`,
      deliveredAt,
      giftType: 'Lembrancinha de boas-vindas',
      quantity: 1,
      responsible: session?.user.email ?? null,
    }
    setPeople(current => current.map(person => person.id === personId
      ? { ...person, gifts: [...person.gifts, delivery] }
      : person))
    setNotice('Entrega adicionada aos dados de demonstração. Ela não foi gravada no Supabase.')
  }

  async function copyVisitorLink() {
    try {
      await navigator.clipboard.writeText(visitorFormUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopied(false)
    }
  }

  const availableYears = Array.from({ length: 5 }, (_, index) => currentYear - index)

  return <div className="animate-in space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.17em] text-primary">Acolhimento</p><h1 className="text-3xl font-semibold tracking-tight sm:text-[34px]">Visitantes</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted">Cadastros, visitas e lembrancinhas em um só lugar.</p></div>
      <Button onClick={() => { setFormError(''); setShowManualForm(true) }}><Plus size={17} /> Cadastrar visitante</Button>
    </header>

    <div role="status" className="flex items-start gap-3 rounded-2xl border border-[#d6dfc4] bg-[#eef1e9] px-4 py-3 text-sm text-[#354c38]">
      <span className="mt-0.5 rounded-full bg-white p-1 text-primary"><Check size={14} /></span>
      <p><strong>Modo de demonstração.</strong> Os visitantes e ações abaixo são fictícios, ficam somente na memória desta página e são descartados ao recarregar. Nenhum dado pessoal foi consultado ou gravado no Supabase.</p>
    </div>

    {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground"><span>{notice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={16} /></button></div>}

    <section aria-label="Indicadores de visitantes" className="grid gap-3 sm:grid-cols-3">
      <MetricCard icon={UsersRound} label="Visitantes do mês" value={visitorsThisMonth} helper="Pessoas únicas neste mês" />
      <MetricCard icon={CalendarDays} label="Visitantes de hoje" value={visitorsToday} helper="Pessoas únicas hoje" />
      <MetricCard icon={Gift} label="Lembrancinhas entregues" value={giftsThisMonth} helper="Unidades neste mês" />
    </section>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_286px]">
      <section aria-labelledby="visitor-list-title" className="min-w-0">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 id="visitor-list-title" className="text-lg font-semibold">Lista de visitantes</h2><p className="mt-1 text-xs text-muted">{filteredPeople.length} {filteredPeople.length === 1 ? 'pessoa' : 'pessoas'} no período</p></div>
          <div className="grid gap-2 sm:grid-cols-[minmax(210px,1fr)_150px_120px] lg:w-[min(100%,620px)]">
            <label className="relative block"><span className="sr-only">Pesquisar por nome ou telefone</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="form-input h-10 pl-9" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou telefone" /></label>
            <label className="sr-only" htmlFor="visitor-month">Filtrar por mês</label><select id="visitor-month" className="form-input h-10" value={month} onChange={event => setMonth(Number(event.target.value))}><option value={0}>Todos os meses</option>{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select>
            <label className="sr-only" htmlFor="visitor-year">Filtrar por ano</label><select id="visitor-year" className="form-input h-10" value={year} onChange={event => setYear(Number(event.target.value))}><option value={0}>Todos os anos</option>{availableYears.map(value => <option key={value} value={value}>{value}</option>)}</select>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="hidden grid-cols-[minmax(160px,1.4fr)_minmax(130px,1fr)_minmax(120px,1fr)_minmax(130px,1fr)_auto] gap-3 bg-[#f6f7f3] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted md:grid"><span>Pessoa</span><span>Telefone</span><span>Primeira visita</span><span>Lembrancinha</span><span className="sr-only">Ações</span></div>
          {filteredPeople.map(person => {
            const first = firstVisit(person)
            const latestGift = [...person.gifts].sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt))[0]
            return <article key={person.id} className="grid gap-3 border-t border-border p-4 first:border-t-0 md:grid-cols-[minmax(160px,1.4fr)_minmax(130px,1fr)_minmax(120px,1fr)_minmax(130px,1fr)_auto] md:items-center">
              <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef1e9] text-primary"><UserRound size={17} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{person.fullName}</p><p className="text-xs text-muted">{person.visits.length} {person.visits.length === 1 ? 'visita' : 'visitas'}</p></div></div>
              <div className="flex items-baseline justify-between gap-3 md:block"><span className="text-xs text-muted md:hidden">Telefone</span><span className="text-sm">{formatVisitorPhone(person.phoneNormalized)}</span></div>
              <div className="flex items-baseline justify-between gap-3 md:block"><span className="text-xs text-muted md:hidden">Primeira visita</span><span className="text-sm">{first ? formatDate(first) : '—'}</span></div>
              <div className="flex items-baseline justify-between gap-3 md:block"><span className="text-xs text-muted md:hidden">Lembrancinha</span>{latestGift ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"><CheckCircle2 size={14} /> Entregue · {formatDate(latestGift.deliveredAt)}</span> : <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Clock3 size={14} /> Pendente</span>}</div>
              <Button type="button" variant="outline" size="sm" className="w-full md:w-auto" onClick={() => setSelectedPersonId(person.id)}>Detalhes <History size={14} /></Button>
            </article>
          })}
          {filteredPeople.length === 0 && <div className="px-5 py-12 text-center"><div className="empty-icon mx-auto"><Search size={21} /></div><h3 className="mt-4 font-semibold">Nenhum visitante encontrado</h3><p className="mt-1 text-sm text-muted">Tente outro nome, telefone ou período.</p></div>}
        </div>
      </section>

      <aside className="panel flex flex-col items-center p-5 text-center">
        <div className="flex w-full items-start justify-between text-left"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Formulário público</p><h2 className="mt-1 text-base font-semibold">QR Code de cadastro</h2></div><span className="rounded-full bg-[#eef1e9] px-2.5 py-1 text-[10px] font-medium text-primary">/visitante</span></div>
        <div className="my-4 grid min-h-[192px] min-w-[192px] place-items-center rounded-2xl border border-border bg-white p-2">{qrImage ? <img src={qrImage} alt="QR Code para abrir o formulário público de visitantes" width={176} height={176} /> : <QrCode size={42} className="text-muted" />}</div>
        <p className="break-all text-[11px] leading-5 text-muted">{visitorFormUrl}</p>
        <div className="mt-4 grid w-full grid-cols-2 gap-2"><Button type="button" variant="outline" size="sm" onClick={copyVisitorLink}><ClipboardCopy size={14} />{copied ? 'Copiado' : 'Copiar link'}</Button><a className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90" href={visitorFormUrl} target="_blank" rel="noreferrer">Abrir formulário <ExternalLink size={14} /></a></div>
      </aside>
    </div>

    {showManualForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowManualForm(false) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="manual-visitor-title" className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Cadastro interno</p><h2 id="manual-visitor-title" className="mt-1 text-xl font-semibold">Adicionar visitante</h2><p className="mt-1 text-sm text-muted">A data e o horário da visita serão registrados automaticamente.</p></div><button type="button" aria-label="Fechar formulário" onClick={() => setShowManualForm(false)} className="rounded-lg p-2 text-muted hover:bg-[#f6f7f3]"><X size={18} /></button></div>
        <form className="space-y-4" onSubmit={handleManualSubmit}>
          <label className="block text-sm font-medium">Nome<input className="form-input mt-2" autoComplete="name" maxLength={120} required value={manualName} onChange={event => setManualName(event.target.value)} placeholder="Nome da pessoa" /></label>
          <label className="block text-sm font-medium">Telefone com DDD<input className="form-input mt-2" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} required value={manualPhone} onChange={event => setManualPhone(event.target.value)} placeholder="(11) 99999-0000" /></label>
          {formError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setShowManualForm(false)}>Cancelar</Button><Button type="submit"><Plus size={16} /> Adicionar visita</Button></div>
        </form>
      </section>
    </div>}

    {selectedPerson && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedPersonId(null) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="visitor-detail-title" className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#eef1e9] text-primary"><UserRound size={21} /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Detalhes da pessoa</p><h2 id="visitor-detail-title" className="truncate text-xl font-semibold">{selectedPerson.fullName}</h2><p className="mt-0.5 text-sm text-muted">{formatVisitorPhone(selectedPerson.phoneNormalized)}</p></div></div><button type="button" aria-label="Fechar detalhes" onClick={() => setSelectedPersonId(null)} className="rounded-lg p-2 text-muted hover:bg-[#f6f7f3]"><X size={18} /></button></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#f6f7f3] p-3"><p className="text-xs text-muted">Primeira visita</p><p className="mt-1 text-sm font-medium">{firstVisit(selectedPerson) ? formatDate(firstVisit(selectedPerson)!) : '—'}</p></div><div className="rounded-2xl bg-[#f6f7f3] p-3"><p className="text-xs text-muted">Total de visitas</p><p className="mt-1 text-sm font-medium">{selectedPerson.visits.length}</p></div></div>
        <div className="mt-6 flex items-center justify-between gap-3"><h3 className="font-semibold">Histórico de visitas</h3><span className="text-xs text-muted">Mais recentes primeiro</span></div>
        <ol className="mt-3 max-h-48 space-y-2 overflow-y-auto">{[...selectedPerson.visits].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt)).map(visit => <li key={visit.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"><span className="flex items-center gap-2 text-sm"><CalendarDays size={15} className="text-primary" />{formatDate(visit.registeredAt, true)}</span><span className="rounded-full bg-[#eef1e9] px-2.5 py-1 text-[10px] font-medium text-primary">{visit.source === 'qr' ? 'QR Code' : 'Cadastro da equipe'}</span></li>)}</ol>
        <div className="mt-6 flex items-center justify-between gap-3"><h3 className="font-semibold">Lembrancinhas</h3><Button type="button" size="sm" onClick={() => registerGift(selectedPerson.id)}><Gift size={15} /> Registrar entrega</Button></div>
        {selectedPerson.gifts.length ? <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto">{[...selectedPerson.gifts].sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt)).map(gift => <li key={gift.id} className="rounded-xl border border-border px-3 py-2.5"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{gift.giftType} · {gift.quantity} un.</span><span className="text-xs text-muted">{formatDate(gift.deliveredAt, true)}</span></div><p className="mt-1 text-xs text-muted">Responsável: {gift.responsible ?? 'não vinculado a usuário'}</p></li>)}</ul> : <p className="mt-3 rounded-xl bg-[#f6f7f3] p-3 text-sm text-muted">Nenhuma entrega registrada neste exemplo.</p>}
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-[#eef1e9] p-3 text-xs leading-5 text-[#354c38]"><Check size={14} className="mt-0.5 shrink-0" /> Alterações desta demonstração ficam apenas na memória da página e não são salvas no Supabase.</p>
      </section>
    </div>}
  </div>
}
