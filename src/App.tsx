import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { availableMonitors, currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window'
import PageHome from './pages/PageHome'
import PageSettingsView, { type AccountTab } from './settings/PageSettingsView'
import PagePromptView from './pages/PagePromptView'
import PageGlobalSearch from './pages/PageGlobalSearch'
import PageTablePeople from './pages-tables/PageTablePeople'
import PageRepoViewer from './pages/PageRepoViewer'
import PageMother, { type PageName, type WindowAction } from './pages/PageMother'
import { openRepo, closeRepo, readAppSettings, saveAppSettings, type AppSettingsJson, type RepoData, type RepoMeta } from './repos/repoService'
import { defaultSettings, type AppSettings } from './lib/appSettings'
import { loadProfileFile, patchProfileGeneral, type ProfileGeneral } from './lib/profileStore'
import { LanguageProvider } from './language/LanguageContext'
import { ToastProvider, createToastTheme, type ToastPosition } from 'react-theme-toast'
import { hasCopyableData } from './lib/dataMode'

const LEGACY_SETTINGS_KEY = 'family-passport-settings'
const windowGeometryStorageKey = 'family-passport-window-geometry'

/**
 * ثيم الإشعارات — مربوط بمتغيّرات CSS للتطبيق (`--paper/--ink/--muted/--line/--green`)
 * لا بقيم لونية ثابتة، فيتبع تبديل الفاتح/الداكن دون تمرير أي لون مرتين.
 * مكتبة `react-theme-toast` تحقن أنماطها (`.rt-*`) في `document.head` تلقائياً.
 */
const toastTheme = createToastTheme({
  background: 'var(--paper)',
  text: 'var(--ink)',
  textMuted: 'var(--muted)',
  border: 'var(--line)',
  success: 'var(--green)',
  error: '#c8443c',
  info: 'var(--orange)',
  radius: '8px',
  shadow: '0 10px 26px rgba(20,32,28,.18)',
})

type SavedWindowGeometry = {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

/** تحويل إعدادات الملف (JSON) إلى نوع التطبيق الداخلي. */
function fromFileSettings(file: AppSettingsJson): AppSettings {
  const sort = file.repoSort
  return {
    fontSize: file.fontSize,
    inputFontSize: file.inputFontSize,
    buttonFontSize: file.buttonFontSize,
    buttonIconSize: file.buttonIconSize,
    fontFamily: file.fontFamily,
    displayZoom: file.displayZoom,
    fieldLang: file.fieldLang === 'en' ? 'en' : 'ar',
    repoSort: sort === 'newest' || sort === 'nameAsc' || sort === 'nameDesc' || sort === 'lastUsed' || sort === 'mostUsed' || sort === 'favorites' ? sort : 'oldest',
    docCategories: file.docCategories,
    driveFolderName: file.driveFolderName?.trim() ? file.driveFolderName : defaultSettings.driveFolderName,
    driveFolderId: file.driveFolderId ?? '',
  }
}

/** تحويل إعدادات التطبيق إلى شكل الملف. */
function toFileSettings(settings: AppSettings): AppSettingsJson {
  return {
    fontSize: settings.fontSize,
    inputFontSize: settings.inputFontSize,
    buttonFontSize: settings.buttonFontSize,
    buttonIconSize: settings.buttonIconSize,
    fontFamily: settings.fontFamily,
    displayZoom: settings.displayZoom,
    fieldLang: settings.fieldLang,
    repoSort: settings.repoSort,
    docCategories: settings.docCategories,
    driveFolderName: settings.driveFolderName,
    driveFolderId: settings.driveFolderId,
  }
}

export default function App() {
  const [page, setPage] = useState<PageName>('home')
  const [activeSection, setActiveSection] = useState<string>('passports')
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [settingsReady, setSettingsReady] = useState(false)
  // القيم العامة (اللغة والمظهر) تعيش في ملف البروفايل — الافتراضي عربية/فاتح.
  const [general, setGeneral] = useState<ProfileGeneral>({ language: 'ar', theme: 'light' })
  const [profileReady, setProfileReady] = useState(false)
  const [repo, setRepo] = useState<RepoData | null>(null)
  // كلمة مرور المستودع المفتوح — في الذاكرة فقط، تُمسح عند الإغلاق.
  // تُمرر لعمليات التحرير (تتطلبها المستودعات المقفلة) دون إعادة فتح.
  const [repoPassword, setRepoPassword] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [activeMemberId, setActiveMemberId] = useState('')
  const [closedTabIds, setClosedTabIds] = useState<string[]>([])
  const [tabsPanelCollapsed, setTabsPanelCollapsed] = useState(true)
  const [mobileTabsOpen, setMobileTabsOpen] = useState(false)
  const [tabsQuery, setTabsQuery] = useState('')
  // زر هيدر الموبايل السياقي (المنطقة المخصصة بجانب الحساب) — تحدده الصفحة النشطة.
  const [mobileHeaderAction, setMobileHeaderAction] = useState<ReactNode>(null)
  /** معاينة ملف مفتوحة؟ (تُخفي زر لوحة الموبايل أثناءها). */
  const [filesPreviewOpen, setFilesPreviewOpen] = useState(false)
  /** إخفاء الشريط السفلي للموبايل (يُستبدَل بشريط مصغرات معاينة الصور). */
  const [hideBottomNav, setHideBottomNav] = useState(false)
  // وجهة دعوة «اضغط هنا لكتابة الاسم بالإنجليزية»: التبويب المفتوح + الحقل المُركَّز عليه.
  // + قفزة العارض لإدارة جدول: manageTabId يفتح إدارة ذلك الجدول مباشرة.
  const [accountEntry, setAccountEntry] = useState<{ tab: AccountTab; focusTabId?: string; manageTabId?: string } | null>(null)

  /** إغلاق صفحة الحساب — يعود للمستودع إن كان مفتوحاً. مستقر الهوية بين renders (يتغير مع المستودع فقط). */
  const closeAccountPage = useCallback(() => {
    setAccountEntry(null)
    setPage(repo ? 'repo' : 'home')
  }, [repo])
  const [isDataMode, setIsDataMode] = useState(false)

  // موضع التوست متجاوب: أعلى-المنتصف للهواتف والشاشات حتى المتوسطة،
  // والزاوية العليا لبداية السطر (top-start = اليمين في RTL) للشاشات الكبيرة.
  const pickToastPosition = (): ToastPosition =>
    window.matchMedia('(min-width: 1024px)').matches ? 'top-start' : 'top-center'
  const [toastPosition, setToastPosition] = useState<ToastPosition>(() => pickToastPosition())
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => setToastPosition(mq.matches ? 'top-start' : 'top-center')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  const [windowMaximized, setWindowMaximized] = useState(false)
  const [windowAlwaysOnTop, setWindowAlwaysOnTop] = useState(false)

  // تركيب اللوحة/الحركة/إزالتها بعد الخروج كلها داخل PanelEmpty —
// هنا نحتفظ بالنيّتين فقط: مفتوحة؟ مطويّة؟

  const closedTabsKey = (repoId: string) => `repo-closed-tabs:${repoId}`

  // زر الرجوع في أندرويد بأسلوب المتصفح: أول تحميل يثبّت إدخال القاعدة،
  // وكل انتقال صفحة يدفع إدخالاً — فالرجوع يتنقل داخل التطبيق ولا يخرج منه
  // إلا من الصفحة الرئيسية (نفس نمط درج تبويبات الموبايل في PageMother).
  const firstPageRef = useRef(true)
  useEffect(() => {
    try {
      const current = window.history.state as { appPage?: unknown } | null
      if (firstPageRef.current) {
        firstPageRef.current = false
        if (!current || typeof current.appPage === 'undefined') {
          window.history.replaceState({ appPage: 'home' }, '')
          return
        }
        // إعادة تركيب (StrictMode) فوق إدخال موجود — بلا دفع مكرر.
        if (current.appPage === page) return
      }
      window.history.pushState({ appPage: page }, '')
    } catch {
      return
    }
  }, [page])

  // الرجوع لإدخال صفحة يعرضها — الإدخالات غير المعروفة (نوافذ/درج) تُتجاهَل
  // هنا لأن أصحابها يملكون مستمعيهم (إغلاق الدرج/النافذة فقط).
  useEffect(() => {
    const pages: PageName[] = ['home', 'repo', 'peoples', 'prompt', 'account', 'search']
    const onPopState = (e: PopStateEvent) => {
      const next = (e.state as { appPage?: unknown } | null)?.appPage
      if (typeof next === 'string' && (pages as string[]).includes(next)) {
        setPage(next as PageName)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // نافذة إنشاء مستودع (من الهيدر): تستهلك ضغطة رجوع أولى بدل تغيير الصفحة خلفها.
  useEffect(() => {
    if (!isCreateModalOpen) return
    try {
      window.history.pushState({ createModal: true }, '')
    } catch {
      return
    }
    const onPopState = () => setIsCreateModalOpen(false)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isCreateModalOpen])

  // إغلاق نافذة الإنشاء مع تنظيف المكدس حتى لا تتراكم إدخالات فارغة.
  const closeCreateModal = () => {
    try {
      if (window.history.state && (window.history.state as { createModal?: boolean }).createModal) {
        window.history.back()
        return
      }
    } catch {
      return
    }
    setIsCreateModalOpen(false)
  }

  // الرئيسية + فلتر المفضلة (زرا الشريط السفلي): الهوم يعرض الكل، والنجمة تبدّل عرض المفضلة.
  const [favOnly, setFavOnly] = useState(false)
  const goHome = () => {
    setFavOnly(false)
    setPage('home')
  }
  const openFavorites = () => {
    if (page === 'home' && favOnly) {
      setFavOnly(false)
      return
    }
    setFavOnly(true)
    setPage('home')
  }

  // ==================== Repository Management ====================
  const handleOpenRepo = async (repoMeta: RepoMeta, password?: string) => {
    const id = repoMeta.id
    try {
      const data = await openRepo(id, password)
      setRepo(data)
      let closed: string[] = []
      let hasSavedState = false
      try {
        const raw = localStorage.getItem(closedTabsKey(data.meta.id))
        if (raw) {
          hasSavedState = true
          const parsed: unknown = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            closed = parsed.filter((entry): entry is string =>
              typeof entry === 'string' && (entry === 'peoples' || data.tabs.some((tab) => tab.id === entry)))
          }
        }
      } catch {
        closed = []
      }
      // مستودع يُفتح لأول مرة (لا حالة محفوظة): كل التبويبات مغلقة —
      // المستخدم يفتح ما يحتاجه فقط من درج التبويبات.
      if (!hasSavedState) {
        closed = [...data.tabs.map((tab) => tab.id), 'peoples']
      }
      setClosedTabIds(closed)
      setActiveMemberId(data.peoples[0]?.id ?? '')
      setActiveSection(data.tabs.find((tab) => !tab.isHidden && !tab.isDeleted && !closed.includes(tab.id))?.id ?? '__empty__')
      setTabsQuery('')
      // اللوحة دائمة الظهور عند وجود مستودع وتبدأ مطوية (rail) —
      // التبديل expand/collapse من زر state داخلها فقط.
      setTabsPanelCollapsed(true)
      setRepoPassword(password ?? null)
      setPage('repo')
    } catch (error) {
      console.error('Failed to open repo:', error)
    }
  }

  const handleCreateRepoFromModal = async (meta: RepoMeta, password?: string) => {
    closeCreateModal()
    await handleOpenRepo(meta, password)
  }

  const handleRepoUpdated = (data: RepoData) => {
    setRepo(data)
    // إن حُذف العضو النشط، انتقل لأول سجل متاح
    setActiveMemberId((prev) => (data.peoples.some((r) => r.id === prev) ? prev : (data.peoples[0]?.id ?? '')))
  }

  const handleCloseRepo = async () => {
    setMobileTabsOpen(false)
    // إسقاط جلسة الذاكرة الخلفية أولاً (الأفضل جهداً — القرص محفوظ أصلاً).
    if (repo) {
      try {
        await closeRepo(repo.meta.id)
      } catch {
        // يُتابَع الإغلاق المحلي مهما حدث.
      }
    }
    if (window.history.state && (window.history.state as { mobileTabs?: boolean }).mobileTabs) {
      window.history.back()
    }
    // إغلاق كل التبويبات أولاً (وحفظ الحالة) ثم إغلاق المستودع —
    // وإلا بقيت المفتوحة محفوظة في localStorage وعادت عند إعادة الفتح
    // (تأثير الحفظ يتخطى repo=null فلا يكفي setClosedTabIds وحده).
    if (repo) {
      const allClosed = [...repo.tabs.map((tab) => tab.id), 'peoples']
      setClosedTabIds(allClosed)
      try {
        localStorage.setItem(closedTabsKey(repo.meta.id), JSON.stringify(allClosed))
      } catch {
        // التخزين محظور/ممتلئ — الإغلاق يمضي والحالة الافتراضية عند الفتح.
      }
    }
    setRepo(null)
    setRepoPassword(null)
    setActiveMemberId('')
    setTabsPanelCollapsed(true)
    setActiveSection('passports')
    setPage('home')
  }

  // ==================== Tab Management ====================
  // Escape للإغلاق يعيش داخل PanelEmpty الآن (يتخطّى وضع الطي).

  // حفظ التبويبات المغلقة لكل مستودع + تصحيح القسم النشط إن أُغلق
  useEffect(() => {
    if (!repo) return
    try {
      localStorage.setItem(closedTabsKey(repo.meta.id), JSON.stringify(closedTabIds))
    } catch {
      return
    }
    const activeHidden = repo.tabs.some((tab) => tab.id === activeSection && (tab.isHidden || tab.isDeleted))
    if ((!['vault', 'settings'].includes(activeSection) && closedTabIds.includes(activeSection)) || activeHidden) {
      const first = repo.tabs.find((tab) => !tab.isHidden && !tab.isDeleted && !closedTabIds.includes(tab.id))
      setActiveSection(first ? first.id : '__empty__')
    }
  }, [closedTabIds, repo, activeSection])

  const closeTab = (id: string) => {
    setClosedTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  // إغلاق كل التبويبات المفتوحة دفعة واحدة (درج الهواتف) — تأثير
  // closedTabIds القائم ينقل النشط تلقائياً لأول مفتوح أو لصفحة الاستقبال.
  // واللوحة تُطوى كما بعد إغلاق المستودع.
  const closeAllTabs = () => {
    if (!repo) return
    setClosedTabIds((prev) => {
      const ids = new Set(prev)
      for (const tab of repo.tabs) ids.add(tab.id)
      ids.add('peoples')
      return [...ids]
    })
    setTabsPanelCollapsed(true)
    if (page === 'peoples') setPage('repo')
  }

  const openTab = (id: string) => {
    setClosedTabIds((prev) => prev.filter((tabId) => tabId !== id))
    switchSection(id)
    // فتح تبويب من الدرج/اللوحة (خصوصاً من صفحة الرئيسية على الهواتف)
    // يجب أن يعرض محتواه — أي ينقل لصفحة المستودع، وإلا لا يظهر شيء.
    setPage('repo')
  }

  // تبويب الأشخاص الاصطناعي (صفحة لا قسم): فتحه يزيله من المغلقة وينقل لصفحته.
  const openPeoples = () => {
    setClosedTabIds((prev) => prev.filter((tabId) => tabId !== 'peoples'))
    setPage('peoples')
  }

  // إغلاق تبويب الأشخاص كغيره — وإن كنا عليه نعود لصفحة المستودع (أو الرئيسية).
  const closePeoples = () => {
    setClosedTabIds((prev) => (prev.includes('peoples') ? prev : [...prev, 'peoples']))
    if (page === 'peoples') setPage(repo ? 'repo' : 'home')
  }

  // ==================== Data Mode ====================
  const preDataModeGeometryRef = useRef<{ width: number; height: number; alwaysOnTop: boolean; maximized: boolean } | null>(null)

  // الزر يظهر فقط حين يكون التبويب النشط فيه نص قابل للنسخ. تبويبات
  // الملفات والصور بلا حقول، فلا نصّ فيها — ويختفي الزر.
  const canCopyData = hasCopyableData(repo, activeSection, activeMemberId)

  useEffect(() => {
    document.body.classList.toggle('is-data-mode', isDataMode)
    // التبويب النشط يجب أن يكون مفتوحاً في وضع النقل (قد يكون محشوراً سابقاً).
    if (isDataMode && activeSection) setClosedTabIds((prev) => prev.filter((id) => id !== activeSection))
    return () => document.body.classList.remove('is-data-mode')
  }, [isDataMode, activeSection])

  // فقدان النصّ يخرج من الوضع تلقائياً — لا زر يمكن الضغط عليه بعد الآن.
  useEffect(() => {
    if (isDataMode && !canCopyData) void restoreWindowFromDataMode()
  }, [isDataMode, canCopyData])

  const switchSection = (section: string) => {
    if (isDataMode && !hasCopyableData(repo, section, activeMemberId)) setIsDataMode(false)
    setActiveSection(section)
  }

  const restoreWindowFromDataMode = async () => {
    setIsDataMode(false)
    if (!isTauri()) return
    try {
      const appWindow = getCurrentWindow()
      const saved = preDataModeGeometryRef.current
      preDataModeGeometryRef.current = null
      if (saved?.maximized) {
        await appWindow.maximize().catch(() => {})
        setWindowMaximized(true)
      } else if (saved) {
        await appWindow.setSize(new LogicalSize(saved.width, saved.height)).catch(() => {})
      } else {
        await appWindow.setSize(new LogicalSize(1200, 800)).catch(() => {})
      }
      if (saved && !saved.alwaysOnTop) {
        await appWindow.setAlwaysOnTop(false).catch(() => {})
        setWindowAlwaysOnTop(false)
      }
    } catch {
      return
    }
  }

  const toggleDataMode = async () => {
    const next = !isDataMode
    setIsDataMode(next)
    if (!isTauri()) return
    try {
      const appWindow = getCurrentWindow()
      if (next) {
        try {
          const [size, alwaysOnTop, maximized] = await Promise.all([
            appWindow.innerSize(),
            appWindow.isAlwaysOnTop().catch(() => false),
            appWindow.isMaximized().catch(() => false),
          ])
          const factor = await appWindow.scaleFactor().catch(() => 1)
          const safeFactor = factor && factor > 0 ? factor : 1
          preDataModeGeometryRef.current = {
            width: Math.round(size.width / safeFactor),
            height: Math.round(size.height / safeFactor),
            alwaysOnTop,
            maximized,
          }
          if (maximized) {
            await appWindow.unmaximize().catch(() => {})
            setWindowMaximized(false)
          }
        } catch {
          preDataModeGeometryRef.current = null
        }
        await appWindow.setSize(new LogicalSize(380, 760)).catch(() => {})
        const alreadyOnTop = preDataModeGeometryRef.current?.alwaysOnTop ?? await appWindow.isAlwaysOnTop().catch(() => false)
        if (!alreadyOnTop) {
          await appWindow.setAlwaysOnTop(true).catch(() => {})
          setWindowAlwaysOnTop(true)
        }
      } else {
        await restoreWindowFromDataMode()
      }
    } catch {
      return
    }
  }

  // ==================== Window Title ====================
  // عنوان النافذة وشريط المهام: DataCenter، ومع المستودع المفتوح
  // يلحق به اسمه (DataCenter - اسم المستودع).
  useEffect(() => {
    const title = repo ? `DataCenter - ${repo.meta.name}` : 'DataCenter'
    document.title = title
    if (!isTauri()) return
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title).catch(() => {}))
      .catch(() => {})
  }, [repo])

  // ==================== Settings Load (once) ====================
  // التحميل مرة واحدة عند الإقلاع + ترحيل المفتاح القديم لمرة واحدة ثم حذفه.
  // لا localStorage للإعدادات إطلاقاً — الملف هو المصدر الوحيد.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY)
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy) as AppSettingsJson
            const saved = await saveAppSettings(parsed)
            if (!cancelled) setSettings(fromFileSettings(saved))
          } catch {
            if (!cancelled) setSettings(fromFileSettings(await readAppSettings()))
          } finally {
            try {
              localStorage.removeItem(LEGACY_SETTINGS_KEY)
            } catch {
              return
            }
          }
        } else {
          const file = await readAppSettings()
          if (!cancelled) setSettings(fromFileSettings(file))
        }
      } catch {
        if (!cancelled) setSettings(defaultSettings)
      } finally {
        if (!cancelled) setSettingsReady(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // ==================== General Load (once) ====================
  // اللغة والمظهر من ملف البروفايل — قبل اكتمالهما تبقى شاشة الانتظار.
  useEffect(() => {
    let cancelled = false
    void loadProfileFile().then(
      (p) => {
        if (!cancelled) {
          setGeneral({ language: p.language, theme: p.theme })
          setProfileReady(true)
        }
      },
      () => {
        if (!cancelled) setProfileReady(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // تغيير اللغة/المظهر من تبويب عام: تحديث فوري + حفظ في الملف بصمت.
  const handleGeneralChange = (patch: Partial<ProfileGeneral>) => {
    setGeneral((prev) => ({ ...prev, ...patch }))
    void patchProfileGeneral(patch).then(
      (saved) => setGeneral(saved),
      () => {},
    )
  }

  // ==================== Settings Apply + Persist ====================
  // تطبيق الإعدادات على الجذر + حفظها في الملف عند كل تغيير (بعد التحميل فقط
  // حتى لا تُكتَب الافتراضيات فوق ملف المستخدم قبل قراءته).
  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-size', `${settings.fontSize}px`)
    document.documentElement.style.setProperty('--app-input-font-size', `${settings.inputFontSize ?? defaultSettings.inputFontSize}px`)
    document.documentElement.style.setProperty('--app-button-font-size', `${settings.buttonFontSize ?? defaultSettings.buttonFontSize}px`)
    document.documentElement.style.setProperty('--app-button-icon-size', `${settings.buttonIconSize ?? defaultSettings.buttonIconSize}px`)
    document.documentElement.style.setProperty('--app-font-family', `"${settings.fontFamily}"`)
    document.documentElement.style.setProperty('--app-display-zoom', String(settings.displayZoom / 100))
    document.documentElement.dataset.theme = general.theme
    if (!settingsReady) return
    void saveAppSettings(toFileSettings(settings)).catch(() => {})
  }, [settings, settingsReady, general.theme])

  // ==================== Window Management (Tauri) ====================
  useEffect(() => {
    if (!isTauri()) return

    let disposed = false
    let saveTimer: number | undefined
    let unlistenResize: (() => void) | undefined
    let unlistenMove: (() => void) | undefined
    let unlistenClose: (() => void) | undefined

    const initializeWindow = async () => {
      try {
        const appWindow = getCurrentWindow()
        const monitors = await availableMonitors()
        if (disposed) return

        let savedGeometry: SavedWindowGeometry | null = null
        try {
          const stored = localStorage.getItem(windowGeometryStorageKey)
          if (stored) {
            const candidate = JSON.parse(stored) as Partial<SavedWindowGeometry>
            if ([candidate.x, candidate.y, candidate.width, candidate.height].every(Number.isFinite)) {
              savedGeometry = {
                x: candidate.x!,
                y: candidate.y!,
                width: candidate.width!,
                height: candidate.height!,
                maximized: candidate.maximized === true,
              }
            }
          }
        } catch {
          savedGeometry = null
        }

        const savedMonitor = savedGeometry && monitors.find((monitor) => {
          const area = monitor.workArea
          return savedGeometry!.x < area.position.x + area.size.width - 100 &&
            savedGeometry!.x + savedGeometry!.width > area.position.x + 100 &&
            savedGeometry!.y < area.position.y + area.size.height - 100 &&
            savedGeometry!.y + savedGeometry!.height > area.position.y + 100
        })

        if (savedGeometry && savedMonitor) {
          const area = savedMonitor.workArea
          const width = Math.min(Math.max(savedGeometry.width, Math.min(720, area.size.width)), area.size.width)
          const height = Math.min(Math.max(savedGeometry.height, Math.min(560, area.size.height)), area.size.height)
          const x = Math.max(area.position.x, Math.min(savedGeometry.x, area.position.x + area.size.width - width))
          const y = Math.max(area.position.y, Math.min(savedGeometry.y, area.position.y + area.size.height - height))
          await appWindow.setSize(new PhysicalSize(width, height))
          await appWindow.setPosition(new PhysicalPosition(x, y))
          if (savedGeometry.maximized) await appWindow.maximize()
        } else {
          const monitor = await currentMonitor() ?? monitors[0]
          if (monitor) {
            const area = monitor.workArea
            const width = Math.floor(area.size.width * 0.95)
            const height = Math.floor(area.size.height * 0.9)
            const x = area.position.x + Math.floor((area.size.width - width) / 2)
            const y = area.position.y + Math.floor((area.size.height - height) / 2)
            await appWindow.setSize(new PhysicalSize(width, height))
            await appWindow.setPosition(new PhysicalPosition(x, y))
          }
        }

        const saveGeometry = async () => {
          try {
            const [position, size, maximized] = await Promise.all([
              appWindow.outerPosition(),
              appWindow.innerSize(),
              appWindow.isMaximized(),
            ])
            localStorage.setItem(windowGeometryStorageKey, JSON.stringify({
              x: position.x,
              y: position.y,
              width: size.width,
              height: size.height,
              maximized,
            }))
          } catch {
            return
          }
        }

        const scheduleSave = () => {
          window.clearTimeout(saveTimer)
          saveTimer = window.setTimeout(() => void saveGeometry(), 350)
        }

        const handleResize = () => {
          scheduleSave()
          void appWindow.isMaximized().then(setWindowMaximized).catch(() => {})
        }
        void appWindow.isMaximized().then(setWindowMaximized).catch(() => {})
        void appWindow.isAlwaysOnTop().then(setWindowAlwaysOnTop).catch(() => {})

        const [resizeListener, moveListener, closeListener] = await Promise.all([
          appWindow.onResized(handleResize),
          appWindow.onMoved(scheduleSave),
          appWindow.onCloseRequested(() => {
            void saveGeometry()
          }),
        ])
        if (disposed) {
          resizeListener()
          moveListener()
          closeListener()
          return
        }
        unlistenResize = resizeListener
        unlistenMove = moveListener
        unlistenClose = closeListener
      } catch {
        return
      }
    }

    void initializeWindow()
    return () => {
      disposed = true
      window.clearTimeout(saveTimer)
      unlistenResize?.()
      unlistenMove?.()
      unlistenClose?.()
    }
  }, [])

  const handleWindowAction = async (action: WindowAction) => {
    if (!isTauri()) return

    try {
      const appWindow = getCurrentWindow()
      if (action === 'minimize') await appWindow.minimize()
      if (action === 'toggle-maximize') {
        await appWindow.toggleMaximize()
        setWindowMaximized(await appWindow.isMaximized())
      }
      if (action === 'toggle-always-on-top') {
        const shouldPin = !(await appWindow.isAlwaysOnTop())
        await appWindow.setAlwaysOnTop(shouldPin)
        setWindowAlwaysOnTop(shouldPin)
      }
      if (action === 'close') {
        void Promise.all([
          appWindow.outerPosition(),
          appWindow.innerSize(),
          appWindow.isMaximized(),
        ]).then(([position, size, maximized]) => {
          localStorage.setItem(windowGeometryStorageKey, JSON.stringify({
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            maximized,
          }))
        }).catch(() => {})
        await appWindow.destroy()
      }
    } catch {
      return
    }
  }

  // ==================== Render ====================
  const renderPage = () => {
    if (page === 'peoples') {
      return (
        <PageTablePeople
          repo={repo}
          repoPassword={repoPassword}
          onRepoUpdated={handleRepoUpdated}
          onHeaderActionChange={setMobileHeaderAction}
        />
      )
    }
    if (page === 'prompt') {
      return (
        <PagePromptView
          repo={repo}
          repoPassword={repoPassword}
          onRepoUpdated={handleRepoUpdated}
        />
      )
    }
    if (page === 'search') {
      return (
        <PageGlobalSearch
          onClose={() => setPage(repo ? 'repo' : 'home')}
          onOpenAccount={() => setPage('account')}
          onOpenRepo={handleOpenRepo}
          onHeaderActionChange={setMobileHeaderAction}
        />
      )
    }
    if (page === 'account') {
      return (
        <PageSettingsView
          settings={settings}
          onChange={setSettings}
          general={general}
          onGeneralChange={handleGeneralChange}
          onClose={closeAccountPage}
          repo={repo}
          repoPassword={repoPassword}
          onRepoUpdated={handleRepoUpdated}
          initialTab={accountEntry?.tab}
          focusTabId={accountEntry?.focusTabId}
          manageTabId={accountEntry?.manageTabId}
          onHeaderActionChange={setMobileHeaderAction}
        />
      )
    }

    if (page === 'home' || repo === null) {
      return (
        <PageHome
          onOpenRepo={handleOpenRepo}
          repoSort={settings.repoSort ?? 'oldest'}
          favOnly={favOnly}
        />
      )
    }

    // page === 'repo' && repo !== null
    return (
      <PageRepoViewer
        repo={repo}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        activeMemberId={activeMemberId}
        setActiveMemberId={setActiveMemberId}
        closedTabIds={closedTabIds}
        repoPassword={repoPassword}
        onRepoUpdated={handleRepoUpdated}
        onCloseRepo={() => void handleCloseRepo()}
        onHeaderActionChange={setMobileHeaderAction}
        fieldLang={settings.fieldLang ?? 'ar'}
        docCategories={settings.docCategories ?? []}
        filesPreviewOpen={filesPreviewOpen}
        onFilesPreviewChange={(open, isMedia) => { setFilesPreviewOpen(open); setHideBottomNav(open && isMedia) }}
        onFieldLangChange={(lang) => setSettings((prev) => ({ ...prev, fieldLang: lang }))}
        onManageFields={(tabId) => {
          setAccountEntry({ tab: 'fields', manageTabId: tabId })
          setPage('account')
        }}
        onOpenTabsPanel={() => {
          // صفحة الاستقبال: الهواتف تفتح الدرج العائم، الأكبر يوسّع اللوحة.
          if (window.matchMedia('(max-width: 639px)').matches) {
            setTabsQuery('')
            setMobileTabsOpen(true)
          } else {
            setTabsPanelCollapsed(false)
          }
        }}
      />
    )
  }

  // قبل تحميل الإعدادات والبروفايل من الملفين: شاشة انتظار فقط (بلا وميض بالافتراضيات).
  if (!settingsReady || !profileReady) {
    return (
      <div className="app-shell">
        <p className="vault-empty">DataCenter…</p>
      </div>
    )
  }

  return (
    <LanguageProvider
      language={general.language}
      onLanguageChange={(language) => handleGeneralChange({ language })}
    >
    <ToastProvider
      mode={general.theme}
      position={toastPosition}
      defaultDuration={4000}
      theme={toastTheme}
    >
    <PageMother
      page={page}
      repo={repo}
      activeSection={activeSection}
      closedTabIds={closedTabIds}
      tabsPanelCollapsed={tabsPanelCollapsed}
      setTabsPanelCollapsed={setTabsPanelCollapsed}
      mobileTabsOpen={mobileTabsOpen}
      setMobileTabsOpen={setMobileTabsOpen}
      mobileHeaderAction={mobileHeaderAction}
      onGoHome={goHome}
      onOpenFavorites={openFavorites}
      favOnlyActive={favOnly}
      hidePanelToggle={filesPreviewOpen}
      hideBottomNav={hideBottomNav}
      tabsQuery={tabsQuery}
      isDataMode={isDataMode}
      canCopyData={canCopyData}
      windowMaximized={windowMaximized}
      windowAlwaysOnTop={windowAlwaysOnTop}
      isCreateModalOpen={isCreateModalOpen}
      setPage={setPage}
      setActiveSection={setActiveSection}
      setTabsQuery={setTabsQuery}
      setIsCreateModalOpen={setIsCreateModalOpen}
      openTab={openTab}
      closeTab={closeTab}
      closeAllTabs={closeAllTabs}
      toggleDataMode={() => void toggleDataMode()}
      handleWindowAction={(action) => void handleWindowAction(action)}
      handleCloseRepo={() => void handleCloseRepo()}
      handleCreateRepoFromModal={(meta, password) => void handleCreateRepoFromModal(meta, password)}
      onOpenPeoples={openPeoples}
      onClosePeoples={closePeoples}
      onEditTabTitle={(tabId) => {
        setAccountEntry({ tab: 'tabs', focusTabId: tabId })
        setPage('account')
      }}
    >
      {renderPage()}
    </PageMother>
    </ToastProvider>
    </LanguageProvider>
  )
}
