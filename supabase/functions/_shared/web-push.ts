import webpush from 'npm:web-push@3.6.7'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type PushMessage = { title: string; body: string; url: string; tag: string }

export async function sendPushToUsers(client: SupabaseClient, userIds: string[], message: PushMessage) {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey || userIds.length === 0) return { sent: 0, configured: Boolean(publicKey && privateKey) }

  webpush.setVapidDetails('https://jasmineMendesl.github.io/ministerio-boas-vindas/', publicKey, privateKey)
  const { data: subscriptions, error } = await client
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .in('user_id', [...new Set(userIds)])
  if (error || !subscriptions?.length) return { sent: 0, configured: true }

  let sent = 0
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(message), { TTL: 3600 })
      sent += 1
    } catch (error) {
      const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 0
      if (statusCode === 404 || statusCode === 410) {
        await client.from('push_subscriptions').delete().eq('id', subscription.id)
      }
    }
  }))
  return { sent, configured: true }
}
