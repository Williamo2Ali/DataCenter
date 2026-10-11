import { createContext, useContext, useState, type ComponentType, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

/** دمج أصناف CSS بلا اعتماديات خارجية. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ألوان ثيم التطبيق — فتتبع المجموعة الوضع الفاتح والداكن */
const onAccent = 'var(--paper)';
const softFill = 'color-mix(in srgb, var(--green) 10%, var(--paper))';

export type GroupControlItem = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  badge?: string;
  onClick?: () => void;
};

type AccordionCtxValue = {
  expandedId: string | null;
  toggle: (id: string) => void;
};

const AccordionCtx = createContext<AccordionCtxValue | null>(null);

export function AccordionProvider({ children }: { children: ReactNode }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));
  return <AccordionCtx.Provider value={{ expandedId, toggle }}>{children}</AccordionCtx.Provider>;
}

type GroupControlProps = {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  items: GroupControlItem[];
  activePath?: string;
  className?: string;
  size?: 'sm' | 'md';
};

export function GroupControl({
  id,
  title,
  icon: GroupIcon,
  items,
  activePath,
  className,
  size = 'md',
}: GroupControlProps) {
  const ctx = useContext(AccordionCtx);
  const [expandedInternal, setExpandedInternal] = useState(false);

  const expanded = ctx ? ctx.expandedId === id : expandedInternal;
  const toggle = ctx ? () => ctx.toggle(id) : () => setExpandedInternal((v) => !v);

  const isSmall = size === 'sm';
  const iconSize = isSmall ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div className={cx('group-control', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className={cx(
          'flex w-full items-center justify-between gap-2 rounded-md transition-colors',
          isSmall ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
        )}
        style={{
          background: expanded ? 'var(--green)' : 'transparent',
          color: expanded ? onAccent : 'var(--muted)',
        }}
        onMouseEnter={(e) => {
          if (expanded) return;
          e.currentTarget.style.background = softFill;
          e.currentTarget.style.color = 'var(--ink)';
        }}
        onMouseLeave={(e) => {
          if (expanded) return;
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--muted)';
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <GroupIcon className={cx('shrink-0', iconSize)} />
          <span className="truncate font-semibold">{title}</span>
        </span>
        <ChevronDown
          className={cx('shrink-0 transition-transform duration-200', iconSize, expanded && 'rotate-180')}
          style={{ color: expanded ? onAccent : 'var(--muted)' }}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={cx('space-y-0.5 px-1 pt-1', isSmall && 'px-0.5')}>
              {items.map((item) => (
                <GroupControlItem
                  key={item.id}
                  item={item}
                  active={activePath ? item.id === activePath : false}
                  isSmall={isSmall}
                />
              ))}
            </div>
            <div aria-hidden="true" className="mx-2 my-1 h-px" style={{ background: 'var(--line)' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GroupControlItem({
  item,
  active,
  isSmall,
}: {
  item: GroupControlItem;
  active: boolean;
  isSmall: boolean;
}) {
  const Icon = item.icon;
  const iconSize = isSmall ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <button
      type="button"
      onClick={item.onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex w-full items-center gap-2 rounded-md text-right transition-colors',
        isSmall ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
      )}
      style={{
        background: active ? softFill : 'transparent',
        color: active ? 'var(--ink)' : 'var(--muted)',
        fontWeight: active ? 700 : 500,
      }}
      onMouseEnter={(e) => {
        if (active) return;
        e.currentTarget.style.background = softFill;
        e.currentTarget.style.color = 'var(--ink)';
      }}
      onMouseLeave={(e) => {
        if (active) return;
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--muted)';
      }}
    >
      {Icon && <Icon className={cx('shrink-0', iconSize)} />}
      <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
      {item.badge && (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: softFill, color: 'var(--green)' }}
        >
          {item.badge}
        </span>
      )}
      {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--green)' }} />}
    </button>
  );
}