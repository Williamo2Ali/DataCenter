import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ————————————————————————————————————————————————————————————
   تقويم شهري بأحداث — مستقل تماماً وبلا ثيم خارجي:
   كل الألوان مشتقّة من متغيّرات ثيم التطبيق (--paper/--line/--ink/
   --green/--muted) فتتبع الوضع الفاتح والداكن تلقائياً.
   ———————————————————————————————————————————————————————————— */

export type CalendarEvent = {
  /** ISO date: YYYY-MM-DD */
  date: string;
  title: string;
  time?: string;
};

export type MonthNameStyle = "levantine" | "western";

const MONTHS_LEVANTINE = [
  "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول",
];
const MONTHS_WESTERN = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/** أيام الأسبوع بدءاً من السبت */
const WEEKDAYS = ["سبت", "احد", "اثنين", "ثلاثاء", "اربعاء", "خميس", "جمعة"];

const softFill = "color-mix(in srgb, var(--green) 10%, var(--paper))";
const softFill2 = "color-mix(in srgb, var(--green) 18%, var(--paper))";
const onAccent = "var(--paper)";
const mutedWash = "color-mix(in srgb, var(--muted) 12%, var(--paper))";

function toKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 1) % 7));
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export type MonthCalendarProps = {
  events?: CalendarEvent[];
  initialDate?: Date;
  initialSelected?: string;
  onSelect?: (dateKey: string) => void;
  monthStyle?: MonthNameStyle;
};

export default function MonthCalendar({
  events = [],
  initialDate,
  initialSelected,
  onSelect,
  monthStyle = "levantine",
}: MonthCalendarProps) {
  const MONTHS = monthStyle === "western" ? MONTHS_WESTERN : MONTHS_LEVANTINE;

  const [viewDate, setViewDate] = useState(() => initialDate ?? new Date());
  const [selected, setSelected] = useState<string>(initialSelected ?? toKey(new Date()));
  const [picker, setPicker] = useState<"none" | "month" | "year">("none");
  const [yearPage, setYearPage] = useState(() => {
    const y = (initialDate ?? new Date()).getFullYear();
    return y - (((y % 12) + 12) % 12);
  });
  const headerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ key: string; left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (picker === "none") return;
    const onPointerDown = (e: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setPicker("none");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicker("none");
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [picker]);

  useEffect(() => {
    const clear = () => setHover(null);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const days = useMemo(() => buildGrid(year, month), [year, month]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [events]);

  const todayKey = toKey(new Date());
  const selectedDate = new Date(selected + "T00:00:00");

  const pick = (key: string) => {
    setSelected(key);
    onSelect?.(key);
  };

  const handleCellMove = (key: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setHover({ key, left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  };

  const headTitle: React.CSSProperties = {
    borderRadius: 6,
    padding: "2px 8px",
    color: "var(--ink)",
    fontWeight: 700,
  };

  return (
    <div dir="rtl" className="w-full text-right">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative" ref={headerRef}>
          <h1 className="flex items-center gap-2 text-2xl font-bold" style={{ color: "var(--ink)" }}>
            <button type="button" onClick={() => setPicker((p) => (p === "month" ? "none" : "month"))}
              aria-expanded={picker === "month"} style={{ ...headTitle, background: picker === "month" ? softFill : "transparent" }}>
              {MONTHS[month]}
            </button>
            <button type="button"
              onClick={() => {
                setYearPage(year - (((year % 12) + 12) % 12));
                setPicker((p) => (p === "year" ? "none" : "year"));
              }}
              aria-expanded={picker === "year"}
              style={{ ...headTitle, background: picker === "year" ? softFill : "transparent" }}>
              <span dir="ltr">{year}</span>
            </button>
          </h1>
          <p className="mt-1 px-2 text-sm" style={{ color: "var(--muted)" }}>التقويم الشهري للمواعيد والأحداث</p>

          {picker !== "none" && (
            <div className="absolute right-0 top-full z-20 mt-2 w-72 p-3"
              style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 12px 32px rgba(20,32,28,.16)" }}>
              {picker === "month" ? (
                <div className="grid grid-cols-3 gap-2">
                  {MONTHS.map((m, i) => (
                    <button key={m} type="button"
                      onClick={() => { setViewDate(new Date(year, i, 1)); setPicker("none"); }}
                      className="rounded-md px-2 py-2 text-xs font-medium transition-colors"
                      style={{ background: i === month ? "var(--green)" : "transparent", color: i === month ? onAccent : "var(--ink)" }}>
                      {m}
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <button type="button" onClick={() => setYearPage((y) => y - 12)}
                      className="rounded-md px-2 py-1 text-sm" style={{ color: "var(--muted)" }}>›</button>
                    <span dir="ltr" className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                      {yearPage} – {yearPage + 11}
                    </span>
                    <button type="button" onClick={() => setYearPage((y) => y + 12)}
                      className="rounded-md px-2 py-1 text-sm" style={{ color: "var(--muted)" }}>‹</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 12 }, (_, i) => yearPage + i).map((y) => (
                      <button key={y} type="button" dir="ltr"
                        onClick={() => { setViewDate(new Date(y, month, 1)); setPicker("none"); }}
                        className="rounded-md px-2 py-2 text-sm font-medium transition-colors"
                        style={{ background: y === year ? "var(--green)" : "transparent", color: y === year ? onAccent : "var(--ink)" }}>
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            style={{ border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper)")}>
            الشهر السابق ›
          </button>
          <button type="button"
            onClick={() => {
              const now = new Date();
              setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
              pick(toKey(now));
            }}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--green)" }}>
            اليوم
          </button>
          <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            style={{ border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper)")}>
            ‹ الشهر التالي
          </button>
        </div>
      </header>

      <section className="overflow-hidden rounded-lg"
        style={{ background: "var(--paper)", border: "1px solid var(--line)", boxShadow: "0 13px 34px rgba(20,32,28,.05)" }}>
        <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--line)" }}>
          {WEEKDAYS.map((wd, i) => {
            const isActiveCol = (selectedDate.getDay() + 1) % 7 === i;
            return (
              <div key={wd}
                className="truncate border-l px-2 py-2 text-2xs font-semibold tracking-wide last:border-l-0"
                style={{
                  borderColor: "var(--line)",
                  background: isActiveCol ? softFill2 : mutedWash,
                  color: isActiveCol ? "var(--green)" : "var(--muted)",
                }}>
                {wd}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = toKey(day);
            const inMonth = day.getMonth() === month;
            const isFirstOfMonth = day.getDate() === 1;
            const isSelected = key === selected;
            const isToday = key === todayKey;
            const dayEvents = eventsByDay.get(key) ?? [];

            return (
              <button key={key} type="button" onClick={() => pick(key)}
                onMouseMove={(e) => handleCellMove(key, e.currentTarget)}
                onMouseLeave={() => setHover(null)}
                onFocus={(e) => handleCellMove(key, e.currentTarget)}
                onBlur={() => setHover(null)}
                aria-pressed={isSelected}
                aria-label={dayEvents.length > 0
                  ? `${key}: ${dayEvents.map((ev) => (ev.time ? `${ev.time} ${ev.title}` : ev.title)).join("، ")}`
                  : undefined}
                className="flex flex-col items-stretch justify-start border-b border-l p-1.5 text-right align-top transition-colors last:border-l-0"
                style={{
                  height: "7rem",
                  borderColor: "var(--line)",
                  background: isSelected ? "var(--green)" : inMonth ? "var(--paper)" : "color-mix(in srgb, var(--muted) 5%, var(--paper))",
                  color: isSelected ? onAccent : "var(--ink)",
                }}
              >
                <span className="block text-xs sm:text-sm"
                  style={{
                    color: isSelected ? onAccent
                      : isFirstOfMonth || isToday ? "var(--ink)"
                      : inMonth ? "var(--ink)" : "var(--muted)",
                    fontWeight: isSelected || isFirstOfMonth || isToday ? 700 : 400,
                    opacity: isSelected ? 1 : inMonth ? 0.85 : 0.6,
                  }}>
                  {isFirstOfMonth ? `1 ${MONTHS[day.getMonth()]}` : day.getDate()}
                </span>

                <span className="mt-1 flex flex-col gap-1">
                  {dayEvents.map((ev, i) => (
                    <span key={i} className="block truncate rounded-xs px-1 py-0.5 text-2xs"
                      style={{
                        background: isSelected ? "color-mix(in srgb, var(--paper) 22%, transparent)" : softFill,
                        color: isSelected ? onAccent : "var(--green)",
                        borderInlineStart: `2px solid ${isSelected ? onAccent : "var(--green)"}`,
                      }}>
                      {ev.time ? `${ev.time} ` : ""}
                      {ev.title}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {hover &&
        (() => {
          const evs = eventsByDay.get(hover.key) ?? [];
          if (evs.length === 0) return null;
          const below = hover.top < 80;
          return createPortal(
            <div dir="rtl" role="tooltip"
              className="pointer-events-none fixed z-50 max-w-xs rounded-xl p-3 text-right"
              style={{
                left: hover.left + hover.width / 2,
                top: below ? hover.top + hover.height + 8 : hover.top - 8,
                transform: below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
                background: "var(--paper)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                boxShadow: "0 12px 32px rgba(20,32,28,.18)",
              }}>
              <div className="mb-1.5 pb-1 text-xs font-bold" style={{ borderBottom: "1px solid var(--line)", color: "var(--ink)" }}>
                {hover.key}
              </div>
              <ul className="space-y-1">
                {evs.map((ev, i) => (
                  <li key={i} className="flex items-baseline gap-1.5 text-[11px] leading-snug" style={{ color: "var(--muted)" }}>
                    {ev.time && <span className="shrink-0 font-semibold" style={{ color: "var(--green)" }}>{ev.time}</span>}
                    <span className="truncate">{ev.title}</span>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          );
        })()}
    </div>
  );
}