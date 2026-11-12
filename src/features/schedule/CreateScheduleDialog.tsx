import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Info, X } from 'lucide-react'
import { scheduledOnThursdayThisWeek, servedSameServiceLastWeek } from './assignment-warnings'
import type { HistorySchedule } from './ScheduleHistoryTable'

export type NewScheduleAssignment = { volunteer_profile_id: string; ministry_role: string }
const primaryRoles = [['portaria', 'Portaria'], ['seat_direction', 'Direcionamento de assentos']] as const
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
  const [assignments, setAssignments] = useState<NewScheduleAssignment[]>([])
  const [validationError, setValidationError] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const target = { id: 'new-schedule', service_date: date, service_label: service, assignments: [] }
  const primaryIds = new Set(assignments.filter(item => item.ministry_role === 'portaria' || item.ministry_role === 'seat_direction').map(item => item.volunteer_profile_id))
  const selectedCount = primaryIds.size
  const portariaCount = assignments.filter(item => item.ministry_role === 'portaria').length
  const repeatedVolunteers = volunteers.filter(person => primaryIds.has(person.id) && servedSameServiceLastWeek(schedules, target, person.id))

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
    if (portariaCount > 4) { setValidationError('Portaria permite no máximo quatro voluntários por culto.'); return }
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
        <div><h2 id="create-schedule-title" className="text-lg font-semibold">Distribuir funções</h2><p className="mt-1 text-sm text-muted">{service} · {new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')}</p><p className="mt-2 text-xs leading-5 text-muted">Escolha os voluntários de cada função. A escala será criada ao salvar.</p></div>
        <button type="button" aria-label="Fechar seleção de voluntários" disabled={saving} onClick={onCancel} className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-[#F7F2E8] disabled:opacity-50"><X size={18}/></button>
      </header>
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          <p className="text-xs font-medium text-muted">{selectedCount} selecionado(s) · Portaria: {portariaCount}/4</p>
          {repeatedVolunteers.map(person => <p key={person.id} role="status" className="status-pending flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5"><Info size={14} className="mt-0.5 shrink-0"/><span><strong>{person.display_name}:</strong> essa pessoa serviu nesse culto na semana passada</span></p>)}
          {[
            { title: 'Funções principais', roles: primaryRoles, primary: true },
            { title: 'Responsabilidades complementares', roles: extraRoles, primary: false },
          ].map(group => <section key={group.title} aria-label={group.title} className="overflow-hidden rounded-xl border border-border">
            <h3 className="bg-[#F7F2E8] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-primary">{group.title}</h3>
            {!group.primary && <p className="px-4 pt-3 text-xs leading-5 text-muted">Escolha primeiro os voluntários das funções principais. Ao removê-los da função principal, suas responsabilidades complementares também serão removidas.</p>}
            <div className="divide-y divide-border">{group.roles.map(([key, label]) => {
              const assigned = assignments.filter(item => item.ministry_role === key)
              const eligible = volunteers.filter(person => (group.primary ? !primaryIds.has(person.id) : primaryIds.has(person.id)) && !assigned.some(item => item.volunteer_profile_id === person.id))
              const full = key === 'portaria' && portariaCount >= 4
              return <div key={key} className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                <label className="min-w-0 text-sm font-medium">{label}{key === 'portaria' && <span className="ml-2 text-xs text-muted">{portariaCount}/4</span>}
                  <select aria-label={`Selecionar voluntário para ${label}`} value="" disabled={saving || full || !eligible.length} className="form-input mt-2" onChange={event => {
                    const id = event.target.value
                    if (!id) return
                    setValidationError('')
                    setAssignments(current => [...current, { volunteer_profile_id: id, ministry_role: key }])
                  }}><option value="">{full ? 'Limite de quatro voluntários' : !group.primary && !primaryIds.size ? 'Escolha uma função principal primeiro' : 'Adicionar voluntário'}</option>{eligible.map(person => {
                    const thursday = scheduledOnThursdayThisWeek(schedules, target, person.id)
                    return <option key={person.id} value={person.id} className={thursday ? 'text-gray-400' : undefined} style={thursday ? { color: '#9ca3af' } : undefined}>{person.display_name}{thursday ? ' — já escalado na quinta' : ''}</option>
                  })}</select>
                </label>
                <div className="flex min-w-0 flex-wrap content-start items-start gap-2 sm:pt-7">{assigned.map(item => {
                  const name = volunteers.find(person => person.id === item.volunteer_profile_id)?.display_name ?? 'Voluntário'
                  return <span key={item.volunteer_profile_id} className="inline-flex max-w-full items-center gap-2 rounded-xl bg-[#F0E6D2] px-3 py-1 text-sm"><span className="break-words">{name}</span><button type="button" disabled={saving} aria-label={`Remover ${name} de ${label}`} className="grid size-8 shrink-0 place-items-center rounded-lg text-[#8B3C32] hover:bg-white disabled:opacity-50" onClick={() => setAssignments(current => current.filter(assignment => group.primary ? assignment.volunteer_profile_id !== item.volunteer_profile_id : !(assignment.volunteer_profile_id === item.volunteer_profile_id && assignment.ministry_role === key)))}><X size={14}/></button></span>
                })}{!assigned.length && <span className="text-xs text-muted">Nenhum voluntário selecionado</span>}</div>
              </div>
            })}</div>
          </section>)}
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
