import type { ReactNode } from "react";

export type TextSelectButtonProps = {
  /** النص المعروض (القيمة الحالية) — غيابه يعرض placeholder بلون باهت */
  children?: ReactNode;
  placeholder?: string;
  /** يُستدعى عند الضغط — عادةً يفتح مودال اختيار */
  onClick: () => void;
  disabled?: boolean;
  /** مفتوح؟ (يُلوّن الحد بالأخضر ويدير السهم — يُمرَّر من حالة المودال) */
  open?: boolean;
  className?: string;
  ariaLabel?: string;
  id?: string;
};

/* زر بشكل مشغّل TextSelect نفسه (المقاسات والألوان والسهم) — بلا قائمة
   منسدلة: الضغط يفوّض لـ onClick (مثال: فتح مودال اختيار في الهواتف). */

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

export default function TextSelectButton({
  children,
  placeholder = "اختر...",
  onClick,
  disabled = false,
  open = false,
  className = "",
  ariaLabel,
  id,
}: TextSelectButtonProps) {
  return (
    <div dir="rtl" className={["relative inline-block w-full text-right", className].join(" ")}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={onClick}
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
        <span className="min-w-0 flex-1 truncate" style={{ color: children ? "var(--ink)" : "var(--muted)" }}>
          {children ?? placeholder}
        </span>
        <Chevron open={open} />
      </button>
    </div>
  );
}
