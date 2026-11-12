import { useEffect, useState } from 'react'
import { Bell, BellOff, X } from 'lucide-react'
import { useAuth } from '../app/AuthProvider'
import { supabase } from '../lib/supabase'
import { VAPID_PUBLIC_KEY } from '../lib/push-config'
import { withTimeout } from '../lib/with-timeout'

type PushState = 'loading' | 'off' | 'on' | 'denied' | 'unsupported' | 'not-configured' | 'error'

function applicationKeyBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const decoded = window.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(decoded, character => character.charCodeAt(0))
}

async function getRegistration() {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`
  const registration = await withTimeout(navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL }))
  await withTimeout(navigator.serviceWorker.ready)
  return registration
}

export async function removePushSubscription(userId: string | undefined) {
  if (!userId || !supabase || !('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration(`${import.meta.env.BASE_URL}`)
  const subscription = await registration?.pushManager?.getSubscription()
  if (!subscription) return
  try {
    const { error } = await withTimeout(supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', subscription.endpoint))
    if (error) throw error
  } finally {
    await withTimeout(subscription.unsubscribe())
  }
}

export function PushNotificationControl() {
  const { session } = useAuth()
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const publicKey = VAPID_PUBLIC_KEY

  useEffect(() => {
    let active = true
    async function check() {
      if (!publicKey) { setState('not-configured'); return }
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setState('unsupported'); return }
      if (Notification.permission === 'denied') { setState('denied'); return }
      try {
        const registration = await getRegistration()
        const subscription = await withTimeout(registration.pushManager.getSubscription())
        if (!active) return
        if (subscription && Notification.permission === 'granted') {
          const keys = subscription.toJSON().keys
          if (keys?.p256dh && keys.auth && supabase && session?.user.id) {
            const { error } = await withTimeout(supabase.from('push_subscriptions').upsert({
              user_id: session.user.id,
              endpoint: subscription.endpoint,
              p256dh: keys.p256dh,
              auth: keys.auth,
              updated_by: session.user.id,
            }, { onConflict: 'endpoint' }))
            if (error) { setState('error'); return }
          }
          setState('on')
        } else setState('off')
      } catch { if (active) setState('error') }
    }
    void check()
    return () => { active = false }
  }, [publicKey, session?.user.id])

  async function toggle() {
    if (busy) return
    const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    if (state === 'unsupported') {
      setMessage(isAppleMobile
        ? 'No iPhone ou iPad, abra no Safari, toque em Compartilhar e em Adicionar à Tela de Início. Abra o app pelo ícone e ative os avisos novamente.'
        : 'Este navegador não oferece notificações. Abra o site em um navegador atualizado com suporte a notificações, como o Chrome no Android.')
      return
    }
    if (state === 'denied') { setMessage('As notificações estão bloqueadas. Libere a permissão nas configurações deste site no navegador ou nos Ajustes de Notificações do celular e abra o app novamente.'); return }
    if (!publicKey || state === 'not-configured') { setMessage('As notificações ainda não foram configuradas. Avise um administrador.'); return }
    if (!supabase || !session?.user.id) { setMessage('Entre com sua conta para ativar as notificações.'); return }
    setBusy(true); setMessage('')
    try {
      if (state === 'on') {
        const registration = await getRegistration()
        const subscription = await withTimeout(registration.pushManager.getSubscription())
        if (subscription) {
          const { error } = await withTimeout(supabase.from('push_subscriptions').delete().eq('user_id', session.user.id).eq('endpoint', subscription.endpoint))
          if (error) throw error
          await withTimeout(subscription.unsubscribe())
        }
        setState('off'); setMessage('Notificações desativadas neste dispositivo.')
      } else {
        const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
        if (permission !== 'granted') {
          setState(permission === 'denied' ? 'denied' : 'off')
          setMessage(permission === 'denied' ? 'Permissão bloqueada. Libere as notificações nas configurações deste site ou do celular.' : 'Permissão não concedida. Toque no sino para tentar novamente e permitir os avisos.')
          return
        }
        const registration = await getRegistration()
        const subscription = await withTimeout(registration.pushManager.getSubscription()) ?? await withTimeout(registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKeyBytes(publicKey) }))
        const keys = subscription.toJSON().keys
        if (!keys?.p256dh || !keys.auth) throw new Error('Push subscription keys unavailable')
        const { error } = await withTimeout(supabase.from('push_subscriptions').upsert({
          user_id: session.user.id,
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          updated_by: session.user.id,
        }, { onConflict: 'endpoint' }))
        if (error) throw error
        setState('on'); setMessage('Notificações ativadas neste dispositivo.')
      }
    } catch {
      setState('error'); setMessage('Não foi possível atualizar as notificações. Verifique a conexão e as permissões.')
    } finally { setBusy(false) }
  }

  const disabled = busy || state === 'loading'
  const label = state === 'on' ? 'Desativar notificações' : state === 'not-configured' ? 'Notificações não configuradas' : state === 'unsupported' ? 'Notificações indisponíveis neste navegador' : state === 'denied' ? 'Permissão bloqueada nas configurações do navegador' : state === 'error' ? 'Tentar novamente' : state === 'loading' ? 'Verificando notificações' : 'Ativar notificações neste dispositivo'

  return <div className="relative shrink-0" title={label}>
    <button type="button" aria-label={busy ? 'Atualizando notificações' : label} aria-expanded={Boolean(message || state === 'error')} disabled={disabled} onClick={() => void toggle()} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-[#E5DDCF] bg-white px-3 text-xs font-medium text-[#34322E] hover:bg-[#F7F2E8] disabled:cursor-not-allowed disabled:opacity-60">
      {state === 'on' ? <Bell size={16}/> : <BellOff size={16}/>}{state === 'off' && <span className="lg:hidden">Ativar</span>}<span className="hidden lg:inline">{state === 'on' ? 'Avisos ativos' : state === 'not-configured' ? 'Avisos indisponíveis' : state === 'unsupported' ? 'Não suportado' : state === 'denied' ? 'Permissão bloqueada' : 'Ativar avisos'}</span>
    </button>
    {(message || state === 'error') && <div role="status" className="absolute right-0 top-full z-50 mt-2 flex w-64 max-w-[calc(100vw-5rem)] items-start gap-2 rounded-lg border border-[#E5DDCF] bg-white p-3 text-xs leading-5 text-[#34322E] shadow-lg"><div className="min-w-0 flex-1"><p>{message || 'Não foi possível verificar os avisos. Toque no sino para tentar novamente.'}</p>{state === 'off' && <button type="button" disabled={busy} onClick={() => void toggle()} className="mt-3 min-h-11 w-full rounded-lg bg-primary px-3 font-semibold text-white disabled:opacity-60">Ativar novamente</button>}</div><button type="button" aria-label="Fechar aviso de notificações" className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-[#F7F2E8]" onClick={() => { setMessage(''); if (state === 'error') setState('off') }}><X size={14}/></button></div>}
  </div>
}
