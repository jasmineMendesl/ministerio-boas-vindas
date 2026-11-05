import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { useAuth } from '../../app/AuthProvider'
import { Button } from '../../components/ui/button'
import { supabase } from '../../lib/supabase'

export function SignInPage() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  if (session) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setError('O acesso ainda não está configurado. Fale com a administração do sistema.')
      return
    }
    setSubmitting(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (authError) setError('Não foi possível entrar. Confira seu e-mail e sua senha ou peça acesso à administração.')
    setSubmitting(false)
  }

  return <main className="min-h-screen bg-[#f5f6f2] md:grid md:grid-cols-[1fr_1fr]">
    <section className="relative hidden overflow-hidden bg-[#27392f] px-12 py-14 text-white md:flex md:flex-col md:justify-between lg:px-20"><div className="absolute -right-28 -top-28 size-[440px] rounded-full border border-white/10"/><div className="absolute -right-4 -top-4 size-[300px] rounded-full border border-white/10"/><div className="absolute -bottom-36 -left-24 size-[420px] rounded-full bg-[#d6dfc4]/[.08]"/><div className="relative flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-white/10 font-serif text-xl">B</div><span className="font-semibold">Ministério de Boas-Vindas</span></div><div className="relative max-w-lg"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/75"><span className="size-1.5 rounded-full bg-[#c3d4a7]"/> Acolhimento e comunidade</div><h1 className="font-serif text-5xl leading-[1.12] tracking-tight lg:text-6xl">Todo encontro<br/>pode ser um<br/><em className="font-normal text-[#c9d8b5]">começo.</em></h1><p className="mt-6 max-w-sm text-sm leading-7 text-white/65">Um espaço para acolher, acompanhar e caminhar junto com cada pessoa.</p></div><p className="relative text-xs text-white/45">Comunidade, cuidado e pertencimento.</p></section>
    <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10"><div className="w-full max-w-[390px]">
      <div className="mb-10 md:hidden"><div className="brand-mark mb-4">B</div><p className="text-sm font-medium">Ministério de Boas-Vindas</p></div>
      <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Área da equipe</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Bem-vindo de volta</h2><p className="mt-2 text-sm text-muted">Entre com sua conta autorizada para continuar.</p></div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block text-sm font-medium">E-mail<input className="form-input mt-2" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@igreja.com.br" /></label>
        <label className="block text-sm font-medium">Senha<span className="relative mt-2 block"><input className="form-input pr-12" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha" /><button type="button" className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted hover:text-foreground" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">{error}</p>}
        <Button className="w-full" type="submit" disabled={submitting || loading}>{submitting ? 'Entrando…' : 'Entrar na equipe'}<ArrowRight size={16}/></Button>
      </form>
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-white/70 p-4"><div className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#eef1e7] text-primary"><LockKeyhole size={16}/></div><p className="text-xs leading-5 text-muted">Acesso restrito. Contas são fornecidas pela administração do sistema.</p></div>
      <p className="mt-8 text-center text-xs text-muted">Precisa de acesso? Fale com a administração do sistema.</p>
    </div></section>
  </main>
}
