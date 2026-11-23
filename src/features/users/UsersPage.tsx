import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Cake, Pencil, UserPlus, UsersRound } from 'lucide-react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { PageHeader } from '../../components/PageHeader'
import { PageTabs } from '../../components/PageTabs'
import { churchDate } from '../../lib/church-date'
import { supabase } from '../../lib/supabase'

type Member = {
  id: string
  display_name: string
  email: string | null
  phone: string | null
  birth_date: string | null
  service_start_date: string | null
  active: boolean
}
type Tab = 'members' | 'create' | 'birthdays'
const tabs = [
  { id: 'members', label: 'Equipe' },
  { id: 'create', label: 'Cadastrar usuário' },
  { id: 'birthdays', label: 'Aniversariantes' },
]
const emptyForm = { display_name: '', email: '', phone: '', birth_date: '', service_start_date: '', password: '' }
const months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2020, month, 1))))
const panelClass = 'rounded-2xl border border-[#E5DDCF] bg-white p-4 shadow-[0_3px_12px_rgba(0,0,0,.035)] sm:p-6'
const inputClass = 'form-input mt-1.5 h-11 w-full'
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8A6729] px-4 text-sm font-semibold text-white hover:bg-[#6B4F1D] disabled:opacity-60'

function formatDate(value: string | null) {
  return value ? value.split('-').reverse().join('/') : '—'
}

async function registrationError(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    if (typeof body?.error === 'string') return body.error
  }
  return 'Não foi possível cadastrar o usuário. Confira a conexão e tente novamente.'
}

export function UsersPage() {
  const [tab, setTab] = useState<Tab>('members')
  const [members, setMembers] = useState<Member[]>([])
  const [editing, setEditing] = useState<Member | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [month, setMonth] = useState(() => churchDate().slice(5, 7))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const today = churchDate()

  const load = useCallback(async () => {
    if (!supabase) { setLoadError('Supabase não está configurado.'); setLoading(false); return }
    setLoading(true)
    const { data, error: queryError } = await supabase.rpc('admin_list_team_members')
    if (queryError) setLoadError('Não foi possível carregar os usuários.')
    else { setMembers(data ?? []); setLoadError('') }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function changeTab(next: Tab) {
    if (saving || next === tab) return
    setError(''); setNotice(''); setEditing(null); setForm(emptyForm); setTab(next)
  }

  function edit(member: Member) {
    setEditing(member)
    setForm({
      display_name: member.display_name,
      email: member.email ?? '',
      phone: member.phone ?? '',
      birth_date: member.birth_date ?? '',
      service_start_date: member.service_start_date ?? '',
      password: '',
    })
    setError(''); setNotice(''); setTab('create')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || saving) return
    setError(''); setNotice('')
    const name = form.display_name.trim()
    const phone = form.phone.replace(/[\s().-]/g, '')
    if (!name) { setError('Informe o nome.'); return }
    if (phone && !/^\+?[0-9]{8,15}$/.test(phone)) { setError('Informe um telefone válido com DDD.'); return }
    if (form.birth_date > today || form.service_start_date > today || (form.birth_date && form.service_start_date && form.service_start_date < form.birth_date)) {
      setError('Confira a data de nascimento e a data de início no ministério.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const { error: updateError } = await supabase.rpc('admin_update_team_member_details', {
          p_id: editing.id,
          p_display_name: name,
          p_phone: phone || null,
          p_birth_date: form.birth_date || null,
          p_service_start_date: form.service_start_date || null,
        })
        if (updateError) { setError('Não foi possível atualizar o cadastro. Confira os dados e tente novamente.'); return }
      } else {
        const { error: createError } = await supabase.functions.invoke('create-team-user', {
          body: { ...form, display_name: name, email: form.email.trim(), phone },
        })
        if (createError) { setError(await registrationError(createError)); return }
      }
      setNotice(editing ? 'Cadastro atualizado.' : 'Usuário cadastrado. O acesso usa o e-mail e a senha inicial.')
      setEditing(null); setForm(emptyForm); setTab('members')
      await load()
    } catch {
      setError('Não foi possível concluir a solicitação. Confira a conexão e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const birthdays = members
    .filter(member => member.active && member.birth_date?.slice(5, 7) === month)
    .sort((a, b) => a.birth_date!.slice(8).localeCompare(b.birth_date!.slice(8)) || a.display_name.localeCompare(b.display_name, 'pt-BR'))

  return <div className="animate-in space-y-5">
    <PageHeader icon={UsersRound} eyebrow="GESTÃO DO MINISTÉRIO DE BOAS-VINDAS" title="Usuários" description="Cadastros da equipe e aniversariantes do mês."/>
    <PageTabs ariaLabel="Seções de usuários" activeId={tab} onChange={changeTab} tabs={tabs}/>
    {notice && <p role="status" className="status-positive rounded-lg border px-3 py-2 text-sm">{notice}</p>}
    {error && <p role="alert" className="status-negative rounded-lg border px-3 py-2 text-sm">{error}</p>}
    {loadError && tab !== 'create' && <p role="alert" className="status-negative rounded-lg border px-3 py-2 text-sm">{loadError} <button type="button" className="font-semibold underline" onClick={() => void load()}>Tentar novamente</button></p>}
    {loading && tab !== 'create' && <p role="status" className="text-sm text-muted">Carregando usuários…</p>}

    {tab === 'create' && <form className={`${panelClass} space-y-4`} onSubmit={save}>
      <h2 className="text-lg font-semibold">{editing ? 'Editar cadastro' : 'Novo usuário'}</h2>
      <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-medium">Nome<input className={inputClass} autoComplete="off" required maxLength={120} value={form.display_name} onChange={event => setForm({ ...form, display_name: event.target.value })}/></label>
        <label className="min-w-0 text-sm font-medium">E-mail<input className={inputClass} type="email" autoComplete="off" required={!editing} readOnly={Boolean(editing)} maxLength={254} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
        <label className="min-w-0 text-sm font-medium">Telefone com DDD<input className={inputClass} type="tel" autoComplete="off" required={!editing} maxLength={24} value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })}/></label>
        <label className="min-w-0 text-sm font-medium">Data de nascimento<input className={inputClass} type="date" required={!editing} max={today} value={form.birth_date} onChange={event => setForm({ ...form, birth_date: event.target.value })}/></label>
        <label className="min-w-0 text-sm font-medium">Início no ministério<input className={inputClass} type="date" required={!editing} min={form.birth_date || undefined} max={today} value={form.service_start_date} onChange={event => setForm({ ...form, service_start_date: event.target.value })}/></label>
        {!editing && <label className="min-w-0 text-sm font-medium">Senha inicial<input className={inputClass} type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/><span className="mt-1 block text-xs font-normal text-muted">Use pelo menos 8 caracteres.</span></label>}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClass} disabled={saving}>{!editing && <UserPlus size={16}/>} {saving ? 'Salvando…' : editing ? 'Salvar cadastro' : 'Criar usuário'}</button>
        {editing && <button type="button" disabled={saving} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium" onClick={() => changeTab('members')}>Cancelar</button>}
      </div>
    </form>}

    {tab === 'members' && !loading && !loadError && <section className={panelClass} aria-label="Cadastros da equipe">
      {members.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-b border-border text-xs text-muted"><tr><th className="px-2 py-3">Nome</th><th className="px-2 py-3">E-mail</th><th className="px-2 py-3">Telefone</th><th className="px-2 py-3">Nascimento</th><th className="px-2 py-3">Início no ministério</th><th className="px-2 py-3 text-right">Ações</th></tr></thead>
        <tbody className="divide-y divide-border">{members.map(member => <tr key={member.id}>
          <th scope="row" className="px-2 py-3 font-semibold">{member.display_name}{!member.active && <span className="block text-xs font-normal text-muted">Inativo</span>}</th>
          <td className="px-2 py-3">{member.email || '—'}</td><td className="px-2 py-3">{member.phone || '—'}</td><td className="px-2 py-3">{formatDate(member.birth_date)}</td><td className="px-2 py-3">{formatDate(member.service_start_date)}</td>
          <td className="px-2 py-3 text-right"><button type="button" aria-label={`Editar ${member.display_name}`} className="inline-grid size-10 place-items-center rounded-lg text-[#7B571F] hover:bg-[#FBF9F4]" onClick={() => edit(member)}><Pencil size={17}/></button></td>
        </tr>)}</tbody>
      </table></div> : <p className="text-sm text-muted">Nenhum usuário cadastrado.</p>}
    </section>}

    {tab === 'birthdays' && !loading && !loadError && <section className={`${panelClass} space-y-3`} aria-label="Aniversariantes da equipe">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Cake size={19} className="text-primary"/>Aniversariantes</h2>
        <label className="min-w-40 text-sm font-medium">Mês<select className={`${inputClass} capitalize`} value={month} onChange={event => setMonth(event.target.value)}>{months.map((name, index) => <option key={name} value={String(index + 1).padStart(2, '0')}>{name}</option>)}</select></label>
      </div>
      {birthdays.length ? <ul className="divide-y divide-border">{birthdays.map(member => <li key={member.id} className="flex items-center gap-3 py-3 text-sm"><span className="rounded-lg bg-[#F0E6D2] px-3 py-1.5 font-semibold tabular-nums text-[#6B4F1D]">{member.birth_date!.slice(8)}/{month}</span><span>{member.display_name}</span></li>)}</ul> : <p className="py-2 text-sm text-muted">Nenhum aniversário cadastrado para este mês.</p>}
    </section>}
  </div>
}
