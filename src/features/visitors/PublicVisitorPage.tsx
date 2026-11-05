import { useState, type FormEvent } from 'react'
import { Check, Heart, Leaf, LockKeyhole, Send } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { BrandLogo } from '../../components/BrandLogo'
import { supabase } from '../../lib/supabase'

const thankYouMessage = 'Obrigado por compartilhar seu contato. Em breve, nossa equipe poderÃ¡ falar com vocÃª.'

function isValidPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '')
  if (value.trim().startsWith('00')) {
    const international = digits.slice(2)
    return international.startsWith('55') && (international.length === 12 || international.length === 13)
  }
  return value.trim().startsWith('+') ? digits.length >= 8 && digits.length <= 15 : digits.length === 10 || digits.length === 11 || (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13)
}

export function PublicVisitorPage() {
  const [startedAt] = useState(() => Date.now())
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const trimmedName = name.trim().replace(/\s+/g, ' ')
    if (trimmedName.length < 2 || trimmedName.length > 120) {
      setError('Informe seu nome para continuarmos.')
      return
    }
    if (!isValidPhoneInput(phone)) {
      setError('Confira o telefone e inclua o DDD.')
      return
    }
    if (!supabase) {
      setError('O cadastro estÃ¡ temporariamente indisponÃ­vel. Tente novamente mais tarde.')
      return
    }

    setSubmitting(true)
    try {
      const { data, error: submitError } = await supabase.functions.invoke('public-visitor-register', {
        body: { name: trimmedName, phone: phone.trim(), website, startedAt },
      })
      if (submitError || !data?.ok) {
        setError(data?.message ?? 'NÃ£o foi possÃ­vel concluir agora. Tente novamente mais tarde.')
        return
      }
      setComplete(true)
    } catch {
      setError('NÃ£o foi possÃ­vel concluir agora. Tente novamente mais tarde.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="public-visitor min-h-screen bg-[#f7f7f2] text-[#243128]">
    <div className="mx-auto grid min-h-screen max-w-[1200px] md:grid-cols-[.92fr_1.08fr]">
      <section className="public-welcome relative flex min-h-[250px] flex-col justify-between overflow-hidden bg-[#293c30] px-6 pb-8 pt-7 text-white sm:px-10 sm:pt-9 md:min-h-screen md:px-14 md:pb-12 md:pt-10 lg:px-20">
        <div className="welcome-orbit welcome-orbit-one"/><div className="welcome-orbit welcome-orbit-two"/>
        <div className="relative"><BrandLogo className="w-[178px] max-w-full rounded-lg sm:w-[195px]" /></div>
        <div className="relative mt-10 max-w-md md:mb-8 md:mt-0"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-[11px] text-white/75"><Leaf size={13}/> Um lugar para vocÃª</div><h1 className="font-serif text-4xl leading-[1.08] tracking-tight sm:text-5xl md:text-[54px]">Que bom ter<br/>vocÃª <em className="font-normal text-[#c7d7b2]">aqui.</em></h1><p className="mt-4 max-w-sm text-sm leading-6 text-white/65">Sua presenÃ§a Ã© muito especial. Queremos agradecer a visita e manter as portas abertas para vocÃª.</p></div>
        <div className="relative hidden items-center gap-2 text-xs text-white/55 md:flex"><Heart size={14} className="text-[#c7d7b2]"/> Acolhimento, cuidado e pertencimento.</div>
      </section>
      <section className="flex items-start justify-center px-5 pb-10 pt-7 sm:px-10 md:items-center md:px-12 md:py-12 lg:px-20">
        <div className="w-full max-w-[430px]">
          <div className="mb-7"><p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#617b61]">Cadastro de visitante</p><h2 className="mt-2 text-[27px] font-semibold tracking-tight">Vamos manter contato?</h2><p className="mt-2 text-sm leading-6 text-[#788177]">Preencha seus dados. Ã‰ rapidinho.</p></div>
          {complete ? <div role="status" className="rounded-[24px] border border-[#e3e8dd] bg-white p-7 shadow-[0_18px_50px_rgba(35,48,36,.05)] sm:p-9"><div className="grid size-12 place-items-center rounded-2xl bg-[#edf3e9] text-[#425b46]"><Check size={23}/></div><h3 className="mt-5 text-xl font-semibold">Que bom receber vocÃª!</h3><p className="mt-2 text-sm leading-6 text-[#788177]">{thankYouMessage}</p></div> : <form onSubmit={handleSubmit} className="rounded-[24px] border border-[#e3e8dd] bg-white p-5 shadow-[0_18px_50px_rgba(35,48,36,.05)] sm:p-8">
            <div className="space-y-5">
              <label className="block text-sm font-medium">Seu nome<input className="form-input mt-2" type="text" name="name" autoComplete="name" maxLength={120} required value={name} onChange={event => setName(event.target.value)} placeholder="Como podemos chamar vocÃª?" /></label>
              <label className="block text-sm font-medium">Telefone com DDD<input className="form-input mt-2" type="tel" name="phone" autoComplete="tel" inputMode="tel" maxLength={30} required value={phone} onChange={event => setPhone(event.target.value)} placeholder="(11) 99999-0000" /></label>
            </div>
            <div className="visitor-honeypot" aria-hidden="true"><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label></div>
            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">{error}</p>}
            <Button type="submit" disabled={submitting} className="mt-6 w-full">{submitting ? 'Enviandoâ€¦' : 'Enviar meu cadastro'}<Send size={15}/></Button>
            <div className="mt-5 flex items-start gap-3 border-t border-[#edf0e9] pt-4"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-[#657b61]"/><p className="text-xs leading-5 text-[#7b8379]">Seu nome e telefone serÃ£o usados pela equipe de Boas-Vindas para agradecer sua visita e realizar contato relacionado ao acolhimento.</p></div>
          </form>}
          <p className="mt-5 text-center text-[11px] text-[#91978f]">Comunidade, cuidado e pertencimento.</p>
        </div>
      </section>
    </div>
  </main>
}
