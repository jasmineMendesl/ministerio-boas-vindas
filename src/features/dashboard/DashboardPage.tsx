import { useEffect, useState } from 'react'
import { CalendarDays, ChartNoAxesCombined, Coffee, HeartHandshake, UsersRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/PageHeader'
import { useAuth } from '../../app/AuthProvider'
import { supabase } from '../../lib/supabase'
import { getServiceDay } from '../../lib/service-day'

type Stats = { visitorsThisMonth: number; decisionsThisMonth: number; awaitingContact: number; invitations: number; nextEvent: string; sundayVisitors: number; thursdayVisitors: number; sundayAcceptances: number; thursdayAcceptances: number; comparisonYear: number }
const emptyStats: Stats = { visitorsThisMonth: 0, decisionsThisMonth: 0, awaitingContact: 0, invitations: 0, nextEvent: '', sundayVisitors: 0, thursdayVisitors: 0, sundayAcceptances: 0, thursdayAcceptances: 0, comparisonYear: new Date().getFullYear() }
const scheduleRoleNames: Record<string, string> = { portaria: 'Portaria', seat_direction: 'Direcionamento de assentos', leader: 'Líder', support: 'Apoio', media: 'Mídia', opening_prayer: 'Oração inicial', male_welcoming: 'Acolhimento masculino', female_welcoming: 'Acolhimento feminino', equipment_check: 'Conferência de placas e cavaletes', app_closing: 'Fechamento no aplicativo', confession_prayer: 'Oração de Confissão', reconciliation_word: 'Palavra de reconciliação', closing_prayer: 'Oração Final' }
function localDateInput() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }

function SummaryCard({ icon: Icon, title, value, subtitle }: { icon: typeof UsersRound; title: string; value: number | string; subtitle: string }) {
  return <article className="rounded-2xl border border-[#E5DDCF] bg-white p-4 shadow-[0_3px_12px_rgba(0,0,0,.035)]"><span className="grid size-9 place-items-center rounded-lg bg-[#F0E6D2] text-[#8A6729]"><Icon size={18}/></span><p className="mt-3 text-xs text-[#68645C]">{title}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-[#68645C]">{subtitle}</p></article>
}

export function DashboardPage() {
  const { session, displayName } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(emptyStats)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [personalAssignments, setPersonalAssignments] = useState<{ date: string; service: string; roles: string[] }[]>([])
  const [todayAssignments, setTodayAssignments] = useState<{ service: string; roles: string[] }[]>([])
  const [pendingGiftClosures, setPendingGiftClosures] = useState<string[]>([])
  const [personalScheduleError, setPersonalScheduleError] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase || !session?.user.id) { setError('Entre com uma conta autorizada para consultar o painel.'); setLoading(false); return }
      setLoading(true); setError('')
      const now = new Date()
      const dateOnly = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const firstDay = dateOnly(new Date(now.getFullYear(), now.getMonth(), 1))
      const today = dateOnly(now)
      const comparisonYear = now.getFullYear()
      const yearStart = `${comparisonYear}-01-01`
      const nextYearStart = `${comparisonYear + 1}-01-01`
      const [giftReportDays, decisions, followUps, event, acceptanceDays] = await Promise.all([
        supabase.from('visitor_service_gift_reports').select('service_date,gifts_delivered').gte('service_date', yearStart).lt('service_date', nextYearStart),
        supabase.from('decisions').select('id', { count: 'exact', head: true }).gte('decided_on', firstDay),
        supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_first_contact'),
        supabase.from('pertencer_events').select('id,event_date').gte('event_date', today).is('closed_at', null).order('event_date', { ascending: true }).limit(1),
        supabase.from('decisions').select('decided_on').eq('decision_type', 'acceptance').gte('decided_on', yearStart).lt('decided_on', nextYearStart),
      ])
      if (!active) return
      const assignmentsResult = await supabase.from('ministry_schedule_assignments').select('schedule_id,ministry_role').eq('volunteer_profile_id', session.user.id)
      if (assignmentsResult.error) { setPersonalScheduleError(true); setPersonalAssignments([]); setTodayAssignments([]); setPendingGiftClosures([]) }
      else {
        setPersonalScheduleError(false)
        const assignments = assignmentsResult.data ?? []
        const scheduleIds = [...new Set(assignments.map(item => item.schedule_id))]
        if (scheduleIds.length) {
          const scheduleResult = await supabase.from('ministry_schedules').select('id,service_date,service_label').in('id', scheduleIds).gte('service_date', today).order('service_date')
          if (scheduleResult.error) { setPersonalScheduleError(true); setPersonalAssignments([]); setTodayAssignments([]); setPendingGiftClosures([]) }
          else {
            const schedules = scheduleResult.data ?? []
            const firstSchedule = schedules[0]
            const assignmentRoles = (scheduleId: string) => assignments.filter(item => item.schedule_id === scheduleId).map(item => item.ministry_role)
            setPersonalAssignments(firstSchedule ? [{ date: firstSchedule.service_date, service: firstSchedule.service_label, roles: assignmentRoles(firstSchedule.id) }] : [])
            const assignedToday = schedules.filter(schedule => schedule.service_date === today).map(schedule => ({ service: schedule.service_label, roles: assignmentRoles(schedule.id) }))
            setTodayAssignments(assignedToday)
            const leaderServices = assignedToday.filter(item => item.roles.includes('leader')).map(item => item.service)
            if (leaderServices.length) {
              const reports = await supabase.from('visitor_service_gift_reports').select('service_label').eq('service_date', today).in('service_label', leaderServices)
              setPendingGiftClosures(reports.error ? [] : leaderServices.filter(service => !reports.data?.some(report => report.service_label === service)))
            } else setPendingGiftClosures([])
          }
        } else { setPersonalAssignments([]); setTodayAssignments([]); setPendingGiftClosures([]) }
      }
      const failed = giftReportDays.error || decisions.error || followUps.error || event.error || acceptanceDays.error
      if (failed) { setError('Não foi possível carregar todos os indicadores. Verifique a conexão e as permissões.'); setStats(emptyStats) }
      else {
        const upcoming = event.data?.[0]
        let invitations = 0
        if (upcoming) {
          const result = await supabase.from('event_invitations').select('id', { count: 'exact', head: true }).eq('event_id', upcoming.id)
          if (result.error) { setError('Indicadores carregados parcialmente: não foi possível contar os convites.'); }
          else invitations = result.count ?? 0
        }
        if (!active) return
        setStats({
          visitorsThisMonth: (giftReportDays.data ?? []).filter(row => row.service_date >= firstDay && row.service_date <= today).reduce((total, row) => total + row.gifts_delivered, 0),
          decisionsThisMonth: decisions.count ?? 0,
          awaitingContact: followUps.count ?? 0,
          invitations,
          nextEvent: upcoming?.event_date ?? '',
          sundayVisitors: (giftReportDays.data ?? []).filter(row => getServiceDay(row.service_date) === 'sunday').reduce((total, row) => total + row.gifts_delivered, 0),
          thursdayVisitors: (giftReportDays.data ?? []).filter(row => getServiceDay(row.service_date) === 'thursday').reduce((total, row) => total + row.gifts_delivered, 0),
          sundayAcceptances: (acceptanceDays.data ?? []).filter(row => getServiceDay(row.decided_on) === 'sunday').length,
          thursdayAcceptances: (acceptanceDays.data ?? []).filter(row => getServiceDay(row.decided_on) === 'thursday').length,
          comparisonYear,
        })
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [session?.user.id])

  return <div className="animate-in space-y-5 text-[#161616]">
    <PageHeader icon={ChartNoAxesCombined} eyebrow="VISÃO GERAL · DADOS DO SUPABASE" title={`Bom dia, ${displayName ?? 'equipe'}`} description="Acolhimento e acompanhamento da comunidade."/>
    <Link to="/escala" aria-label="Minha próxima escala" className="block rounded-2xl border border-[#D9CCB2] bg-[linear-gradient(110deg,#fff_0%,#FBF9F4_55%,#F0E6D2_100%)] p-4 shadow-[0_3px_12px_rgba(0,0,0,.035)] transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6729] focus-visible:ring-offset-2 sm:p-5"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#8A6729] text-white"><CalendarDays size={19}/></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[#8A6729]">Minha próxima escala</p>{personalScheduleError ? <p className="mt-1 text-sm text-[#68645C]">A escala estará disponível após a configuração do banco de dados.</p> : personalAssignments.length ? <><p className="mt-1 font-semibold capitalize">{new Date(`${personalAssignments[0].date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · {personalAssignments[0].service}</p><div className="mt-2 flex flex-wrap gap-2">{personalAssignments[0].roles.map((assignedRole, index) => <span key={`${assignedRole}-${index}`} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#34322E]">{scheduleRoleNames[assignedRole] ?? assignedRole}</span>)}</div></> : <p className="mt-1 text-sm text-[#68645C]">Você ainda não está escalado para um próximo culto.</p>}</div></div></Link>
    {todayAssignments.length > 0 && <section aria-label="Ações da escala de hoje" className="flex flex-col gap-2 rounded-2xl border border-[#E5DDCF] bg-white p-4 sm:flex-row sm:flex-wrap sm:items-center"><Button type="button" size="sm" onClick={() => navigate('/decisoes/nova')} className="min-h-10 text-sm">Registrar nova decisão</Button>{pendingGiftClosures.map(service => <button key={service} type="button" onClick={() => navigate(`/visitantes?tab=gifts&register=1&date=${encodeURIComponent(localDateInput())}&service=${encodeURIComponent(service)}`)} className="inline-flex min-h-10 items-center rounded-lg border border-[#E8C49B] bg-[#FFF2E4] px-3 py-2 text-left text-sm font-medium text-[#8A4B16]">Alerta: faça o fechamento de mimos · {service}</button>)}</section>}
    {error && <p role="alert" className="status-pending rounded-lg border px-3 py-2 text-sm">{error}</p>}
    {loading && <p role="status" className="text-xs text-[#68645C]">Carregando indicadores…</p>}
    <section aria-label="Indicadores do ministério" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard icon={UsersRound} title="Visitantes neste mês" value={stats.visitorsThisMonth} subtitle="Contados pelos mimos entregues"/>
      <SummaryCard icon={HeartHandshake} title="Decisões neste mês" value={stats.decisionsThisMonth} subtitle="Aceitações e reconciliações"/>
      <SummaryCard icon={CalendarDays} title="Aguardando primeiro contato" value={stats.awaitingContact} subtitle="Pendências de acompanhamento"/>
      <SummaryCard icon={Coffee} title="Convidados na próxima edição" value={stats.invitations} subtitle={stats.nextEvent ? `Edição em ${new Date(`${stats.nextEvent}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Nenhuma edição futura cadastrada'}/>
    </section>
    {!loading && !error && <section aria-label="Comparativo de visitas e aceitações por culto" className="space-y-3 rounded-2xl border border-[#E5DDCF] bg-white p-4 shadow-[0_3px_12px_rgba(0,0,0,.035)] sm:p-5"><div><h2 className="text-base font-semibold">Domingo x Quinta-feira</h2><p className="mt-1 text-xs text-[#68645C]">Comparativo de visitas e aceitações em {stats.comparisonYear}. Domingo soma os cultos das 10h e 18h.</p></div><div className="grid gap-3 sm:grid-cols-2"><article className="rounded-xl border border-[#E5DDCF] bg-[#FBF9F4] p-4"><h3 className="font-semibold">Domingo</h3><div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-xs text-[#68645C]">Visitantes</p><p className="mt-1 text-2xl font-semibold">{stats.sundayVisitors}</p></div><div><p className="text-xs text-[#68645C]">Aceitações</p><p className="mt-1 text-2xl font-semibold">{stats.sundayAcceptances}</p></div></div></article><article className="rounded-xl border border-[#E5DDCF] bg-[#FBF9F4] p-4"><h3 className="font-semibold">Quinta-feira · 19h15</h3><div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-xs text-[#68645C]">Visitantes</p><p className="mt-1 text-2xl font-semibold">{stats.thursdayVisitors}</p></div><div><p className="text-xs text-[#68645C]">Aceitações</p><p className="mt-1 text-2xl font-semibold">{stats.thursdayAcceptances}</p></div></div></article></div></section>}
    {!loading && !error && <p className="text-xs text-[#68645C]">Indicadores consultados com sua conta e filtrados pelas permissões do perfil.</p>}
  </div>
}
