// هيدر الشاشات الكبيرة (ديسكتوب — 11 بوصة وما فوق).
// Mobile-First: مخفي افتراضياً، يظهر فقط عند min-width:1024px.
// يحتوي كامل كود هيدر الديسكتوب القديم مقسّماً على boxright / boxleft مناصفة.
//
// الأنماط كلها أدوات Tailwind — لا أصناف CSS. القواعد المقابلة
// (.topbar / .window-control / .repo-context* / #boxright / #boxleft)
// حُذفت من index.css. اللقطة المعتمدة محفوظة في plan/Finished/header-layout-ar.md.
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { ClipboardCopy, Minus, Pin, PinOff, Copy, Square, UserRound, X } from 'lucide-react'
import { useLanguage } from '../language/LanguageContext'
import { Tooltip } from './Tooltip'

export type DesktopWindowAction = 'minimize' | 'toggle-maximize' | 'toggle-always-on-top' | 'close'

type AppHeaderProps = {
  brandChip: ReactNode
  isDataMode: boolean
  /**
   * هل يمكن نسخ نصّ من التبويب النشط؟ إن لا، لا يظهر زر نقل البيانات نهائياً:
   * المستودع يحوي قاعدة نصية إلى جانب ملفات وصور، ووضع النقل لتضييق النافذة
   * على نص — فلا فائدة منه مع ملفات.
   */
  canCopyData: boolean
  windowMaximized: boolean
  windowAlwaysOnTop: boolean
  onOpenAccount: () => void
  onToggleDataMode: () => void
  onWindowAction: (action: DesktopWindowAction) => void
}

// أزرار النافذة الستة كانت ست نسخ من أدوات Tailwind داخل الكود؛
// فُصِّلت إلى مكوّن واحد محلي. لا حاجة لصنف CSS مقابل (.window-control حُذف).
const CTRL_BASE =
  'grid h-[60%] min-h-7 w-10 place-items-center cursor-pointer rounded border-0 bg-transparent p-0 ' +
  'text-[#485651] transition-colors duration-[120ms] ' +
  'hover:bg-[#e9eeea] hover:text-[#20322d] ' +
  'focus-visible:relative focus-visible:z-[1] focus-visible:outline-2 ' +
  'focus-visible:outline-orange focus-visible:outline-offset-[-3px] ' +
  'dark:text-[#d1d1d5] dark:hover:bg-[#36363c] dark:hover:text-[#f5f5f7] ' +
  'pointer-coarse:min-h-10 pointer-coarse:w-11'

const CTRL_PINNED = 'pinned:bg-[#e7f1ea] pinned:text-green dark:pinned:bg-[#2c3530] dark:pinned:text-[#a5d4b9]'

const CTRL_CLOSE = 'hover:bg-[#c8443c] hover:text-white dark:hover:bg-[#c8443c]'

type WindowControlProps = {
  tone?: 'pinned' | 'close'
  title: string
  label: string
  pressed?: boolean
  onClick: () => void
  children: ReactNode
  id?: string
  className?: string
}

function WindowControl({ tone, title, label, pressed, onClick, children, id, className }: WindowControlProps) {
  return (
    <Tooltip content={title}>
      <button
        type="button"
        id={id}
        className={`${CTRL_BASE} ${tone === 'pinned' ? CTRL_PINNED : ''} ${tone === 'close' ? CTRL_CLOSE : ''} ${className ?? ''}`}
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  )
}

// سحب النافذة برمجياً — data-tauri-drag-region وحده لا يكفي
// لأنه يعمل فقط على العنصر المُطبَّق عليه مباشرة وليس على أبنائه.
// مُطبَّق على القسمين معاً فيسحب المستخدم من أي فراغ في الهيدر؛
// وحارسُ العنصر يتخطّى الأزرار فلا يبدأ السحب عند الضغط عليها.
const beginWindowDrag = (event: ReactMouseEvent) => {
  if (!isTauri()) return
  if (event.buttons !== 1) return
  const target = event.target as HTMLElement | null
  if (target?.closest?.('button, a, input, select, textarea, [role="menu"], [role="menuitem"]')) return
  void import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => getCurrentWindow().startDragging().catch(() => {}))
    .catch(() => {})
}

export default function AppHeader({
  brandChip,
  isDataMode,
  canCopyData,
  windowMaximized,
  windowAlwaysOnTop,
  onOpenAccount,
  onToggleDataMode,
  onWindowAction,
}: AppHeaderProps) {
  const { t } = useLanguage()
  const tauri = isTauri()

  return (
    <header
      dir="ltr"
      aria-label={t('appHeader.desktopHeaderAria')}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      className="relative z-[1000] block min-h-[calc(52px+env(safe-area-inset-top,0px))] flex-none select-none bg-white/98 border-b border-[#e8ebe7] shadow-[0_2px_8px_#1d343008] dark:bg-[#19191cf5] dark:border-[#36363b] pdf-fullscreen:sticky pdf-fullscreen:top-0 pdf-fullscreen:z-50 no-icon-scale"
    >
      <div className="grid min-h-[52px] w-full grid-cols-2 items-stretch">
        <section
          dir="rtl"
          aria-label={t('appHeader.boxRightAria')}
          onMouseDown={beginWindowDrag}
          className="flex min-h-[52px] min-w-0 items-center justify-start gap-2.5 overflow-hidden px-2.5 whitespace-nowrap en:[direction:ltr] ar:justify-end"
        >
          <div dir="rtl" className="flex min-w-0 items-center gap-3.5 data-mode:hidden en:[direction:ltr]">
            {brandChip}
          </div>
          <div data-tauri-drag-region aria-hidden="true" className="min-w-3 flex-1 self-stretch data-mode:min-w-0 android:hidden max-[480px]:hidden" />
        </section>
        <section
          dir="ltr"
          aria-label={t('appHeader.boxLeftAria')}
          onMouseDown={beginWindowDrag}
          className="flex min-h-[52px] min-w-0 items-center justify-end overflow-hidden px-2.5 whitespace-nowrap ar:order-first ar:justify-start"
        >
          {/* ترتيب الـ DOM: حساب، نقل بيانات، فوق الكل، تصغير، تكبير، إغلاق.
              الإنكليزية تعرضه من اليسار لليمين، والعربية تنعكسه، فيصير
              الإغلاق على الحافة الخارجية والحساب ملاصقاً للمنتصف.
              مقروءاً من الإغلاق إلى الداخل (العربية): إغلاق · تكبير · تصغير ·
              فوق الكل · نقل بيانات · حساب.
              plan/Finished/header-layout-ar.md §1 و §2② و §3. */}
          <div aria-label={t('appHeader.windowControlsAria')} className="flex h-full items-center justify-end gap-0.5 ar:justify-start ar:flex-row-reverse">
            <WindowControl id="btonprofile" title={t('appHeader.account')} label={t('appHeader.account')} onClick={onOpenAccount}>
              <UserRound size={15} strokeWidth={1.7} />
            </WindowControl>
            {canCopyData && (
              <WindowControl
                tone="pinned"
                pressed={isDataMode}
                className="android:hidden"
                title={isDataMode ? t('appHeader.dataModeOnTitle') : tauri ? t('appHeader.dataModeOffTitle') : t('appHeader.dataModeOffWebTitle')}
                label={t('appHeader.dataModeAria')}
                onClick={() => void onToggleDataMode()}
              >
                <ClipboardCopy size={15} strokeWidth={1.7} />
              </WindowControl>
            )}
            {tauri && (
              <>
                <WindowControl
                  tone="pinned"
                  pressed={windowAlwaysOnTop}
                  title={windowAlwaysOnTop ? t('appHeader.pinOff') : t('appHeader.pinOn')}
                  label={windowAlwaysOnTop ? t('appHeader.pinOff') : t('appHeader.pinOn')}
                  onClick={() => void onWindowAction('toggle-always-on-top')}
                >
                  {windowAlwaysOnTop ? <PinOff size={15} strokeWidth={1.7} /> : <Pin size={15} strokeWidth={1.7} />}
                </WindowControl>
                <WindowControl title={t('appHeader.minimize')} label={t('appHeader.minimizeAria')} onClick={() => void onWindowAction('minimize')}>
                  <Minus size={15} strokeWidth={1.7} />
                </WindowControl>
                {/* أيقونة ويندوز القياسية: مربع واحد للتكبير، ومربّعان متراكبان
                    للاستعادة. (Maximize2 أسهم قُطرية، و Minimize2 مربّع صغير —
                    لا يبدوان أيقونتَي ويندوز.) */}
                <WindowControl
                  title={windowMaximized ? t('appHeader.restore') : t('appHeader.maximize')}
                  label={windowMaximized ? t('appHeader.restoreAria') : t('appHeader.maximizeAria')}
                  onClick={() => void onWindowAction('toggle-maximize')}
                >
                  {windowMaximized ? <Copy size={13} strokeWidth={1.7} /> : <Square size={13} strokeWidth={1.9} />}
                </WindowControl>
                <WindowControl tone="close" title={t('appHeader.close')} label={t('appHeader.closeAria')} onClick={() => void onWindowAction('close')}>
                  <X size={15} strokeWidth={1.8} />
                </WindowControl>
              </>
            )}
          </div>
        </section>
      </div>
    </header>
  )
}