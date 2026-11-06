import { useState, type FormEvent } from 'react'
import { Check, Leaf, ShieldCheck } from 'lucide-react'
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
    if (!fullName) return setError('Informe seu nome para continuarmos.')
    if (!normalizedPhone) return setError('Confira o telefone e inclua o DDD.')
    if (!isValidServiceDate(visitedOn, localDateInputValue())) return setError('Informe uma data válida, hoje ou anterior, para o culto.')
    if (!isValidPrayerRequest(prayerRequest)) return setError('O pedido de oração deve ter até 2.000 caracteres.')
    if (!supabase) return setError('O cadastro está temporariamente indisponível. Tente novamente mais tarde.')

    setSubmitting(true)
    try {
      const { data, error: submitError } = await supabase.functions.invoke('public-visitor-register', {
        body: { name: fullName, phone: normalizedPhone, visitedOn, prayerRequest: normalizePrayerRequest(prayerRequest), contactConsent, website, startedAt },
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

  return <main className="visitor-page min-h-screen text-[#161616]">
    <header className="visitor-hero relative isolate overflow-hidden bg-[#8A6729] text-white">
      <span aria-hidden="true" className="welcome-orbit welcome-orbit-one" />
      <span aria-hidden="true" className="welcome-orbit welcome-orbit-two" />
      <div className="relative mx-auto max-w-[1080px] px-[22px] pb-8 pt-7 sm:px-8 sm:pb-12 sm:pt-9 lg:px-12 lg:pb-14">
        <div className="flex items-center gap-3">
          <span className="grid size-[40px] place-items-center rounded-[14px] bg-white/10 font-serif text-[19px]">B</span>
          <span className="leading-tight"><strong className="block text-[14px] font-semibold">Ministério de</strong><span className="mt-1 block text-[12px] text-white/75">Boas-Vindas</span></span>
        </div>
        <div className="mt-9 max-w-[550px] sm:mt-12">
          <span className="inline-flex h-[31px] items-center gap-2 rounded-full border border-white/20 px-3 text-[12px] text-white/90"><Leaf size={14} strokeWidth={1.7}/>Um lugar para você</span>
          <h1 className="mt-4 font-serif text-[37px] leading-[1.04] tracking-[-.04em] sm:text-[48px]">Que bom ter<br className="hidden sm:block"/> você <em className="text-[#D8C79D]">aqui.</em></h1>
          <p className="mt-4 max-w-[430px] text-[14px] leading-[1.7] text-white/80 sm:text-[15px]">Sua presença é muito especial. Queremos agradecer a visita e manter as portas abertas para você.</p>
        </div>
      </div>
    </header>

    <section className="visitor-form-section px-[18px] pb-10 pt-7 sm:px-6 sm:pb-14 sm:pt-9">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-6 sm:mb-7">
          <p className="text-[11px] font-medium uppercase tracking-[.18em] text-[#8A6729]">Cadastro de visitante</p>
          <h2 className="mt-3 text-[25px] font-semibold tracking-[-.04em] sm:text-[29px]">Vamos manter contato?</h2>
          <p className="mt-2 text-[13px] text-[#68645C] sm:text-sm">Preencha seus dados. É rapidinho.</p>
        </div>

        {complete ? <section role="status" className="visitor-form-card max-w-[700px] rounded-[22px] border border-[#E5DDCF] bg-white p-6 text-center shadow-[0_10px_32px_rgba(0,0,0,.05)] sm:p-9"><span className="status-positive mx-auto grid size-14 place-items-center rounded-full"><Check size={25}/></span><h3 className="mt-4 text-xl font-semibold">Que bom receber você!</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#68645C]">{thankYouMessage}</p></section> : <form onSubmit={handleSubmit} className="visitor-form-card max-w-[700px] rounded-[22px] border border-[#E5DDCF] bg-white p-[19px] shadow-[0_10px_32px_rgba(0,0,0,.05)] sm:p-7">
          <div className="space-y-[19px]">
            <label className="block text-[13px] font-medium">Seu nome <span className="text-[#8A6729]">*</span><input className="form-input mt-2 h-[47px] rounded-[12px]" type="text" name="name" autoComplete="name" maxLength={120} required value={name} onChange={event => setName(event.target.value)} placeholder="Como podemos chamar você?" /></label>
            <label className="block text-[13px] font-medium">Telefone com DDD <span className="text-[#8A6729]">*</span><input className="form-input mt-2 h-[47px] rounded-[12px]" type="tel" name="phone" autoComplete="tel" inputMode="tel" maxLength={30} required value={phone} onChange={event => setPhone(event.target.value)} placeholder="(11) 99999-0000" /></label>
            <label className="block text-[13px] font-medium">Dia em que você foi ao culto <span className="text-[#8A6729]">*</span><input className="form-input mt-2 h-[47px] rounded-[12px]" type="date" name="visitedOn" max={localDateInputValue()} required value={visitedOn} onChange={event => setVisitedOn(event.target.value)} /></label>
            <label className="block text-[13px] font-medium">Deseja deixar um pedido de oração? <span className="font-normal text-[#68645C]">Opcional</span><textarea className="form-input form-textarea mt-2 min-h-[96px] rounded-[12px] bg-[#FBF9F4] text-[13px] leading-5" name="prayerRequest" maxLength={2000} rows={3} value={prayerRequest} onChange={event => setPrayerRequest(event.target.value)} placeholder="Se quiser, escreva aqui seu pedido." /></label>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-[#FBF9F4] px-3 py-3 text-[12px] leading-5 text-[#68645C]"><input className="mt-1 size-4 shrink-0 accent-[#8A6729]" type="checkbox" name="contactConsent" checked={contactConsent} onChange={event => setContactConsent(event.target.checked)} /><span><span className="font-medium">Aceito receber uma mensagem da equipe de Boas-Vindas.</span><span className="block text-[#68645C]">Opcional. Você pode concluir sem autorizar contato.</span></span></label>
          </div>
          <div className="visitor-honeypot" aria-hidden="true"><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label></div>
          {error && <p role="alert" className="status-negative mt-4 rounded-xl border px-4 py-3 text-sm leading-5">{error}</p>}
          <Button type="submit" disabled={submitting} className="mt-5 min-h-[52px] w-full rounded-xl bg-[#8A6729] px-4 text-sm font-semibold hover:bg-[#6B4F1D]">{submitting ? 'Enviando...' : 'Concluir'}</Button>
        </form>}

        <footer className="max-w-[700px] px-2 pb-1 pt-6 text-center sm:pt-7">
          <p className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[.08em] text-[#68645C]"><ShieldCheck size={14}/>Cuidado e privacidade</p>
          <p className="mx-auto mt-2 max-w-[520px] text-[11px] leading-[1.6] text-[#68645C]">Seus dados são confidenciais e utilizados apenas pela nossa equipe de acolhimento pastoral para orar por você e entrar em contato com respeito.</p>
          <div className="mt-5 border-t border-[#E5DDCF] pt-4 text-[11px] text-[#68645C]">ADLago • Ministério de Boas-Vindas</div>
        </footer>
      </div>
    </section>
  </main>
}
