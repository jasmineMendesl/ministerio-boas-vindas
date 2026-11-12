import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Info, X } from 'lucide-react'
import { scheduledOnThursdayThisWeek, servedSameServiceLastWeek } from './assignment-warnings'
import type { HistorySchedule } from './ScheduleHistoryTable'

export type NewScheduleAssignment = { volunteer_profile_id: string; ministry_role: string }
const extraRoles = [
  ['leader', 'Líder'], ['support', 'Apoio'], ['media', 'Mídia'], ['opening_prayer', 'Oração inicial'],
  ['male_welcoming', 'Acolhimento masculino'], ['female_welcoming', 'Acolhimento feminino'],
  ['equipment_check', 'Conferência de placas e cavaletes'], ['app_closing', 'Fechamento no aplicativo'],
] as const
type Props = {
  date: string
  service: string
  volunteers: { id: string; display_name: string }[]
  schedules: HistorySchedule[]
  saving: boolean
  error: string
  onCancel: () => void
  onSave: (assignments: NewScheduleAssignment[]) => void
}

export function CreateScheduleDialog({ date, service, volunteers, schedules, saving, error, onCancel, onSave }: Props) {
  const [selected, setSelected] = useState<Record<string, { primary: string; extra: string[] }>>({})
  const [validationError, setValidationError] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const target = { id: 'new-schedule', service_date: date, service_label: service, assignments: [] }
  const selectedCount = Object.keys(selected).length
  const portariaCount = Object.values(selected).filter(item => item.primary === 'portaria').length

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [])

  function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setValidationError('')
    if (!selectedCount) { setValidationError('Selecione pelo menos um voluntário.'); return }
    if (Object.values(selected).some(item => !item.primary)) { setValidationError('Escolha a função principal de cada voluntário selecionado.'); return }
    if (portariaCount > 4) { setValidationError('Portaria permite no máximo quatro voluntários por culto.'); return }
    const assignments = Object.entries(selected).flatMap(([id, item]) => [item.primary, ...item.extra].map(ministry_role => ({ volunteer_profile_id: id, ministry_role })))
    onSave(assignments)
  }

  return createPortal(<div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-3 sm:p-6">
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="create-schedule-title" className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none" onKeyDown={event => {
      if (event.key === 'Escape' && !saving) { event.preventDefault(); onCancel() }
      if (event.key !== 'Tab') return
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')
      if (!elements?.length) return
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div><h2 id="create-schedule-title" className="text-lg font-semibold">Selecionar voluntários</h2><p className="mt-1 text-sm text-muted">{service} · {new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')}</p><p className="mt-2 text-xs leading-5 text-muted">Selecione a equipe e distribua as funções. A escala será criada ao salvar.</p></div>
        <button type="button" aria-label="Fechar seleção de voluntários" disabled={saving} onClick={onCancel} className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-[#F7F2E8] disabled:opacity-50"><X size={18}/></button>
      </header>
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          <p className="text-xs font-medium text-muted">{selectedCount} selecionado(s) · Portaria: {portariaCount}/4</p>
          {volunteers.map(person => {
            const item = selected[person.id]
            const thursday = scheduledOnThursdayThisWeek(schedules, target, person.id)
            const repeated = Boolean(item) && servedSameServiceLastWeek(schedules, target, person.id)
            return <article key={person.id} className={`min-w-0 rounded-xl border p-3 sm:p-4 ${item ? 'border-[#C2A35E] bg-[#FBF9F4]' : 'border-border'}`}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold"><input type="checkbox" className="size-5 shrink-0 accent-[#8A6729]" disabled={saving} checked={Boolean(item)} onChange={event => {
                setValidationError('')
                setSelected(current => { const next = { ...current }; if (event.target.checked) next[person.id] = { primary: '', extra: [] }; else delete next[person.id]; return next })
              }}/><span className={thursday ? 'text-gray-500' : ''}>{person.display_name}{thursday && <span className="block text-xs font-normal">Já escalado na quinta desta semana</span>}</span></label>
              {repeated && <p role="status" className="status-pending mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5"><Info size={14} className="mt-0.5 shrink-0"/>essa pessoa serviu nesse culto na semana passada</p>}
              {item && <div className="mt-3 space-y-3 border-t border-border pt-3">
                <label className="block text-xs font-medium">Função principal de {person.display_name}<select className="form-input mt-1.5" value={item.primary} disabled={saving} onChange={event => setSelected(current => ({ ...current, [person.id]: { ...current[person.id], primary: event.target.value } }))}><option value="">Selecione a função</option><option value="portaria">Portaria</option><option value="seat_direction">Direcionamento de assentos</option></select></label>
                <fieldset disabled={saving}><legend className="mb-2 text-xs font-medium">Responsabilidades complementares de {person.display_name}</legend><div className="grid gap-2 sm:grid-cols-2">{extraRoles.map(([key, label]) => <label key={key} className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" className="size-4 shrink-0 accent-[#8A6729]" checked={item.extra.includes(key)} onChange={event => setSelected(current => ({ ...current, [person.id]: { ...current[person.id], extra: event.target.checked ? [...current[person.id].extra, key] : current[person.id].extra.filter(role => role !== key) } }))}/>{label}</label>)}</div></fieldset>
              </div>}
            </article>
          })}
          {!volunteers.length && <p className="py-6 text-center text-sm text-muted">Nenhum voluntário ativo disponível.</p>}
        </div>
        <footer className="shrink-0 border-t border-border bg-white p-4 sm:p-5">
          {(validationError || error) && <p role="alert" className="status-negative mb-3 rounded-lg border px-3 py-2 text-sm">{validationError || error}</p>}
          <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={onCancel} className="min-h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-50">Cancelar</button><button type="submit" disabled={saving || !volunteers.length} className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button></div>
        </footer>
      </form>
    </section>
  </div>, document.body)
}
