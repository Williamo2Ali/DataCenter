// منطقة الأزرار العامة — شبكة 4 مناطق أفقية بترتيب ثابت من اليسار (x=0).
// عامة لكل شاشات التطبيق: المنطقة 1 للوحة (Toggle)، والمناطق 2-4 سياقية
// تملؤها كل شاشة بأزرارها الخاصة. صف واحد إجباري لا يلتف أبداً.
import { Children, type ReactNode } from 'react'

type CommonButtonsAreaProps = {
  /** المنطقة 1 (أقصى اليسار) — زر Toggle اللوحة عادة. */
  area1?: ReactNode
  /** المناطق السياقية 2-4 — 3 كحد أقصى، الفارغ يُتجاهَل. */
  areas?: ReactNode
  /** وصف لقارئ الشاشة. */
  ariaLabel?: string
}

export default function CommonButtonsArea({ area1, areas, ariaLabel }: CommonButtonsAreaProps) {
  const rest = Children.toArray(areas).filter((node) => node !== null && node !== undefined).slice(0, 3)
  if (!area1 && rest.length === 0) return null
  return (
    <div dir="ltr" aria-label={ariaLabel} className="grid grid-flow-col items-center gap-[3px] [grid-auto-columns:max-content]">
      {area1}
      {rest}
    </div>
  )
}
