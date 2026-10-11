import { useState, useRef, useEffect } from "react";
import { Clock, Check, X } from "lucide-react";
import { Tooltip } from "../Tooltip";
import AnalogTimePicker, {
  getLocalPeriod,
  LOCAL_PERIOD_LABELS,
  type TimeDisplayMode,
} from "./AnalogTimePicker";

interface AnalogTimeSelectProps {
  label?: string;
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean;
  placeholder?: string;
  timeDisplayMode?: TimeDisplayMode;
  autoDetectPeriod?: boolean;
}

interface DraftTime {
  hours: number;
  minutes: number;
  period: "AM" | "PM";
}

function padZero(num: number): string {
  return num.toString().padStart(2, "0");
}

function toDraft(value: string): DraftTime {
  if (!value) return { hours: 12, minutes: 0, period: "AM" };
  const [h, m] = value.split(":").map(Number);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hours = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { hours, minutes: m || 0, period };
}

function to24h(d: DraftTime): string {
  let hour24 = d.hours;
  if (d.period === "AM" && d.hours === 12) hour24 = 0;
  if (d.period === "PM" && d.hours !== 12) hour24 = d.hours + 12;
  return `${padZero(hour24)}:${padZero(d.minutes)}`;
}

function formatDisplayTime(timeStr: string, mode: TimeDisplayMode): string {
  if (!timeStr) return "";
  const d = toDraft(timeStr);
  const suffix =
    mode === "local-periods"
      ? LOCAL_PERIOD_LABELS[getLocalPeriod(d.hours, d.period)]
      : d.period;
  return `${padZero(d.hours)}:${padZero(d.minutes)} ${suffix}`;
}

export default function AnalogTimeSelect({
  label,
  value,
  onChange,
  disabled = false,
  placeholder = "اختر الوقت...",
  timeDisplayMode = "am-pm",
  autoDetectPeriod = true,
}: AnalogTimeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<DraftTime>(() => toDraft(value));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(toDraft(value));
    }
  }, [isOpen, value]);

  const handleTimeSelect = (time: DraftTime) => {
    setDraft(time);
  };

  const handleConfirm = () => {
    onChange(to24h(draft));
    setIsOpen(false);
  };

  const handleClose = () => {
    setDraft(toDraft(value));
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
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors disabled:cursor-not-allowed"
          style={{
            border: "1px solid var(--line)",
            background: "color-mix(in srgb, var(--green) 4%, var(--paper))",
            color: "var(--ink)",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <Clock className="h-4 w-4 shrink-0" style={{ color: "var(--muted)" }} />
          <span style={{ color: value ? "var(--ink)" : "var(--muted)" }}>
            {value ? formatDisplayTime(value, timeDisplayMode) : placeholder}
          </span>
        </button>

        {value && !disabled && (
          <Tooltip content="مسح الوقت">
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="مسح الوقت"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--green) 10%, var(--paper))")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          </Tooltip>
        )}

        {isOpen && (
          <div
            className="absolute z-50 mt-1 w-full min-w-[340px] rounded-xl"
            style={{ background: "var(--paper)", border: "1px solid var(--line)", boxShadow: "0 12px 32px rgba(20,32,28,.16)" }}
          >
            <div className="flex items-center justify-between px-3 pt-3">
              <Tooltip content="إغلاق">
              <button
                type="button"
                onClick={handleClose}
                aria-label="إغلاق"
                className="rounded-lg p-1.5 transition-colors"
                style={{ color: "var(--muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--green) 10%, var(--paper))")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <X className="h-5 w-5" />
              </button>
              </Tooltip>
              <Tooltip content="تأكيد الوقت">
              <button
                type="button"
                onClick={handleConfirm}
                aria-label="تأكيد الوقت"
                className="rounded-lg p-1.5 transition-colors"
                style={{ color: "var(--muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--green) 10%, var(--paper))")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Check className="h-5 w-5" />
              </button>
              </Tooltip>
            </div>

            <div className="px-4 pb-4">
              <AnalogTimePicker
                onTimeSelect={handleTimeSelect}
                timeDisplayMode={timeDisplayMode}
                autoDetectPeriod={autoDetectPeriod}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
