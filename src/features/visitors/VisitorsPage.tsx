import { useEffect, useMemo, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { Bookmark, CalendarDays, Check, CheckCircle2, ClipboardCopy, Clock3, Download, Eye, Gift, MessageSquare, Plus, QrCode, Search, ShieldCheck, UserRound, UsersRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { useAuth } from '../../app/AuthProvider'
import { addManualVisit, buildPublicVisitorUrl, createDemoVisitors, filterVisitors, firstVisit, formatVisitorPhone, type VisitorPerson } from './visitor-data'

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const services = ['Todos os cultos', 'Domingo - Noite (18:30)', 'Domingo Manhã (09:00)']

function formatDate(value: string, includeTime = false) {
  return new Date(value).toLocaleString('pt-BR', includeTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' })
}

function MetricCard({ icon: Icon, label, value, helper }: { icon: LucideIcon; label: string; value: string | number; helper: string }) {
  return <article className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e4e5df] bg-white px-3 py-3.5 shadow-[0_2px_7px_rgba(35,47,34,.025)] sm:gap-3.5 sm:px-4"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#f1f0eb] text-[#426b54]"><Icon size={17} strokeWidth={1.8}/></div><div className="min-w-0"><p className="truncate text-[10px] text-[#69746a]">{label}</p><p className="mt-0.5 text-xl font-semibold leading-6 tracking-tight text-[#222820]">{value}</p><p className="mt-0.5 truncate text-[9px] text-[#7a8279]">{helper}</p></div></article>
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

  const today = new Date()
  const visitorFormUrl = useMemo(() => buildPublicVisitorUrl(window.location.origin, import.meta.env.BASE_URL), [])
  const filteredPeople = filterVisitors(people, search, month, year, service === services[0] ? undefined : service)
  const bookmarksDelivered = people.reduce((total, person) => total + person.gifts.reduce((sum, gift) => sum + gift.quantity, 0), 0)
  const qrRegistrations = people.filter(person => person.visits.some(visit => visit.source === 'qr')).length
  const fillRate = people.length ? Math.round((people.filter(person => person.gifts.length > 0).length / people.length) * 100) : 0

  useEffect(() => {
    let active = true
    QRCode.toDataURL(visitorFormUrl, { width: 144, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#3d684f', light: '#ffffff' } })
      .then(image => { if (active) setQrImage(image) })
      .catch(() => { if (active) setQrImage('') })
    return () => { active = false }
  }, [visitorFormUrl])

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

  return <div className="animate-in space-y-3.5 text-[#222820] sm:space-y-4">
    <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-[25px] font-semibold leading-7 tracking-tight">Visitantes</h1><p className="mt-1 text-[11px] text-[#6d766d]">Responsável pelo acolhimento das pessoas que visitam a igreja</p></div>
      <Button size="sm" className="h-9 self-start rounded-lg bg-[#3d684f] px-3 text-[11px] hover:bg-[#345941] sm:self-auto" onClick={() => { setFormError(''); setShowManualForm(true) }}><Plus size={14}/> Cadastrar Visitante</Button>
    </header>

    <div role="status" className="flex items-center gap-2 rounded-lg border border-[#dce7da] bg-[#eff5ec] px-3 py-2 text-[10px] leading-4 text-[#3c6048]"><ShieldCheck size={14} className="shrink-0"/><span><strong>Demonstração fictícia.</strong> Cadastros, pedidos de oração e ações são exemplos locais; nada é consultado ou salvo no Supabase.</span></div>
    {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2 text-xs"><span>{notice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15}/></button></div>}

    <section aria-label="Indicadores de visitantes" className="grid gap-2.5 sm:grid-cols-3">
      <MetricCard icon={Bookmark} label="Marca-páginas Entregues" value={bookmarksDelivered} helper="Entregues pela recepção no culto"/>
      <MetricCard icon={QrCode} label="Cadastros via QR Code" value={qrRegistrations} helper="Visitantes fictícios da demonstração"/>
      <MetricCard icon={UsersRound} label="Taxa de Preenchimento" value={`${fillRate}%`} helper="Conversão dos marca-páginas entregues"/>
    </section>

    <section aria-labelledby="visitor-list-title" className="overflow-hidden rounded-xl border border-[#e4e5df] bg-white shadow-[0_2px_7px_rgba(35,47,34,.025)]">
      <div className="grid gap-3 border-b border-[#ecece7] px-3 py-3 sm:grid-cols-[minmax(180px,1fr)_minmax(360px,1.6fr)] sm:items-center sm:px-4">
        <div><h2 id="visitor-list-title" className="text-[13px] font-semibold">Visitantes Cadastrados</h2><p className="mt-0.5 text-[9px] text-[#7a8279]">Preenchimento em tempo real no culto · demonstração local</p></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(130px,1fr)_minmax(140px,1fr)_100px_76px]">
          <label className="relative col-span-2 block sm:col-span-1"><span className="sr-only">Buscar nome ou WhatsApp</span><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#828a81]"/><input className="h-8 w-full rounded-lg border border-[#e2e4de] bg-[#fbfbf9] pl-8 pr-2 text-[10px] outline-none focus:border-[#879b7f]" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou WhatsApp..."/></label>
          <label className="sr-only" htmlFor="visitor-service">Filtrar culto</label><select id="visitor-service" className="h-8 min-w-0 rounded-lg border border-[#e2e4de] bg-white px-2 text-[10px]" value={service} onChange={event => setService(event.target.value)}>{services.map(label => <option key={label}>{label}</option>)}</select>
          <label className="sr-only" htmlFor="visitor-month">Filtrar mês</label><select id="visitor-month" className="h-8 min-w-0 rounded-lg border border-[#e2e4de] bg-white px-2 text-[10px]" value={month} onChange={event => setMonth(Number(event.target.value))}><option value={0}>Todos</option>{months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select>
          <label className="sr-only" htmlFor="visitor-year">Filtrar ano</label><select id="visitor-year" className="h-8 min-w-0 rounded-lg border border-[#e2e4de] bg-white px-2 text-[10px]" value={year} onChange={event => setYear(Number(event.target.value))}><option value={0}>Todos</option>{availableYears.map(value => <option key={value}>{value}</option>)}</select>
        </div>
      </div>

      <div className="overflow-x-auto">
          <div className="min-w-[640px]">
          <div className="grid grid-cols-[minmax(120px,1.2fr)_minmax(80px,.9fr)_minmax(110px,1.1fr)_minmax(80px,.9fr)_minmax(120px,1.1fr)_100px] gap-1.5 bg-[#fafaf8] px-2 py-2 text-[8px] font-semibold uppercase tracking-wide text-[#657067] sm:gap-2 sm:px-3"><span>Nome do visitante</span><span>WhatsApp</span><span>Culto registrado</span><span>Data e envio</span><span>Marca-página / Kit</span><span className="text-center">Ações</span></div>
          {filteredPeople.map(person => {
            const latestVisit = [...person.visits].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))[0]
            const latestGift = [...person.gifts].sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt))[0]
            return <article key={person.id} className="grid grid-cols-[minmax(120px,1.2fr)_minmax(80px,.9fr)_minmax(110px,1.1fr)_minmax(80px,.9fr)_minmax(120px,1.1fr)_100px] items-center gap-1.5 border-t border-[#eeeeea] px-2 py-2.5 sm:gap-2 sm:px-3">
              <div className="flex min-w-0 items-center gap-2"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${latestGift ? 'bg-[#e4eee7] text-[#46715a]' : 'bg-[#f1f0eb] text-[#66766a]'}`}><UserRound size={15}/></span><div className="min-w-0"><p className="truncate text-[10px] font-semibold">{person.fullName}</p><p className="truncate text-[8px] text-[#7c857c]">{latestVisit?.source === 'qr' ? 'Marca-página da Recepção' : 'Cadastro da Equipe'}</p></div></div>
              <span className="text-[10px] text-[#303830]">{formatVisitorPhone(person.phoneNormalized)}</span>
              <span className="inline-flex w-fit items-center gap-1 rounded-md bg-[#f2f1ed] px-2 py-1 text-[8px] text-[#596258]"><CalendarDays size={10}/>{latestVisit?.serviceLabel ?? 'Culto de Celebração'}</span>
              <span className="text-[9px] leading-4"><span className="block">{latestVisit ? new Date(latestVisit.registeredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span><span className="text-[#80877f]">{latestVisit ? formatDate(latestVisit.registeredAt) : '—'}</span></span>
              {latestGift ? <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#edf4ee] px-2 py-1 text-[8px] font-medium text-[#46715a]"><CheckCircle2 size={10}/>Entregue pela Recepção</span> : person.visits.length === 1 ? <button type="button" aria-label={`Registrar entrega de marca-página para ${person.fullName}`} onClick={() => registerGift(person.id)} className="inline-flex w-fit items-center gap-1 rounded-full bg-[#f1f0eb] px-2 py-1 text-[8px] text-[#69736a] hover:bg-[#e7ece4]"><Clock3 size={10}/>Pendente · registrar</button> : <span className="text-[8px] text-[#858b83]">Não elegível · visita recorrente</span>}
              <div className="flex items-center justify-center gap-1"><button type="button" aria-label={`Ver detalhes de ${person.fullName}`} title="Ver detalhes e pedido de oração" onClick={() => setSelectedPerson(person)} className="inline-flex h-7 items-center gap-1 rounded-md bg-[#3d684f] px-1.5 text-[8px] font-medium text-white hover:bg-[#345941]"><Eye size={11}/>Detalhes</button><button type="button" aria-label={`Adicionar informação para ${person.fullName}`} title="Adicionar informação" onClick={() => openNote(person)} className="grid size-7 place-items-center rounded-md bg-[#f1f0eb] text-[#59675b] hover:bg-[#e7ece4]"><MessageSquare size={13}/></button></div>
            </article>
          })}
          {filteredPeople.length === 0 && <div className="px-5 py-10 text-center text-xs text-[#778074]">Nenhum visitante encontrado para os filtros selecionados.</div>}
          <div className="flex items-center justify-between border-t border-[#eeeeea] px-3 py-2 text-[8px] text-[#7b837b] sm:px-4"><span>Exibindo {filteredPeople.length} de {people.length} visitantes cadastrados na demonstração</span><span>Página 1 de 1</span></div>
        </div>
      </div>
    </section>

    <section aria-labelledby="visitor-qr-title" className="rounded-xl border border-[#e4e5df] bg-white p-3.5 shadow-[0_2px_7px_rgba(35,47,34,.025)] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#ededE8] pb-3"><div><p className="text-[8px] font-medium uppercase tracking-wide text-[#7c857c]">Material de recepção e acolhimento</p><h2 id="visitor-qr-title" className="mt-1 text-[13px] font-semibold">QR Code do Marca-Página da Recepção</h2></div><div className="flex items-center gap-1.5"><span className="rounded-full bg-[#edf4ee] px-2 py-1 text-[8px] font-medium text-[#46715a]">✓ Pronto para impressão</span><span className="rounded-full bg-[#f1f0eb] px-2 py-1 font-mono text-[8px] text-[#6e756d]">/visitante</span></div></div>
      <div className="mt-3 flex flex-col gap-3 rounded-lg border border-[#e8e8e2] bg-[#f8f8f5] p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#578066] text-white"><Gift size={15}/></span><div><h3 className="text-[10px] font-semibold">Instruções para Voluntários do Acolhimento</h3><p className="mt-0.5 max-w-[450px] text-[8px] leading-4 text-[#737b71]">Imprima em folha A4 com 4 marca-páginas por página. Corte nas linhas indicadas e entregue na mão de cada visitante quando levantarem a mão no momento das boas-vindas.</p></div></div><Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="h-8 shrink-0 rounded-lg bg-white px-2.5 text-[9px]"><Download size={12}/> Baixar PDF de Impressão (4 por folha)</Button></div>
      <div className="mx-auto flex max-w-sm flex-col items-center py-4 text-center sm:py-5"><div className="grid size-[138px] place-items-center rounded-xl border border-[#dfe3dd] bg-white p-2 shadow-sm">{qrImage ? <img src={qrImage} alt="QR Code do formulário de visitantes" width={120} height={120}/> : <QrCode size={45} className="text-[#3d684f]"/>}</div><p className="mt-2 max-w-full break-all font-mono text-[8px] text-[#637765]">{visitorFormUrl}</p><div className="mt-3 grid w-full max-w-[270px] grid-cols-2 gap-2"><Button type="button" variant="outline" size="sm" onClick={copyVisitorLink} className="h-8 rounded-lg bg-[#f1f0eb] px-2 text-[9px]"><ClipboardCopy size={12}/>{copied ? 'Link copiado' : 'Copiar link do formulário'}</Button><a className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#3d684f] px-2 text-[9px] font-medium text-white hover:bg-[#345941]" href={visitorFormUrl} target="_blank" rel="noreferrer">Testar formulário <ExternalLinkIcon/></a></div></div>
    </section>

    {showManualForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowManualForm(false) }}><section role="dialog" aria-modal="true" aria-labelledby="manual-visitor-title" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-primary">Cadastro interno · demonstração</p><h2 id="manual-visitor-title" className="mt-1 text-lg font-semibold">Cadastrar visitante</h2><p className="mt-1 text-xs text-muted">A visita será registrada com data e horário atuais.</p></div><button type="button" aria-label="Fechar formulário" onClick={() => setShowManualForm(false)} className="rounded-lg p-2 text-muted hover:bg-[#f6f7f3]"><X size={17}/></button></div><form className="space-y-3" onSubmit={handleManualSubmit}><label className="block text-xs font-medium">Nome completo<input className="form-input mt-1.5 h-10 text-sm" autoComplete="name" maxLength={120} required value={manualName} onChange={event => setManualName(event.target.value)} placeholder="Nome da pessoa"/></label><label className="block text-xs font-medium">WhatsApp / Telefone<input className="form-input mt-1.5 h-10 text-sm" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} required value={manualPhone} onChange={event => setManualPhone(event.target.value)} placeholder="(11) 90000-0000"/></label>{formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p>}<div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" size="sm" onClick={() => setShowManualForm(false)}>Cancelar</Button><Button type="submit" size="sm"><Plus size={14}/> Cadastrar</Button></div></form></section></div>}

    {selectedPerson && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedPerson(null) }}><section role="dialog" aria-modal="true" aria-labelledby="visitor-detail-title" className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#52725a]">Detalhes do visitante · exemplo fictício</p><h2 id="visitor-detail-title" className="mt-1 text-lg font-semibold">{selectedPerson.fullName}</h2><p className="mt-1 text-xs text-muted">{formatVisitorPhone(selectedPerson.phoneNormalized)}</p></div><button type="button" aria-label="Fechar detalhes" onClick={() => setSelectedPerson(null)} className="rounded-lg p-2 text-muted hover:bg-[#f6f7f3]"><X size={17}/></button></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-[#f7f7f3] p-3"><p className="text-[9px] uppercase text-muted">Culto registrado</p><p className="mt-1 text-xs font-medium">{[...selectedPerson.visits].sort((a,b) => b.registeredAt.localeCompare(a.registeredAt))[0]?.serviceLabel}</p></div><div className="rounded-lg bg-[#f7f7f3] p-3"><p className="text-[9px] uppercase text-muted">Primeira visita</p><p className="mt-1 text-xs font-medium">{firstVisit(selectedPerson) ? formatDate(firstVisit(selectedPerson)!) : '—'}</p></div></div><section className="mt-4 rounded-xl border border-[#e5e9e2] p-3.5"><h3 className="flex items-center gap-2 text-xs font-semibold"><HeartIcon/> Pedido de oração</h3>{selectedPerson.prayerRequest ? <p className="mt-2 text-sm leading-6 text-[#535c53]">{selectedPerson.prayerRequest}</p> : <p className="mt-2 text-xs text-muted">Nenhum pedido de oração informado neste exemplo.</p>}</section><div className="mt-4 flex items-center justify-between gap-3"><div><p className="text-[9px] uppercase text-muted">Marca-página / Kit</p><p className="mt-1 text-xs font-medium">{selectedPerson.gifts.length ? `Entregue em ${formatDate(selectedPerson.gifts[0].deliveredAt)}` : 'Sem entrega registrada'}</p></div>{selectedPerson.gifts[0]?.responsible && <p className="text-right text-[10px] text-muted">Responsável<br/><span className="font-medium text-foreground">{selectedPerson.gifts[0].responsible}</span></p>}</div><p className="mt-4 rounded-lg bg-[#eff5ec] px-3 py-2 text-[10px] leading-4 text-[#49624d]">Este é um registro fictício de demonstração; o pedido não foi consultado no Supabase.</p></section></div>}

    {notePerson && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="visitor-note-title" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#52725a]">Anotação interna · demonstração</p><h2 id="visitor-note-title" className="mt-1 text-lg font-semibold">Informações do visitante</h2><p className="mt-1 text-xs text-muted">{notePerson.fullName}</p></div><button type="button" aria-label="Fechar informações" onClick={() => setNotePerson(null)} className="rounded-lg p-2 text-muted hover:bg-[#f6f7f3]"><X size={17}/></button></div><form className="mt-4 space-y-3" onSubmit={saveNote}><label className="block text-xs font-medium">Informação para a equipe<textarea className="form-input form-textarea mt-1.5 min-h-[120px] text-sm" maxLength={4000} value={noteDraft} onChange={event => setNoteDraft(event.target.value)} placeholder="Adicione uma informação importante para o acolhimento deste visitante..."/></label><p className="text-[10px] text-muted">O conteúdo fica somente nesta demonstração e será apagado ao recarregar a página.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setNotePerson(null)}>Cancelar</Button><Button type="submit" size="sm"><Check size={14}/> Salvar informação</Button></div></form></section></div>}

    <div className="visitor-print-sheet" aria-hidden="true"><h1>Ministério de Boas-Vindas · Marca-página da Recepção</h1><p>Aponte a câmera do celular para o QR Code e preencha seu cadastro.</p><div className="visitor-print-grid">{Array.from({ length: 4 }, (_, index) => <article key={index}><h2>Seja muito bem-vindo(a)!</h2>{qrImage && <img src={qrImage} alt=""/>}<p>Ministério de Boas-Vindas · ADLago</p></article>)}</div></div>
  </div>
}

function ExternalLinkIcon() { return <span aria-hidden="true" className="text-[11px]">↗</span> }
function HeartIcon() { return <span aria-hidden="true" className="text-[#477253]">♡</span> }
