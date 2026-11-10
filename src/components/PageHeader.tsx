import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type PageHeaderProps = {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, icon: Icon, actions }: PageHeaderProps) {
  return <header className="flex flex-col gap-5 border-b border-[#E5DDCF] pb-5 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#8A6729]">{Icon && <Icon size={14} />}{eyebrow}</span>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#29251E] sm:text-[2rem]">{title}</h1>
      {description && <div className="mt-1 max-w-2xl text-sm leading-5 text-[#81796D]">{description}</div>}
    </div>
    {actions && <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">{actions}</div>}
  </header>
}
