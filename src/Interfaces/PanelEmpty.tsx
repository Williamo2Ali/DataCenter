// لوحة جانبية عامة — غلاف فقط بلا أي محتوى، تستعمله لوحات التطبيق.
//
// هذه اللوحة **مشاركة في التخطيط لا طبقة عائمة**: هي عنصر flex بجانب المحتوى
//، فتخذ مساحتها منه ولا تغطيه ولا تزحزحه. لذلك لا position:fixed ولا طبقة
// معتمة ولا نقرة خارجها — تماماً كشريط الأعمدة الجانبي في VSCode.
//
// `dismissible = false` هو الافتراضي: الانتقال بين expand و collapse يدويّ
// عبر الزر فقط، وتبقى اللوحة مفتوحة عند اختيار تبويب أو النقر على المحتوى.
//
// `dismissible = true` للوحات المؤقتة: Escape ونقرة الطبقة المعتمة تُغلقها.
//
// المطويّ يبقى مركّباً كشريط أيقونات ضيّق. مخصّص لسطح المكتب حالياً؛
// الأندرويد يبقى على السلوك القديم لأن 60px تضيّق الشاشة عليه.

import { useEffect, useState, type ReactNode } from 'react'

/** مدّة تغيّر العرض — أبطأ قصداً كما كان في سلوك الانزلاق السابق. */
const WIDTH_MS = 360

/** مدّة حركة درج الهواتف العائم — أبطأ وأنعم للدخول والخروج. */
const OVERLAY_MS = 520

type PanelEmptyProps = {
  /** false = لا شيء في DOM. */
  open: boolean
  /** شريط أيقونات ضيّق بدل العرض الكامل. */
  collapsed?: boolean
  ariaLabel: string
  /** Escape + طبقة معتمة. اتركه false للوحات دائمة. */
  dismissible?: boolean
  /** طبقة عائمة فوق المحتوى (لا تأخذ مساحة من التخطيط) مع حركة دخول/خروج. */
  overlay?: boolean
  onClose: () => void
  children: ReactNode
}

export default function PanelEmpty({
  open,
  collapsed = false,
  ariaLabel,
  dismissible = false,
  overlay = false,
  onClose,
  children,
}: PanelEmptyProps) {
  const [mounted, setMounted] = useState(open)
  // حركة الدخول للطبقة العائمة فقط: تُركَّب بعرض 0 ثم تتوسع —
  // والخروج يتم تلقائياً (العرض يعود 0 أثناء مهلة الإزالة).
  const [entered, setEntered] = useState(false)

  // نُبقي العنصر في DOM أثناء تقلّص العرض، ثم نزيله.
  // لا حالة visible ولا requestAnimationFrame: العرض يُشتق مباشرة من
  // open/collapsed، فالأزرار (state و closerepo) ظاهرة فور التركيب.
  // حركة الطي/التوسيع تبقى عبر transition-[width] في CSS.
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) return
    const timer = window.setTimeout(() => setMounted(false), overlay ? OVERLAY_MS : WIDTH_MS)
    return () => window.clearTimeout(timer)
  }, [open, mounted, overlay])

  // إطاران بين التركيب وتفعيل العرض الكامل — للطبقة العائمة فقط،
  // فيبدأ التوسع من 0 (دخول منزلق) بدل الظهور الفوري.
  useEffect(() => {
    if (!overlay || !open || !mounted) {
      setEntered(false)
      return
    }
    let inner = 0
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setEntered(true))
    })
    return () => {
      window.cancelAnimationFrame(outer)
      if (inner) window.cancelAnimationFrame(inner)
    }
  }, [overlay, open, mounted])

  // Escape — للوحات القابلة للإغلاق فقط، ولا يُطبَّق عند الطي (يحق للمستخدم
  // إبقاء الشريط على حافة الشاشة).
  useEffect(() => {
    if (!open || collapsed || !dismissible) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, collapsed, dismissible, onClose])

  if (!mounted) return null

  // العرض: 0 عند الإغلاق (أو قبل دخول الطبقة العائمة)، 60px عند الطي،
  // كامل عند التوسيع.
  const width = !open || (overlay && !entered) ? 'w-0' : collapsed ? 'w-[60px]' : 'w-[min(320px,92vw)]'
  // التعتيم يبقى مركباً أثناء الخروج ويتلاشى مع الدرج — لا يختفي فوراً،
  // وبلا التقاط لمس بعد الإغلاق.
  const scrimOpacity = open && (!overlay || entered) ? 'opacity-100' : 'opacity-0'

  return (
    <>
      {dismissible && (
        <div
          aria-hidden="true"
          onClick={onClose}
          style={overlay ? { transitionDuration: `${OVERLAY_MS}ms` } : undefined}
          className={`fixed inset-0 z-[900] bg-[#141e1c2e] transition-opacity duration-[360ms] ${scrimOpacity} ${open ? '' : 'pointer-events-none'}`}
        />
      )}
      <aside
        role="complementary"
        aria-label={ariaLabel}
        aria-hidden={!open}
        // h-full + min-h-0: صريحان عمداً. بدونهما يعتمد الارتفاع على تمدّد
        // align-itemsStretch ضمن صفّ، فيمكن أن يسبق محتوى اللوحة ارتفاع
        // النافذة ويُقصّ التذييل عند حافة الشاشة السفلية.
        // overlay: مطلقة ضمن صف المحتوى (بين الهيدر والشريط السفلي —
        // لا تغطيهما ولا تأخذ مساحة من التخطيط)، وفوق طبقة التعتيم
        // حتى تصلها الضغطات. مدّة حركتها أبطأ (OVERLAY_MS).
        style={overlay ? { transitionDuration: `${OVERLAY_MS}ms` } : undefined}
        className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-s border-line bg-paper transition-[width] duration-[360ms] ease-[cubic-bezier(0.22,0.68,0.32,1)] ${width} ${overlay ? 'absolute inset-y-0 end-0 z-[901]' : ''}`}
      >
        {/* overlay: المحتوى بعرض ثابت يساوي العرض الكامل — أثناء حركة العرض
            يُقصّ فقط ولا يُعاد تخطيطه، فلا تتشابك العناصر فوق بعضها. */}
        {overlay ? (
          <div className="flex h-full min-h-0 w-[min(320px,92vw)] flex-col overflow-hidden">
            {children}
          </div>
        ) : (
          children
        )}
      </aside>
    </>
  )
}