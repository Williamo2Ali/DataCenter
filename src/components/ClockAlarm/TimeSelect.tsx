import { useState, useRef, useEffect, useMemo } from "react";
import { Clock, Check, X } from "lucide-react";
import { Tooltip } from "../Tooltip";

/* ————————————————————————————————————————————————————————————
   حقل اختيار وقت (ساعة / دقيقة / ص-م) — مستقل تماماً وبلا ثيم خارجي.
   ———————————————————————————————————————————————————————————— */

const softFill = "color-mix(in srgb, var(--green) 10%, var(--paper))";
const onAccent = "var(--paper)";
const faceBg = "color-mix(in srgb, var(--green) 4%, var(--paper))";
const panelStyle: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  boxShadow: "0 12px 32px rgba(20,32,28,.16)",
};

interface TimeSelectProps {
  label?: string;
  /** الوقت بصيغة 24 ساعة HH:mm */
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

function padZero(num: number): string {
  return num.toString().padStart(2, "0");
}

/** يحوّل قيمة 24 ساعة إلى {ساعة 12، دقيقة، ص/م} */
function split24(value: string) {
  if (!value) return { h: 9, m: 0, p: "AM" as "AM" | "PM" };
  const [rawH, rawM] = value.split(":").map(Number);
  const p: "AM" | "PM" = rawH >= 12 ? "PM" : "AM";
  const h = rawH === 0 ? 12 : rawH > 12 ? rawH - 12 : rawH;
  return { h, m: rawM || 0, p };
}

function to24(h: number, m: number, p: "AM" | "PM"): string {
  let hour24 = h;
  if (p === "AM" && h === 12) hour24 = 0;
  if (p === "PM" && h !== 12) hour24 = h + 12;
  return `${padZero(hour24)}:${padZero(m)}`;
}

export default function TimeSelect({
  label,
  value,
  onChange,
  disabled = false,
  placeholder = "اختر الوقت...",
}: TimeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { h, m, p } = split24(value);
  const [selectedHour, setSelectedHour] = useState(h);
  const [selectedMinute, setSelectedMinute] = useState(m);
  const [period, setPeriod] = useState<"AM" | "PM">(p);

  const containerRef = useRef<HTMLDivElement>(null);
  const hourColRef = useRef<HTMLDivElement>(null);
  const minuteColRef = useRef<HTMLDivElement>(null);

  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const minutes = useMemo(
    () => Array.from({ length: 60 / 5 }, (_, i) => i * 5),
    [],
  );

  const resetFromValue = () => {
    const v = split24(value);
    setSelectedHour(v.h);
    setSelectedMinute(v.m);
    setPeriod(v.p);
  };

  useEffect(() => {
    if (!isOpen) return;
    resetFromValue();
    // مرّر العمودين إلى القيمة المختارة عند الفتح (وإلا بقيت 01/00 في الأعلى).
    requestAnimationFrame(() => {
      hourColRef.current?.querySelector<HTMLElement>('[data-active="true"]')
        ?.scrollIntoView({ block: "center" });
      minuteColRef.current?.querySelector<HTMLElement>('[data-active="true"]')
        ?.scrollIntoView({ block: "center" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, value]);

  const handleConfirm = () => {
    onChange(to24(selectedHour, selectedMinute, period));
    setIsOpen(false);
  };

  const handleClose = () => {
    resetFromValue();
    setIsOpen(false);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value, isOpen]);

  const display = value
    ? (() => {
        const v = split24(value);
        return `${padZero(v.h)}:${padZero(v.m)} ${v.p}`;
      })()
    : "";

  const columnStyle: React.CSSProperties = {
    flex: 1,
    maxHeight: 180,
    overflowY: "auto",
    borderRadius: 8,
    border: "1px solid var(--line)",
    background: faceBg,
  };

  return (
    <div className="flex w-full flex-col gap-2" ref={containerRef}>
      {label && (
        <label className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          {label}
        </label>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(true)}
          disabled={disabled}
          className="flex w-full items-center gap-2 text-sm transition-colors"
          style={{
            borderRadius: 10,
            border: "1px solid var(--line)",
            background: faceBg,
            color: value ? "var(--ink)" : "var(--muted)",
            padding: "10px 12px",
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <Clock className="h-4 w-4 shrink-0" style={{ color: "var(--muted)" }} />
          <span>{value ? display : placeholder}</span>
        </button>

        {value && !disabled && (
          <Tooltip content="مسح الوقت">
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="مسح الوقت"
            className="absolute left-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          </Tooltip>
        )}

        {isOpen && (
          <div className="absolute z-50 mt-1 w-full min-w-[280px] p-4" style={panelStyle}>
            <div className="mb-3 text-center text-sm font-bold" style={{ color: "var(--ink)" }}>
              اختيار الوقت
            </div>

            <div className="mb-4 flex items-center justify-center gap-2">
              {/* عمود الساعات */}
              <div style={columnStyle} ref={hourColRef}>
                <div className="sticky top-0 border-b px-2 py-1.5 text-center"
                  style={{ borderColor: "var(--line)", background: faceBg }}>
                  <span className="text-[10px] font-bold" style={{ color: "var(--muted)" }}>ساعة</span>
                </div>
                <div className="py-1">
                  {hours.map((n) => (
                    <button key={n} type="button" onClick={() => setSelectedHour(n)}
                      data-active={selectedHour === n}
                      className="w-full py-2 text-sm font-semibold transition-colors"
                      style={{
                        background: selectedHour === n ? "var(--green)" : "transparent",
                        color: selectedHour === n ? onAccent : "var(--ink)",
                      }}>
                      {padZero(n)}
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-lg font-bold" style={{ color: "var(--muted)" }}>:</span>

              {/* عمود الدقائق */}
              <div style={columnStyle} ref={minuteColRef}>
                <div className="sticky top-0 border-b px-2 py-1.5 text-center"
                  style={{ borderColor: "var(--line)", background: faceBg }}>
                  <span className="text-[10px] font-bold" style={{ color: "var(--muted)" }}>دقيقة</span>
                </div>
                <div className="py-1">
                  {minutes.map((n) => (
                    <button key={n} type="button" onClick={() => setSelectedMinute(n)}
                      data-active={selectedMinute === n}
                      className="w-full py-2 text-sm font-semibold transition-colors"
                      style={{
                        background: selectedMinute === n ? "var(--green)" : "transparent",
                        color: selectedMinute === n ? onAccent : "var(--ink)",
                      }}>
                      {padZero(n)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ص / م */}
              <div className="flex flex-col gap-1">
                {(["AM", "PM"] as const).map((key) => (
                  <button key={key} type="button" onClick={() => setPeriod(key)}
                    className="rounded-lg px-3 py-2 text-sm font-bold transition-colors"
                    style={{
                      background: period === key ? "var(--green)" : softFill,
                      color: period === key ? onAccent : "var(--muted)",
                    }}>
                    {key === "AM" ? "ص" : "م"}
                  </button>
                ))}
              </div>
            </div>

            {/* المعاينة */}
            <div className="mb-3 text-center" dir="ltr">
              <span className="text-lg font-bold" style={{ color: "var(--green)" }}>
                {padZero(selectedHour)}:{padZero(selectedMinute)} {period}
              </span>
            </div>

            {/* الأزرار */}
            <div className="flex gap-2">
              <button type="button" onClick={handleConfirm}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold"
                style={{ background: "var(--green)", color: onAccent }}>
                <Check className="h-4 w-4" />
                موافق
              </button>
              <button type="button" onClick={handleClose}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors"
                style={{ border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = faceBg)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper)")}>
                <X className="h-4 w-4" />
                إغلاق
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}