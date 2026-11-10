const roleNames: Record<string, string> = {
  portaria: 'Portaria', seat_direction: 'Direcionamento de assentos', leader: 'Líder',
  support: 'Apoio', media: 'Mídia', opening_prayer: 'Oração inicial',
  male_welcoming: 'Acolhimento masculino', female_welcoming: 'Acolhimento feminino',
  equipment_check: 'Conferência de placas e cavaletes', app_closing: 'Fechamento no aplicativo',
  confession_prayer: 'Oração de Confissão', reconciliation_word: 'Palavra de reconciliação', closing_prayer: 'Oração Final',
}

export function groupVolunteerRoles(assignments: { volunteer_profile_id: string | null; role: string }[]) {
  const grouped = new Map<string, string[]>()
  for (const item of assignments) {
    if (!item.volunteer_profile_id) continue
    const roles = grouped.get(item.volunteer_profile_id) ?? []
    if (!roles.includes(item.role)) roles.push(item.role)
    grouped.set(item.volunteer_profile_id, roles)
  }
  return grouped
}

export function scheduleNotification(input: {
  kind: 'service' | 'extra' | 'pertencer'
  name?: string
  time?: string | null
  roles?: string[]
  observation?: string | null
}) {
  const roles = [...new Set((input.roles ?? []).map(role => roleNames[role] ?? role))].join(', ')
  const roleText = roles ? `, na função ${roles}` : ''
  const subject = input.kind === 'pertencer' ? 'o Projeto Pertencer'
    : input.kind === 'extra' ? `${input.name} às ${input.time?.slice(0, 5)}` : input.name
  return {
    title: input.kind === 'extra' ? 'Escala extra publicada' : 'Nova escala publicada',
    body: `Você está escalado para ${subject}${input.kind === 'extra' ? '' : roleText}. Acesse para ver.${input.observation?.trim() ? ' Atenção: essa escala tem observação.' : ''}`,
  }
}
