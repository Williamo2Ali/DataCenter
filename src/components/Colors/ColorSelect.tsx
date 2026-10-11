import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, Palette, Slash } from "lucide-react";

import { ButtonSelectColor } from "@/components/Colors/ButtonSelectColor";
import { Tooltip } from "../Tooltip";

/** دمج أصناف CSS بلا اعتماديات خارجية. */
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type ColorPickerValue = string | null;

export type ColorOption = {
  value: string;
  label: string;
};

type RGB = { r: number; g: number; b: number };

/* ------------------------------------------------------------------ */
/* Default palettes - 100 لون (أضيفت 50 لون جديد)                     */
/* ------------------------------------------------------------------ */

const DEFAULT_THEME_COLORS: ColorOption[][] = [
  // الصفوف الأصلية الـ 5
  [
    { value: "#FFFFFF", label: "أبيض" },
    { value: "#000000", label: "أسود" },
    { value: "#E7E6E6", label: "رمادي فاتح" },
    { value: "#44546A", label: "رمادي مزرق" },
    { value: "#4472C4", label: "أزرق" },
    { value: "#ED7D31", label: "برتقالي" },
    { value: "#A5A5A5", label: "رمادي" },
    { value: "#FFC000", label: "ذهبي" },
    { value: "#5B9BD5", label: "سماوي" },
    { value: "#70AD47", label: "أخضر" },
  ],
  [
    { value: "#F2F2F2", label: "أبيض داكن ٥٪" },
    { value: "#7F7F7F", label: "أسود فاتح ٥٠٪" },
    { value: "#D0CECE", label: "رمادي فاتح داكن ١٠٪" },
    { value: "#D6DCE4", label: "رمادي مزرق فاتح ٨٠٪" },
    { value: "#D9E2F3", label: "أزرق فاتح ٨٠٪" },
    { value: "#FCE4D6", label: "برتقالي فاتح ٨٠٪" },
    { value: "#EDEDED", label: "رمادي فاتح ٨٠٪" },
    { value: "#FFF2CC", label: "ذهبي فاتح ٨٠٪" },
    { value: "#DDEBF7", label: "سماوي فاتح ٨٠٪" },
    { value: "#E2F0D9", label: "أخضر فاتح ٨٠٪" },
  ],
  [
    { value: "#D9D9D9", label: "أبيض داكن ١٥٪" },
    { value: "#595959", label: "أسود فاتح ٣٥٪" },
    { value: "#AEAAAA", label: "رمادي فاتح داكن ٢٥٪" },
    { value: "#ADB9CA", label: "رمادي مزرق فاتح ٦٠٪" },
    { value: "#B4C6E7", label: "أزرق فاتح ٦٠٪" },
    { value: "#F8CBAD", label: "برتقالي فاتح ٦٠٪" },
    { value: "#DBDBDB", label: "رمادي فاتح ٦٠٪" },
    { value: "#FFE699", label: "ذهبي فاتح ٦٠٪" },
    { value: "#BDD7EE", label: "سماوي فاتح ٦٠٪" },
    { value: "#C6E0B4", label: "أخضر فاتح ٦٠٪" },
  ],
  [
    { value: "#BFBFBF", label: "أبيض داكن ٢٥٪" },
    { value: "#404040", label: "أسود فاتح ٢٥٪" },
    { value: "#757171", label: "رمادي فاتح داكن ٥٠٪" },
    { value: "#8497B0", label: "رمادي مزرق فاتح ٤٠٪" },
    { value: "#8EAADB", label: "أزرق فاتح ٤٠٪" },
    { value: "#F4B183", label: "برتقالي فاتح ٤٠٪" },
    { value: "#C9C9C9", label: "رمادي فاتح ٤٠٪" },
    { value: "#FFD966", label: "ذهبي فاتح ٤٠٪" },
    { value: "#9DC3E6", label: "سماوي فاتح ٤٠٪" },
    { value: "#A9D18E", label: "أخضر فاتح ٤٠٪" },
  ],
  [
    { value: "#A6A6A6", label: "أبيض داكن ٣٥٪" },
    { value: "#262626", label: "أسود فاتح ١٥٪" },
    { value: "#3F3F3F", label: "رمادي فاتح داكن ٧٥٪" },
    { value: "#323F4F", label: "رمادي مزرق داكن ٢٥٪" },
    { value: "#2F5597", label: "أزرق داكن ٢٥٪" },
    { value: "#C65911", label: "برتقالي داكن ٢٥٪" },
    { value: "#7B7B7B", label: "رمادي داكن ٢٥٪" },
    { value: "#BF9000", label: "ذهبي داكن ٢٥٪" },
    { value: "#2E75B6", label: "سماوي داكن ٢٥٪" },
    { value: "#548235", label: "أخضر داكن ٢٥٪" },
  ],
  // 5 صفوف جديدة (50 لون إضافي)
  [
    { value: "#FF6B9D", label: "وردي" },
    { value: "#00D9FF", label: "فيروزي" },
    { value: "#9D4EDD", label: "بنفسجي فاتح" },
    { value: "#FF006E", label: "زهري عميق" },
    { value: "#FB5607", label: "برتقالي عميق" },
    { value: "#FFBE0B", label: "أصفر ذهبي" },
    { value: "#3A86FF", label: "أزرق سماوي" },
    { value: "#06FFA5", label: "أخضر نعناعي" },
    { value: "#8338EC", label: "بنفسجي عميق" },
    { value: "#FFCAB0", label: "وردي فاتح جداً" },
  ],
  [
    { value: "#FFE0ED", label: "وردي فاتح جداً" },
    { value: "#E0FFFD", label: "فيروزي فاتح جداً" },
    { value: "#F0E6FF", label: "بنفسجي فاتح جداً" },
    { value: "#FFD9E8", label: "زهري فاتح جداً" },
    { value: "#FFE8D1", label: "برتقالي فاتح جداً" },
    { value: "#FFFACD", label: "أصفر فاتح جداً" },
    { value: "#E0E7FF", label: "أزرق فاتح جداً" },
    { value: "#E0FFF0", label: "أخضر فاتح جداً" },
    { value: "#F5E6FF", label: "بنفسجي فاتح جداً جداً" },
    { value: "#FFE8CC", label: "برتقالي فاتح جداً جداً" },
  ],
  [
    { value: "#FFD1E0", label: "وردي متوسط" },
    { value: "#D1FFFD", label: "فيروزي متوسط" },
    { value: "#E8D9FF", label: "بنفسجي متوسط" },
    { value: "#FFC4D9", label: "زهري متوسط" },
    { value: "#FFD4B3", label: "برتقالي متوسط" },
    { value: "#FFF4A3", label: "أصفر متوسط" },
    { value: "#CDD9FF", label: "أزرق متوسط" },
    { value: "#D1F5E8", label: "أخضر متوسط" },
    { value: "#F0D9FF", label: "بنفسجي متوسط جداً" },
    { value: "#FFDDB3", label: "برتقالي متوسط جداً" },
  ],
  [
    { value: "#FF9CBE", label: "وردي داكن" },
    { value: "#99F4F0", label: "فيروزي داكن" },
    { value: "#D9B3FF", label: "بنفسجي داكن" },
    { value: "#FF80A0", label: "زهري داكن" },
    { value: "#FFAA6B", label: "برتقالي داكن" },
    { value: "#FFE680", label: "أصفر داكن" },
    { value: "#99CCFF", label: "أزرق داكن" },
    { value: "#99F5D9", label: "أخضر داكن" },
    { value: "#E6CCFF", label: "بنفسجي داكن جداً" },
    { value: "#FFB366", label: "برتقالي داكن جداً" },
  ],
  [
    { value: "#E6335F", label: "وردي عميق جداً" },
    { value: "#00AAA0", label: "فيروزي عميق جداً" },
    { value: "#6B2FB5", label: "بنفسجي عميق جداً" },
    { value: "#D91E63", label: "زهري عميق جداً" },
    { value: "#D2691E", label: "برتقالي عميق جداً" },
    { value: "#CC9900", label: "أصفر عميق جداً" },
    { value: "#1A73E8", label: "أزرق عميق جداً" },
    { value: "#00875A", label: "أخضر عميق جداً" },
    { value: "#5A3AA6", label: "بنفسجي عميق جداً جداً" },
    { value: "#AA6633", label: "برتقالي عميق جداً جداً" },
  ],
];

const DEFAULT_STANDARD_COLORS: ColorOption[] = [
  { value: "#C00000", label: "أحمر داكن" },
  { value: "#FF0000", label: "أحمر" },
  { value: "#FFC000", label: "برتقالي" },
  { value: "#FFFF00", label: "أصفر" },
  { value: "#92D050", label: "أخضر فاتح" },
  { value: "#00B050", label: "أخضر" },
  { value: "#00B0F0", label: "سماوي" },
  { value: "#0070C0", label: "أزرق" },
  { value: "#002060", label: "أزرق داكن" },
  { value: "#7030A0", label: "بنفسجي" },
];

/* ------------------------------------------------------------------ */
/* Color helpers                                                       */
/* ------------------------------------------------------------------ */

const normalizeColor = (color: string) => color.toUpperCase();
const isHexColor = (color: string) => /^#[0-9A-F]{6}$/i.test(color);
const clampNum = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function rgbToHex({ r, g, b }: RGB) {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToRgb(hex: string): RGB {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/* ألوان الثيم */
const softFill = "color-mix(in srgb, var(--green) 10%, var(--paper))";

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "var(--paper)",
  color: "var(--ink)",
  outline: "none",
  fontFamily: "inherit",
  textTransform: "uppercase",
};

const btnStyle: React.CSSProperties = {
  minHeight: 38,
  padding: "0 14px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 6,
  border: "1px solid transparent",
  fontSize: "0.8125rem",
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 140ms ease",
};

function ColorSwatch({
  option,
  selected,
  onSelect,
}: {
  option: ColorOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Tooltip content={`${option.label} — ${option.value}`}>
      <button
        type="button"
        className="relative flex size-7 items-center justify-center rounded-sm border p-0 transition-colors"
        style={{
          borderColor: selected ? "var(--green)" : "var(--line)",
          boxShadow: selected ? "0 0 0 2px color-mix(in srgb, var(--green) 30%, transparent)" : "none",
        }}
        onClick={onSelect}
        aria-label={option.label}
        aria-pressed={selected}
      >
        <span className="absolute inset-0.5 rounded-[2px]" style={{ backgroundColor: option.value }} />
      </button>
    </Tooltip>
  );
}

function EyedropperIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M19.2 2.8a3 3 0 0 1 0 4.24l-1.6 1.6 2.05 2.05-1.41 1.41-2.05-2.05-7.3 7.3-3.7.9.9-3.7 7.3-7.3-2.05-2.05L12.75 2l1.41 1.41-2.05 2.05 1.6-1.6a3 3 0 0 1 4.24 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Custom picker (saturation/value square + hue slider + RGB fields)   */
/* ------------------------------------------------------------------ */

function CustomColorArea({
  color,
  onChange,
}: {
  color: string;
  onChange: (hex: string) => void;
}) {
  const initialRgb = isHexColor(color) ? hexToRgb(color) : { r: 30, g: 58, b: 95 };
  const initialHsv = rgbToHsv(initialRgb.r, initialRgb.g, initialRgb.b);

  const [hue, setHue] = useState(initialHsv.h);
  const [sat, setSat] = useState(initialHsv.s);
  const [val, setVal] = useState(initialHsv.v);
  const [rgbText, setRgbText] = useState<RGB>(initialRgb);

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const draggingSv = useRef(false);
  const draggingHue = useRef(false);

  const rgb = hsvToRgb(hue, sat, val);
  const hex = rgbToHex(rgb);

  useEffect(() => {
    setRgbText(rgb);
    onChange(hex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hue, sat, val]);

  const updateFromSv = useCallback((clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clampNum(clientX - rect.left, 0, rect.width);
    const y = clampNum(clientY - rect.top, 0, rect.height);
    setSat(rect.width === 0 ? 0 : x / rect.width);
    setVal(rect.height === 0 ? 0 : 1 - y / rect.height);
  }, []);

  const updateFromHue = useCallback((clientX: number) => {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clampNum(clientX - rect.left, 0, rect.width);
    setHue(rect.width === 0 ? 0 : (x / rect.width) * 360);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (draggingSv.current) updateFromSv(e.clientX, e.clientY);
      if (draggingHue.current) updateFromHue(e.clientX);
    };
    const onUp = () => {
      draggingSv.current = false;
      draggingHue.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [updateFromSv, updateFromHue]);

  const handleChannelChange = (channel: keyof RGB, raw: string) => {
    const n = clampNum(parseInt(raw || "0", 10) || 0, 0, 255);
    const next = { ...rgbText, [channel]: n };
    setRgbText(next);
    const hsv = rgbToHsv(next.r, next.g, next.b);
    setHue(hsv.h);
    setSat(hsv.s);
    setVal(hsv.v);
  };

  const handleEyedropper = async () => {
    const EyeDropperCtor = (window as any).EyeDropper;
    if (!EyeDropperCtor) return;
    try {
      const result = await new EyeDropperCtor().open();
      const picked = hexToRgb(result.sRGBHex.toUpperCase());
      const hsv = rgbToHsv(picked.r, picked.g, picked.b);
      setHue(hsv.h);
      setSat(hsv.s);
      setVal(hsv.v);
    } catch {
      /* user cancelled */
    }
  };

  const hueColor = `hsl(${hue}, 100%, 50%)`;
  const eyedropperSupported = typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <div className="flex flex-col gap-3" dir="ltr">
      <div
        ref={svRef}
        onPointerDown={(e) => {
          draggingSv.current = true;
          updateFromSv(e.clientX, e.clientY);
        }}
        className="relative h-40 w-full cursor-crosshair touch-none rounded-md"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
        }}
      >
        <div
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{
            left: `${sat * 100}%`,
            top: `${(1 - val) * 100}%`,
            background: hex,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.4)",
          }}
        />
      </div>

      <div className="flex items-center gap-2.5">
        <Tooltip content={eyedropperSupported ? "التقاط لون من الشاشة" : "غير مدعوم في هذا المتصفح"}>
          <button
            type="button"
            onClick={handleEyedropper}
            disabled={!eyedropperSupported}
            className="flex size-7 shrink-0 items-center justify-center rounded-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: "var(--muted)", opacity: eyedropperSupported ? 1 : 0.4 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
          >
            <EyedropperIcon className="size-4" />
          </button>
        </Tooltip>

        <div
          className="size-7 shrink-0 rounded-full border"
          style={{ background: hex, borderColor: "var(--line)" }}
        />

        <div
          ref={hueRef}
          onPointerDown={(e) => {
            draggingHue.current = true;
            updateFromHue(e.clientX);
          }}
          className="relative h-3 flex-1 cursor-pointer touch-none rounded-full"
          style={{
            background:
              "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-white"
            style={{ left: `${(hue / 360) * 100}%`, boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["r", "g", "b"] as const).map((channel) => (
          <div key={channel} className="flex flex-col items-center gap-1">
            <input
              type="number"
              min={0}
              max={255}
              value={rgbText[channel]}
              onChange={(e) => handleChannelChange(channel, e.target.value)}
              style={{ ...inputStyle, height: 36, padding: "0 4px", textAlign: "center", color: "var(--green)", textTransform: "none" }}
            />
            <span className="text-xs" style={{ color: "var(--muted)" }}>{channel.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ColorSelectPanel — the embeddable content, no trigger/portal        */
/* Use this directly inside a dropdown item, a modal body, or a page.  */
/* ------------------------------------------------------------------ */

export type ColorSelectPanelProps = {
  value?: ColorPickerValue;
  onValueChange?: (value: ColorPickerValue) => void;
  label?: string;
  themeColors?: ColorOption[][];
  standardColors?: ColorOption[];
  allowNoColor?: boolean;
  className?: string;
};

export function ColorSelectPanel({
  value,
  onValueChange,
  label = "لون الخط",
  themeColors = DEFAULT_THEME_COLORS,
  standardColors = DEFAULT_STANDARD_COLORS,
  allowNoColor = true,
  className,
}: ColorSelectPanelProps) {
  const [view, setView] = useState<"swatches" | "custom">("swatches");
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState(
    value && isHexColor(value) ? normalizeColor(value) : "#1E3A5F",
  );

  const commitColor = (nextValue: ColorPickerValue) => {
    if (nextValue) {
      const normalized = normalizeColor(nextValue);
      setRecentColors((current) => [normalized, ...current.filter((c) => c !== normalized)].slice(0, 8));
    }
    onValueChange?.(nextValue);
  };

  if (view === "custom") {
    return (
      <div dir="rtl" className={cn("w-full", className)}>
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
          <button
            type="button"
            onClick={() => setView("swatches")}
            className="flex items-center gap-1 text-sm transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
          >
            <ArrowRight aria-hidden="true" className="size-4" />
            رجوع
          </button>
          <p className="mr-1 text-sm font-bold" style={{ color: "var(--ink)" }}>ألوان مخصصة</p>
        </div>

        <div className="space-y-3 p-4">
          <CustomColorArea color={customDraft} onChange={setCustomDraft} />

          <div className="flex items-center gap-2" dir="ltr">
            <input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value.toUpperCase())}
              placeholder="#1E3A5F"
              maxLength={7}
              aria-invalid={!isHexColor(customDraft)}
              style={inputStyle}
            />
            <button
              type="button"
              disabled={!isHexColor(customDraft)}
              onClick={() => {
                commitColor(customDraft);
                setView("swatches");
              }}
              style={{
                ...btnStyle,
                background: "var(--green)",
                color: "var(--paper)",
                opacity: isHexColor(customDraft) ? 1 : 0.5,
              }}
            >
              تطبيق
            </button>
          </div>
          {!isHexColor(customDraft) && (
            <p className="text-xs" style={{ color: "#c8443c" }}>اكتب رمزًا من ست خانات مثل #1E3A5F</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className={cn("w-full", className)}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
        <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>{label}</p>
      </div>

      <div className="space-y-4 p-4">
        <section>
          <h3 className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>ألوان السمة</h3>
          <div dir="ltr" className="overflow-x-auto pb-2 pt-1.5">
            <div className="flex w-max gap-6">
              {[themeColors.slice(0, 5), themeColors.slice(5)].map((group, groupIndex) => (
                <div key={groupIndex} className="space-y-1">
                  {group.map((row, rowIndex) => (
                    <div key={`${groupIndex}-${rowIndex}`} className="grid w-max grid-cols-10 gap-1">
                      {row.map((option) => (
                        <ColorSwatch
                          key={`${groupIndex}-${rowIndex}-${option.value}`}
                          option={option}
                          selected={value?.toUpperCase() === option.value.toUpperCase()}
                          onSelect={() => commitColor(option.value)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>ألوان قياسية</h3>
          <div className="grid grid-cols-10 gap-1" dir="ltr">
            {standardColors.map((option) => (
              <ColorSwatch
                key={option.value}
                option={option}
                selected={value?.toUpperCase() === option.value.toUpperCase()}
                onSelect={() => commitColor(option.value)}
              />
            ))}
          </div>
        </section>

        {recentColors.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>المستخدمة مؤخرًا</h3>
            <div className="flex flex-wrap gap-1" dir="ltr">
              {recentColors.map((color) => (
                <ColorSwatch
                  key={color}
                  option={{ value: color, label: `لون حديث ${color}` }}
                  selected={value?.toUpperCase() === color}
                  onSelect={() => commitColor(color)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="flex gap-1 border-t p-2" style={{ borderColor: "var(--line)" }}>
        {allowNoColor && (
          <button
            type="button"
            onClick={() => commitColor(null)}
            className="min-w-0 flex-1"
            style={{
              ...btnStyle,
              background: value === null ? softFill : "transparent",
              color: "var(--ink)",
            }}
          >
            <span className="flex min-w-0 items-center justify-center gap-1.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border"
                style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
                <Slash aria-hidden="true" className="size-4" style={{ color: "#c8443c" }} />
              </span>
              <span className="truncate">بدون لون</span>
              {value === null && <Check aria-hidden="true" className="size-4 shrink-0" />}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setCustomDraft(value && isHexColor(value) ? normalizeColor(value) : customDraft);
            setView("custom");
          }}
          className="min-w-0 flex-1"
          style={{ ...btnStyle, background: "transparent", color: "var(--ink)" }}
        >
          <span className="flex min-w-0 items-center justify-center gap-1.5">
            <Palette aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">ألوان مخصصة…</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ColorSelect — trigger button + floating popover wrapping the panel  */
/* Default, self-contained usage: <ColorSelect onValueChange={...} />  */
/* ------------------------------------------------------------------ */

export type ColorSelectProps = ColorSelectPanelProps & {
  defaultValue?: ColorPickerValue;
  disabled?: boolean;
  triggerClassName?: string;
  panelClassName?: string;
  /** إظهار نص الزر بجانب مربع اللون (افتراضي true) */
  showLabel?: boolean;
  /** أبعاد زر اللون — تُمرَّ إلى ButtonSelectColor */
  boxWidth?: number | string;
  boxHeight?: number;
  colorWidth?: number | string;
  colorHeight?: number;
  boxPadding?: number;
  /** ملء زر اللون لعرض الحاوية الأب (افتراضي false) */
  fullWidth?: boolean;
};

export function ColorSelect({
  value,
  defaultValue = "#1E3A5F",
  onValueChange,
  label = "لون الخط",
  disabled = false,
  showLabel = true,
  boxWidth,
  boxHeight,
  colorWidth,
  colorHeight,
  boxPadding,
  fullWidth = false,
  triggerClassName,
  panelClassName,
  ...panelProps
}: ColorSelectProps) {
  const [internalValue, setInternalValue] = useState<ColorPickerValue>(defaultValue);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedValue = value === undefined ? internalValue : value;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger) return;
    const tr = trigger.getBoundingClientRect();
    const gap = 8;
    const pw = panel?.offsetWidth || Math.min(352, window.innerWidth - 32);
    const ph = panel?.offsetHeight || 340;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = tr.left;
    if (left + pw > vw - gap) left = vw - gap - pw;
    if (left < gap) left = gap;
    let top = tr.bottom + gap;
    if (top + ph > vh - gap) top = tr.top - ph - gap;
    if (top < gap) top = gap;
    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    setCoords(null);
    const raf = requestAnimationFrame(updatePosition);
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onReposition = () => updatePosition();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updatePosition]);

  const handleChange = (next: ColorPickerValue) => {
    if (value === undefined) setInternalValue(next);
    onValueChange?.(next);
    setOpen(false);
  };

  return (
    <div ref={triggerRef} className={cn("relative inline-block", triggerClassName)}>
      <ButtonSelectColor
        label={label}
        color={selectedValue ?? "#ffffff"}
        onClick={() => setOpen((current) => !current)}
        isSelected={open}
        disabled={disabled}
        showLabel={showLabel}
        boxWidth={boxWidth}
        boxHeight={boxHeight}
        colorWidth={colorWidth}
        colorHeight={colorHeight}
        boxPadding={boxPadding}
        fullWidth={fullWidth}
      />

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            className={cn(
              "z-[999] w-[min(22rem,calc(100vw-2rem))] rounded-md border transition-opacity",
              coords ? "opacity-100" : "opacity-0",
              panelClassName,
            )}
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              background: "var(--paper)",
              borderColor: "var(--line)",
              color: "var(--ink)",
              boxShadow: "0 12px 32px rgba(20,32,28,.18)",
            }}
          >
            <ColorSelectPanel value={selectedValue} onValueChange={handleChange} label={label} {...panelProps} />
          </div>,
          document.body,
        )}
    </div>
  );
}

export default ColorSelect;
