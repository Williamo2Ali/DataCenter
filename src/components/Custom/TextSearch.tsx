import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Tooltip } from '../Tooltip';

export type TextSearchProps = {
  value: string;
  onChange: (value: string) => void;
  /** تنفيذ البحث (زر العدسة أو Enter) — يربطه الأب بأي حدث */
  onSearch: () => void;
  /** إلغاء البحث (زر X) — يربطه الأب بأي حدث */
  onClear: () => void;
  /** هل يوجد بحث مطبّق؟ يبدّل الأيقونة (عدسة ⇄ X) */
  searching: boolean;
  placeholder?: string;
  /** عرض الحاوية (مثال: "min-w-52 flex-1" أو "w-[30%] min-w-44") */
  className?: string;
  /** مرجع لمربع الإدخال الأصلي — يسمح لأي مكوّن خارجي بنقل التركيز إليه */
  inputRef?: React.Ref<HTMLInputElement>;
};

/* حقل بحث عرضي: زر داخلي يتبدّل (عدسة ⇄ X) بألوان ثيم التطبيق.
   يتذكّر داخلياً آخر نص بُحث عنه (لحظة الضغط على العدسة أو Enter) —
   أي تحرير بعده يعيد العدسة تلقائياً مع بقاء نص البحث ونتائجه كما هما،
   وزر X وحده يمسح. الأب يمرّر القيمة والأحداث وحالة "مطبَّق" فقط.
   البصر (أبيض + زر بلا تركيز) في 08-modals.css بأصناف textsearch-* —
   الزر مثبت بداية السطر المنطقية (جهة النص) كأزرار cleartext. */
export default function TextSearch({
  value,
  onChange,
  onSearch,
  onClear,
  searching,
  placeholder = 'بحث...',
  className = '',
  inputRef,
}: TextSearchProps) {
  // آخر نص بُحث عنه من داخل المكون (عدسة أو Enter) — لا علاقة له بالنتائج.
  const [committed, setCommitted] = useState<string | null>(null);
  const doSearch = () => {
    setCommitted(value);
    onSearch();
  };
  const doClear = () => {
    setCommitted(null);
    onClear();
  };
  // X يظهر فقط والنص الحالي هو نفسه المبحوث عنه — أي تحرير يعيد العدسة.
  const showClear = searching && committed !== null && value === committed;
  return (
    <div className={`textsearch-wrap ${className}`}>
      <input
        ref={inputRef}
        type="text"
        className="textsearch-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            doSearch();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            doClear();
          }
        }}
        placeholder={placeholder}
      />
      <Tooltip content={showClear ? 'إلغاء البحث' : 'بحث'}>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            if (showClear) doClear();
            else doSearch();
            // اللمس يحاكي mouseenter بلا mouseleave فيلتصق لون المرور — نصفّره فور النقر.
            e.currentTarget.style.background = 'var(--paper)';
            e.currentTarget.style.color = 'var(--muted)';
          }}
          aria-label={showClear ? 'إلغاء البحث' : 'بحث'}
          className="textsearch-btn"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'color-mix(in srgb, var(--green) 10%, var(--paper))';
            e.currentTarget.style.color = 'var(--ink)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--paper)';
            e.currentTarget.style.color = 'var(--muted)';
          }}
        >
          {showClear ? <X className="size-4" /> : <Search className="size-4" />}
        </button>
      </Tooltip>
    </div>
  );
}
