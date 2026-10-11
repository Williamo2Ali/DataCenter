import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { PanelRight } from 'lucide-react'
import ModalCreateRepos from '../modals/ModalCreateRepos'
import AppHeader from '../components/AppHeader'
import AppHeaderMobile, { MOBILE_BTN } from '../components/AppHeaderMobile'
import AppMobileBottomNavBar from '../components/AppMobileBottomNavBar'
import PanelEmpty from '../Interfaces/PanelEmpty'
import PanelRepoTabsViewer from '../Interfaces/PanelRepoTabsViewer'
import PanelRepoTabsViewerMob from '../Interfaces/PanelRepoTabsViewerMob'
import type { RepoData, RepoMeta } from '../repos/repoService'
import { visibleTabs } from '../repos/repoService'
import { usePlatform, isAndroidPlatform } from '../lib/platform'
import { useLanguage } from '../language/LanguageContext'
import { Tooltip } from "../components/Tooltip"

// الصفحة الأم: الحاوية الأساسية للتطبيق — الهيدر + درج التبويبات +
// المحتوى + المودالات. كل ما يخص التخطيط والهوامش والألوان هنا،
// وApp يبقى مخزن حالة ومنطق فقط.

export type PageName = 'home' | 'repo' | 'account' | 'prompt' | 'peoples' | 'search'

export type WindowAction = 'minimize' | 'toggle-maximize' | 'toggle-always-on-top' | 'close'

type PageMotherProps = {
  page: PageName
  repo: RepoData | null
  activeSection: string
  closedTabIds: string[]
  tabsQuery: string
  isDataMode: boolean
  /** هل في التبويب النشط نصّ قابل للنسخ؟ يتحكّم بظهور زر نقل البيانات. */
  canCopyData: boolean
  windowMaximized: boolean
  windowAlwaysOnTop: boolean
  isCreateModalOpen: boolean
  setPage: (page: PageName) => void
  setActiveSection: (section: string) => void
  setTabsQuery: (query: string) => void
  setIsCreateModalOpen: (open: boolean) => void
  openTab: (id: string) => void
  closeTab: (id: string) => void
  /** إغلاق كل التبويبات المفتوحة دفعة واحدة (درج الهواتف فقط). */
  closeAllTabs: () => void
  toggleDataMode: () => void
  handleWindowAction: (action: WindowAction) => void
  handleCloseRepo: () => void
  handleCreateRepoFromModal: (meta: RepoMeta, password?: string) => void
  /** الانتقال لصفحة الأشخاص (أشخاص المستودع الحالي). */
  onOpenPeoples: () => void
  /** إغلاق تبويب الأشخاص كغيره من التبويبات. */
  onClosePeoples: () => void
  /** الانتقال لإعدادات التبويبات لتعبئة اسم إنكليزي ناقص. */
  onEditTabTitle: (tabId: string) => void
  /** اللوحة مطويّة إلى شريط أيقونات بدل إزالتها. */
  tabsPanelCollapsed: boolean
  setTabsPanelCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void
  /** درج تبويبات الهواتف (<640px) — طبقة عائمة تُفتح من الشريط السفلي. */
  mobileTabsOpen: boolean
  setMobileTabsOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  /** زر سياقي لمنطقة هيدر الموبايل المخصصة (بجانب الحساب) — تحدده الصفحة النشطة. */
  mobileHeaderAction?: ReactNode
  /** الشريط السفلي: الرئيسية (تُصفّي المفضلة) والمفضلة. */
  onGoHome: () => void
  onOpenFavorites: () => void
  /** عرض المفضلة فقط نشط؟ */
  favOnlyActive: boolean
  /** إخفاء زر لوحة الموبايل (منطقة 1) — أثناء معاينة ملف مثلاً. */
  hidePanelToggle?: boolean
  /** إخفاء الشريط السفلي للموبايل — يستبدله شريط مصغرات معاينة الصور. */
  hideBottomNav?: boolean
  children: ReactNode
}

export default function PageMother({
  page,
  repo,
  activeSection,
  closedTabIds,
  tabsQuery,
  isDataMode,
    canCopyData,
  windowMaximized,
  windowAlwaysOnTop,
  isCreateModalOpen,
  setPage,
  setTabsQuery,
  setIsCreateModalOpen,
  openTab,
  closeTab,
  closeAllTabs,
  toggleDataMode,
  handleWindowAction,
  handleCloseRepo,
  handleCreateRepoFromModal,
  onOpenPeoples,
  onClosePeoples,
  onEditTabTitle,
  tabsPanelCollapsed,
  setTabsPanelCollapsed,
  mobileTabsOpen,
  setMobileTabsOpen,
  mobileHeaderAction,
  onGoHome,
  onOpenFavorites,
  favOnlyActive,
  hidePanelToggle,
  hideBottomNav,
  children,
}: PageMotherProps) {
  // المنصة: windows / linux (ديسكتوب) أو android (موبايل/تابلت) — وهي وحدها
  // تحدد أي هيدر يُركَّب (لا حجم الشاشة). تُكتشف مرة واحدة وتوضع على
  // documentElement.dataset.platform ليستخدمها CSS.
  const platform = usePlatform()
  const useMobileHeader = isAndroidPlatform(platform)
  const { t } = useLanguage()

  // زر Back بأسلوب المتصفح: فتح الدرج يدفع history، وإغلاقه (X/تعتيم/
  // اختيار تبويب) يرجع خطوة — فالضغطة الأولى تُغلق الدرج ولا تخرج من التطبيق.
  // تنقل معلق حتى يكتمل رجوع الدرج: يُنفَّذ داخل معالج pop حصراً (بعد اكتمال
  // الرجوع strictly) — فالترتيب مضمون [..., repo, peoples] ولا pop متأخر يبتلع
  // الصفحة (الخلل: وميض الأشخاص ثانية ثم عودة للاستقبال — سباق setTimeout مع pop).
  const pendingNav = useRef<null | (() => void)>(null)
  useEffect(() => {
    if (!mobileTabsOpen) return
    window.history.pushState({ mobileTabs: true }, '')
    const onPopState = () => {
      setMobileTabsOpen(false)
      const nav = pendingNav.current
      pendingNav.current = null
      if (nav) nav()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [mobileTabsOpen, setMobileTabsOpen])

  // إدخال الدرج على القمة؟ — يقرر: رجوع حقيقي أم إغلاق مباشر + تنقل فوري.
  const isDrawerEntryOnTop = () => {
    try {
      return !!(window.history.state && (window.history.state as { mobileTabs?: boolean }).mobileTabs)
    } catch {
      return false
    }
  }

  // إغلاق الدرج مع تنظيف المكدس حتى لا تتراكم إدخالات فارغة.
  const closeMobileTabs = () => {
    if (window.history.state && (window.history.state as { mobileTabs?: boolean }).mobileTabs) {
      window.history.back()
    } else {
      setMobileTabsOpen(false)
    }
  }

  // اختيار تبويب من الدرج: علّق التنقل ثم ارجع — معالج pop يغلق الدرج
  // وينفّذ المعلق بالترتيب. بلا إدخال درج (حالة حدّية) تنقل فوري مباشر.
  const openMobileTab = (id: string) => {
    if (isDrawerEntryOnTop()) {
      pendingNav.current = () => openTab(id)
      window.history.back()
    } else {
      setMobileTabsOpen(false)
      openTab(id)
    }
  }

  const openMobilePeoples = () => {
    if (isDrawerEntryOnTop()) {
      pendingNav.current = () => onOpenPeoples()
      window.history.back()
    } else {
      setMobileTabsOpen(false)
      onOpenPeoples()
    }
  }

  // تبويبات الدرج بعد الفلترة تنتقل إلى PanelRepoTabsViewer.

  const brandChip = (
    <span className="brand-chip">
      <img src={`${import.meta.env.BASE_URL || '/'}tabs/${encodeURIComponent('Database.png')}`} alt="" aria-hidden="true" draggable={false} width={22} height={22} className="object-contain" />
      <span>{t('pageMother.brandChipName')}</span>
      {repo && (
        <>
          {/* الشرطة عنصر flex مستقل (لا يخضع لخوارزمية bidi النصية)،
              واسم المستودع معزول بـ bdi — فيبقى الترتيب: العلامة - الاسم
              مهما كانت لغة الطرفين أو اتجاه الصفحة. */}
          <span aria-hidden="true" className="text-text-muted">-</span>
          <bdi dir="auto" className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-normal text-text-muted">{repo.meta.name}</bdi>
        </>
      )}
    </span>
  )

  // المنطقة 1 بهيدر الموبايل (أقصى اليسار): Toggle للوحة — سحب/طي حسب حالتها.
  // هواتف (<640px): درج الهواتف العائم. أكبر (تابلت): طي/توسيع اللوحة الجانبية.
  // يظهر مع مستودع مفتوح فقط، بدل زر التبويبات في الشريط السفلي.
  const isSmallScreen = () => window.matchMedia('(max-width: 639px)').matches
  const panelPressed = isSmallScreen() ? mobileTabsOpen : !tabsPanelCollapsed
  const panelToggle = (
    <Tooltip content={t('mobileNav.tabsBtn')}>
    <button
      type="button"
      className={`${MOBILE_BTN} ${panelPressed ? 'bg-[#e7f1ea] text-green dark:bg-[#2c3530] dark:text-[#a5d4b9]' : ''}`}
      aria-label={t('mobileNav.tabsBtn')}
      aria-pressed={panelPressed}
      onClick={() => {
        if (isSmallScreen()) {
          setTabsQuery('')
          setMobileTabsOpen((prev) => !prev)
        } else {
          setTabsPanelCollapsed((prev) => !prev)
        }
      }}
    >
      <PanelRight size={19} strokeWidth={1.7} />
    </button>
    </Tooltip>
  )

  // نسخة الموبايل: مع مستودع مفتوح — الأيقونة + اسم المستودع فقط (بلا اسم التطبيق)
  // حفاظاً على مساحة المناطق الأربع (40% عنوان / 60% أزرار). الديسكتوب untouched.
  const brandChipMobile = repo ? (
    <span className="brand-chip">
      <img src={`${import.meta.env.BASE_URL || '/'}tabs/${encodeURIComponent('Database.png')}`} alt="" aria-hidden="true" draggable={false} width={22} height={22} className="object-contain" />
      <bdi dir="auto" className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold">{repo.meta.name}</bdi>
    </span>
  ) : brandChip

  return (
    <div className="app-shell">
      {/* الهيدر حسب المنصة حصراً: أندرويد → موبايل، وغيره → ديسكتوب. */}
      {useMobileHeader ? (
      <AppHeaderMobile
        brandChip={brandChipMobile}
        isDataMode={isDataMode}
        canCopyData={canCopyData}
        onOpenAccount={() => setPage('account')}
        onToggleDataMode={() => void toggleDataMode()}
        customAction={mobileHeaderAction}
        repoOpen={repo !== null}
        accountPage={page === 'account'}
        // القاعدة: الشاشة الظاهرة حالياً تملك المناطق وحدها —
        // زر اللوحة (منطقة 1) لصفحتي المستودع والأشخاص، وزر الحساب مخفي خارج الرئيسية.
        // يُخفى زر اللوحة أثناء معاينة ملف (صفحة فارغة بأزرارها الخاصة).
        panelToggle={(page === 'repo' || page === 'peoples') && !hidePanelToggle ? panelToggle : null}
        hideAccount={page !== 'home'}
      />
      ) : (
      <AppHeader
        brandChip={brandChip}
        isDataMode={isDataMode}
        canCopyData={canCopyData}
        windowMaximized={windowMaximized}
        windowAlwaysOnTop={windowAlwaysOnTop}
        onOpenAccount={() => setPage('account')}
        onToggleDataMode={() => void toggleDataMode()}
        onWindowAction={(action) => void handleWindowAction(action)}
      />
      )}

      {/* المحتوى واللوحة صفّ flex واحد: اللوحة تأخذ مساحتها من هنا ولا تغطيه.
          ترتيبها بعد <main> يعني أنها على اليمين في LTR وعلى اليسار في RTL،
          بلا أي قاعدة جهة. relative: مرجع درج الهواتف المطلق. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <main className="page-content" id="home">
          <div className="page-scroll-inner">
            {children}
            <div className="page-bottom-space" aria-hidden="true" />
          </div>
        </main>

        {repo && (
          <div className="hidden sm:contents">
          <PanelEmpty
            open
            collapsed={tabsPanelCollapsed}
            ariaLabel={tabsPanelCollapsed ? t('pageMother.railPanelAria') : t('pageMother.tabsPanelAria')}
            onClose={() => {}}
          >
            <PanelRepoTabsViewer
              tabs={visibleTabs(repo.tabs)}
              activeSection={activeSection}
              closedTabIds={closedTabIds}
              query={tabsQuery}
              collapsed={tabsPanelCollapsed}
              onQueryChange={setTabsQuery}
              onOpenTab={openTab}
              onCloseTab={closeTab}
              onEditTabTitle={onEditTabTitle}
              onCloseRepo={handleCloseRepo}
              onCollapse={() => setTabsPanelCollapsed((prev) => !prev)}
              onOpenPeoples={onOpenPeoples}
              onClosePeoples={onClosePeoples}
              peoplesActive={page === 'peoples'}
            />
          </PanelEmpty>
          </div>
        )}

        {/* درج تبويبات الهواتف — نسخة الموبايل المستقلة داخل طبقة عائمة
            محصورة بين الهيدر والشريط السفلي.
            يُركَّب دائماً مع open={mobileTabsOpen} حتى تعمل حركة الخروج —
            فالإزالة المشروطة كانت تقتله فوراً بلا أنيميشن. */}
        {repo && (
          <PanelEmpty
            open={mobileTabsOpen}
            dismissible
            overlay
            ariaLabel={t('pageMother.tabsPanelAria')}
            onClose={closeMobileTabs}
          >
            <PanelRepoTabsViewerMob
              tabs={visibleTabs(repo.tabs)}
              activeSection={activeSection}
              closedTabIds={closedTabIds}
              query={tabsQuery}
              onQueryChange={setTabsQuery}
              onOpenTab={openMobileTab}
              onCloseTab={closeTab}
              onEditTabTitle={onEditTabTitle}
              onCloseRepo={handleCloseRepo}
              onClose={closeMobileTabs}
              onCloseAllTabs={closeAllTabs}
              onOpenPeoples={openMobilePeoples}
              onClosePeoples={onClosePeoples}
              peoplesActive={page === 'peoples'}
            />
          </PanelEmpty>
        )}
      </div>

      {/* الشريط السفلي للهواتف فقط (أقل من 640px) — يُخفى أثناء معاينة الصور. */}
      {!hideBottomNav && (
      <AppMobileBottomNavBar
        page={page}
        onGoHome={onGoHome}
        onOpenPrompt={() => setPage('prompt')}
        onOpenSearch={() => setPage('search')}
        onOpenFavorites={onOpenFavorites}
        favOnlyActive={favOnlyActive}
      />
      )}

      <ModalCreateRepos
        isOpen={isCreateModalOpen}
        onClose={() => {
          // تنظيف المكدس كالدرج: إغلاق بزر X يرجع خطوة إن كان الإدخال العلوي لنا.
          try {
            if (window.history.state && (window.history.state as { createModal?: boolean }).createModal) {
              window.history.back()
              return
            }
          } catch {
            return
          }
          setIsCreateModalOpen(false)
        }}
        onCreated={handleCreateRepoFromModal}
      />
    </div>
  )
}

