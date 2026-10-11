// هيدر الشاشات الصغيرة والمتوسطة (موبايل/تابلت — أقل من 1024px).
// Mobile-First: ظاهر افتراضياً، يُخفى عند min-width:1024px حيث يتولى AppHeader.
// يحترم النوتش عبر paddingTop بـ env(safe-area-inset-top).
import { Children, type ReactNode } from 'react'
import { ClipboardCopy, Settings } from 'lucide-react'
import { isTauri } from '@tauri-apps/api/core'
import CommonButtonsArea from './CommonButtonsArea'
import { useLanguage } from '../language/LanguageContext'
import { Tooltip } from './Tooltip'

type AppHeaderMobileProps = {
  brandChip: ReactNode
  isDataMode: boolean
  /**
   * هل يمكن نسخ نصّ من التبويب النشط؟ (نفس شرط الديسكتوب — بلا نص لا زر).
   */
  canCopyData: boolean
  onOpenAccount: () => void
  onToggleDataMode: () => void
  /**
   * مناطق الأزرار السياقية (areas 2-4): حسب القسم المفتوح
   * (مثلاً: قائمة الأفراد + إضافة فرد في تبويبات السجلات). غيابها = لا شيء يُرسم.
   */
  customAction?: ReactNode
  /** مستودع مفتوح؟ تُعرض مناطق الأزرار الأربع ويُخفى زر الحساب (لا حذف). */
  repoOpen?: boolean
  /** إخفاء زر الحساب (القاعدة: أي شاشة غير الرئيسية تخفيه) — لا حذف. */
  hideAccount?: boolean
  /** صفحة الحساب نفسها: لا ترس مستودع (المستخدم فيها أصلاً — وللبقاء ضمن 3 مناطق). */
  accountPage?: boolean
  /**
   * زر المنطقة 1 (أقصى اليسار): Toggle للوحة التبويبات — سحب/طي حسب حالتها.
   * يظهر فقط مع مستودع مفتوح، بدل زر الشريط السفلي.
   */
  panelToggle?: ReactNode
}

export const MOBILE_BTN =
  'grid size-10 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 ' +
  'text-[#485651] transition-colors duration-[120ms] active:bg-[#e9eeea] ' +
  'focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-[-3px] ' +
  'dark:text-[#d1d1d5] dark:active:bg-[#36363c]'

export default function AppHeaderMobile({
  brandChip,
  isDataMode,
  canCopyData,
  onOpenAccount,
  onToggleDataMode,
  customAction,
  repoOpen,
  hideAccount,
  accountPage,
  panelToggle,
}: AppHeaderMobileProps) {
  const { t } = useLanguage()
  const tauri = isTauri()
  // القاعدة: الصفحة المفتوحة مالكة المنطقة المشتركة — مع customAction
  // يُخفى ترس المستودع ويُعرض زر الصفحة (مثل إضافة حساب) بدلاً منه.
  const hasCustom = Children.toArray(customAction).length > 0
  // ترس المستودع: boxarea2 مباشرة بعد زر اللوحة (boxarea1) — مع مستودع مفتوح
  // وخارج الرئيسية (ترسها الأصلي ظاهر) وخارج صفحة الحساب نفسها، وبلا زر سياقي.
  const repoGear = repoOpen && hideAccount && !accountPage && !hasCustom ? (
    <Tooltip content={t('appHeader.account')} position="bottom">
      <button
        type="button"
        id="btonaccount"
        name="btonaccount"
        className={MOBILE_BTN}
        aria-label={t('appHeader.account')}
        onClick={onOpenAccount}
      >
        <Settings size={18} strokeWidth={1.7} />
      </button>
    </Tooltip>
  ) : null
  // المناطق 2-4 من الأزرار السياقية (3 كحد أقصى) — الترتيب من اليسار (x=0): 1 ثم 2-4.
  const areas = Children.toArray(<>{repoGear}{customAction}</>).slice(0, 3)

  return (
    <header
      dir="rtl"
      aria-label={t('appHeader.mobileHeaderAria')}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      className="relative z-[1000] block w-full flex-none select-none bg-white/98 shadow-[0_2px_8px_#1d343008] dark:bg-[#19191cf5] border-b border-[#e8ebe7] dark:border-[#36363b] no-icon-scale"
    >
      {/* صف واحد إجباري: العنوان + مجموعة الأزرار — grid-flow-col لا يلتف أبداً لسطر ثانٍ.
          مع مستودع مفتوح: العنوان 40% والمناطق 60%. */}
      <div className={`grid min-h-[52px] w-full min-w-0 items-center gap-2 px-2.5 ${repoOpen ? 'grid-cols-[40%_60%]' : 'grid-cols-[minmax(0,1fr)_auto]'}`}>
        <div className="flex min-w-0 items-center data-mode:hidden">
          {brandChip}
        </div>
        {/* مناطق الأزرار الأربع من اليسار (x=0): 1 للوحة ثم 2-4 سياقية ثم النسخ والحساب. */}
        <div dir="ltr" className="grid grid-flow-col items-center gap-[3px] [grid-auto-columns:max-content]">
          <CommonButtonsArea
            area1={repoOpen ? panelToggle : null}
            areas={areas}
            ariaLabel={t('appHeader.panelAreasAria')}
          />
          {canCopyData && (
            <Tooltip content={isDataMode ? t('appHeader.dataModeOnTitle') : tauri ? t('appHeader.dataModeOffTitle') : t('appHeader.dataModeOffWebTitle')} position="bottom">
              <button
                type="button"
                className={`${MOBILE_BTN} android:hidden ${isDataMode ? 'bg-[#e7f1ea] text-green dark:bg-[#2c3530] dark:text-[#a5d4b9]' : ''}`}
                aria-label={t('appHeader.dataModeAria')}
                aria-pressed={isDataMode}
                onClick={() => void onToggleDataMode()}
              >
                <ClipboardCopy size={18} strokeWidth={1.7} />
              </button>
            </Tooltip>
          )}
          {!hideAccount && (
            <Tooltip content={t('appHeader.account')} position="bottom">
              <button
                type="button"
                id="btonaccount"
                name="btonaccount"
                className={MOBILE_BTN}
                aria-label={t('appHeader.account')}
                onClick={onOpenAccount}
              >
                {/* ترس الإعدادات بدل البروفايل (طلب دائم — كان أزرق للتجربة فقط) */}
                <Settings size={18} strokeWidth={1.7} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </header>
  )
}
