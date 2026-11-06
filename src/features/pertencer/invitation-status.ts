import type { FollowUpStatus } from '../decisions/decision-data'

export type InvitationStatus = 'pending' | 'no_response' | 'declined' | 'confirmed' | 'present' | 'absent'

export const editableInvitationStatuses: Exclude<InvitationStatus, 'absent'>[] = [
  'pending', 'no_response', 'declined', 'confirmed', 'present',
]

export const invitationStatusLabels: Record<InvitationStatus, string> = {
  pending: 'Pendente',
  no_response: 'Não respondido',
  declined: 'Não vai comparecer',
  confirmed: 'Vai comparecer',
  present: 'Compareceu',
  absent: 'Ausência registrada',
}

export const invitationStatusTones: Record<InvitationStatus, string> = {
  pending: 'status-pending',
  no_response: 'status-pending',
  declined: 'status-negative',
  confirmed: 'status-positive',
  present: 'status-positive',
  absent: 'status-neutral',
}

export function invitationToFollowUpStatus(status: InvitationStatus): FollowUpStatus {
  if (status === 'no_response') return 'awaiting_response'
  if (status === 'declined') return 'declined'
  if (status === 'confirmed') return 'confirmed'
  if (status === 'present') return 'attended'
  if (status === 'absent') return 'no_show'
  return 'awaiting_first_contact'
}

export function followUpToInvitationStatus(status: FollowUpStatus): InvitationStatus {
  if (status === 'awaiting_response' || status === 'invited' || status === 'unable_to_contact') return 'no_response'
  if (status === 'declined') return 'declined'
  if (status === 'confirmed' || status === 'awaiting_confirmation') return 'confirmed'
  if (status === 'attended') return 'present'
  if (status === 'no_show') return 'absent'
  return 'pending'
}
