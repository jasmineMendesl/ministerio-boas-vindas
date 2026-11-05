import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight, CircleDashed } from 'lucide-react'

type Props = { eyebrow: string; title: string; description: string; icon: LucideIcon; note?: string }
export function SectionPage({ eyebrow, title, description, icon: Icon, note = 'Esta área será habilitada em uma próxima etapa.' }: Props) {
  return <div className="animate-in">
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.17em] text-primary">{eyebrow}</p><h1 className="text-3xl font-semibold tracking-tight sm:text-[34px]">{title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted">{description}</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs text-muted"><CircleDashed size={14} /> Fundação do projeto</span></div>
    <section className="empty-panel"><div className="empty-icon"><Icon size={24} strokeWidth={1.7} /></div><h2 className="mt-5 text-lg font-semibold">Tudo pronto para começar</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">{note} Nenhum registro será exibido até que os recursos e o banco de dados sejam configurados.</p><div className="mt-6 inline-flex items-center gap-2 text-xs font-medium text-primary">Estrutura inicial preparada <ArrowUpRight size={14} /></div></section>
  </div>
}
