import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, MessageSquareText, UsersRound } from 'lucide-react'

type HistoryVolunteer = { display_name: string }
type HistoryAssignment = { id: string; volunteer_profile_id: string; ministry_role: string; volunteer?: HistoryVolunteer }
type HistoryAttendance = { volunteer_profile_id: string; was_absent: boolean }
export type HistorySchedule = {
  id: string
  service_date: string
  service_label: string
  published_at: string | null
  special_observation: string | null
  visitorsReported: number | null
  assignments: HistoryAssignment[]
  attendance: HistoryAttendance[]
}

type Props = {
  schedules: HistorySchedule[]
  expandedScheduleIds: string[]
  onToggleSchedule: (scheduleId: string) => void
}

const mainRoles: Record<string, string> = { portaria: 'Portaria', seat_direction: 'Direcionamento de assentos' }
const extraRoles: Record<string, string> = {
  leader: 'Líder', support: 'Apoio', media: 'Mídia', opening_prayer: 'Oração inicial',
  male_welcoming: 'Acolhimento masculino', female_welcoming: 'Acolhimento feminino',
  equipment_check: 'Conferência de placas e cavaletes', app_closing: 'Fechamento no aplicativo',
  confession_prayer: 'Oração de Confissão', reconciliation_word: 'Palavra de reconciliação', closing_prayer: 'Oração Final',
}

function monthLabel(month: string) {
  return new Date(`${month}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function ScheduleHistoryTable({ schedules, expandedScheduleIds, onToggleSchedule }: Props) {
  const months = useMemo(() => [...new Set(schedules.map(schedule => schedule.service_date.slice(0, 7)))].sort().reverse(), [schedules])
  const [month, setMonth] = useState('')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!months.length) { setMonth(''); return }
    if (!month || !months.includes(month)) setMonth(months[0])
  }, [months, month])

  const monthSchedules = schedules.filter(schedule => schedule.service_date.startsWith(month))
  const filtered = monthSchedules.filter(schedule => serviceFilter === 'all' || schedule.service_label === serviceFilter)
    .sort((a, b) => b.service_date.localeCompare(a.service_date) || a.service_label.localeCompare(b.service_label))
  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageSchedules = filtered.slice((page - 1) * pageSize, page * pageSize)
  const publishedCount = monthSchedules.filter(schedule => schedule.published_at).length
  const averageTeam = monthSchedules.length
    ? (monthSchedules.reduce((sum, schedule) => sum + new Set(schedule.assignments.map(item => item.volunteer_profile_id)).size, 0) / monthSchedules.length).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    : '0'

  function moveMonth(direction: -1 | 1) {
    const index = months.indexOf(month)
    const next = index - direction
    if (next >= 0 && next < months.length) { setMonth(months[next]); setPage(1) }
  }

  function exportMonth() {
    const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`
    const rows = [
      ['Data', 'Culto', 'Líder', 'Apoio', 'Voluntários', 'Status'],
      ...filtered.map(schedule => {
        const nameFor = (role: string) => schedule.assignments.find(item => item.ministry_role === role)?.volunteer?.display_name ?? ''
        return [schedule.service_date, schedule.service_label, nameFor('leader'), nameFor('support'), String(new Set(schedule.assignments.map(item => item.volunteer_profile_id)).size), schedule.published_at ? 'Publicada' : 'Rascunho']
      }),
    ]
    const blob = new Blob([`\uFEFF${rows.map(row => row.map(csvCell).join(';')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `historico-escalas-${month || 'mes'}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <section aria-label="Histórico mensal de escalas" className="overflow-hidden rounded-2xl border border-[#E5DDCF] bg-white shadow-[0_3px_12px_rgba(0,0,0,.025)]">
    <div className="flex flex-col gap-3 border-b border-[#EEE8DC] p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex min-w-0 max-w-full items-center overflow-hidden rounded-full border border-[#E5DDCF] bg-[#FBF9F4]">
          <button type="button" aria-label="Mês anterior" onClick={() => moveMonth(-1)} disabled={!months.length || months.indexOf(month) >= months.length - 1} className="grid size-9 shrink-0 place-items-center text-[#7B571F] disabled:opacity-35"><ChevronLeft size={16}/></button>
          <label className="inline-flex min-w-0 flex-1 items-center gap-2 px-1 text-sm font-semibold capitalize text-[#34322E]"><CalendarDays size={14} className="text-[#8A6729]"/><select aria-label="Mês do histórico" value={month} onChange={event => { setMonth(event.target.value); setPage(1) }} className="max-w-48 appearance-none bg-transparent py-2 pr-1 capitalize outline-none">{months.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label>
          <button type="button" aria-label="Próximo mês" onClick={() => moveMonth(1)} disabled={!months.length || months.indexOf(month) <= 0} className="grid size-9 place-items-center text-[#7B571F] disabled:opacity-35"><ChevronRight size={16}/></button>
        </div>
        <label className="sr-only" htmlFor="history-service-filter">Cultos do mês</label>
        <select id="history-service-filter" aria-label="Filtrar culto do histórico" value={serviceFilter} onChange={event => { setServiceFilter(event.target.value); setPage(1) }} className="h-9 min-w-0 w-full rounded-full border border-[#E5DDCF] bg-[#FBF9F4] px-3 text-sm text-[#34322E] sm:w-auto"><option value="all">Todo o mês ({monthSchedules.length} cultos)</option>{[...new Set(monthSchedules.map(schedule => schedule.service_label))].map(service => <option key={service} value={service}>{service}</option>)}</select>
      </div>
      <button type="button" onClick={exportMonth} disabled={!filtered.length} className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-full border border-[#E5DDCF] bg-[#FBF9F4] px-3 text-sm font-medium text-[#6B4F1D] disabled:opacity-45 sm:self-auto"><Download size={14}/>Exportar mês</button>
    </div>

    <div className="mx-4 my-3 grid gap-2 rounded-xl border border-[#EEE8DC] bg-[#FFFEFC] p-3 text-xs sm:mx-5 sm:grid-cols-3 sm:items-center sm:px-4">
      <span className="inline-flex items-center gap-2"><Check size={14} className="text-emerald-700"/>{monthSchedules.length} cultos no mês</span>
      <span className="text-emerald-800">{monthSchedules.length ? Math.round(publishedCount / monthSchedules.length * 100) : 0}% das escalas publicadas</span>
      <span className="text-[#81796D]">Média de {averageTeam} voluntários/culto</span>
    </div>

    <div className="overflow-x-auto px-4 sm:px-5"><div className="min-w-[760px]">
      <div className="grid grid-cols-[95px_minmax(180px,1.4fr)_minmax(120px,1fr)_120px_75px_115px_110px] gap-3 border-y border-[#EEE8DC] py-3 text-[11px] font-medium uppercase tracking-wide text-[#81796D]"><span>Data</span><span>Culto &amp; horário</span><span>Líder &amp; apoio</span><span>Equipe / total</span><span>Faltas</span><span>Visitantes</span><span className="text-right">Ações</span></div>
      {pageSchedules.map(schedule => {
        const volunteerCount = new Set(schedule.assignments.map(item => item.volunteer_profile_id)).size
        const absenceCount = schedule.attendance.filter(item => item.was_absent).length
        const leader = schedule.assignments.find(item => item.ministry_role === 'leader')?.volunteer?.display_name
        const support = schedule.assignments.find(item => item.ministry_role === 'support')?.volunteer?.display_name
        const expanded = expandedScheduleIds.includes(schedule.id)
        const assignedRoleKeys = [...new Set(schedule.assignments.map(item => item.ministry_role))]
        return <div key={schedule.id} className="border-b border-[#F1EEE8]">
          <div className="grid min-h-[66px] grid-cols-[95px_minmax(180px,1.4fr)_minmax(120px,1fr)_120px_75px_115px_110px] items-center gap-3 py-2.5 text-sm text-[#34322E]">
            <span className="font-medium">{new Date(`${schedule.service_date}T12:00:00`).toLocaleDateString('pt-BR')}</span>
            <span><span className="block font-medium">{schedule.service_label}</span>{schedule.special_observation && <span className="mt-0.5 block text-xs text-[#81796D]">Com observação</span>}</span>
            <span><span className="block">{leader ?? '—'}</span>{support && <span className="mt-0.5 block text-xs text-[#81796D]">Apoio: {support}</span>}</span>
            <span><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${schedule.published_at ? 'bg-emerald-50 text-emerald-800' : 'bg-[#FBF9F4] text-[#68645C]'}`}><UsersRound size={12}/>{volunteerCount} voluntários</span></span>
            <span className={absenceCount ? 'font-semibold text-[#A2483E]' : 'text-[#81796D]'}>{absenceCount}</span>
            <span className={schedule.visitorsReported === null ? 'text-sm text-[#81796D]' : 'text-sm font-medium text-[#6B4F1D]'}>{schedule.visitorsReported === null ? 'Em andamento' : `${schedule.visitorsReported} pessoas`}</span>
            <span className="text-right"><button type="button" aria-expanded={expanded} onClick={() => onToggleSchedule(schedule.id)} className="whitespace-nowrap text-sm font-medium text-[#7B571F] hover:underline">{expanded ? 'Fechar' : 'Ver escala'} <span aria-hidden="true">→</span></button></span>
          </div>
          {expanded && <div className="mb-3 overflow-hidden rounded-xl border border-[#E5DDCF] bg-white">
            {schedule.special_observation && <aside className="border-b border-[#EEE8DC] bg-[#FBF6E9] p-4"><p className="flex items-center gap-2 text-sm font-semibold text-[#6B4F1D]"><MessageSquareText size={16}/>Observação desta escala</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#4E493F]">{schedule.special_observation}</p></aside>}
            <div className="divide-y divide-[#EEE8DC]">{[
              { title: 'Funções principais', roles: mainRoles },
              { title: 'Responsabilidades complementares', roles: extraRoles },
            ].map(group => {
              const roleKeys = assignedRoleKeys.filter(key => key in group.roles)
              if (!roleKeys.length) return null
              return <section key={group.title}><h3 className="bg-[#F7F2E8] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#8A6729]">{group.title}</h3>{roleKeys.map(key => <div key={key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"><span className="text-sm font-medium">{group.roles[key]}</span><span className="flex flex-wrap gap-2">{schedule.assignments.filter(item => item.ministry_role === key).map(item => <span key={item.id} className="rounded-full bg-[#F7F2E8] px-3 py-1 text-sm">{item.volunteer?.display_name ?? 'Voluntário'}</span>)}</span></div>)}</section>
            })}</div>
          </div>}
        </div>
      })}
      {!pageSchedules.length && <p className="py-10 text-center text-sm text-[#68645C]">Nenhuma escala encontrada neste mês.</p>}
    </div></div>

    <footer className="flex flex-col gap-3 px-4 py-3 text-xs text-[#81796D] sm:flex-row sm:items-center sm:justify-between sm:px-5"><span>{filtered.length ? `Exibindo ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length} cultos` : 'Nenhum culto neste filtro'}</span><div className="flex items-center justify-end gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded-lg px-2 py-1.5 disabled:opacity-40">Anterior</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map(value => <button key={value} type="button" aria-current={page === value ? 'page' : undefined} onClick={() => setPage(value)} className={`min-w-7 rounded-md px-2 py-1.5 ${page === value ? 'bg-[#8A6729] font-semibold text-white' : 'hover:bg-[#F7F2E8]'}`}>{value}</button>)}<button type="button" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)} className="rounded-lg px-2 py-1.5 disabled:opacity-40">Próximo</button></div></footer>
  </section>
}
