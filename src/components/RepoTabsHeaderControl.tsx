// الهيدر الموحد لتبويبات المستودعات — نفس التنسيق والمعلومات والتخطيط
// لكل التبويبات (الافتراضية والمخصصة) وعلى كل الشاشات (صغيرة/متوسطة/كبيرة).
// النصوص مقصوصة بـ ellipsis بلا التفاف، وعدّاد الحقول بعرض زرّين وارتفاع زر واحد.
import { Pencil, Trash2 } from 'lucide-react'
import { Tooltip } from './Tooltip'

type RepoTabsHeaderControlProps = {
  /** عنوان التبويب (السطر العلوي الصغير). */
  kicker: string
  /** الاسم الرئيسي (اسم الفرد). */
  title: string
  /** السطر الفرعي (الصفة). */
  subtitle: string
  /** نص عدّاد الحقول (مثال: "17 حقل"). */
  fieldCountText: string
  editTitle: string
  editAria: string
  deleteTitle: string
  deleteAria: string
  editDisabled?: boolean
  deleteDisabled?: boolean
  onEdit: () => void
  onDelete: () => void
  /** عند التمرير يصبح العنوان زراً (للوضع المتعدد فقط) — البقية h2 كما كانت. */
  onTitleClick?: () => void
  titleButtonAria?: string
}

export default function RepoTabsHeaderControl({
  kicker,
  title,
  subtitle,
  fieldCountText,
  editTitle,
  editAria,
  deleteTitle,
  deleteAria,
  editDisabled,
  deleteDisabled,
  onEdit,
  onDelete,
  onTitleClick,
  titleButtonAria,
}: RepoTabsHeaderControlProps) {
  return (
    <div className="rtc">
      <div className="rtc-texts">
        <p className="rtc-kicker">{kicker}</p>
        {onTitleClick ? (
          <button type="button" className="rtc-title" onClick={onTitleClick} aria-label={titleButtonAria ?? title}>
            {title}
          </button>
        ) : (
          <h2 className="rtc-title">{title}</h2>
        )}
        <p className="rtc-sub">{subtitle}</p>
      </div>
      <div className="rtc-side">
        <div className="rtc-count">
          <span>{fieldCountText}</span>
        </div>
        <Tooltip content={editTitle}>
          <button
            type="button"
            className="rtc-btn"
            aria-label={editAria}
            disabled={editDisabled}
            onClick={onEdit}
          >
            <Pencil size={15} />
          </button>
        </Tooltip>
        <Tooltip content={deleteTitle} tone="danger">
          <button
            type="button"
            className="rtc-btn danger"
            aria-label={deleteAria}
            disabled={deleteDisabled}
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
