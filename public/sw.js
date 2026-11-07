/* global self, clients */
self.addEventListener('push', (event) => {
  let message = { title: 'Ministério de Boas-Vindas', body: 'Você tem uma nova notificação.', url: './', tag: 'ministry-notification' }
  try {
    const payload = event.data?.json()
    if (payload && typeof payload === 'object') message = { ...message, ...payload }
  } catch { /* Keep the generic fallback message. */ }

  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    tag: message.tag,
    data: { url: message.url },
    icon: new URL('icon.svg', self.registration.scope).href,
    badge: new URL('icon.svg', self.registration.scope).href,
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url ?? './', self.registration.scope).href
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url.startsWith(self.registration.scope))
    if (existing) return existing.navigate(target).then(() => existing.focus())
    return clients.openWindow(target)
  }))
})
