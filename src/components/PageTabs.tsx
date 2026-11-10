type PageTab = { id: string; label: string; badge?: string; controls?: string }

type Props<T extends string> = {
  ariaLabel: string
  activeId: T
  onChange: (id: T) => void
  tabs: PageTab[]
}

export function PageTabs<T extends string>({ ariaLabel, activeId, onChange, tabs }: Props<T>) {
  return <div role="tablist" aria-label={ariaLabel} className="flex items-center gap-6 overflow-x-auto border-b border-[#E5DDCF]">
    {tabs.map(tab => {
      const active = activeId === tab.id
      return <button key={tab.id} type="button" role="tab" aria-selected={active} aria-controls={tab.controls} onClick={() => onChange(tab.id as T)} className={`relative inline-flex min-h-12 shrink-0 items-center gap-2 px-1 text-sm font-semibold transition-colors ${active ? 'text-[#7B571F] after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-[#8A6729]' : 'text-[#81796D] hover:text-[#4F493F]'}`}>
        <span>{tab.label}</span>
        {tab.badge && <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? 'bg-[#F0E6D2] text-[#6B4F1D]' : 'border border-[#E5DDCF] bg-white text-[#68645C]'}`}>{tab.badge}</span>}
      </button>
    })}
  </div>
}
