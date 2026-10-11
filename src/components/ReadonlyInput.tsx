// حقل عرض للقراءة فقط بزرّين متراكبين داخله (نسخ/تعديل أو إظهار/نسخ).
// بلا أي منطق حاوية أو لغات — زرّان ثابتان يسار الحقل كما كان أصلاً.
import type { InputHTMLAttributes, ReactNode } from 'react'

type ReadonlyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'readOnly'> & {
  value: string
  /** الزر الأول (نسخ/إظهار) والثاني (تعديل/نسخ) — الفارغ لا يُركَّب. */
  actions: [ReactNode?, ReactNode?]
}

export function ReadonlyInput({ value, actions, ...rest }: ReadonlyInputProps) {
  return (
    <span className="ro-wrap">
      <input {...rest} value={value} readOnly />
      {(actions[0] || actions[1]) && (
        <span className="field-actions">
          {actions[0]}
          {actions[1]}
        </span>
      )}
    </span>
  )
}
