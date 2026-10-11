import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** عنصر قائمة متعددة الاختيار (Checkbox) */
export type DropdownCheckOption = {
  id: string;
  /** النص الظاهر أو أي ReactNode */
  label: React.ReactNode;
  /** أيقونة اختيارية بجانب النص */
  icon?: React.ReactNode;
  disabled?: boolean;
};

export type DropdownCheckProps = {
  options: DropdownCheckOption[];
  /** العناصر المحددة حالياً (وضع controlled) */
  value: string[];
  /** يُستدعى بمصفوفة العناصر المحددة الجديدة */
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** النص المعروض عندما تكون كل العناصر المحددة */
  allLabel?: string;
  selectAllLabel?: string;
  clearAllLabel?: string;
  confirmLabel?: string;
  disabled?: boolean;
  className?: string;
  /** أقصى ارتفاع للقائمة قبل ظهور التمرير */
  maxMenuHeight?: number;
};

/* ألوان ثيم التطبيق — القائمة عبر Portal فترث متغيّرات :root مباشرةً */
const panelStyle: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  boxShadow: "0 12px 32px rgba(20,32,28,.16)",
};
const onAccent = "var(--paper)";
const softFill = "color-mix(in srgb, var(--green) 10%, var(--paper))";
const faceBg = "color-mix(in srgb, var(--green) 4%, var(--paper))";

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 20 20"
    className={`size-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    style={{ color: "var(--muted)" }}
    fill="currentColor"
    aria-hidden
  >
    <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
  </svg>
);

const Check = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" className={`size-3.5 shrink-0 ${className}`} fill="currentColor" aria-hidden>
    <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
  </svg>
);

type MenuPos = { top: number; left: number; width: number; openUp: boolean };

export default function TextSelectCheck({
  options,
  value,
  onChange,
  placeholder = "اختر...",
  allLabel = "الكل",
  selectAllLabel = "تحديد الكل",
  clearAllLabel = "إلغاء الكل",
  confirmLabel = "تم",
  disabled = false,
  className = "",
  maxMenuHeight = 320,
}: DropdownCheckProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos>({ top: 0, left: 0, width: 0, openUp: false });
  const [activeIndex, setActiveIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedSet = new Set(value);
  const enabledOptions = options.filter((o) => !o.disabled);
  const selectedCount = options.filter((o) => selectedSet.has(o.id)).length;
  const allSelected = enabledOptions.length > 0 && enabledOptions.every((o) => selectedSet.has(o.id));

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const headerH = 40;
    const footerH = 44;
    const menuH = Math.min(maxMenuHeight, options.length * 40 + headerH + footerH + 12);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < menuH + 8 && r.top > spaceBelow;
    setPos({
      top: openUp ? r.top - menuH - 6 : r.bottom + 6,
      left: r.left,
      width: r.width,
      openUp,
    });
  }, [options.length, maxMenuHeight]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

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

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const toggleOption = (opt: DropdownCheckOption) => {
    if (opt.disabled) return;
    if (selectedSet.has(opt.id)) onChange(value.filter((id) => id !== opt.id));
    else onChange([...value, opt.id]);
  };

  const toggleAll = () => {
    onChange(allSelected ? [] : enabledOptions.map((o) => o.id));
  };

  const toggle = () => {
    if (disabled) return;
    setActiveIndex(Math.max(0, options.findIndex((o) => selectedSet.has(o.id))));
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
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) toggleOption(opt);
    } else if (e.key === "Tab") setOpen(false);
  };

  useEffect(() => {
    if (open && activeIndex >= 0)
      menuRef.current
        ?.querySelector(`[data-opt-index="${activeIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const summary =
    value.length === 0
      ? placeholder
      : allSelected
        ? allLabel
        : options
            .filter((o) => selectedSet.has(o.id))
            .map((o) => o.label)
            .filter((l): l is string => typeof l === "string")
            .join("، ");

  const menu =
    open &&
    createPortal(
      <div
        ref={menuRef}
        dir="rtl"
        role="listbox"
        aria-multiselectable="true"
        className="fixed z-[9999] flex flex-col overflow-hidden rounded-lg text-right"
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
        {/* رأس: تحديد الكل / إلغاء الكل */}
        <div
          className="flex items-center justify-between gap-2 border-b px-3 py-2"
          style={{ borderColor: "var(--line)" }}
        >
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-medium"
            style={{ color: "var(--green)" }}
          >
            {allSelected ? clearAllLabel : selectAllLabel}
          </button>
          <span className="text-[11px]" dir="ltr" style={{ color: "var(--muted)" }}>
            {selectedCount} / {options.length}
          </span>
        </div>

        {/* العناصر */}
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {options.map((opt, i) => {
            const isSelected = selectedSet.has(opt.id);
            const isActive = i === activeIndex;
            return (
              <label
                key={opt.id}
                data-opt-index={i}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors"
                style={{
                  background: isActive ? softFill : "transparent",
                  color: "var(--ink)",
                  opacity: opt.disabled ? 0.5 : 1,
                  cursor: opt.disabled ? "default" : "pointer",
                }}
              >
                <span
                  className="flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
                  style={{
                    borderColor: isSelected ? "var(--green)" : "var(--line)",
                    background: isSelected ? "var(--green)" : "var(--paper)",
                    color: onAccent,
                  }}
                >
                  {isSelected && <Check />}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isSelected}
                  disabled={opt.disabled}
                  onChange={() => toggleOption(opt)}
                />
                {opt.icon}
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
              </label>
            );
          })}
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm" style={{ color: "var(--muted)" }}>
              لا توجد عناصر
            </div>
          )}
        </div>

        {/* تذييل: تم */}
        <div className="border-t p-2" style={{ borderColor: "var(--line)" }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--green)", color: onAccent }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>,
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
        className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors"
        style={{
          borderRadius: 8,
          border: `1px solid ${open ? "var(--green)" : "var(--line)"}`,
          background: faceBg,
          color: "var(--ink)",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span className="min-w-0 flex-1 truncate" style={{ color: value.length ? "var(--ink)" : "var(--muted)" }}>
          {summary}
        </span>
        {selectedCount > 0 && !allSelected && (
          <span
            className="shrink-0 rounded-full px-1.5 text-[10px] font-bold"
            style={{ background: softFill, color: "var(--green)" }}
          >
            {selectedCount}
          </span>
        )}
        <Chevron open={open} />
      </button>
      {menu}
      <style>{`@keyframes dropdown-pop { from { opacity: 0; transform: scaleY(.96); } to { opacity: 1; transform: scaleY(1); } }`}</style>
    </div>
  );
}