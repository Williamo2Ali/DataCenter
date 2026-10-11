import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Tooltip } from "../Tooltip";

/* ————————————————————————————————————————————————————————————
   حقل اختيار سنة فقط — مستقل تماماً (بلا store ولا ملفات مساعدة).
   القيمة سنة رباعية yyyy كنص، والاختيار من شبكة سنوات بصفحات.
   كل الألوان من متغيّرات ثيم التطبيق فيفتحها/يتبدّل مع الوضع الليلي.
   ———————————————————————————————————————————————————————————— */

const YEARS_PER_PAGE = 24;

const panelStyle: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  boxShadow: "0 12px 32px rgba(20,32,28,.14)",
};

interface YearSelectProps {
  /** سنة رباعية yyyy أو فراغ */
  value: string;
  onChange: (year: string) => void;
  disabled?: boolean;
  minYear?: number;
  maxYear?: number;
  placeholder?: string;
  openUpward?: boolean;
  showClear?: boolean;
  /** صنف حقل الإدخال (مثل modal-input عند التضمين في النماذج) */
  className?: string;
}

export default function YearSelect({
  value,
  onChange,
  disabled = false,
  minYear = 1900,
  maxYear = 2100,
  placeholder = "اختر السنة...",
  openUpward = false,
  showClear = true,
  className,
}: YearSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const startOf = (y: number) => Math.min(Math.max(y, minYear), maxYear - YEARS_PER_PAGE + 1);
  const initialYear = /^\d{4}$/.test(value) ? Number(value) : new Date().getFullYear();
  const [yearPageStart, setYearPageStart] = useState(() => startOf(initialYear));

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && /^\d{4}$/.test(value)) {
      setYearPageStart(startOf(Number(value)));
    }
  }, [isOpen, value]);

  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearPageStart + i)
    .filter((y) => y >= minYear && y <= maxYear);
  const canPrev = yearPageStart > minYear;
  const canNext = yearPageStart + YEARS_PER_PAGE <= maxYear;

  const navBtn: React.CSSProperties = {
    borderRadius: 8,
    padding: "6px",
    lineHeight: 0,
    color: "var(--muted)",
    flexShrink: 0,
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <input
        type="text"
        readOnly
        value={value}
        placeholder={placeholder}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        dir="ltr"
        className={className}
        style={className ? undefined : {
          width: "100%",
          height: 42,
          padding: "0 38px",
          borderRadius: 6,
          border: "1px solid var(--line)",
          background: "color-mix(in srgb, var(--green) 4%, var(--paper))",
          color: "var(--ink)",
          outline: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      />
      {!className && (
        <CalendarDays
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4"
          style={{ color: "var(--muted)" }}
        />
      )}

      {value && !disabled && showClear && (
        <Tooltip content="مسح السنة">
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="مسح السنة"
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md"
            style={{ color: "var(--muted)" }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      )}

      {isOpen && (
        <div
          className={`absolute z-50 mt-1 w-full min-w-[280px] p-3 ${openUpward ? "bottom-full mb-1" : ""}`}
          style={panelStyle}
        >
          <div className="mb-3 flex items-center gap-2">
            <Tooltip content="السنوات السابقة">
              <button type="button" onClick={() => setYearPageStart((p) => startOf(p - YEARS_PER_PAGE))}
                disabled={!canPrev} style={{ ...navBtn, opacity: canPrev ? 1 : 0.4 }}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </Tooltip>
            <span className="flex-1 text-center text-sm font-bold" dir="ltr" style={{ color: "var(--ink)" }}>
              {yearPageStart} - {Math.min(yearPageStart + YEARS_PER_PAGE - 1, maxYear)}
            </span>
            <Tooltip content="السنوات التالية">
              <button type="button" onClick={() => setYearPageStart((p) => startOf(p + YEARS_PER_PAGE))}
                disabled={!canNext} style={{ ...navBtn, opacity: canNext ? 1 : 0.4 }}>
                <ChevronLeft className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
          <div className="grid grid-cols-4 content-center gap-2">
            {years.map((year) => {
              const active = value === String(year);
              return (
                <button key={year} type="button"
                  onClick={() => { onChange(String(year)); setIsOpen(false); }}
                  className="rounded-lg py-2.5 text-xs font-semibold transition-colors"
                  style={{
                    background: active ? "var(--green)" : "transparent",
                    color: active ? "var(--paper)" : "var(--ink)",
                  }}>
                  {year}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
