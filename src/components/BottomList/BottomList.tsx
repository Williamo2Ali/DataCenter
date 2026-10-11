import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./BottomList.module.css";

export interface BottomListItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  /** نمط مخصص للصف (اختبارات/تمييز مؤقت) — يُدمَج مع صنف العنصر. */
  style?: CSSProperties;
}

export interface BottomListProps {
  open: boolean;
  items: readonly BottomListItem[];
  onClose: () => void;
  onSelect?: (item: BottomListItem) => void;
  title?: ReactNode;
  ariaLabel?: string;
  showHandle?: boolean;
  dismissible?: boolean;
  closeOnSelect?: boolean;
  className?: string;
  style?: CSSProperties;
  container?: Element | null;
}

const EXIT_MS = 200;
const SETTLE_MS = 260;
const CLOSE_DISTANCE_RATIO = 0.28;
const CLOSE_VELOCITY = 0.7; // px per ms
const DRAG_SLOP = 6;

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  active: boolean;
}

export function BottomList({
  open,
  items,
  onClose,
  onSelect,
  title,
  ariaLabel,
  showHandle = true,
  dismissible = true,
  closeOnSelect = true,
  className,
  style,
  container,
}: BottomListProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);

  const scrimRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const timersRef = useRef<number[]>([]);
  const titleId = useId();

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((timer) => timer !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(
    () => () => {
      timersRef.current.forEach(window.clearTimeout);
      timersRef.current = [];
    },
    [],
  );

  // Mount early / unmount late so both the enter and the exit transition can play.
  useEffect(() => {
    if (open) {
      setMounted(true);
      // إطار مزدوج: الأول يرسم الحالة الابتدائية (مخفية أسفل الشاشة) والثاني
      // يرفع `visible` فيبدأ انتقال الدخول — بإطار واحد كان يُدمَج الأمران
      // في نفس الرسم فيظهر فجأة بلا حركة (عكس الخروج الذي يعمل).
      let frame2 = 0;
      const frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(frame1);
        if (frame2) cancelAnimationFrame(frame2);
      };
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Lock the page behind the sheet without shifting the layout.
  useEffect(() => {
    if (!mounted) return;
    const body = document.body;
    const overflow = body.style.overflow;
    const paddingRight = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = overflow;
      body.style.paddingRight = paddingRight;
    };
  }, [mounted]);

  // Move focus in, and restore it on the way out.
  useEffect(() => {
    if (!visible) return;
    previousFocusRef.current = document.activeElement;
    const sheet = sheetRef.current;
    const first = sheet?.querySelector<HTMLElement>(
      "[data-bl-focusable]:not([disabled])",
    );
    (first ?? sheet)?.focus({ preventScroll: true });
    return () => {
      const previous = previousFocusRef.current;
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    };
  }, [visible]);

  const applyDrag = useCallback((offset: number) => {
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    if (sheet) {
      sheet.style.transition = "none";
      sheet.style.transform = `translate3d(0, ${Math.max(0, offset)}px, 0)`;
    }
    if (scrim) {
      const height = sheet?.offsetHeight ?? 1;
      scrim.style.transition = "none";
      scrim.style.opacity = `${Math.max(0, 1 - offset / height)}`;
    }
  }, []);

  const clearInline = useCallback(() => {
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    if (sheet) {
      sheet.style.transition = "";
      sheet.style.transform = "";
    }
    if (scrim) {
      scrim.style.transition = "";
      scrim.style.opacity = "";
    }
  }, []);

  const settle = useCallback(
    (close: boolean) => {
      const sheet = sheetRef.current;
      const scrim = scrimRef.current;
      const height = sheet?.offsetHeight ?? 0;

      if (sheet) {
        sheet.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.3, 0, 0.8, 0.15)`;
        sheet.style.transform = `translate3d(0, ${close ? height : 0}px, 0)`;
      }
      if (scrim) {
        scrim.style.transition = `opacity ${SETTLE_MS}ms cubic-bezier(0.3, 0, 0.8, 0.15)`;
        scrim.style.opacity = close ? "0" : "1";
      }

      if (close) {
        // Hand over to the parent once the sheet is already off-screen.
        later(() => onClose(), SETTLE_MS * 0.7);
      } else {
        later(clearInline, SETTLE_MS);
      }
    },
    [clearInline, later, onClose],
  );

  const handleScrimDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dismissible) return;
      if (event.target === event.currentTarget) onClose();
    },
    [dismissible, onClose],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dismissible || !event.isPrimary || event.button !== 0) return;

      const fromHandle = Boolean(
        (event.target as HTMLElement).closest?.("[data-bl-handle]"),
      );
      // Dragging from the body is only allowed when the list is already at the top,
      // otherwise the gesture belongs to the scroll container.
      if (!fromHandle && (listRef.current?.scrollTop ?? 0) > 0) return;

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastY: event.clientY,
        lastTime: event.timeStamp,
        velocity: 0,
        active: false,
      };
    },
    [dismissible],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const dy = event.clientY - drag.startY;
      const dx = event.clientX - drag.startX;

      if (!drag.active) {
        if (Math.abs(dy) < DRAG_SLOP && Math.abs(dx) < DRAG_SLOP) return;
        // Horizontal or upward gestures stay with the page.
        if (dy <= 0 || Math.abs(dy) <= Math.abs(dx)) {
          dragRef.current = null;
          return;
        }
        drag.active = true;
        setDragging(true);
        sheetRef.current?.setPointerCapture(event.pointerId);
      }

      const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
      drag.velocity = (event.clientY - drag.lastY) / elapsed;
      drag.lastY = event.clientY;
      drag.lastTime = event.timeStamp;

      applyDrag(dy);
    },
    [applyDrag],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || !drag.active) return;

      setDragging(false);
      if (sheetRef.current?.hasPointerCapture(event.pointerId)) {
        sheetRef.current.releasePointerCapture(event.pointerId);
      }

      const height = sheetRef.current?.offsetHeight ?? 0;
      const offset = Math.max(0, event.clientY - drag.startY);
      const close =
        offset > height * CLOSE_DISTANCE_RATIO || drag.velocity > CLOSE_VELOCITY;

      settle(close);
    },
    [settle],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        if (!dismissible) return;
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const sheet = sheetRef.current;
      if (!sheet) return;

      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>("[data-bl-focusable]:not([disabled])"),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        sheet.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !sheet.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismissible, onClose],
  );

  const handleSelect = useCallback(
    (item: BottomListItem) => {
      if (item.disabled) return;
      onSelect?.(item);
      if (closeOnSelect) onClose();
    },
    [closeOnSelect, onClose, onSelect],
  );

  if (!mounted) return null;

  const portalTarget =
    container ?? (typeof document === "undefined" ? null : document.body);
  if (!portalTarget) return null;

  const hostClass = [styles.host, visible && styles.hostOpen, className]
    .filter(Boolean)
    .join(" ");
  const scrimClass = [styles.scrim, visible && styles.scrimVisible]
    .filter(Boolean)
    .join(" ");
  const sheetClass = [
    styles.sheet,
    visible && styles.sheetVisible,
    dragging && styles.dragging,
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className={hostClass}
      style={style}
      data-state={visible ? "open" : "closed"}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={scrimRef}
        className={scrimClass}
        aria-hidden="true"
        onPointerDown={dismissible ? handleScrimDown : undefined}
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={sheetClass}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {showHandle ? (
          <div className={styles.handleArea} data-bl-handle="">
            <span className={styles.handle} />
          </div>
        ) : null}

        {title ? (
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
        ) : null}

        <div ref={listRef} className={styles.list}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              data-bl-focusable=""
              className={[styles.item, item.danger && styles.itemDanger]
                .filter(Boolean)
                .join(" ")}
              style={item.style}
              disabled={item.disabled}
              onClick={() => handleSelect(item)}
            >
              {item.icon ? (
                <span className={styles.icon} aria-hidden="true">
                  {item.icon}
                </span>
              ) : null}
              <span className={styles.text}>
                <span className={styles.label}>{item.label}</span>
                {item.description ? (
                  <span className={styles.description}>{item.description}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    portalTarget,
  );
}