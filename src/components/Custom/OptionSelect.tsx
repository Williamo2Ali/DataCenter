// src/components/OptionSelect.tsx
// مكوّن اختيار عام (OptionSelect) — نسخة مرنة من CaseSelect تعمل مع أي مصدر بيانات:
//   • items: تمرير العناصر جاهزة (من الستور، fetch، IndexedDB، استيراد JSON محلي...)
//   • loader: دالة غير متزامنة يديرها المكوّن مع حالات تحميل/خطأ/إعادة محاولة.
//   • loading: حالة تحميل خارجية عند تمرير items (مثلاً أثناء قراءة ملف محلي).
//   • refreshToken: غيّر قيمته لإعادة تشغيل loader.
//   • searchText: بحث مخصص، renderItem: تحكم كامل بالرسم داخل القائمة.
// شكل العنصر: { id, title, subtitle?, meta?: [{icon?, text?}], details?, keywords? }
//
// مثال تحميل من ملف محلي:
//   const [items, setItems] = useState<OptionSelectItem[]>([]);
//   const loadFromFile = async (file: File) => {
//     const rows: Array<Record<string, string>> = JSON.parse(await file.text());
//     setItems(rows.map((r) => ({ id: String(r.id), title: r.title ?? "", subtitle: r.subtitle })));
//   };
//   <input type="file" accept=".json,.txt" onChange={(e) => e.target.files?.[0] && loadFromFile(e.target.files[0])} />
//   <OptionSelect value={id} onChange={setId} items={items} loading={parsing} />
//
// مثال loader:
//   <OptionSelect
//     value={id}
//     onChange={setId}
//     loader={useCallback(async () => {
//       const res = await fetch("/data/cases.json");
//       const rows = await res.json();
//       return rows.map((r) => ({ id: r.id, title: r.caseNumber, subtitle: r.clientName, keywords: [r.caseNumber, r.clientName] }));
//     }, [])}
//   />

import {
  Fragment,
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import {
  Search,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  AlertTriangle,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tooltip } from "../Tooltip";

/** دمج أصناف CSS بلا اعتماديات خارجية. */
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ألوان ثيم التطبيق —.follows light/dark عبر متغيّرات :root */
const onAccent = "var(--paper)";
const softFill = "color-mix(in srgb, var(--green) 10%, var(--paper))";
const faceBg = "color-mix(in srgb, var(--green) 4%, var(--paper))";
const panelStyle: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  boxShadow: "0 12px 32px rgba(20,32,28,.16)",
};

/** شكل العنصر الذي يمرره أي مصدر بيانات إلى المكوّن */
export interface OptionSelectItem {
  id: string;
  /** العنوان الرئيسي للعنصر (مثال: رقم القضية) */
  title: string;
  /** سطر ثانوي تحت العنوان (مثال: اسم الموكل) */
  subtitle?: string;
  /** صف معلومات إضافية أسفل العنوان (مثال: المحكمة، نوع القضية) */
  meta?: Array<{ icon?: LucideIcon; text?: string }>;
  /** نص وصفي اختياري في أسفل العنصر */
  details?: string;
  /** كلمات إضافية يدخلها البحث (غير معروضة) */
  keywords?: string[];
}

interface BaseOptionSelectProps<T extends OptionSelectItem> {
  label?: string;
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  loadingText?: string;
  errorText?: string;
  required?: boolean;
  /** المصدر الأول: العناصر جاهزة من أي مكان (محكومة بالخارج) */
  items?: T[];
  /** المصدر الثاني: دالة تحميل غير متزامنة، يديرها المكوّن مع حالات تحميل/خطأ */
  loader?: () => Promise<T[]>;
  /** غيّر قيمته لإعادة تشغيل loader (مثال: بعد رفع ملف جديد) */
  refreshToken?: number;
  /** حالة تحميل خارجية عند تمرير items (مثلاً أثناء قراءة ملف محلي) */
  loading?: boolean;
  /** استعلام بحث مخصص (افتراضياً: title + subtitle + keywords) */
  searchText?: (item: T) => string;
  /** تحكم كامل برسم العنصر داخل القائمة */
  renderItem?: (item: T, state: { selected: boolean }) => ReactNode;
  className?: string;
}

interface SingleOptionSelectProps<T extends OptionSelectItem> extends BaseOptionSelectProps<T> {
  multiple?: false;
  value: string;
  onChange: (id: string) => void;
}

interface MultiOptionSelectProps<T extends OptionSelectItem> extends BaseOptionSelectProps<T> {
  multiple: true;
  value: string[];
  onChange: (ids: string[]) => void;
}

type OptionSelectProps<T extends OptionSelectItem> =
  SingleOptionSelectProps<T> | MultiOptionSelectProps<T>;

// ———————— دوال مساعدة ————————

/** يحوّل أي خطأ إلى نص مقروء (بدون [object Object]) */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean" || typeof err === "bigint") {
    return String(err);
  }
  if (err === null || err === undefined) return "خطأ غير معروف";
  if (typeof err === "object") {
    try {
      return JSON.stringify(err);
    } catch {
      return "خطأ غير معروف";
    }
  }
  return "خطأ غير معروف";
}

/** البحث الافتراضي: title + subtitle + keywords */
function defaultSearchText<T extends OptionSelectItem>(item: T): string {
  return [item.title, item.subtitle ?? "", ...(item.keywords ?? [])].join(" ");
}

/** يفلتر العناصر حسب نص البحث (أو دالة البحث المخصصة) */
function filterBySearch<T extends OptionSelectItem>(
  items: T[],
  search: string,
  searchText?: (item: T) => string,
): T[] {
  const query = search.trim().toLowerCase();
  if (!query) return items;
  const getText = searchText ?? defaultSearchText;
  return items.filter((item) => getText(item).toLowerCase().includes(query));
}

/** يحوّل value دائماً إلى مصفوفة معرّفات (القيمة الفارغة في الأحادي = بلا تحديد) */
function toIdArray<T extends OptionSelectItem>(props: OptionSelectProps<T>): string[] {
  if (props.multiple) return props.value;
  return props.value ? [props.value] : [];
}

/** يحوّل onChange دائماً إلى دالة تستقبل مصفوفة معرّفات */
function toIdsChange<T extends OptionSelectItem>(
  props: OptionSelectProps<T>,
): (ids: string[]) => void {
  if (props.multiple) return props.onChange;
  const onChangeSingle = props.onChange;
  return (ids) => {
    const lastId = ids.length > 0 ? ids[ids.length - 1] : undefined;
    if (lastId !== undefined) onChangeSingle(lastId);
  };
}

/** مسح التحديد بحسب الوضع (الأحادي: id فارغ — كان زر المسح لا يعمل فيه) */
function toClearSelection<T extends OptionSelectItem>(props: OptionSelectProps<T>): () => void {
  if (props.multiple) return () => props.onChange([]);
  const onChangeSingle = props.onChange;
  return () => onChangeSingle("");
}

/** إجراء لوحة المفاتيح المطلوب تنفيذه */
type SelectKeyAction =
  | { kind: "none" }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "highlight"; index: number }
  | { kind: "select"; index: number };

/** يحدّد إجراء لوحة المفاتيح بحسب المفتاح وحالة القائمة */
function resolveSelectKeyAction(
  key: string,
  ctx: { isOpen: boolean; highlightedIndex: number; count: number },
): SelectKeyAction {
  const lastIndex = ctx.count - 1;

  if (!ctx.isOpen) {
    const opensList = key === "Enter" || key === " " || key === "ArrowDown";
    return opensList ? { kind: "open" } : { kind: "none" };
  }
  if (key === "ArrowDown") {
    const next = ctx.highlightedIndex < lastIndex ? ctx.highlightedIndex + 1 : 0;
    return { kind: "highlight", index: next };
  }
  if (key === "ArrowUp") {
    const prev = ctx.highlightedIndex > 0 ? ctx.highlightedIndex - 1 : lastIndex;
    return { kind: "highlight", index: prev };
  }
  if (key === "Enter") return { kind: "select", index: ctx.highlightedIndex };
  if (key === "Escape" || key === "Tab") return { kind: "close" };
  return { kind: "none" };
}

// ———————— خطافات مساعدة ————————

type LoaderResult<T extends OptionSelectItem> = {
  items: T[];
  loading: boolean;
  error: string | null;
  retry: () => void;
};

/** يحمّل العناصر من loader ويدير حالات التحميل/الخطأ/إعادة المحاولة */
function useLoadedItems<T extends OptionSelectItem>(
  loader?: () => Promise<T[]>,
  refreshToken = 0,
): LoaderResult<T> {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(Boolean(loader));
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const hasLoader = Boolean(loader);

  useEffect(() => {
    if (!hasLoader) {
      setLoading(false);
      setError(null);
      return;
    }
    const runLoader = loaderRef.current;
    if (!runLoader) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let cancelled = false;
    runLoader()
      .then((result) => {
        if (cancelled) return;
        setItems(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(toErrorMessage(err));
        setItems([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasLoader, refreshToken, retryCount]);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  return { items, loading, error, retry };
}

/** يعيد ref الحدود ويستدعي الدالة عند النقر خارجها */
function useOutsideClick(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onOutside]);
  return ref;
}

/** يركّز الحقل عند فتح القائمة */
function useFocusOnOpen(isOpen: boolean, ref: { current: HTMLInputElement | null }) {
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => ref.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen, ref]);
}

/** يُمرّر القائمة إلى العنصر المُبرز (عناصر الخيارات فقط — الفواصل مستثناة) */
function useScrollToHighlight(ref: { current: HTMLDivElement | null }, index: number) {
  useEffect(() => {
    if (index < 0) return;
    const list = ref.current?.querySelector("[data-list]");
    const target = list?.querySelectorAll(":scope > li[data-option]").item(index) as HTMLElement | null;
    target?.scrollIntoView({ block: "nearest" });
  }, [index, ref]);
}

// ———————— مكوّنات عرض فرعية ————————

type MetaEntry = { icon?: LucideIcon; text: string };

/** صف معلومات العنصر (أيقونة + نص) */
function MetaRow({ meta }: Readonly<{ meta: OptionSelectItem["meta"] }>) {
  const visibleMeta = useMemo(
    () => (meta ?? []).filter((entry): entry is MetaEntry => Boolean(entry.text)),
    [meta],
  );

  if (visibleMeta.length === 0) return null;

  return (
    <span style={{ color: "var(--muted)" }}>
      {visibleMeta.map((entry) => (
        <span key={entry.text} className="flex items-center gap-1">
          {entry.icon ? (
            <entry.icon className="h-3 w-3 shrink-0" />
          ) : (
            <span className="h-3 w-3 shrink-0" />
          )}
          <span className="text-[11px]">{entry.text}</span>
        </span>
      ))}
    </span>
  );
}

/** الرسم الافتراضي لعنصر داخل القائمة */
function DefaultItemRow({
  item,
  multiple,
  selected,
}: Readonly<{
  item: OptionSelectItem;
  multiple: boolean;
  selected: boolean;
}>) {
  const hasMeta = Boolean(item.meta?.some((entry) => entry.text));

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{item.title}</span>
          {item.subtitle && (
            <div className="mt-1 flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
              <FileText className="h-3 w-3 shrink-0" />
              <span className="text-xs">{item.subtitle}</span>
            </div>
          )}
        </div>
        {multiple ? (
          <span
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
            style={{
              borderColor: selected ? "var(--green)" : "var(--line)",
              background: selected ? "var(--green)" : "var(--paper)",
              color: onAccent,
            }}
          >
            {selected && <Check className="h-3 w-3" />}
          </span>
        ) : (
          selected && <Check className="mt-1 h-4 w-4 shrink-0" style={{ color: "var(--green)" }} />
        )}
      </div>
      {(hasMeta || Boolean(item.details)) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <MetaRow meta={item.meta} />
          {item.details && (
            <span className="line-clamp-1 text-[11px]" style={{ color: "var(--muted)" }}>{item.details}</span>
          )}
        </div>
      )}
    </>
  );
}

/** محتوى زر الفتح: العنصر المحدد أو عدد المحددات أو النص البديل */
function TriggerContent({
  multiple,
  selectedItems,
  selectedItem,
  placeholder,
}: Readonly<{
  multiple: boolean;
  selectedItems: OptionSelectItem[];
  selectedItem: OptionSelectItem | null;
  placeholder: string;
}>) {
  const placeholderNode = <span style={{ color: "var(--muted)" }}>{placeholder}</span>;

  if (multiple) {
    if (selectedItems.length === 0) return placeholderNode;
    return (
      <div className="flex-1 text-right">
        <span className="font-semibold" style={{ color: "var(--ink)" }}>{selectedItems.length} محدد</span>
        <span className="mx-1.5" style={{ color: "var(--muted)" }}>—</span>
        <span style={{ color: "var(--muted)" }}>{selectedItem?.title ?? ""}</span>
      </div>
    );
  }

  if (!selectedItem) return placeholderNode;

  return (
    <div className="flex-1 text-right">
      <span className="font-semibold" style={{ color: "var(--ink)" }}>{selectedItem.title}</span>
      {selectedItem.subtitle && (
        <>
          <span className="mx-1.5" style={{ color: "var(--muted)" }}>—</span>
          <span style={{ color: "var(--muted)" }}>{selectedItem.subtitle}</span>
        </>
      )}
    </div>
  );
}

/** زر فتح القائمة وزر مسح التحديد */
function SelectTrigger({
  isOpen,
  disabled,
  invalid,
  multiple,
  selectedItems,
  selectedItem,
  placeholder,
  showClear,
  onToggle,
  onKeyDown,
  onClear,
}: Readonly<{
  isOpen: boolean;
  disabled: boolean;
  invalid: boolean;
  multiple: boolean;
  selectedItems: OptionSelectItem[];
  selectedItem: OptionSelectItem | null;
  placeholder: string;
  showClear: boolean;
  onToggle: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onClear: () => void;
}>) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors"
        style={{
          borderRadius: 10,
          border: `1px solid ${invalid ? "#c8443c" : "var(--line)"}`,
          background: faceBg,
          color: "var(--ink)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {isOpen ? (
          <ChevronUp className="h-4 w-4 shrink-0" style={{ color: "var(--muted)" }} />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--muted)" }} />
        )}
        <TriggerContent
          multiple={multiple}
          selectedItems={selectedItems}
          selectedItem={selectedItem}
          placeholder={placeholder}
        />
      </button>

      {showClear && (
        <Tooltip content="مسح التحديد">
        <button
          type="button"
          onClick={onClear}
          aria-label="مسح التحديد"
          className="absolute left-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md transition-colors"
          style={{ color: "var(--muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = softFill;
            e.currentTarget.style.color = "var(--ink)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--muted)";
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
        </Tooltip>
      )}
    </>
  );
}

/** أزرار موافقة/إلغاء وزر تحديد الكل (وضع التحديد المتعدد) */
function BulkActions({
  allSelected,
  hasItems,
  onConfirm,
  onCancel,
  onToggleAll,
}: Readonly<{
  allSelected: boolean;
  hasItems: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onToggleAll: () => void;
}>) {
  return (
    <>
      <div
        className="flex items-center justify-end gap-1 border-b px-2 py-1.5"
        style={{ borderColor: "var(--line)" }}
      >
        <button
          type="button"
          onClick={onConfirm}
          aria-label="موافقة"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors"
          style={{ color: "var(--green)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Check className="h-4 w-4" />
          موافقة
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="إلغاء"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors"
          style={{ color: "#c8443c" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "color-mix(in srgb, #c8443c 12%, var(--paper))")
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <X className="h-4 w-4" />
          إلغاء
        </button>
      </div>

      {hasItems && (
        <button
          type="button"
          onClick={onToggleAll}
          className="w-full border-b px-4 py-2 text-right text-xs font-semibold transition-colors"
          style={{ borderColor: "var(--line)", color: "var(--green)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {allSelected ? "إلغاء التحديد" : "تحديد الكل"}
        </button>
      )}
    </>
  );
}

/** جسم القائمة: تحميل / خطأ مع إعادة محاولة / فارغ / قائمة العناصر */
function DropdownBody<T extends OptionSelectItem>({
  loading,
  error,
  loadingText,
  errorText,
  emptyText,
  items,
  selectedIds,
  highlightedIndex,
  onSelect,
  onRetry,
  renderRow,
}: Readonly<{
  loading: boolean;
  error: string | null;
  loadingText: string;
  errorText: string;
  emptyText: string;
  items: T[];
  selectedIds: string[];
  highlightedIndex: number;
  onSelect: (id: string) => void;
  onRetry: () => void;
  renderRow: (item: T, selected: boolean) => ReactNode;
}>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs" style={{ color: "var(--muted)" }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {loadingText}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <AlertTriangle className="h-5 w-5" style={{ color: "#c8443c" }} />
        <span className="text-xs" style={{ color: "var(--muted)" }}>{`${errorText}: ${error}`}</span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
          style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs" style={{ color: "var(--muted)" }}>{emptyText}</div>
    );
  }

  return (
    <ul data-list className="max-h-[320px] overflow-y-auto py-1">
      {items.map((item, index) => {
        const isSelected = selectedIds.includes(item.id);
        // المميز (لوحة مفاتيح): خلفية أخضر ونص فاتح. المحدد فقط: تمييز خفيف.
        const isHot = index === highlightedIndex;
        return (
          <Fragment key={item.id}>
            <li data-option>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(item.id)}
                className="w-full cursor-pointer px-3 py-3 text-right transition-colors"
                style={{
                  // المميّز (لوحة المفاتيح): غسلة خضراء فاتحة — تُبقي نصوص العنصر مقروءة
                  // لأن عناصرها تحمل ألوانها بنفسها. المحدد: حدّ أخضر على اليمين.
                  background: isHot || isSelected ? softFill : "transparent",
                  borderInlineEnd: isHot ? "2px solid var(--green)" : "2px solid transparent",
                  color: "var(--ink)",
                }}
              >
                {renderRow(item, isSelected)}
              </button>
            </li>
            {index < items.length - 1 && (
              <li aria-hidden="true" className="px-3">
                <div className="border-b" style={{ borderColor: "var(--line)" }} />
              </li>
            )}
          </Fragment>
        );
      })}
    </ul>
  );
}

export default function OptionSelect<T extends OptionSelectItem>(props: OptionSelectProps<T>) {
  const {
    label,
    disabled = false,
    placeholder = "اختر...",
    emptyText = "لا توجد نتائج",
    searchPlaceholder = "ابحث...",
    loadingText = "جارٍ التحميل...",
    errorText = "فشل تحميل البيانات",
    required = false,
    multiple = false,
  } = props;

  // — تحميل العناصر عند تمرير loader —
  const {
    items: loadedItems,
    loading: isLoaderLoading,
    error: loadError,
    retry,
  } = useLoadedItems(props.loader, props.refreshToken ?? 0);

  // — حالة القائمة —
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearch("");
  }, []);

  // — سلوكيات عامة (نقر خارج القائمة، تركيز الحقل، التمرير للعنصر المُبرز) —
  const containerRef = useOutsideClick(closeDropdown);
  useFocusOnOpen(isOpen, searchInputRef);
  useScrollToHighlight(containerRef, highlightedIndex);

  // — القائمة النهائية: من items إن وُجدت، وإلا من loader —
  const items = useMemo<T[]>(() => props.items ?? loadedItems, [props.items, loadedItems]);

  // حالة التحميل المعروضة: الخارجية (مع items) أو الذاتية (مع loader)
  const showLoading = props.loading ?? isLoaderLoading;

  // توحيد الواجهة: value كمصفوفة دائماً، و onChange يستقبل مصفوفة دائماً
  // (حساب مباشر بلا useMemo: كائن props يتبدل كل render فيبطل أي حفظ)
  const value = toIdArray(props);
  const onChange = toIdsChange(props);
  const clearSelection = toClearSelection(props);

  const filteredItems = useMemo(
    () => filterBySearch(items, search, props.searchText),
    [items, search, props.searchText],
  );

  const selectedItems = useMemo(() => items.filter((i) => value.includes(i.id)), [items, value]);
  const selectedItem = selectedItems[0] ?? null;
  const isAllSelected = selectedItems.length === filteredItems.length && filteredItems.length > 0;

  // فتح القائمة مع تمييز العنصر المحدد (أو الأول) حتى يعمل Enter فوراً بلوحة المفاتيح
  const openDropdown = useCallback(() => {
    const selectedIdx = filteredItems.findIndex((i) => value.includes(i.id));
    let nextIndex = -1;
    if (selectedIdx >= 0) nextIndex = selectedIdx;
    else if (filteredItems.length > 0) nextIndex = 0;
    setHighlightedIndex(nextIndex);
    setIsOpen(true);
  }, [filteredItems, value]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search]);

  const handleSelect = useCallback(
    (id: string) => {
      if (multiple) {
        onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
        return;
      }
      onChange([id]);
      closeDropdown();
    },
    [multiple, value, onChange, closeDropdown],
  );

  const handleToggleAll = useCallback(() => {
    onChange(isAllSelected ? [] : filteredItems.map((item) => item.id));
  }, [isAllSelected, filteredItems, onChange]);

  const handleCancelSelection = useCallback(() => {
    onChange([]);
    closeDropdown();
  }, [onChange, closeDropdown]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const action = resolveSelectKeyAction(e.key, {
      isOpen,
      highlightedIndex,
      count: filteredItems.length,
    });

    if (action.kind === "none") return;
    if (action.kind !== "close") e.preventDefault();

    if (action.kind === "open") {
      openDropdown();
      return;
    }
    if (action.kind === "close") {
      closeDropdown();
      return;
    }
    if (action.kind === "highlight") {
      setHighlightedIndex(action.index);
      return;
    }
    if (action.index >= 0 && action.index < filteredItems.length) {
      handleSelect(filteredItems[action.index].id);
    }
  };

  const renderItem = props.renderItem;

  const renderRow = useCallback(
    (item: T, isSelected: boolean): ReactNode => {
      if (renderItem) return renderItem(item, { selected: isSelected });
      return <DefaultItemRow item={item} multiple={multiple} selected={isSelected} />;
    },
    [multiple, renderItem],
  );

  return (
    <div className={cn("flex flex-col gap-2", props.className)} ref={containerRef}>
      {label && (
        <label className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          {label}
          {required && <span className="mr-1" style={{ color: "#c8443c" }}>*</span>}
        </label>
      )}
      <div className="relative">
        <SelectTrigger
          isOpen={isOpen}
          disabled={disabled}
          invalid={required && value.length === 0}
          multiple={multiple}
          selectedItems={selectedItems}
          selectedItem={selectedItem}
          placeholder={placeholder}
          showClear={value.length > 0 && !isOpen && !disabled}
          onToggle={() => (isOpen ? closeDropdown() : openDropdown())}
          onKeyDown={handleKeyDown}
          onClear={clearSelection}
        />

        {isOpen && (
          <div
            className="absolute z-50 mt-1 w-full min-w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl"
            style={panelStyle}
          >
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--line)" }}>
              <Search className="h-4 w-4 shrink-0" style={{ color: "var(--muted)" }} />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                autoComplete="off"
                className="flex-1 bg-transparent py-1.5 text-sm outline-none"
                style={{ color: "var(--ink)" }}
              />
              {search && (
                <Tooltip content="مسح البحث">
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="مسح البحث"
                  className="rounded-md p-0.5 transition-colors"
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                </Tooltip>
              )}
            </div>

            {multiple && (
              <BulkActions
                allSelected={isAllSelected}
                hasItems={filteredItems.length > 0}
                onConfirm={closeDropdown}
                onCancel={handleCancelSelection}
                onToggleAll={handleToggleAll}
              />
            )}

            <DropdownBody
              loading={showLoading}
              error={loadError}
              loadingText={loadingText}
              errorText={errorText}
              emptyText={emptyText}
              items={filteredItems}
              selectedIds={value}
              highlightedIndex={highlightedIndex}
              onSelect={handleSelect}
              onRetry={retry}
              renderRow={renderRow}
            />
          </div>
        )}
      </div>
    </div>
  );
}
