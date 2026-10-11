import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Tooltip } from "../Tooltip";

/* ————————————————————————————————————————————————————————————
   حقل اختيار تاريخ — مستقل تماماً (بلا store ولا ملفات مساعدة).
   كل الألوان من متغيّرات ثيم التطبيق فيفتحها/يتبدّل مع الوضع الليلي.
   ———————————————————————————————————————————————————————————— */

export type MonthNameStyle = "levantine" | "western";

const MONTH_NAMES_LEVANTINE = [
  "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول",
];

const MONTH_NAMES_WESTERN = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const WEEK_DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

const YEARS_PER_PAGE = 24;
const MIN_YEAR = 1950;

const DAY_CELL_H = 36;
const DAY_CELL_GAP = 4;
const WEEKDAY_ROW_H = 28;
const WEEKDAY_GAP = 4;
const MONTHS_VIEW_HEIGHT = 200;
const YEARS_VIEW_HEIGHT = 280;

/* ألوان الثيم — متغيّرات CSS فيفكسها الوضع الليلي تلقائياً */
const panelStyle: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  boxShadow: "0 12px 32px rgba(20,32,28,.14)",
};
const softFill = "color-mix(in srgb, var(--green) 10%, var(--paper))";
const onAccent = "var(--paper)";

function isToday(day: number, month: number, year: number): boolean {
  const today = new Date();
  return today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
}

function isDayDisabled(
  day: number,
  month: number,
  year: number,
  minDate?: string,
  maxDate?: string,
): boolean {
  const date = new Date(year, month, day);
  if (minDate) {
    const min = new Date(minDate + "T00:00:00");
    if (date < min) return true;
  }
  if (maxDate) {
    const max = new Date(maxDate + "T23:59:59");
    if (date > max) return true;
  }
  return false;
}

function formatNumeric(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatLong(dateStr: string, months: string[]): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

interface DateSelectProps {
  label?: string;
  /** تاريخ ISO بصيغة yyyy-mm-dd */
  value: string;
  onChange: (date: string) => void;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
  openUpward?: boolean;
  /** أسلوب أسماء الأشهر — الافتراضي شامي */
  monthStyle?: MonthNameStyle;
  /** شكل العرض في الحقل — الافتراضي رقمي */
  dateFormat?: "numeric" | "long";
  showClear?: boolean;
}

type ViewType = "days" | "months" | "years";

export default function DateSelect({
  label,
  value,
  onChange,
  disabled = false,
  minDate,
  maxDate,
  placeholder = "اختر التاريخ...",
  openUpward = false,
  monthStyle = "levantine",
  dateFormat = "numeric",
  showClear = true,
}: DateSelectProps) {
  const MONTH_NAMES = monthStyle === "western" ? MONTH_NAMES_WESTERN : MONTH_NAMES_LEVANTINE;

  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<ViewType>("days");

  const initial = () =>
    value ? new Date(value + "T00:00:00") : minDate ? new Date(minDate + "T00:00:00") : new Date();

  const [currentMonth, setCurrentMonth] = useState(() => initial().getMonth());
  const [currentYear, setCurrentYear] = useState(() => initial().getFullYear());
  const [yearPageStart, setYearPageStart] = useState(() => initial().getFullYear());

  const containerRef = useRef<HTMLDivElement>(null);

  const daysInMonth = useMemo(() => new Date(currentYear, currentMonth + 1, 0).getDate(), [currentYear, currentMonth]);
  const firstDayOfMonth = useMemo(() => new Date(currentYear, currentMonth, 1).getDay(), [currentYear, currentMonth]);
  const monthRows = useMemo(() => Math.ceil((firstDayOfMonth + daysInMonth) / 7), [firstDayOfMonth, daysInMonth]);

  const daysHeight =
    WEEKDAY_ROW_H + WEEKDAY_GAP + monthRows * DAY_CELL_H + (monthRows - 1) * DAY_CELL_GAP;
  const contentHeight =
    view === "months" ? MONTHS_VIEW_HEIGHT : view === "years" ? YEARS_VIEW_HEIGHT : daysHeight;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setView("days");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && value) {
      const d = new Date(value + "T00:00:00");
      setCurrentMonth(d.getMonth());
      setCurrentYear(d.getFullYear());
      setYearPageStart(d.getFullYear());
      setView("days");
    }
  }, [isOpen, value]);

  const handleSelectToday = () => {
    const today = new Date();
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
    setYearPageStart(today.getFullYear());
    onChange(
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    );
    setIsOpen(false);
    setView("days");
  };

  const handleSelectDay = (day: number) => {
    if (isDayDisabled(day, currentMonth, currentYear, minDate, maxDate)) return;
    const date = new Date(currentYear, currentMonth, day);
    onChange(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    );
    setIsOpen(false);
    setView("days");
  };

  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((p) => p - 1);
    } else {
      setCurrentMonth((p) => p - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((p) => p + 1);
    } else {
      setCurrentMonth((p) => p + 1);
    }
  };

  const years = useMemo(
    () => Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearPageStart + i),
    [yearPageStart],
  );

  const navBtn: React.CSSProperties = {
    borderRadius: 8,
    padding: "6px",
    lineHeight: 0,
    color: "var(--muted)",
    flexShrink: 0,
  };
  const navBtnHover = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = softFill;
    e.currentTarget.style.color = "var(--ink)";
  };
  const navBtnOut = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = "transparent";
    e.currentTarget.style.color = "var(--muted)";
  };

  return (
    <div className="flex w-full flex-col gap-2" ref={containerRef}>
      {label && (
        <label className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          {label}
        </label>
      )}

      <div className="relative">
        <input
          type="text"
          readOnly
          value={value ? (dateFormat === "long" ? formatLong(value, MONTH_NAMES) : formatNumeric(value)) : ""}
          placeholder={placeholder}
          onClick={() => !disabled && setIsOpen(true)}
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
        <Calendar
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4"
          style={{ color: "var(--muted)" }}
        />

        {value && !disabled && showClear && (
          <Tooltip content="مسح التاريخ">
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="مسح التاريخ"
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md"
              style={{ color: "var(--muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
            {/* الرأس */}
            <div className="mb-3 flex items-center gap-2">
              <Tooltip content="إغلاق">
                <button type="button" onClick={() => { setView("days"); setIsOpen(false); }}
                  style={navBtn} onMouseEnter={navBtnHover} onMouseLeave={navBtnOut}>
                  <X className="h-4 w-4" />
                </button>
              </Tooltip>

              {view === "days" ? (
                <Tooltip content="الشهر السابق">
                  <button type="button" onClick={goToPrevMonth}
                    style={navBtn} onMouseEnter={navBtnHover} onMouseLeave={navBtnOut}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </Tooltip>
              ) : view === "years" ? (
                <Tooltip content="السنوات السابقة">
                  <button
                    type="button"
                    onClick={() => setYearPageStart((p) => Math.max(MIN_YEAR, p - YEARS_PER_PAGE))}
                    disabled={yearPageStart <= MIN_YEAR}
                    style={{ ...navBtn, opacity: yearPageStart <= MIN_YEAR ? 0.4 : 1 }}
                    onMouseEnter={navBtnHover}
                    onMouseLeave={navBtnOut}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </Tooltip>
              ) : (
                <Tooltip content="رجوع للأيام">
                  <button type="button" onClick={() => setView("days")}
                    style={navBtn} onMouseEnter={navBtnHover} onMouseLeave={navBtnOut}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </Tooltip>
              )}

              <div className="flex flex-1 items-center justify-center gap-1">
                {view === "days" && (
                  <>
                    <Tooltip content="عرض الأشهر">
                      <button type="button" onClick={() => setView("months")}
                        style={titleBtn} onMouseEnter={titleHover} onMouseLeave={titleOut}>
                        {MONTH_NAMES[currentMonth]}
                      </button>
                    </Tooltip>
                    <Tooltip content="عرض السنوات">
                      <button type="button" onClick={() => setView("years")}
                        style={titleBtn} onMouseEnter={titleHover} onMouseLeave={titleOut}>
                        {currentYear}
                      </button>
                    </Tooltip>
                    <Tooltip content="تحديد تاريخ اليوم">
                      <button type="button" onClick={handleSelectToday}
                        style={{ ...titleBtn, color: "var(--green)" }}
                        onMouseEnter={titleHover} onMouseLeave={titleOut}>
                        اليوم
                      </button>
                    </Tooltip>
                  </>
                )}
                {view === "months" && (
                  <Tooltip content="عرض السنوات">
                    <button type="button" onClick={() => setView("years")}
                      style={titleBtn} onMouseEnter={titleHover} onMouseLeave={titleOut}>
                      {currentYear}
                    </button>
                  </Tooltip>
                )}
                {view === "years" && (
                  <span className="text-sm font-bold" dir="ltr" style={{ color: "var(--ink)" }}>
                    {yearPageStart} - {yearPageStart + YEARS_PER_PAGE - 1}
                  </span>
                )}
              </div>

              {view === "days" && (
                <Tooltip content="الشهر التالي">
                  <button type="button" onClick={goToNextMonth}
                    style={navBtn} onMouseEnter={navBtnHover} onMouseLeave={navBtnOut}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </Tooltip>
              )}
              {view === "years" && (
                <Tooltip content="السنوات التالية">
                  <button type="button" onClick={() => setYearPageStart((p) => p + YEARS_PER_PAGE)}
                    style={navBtn} onMouseEnter={navBtnHover} onMouseLeave={navBtnOut}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </Tooltip>
              )}
            </div>

            {/* المحتوى */}
            <div className="relative overflow-hidden" style={{ height: contentHeight }}>
              {/* الأيام */}
              <div className={`absolute inset-0 transition-all duration-300 ease-in-out ${view === "days" ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-4"}`}>
                {view === "days" && (
                  <>
                    <div className="mb-1 grid grid-cols-7 gap-1">
                      {WEEK_DAYS.map((d) => (
                        <div key={d} className="flex h-7 items-center justify-center text-[10px] font-bold"
                          style={{ color: "var(--muted)" }}>
                          {d}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: firstDayOfMonth }, (_, i) => (
                        <div key={`e${i}`} style={{ height: DAY_CELL_H }} />
                      ))}
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const off = isDayDisabled(day, currentMonth, currentYear, minDate, maxDate);
                        const today = isToday(day, currentMonth, currentYear);
                        const d = new Date(currentYear, currentMonth, day);
                        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                        const selected = value === key;

                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => handleSelectDay(day)}
                            disabled={off}
                            className="flex w-full items-center justify-center rounded-lg text-xs transition-colors"
                            style={{
                              height: DAY_CELL_H,
                              background: selected ? "var(--green)" : today ? softFill : "transparent",
                              color: selected ? onAccent : off ? "var(--muted)" : today ? "var(--green)" : "var(--ink)",
                              fontWeight: selected || today ? 700 : 400,
                              opacity: off ? 0.5 : 1,
                              cursor: off ? "not-allowed" : "pointer",
                            }}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* الأشهر */}
              <div className={`absolute inset-0 transition-all duration-300 ease-in-out ${view === "months" ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-4"}`}>
                {view === "months" && (
                  <div className="grid h-full grid-cols-3 content-center gap-2">
                    {MONTH_NAMES.map((monthName, index) => {
                      const active = currentMonth === index;
                      return (
                        <button key={index} type="button"
                          onClick={() => { setCurrentMonth(index); setView("days"); }}
                          className="rounded-lg py-3 text-xs font-semibold transition-colors"
                          style={{ background: active ? "var(--green)" : "transparent", color: active ? onAccent : "var(--ink)" }}>
                          {monthName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* السنوات */}
              <div className={`absolute inset-0 transition-all duration-300 ease-in-out ${view === "years" ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-4"}`}>
                {view === "years" && (
                  <div className="grid h-full grid-cols-4 content-center gap-2">
                    {years.map((year) => {
                      const active = currentYear === year;
                      return (
                        <button key={year} type="button"
                          onClick={() => { setCurrentYear(year); setView("months"); }}
                          className="rounded-lg py-2.5 text-xs font-semibold transition-colors"
                          style={{ background: active ? "var(--green)" : "transparent", color: active ? onAccent : "var(--ink)" }}>
                          {year}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const titleBtn: React.CSSProperties = {
  borderRadius: 6,
  padding: "2px 6px",
  fontSize: "0.8125rem",
  fontWeight: 700,
  color: "var(--ink)",
  lineHeight: 1.6,
};
const titleHover = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = softFill;
};
const titleOut = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = "transparent";
};