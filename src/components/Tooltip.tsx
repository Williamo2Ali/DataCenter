import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode, type TouchEvent } from "react";
import { createPortal } from "react-dom";

type TooltipPosition = "top" | "bottom" | "left" | "right";
type TooltipTone = "dark" | "light" | "danger";

type TooltipProps = {
  /** النص الظاهر عند المرور أو التركيز أو اللمس — فارغ = لا تلميح */
  content: string;
  children: ReactNode;
  /** اتجاه الظهور المفضل (ينعكس تلقائياً عند ضيق المساحة) */
  position?: TooltipPosition;
  /** تأخير الظهور بالمللي ثانية على الديسكتوب (افتراضي 350) */
  delay?: number;
  /** تعطيل التلميح كلياً */
  disabled?: boolean;
  /** صنف إضافي للغلاف */
  className?: string;
  /**
   * النغمة اللونية — كلها من متغيرات الثيم:
   * - `dark` (افتراضي): خلفية `var(--ink)` ونص `var(--paper)` — كالحالات النشطة
   *   في التطبيق (`.member-tab.is-active` / `.rtc`).
   * - `light`: خلفية `var(--paper)` ونص `var(--ink)` — كالبطاقات.
   * - `danger`: أحمر التطبيق `#c8443c` (نفس زر الحذف النهائي) ونص أبيض.
   */
  tone?: TooltipTone;
};

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** مسافة بين التلميح والعنصر + هامش الأمان من حواف النافذة */
const GAP = 8;

/** مدة الضغط المطول اللازمة لإظهار التلميح على اللمس */
const LONG_PRESS_MS = 500;
/** نافذة تجاهل التركيز/المرور المحاكى بعد أي تفاعل لمسي */
const TOUCH_SUPPRESS_MS = 700;
/** أقصى حركة للإصبع قبل اعتبار اللمس تمريراً لا ضغطاً */
const MOVE_TOLERANCE_PX = 10;

type Coords = {
  top: number;
  left: number;
  placed: TooltipPosition;
  /** إزاحة السهم داخل الفقاعة (أفقي للعلوي/السفلي، عمودي للجانبي) */
  arrowOffset: number;
};

const TONE_STYLE: Record<TooltipTone, CSSProperties> = {
  dark: {
    background: "var(--ink)",
    color: "var(--paper)",
    borderColor: "color-mix(in srgb, var(--paper) 22%, transparent)",
  },
  light: {
    background: "var(--paper)",
    color: "var(--ink)",
    borderColor: "var(--line)",
  },
  danger: {
    background: "#c8443c",
    color: "#fff",
    borderColor: "transparent",
  },
};

/**
 * يُغلِّف أي مكوّن ويُظهر تلميحاً عند المرور أو التركيز أو اللمس.
 *
 * الاستخدام:
 * ```tsx
 * import { Tooltip } from "../components/Tooltip";
 * <Tooltip content={t("...")}>
 *   <button ...><Icon /></button>
 * </Tooltip>
 * ```
 *
 * - ديسكتوب: hover بتأخير + تركيز لوحة المفاتيح فوري.
 * - موبايل/لمس: الضغط المطول (500ms) وحده يُظهر، والرفع يُخفي بعد 1.5 ثانية —
 *   الضغطة السريعة لا تُظهر شيئاً، والتركيز أو المرور المحاكى بعد اللمس يُتجاهل
 *   حتى لا يلتصق التلميح بعد النقر.
 * - يُرسم في portal على `document.body` بإحداثيات ثابتة، فيظهر فوق
 *   المودالات ولا يقصّه أي أب `overflow-hidden` (الهيدر/اللوحات).
 * - لا تضع `title` على العنصر الداخلي معه حتى لا يظهر تلميحان.
 */
export function Tooltip({
  content,
  children,
  position = "top",
  delay = 350,
  disabled = false,
  className,
  tone = "dark",
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const tooltipId = useId();

  const clearTimers = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const showDelayed = () => {
    if (disabled || !content) return;
    clearTimers();
    if (delay <= 0) {
      setOpen(true);
      return;
    }
    showTimer.current = window.setTimeout(() => setOpen(true), delay);
  };

  const showNow = () => {
    if (disabled || !content) return;
    clearTimers();
    setOpen(true);
  };

  const hideNow = () => {
    clearTimers();
    setOpen(false);
    setCoords(null);
  };

  const hideAfterTouch = () => {
    clearTimers();
    hideTimer.current = window.setTimeout(() => {
      setOpen(false);
      setCoords(null);
    }, 1500);
  };

  // ——— منطق اللمس: ضغط مطول فقط ———
  const touchTimer = useRef<number | null>(null);
  const longPressShown = useRef(false);
  const lastTouchStart = useRef(0);
  const lastTouchEnd = useRef(0);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const cancelLongPress = () => {
    if (touchTimer.current !== null) {
      window.clearTimeout(touchTimer.current);
      touchTimer.current = null;
    }
  };

  const handleTouchStart = (e: TouchEvent) => {
    lastTouchStart.current = Date.now();
    longPressShown.current = false;
    cancelLongPress();
    const t = e.touches[0];
    touchStartPos.current = t ? { x: t.clientX, y: t.clientY } : null;
    if (disabled || !content) return;
    touchTimer.current = window.setTimeout(() => {
      touchTimer.current = null;
      longPressShown.current = true;
      showNow();
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (touchTimer.current === null) return;
    const t = e.touches[0];
    const s = touchStartPos.current;
    if (t && s && Math.hypot(t.clientX - s.x, t.clientY - s.y) > MOVE_TOLERANCE_PX) {
      cancelLongPress();
    }
  };

  const handleTouchEnd = () => {
    lastTouchEnd.current = Date.now();
    cancelLongPress();
    touchStartPos.current = null;
    if (longPressShown.current) {
      longPressShown.current = false;
      hideAfterTouch();
    } else {
      hideNow();
    }
  };

  const handleTouchCancel = () => {
    cancelLongPress();
    touchStartPos.current = null;
    longPressShown.current = false;
    hideNow();
  };

  // التركيز بعد لمسة مباشرة (نقر) يُتجاهل — التركيز الحقيقي (كيبورد/قارئ) يعمل.
  const handleFocus = (e: FocusEvent) => {
    const el = e.target as HTMLElement | null;
    // التركيز البرمجي (.focus() عند فتح/إغلاق المودالات وإعادة التركيز لزر الحذف)
    // وتركيز اللمس/الفأرة لا يُظهر التلميح — فقط تركيز لوحة المفاتيح (:focus-visible).
    if (!el || typeof el.matches !== 'function' || !el.matches(':focus-visible')) return;
    if (Date.now() - lastTouchStart.current < TOUCH_SUPPRESS_MS) return;
    showNow();
  };

  // المرور المحاكى بعد اللمس (بعض متصفحات الموبايل) يُتجاهل — hover الديسكتوب يعمل.
  const handleMouseEnter = () => {
    if (Date.now() - lastTouchEnd.current < TOUCH_SUPPRESS_MS) return;
    showDelayed();
  };

  // تموضع الفقاعة بعد ظهورها + متابعة التمرير/تغيير الحجم وهي مفتوحة.
  useLayoutEffect(() => {
    if (!open) return;

    const update = () => {
      const anchor = anchorRef.current;
      const tip = tipRef.current;
      if (!anchor || !tip) return;
      const rect = anchor.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const tipW = tip.offsetWidth;
      const tipH = tip.offsetHeight;
      if (tipW === 0 || tipH === 0) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const clampX = (x: number) => Math.min(Math.max(GAP, x), Math.max(GAP, vw - tipW - GAP));
      const clampY = (y: number) => Math.min(Math.max(GAP, y), Math.max(GAP, vh - tipH - GAP));

      let placed: TooltipPosition = position;
      let top = 0;
      let left = 0;

      if (position === "top" || position === "bottom") {
        const fitsAbove = rect.top - tipH - GAP >= GAP;
        const fitsBelow = rect.bottom + tipH + GAP <= vh - GAP;
        placed = position === "top" ? (fitsAbove ? "top" : "bottom") : fitsBelow ? "bottom" : "top";
        // إن لم تتسع أي جهة عمودياً نلتزم بالمفضل مع التقييد داخل النافذة.
        if (!fitsAbove && !fitsBelow) placed = position;
        top = placed === "top" ? rect.top - tipH - GAP : rect.bottom + GAP;
        left = clampX(rect.left + rect.width / 2 - tipW / 2);
        top = clampY(top);
      } else {
        const fitsLeft = rect.left - tipW - GAP >= GAP;
        const fitsRight = rect.right + tipW + GAP <= vw - GAP;
        placed = position === "left" ? (fitsLeft ? "left" : "right") : fitsRight ? "right" : "left";
        if (!fitsLeft && !fitsRight) placed = position;
        left = placed === "left" ? rect.left - tipW - GAP : rect.right + GAP;
        top = clampY(rect.top + rect.height / 2 - tipH / 2);
        left = clampX(left);
      }

      const anchorCX = rect.left + rect.width / 2;
      const anchorCY = rect.top + rect.height / 2;
      const arrowOffset =
        placed === "top" || placed === "bottom"
          ? Math.min(Math.max(12, anchorCX - left), Math.max(12, tipW - 12))
          : Math.min(Math.max(12, anchorCY - top), Math.max(12, tipH - 12));

      setCoords({ top, left, placed, arrowOffset });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, position, content]);

  if (disabled || !content) {
    return <span className={cx("inline-flex", className)}>{children}</span>;
  }

  const toneStyle = TONE_STYLE[tone];
  const arrowStyle: CSSProperties =
    coords?.placed === "top"
      ? { bottom: -4, left: coords.arrowOffset - 4, background: toneStyle.background }
      : coords?.placed === "bottom"
        ? { top: -4, left: coords.arrowOffset - 4, background: toneStyle.background }
        : coords?.placed === "left"
          ? { right: -4, top: coords.arrowOffset - 4, background: toneStyle.background }
          : { left: -4, top: (coords?.arrowOffset ?? 12) - 4, background: toneStyle.background };

  return (
    <span
      ref={anchorRef}
      className={cx("inline-flex", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={hideNow}
      onFocus={handleFocus}
      onBlur={hideNow}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") hideNow();
      }}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            id={tooltipId}
            dir="auto"
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              visibility: coords ? "visible" : "hidden",
              maxWidth: "min(220px, calc(100vw - 16px))",
              padding: "6px 10px",
              borderRadius: 6,
              borderWidth: 1,
              borderStyle: "solid",
              fontSize: "0.75rem",
              fontWeight: 500,
              lineHeight: 1.7,
              textAlign: "center",
              overflowWrap: "break-word",
              whiteSpace: "normal",
              pointerEvents: "none",
              zIndex: 3000,
              boxShadow: "0 13px 34px color-mix(in srgb, var(--ink) 18%, transparent)",
              ...toneStyle,
            }}
            className="animate-tabs-item-in"
          >
            {content}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                width: 8,
                height: 8,
                transform: "rotate(45deg)",
                ...arrowStyle,
              }}
            />
          </span>,
          document.body,
        )}
    </span>
  );
}
