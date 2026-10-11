import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** عنصر القائمة المنسدلة — يمكن أن يحتوي أي محتوى: نص، أيقونة، زر... */
export type DropdownItem = {
  id: string | number;
  /** المحتوى المعروض داخل العنصر — أي ReactNode */
  content: React.ReactNode;
  /** قيمة اختيارية مرفقة بالعنصر */
  value?: unknown;
  disabled?: boolean;
  /** يُستدعى عند الضغط على هذا العنصر تحديداً */
  onClick?: (item: DropdownItem) => void;
};

export type DropdownSelectProps = {
  items: DropdownItem[];
  /** المعرّف المحدد حالياً (وضع controlled) */
  value?: string | number | null;
  defaultValue?: string | number | null;
  /** نص العرض عند عدم وجود تحديد */
  placeholder?: string;
  /** يُستدعى عند تغيّر العنصر المحدد */
  onItemChanged?: (item: DropdownItem, previous: DropdownItem | null) => void;
  disabled?: boolean;
  className?: string;
  /** أقصى ارتفاع للقائمة قبل ظهور التمرير */
  maxMenuHeight?: number;
  /** مرجع يُنقل إليه التركيز بعد اختيار عنصر (مثال: مربع البحث) */
  objectref?: React.RefObject<HTMLElement | null> | null;
};

/* ألوان ثيم التطبيق — القائمة تُرسم عبر Portal لذا ترث متغيّرات :root مباشرةً */
const panelStyle: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  boxShadow: "0 12px 32px rgba(20,32,28,.16)",
};
const onAccent = "var(--paper)";
const softFill = "color-mix(in srgb, var(--green) 10%, var(--paper))";

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 20 20"
    className={`size-4 shrink-0 self-center transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    style={{ color: "var(--muted)" }}
    fill="currentColor"
    aria-hidden
  >
    <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
  </svg>
);

const CheckMark = () => (
  <svg viewBox="0 0 20 20" className="ms-auto size-4 shrink-0" fill="currentColor" aria-hidden>
    <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
  </svg>
);

type MenuPos = { top: number; left: number; width: number; openUp: boolean };

export default function TextSelect({
  items,
  value,
  defaultValue = null,
  placeholder = "اختر...",
  onItemChanged,
  disabled = false,
  className = "",
  maxMenuHeight = 280,
  objectref,
}: DropdownSelectProps) {
  const [internalId, setInternalId] = useState<string | number | null>(defaultValue);
  const selectedId = value !== undefined ? value : internalId;

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos>({ top: 0, left: 0, width: 0, openUp: false });
  const [activeIndex, setActiveIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  /** حساب موقع القائمة: fixed حتى تفلت من أي overflow/ارتفاع محدود في الأب */
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const menuH = Math.min(maxMenuHeight, items.length * 40 + 8);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < menuH + 8 && r.top > spaceBelow;
    setPos({
      top: openUp ? r.top - menuH - 6 : r.bottom + 6,
      left: r.left,
      width: r.width,
      openUp,
    });
  }, [items.length, maxMenuHeight]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  /** إعادة حساب الموقع عند التمرير أو تغيير الحجم */
  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updatePosition]);

  /** إغلاق عند الضغط خارجاً */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const selectItem = useCallback(
    (item: DropdownItem) => {
      if (item.disabled) return;
      item.onClick?.(item);
      const prev = selectedItem;
      if (value === undefined) setInternalId(item.id);
      if (item.id !== selectedId) onItemChanged?.(item, prev);
      setOpen(false);
      objectref?.current?.focus();
    },
    [onItemChanged, selectedId, selectedItem, value, objectref],
  );

  const toggle = () => {
    if (disabled) return;
    setActiveIndex(Math.max(0, items.findIndex((i) => i.id === selectedId)));
    setOpen((o) => !o);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
      e.preventDefault();
      toggle();
      return;
    }
    if (!open) return;
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) selectItem(item);
    } else if (e.key === "Tab") setOpen(false);
  };

  useEffect(() => {
    if (open && activeIndex >= 0)
      menuRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const menu =
    open &&
    createPortal(
      <ul
        ref={menuRef}
        role="listbox"
        aria-activedescendant={activeIndex >= 0 ? `dd-item-${items[activeIndex]?.id}` : undefined}
        dir="rtl"
        className="fixed z-[9999] overflow-auto rounded-lg py-1 text-right"
        style={{
          ...panelStyle,
          top: pos.top,
          left: pos.left,
          width: pos.width,
          maxHeight: maxMenuHeight,
          transformOrigin: pos.openUp ? "bottom" : "top",
          animation: "dropdown-pop 140ms ease-out",
        }}
      >
        {items.map((item, i) => {
          const isSelected = item.id === selectedId;
          const isActive = i === activeIndex;
          return (
            <li
              key={item.id}
              id={`dd-item-${item.id}`}
              role="option"
              aria-selected={isSelected}
              aria-disabled={item.disabled || undefined}
              onClick={() => selectItem(item)}
              onMouseEnter={() => !item.disabled && setActiveIndex(i)}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-md transition-colors"
              style={{
                background: isSelected ? "var(--green)" : isActive ? softFill : "transparent",
                color: isSelected ? onAccent : "var(--ink)",
                cursor: item.disabled ? "default" : "pointer",
                opacity: item.disabled ? 0.5 : 1,
              }}
            >
              {item.content}
              {isSelected && <CheckMark />}
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="px-3 py-2 text-md" style={{ color: "var(--muted)" }}>
            لا توجد عناصر
          </li>
        )}
      </ul>,
      document.body,
    );

  return (
    <div dir="rtl" className={["relative inline-block w-full text-right", className].join(" ")}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="flex w-full items-center gap-2 px-3 py-2 text-md transition-colors"
        style={{
          borderRadius: 8,
          border: `1px solid ${open ? "var(--green)" : "var(--line)"}`,
          background: "var(--paper)",
          color: "var(--ink)",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span className="min-w-0 flex-1 truncate" style={{ color: selectedItem ? "var(--ink)" : "var(--muted)" }}>
          {selectedItem ? selectedItem.content : placeholder}
        </span>
        <Chevron open={open} />
      </button>
      {menu}
      {/* حركة الظهور */}
      <style>{`@keyframes dropdown-pop { from { opacity: 0; transform: scaleY(.96); } to { opacity: 1; transform: scaleY(1); } }`}</style>
    </div>
  );
}