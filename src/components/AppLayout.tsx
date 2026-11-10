import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, CalendarDays, Coffee, HeartHandshake, LayoutDashboard, LogOut, Sparkles, UserPlus, UsersRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../app/AuthProvider'
import { Button } from './ui/button'
import { PushNotificationControl, removePushSubscription } from './PushNotificationControl'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/visitantes', label: 'Visitantes', icon: UsersRound },
  { to: '/decisoes', label: 'Aceitações / Reconciliações', short: 'Decisões', icon: HeartHandshake },
  { to: '/pertencer', label: 'Projeto Pertencer', short: 'Pertencer', icon: Coffee },
  { to: '/escala', label: 'Escala', icon: CalendarDays },
  { to: '/relatorios', label: 'Relatórios', short: 'Relatórios', icon: BarChart3, adminOnly: true },
]

export function AppLayout() {
  const { session, role, displayName } = useAuth()
  const navigate = useNavigate()
  const email = session?.user.email ?? 'Equipe autorizada'
  const visibleLinks = links.filter(link => !link.adminOnly || role === 'admin')

  async function signOut() {
    await removePushSubscription(session?.user.id)
    await supabase?.auth.signOut()
    navigate('/login', { replace: true })
  }

  return <div className="min-h-screen bg-background text-foreground">
    <aside className="sidebar hidden md:flex">
        <div className="flex items-center gap-3 px-3 py-2"><div className="brand-mark">B</div><div><p className="font-semibold tracking-tight">Ministério de</p><p className="text-xs text-muted">Boas-Vindas</p></div></div>
        <NavLink to="/visitante" className="mt-6 inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#8A6729] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#6B4F1D]"><UserPlus size={17}/>Acolher Visitante</NavLink>
        <div className="mt-6 px-3 text-[11px] font-semibold uppercase tracking-[.16em] text-muted">Menu principal</div>
        <nav aria-label="Menu principal" className="mt-3 flex flex-col gap-1">{visibleLinks.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}><Icon size={18} strokeWidth={1.8}/><span>{label}</span></NavLink>)}</nav>
        <div className="mt-auto rounded-2xl bg-[#F0E6D2] p-4"><div className="mb-3 grid size-9 place-items-center rounded-xl bg-white text-primary"><Sparkles size={17}/></div><p className="text-sm font-medium">Um lugar para pertencer</p><p className="mt-1 text-xs leading-5 text-muted">Acolhendo pessoas com cuidado, em cada etapa.</p></div>
        <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4"><div className="min-w-0"><p className="truncate text-xs font-semibold">{displayName ?? 'Equipe autorizada'}</p><p className="truncate text-[11px] text-muted">{email} · {role === 'admin' ? 'Admin' : 'Team'}</p></div><Button variant="ghost" size="icon" aria-label="Sair" onClick={signOut}><LogOut size={17}/></Button></div>
    </aside>
    <div className="md:pl-[264px]">
      <header className="topbar"><div className="flex items-center gap-3 md:hidden"><div className="brand-mark size-9 text-sm">B</div><span className="font-semibold">Ministério de Boas-Vindas</span></div><div className="hidden md:block"><p className="text-xs text-muted">MINISTÉRIO DE BOAS-VINDAS</p><p className="text-sm font-medium">Acolhimento com cuidado e propósito</p></div><div className="ml-auto hidden items-center gap-2 sm:flex"><span className="size-2 rounded-full bg-emerald-500"/><span className="text-xs text-muted">Área da equipe</span></div><PushNotificationControl/><Button className="ml-auto md:hidden" variant="ghost" size="icon" aria-label="Sair" onClick={signOut}><LogOut size={17}/></Button></header>
      <main className="mx-auto max-w-[1320px] px-4 pb-28 pt-7 sm:px-7 md:px-10 md:pb-12 md:pt-9"><Outlet/></main>
      <nav aria-label="Menu inferior" className="bottom-nav md:hidden" style={{ gridTemplateColumns: `repeat(${visibleLinks.length}, minmax(0, 1fr))` }}>{visibleLinks.map(({ to, short, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottom-link ${isActive ? 'bottom-link-active' : ''}`}><Icon size={19} strokeWidth={1.9}/><span>{short ?? label}</span></NavLink>)}</nav>
    </div>
  </div>
}
