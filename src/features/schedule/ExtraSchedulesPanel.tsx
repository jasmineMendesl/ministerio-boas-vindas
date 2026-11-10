import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Bell, CalendarDays, Plus, Trash2, UsersRound } from 'lucide-react'
import { useAuth } from '../../app/AuthProvider'
import { supabase } from '../../lib/supabase'
import { DeleteScheduleDialog } from './DeleteScheduleDialog'

type ExtraSchedule = { id: string; title: string; event_date: string; members_needed: number; event_time: string | null; member_ids: string[]; special_observation: string | null }
type Volunteer = { id: string; display_name: string }
const scheduleFields = 'id,title,event_date,members_needed,event_time,member_ids,special_observation'

export function ExtraSchedulesPanel() {
  const { role, session } = useAuth()
  const [schedules, setSchedules] = useState<ExtraSchedule[]>([])
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [quantity, setQuantity] = useState('')
  const [time, setTime] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [observation, setObservation] = useState('')
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notifyingId, setNotifyingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [scheduleToDelete, setScheduleToDelete] = useState<ExtraSchedule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    if (!supabase) { setError('Supabase não está configurado.'); setLoading(false); return }
    setLoading(true)
    const [result, profiles] = await Promise.all([
      supabase.from('ministry_extra_schedules').select(scheduleFields).order('event_date'),
      supabase.from('profiles').select('id,display_name').eq('active', true).order('display_name'),
    ])
    if (result.error || profiles.error) setError('Não foi possível carregar as escalas extras e os membros. Confira a conexão e as permissões.')
    else { setSchedules(result.data ?? []); setVolunteers(profiles.data ?? []); setError('') }
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load, session?.user.id])

  async function notify(scheduleId: string) {
    if (!supabase || !isAdmin) return
    setNotifyingId(scheduleId)
    try {
      const { data, error: notifyError } = await supabase.functions.invoke('notify-extra-schedule', { body: { scheduleId } })
      if (notifyError) setNotice('Escala extra salva. Não foi possível enviar a notificação. Use “Notificar equipe” para tentar novamente.')
      else if (!data?.configured) setNotice('Escala extra salva. As notificações push precisam ser configuradas no Supabase.')
      else if (!data.sent) setNotice('Escala extra salva. Nenhum membro selecionado está com notificações habilitadas.')
      else setNotice(`Escala extra salva e notificação enviada para ${data.sent} dispositivo(s).`)
    } catch {
      setNotice('Escala extra salva. Não foi possível enviar a notificação. Use “Notificar equipe” para tentar novamente.')
    } finally { setNotifyingId('') }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !isAdmin || !session?.user.id || saving) return
    setError(''); setNotice('')
    const membersNeeded = Number(quantity)
    if (title.trim().length < 2 || title.trim().length > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2020-01-01' || !Number.isInteger(membersNeeded) || membersNeeded < 1 || membersNeeded > 1000 || !/^\d{2}:\d{2}$/.test(time) || !memberIds.length || memberIds.length > membersNeeded) {
      setError('Informe título, data, horário e quantidade válida. Selecione de 1 até a quantidade de membros necessários.'); return
    }
    setSaving(true)
    try {
      const { data, error: saveError } = await supabase.rpc('save_extra_schedule', {
        p_title: title.trim(), p_event_date: date, p_event_time: time, p_members_needed: membersNeeded,
        p_member_ids: memberIds, p_special_observation: observation.trim() || null, p_schedule_id: editingId,
      })
      if (saveError || !data) { setError('Não foi possível criar a escala extra. Confira a conexão e as permissões.'); return }
      setSchedules(current => [...current.filter(item => item.id !== data.id), data].sort((a, b) => a.event_date.localeCompare(b.event_date)))
      setTitle(''); setDate(''); setQuantity(''); setTime(''); setMemberIds([]); setObservation(''); setEditingId(null)
      setNotice('Escala extra salva. Enviando notificação à equipe…')
      await notify(data.id)
    } catch { setError('Não foi possível criar a escala extra. Tente novamente.') }
    finally { setSaving(false) }
  }

  async function remove() {
    if (!supabase || !isAdmin || !scheduleToDelete || deleting) return
    setDeleting(true); setDeleteError(''); setNotice('')
    try {
      const { data, error: removeError } = await supabase.from('ministry_extra_schedules').delete().eq('id', scheduleToDelete.id).select('id')
      if (removeError || !data?.length) {
        setDeleteError('Não foi possível excluir a escala extra. Confira a conexão, as permissões de administrador e as atualizações do banco.'); return
      }
      setSchedules(current => current.filter(item => item.id !== scheduleToDelete.id))
      setScheduleToDelete(null)
      setNotice('Escala extra excluída.')
    } catch { setDeleteError('Não foi possível excluir a escala extra. Confira sua conexão e tente novamente.') }
    finally { setDeleting(false) }
  }

  return <section id="extra-schedules-panel" aria-label="Escala extra" className="space-y-4">
    <div><h2 className="text-lg font-semibold">Escala extra</h2><p className="mt-1 text-sm text-[#68645C]">Organize eventos, informe o horário e selecione a equipe. Somente os membros selecionados recebem a notificação.</p></div>
    {error && <p role="alert" className="status-negative rounded-lg border px-3 py-2 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-[#E5DDCF] bg-white px-3 py-2 text-sm">{notice}</p>}
    {isAdmin && <form id="extra-schedule-form" onSubmit={create} className="grid gap-4 rounded-2xl border border-[#E5DDCF] bg-white p-4 sm:grid-cols-2 sm:p-5">
      {editingId && <p className="text-sm font-semibold text-[#8A6729] sm:col-span-2">Editar escala extra</p>}
      <label className="text-sm font-medium sm:col-span-2">Título<input className="form-input mt-1.5 h-11" required minLength={2} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex.: Acolhimento no encontro especial"/></label>
      <label className="text-sm font-medium">Data<input className="form-input mt-1.5 h-11" type="date" min="2020-01-01" required value={date} onChange={event => setDate(event.target.value)}/></label>
      <label className="text-sm font-medium">Horário<input className="form-input mt-1.5 h-11" type="time" required value={time} onChange={event => setTime(event.target.value)}/></label>
      <label className="text-sm font-medium">Quantidade de membros necessários<input className="form-input mt-1.5 h-11" type="number" min={1} max={1000} step={1} required value={quantity} onChange={event => setQuantity(event.target.value)}/></label>
      <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">Membros escalados ({memberIds.length}/{quantity || '0'})</legend><div className="mt-2 grid max-h-60 gap-2 overflow-y-auto rounded-xl border border-[#E5DDCF] p-3 sm:grid-cols-2">{volunteers.map(person => <label key={person.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[#8A6729]" checked={memberIds.includes(person.id)} onChange={event => setMemberIds(current => event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))}/>{person.display_name}</label>)}{!volunteers.length && <p className="text-sm text-[#68645C]">Nenhum membro disponível.</p>}</div></fieldset>
      <label className="text-sm font-medium sm:col-span-2">Observação (opcional)<textarea className="form-input form-textarea mt-1.5 min-h-24" maxLength={1200} value={observation} onChange={event => setObservation(event.target.value)}/></label>
      <button type="submit" disabled={loading || saving || !!notifyingId} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#8A6729] px-4 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2"><Plus size={16}/>{saving ? 'Salvando e notificando…' : editingId ? 'Salvar e notificar equipe' : 'Cadastrar e notificar equipe'}</button>
      {editingId && <button type="button" onClick={() => { setEditingId(null); setTitle(''); setDate(''); setTime(''); setQuantity(''); setMemberIds([]); setObservation('') }} className="min-h-10 text-sm sm:col-span-2">Cancelar edição</button>}
    </form>}
    {loading ? <p role="status" className="text-sm text-[#68645C]">Carregando escalas extras…</p> : schedules.length ? <div className="grid gap-3 sm:grid-cols-2">{schedules.map(schedule => <article key={schedule.id} className="space-y-3 rounded-2xl border border-[#E5DDCF] bg-white p-4 sm:p-5">
      <h3 className="break-words font-semibold">{schedule.title}</h3>
      <p className="flex items-center gap-2 text-sm text-[#68645C]"><CalendarDays size={16}/>{new Date(`${schedule.event_date}T12:00:00`).toLocaleDateString('pt-BR')}</p>
      <p className="text-sm text-[#68645C]">Horário: {schedule.event_time?.slice(0, 5) || 'Não informado'}</p>
      <p className="flex items-center gap-2 text-sm"><UsersRound size={16} className="text-[#8A6729]"/>{schedule.members_needed} {schedule.members_needed === 1 ? 'membro necessário' : 'membros necessários'}</p>
      <p className="text-sm text-[#68645C]">Equipe: {(schedule.member_ids ?? []).map(id => volunteers.find(person => person.id === id)?.display_name ?? 'Membro indisponível').join(', ') || 'Selecione os membros para notificar.'}</p>
      {schedule.special_observation && <aside className="rounded-xl border border-[#F0CDCA] bg-[#FFF3F2] p-4 text-sm text-[#713F3A]"><p className="font-semibold">Observação desta escala</p><p className="mt-3 whitespace-pre-wrap leading-7">{schedule.special_observation}</p></aside>}
      {isAdmin && <button type="button" disabled={saving || !!notifyingId || deleting} onClick={() => { setEditingId(schedule.id); setTitle(schedule.title); setDate(schedule.event_date); setTime(schedule.event_time?.slice(0, 5) ?? ''); setQuantity(String(schedule.members_needed)); setMemberIds(schedule.member_ids ?? []); setObservation(schedule.special_observation ?? ''); document.getElementById('extra-schedule-form')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) }} className="min-h-10 rounded-lg border border-[#E5DDCF] px-3 text-sm font-medium text-[#6B4F1D]">Editar escala</button>}
      {isAdmin && <div className="flex flex-wrap gap-2"><button type="button" disabled={saving || !!notifyingId || deleting} onClick={() => void notify(schedule.id)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#E5DDCF] px-3 text-sm font-medium text-[#6B4F1D] disabled:opacity-60"><Bell size={15}/>{notifyingId === schedule.id ? 'Notificando…' : 'Notificar equipe'}</button><button type="button" disabled={saving || !!notifyingId || deleting} aria-label={`Excluir escala extra ${schedule.title}`} onClick={() => { setDeleteError(''); setScheduleToDelete(schedule) }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#E8C8C4] px-3 text-sm font-medium text-[#9C3F37] disabled:opacity-60"><Trash2 size={15}/>Excluir</button></div>}
    </article>)}</div> : !error && <p className="rounded-xl border border-dashed border-[#D9CCB2] p-6 text-center text-sm text-[#68645C]">Nenhuma escala extra cadastrada.</p>}
    {scheduleToDelete && <DeleteScheduleDialog description={`Excluir a escala extra “${scheduleToDelete.title}”?`} deleting={deleting} error={deleteError} onCancel={() => setScheduleToDelete(null)} onConfirm={() => void remove()}/>}
  </section>
}
