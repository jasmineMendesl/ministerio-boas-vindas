type Props = { description: string; deleting: boolean; error: string; onCancel: () => void; onConfirm: () => void }

export function DeleteScheduleDialog({ description, deleting, error, onCancel, onConfirm }: Props) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
    <section role="alertdialog" aria-modal="true" aria-labelledby="delete-schedule-title" aria-describedby="delete-schedule-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
      <h2 id="delete-schedule-title" className="text-lg font-semibold">Excluir escala?</h2>
      <p id="delete-schedule-description" className="mt-3 break-words text-sm leading-6 text-[#68645C]">{description} Esta ação não pode ser desfeita.</p>
      {error && <p role="alert" className="status-negative mt-3 rounded-lg border px-3 py-2 text-sm">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" disabled={deleting} onClick={onCancel} className="min-h-10 rounded-lg border border-[#E5DDCF] px-4 text-sm disabled:opacity-60">Cancelar</button>
        <button type="button" disabled={deleting} onClick={onConfirm} className="min-h-10 rounded-lg bg-[#9C3F37] px-4 text-sm font-semibold text-white disabled:opacity-60">{deleting ? 'Excluindo…' : 'Excluir escala'}</button>
      </div>
    </section>
  </div>
}
