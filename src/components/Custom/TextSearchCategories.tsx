import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { List, X } from 'lucide-react';
import { Tooltip } from '../Tooltip';

export type TextSearchCategoriesProps = {
  /** النص المعروض (مثال: "12 — مجموعة") — فارغ عند عدم الاختيار */
  value: string;
  /** يوجد اختيار؟ يبدّل الأيقونة (قائمة ⇄ X) */
  hasValue: boolean;
  /** فتح نافذة الاختيار — يربطه الأب بأي حدث */
  onPick: () => void;
  /** مسح الاختيار — يربطه الأب بأي حدث */
  onClear: () => void;
  /** كتابة يدوية في الحقل (اختياري): يُبلَّغ الأب بكل ما يُكتب */
  onChange?: (value: string) => void;
  placeholder?: string;
  /** عرض الحاوية (مثال: "w-[30%] min-w-44") */
  className?: string;
  /** للقراءة فقط (مقفل): يمنع الكتابة ويخفي زر التبديل (قائمة ⇄ X) */
  readOnly?: boolean;
  /** منتقي فقط: يمنع الكتابة مع إبقاء زر التبديل ظاهراً (مثل حقول الفلاتر والمنتقي من مودال) */
  typingDisabled?: boolean;
  /** أيقونة زر الاختيار (بدلاً من List) — أي أيقونة من lucide */
  pickIcon?: LucideIcon;
  /** عند true: الزر يتحول إلى X عند وجود قيمة. عند false: الزر دائماً يفتح الاختيار */
  clearOnValue?: boolean;
};

/* حقل اختيار تصنيف: قابل للكتابة افتراضياً مع زر داخلي يتبدّل (قائمة ⇄ X)،
   بألوان ثيم التطبيق. يُمنع التحرير فقط عند تمرير readOnly من الأب. */
export default function TextSearchCategories({
  value,
  hasValue,
  onPick,
  onClear,
  onChange,
  placeholder = 'اختيار...',
  className = '',
  readOnly = false,
  typingDisabled = false,
  pickIcon: PickIcon = List,
  clearOnValue = true,
}: TextSearchCategoriesProps) {
  const showClear = clearOnValue && hasValue;
  // نص الحقل: قابل للكتابة افتراضياً، ويتزامن مع قيمة الأب كلما تغيّرت
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        readOnly={readOnly || typingDisabled}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange?.(event.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClear();
          }
        }}
        placeholder={placeholder}
        style={{
          width: '100%',
          height: 42,
          padding: '0 40px',
          borderRadius: 6,
          border: '1px solid var(--line)',
          background: 'color-mix(in srgb, var(--green) 4%, var(--paper))',
          color: 'var(--ink)',
          fontSize: 'var(--app-input-font-size, 0.9375rem)',
          outline: 'none',
          cursor: readOnly ? 'not-allowed' : 'auto',
          opacity: readOnly ? 0.6 : 1,
        }}
      />
      {!readOnly && (
        <Tooltip content={showClear ? 'إلغاء الاختيار' : 'اختيار'}>
          <button
            type="button"
            onClick={showClear ? onClear : onPick}
            aria-label={showClear ? 'إلغاء الاختيار' : 'اختيار'}
            className="absolute left-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--green) 10%, var(--paper))';
              e.currentTarget.style.color = 'var(--ink)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--muted)';
            }}
          >
            {showClear ? <X className="size-4" /> : <PickIcon className="size-4" />}
          </button>
        </Tooltip>
      )}
    </div>
  );
}