import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { useAuth } from '../app/AuthProvider'
import { supabase } from '../lib/supabase'
import { VAPID_PUBLIC_KEY } from '../lib/push-config'

type PushState = 'loading' | 'off' | 'on' | 'denied' | 'unsupported' | 'not-configured' | 'error'

function applicationKeyBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const decoded = window.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(decoded, character => character.charCodeAt(0))
}

async function getRegistration() {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`
  const registration = await navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL })
  await navigator.serviceWorker.ready
  return registration
}

export async function removePushSubscription(userId: string | undefined) {
  if (!userId || !supabase || !('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration(`${import.meta.env.BASE_URL}`)
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
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
        const subscription = await registration.pushManager.getSubscription()
        if (!active) return
        if (subscription && Notification.permission === 'granted') {
          const keys = subscription.toJSON().keys
          if (keys?.p256dh && keys.auth && supabase && session?.user.id) {
            const { error } = await supabase.from('push_subscriptions').upsert({
              user_id: session.user.id,
              endpoint: subscription.endpoint,
              p256dh: keys.p256dh,
              auth: keys.auth,
              updated_by: session.user.id,
            }, { onConflict: 'endpoint' })
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
    if (!supabase || !session?.user.id || !publicKey || busy) return
    setBusy(true); setMessage('')
    try {
      if (state === 'on') {
        const registration = await getRegistration()
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
          await subscription.unsubscribe()
        }
        setState('off'); setMessage('Notificações desativadas neste dispositivo.')
      } else {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') { setState(permission === 'denied' ? 'denied' : 'off'); return }
        const registration = await getRegistration()
        const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKeyBytes(publicKey) })
        const keys = subscription.toJSON().keys
        if (!keys?.p256dh || !keys.auth) throw new Error('Push subscription keys unavailable')
        const { error } = await supabase.from('push_subscriptions').upsert({
          user_id: session.user.id,
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          updated_by: session.user.id,
        }, { onConflict: 'endpoint' })
        if (error) throw error
        setState('on'); setMessage('Notificações ativadas neste dispositivo.')
      }
    } catch {
      setState('error'); setMessage('Não foi possível atualizar as notificações. Verifique a conexão e as permissões.')
    } finally { setBusy(false) }
  }

  const disabled = busy || state === 'loading' || state === 'unsupported' || state === 'not-configured' || state === 'denied' || !session
  const label = state === 'on' ? 'Desativar notificações' : state === 'not-configured' ? 'Notificações não configuradas' : state === 'unsupported' ? 'Notificações indisponíveis neste navegador' : state === 'denied' ? 'Permissão bloqueada nas configurações do navegador' : state === 'error' ? 'Tentar novamente' : state === 'loading' ? 'Verificando notificações' : 'Ativar notificações neste dispositivo'

  return <div className="relative" title={label}>
    <button type="button" aria-label={label} disabled={disabled} onClick={() => void toggle()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#E5DDCF] bg-white px-3 text-xs font-medium text-[#34322E] hover:bg-[#F7F2E8] disabled:cursor-not-allowed disabled:opacity-60">
      {state === 'on' ? <Bell size={16}/> : <BellOff size={16}/>}<span className="hidden lg:inline">{state === 'on' ? 'Avisos ativos' : state === 'not-configured' ? 'Avisos indisponíveis' : state === 'unsupported' ? 'Não suportado' : state === 'denied' ? 'Permissão bloqueada' : 'Ativar avisos'}</span>
    </button>
    {(message || state === 'error') && <span role="status" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-[#E5DDCF] bg-white p-2.5 text-xs text-[#34322E] shadow-lg">{message || label}</span>}
  </div>
}
