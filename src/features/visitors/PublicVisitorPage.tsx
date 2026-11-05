import { useState, type FormEvent } from 'react'
import { Check, Heart, Leaf, LockKeyhole, Send } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { supabase } from '../../lib/supabase'
import { isValidPrayerRequest, isValidServiceDate, normalizeBrazilianPhone, normalizePrayerRequest, normalizeVisitorName } from '../../../supabase/functions/_shared/visitor-validation.ts'

const thankYouMessage = 'Obrigado por compartilhar seu contato. Em breve, nossa equipe poderá falar com você.'

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function PublicVisitorPage() {
  const [startedAt] = useState(() => Date.now())
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [visitedOn, setVisitedOn] = useState(() => localDateInputValue())
  const [prayerRequest, setPrayerRequest] = useState('')
  const [contactConsent, setContactConsent] = useState(false)
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const fullName = normalizeVisitorName(name)
    const normalizedPhone = normalizeBrazilianPhone(phone)
    if (!fullName) {
      setError('Informe seu nome para continuarmos.')
      return
    }
    if (!normalizedPhone) {
      setError('Confira o telefone e inclua o DDD.')
      return
    }
    if (!isValidServiceDate(visitedOn, localDateInputValue())) {
      setError('Informe uma data válida, hoje ou anterior, para o culto.')
      return
    }
    if (!isValidPrayerRequest(prayerRequest)) {
      setError('O pedido de oração deve ter até 2.000 caracteres.')
      return
    }
    if (!supabase) {
      setError('O cadastro está temporariamente indisponível. Tente novamente mais tarde.')
      return
    }

    setSubmitting(true)
    try {
      const { data, error: submitError } = await supabase.functions.invoke('public-visitor-register', {
        body: {
          name: fullName,
          phone: normalizedPhone,
          visitedOn,
          prayerRequest: normalizePrayerRequest(prayerRequest),
          contactConsent,
          website,
          startedAt,
        },
      })
      if (submitError || !data?.ok) {
        setError(data?.message ?? 'Não foi possível concluir agora. Tente novamente mais tarde.')
        return
      }
      setComplete(true)
    } catch {
      setError('Não foi possível concluir agora. Tente novamente mais tarde.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="public-visitor min-h-screen bg-[#f7f7f2] text-[#243128]">
    <div className="mx-auto grid min-h-screen max-w-[1200px] md:grid-cols-[.92fr_1.08fr]">
      <section className="public-welcome relative flex min-h-[250px] flex-col justify-between overflow-hidden bg-[#293c30] px-6 pb-8 pt-7 text-white sm:px-10 sm:pt-9 md:min-h-screen md:px-14 md:pb-12 md:pt-10 lg:px-20">
        <div className="welcome-orbit welcome-orbit-one"/><div className="welcome-orbit welcome-orbit-two"/>
        <div className="relative flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-white/10 font-serif text-lg">B</div><div><p className="text-sm font-semibold tracking-wide">Ministério de</p><p className="text-[11px] text-white/60">Boas-Vindas</p></div></div>
        <div className="relative mt-10 max-w-md md:mb-8 md:mt-0"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-[11px] text-white/75"><Leaf size={13}/> Um lugar para você</div><h1 className="font-serif text-4xl leading-[1.08] tracking-tight sm:text-5xl md:text-[54px]">Que bom ter<br/>você <em className="font-normal text-[#c7d7b2]">aqui.</em></h1><p className="mt-4 max-w-sm text-sm leading-6 text-white/65">Sua presença é muito especial. Queremos agradecer a visita e manter as portas abertas para você.</p></div>
        <div className="relative hidden items-center gap-2 text-xs text-white/55 md:flex"><Heart size={14} className="text-[#c7d7b2]"/> Acolhimento, cuidado e pertencimento.</div>
      </section>
      <section className="flex items-start justify-center px-5 pb-10 pt-7 sm:px-10 md:items-center md:px-12 md:py-12 lg:px-20">
        <div className="w-full max-w-[430px]">
          <div className="mb-7"><p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#617b61]">Cadastro de visitante</p><h2 className="mt-2 text-[27px] font-semibold tracking-tight">Vamos manter contato?</h2><p className="mt-2 text-sm leading-6 text-[#788177]">Preencha seus dados. É rapidinho.</p></div>
          {complete ? <div role="status" className="rounded-[24px] border border-[#e3e8dd] bg-white p-7 shadow-[0_18px_50px_rgba(35,48,36,.05)] sm:p-9"><div className="grid size-12 place-items-center rounded-2xl bg-[#edf3e9] text-[#425b46]"><Check size={23}/></div><h3 className="mt-5 text-xl font-semibold">Que bom receber você!</h3><p className="mt-2 text-sm leading-6 text-[#788177]">{thankYouMessage}</p></div> : <form onSubmit={handleSubmit} className="rounded-[24px] border border-[#e3e8dd] bg-white p-5 shadow-[0_18px_50px_rgba(35,48,36,.05)] sm:p-8">
            <div className="space-y-5">
              <label className="block text-sm font-medium">Seu nome<input className="form-input mt-2" type="text" name="name" autoComplete="name" maxLength={120} required value={name} onChange={event => setName(event.target.value)} placeholder="Como podemos chamar você?" /></label>
              <label className="block text-sm font-medium">Telefone com DDD<input className="form-input mt-2" type="tel" name="phone" autoComplete="tel" inputMode="tel" maxLength={30} required value={phone} onChange={event => setPhone(event.target.value)} placeholder="(11) 99999-0000" /></label>
              <label className="block text-sm font-medium">Dia em que você foi ao culto<input className="form-input mt-2" type="date" name="visitedOn" max={localDateInputValue()} required value={visitedOn} onChange={event => setVisitedOn(event.target.value)} /></label>
              <label className="block text-sm font-medium">Deseja deixar um pedido de oração? <span className="font-normal text-muted">Opcional</span><textarea className="form-input form-textarea mt-2" name="prayerRequest" maxLength={2000} rows={4} value={prayerRequest} onChange={event => setPrayerRequest(event.target.value)} placeholder="Se quiser, escreva aqui seu pedido." /><span className="mt-1 block text-xs font-normal leading-5 text-muted">Esse pedido ficará acessível somente à equipe pastoral.</span></label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#f6f7f3] p-3 text-sm"><input className="mt-1 size-4 shrink-0 accent-primary" type="checkbox" name="contactConsent" checked={contactConsent} onChange={event => setContactConsent(event.target.checked)} /><span><span className="font-medium">Aceito receber uma mensagem da equipe de Boas-Vindas.</span><span className="mt-1 block text-xs leading-5 text-muted">Opcional. Você pode enviar o cadastro sem autorizar o contato.</span></span></label>
            </div>
            <div className="visitor-honeypot" aria-hidden="true"><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label></div>
            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">{error}</p>}
            <Button type="submit" disabled={submitting} className="mt-6 w-full">{submitting ? 'Enviando…' : 'Enviar meu cadastro'}<Send size={15}/></Button>
            <div className="mt-5 flex items-start gap-3 border-t border-[#edf0e9] pt-4"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-[#657b61]"/><p className="text-xs leading-5 text-[#7b8379]">Seu nome e telefone serão usados para acolhimento. Só enviaremos mensagens se você autorizar. Pedidos de oração ficam restritos à equipe pastoral.</p></div>
          </form>}
          <p className="mt-5 text-center text-[11px] text-[#91978f]">Comunidade, cuidado e pertencimento.</p>
        </div>
      </section>
    </div>
  </main>
}
