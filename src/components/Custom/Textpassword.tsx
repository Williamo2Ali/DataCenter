import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Tooltip } from '../Tooltip';

export type TextpasswordProps = {
  /** القيمة الحالية — يتحكم بها الأب كلياً */
  value: string;
  /** يبلَّغ الأب بكل ما يُكتب */
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  /** يُمرَّر كما هو لعنصر الإدخال (current-password / new-password) */
  autoComplete?: string;
  disabled?: boolean;
  /** عرض الحاوية */
  className?: string;
  /** اتجاه النص داخل الحقل — كلمات المرور عادة ltr */
  dir?: 'ltr' | 'rtl' | 'auto';
  /** تلميح زر الإظهار (عندما النص مخفي) */
  showLabel?: string;
  /** تلميح زر الإخفاء (عندما النص ظاهر) */
  hideLabel?: string;
};

/* حقل كلمة مرور بزر عين داخلي (إظهار ⇄ إخفاء) — حالة الزر مستقلة لكل حقل،
   بألوان ثيم التطبيق. مكتفٍ بذاته: لا استيراد خارج المجلد إلا react وlucide. */
export default function Textpassword({
  value,
  onChange,
  placeholder = '',
  id,
  autoComplete,
  disabled = false,
  className = '',
  dir = 'ltr',
  showLabel = 'إظهار',
  hideLabel = 'إخفاء',
}: TextpasswordProps) {
  const [show, setShow] = useState(false);
  const tip = show ? hideLabel : showLabel;

  return (
    <div className={`relative ${className}`} dir={dir}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        dir={dir}
        style={{
          width: '100%',
          height: 42,
          paddingInlineStart: 12,
          paddingInlineEnd: 40,
          borderRadius: 6,
          border: '1px solid var(--line)',
          background: 'color-mix(in srgb, var(--green) 4%, var(--paper))',
          color: 'var(--ink)',
          fontSize: 'var(--app-input-font-size, 0.9375rem)',
          outline: 'none',
        }}
      />
      <Tooltip content={tip}>
        <button
          type="button"
          onClick={() => setShow((prev) => !prev)}
          disabled={disabled}
          aria-label={tip}
          aria-pressed={show}
          className="absolute end-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md transition-colors disabled:opacity-50"
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
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </Tooltip>
    </div>
  );
}
