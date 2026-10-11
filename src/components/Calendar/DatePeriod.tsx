import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Check, X } from "lucide-react";
import { Tooltip } from "../Tooltip";

/* ————————————————————————————————————————————————————————————
   حقل فترة (من – إلى) — مستقل تماماً: النافذة المنبثقة مبنية هنا
   بدل الاعتماد على ModalPeriod المنقول من مشروع آخر.
   ———————————————————————————————————————————————————————————— */

const MONTH_NAMES = [
  "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول",
];
const WEEK_DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const CELL = 38;

const softFill = "color-mix(in srgb, var(--green) 10%, var(--paper))";
const onAccent = "var(--paper)";

const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function formatNumeric(key: string) {
  return key.replace(/-/g, "/");
}

interface DatePeriodProps {
  label?: string;
  /** تاريخ البداية (ISO yyyy-mm-dd) */
  startValue: string;
  /** تاريخ النهاية (ISO yyyy-mm-dd) */
  endValue: string;
  /** يُستدعى عند تأكيد الفترة أو مسحها */
  onChange: (start: string, end: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  openUpward?: boolean;
}

export default function DatePeriod({
  label,
  startValue,
  endValue,
  onChange,
  placeholder = "الفترة...",
  minDate,
  maxDate,
  disabled = false,
  openUpward = false,
}: DatePeriodProps) {
  const [open, setOpen] = useState(false);
  const hasValue = Boolean(startValue || endValue);

  let display = "";
  if (startValue && endValue) display = `${formatNumeric(startValue)} — ${formatNumeric(endValue)}`;
  else if (startValue) display = `${formatNumeric(startValue)} — ...`;
  else if (endValue) display = `... — ${formatNumeric(endValue)}`;

  return (
    <div className="flex w-full flex-col gap-2">
      {label && (
        <label className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          {label}
        </label>
      )}

      <div className="relative">
        <input
          type="text"
          readOnly
          value={display}
          placeholder={placeholder}
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          style={{
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
        <Calendar aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
          style={{ color: "var(--muted)" }} />

        {hasValue && !disabled && (
          <Tooltip content="مسح الفترة">
            <button
              type="button"
              onClick={() => onChange("", "")}
              aria-label="مسح الفترة"
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md"
              style={{ color: "var(--muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        )}

        {open && (
          <PeriodModal
            initialStart={startValue}
            initialEnd={endValue}
            minDate={minDate}
            maxDate={maxDate}
            openUpward={openUpward}
            anchorRef={undefined}
            onClose={() => setOpen(false)}
            onConfirm={(s, e) => {
              onChange(s, e);
              setOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ————————————————————————————————————————————————————————————
   نافذة اختيار الفترة (Portal — مستقلة عن أي مودال خارجي)
   ———————————————————————————————————————————————————————————— */

type PeriodModalProps = {
  initialStart: string;
  initialEnd: string;
  minDate?: string;
  maxDate?: string;
  openUpward?: boolean;
  anchorRef?: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onConfirm: (start: string, end: string) => void;
};

function PeriodModal({
  initialStart,
  initialEnd,
  minDate,
  maxDate,
  onClose,
  onConfirm,
}: PeriodModalProps) {
  const base = initialStart ? parseKey(initialStart) : minDate ? parseKey(minDate) : new Date();
  const [viewMonth, setViewMonth] = useState(base.getMonth());
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const daysInMonth = useMemo(() => new Date(viewYear, viewMonth + 1, 0).getDate(), [viewYear, viewMonth]);
  const firstDay = useMemo(() => new Date(viewYear, viewMonth, 1).getDay(), [viewYear, viewMonth]);

  const isOut = (key: string) => {
    const d = parseKey(key);
    if (minDate && d < parseKey(minDate)) return true;
    if (maxDate && d > parseKey(maxDate)) return true;
    return false;
  };

  const pick = (key: string) => {
    if (isOut(key)) return;
    if (!start || (start && end)) {
      setStart(key);
      setEnd("");
      return;
    }
    if (key < start) {
      setEnd(start);
      setStart(key);
    } else {
      setEnd(key);
    }
  };

  const goMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewMonth(d.getMonth());
    setViewYear(d.getFullYear());
  };

  const todayKey = toKey(new Date());

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: "rgba(20,30,28,.4)" }}
      onMouseDown={(e) => {
        if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={cardRef}
        style={{
          width: "100%",
          maxWidth: 340,
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          boxShadow: "0 20px 48px rgba(20,32,28,.24)",
          overflow: "hidden",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
          <Tooltip content="إغلاق">
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="grid h-7 w-7 place-items-center rounded-md" style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <X className="h-4 w-4" />
          </button>
          </Tooltip>
          <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            {start && end ? "تأكيد الفترة" : start ? "اختر تاريخ النهاية" : "اختر تاريخ البداية"}
          </p>
          <span className="h-7 w-7" />
        </div>

        <div className="p-3">
          <div className="mb-3 flex items-center gap-2">
            <Tooltip content="الشهر السابق">
              <button type="button" onClick={() => goMonth(-1)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ color: "var(--muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <span aria-hidden="true">›</span>
              </button>
            </Tooltip>
            <div className="flex flex-1 items-center justify-center gap-2">
              <select value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))}
                style={selectStyle}>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}
                style={selectStyle}>
                {Array.from({ length: 81 }, (_, i) => new Date().getFullYear() - 60 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <Tooltip content="الشهر التالي">
              <button type="button" onClick={() => goMonth(1)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ color: "var(--muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <span aria-hidden="true">‹</span>
              </button>
            </Tooltip>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEK_DAYS.map((d) => (
              <div key={d} className="flex h-6 items-center justify-center text-[10px] font-bold"
                style={{ color: "var(--muted)" }}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`p${i}`} style={{ height: CELL }} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const key = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const out = isOut(key);
              const inRange = Boolean(start && end && key > start && key < end);
              const isEdge = key === start || key === end;
              const isToday = key === todayKey;

              return (
                <button key={day} type="button" onClick={() => pick(key)} disabled={out}
                  className="flex w-full items-center justify-center rounded-lg text-xs transition-colors"
                  style={{
                    height: CELL,
                    background: isEdge ? "var(--green)" : inRange ? softFill : "transparent",
                    color: isEdge ? onAccent : out ? "var(--muted)" : isToday ? "var(--green)" : "var(--ink)",
                    fontWeight: isEdge || isToday ? 700 : 400,
                    opacity: out ? 0.45 : 1,
                    cursor: out ? "not-allowed" : "pointer",
                  }}>
                  {day}
                </button>
              );
            })}
          </div>

          {(start || end) && (
            <p className="mt-3 text-center text-xs" dir="ltr" style={{ color: "var(--muted)" }}>
              {formatNumeric(start || "")} {start && end ? "→" : "…"} {formatNumeric(end || "")}
            </p>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--line)", background: "color-mix(in srgb, var(--green) 3%, var(--paper))" }}>
          <button type="button" onClick={onClose}
            className="flex h-9 flex-1 items-center justify-center rounded-md text-sm font-semibold"
            style={{ border: "1px solid var(--line)", color: "var(--ink)" }}>
            إلغاء
          </button>
          <button type="button" onClick={() => onConfirm(start, end)} disabled={!start}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-bold"
            style={{ background: "var(--green)", color: onAccent, opacity: !start ? 0.5 : 1 }}>
            <Check className="h-4 w-4" />
            تأكيد
          </button>
        </div>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "2px 6px",
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "var(--paper)",
  color: "var(--ink)",
  fontSize: "0.8125rem",
  fontWeight: 600,
  outline: "none",
};