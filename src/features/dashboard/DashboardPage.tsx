import { useEffect, useState } from 'react'
import { CalendarDays, ChartNoAxesCombined, Coffee, HeartHandshake, UsersRound } from 'lucide-react'
import { useAuth } from '../../app/AuthProvider'
import { supabase } from '../../lib/supabase'

type Stats = { visitorsThisMonth: number; decisionsThisMonth: number; awaitingContact: number; invitations: number; nextEvent: string }
const emptyStats: Stats = { visitorsThisMonth: 0, decisionsThisMonth: 0, awaitingContact: 0, invitations: 0, nextEvent: '' }

function SummaryCard({ icon: Icon, title, value, subtitle }: { icon: typeof UsersRound; title: string; value: number | string; subtitle: string }) {
  return <article className="rounded-2xl border border-[#E8DED4] bg-white p-4 shadow-[0_3px_12px_rgba(43,58,45,.035)]"><span className="grid size-9 place-items-center rounded-lg bg-[#F3E9DF] text-[#6F4F28]"><Icon size={18}/></span><p className="mt-3 text-xs text-[#75675D]">{title}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-[#75675D]">{subtitle}</p></article>
}

export function DashboardPage() {
  const { session } = useAuth()
  const [stats, setStats] = useState(emptyStats)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase || !session?.user.id) { setError('Entre com uma conta autorizada para consultar o painel.'); setLoading(false); return }
      setLoading(true); setError('')
      const now = new Date()
      const dateOnly = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const firstDay = dateOnly(new Date(now.getFullYear(), now.getMonth(), 1))
      const today = dateOnly(now)
      const [visitors, decisions, followUps, event] = await Promise.all([
        supabase.from('visitors').select('id', { count: 'exact', head: true }).gte('visited_on', firstDay),
        supabase.from('decisions').select('id', { count: 'exact', head: true }).gte('decided_on', firstDay),
        supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_first_contact'),
        supabase.from('pertencer_events').select('id,event_date').gte('event_date', today).order('event_date', { ascending: true }).limit(1),
      ])
      if (!active) return
      const failed = visitors.error || decisions.error || followUps.error || event.error
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
        setStats({ visitorsThisMonth: visitors.count ?? 0, decisionsThisMonth: decisions.count ?? 0, awaitingContact: followUps.count ?? 0, invitations, nextEvent: upcoming?.event_date ?? '' })
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [session?.user.id])

  return <div className="animate-in space-y-5 text-[#2B2118]">
    <header className="rounded-2xl border border-[#E8DED4] bg-[linear-gradient(110deg,#fff_0%,#fff_72%,#F3E9DF_100%)] p-5 sm:p-7"><span className="inline-flex items-center gap-2 rounded-full bg-[#F3E9DF] px-3 py-1.5 text-xs font-semibold text-[#6F4F28]"><ChartNoAxesCombined size={14}/>VISÃO GERAL · DADOS DO SUPABASE</span><h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Bom dia, equipe</h1><p className="mt-1 text-sm text-[#75675D]">Acolhimento e acompanhamento da comunidade.</p></header>
    {error && <p role="alert" className="status-pending rounded-lg border px-3 py-2 text-sm">{error}</p>}
    {loading && <p role="status" className="text-xs text-[#75675D]">Carregando indicadores…</p>}
    <section aria-label="Indicadores do ministério" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard icon={UsersRound} title="Visitas neste mês" value={stats.visitorsThisMonth} subtitle="Registros de culto"/>
      <SummaryCard icon={HeartHandshake} title="Decisões neste mês" value={stats.decisionsThisMonth} subtitle="Aceitações e reconciliações"/>
      <SummaryCard icon={CalendarDays} title="Aguardando primeiro contato" value={stats.awaitingContact} subtitle="Pendências de acompanhamento"/>
      <SummaryCard icon={Coffee} title="Convidados na próxima edição" value={stats.invitations} subtitle={stats.nextEvent ? `Edição em ${new Date(`${stats.nextEvent}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Nenhuma edição futura cadastrada'}/>
    </section>
    {!loading && !error && <p className="text-xs text-[#75675D]">Indicadores consultados com sua conta e filtrados pelas permissões do perfil.</p>}
  </div>
}
