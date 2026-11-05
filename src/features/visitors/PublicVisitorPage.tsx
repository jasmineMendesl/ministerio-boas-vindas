import { useState, type FormEvent } from 'react'
import { Check, Gift, Heart, MessageSquareText, ShieldCheck, UserRound } from 'lucide-react'
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

  return <main className="public-visitor min-h-screen px-4 py-5 text-[#222820] sm:px-6 sm:py-8">
    <div className="mx-auto w-full max-w-[470px]">
      <header className="flex items-center justify-between gap-2">
        <span className="inline-flex min-h-9 items-center rounded-full border border-[#e0e3dc] bg-white/75 px-4 text-[11px] font-semibold tracking-wide text-[#526b57] sm:text-xs">Ministério de Boas-Vindas</span>
        <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#dff0df] px-3 text-[11px] font-medium text-[#58765e] sm:text-xs"><span className="size-1.5 rounded-full bg-[#85a78a]"/>Culto de Celebração</span>
      </header>

      <section className="pb-6 pt-6 text-center sm:pb-7 sm:pt-8">
        <div className="relative mx-auto grid size-16 place-items-center rounded-[20px] border border-[#e8ece5] bg-white shadow-[0_8px_24px_rgba(41,61,44,.08)]">
          <Heart className="fill-[#3d684f] text-[#3d684f]" size={27} strokeWidth={1.7}/>
          <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-[#f8f8f5] bg-[#80572e] text-white"><Gift size={14}/></span>
        </div>
        <h1 className="mx-auto mt-5 max-w-[410px] text-[25px] font-semibold leading-[1.2] tracking-[-.04em] text-[#242923] sm:text-[29px]">A paz do Senhor! Seja muito bem-vindo(a) à nossa casa!</h1>
        <p className="mx-auto mt-3 max-w-[390px] text-sm leading-[1.65] text-[#697168] sm:text-[15px]">É um privilégio receber você em nosso culto. Queremos orar por você e te presentear com uma lembrança especial.</p>
      </section>

      {complete ? <section role="status" className="rounded-[21px] border border-[#e8ebe5] bg-white p-6 text-center shadow-[0_12px_34px_rgba(44,55,44,.07)] sm:p-8"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#eaf2e8] text-[#3e684f]"><Check size={25}/></span><h2 className="mt-4 text-xl font-semibold">Que bom receber você!</h2><p className="mt-2 text-sm leading-6 text-[#697168]">{thankYouMessage}</p></section> : <form onSubmit={handleSubmit} className="rounded-[20px] border border-[#e7e9e2] bg-white p-5 shadow-[0_12px_34px_rgba(44,55,44,.07)] sm:p-6">
        <div className="space-y-[17px]">
          <label className="block text-sm font-semibold">Nome completo <span className="text-[#3d684f]">*</span>
            <span className="relative mt-1.5 block"><UserRound size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#758177]"/><input className="form-input pl-11" type="text" name="name" autoComplete="name" maxLength={120} required value={name} onChange={event => setName(event.target.value)} placeholder="Como podemos te chamar?" /></span>
          </label>
          <label className="block text-sm font-semibold">WhatsApp / Telefone <span className="text-[#3d684f]">*</span>
            <span className="relative mt-1.5 block"><MessageSquareText size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#758177]"/><input className="form-input pl-11" type="tel" name="phone" autoComplete="tel" inputMode="tel" maxLength={30} required value={phone} onChange={event => setPhone(event.target.value)} placeholder="(11) 90000-0000" /></span>
          </label>
          <label className="block text-sm font-semibold">Dia em que você foi ao culto <span className="text-[#3d684f]">*</span><input className="form-input mt-1.5" type="date" name="visitedOn" max={localDateInputValue()} required value={visitedOn} onChange={event => setVisitedOn(event.target.value)} /></label>
          <label className="block text-sm font-semibold">Gostaria de um pedido de oração? <span className="font-normal text-[#899087]">(Opcional)</span>
            <textarea className="form-input form-textarea mt-1.5 min-h-[88px] rounded-xl bg-[#f7f7f3] text-sm" name="prayerRequest" maxLength={2000} rows={3} value={prayerRequest} onChange={event => setPrayerRequest(event.target.value)} placeholder="Escreva aqui se deseja que nossa equipe pastoral interceda por você ou sua família..." />
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-[#f7f7f3] px-3 py-2.5 text-xs leading-5 text-[#505950]"><input className="mt-1 size-4 shrink-0 accent-[#3d684f]" type="checkbox" name="contactConsent" checked={contactConsent} onChange={event => setContactConsent(event.target.checked)} /><span><span className="font-medium">Aceito receber uma mensagem da equipe de Boas-Vindas.</span><span className="block text-[#7b8379]">Opcional. Você pode concluir sem autorizar contato.</span></span></label>
        </div>

        <div className="visitor-honeypot" aria-hidden="true"><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label></div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">{error}</p>}
        <Button type="submit" disabled={submitting} className="mt-5 min-h-[60px] w-full rounded-xl bg-[#3d684f] px-4 text-sm font-semibold leading-5 hover:bg-[#345941]">Concluir<Gift size={18}/></Button>
      </form>}

      <footer className="px-3 pb-2 pt-6 text-center">
        <p className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[.06em] text-[#7e877e]"><ShieldCheck size={14}/>Cuidado e privacidade</p>
        <p className="mx-auto mt-2 max-w-[380px] text-xs leading-[1.55] text-[#737b71]">Seus dados são confidenciais e utilizados apenas pela nossa equipe de acolhimento pastoral para orar por você e entrar em contato com respeito.</p>
        <div className="mt-5 border-t border-[#e9eae4] pt-4 text-[11px] text-[#899087]">ADLago · Ministério de Boas-Vindas</div>
      </footer>
    </div>
  </main>
}
