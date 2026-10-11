// صفحة جدول الملفات — متصفح ملفات المستودع: تجهيز وحفظ من أزرار الصفحة ثم نسخ وتسجيل.
// المنسّق يحمل الحالة والأوامر، والأقسام (انتظار/فلاتر/بطاقات/معاينة) بملفاتها.
// (نُقل من Interfaces/FileManager — المصدر الوحيد لجدول documents).
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { ListChecks, Loader2, Plus, Save, Trash2, UserRound } from 'lucide-react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { shareFile } from '../lib/fileShare'
import { exists, remove, writeFile } from '@tauri-apps/plugin-fs'
import { copyStagedFile, exportFile, getDisplayName, readHeadBytes } from '../lib/fileCopy'
import { invoke } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import {
  deleteDocument, registerDocument, registerDocuments, repoFileAbsPath, repoFilesDir, updateDocumentMetadata,
  type RegisterDocumentItem, type RepoData, type RepoDocument,
} from '../repos/repoService'
import FileCardEditor, { type DocumentValues } from './TableFiles/FileCardEditor'
import ModalMessages from '../modals/ModalMessages'
import type { OwnerMultiState } from '../modals/ModalOwnerSelection'
import FileStagingList, { type StagedFile, type StagedPatch } from './TableFiles/FileStagingList'
import FileCategoryModal from './TableFiles/FileCategoryModal'
import FileExtensionModal from './TableFiles/FileExtensionModal'
import FilePreviewPage from './TableFiles/FilePreviewPage'
import FileFilterBar, { type FileKindFilter } from './TableFiles/FileFilterBar'
import FileGridCard from './TableFiles/FileGridCard'
import {
  allCategories, canPreviewInApp, categoryLabel, fileKindOf, isArchiveFile, isAudioFile, isHtmlFile, isOfficeFile, isVideoFile, sniffFileExtension, stemOfFileName, totalSize,
} from '../lib/documents'
import type { DocCategoryCustom, FieldLang } from '../lib/appSettings'
import { recordName, recordRelation } from '../lib/records'
import { isAndroidPlatform, usePlatform } from '../lib/platform'
import { tabTitle } from '../lib/tabTitle'
import RepoTabsHeaderControl from '../components/RepoTabsHeaderControl'
import { Tooltip } from '../components/Tooltip'
import { useToast } from 'react-theme-toast'
import { useLanguage } from '../language/LanguageContext'

export type FileManagerApi = {
  /** اختيار ملفات للتجهيز (لا تُحفَظ بعد). */
  pickFiles: () => void
  /** حفظ المجهز في المستودع. */
  saveStaged: () => void
  /** فتح مودال ترشيح التصنيف (من أيقونة الفلتر في هيدر الموبايل). */
  openCategoryFilter: () => void
  /** إغلاق صفحة المعاينة والعودة للشبكة. */
  closePreview: () => void
  /** تنزيل ملف المعاينة على الجهاز. */
  savePreview: () => void
  /** مشاركة ملف المعاينة (الآلية تُحدَّد لاحقاً). */
  sharePreview: () => void
}

type PageTableFilesProps = {
  repo: RepoData
  repoPassword: string | null
  onRepoUpdated: (data: RepoData) => void
  /** المالك الافتراضي عند الحفظ (الشخص المفتوح) — وإلا مشترك. */
  defaultOwnerId: string | null
  activeMemberId: string
  onSelectMember: (id: string) => void
  onAddMember: () => void
  onRenameMember: () => void
  onDeleteMember: () => void
  fieldLang: FieldLang
  categories: DocCategoryCustom[]
  onStagingChange: (count: number) => void
  /** إشعار الأب بفتح/إغلاق المعاينة (لأزرار الهيدر وإخفاء الشريط السفلي للوسائط). */
  onPreviewChange: (open: boolean, isMedia: boolean) => void
  /** التحديد المتعدد للملاك — يملكه PageRepoViewer (يزامن تبويبات الصفحة ومودال المالك). */
  owners: OwnerMultiState
}

// عتبة تحذير المساحة (500MB) — الملفات الضخمة (جوازات 13MB+) تتراكم.
const STORAGE_WARN_BYTES = 500 * 1024 * 1024

/** إفساح المجال للرسم بين الملفات — نسخ الملفات الكبيرة يحجب الخيط وإلا تجمّد اللودر. */
const yieldToPaint = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** رسالة الخطأ للتوست — أخطاء الأوامر الأصلية تصل كنص (ليست Error) فلا يجوز ابتلاعها.
    تُقصَّر المعروضة (220 حرفاً) حتى لا يفيض التوست بمسارات/تكديسات طويلة. */
const errMsg = (cause: unknown, fallback: string): string => {
  let text = fallback
  if (cause instanceof Error && cause.message) text = cause.message
  else if (typeof cause === 'string' && cause.trim()) text = cause
  return text.length > 220 ? `${text.slice(0, 220)}…` : text
}

const baseNameOf = (path: string): string => {
  const base = path.split(/[/\\]/).pop() ?? path
  return base.trim()
}

/** رفض الحارس: تجاوز سقف 500MB بعد النسخ (حُذف المنسوخ) — يُميَّز عن فشل النسخ. */
class RepoCapError extends Error {
  constructor(readonly fileName: string) {
    super(`repo storage cap exceeded: ${fileName}`)
  }
}

const splitName = (name: string): [string, string] => {
  const dot = name.lastIndexOf('.')
  if (dot > 0) return [name.slice(0, dot), name.slice(dot)]
  return [name, '']
}

/** عنوان تلقائي: اسم فقط بلا مسار وبلا امتداد (مفكوك الترميز) — قابل للتعديل قبل الحفظ. */
const autoTitleOf = (baseName: string): string => {
  const stem = stemOfFileName(baseName)
  try {
    return decodeURIComponent(stem)
  } catch {
    return stem
  }
}

/** امتداد الملف بحروف صغيرة ('' بلا امتداد) — لترشيح الأنواع. */
const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return ''
  return fileName.slice(dot + 1).trim().toLowerCase()
}

function PageTableFilesInner(
  { repo, repoPassword, onRepoUpdated, defaultOwnerId, activeMemberId, onSelectMember, onAddMember, onRenameMember, onDeleteMember, fieldLang, categories, onStagingChange, onPreviewChange, owners }: PageTableFilesProps,
  ref: Ref<FileManagerApi>,
) {
  const { t, lang } = useLanguage()
  const toast = useToast()
  const isMobile = isAndroidPlatform(usePlatform())
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<FileKindFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  // نص الكتابة في البحث (لا يُرشَّح به) — التطبيق بزر العدسة/Enter فقط.
  const [searchInput, setSearchInput] = useState('')
  // البحث المطبَّق فعلاً على القائمة.
  const [search, setSearch] = useState('')
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  /** ترشيح الامتداد (معرّف مجموعة/مخصص، والمجموعة كمصفوفة — null = الكل) + مودال اختياره. */
  const [extId, setExtId] = useState('all')
  const [extSet, setExtSet] = useState<string[] | null>(null)
  const [extModalOpen, setExtModalOpen] = useState(false)
  /** ملفات مجهزة رُفض حفظها لفراغ عنوانها — تُبرَز كروتها بالأحمر حتى يُكتَب العنوان. */
  const [titleErrors, setTitleErrors] = useState<Set<string>>(new Set())
  /** هدف مودال التصنيفات: null = فلتر الصفحة، أو src ملف مجهز. */
  const [categoryStagedSrc, setCategoryStagedSrc] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [editingDoc, setEditingDoc] = useState<RepoDocument | null>(null)
  const [pendingDelete, setPendingDelete] = useState<RepoDocument | null>(null)
  // ملفات مجهزة بانتظار زر الحفظ في الصفحة.
  const [staged, setStaged] = useState<StagedFile[]>([])
  /** تقدم الحفظ الجاري (ملف x من y) — يُعرض شريط تقدم أثناء الإضافة. */
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null)
  const { selectedIds: selMembers, showAll } = owners

  const toggleMember = (id: string) => {
    const wasAll = owners.showAll
    const wasSelected = owners.selectedIds.has(id)
    owners.onToggleMember(id)
    if (wasAll || !wasSelected) onSelectMember(id)
    else if (owners.selectedIds.size === 2) {
      // إلغاء التحديد أبقى مفرداً — يصبح هو النشط (وإلا علق الهيدر على القديم).
      const remaining = [...owners.selectedIds].find((m) => m !== id)
      if (remaining) onSelectMember(remaining)
    }
  }

  const records = useMemo(
    () => [...repo.peoples].sort((a, b) => a.sortOrder - b.sortOrder),
    [repo.peoples],
  )
  const cats = useMemo(() => allCategories(categories), [categories])
  const activeTab = repo?.tabs.find((tab) => tab.id === 'files') ?? null
  const catLabel = (key: string): string =>
    categoryLabel(key, fieldLang, categories, (k) => t(`documentManager.category_${k}`))

  const ownerNameOf = (doc: RepoDocument): string => {
    if (doc.ownerRecordId) {
      const rec = records.find((r) => r.id === doc.ownerRecordId)
      if (rec) return recordName(rec, lang)
    }
    return t('documentManager.sharedOption')
  }

  const setStagedList = (next: StagedFile[]) => {
    setStaged(next)
    onStagingChange(next.length)
  }

  /** مسح كل الملفات المجهزة من المؤقتة (للتجربة — بلا مساس بالمحفوظ). */
  const clearStaged = () => {
    if (busy || staged.length === 0) return
    setStagedList([])
    setTitleErrors(new Set())
  }

  const patchStaged = (src: string, patch: StagedPatch) => {
    setStagedList(staged.map((s) => (s.src === src ? { ...s, ...patch } : s)))
    // الكتابة في العنوان تمسح علامة الرفض الحمراء فوراً.
    if (patch.title !== undefined && patch.title.trim()) {
      setTitleErrors((prev) => {
        if (!prev.has(src)) return prev
        const next = new Set(prev)
        next.delete(src)
        return next
      })
    }
  }

  const pickFiles = async () => {
    if (busy) return
    if (!showAll && selMembers.size > 1) {
      toast.info(t('documentManager.addBlockedMulti'))
      return
    }
    try {
      const picked = await open({ multiple: true, directory: false })
      const paths = (Array.isArray(picked) ? picked : picked ? [picked] : []).filter((p): p is string => typeof p === 'string' && p !== '')
      if (paths.length === 0) return
      const fresh = paths.filter((src) => !staged.some((s) => s.src === src))
      if (fresh.length === 0) return
      // كشف مبكر للامتداد (أسماء content:// بلا امتداد) حتى تظهر الأيقونة والعنوان صح
      // من لحظة التجهيز — يُعاد التأكيد عند الحفظ في storeItem.
      const items: StagedFile[] = []
      for (const src of fresh) {
        // الاسم الحقيقي من النظام (روابط content:// بلا اسم) ثم القاعدي كتراجع.
        let nm = (await getDisplayName(src)) || baseNameOf(src)
        if (!/\.[A-Za-z0-9]{1,5}$/.test(nm)) {
          try {
            // أول 2KB: كشف أوفيس الحديث (pptx/docx/xlsx) يحتاج أسماء الأجزاء خلف البصمة.
            const sniffed = sniffFileExtension(await readHeadBytes(src, 2048))
            if (sniffed) nm = `${nm}.${sniffed}`
          } catch {
            // يبقى بلا امتداد ويُكشَف عند الحفظ.
          }
        }
        items.push({ src, name: nm, title: autoTitleOf(nm), category: 'other' })
      }
      // النسخ أصلي لاحقاً (قرص→قرص بلا مرور بـ JS) فلا حظر على الأحجام هنا.
      setStagedList([...staged, ...items])
      toast.success(t('documentManager.stagedStatus', { count: fresh.length }))
    } catch (cause: unknown) {
      toast.error(errMsg(cause, t('documentManager.pickError')))
    }
  }

  /** العنوان الافتراضي حسب نوع الملف ولغة التطبيق — عند ترك حقل العنوان فارغاً. */
  const defaultTitleOf = (fileName: string): string => {
    if (isVideoFile(fileName)) return t('documentManager.defaultTitle_video')
    const fileKind = fileKindOf(fileName)
    if (fileKind === 'pdf') return t('documentManager.defaultTitle_pdf')
    if (fileKind === 'image') return t('documentManager.defaultTitle_image')
    if (fileKind === 'text') return t('documentManager.defaultTitle_text')
    return t('documentManager.defaultTitle_other')
  }

  /** نسخ ملف مجهز للمستودع (اسم فريد + نسخ قرص→قرص) — بلا تسجيل.
      البايتات لا تعبر JS فلا تجمّد الواجهة. */
  const copyItem = async (destDir: string, item: StagedFile): Promise<{ candidate: string; destPath: string; bytes: number; filetype: string }> => {
    // أسماء content:// بلا امتداد — نكشف الامتداد من أول 64 بايت أصلياً.
    let baseName = item.name || 'file'
    if (!/\.[A-Za-z0-9]{1,5}$/.test(baseName)) {
      try {
        // أول 2KB: كشف أوفيس الحديث (pptx/docx/xlsx) يحتاج أسماء الأجزاء خلف البصمة.
        const head = await readHeadBytes(item.src, 2048)
        const sniffed = sniffFileExtension(head)
        if (sniffed) baseName = `${baseName}.${sniffed}`
        // النصوص العادية بلا بصمة ثنائية (لا بايت صفري) — تُحفَظ txt حتى تُعايَن وتُصنَّف صح.
        else if (head.length > 0 && !head.includes(0)) baseName = `${baseName}.txt`
      } catch {
        // تعذّر القراءة: يُكشَف لاحقاً عند النسخ (الأمر الأصلي يرفض برسالة).
      }
    }
    const [stem, ext] = splitName(baseName)
    let candidate = baseName
    let n = 2
    while (await exists(await join(destDir, candidate))) {
      candidate = `${stem}-${n}${ext}`
      n += 1
    }
    const destPath = await join(destDir, candidate)
    const bytes = await copyStagedFile(item.src, destPath)
    const dot = candidate.lastIndexOf('.')
    const filetype = dot > 0 ? candidate.slice(dot + 1).trim().toLowerCase() : ''
    return { candidate, destPath, bytes, filetype }
  }

  /** نسخ ملف مجهز واحد للمستودع وتسجيله أصلياً (قرص→قرص بمقاطع) —
      البايتات لا تعبر JS فلا تجمّد الواجهة. العنوان المدخَل أو الافتراضي حسب النوع. */
  const storeItem = async (current: RepoData, destDir: string, item: StagedFile): Promise<RepoData> => {
    const { candidate, destPath, bytes, filetype } = await copyItem(destDir, item)
    // حارس السعة: فحص بعد النسخ على الوجهة (ملف نظامي دائماً) + تراجع فوري عند التجاوز.
    if (totalSize(current.documents) + bytes > STORAGE_WARN_BYTES) {
      await remove(destPath).catch(() => {})
      throw new RepoCapError(item.name)
    }
    const title = item.title.trim() || defaultTitleOf(candidate)
    const kind = fileKindOf(candidate) === 'image' ? 'image' : 'file'
    return registerDocument(current.meta.id, repoPassword, candidate, title, kind, defaultOwnerId, item.category || 'other', item.src, filetype)
  }

  /** حفظ ملف مجهز واحد (زر الكارد) — يخرج من المؤقتة عند النجاح. */
  const saveOne = async (src: string) => {
    const item = staged.find((s) => s.src === src)
    if (busy || !item) return
    // حارس العنوان: فارغ = رفض أحمر بلا حفظ.
    if (!item.title.trim()) {
      setTitleErrors((prev) => new Set(prev).add(src))
      toast.error(t('documentManager.titleRequiredOne'))
      return
    }
    if (!showAll && selMembers.size > 1) {
      toast.info(t('documentManager.addBlockedMulti'))
      return
    }
    setBusy(true)
    setSaveProgress({ done: 0, total: 1 })
    await yieldToPaint()
    try {
      const destDir = await repoFilesDir(repo.meta.id, repoPassword)
      const data = await storeItem(repo, destDir, item)
      onRepoUpdated(data)
      setStagedList(staged.filter((s) => s.src !== src))
      setTitleErrors((prev) => {
        if (!prev.has(src)) return prev
        const next = new Set(prev)
        next.delete(src)
        return next
      })
      setSaveProgress({ done: 1, total: 1 })
      toast.success(t('documentManager.addedStatus'))
    } catch (cause: unknown) {
      if (cause instanceof RepoCapError) toast.error(t('documentManager.repoCapBlocked', { count: 1 }))
      else toast.error(errMsg(cause, t('documentManager.saveError')))
    } finally {
      setBusy(false)
      setSaveProgress(null)
    }
  }

  const saveStaged = async () => {
    if (busy || staged.length === 0) return
    if (!showAll && selMembers.size > 1) {
      toast.info(t('documentManager.addBlockedMulti'))
      return
    }
    setBusy(true)
    // حارس العنوان: الفارغة تُرفَض بالأحمر وتُتخطى — يُحفَظ الباقي فقط.
    const attemptable = staged.filter((s) => s.title.trim())
    const missing = staged.filter((s) => !s.title.trim()).map((s) => s.src)
    if (missing.length > 0) {
      setTitleErrors((prev) => new Set([...prev, ...missing]))
      toast.error(t('documentManager.titleRequiredSome', { count: missing.length }))
    }
    if (attemptable.length === 0) {
      setBusy(false)
      return
    }
    const total = attemptable.length
    setSaveProgress({ done: 0, total })
    await yieldToPaint()
    try {
      const destDir = await repoFilesDir(repo.meta.id, repoPassword)
      let data: RepoData = repo
      const failed: string[] = []
      let firstErr = ''
      let blocked = 0
      let done = 0
      const savedSrcs = new Set<string>()
      // المرحلة 1: نسخ متسلسل (اسم فريد + حارس سعة تراكمي) — بلا تسجيل بعد.
      const copied: { src: string; name: string; row: RegisterDocumentItem }[] = []
      let runningTotal = totalSize(repo.documents)
      for (const item of attemptable) {
        try {
          const { candidate, destPath, bytes, filetype } = await copyItem(destDir, item)
          if (runningTotal + bytes > STORAGE_WARN_BYTES) {
            await remove(destPath).catch(() => {})
            blocked += 1
          } else {
            runningTotal += bytes
            copied.push({
              src: item.src,
              name: item.name,
              row: {
                fileName: candidate,
                title: item.title.trim() || defaultTitleOf(candidate),
                kind: fileKindOf(candidate) === 'image' ? 'image' : 'file',
                ownerRecordId: defaultOwnerId,
                category: item.category || 'other',
                sourcePath: item.src,
                filetype,
              },
            })
          }
        } catch (cause: unknown) {
          failed.push(item.name)
          // أول سبب فقط — كان يُبتلَع سابقاً فلا يُعرَف سبب الفشل.
          if (!firstErr) firstErr = errMsg(cause, '')
        }
        done += 1
        setSaveProgress({ done, total })
        await yieldToPaint()
      }
      // المرحلة 2: تسجيل دفعي واحد — بوابة واحدة وفتح واحد؛ الفاشل لا يحجب الناجح.
      if (copied.length > 0) {
        try {
          const res = await registerDocuments(repo.meta.id, repoPassword, copied.map((c) => c.row))
          data = res.data
          const failedIdx = new Set(res.failed.map((f) => f.index))
          const reasonOf = new Map(res.failed.map((f) => [f.index, f.reason] as const))
          copied.forEach((c, i) => {
            if (failedIdx.has(i)) {
              failed.push(c.name)
              if (!firstErr) firstErr = reasonOf.get(i) ?? ''
            } else {
              savedSrcs.add(c.src)
            }
          })
        } catch (cause: unknown) {
          // فشل الاستدعاء كله (مثل بوابة القفل) — الكل فاشل بنفس السبب.
          const msg = errMsg(cause, '')
          copied.forEach((c) => failed.push(c.name))
          if (!firstErr) firstErr = msg
        }
      }
      onRepoUpdated(data)
      setStagedList(staged.filter((s) => !savedSrcs.has(s.src)))
      setTitleErrors((prev) => {
        if (savedSrcs.size === 0) return prev
        const next = new Set(prev)
        savedSrcs.forEach((src) => next.delete(src))
        return next
      })
      if (blocked > 0) {
        toast.error(t('documentManager.repoCapBlocked', { count: blocked }))
      }
      if (failed.length > 0) {
        const detail = [firstErr, failed.slice(0, 3).join('، ')].filter(Boolean).join(' — ')
        toast.error(t('documentManager.saveSomeFailed', { count: failed.length }), detail || undefined)
      }
      if (blocked === 0 && failed.length === 0 && missing.length === 0) {
        toast.success(t('documentManager.savedAllStatus'))
      }
    } catch (cause: unknown) {
      toast.error(errMsg(cause, t('documentManager.saveError')))
    } finally {
      setBusy(false)
      setSaveProgress(null)
    }
  }

  const openCategoryFilter = () => {
    setCategoryStagedSrc(null)
    setCategoryModalOpen(true)
  }

  /** مرشح واحد موحد: النوع والامتداد — اختيار أحدهما يمسح الآخر. */
  const handleKindChange = (next: FileKindFilter) => {
    setKind(next)
    setExtId('all')
    setExtSet(null)
  }

  const handleExtSelect = (id: string, exts: string[] | null) => {
    if (id === 'all' || !exts) {
      clearExtFilter()
      return
    }
    setExtId(id)
    setExtSet(exts)
    setKind('all')
  }

  const clearExtFilter = () => {
    setExtId('all')
    setExtSet(null)
    setKind('all')
  }

  const closePreview = () => setPreviewId(null)

  /** تنزيل ملف المعاينة على الجهاز — أصلي بالكامل: المسار المطلق من الخلفية + حوار الحفظ
      ثم نسخ `export_file` (قرص→قرص بمقاطع) — لا يمر بايت واحد في JS فلا يتجمّد مع الفيديوهات الضخمة. */
  const savePreviewFile = async () => {
    if (busy || !previewDoc) return
    setBusy(true)
    try {
      const dot = previewDoc.fileName.lastIndexOf('.')
      const ext = dot > 0 ? previewDoc.fileName.slice(dot + 1) : ''
      const dest = await save({
        defaultPath: previewDoc.fileName,
        filters: ext ? [{ name: ext, extensions: [ext] }] : undefined,
      })
      if (!dest) return
      const src = await repoFileAbsPath(repo.meta.id, previewDoc.fileName)
      await exportFile(src, dest)
      toast.success(t('documentLibrary.savedFileMsg', { fileName: previewDoc.fileName }))
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      toast.error(errMsg(cause, t('documentLibrary.saveError')))
    } finally {
      setBusy(false)
    }
  }

  /** حفظ بايتات مولّدة (صفحة PNG/PDF) بنفس مسار زر الهيدر المجرّب:
      حوار حفظ + كتابة الملحق — يُمرَّر لصفحة المعاينة فعارض PDF. */
  const savePreviewBytes = async (bytes: Uint8Array, fileName: string) => {
    if (busy) return
    setBusy(true)
    try {
      const dot = fileName.lastIndexOf('.')
      const ext = dot > 0 ? fileName.slice(dot + 1) : ''
      const dest = await save({
        defaultPath: fileName,
        filters: ext ? [{ name: ext, extensions: [ext] }] : undefined,
      })
      if (!dest) return
      await writeFile(dest, bytes)
      toast.success(t('documentLibrary.savedFileMsg', { fileName }))
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      toast.error(errMsg(cause, t('documentLibrary.saveError')))
    } finally {
      setBusy(false)
    }
  }

  /** مشاركة ملف المعاينة عبر ورقة نظام أندرويد (تحضير Rust ثم الملحق). */
  const sharePreview = async () => {
    if (busy || !previewDoc) return
    setBusy(true)
    try {
      const [path] = await invoke<string[]>('prepare_share_files', {
        password: repoPassword,
        sources: [{
          repoId: repo.meta.id,
          storedName: previewDoc.fileName,
          displayName: previewDoc.title,
        }],
      })
      if (!path) throw new Error('no path')
      await shareFile(path, { title: t('documentManager.shareBtn') })
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause)
      if (msg.includes('only supported on Android')) {
        toast.info(t('documentManager.shareAndroidOnly'))
      } else {
        toast.error(t('documentManager.shareFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const used = totalSize(repo.documents)
  const previewDoc = previewId ? repo.documents.find((d) => d.id === previewId) ?? null : null

  useEffect(() => {
    const kind = previewDoc !== null ? fileKindOf(previewDoc.fileName) : null
    const isMedia = previewDoc !== null && (kind === 'image' || kind === 'pdf' || kind === 'text' || isVideoFile(previewDoc.fileName) || isAudioFile(previewDoc.fileName) || isHtmlFile(previewDoc.fileName) || isOfficeFile(previewDoc.fileName))
    onPreviewChange(previewId !== null, isMedia)
    return () => onPreviewChange(false, false)
  }, [previewId, previewDoc, onPreviewChange])

  useImperativeHandle(ref, () => ({ pickFiles, saveStaged, openCategoryFilter, closePreview, savePreview: () => void savePreviewFile(), sharePreview }), [staged, busy, repo, repoPassword, defaultOwnerId, previewDoc, isMobile, showAll, selMembers])

  const runOp = async (op: () => Promise<RepoData>, message?: string) => {
    if (busy) return
    setBusy(true)
    try {
      const data = await op()
      onRepoUpdated(data)
      if (message) toast.success(message)
    } catch (cause: unknown) {
      toast.error(errMsg(cause, t('documentManager.saveError')))
    } finally {
      setBusy(false)
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase()
    const list = repo.documents.filter((doc) => {
      // زر «فيديو» (kind_other) للفيديو فقط — بلا خلط مع باقي other (صوت/أوفيس/مضغوط).
      if (kind === 'other') {
        if (!isVideoFile(doc.fileName)) return false
      } else if (kind === 'audio') {
        if (!isAudioFile(doc.fileName)) return false
      } else if (kind === 'archive') {
        if (!isArchiveFile(doc.fileName)) return false
      } else if (kind !== 'all' && fileKindOf(doc.fileName) !== kind) return false
      if (categoryFilter !== 'all' && doc.category !== categoryFilter) return false
      if (extSet && !extSet.includes(extensionOf(doc.fileName))) return false
      // نطاق الملاك (متعدد): الكل يتجاوز، وإلا ملفات المحددين فقط —
      // فاقد المالك يظهر تحت «الكل» فقط.
      if (!showAll) {
        if (!doc.ownerRecordId) return false
        if (!selMembers.has(doc.ownerRecordId)) return false
      }
      if (q && !`${doc.title} ${doc.fileName}`.toLocaleLowerCase().includes(q)) return false
      return true
    })
    return [...list].sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.documents, kind, selMembers, showAll, categoryFilter, search, extSet, records])

  /** صور وفيديوهات شريط المصغرات: من العرض الحالي، وإلا كل المستودع. */
  const stripImages = useMemo(() => {
    const inView = visible.filter((doc) => fileKindOf(doc.fileName) === 'image')
    const pool = inView.length > 0 ? inView : repo.documents.filter((doc) => fileKindOf(doc.fileName) === 'image')
    return pool.map((doc) => ({ id: doc.id, title: doc.title, fileName: doc.fileName, sizeBytes: doc.sizeBytes }))
  }, [visible, repo.documents])
  const stripVideos = useMemo(() => {
    const inView = visible.filter((doc) => isVideoFile(doc.fileName))
    const pool = inView.length > 0 ? inView : repo.documents.filter((doc) => isVideoFile(doc.fileName))
    return pool.map((doc) => ({ id: doc.id, title: doc.title, fileName: doc.fileName, sizeBytes: doc.sizeBytes }))
  }, [visible, repo.documents])
  /** قائمة الشريط حسب نوع المعاينة الحالية. */
  const previewIsVideo = previewDoc !== null && isVideoFile(previewDoc.fileName)

  /** ترقيم الشبكة: أول 25 فقط + زر المزيد — كجهات الاتصال (تخفيف ضغط الصور). */
  const [fileLimit, setFileLimit] = useState(25)
  useEffect(() => {
    setFileLimit(25)
  }, [kind, categoryFilter, search, extSet, selMembers, showAll])

  /** آخر ترشيح نوع أُشعِر بفراغه — حتى لا يتكرر التوست مع بقاء نفس الترشيح. */
  const emptyToastKey = useRef<string>('')
  useEffect(() => {
    const typeActive = kind !== 'all' || extSet !== null
    if (!typeActive || visible.length !== 0) {
      emptyToastKey.current = ''
      return
    }
    const key = `${kind}|${extId}`
    if (emptyToastKey.current === key) return
    emptyToastKey.current = key
    toast.info(t('documentManager.emptyDocs'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length, kind, extSet, extId])

  /** مالك العرض: المفرد المحدد أولاً (وإلا علق الهيدر على نشط غير محدد)، ثم الفرد النشط. */
  const singleSelected = !showAll && selMembers.size === 1
    ? records.find((member) => selMembers.has(member.id)) ?? null
    : null
  const headerMember = singleSelected ?? records.find((member) => member.id === activeMemberId) ?? records[0] ?? null
  /** عنوان الهيدر حسب التحديد: الكل / متعدد (زر يعرض الأسماء) / الفرد النشط. */
  const isMultiOwners = !showAll && selMembers.size > 1
  const headerTitle = !headerMember
    ? ''
    : showAll
      ? t('documentManager.kind_all')
      : isMultiOwners
        ? t('documentManager.multiLabel')
        : recordName(headerMember, lang)
  /** معاينة تحت «متعدد»: أول 5 أسماء بخط صغير + نقاط للباقي. */
  const multiNames = records
    .filter((member) => selMembers.has(member.id))
    .map((member) => recordName(member, lang))
  const multiPreview = multiNames.slice(0, 5).join('، ')
    + (multiNames.length > 5 ? ' …' : '')
  const headerSub = !headerMember
    ? ''
    : showAll
      ? t('documentManager.allFilesLabel')
      : isMultiOwners
        ? multiPreview
        : recordRelation(headerMember, lang) || '—'
  /** الضغط على «متعدد» يعرض أسماء المحددين في توست. */
  const showMultiNames = () => {
    toast.info(t('documentManager.multiLabel'), multiNames.join('، '))
  }

  const submitEdit = (values: DocumentValues) => {
    if (!editingDoc) return
    const id = editingDoc.id
    setEditingDoc(null)
    void runOp(
      () => updateDocumentMetadata(repo.meta.id, repoPassword, id, values.title, editingDoc.kind, values.ownerRecordId, values.category),
      t('documentManager.savedStatus'),
    )
  }

  const askDelete = (doc: RepoDocument) => {
    setPendingDelete(doc)
  }

  /** طلب المعاينة من البطاقة: بلا دعم داخلي (أوفيس/مضغوط/مجهول) = توست فقط بلا انتقال. */
  const requestPreview = (doc: RepoDocument) => {
    if (busy) return
    if (previewId === doc.id) {
      setPreviewId(null)
      return
    }
    if (!canPreviewInApp(doc.fileName)) {
      toast.info(t(isOfficeFile(doc.fileName) ? 'documentManager.officeNoPreview' : 'documentManager.previewUnsupported'))
      return
    }
    setPreviewId(doc.id)
  }

  /** وضع التحديد المتعدد للحذف الجماعي + تأكيد الحذف الجماعي (لقطة معرفات). */
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingDeleteMany, setPendingDeleteMany] = useState<{ ids: string[] } | null>(null)

  /** ملفات نطاق المالك الحالي فقط (بلا فلاتر النوع/البحث) — أساس زر حذف الكل. */
  const ownerDocs = useMemo(() => {
    if (showAll) return repo.documents
    return repo.documents.filter((d) => d.ownerRecordId && selMembers.has(d.ownerRecordId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.documents, showAll, selMembers])

  /** إسقاط المحدد الزائد عند تغيّر المستودع (محذوف من عملية أخرى). */
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const alive = new Set(repo.documents.map((d) => d.id))
      let changed = false
      const next = new Set<string>()
      prev.forEach((id) => {
        if (alive.has(id)) next.add(id)
        else changed = true
      })
      return changed ? next : prev
    })
  }, [repo.documents])

  /** تبديل المالك يُلغي وضع التحديد (المحدد خاص بالنطاق السابق). */
  useEffect(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll, selMembers])

  const toggleSelectMode = () => {
    if (busy) return
    setSelectMode((v) => !v)
    setSelectedIds(new Set())
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** الضغط المطول على بطاقة: دخول وضع التحديد وهذا الملف محدد. */
  const longPressSelect = (id: string) => {
    if (busy || selectMode) return
    setSelectMode(true)
    setSelectedIds(new Set([id]))
  }

  const selectAllVisible = () => {
    setSelectedIds(new Set(visible.map((d) => d.id)))
  }

  const requestDeleteAll = () => {
    if (busy) return
    if (ownerDocs.length === 0) {
      toast.info(t('documentManager.deleteManyEmpty'))
      return
    }
    setPendingDeleteMany({ ids: ownerDocs.map((d) => d.id) })
  }

  const requestDeleteSelected = () => {
    if (busy || selectedIds.size === 0) return
    setPendingDeleteMany({ ids: [...selectedIds] })
  }

  /** حذف جماعي متسلسل (ملف + صف لكل معرف) مع إفساح للرسم بين الملفات. */
  const deleteMany = async (ids: string[]) => {
    if (busy || ids.length === 0) return
    setBusy(true)
    try {
      let data: RepoData = repo
      let failed = 0
      for (const id of ids) {
        try {
          data = await deleteDocument(repo.meta.id, repoPassword, id)
        } catch {
          failed += 1
        }
        await yieldToPaint()
      }
      onRepoUpdated(data)
      setSelectedIds(new Set())
      setSelectMode(false)
      if (failed > 0) toast.error(t('documentManager.saveSomeFailed', { count: failed }))
      else toast.success(t('documentManager.deletedManyStatus', { count: ids.length }))
    } catch (cause: unknown) {
      toast.error(errMsg(cause, t('documentManager.saveError')))
    } finally {
      setBusy(false)
    }
  }

  if (!headerMember) {
    return <p className="vault-empty">{t('pageRepoViewer.noRecords')}</p>
  }

  // وضع المعاينة: صفحة فارغة بمحتوى الملف فقط (الأزرار في هيدر الموبايل).
  if (previewDoc && staged.length === 0) {
    return (
      <section className="records-section" aria-label={t('documentManager.libraryAria')}>
        <FilePreviewPage
          doc={previewDoc}
          repoId={repo.meta.id}
          ownerName={ownerNameOf(previewDoc)}
          busy={busy}
          thumbs={previewIsVideo ? stripVideos : stripImages}
          onSelectThumb={(id) => setPreviewId(id)}
          onBack={closePreview}
          onSave={() => void savePreviewFile()}
          onShare={sharePreview}
          onSaveBytes={(bytes, fileName) => void savePreviewBytes(bytes, fileName)}
        />
      </section>
    )
  }

  return (
    <section className="records-section" aria-label={t('documentManager.libraryAria')}>
      <div className="member-tabs">
        <div className="member-tabs-head">
          <span>{t('pageRepoViewer.membersCount', { count: String(records.length).padStart(2, '0') })}</span>
          <Tooltip content={t('pageRepoViewer.addMemberTitle')}>
          <button
            type="button"
            className="member-add-btn"
            aria-label={t('pageRepoViewer.addMemberTitle')}
            disabled={busy}
            onClick={onAddMember}
          >
            <Plus size={15} />
          </button>
          </Tooltip>
        </div>
        <div className="member-tablist" role="group" aria-label={t('pageRepoViewer.memberTablistAria')}>
        <button
          type="button"
          className={`member-tab${showAll ? ' is-active' : ''}`}
          aria-pressed={showAll}
          onClick={() => owners.onToggleAll()}
        >
          <span className="tab-text">
            <span className="tab-name">{t('documentManager.kind_all')}</span>
          </span>
        </button>
        {records.map((member, index) => {
          const isActive = showAll || selMembers.has(member.id)
          return (
            <button
              key={member.id}
              id={`file-owner-${member.id}`}
              className={`member-tab${isActive ? ' is-active' : ''}`}
              type="button"
              aria-pressed={selMembers.has(member.id)}
              onClick={() => toggleMember(member.id)}
            >
              <span className="tab-index">0{index + 1}</span>
              <span className="tab-text">
                <span className="tab-name">{recordName(member, lang)}</span>
                <span className="tab-relation">{recordRelation(member, lang)}</span>
              </span>
              <UserRound className="tab-icon" size={17} strokeWidth={1.7} aria-hidden="true" />
            </button>
          )
        })}
        </div>
      </div>

      <div className="record-panel">
        <RepoTabsHeaderControl
          kicker={tabTitle(activeTab ?? { title: '', titleEn: '' }, lang) || t('documentLibrary.title')}
          title={headerTitle}
          subtitle={headerSub}
          onTitleClick={isMultiOwners ? showMultiNames : undefined}
          titleButtonAria={isMultiOwners ? t('documentManager.multiLabel') : undefined}
          fieldCountText={t('pageRepoViewer.fieldCount', { count: String(visible.length).padStart(2, '0') })}
          editTitle={t('pageRepoViewer.editMemberTitle')}
          editAria={t('pageRepoViewer.editMemberAria', { name: recordName(headerMember, lang) })}
          deleteTitle={t('pageRepoViewer.deleteMemberTitle')}
          deleteAria={t('pageRepoViewer.deleteMemberAria', { name: recordName(headerMember, lang) })}
          editDisabled={busy}
          deleteDisabled={busy}
          onEdit={onRenameMember}
          onDelete={onDeleteMember}
        />
        <div className="document-library">
      {used >= STORAGE_WARN_BYTES && (
        <p className="vault-error" role="status">{t('documentManager.storageWarn')}</p>
      )}

      <div className="viewer-actions-col file-actions-col">
        <div className="viewer-actions-row">
          <button
            type="button"
            className="add-field-btn"
            disabled={busy}
            onClick={() => void pickFiles()}
          >
            <Plus size={15} /> {t('documentManager.stageBtn')}
          </button>
          <button
            type="button"
            className="add-field-btn"
            disabled={busy || staged.length === 0}
            onClick={() => void saveStaged()}
          >
            <Save size={15} /> {t('documentManager.saveAllBtn')}
          </button>
        </div>
      </div>
      {busy && saveProgress && (
        <div className="save-progress" role="status" aria-live="polite">
          <span className="save-progress-label">
            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            {t('documentManager.savingProgress', { done: Math.min(saveProgress.done + 1, saveProgress.total), total: saveProgress.total })}
          </span>
          <span className="save-progress-track" aria-hidden="true">
            <span
              className="save-progress-fill"
              style={{ width: `${saveProgress.total > 0 ? Math.round((saveProgress.done / saveProgress.total) * 100) : 0}%` }}
            />
          </span>
        </div>
      )}

      <FileFilterBar
        kind={kind}
        onKindChange={handleKindChange}
        externalActive={extSet !== null}
        belowKindsSlot={(
          <div className="viewer-actions-col file-kind-col">
            <div className="file-sub-row" role="group" aria-label={t('documentManager.typeFilterAria')}>
              {(['archive', 'audio'] as const).map((key) => {
                const isActive = extSet === null && kind === key
                return (
                  <button
                    key={key}
                    type="button"
                    className={`add-field-btn${isActive ? ' is-active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => handleKindChange(key)}
                  >
                    {t(`documentManager.kind_${key}`)}
                  </button>
                )
              })}
              <button
                type="button"
                className={`add-field-btn span-3${extSet ? ' is-active' : ''}`}
                aria-pressed={extSet !== null}
                onClick={() => setExtModalOpen(true)}
              >
                <span dir="auto">{extSet ? (extId.startsWith('ext:') ? `.${extId.slice(4)}` : t(`documentManager.extGroup_${extId}`)) : t('documentManager.extFilter')}</span>
              </button>
            </div>
          </div>
        )}
        search={searchInput}
        onSearchChange={setSearchInput}
        onApplySearch={() => setSearch(searchInput)}
        onClearSearch={() => { setSearchInput(''); setSearch('') }}
        searching={search.trim() !== ''}
      />
      {visible.length === 0 && (
        <p className="vault-empty">{t('documentManager.emptyDocs')}</p>
      )}

      <FileCategoryModal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        cats={cats}
        activeKey={categoryStagedSrc ? (staged.find((s) => s.src === categoryStagedSrc)?.category ?? 'other') : categoryFilter}
        showAll={categoryStagedSrc === null}
        allLabel={t('documentManager.category_all')}
        catLabel={catLabel}
        onSelect={(key) => {
          if (categoryStagedSrc) patchStaged(categoryStagedSrc, { category: key })
          else setCategoryFilter(key)
        }}
      />
      <FileExtensionModal
        isOpen={extModalOpen}
        onClose={() => setExtModalOpen(false)}
        activeId={extId}
        allLabel={t('documentManager.extAll')}
        onSelect={handleExtSelect}
      />
      {pendingDelete && (
        <ModalMessages
          isOpen
          variant="danger"
          title={t('modalMessages.deleteTitle')}
          message={t('documentManager.deleteConfirm', { title: pendingDelete.title })}
          buttons={[
            { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
            { id: 'confirm', label: t('modalMessages.deleteBtn'), variant: 'danger' },
          ]}
          onButtonClicked={(info) => {
            if (info.id === 'confirm') {
              const id = pendingDelete.id
              if (previewId === id) setPreviewId(null)
              void runOp(() => deleteDocument(repo.meta.id, repoPassword, id), t('documentManager.deletedStatus'))
            }
          }}
          onClose={() => setPendingDelete(null)}
        />
      )}
      {pendingDeleteMany && (
        <ModalMessages
          isOpen
          variant="danger"
          title={t('modalMessages.deleteTitle')}
          message={t('documentManager.deleteManyConfirm', { count: pendingDeleteMany.ids.length })}
          buttons={[
            { id: 'cancel', label: t('modalMessages.cancelBtn'), variant: 'secondary' },
            { id: 'confirm', label: t('documentManager.deleteAllFilesBtn'), variant: 'danger' },
          ]}
          onButtonClicked={(info) => {
            if (info.id === 'confirm') {
              const ids = pendingDeleteMany.ids
              setPendingDeleteMany(null)
              if (previewId && ids.includes(previewId)) setPreviewId(null)
              void deleteMany(ids)
            }
          }}
          onClose={() => setPendingDeleteMany(null)}
        />
      )}
        </div>
      </div>
      {/* صفحة المعاينة تُعرض بفرع مستقل أعلاه (صفحة فارغة). */}
      {staged.length === 0 && visible.length > 0 ? (
      /* كارد الملفات المحفوظة — منفصلة عن اللوحة. */
      <div className="file-section-card">
        <div className="mb-2 flex flex-col gap-2">
          {selectMode ? (
            <>
              <div className="viewer-actions-row viewer-actions-even">
                <Tooltip content={t('documentManager.cancelSelectBtn')} className="viewer-actions-even-item">
                  <button
                    type="button"
                    className="add-field-btn w-full is-active"
                    aria-pressed
                    disabled={busy}
                    onClick={toggleSelectMode}
                    aria-label={t('documentManager.cancelSelectBtn')}
                    style={{ border: '1px dashed green' }}
                  >
                    <ListChecks size={15} /> {t('documentManager.cancelSelectBtn')}
                  </button>
                </Tooltip>
                <Tooltip content={t('documentManager.selectAllBtn')} className="viewer-actions-even-item">
                  <button
                    type="button"
                    className="add-field-btn w-full"
                    disabled={busy || visible.length === 0}
                    onClick={selectAllVisible}
                  >
                    {t('documentManager.selectAllBtn')}
                  </button>
                </Tooltip>
              </div>
              <div className="viewer-actions-row viewer-actions-even">
                <Tooltip content={t('documentManager.deleteSelectedBtn', { count: selectedIds.size })} className="viewer-actions-even-item">
                  <button
                    type="button"
                    className="add-field-btn w-full"
                    disabled={busy || selectedIds.size === 0}
                    onClick={requestDeleteSelected}
                    aria-label={t('documentManager.deleteSelectedBtn', { count: selectedIds.size })}
                  >
                    <Trash2 size={15} /> {t('documentManager.deleteSelectedBtn', { count: selectedIds.size })}
                  </button>
                </Tooltip>
              </div>
            </>
          ) : (
            <div className="viewer-actions-row viewer-actions-even">
              <Tooltip content={t('documentManager.selectBtn')} className="viewer-actions-even-item">
                <button
                  type="button"
                  className="add-field-btn w-full"
                  aria-pressed={false}
                  disabled={busy}
                  onClick={toggleSelectMode}
                  aria-label={t('documentManager.selectBtn')}
                  style={{ border: '1px dashed green' }}
                >
                  <ListChecks size={15} /> {t('documentManager.selectBtn')}
                </button>
              </Tooltip>
              <Tooltip content={t('documentManager.deleteAllFilesBtn')} className="viewer-actions-even-item">
                <button
                  type="button"
                  className="add-field-btn w-full"
                  disabled={busy || ownerDocs.length === 0}
                  onClick={requestDeleteAll}
                  aria-label={t('documentManager.deleteAllFilesBtn')}
                  style={{ border: '1px dashed green' }}
                >
                  <Trash2 size={15} /> {t('documentManager.deleteAllFilesBtn')}
                </button>
              </Tooltip>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5 max-[560px]:grid-cols-1 min-[861px]:grid-cols-3" role="list">
          {visible.slice(0, fileLimit).map((doc) => (
            editingDoc?.id === doc.id ? (
              <FileCardEditor
                key={doc.id}
                doc={editingDoc}
                records={records}
                customs={categories}
                fieldLang={fieldLang}
                busy={busy}
                onCancel={() => setEditingDoc(null)}
                onSave={submitEdit}
              />
            ) : (
              <FileGridCard
                key={doc.id}
                doc={doc}
                isPreview={previewId === doc.id}
                busy={busy}
                ownerName={ownerNameOf(doc)}
                categoryName={catLabel(doc.category)}
                onPreview={() => requestPreview(doc)}
                onEdit={() => setEditingDoc(doc)}
                onDelete={() => askDelete(doc)}
                selectMode={selectMode}
                selected={selectedIds.has(doc.id)}
                onToggleSelect={() => toggleSelectOne(doc.id)}
                onLongPressSelect={() => longPressSelect(doc.id)}
              />
            )
          ))}
        </div>
        {visible.length > fileLimit && (
          <button
            type="button"
            className="add-field-btn mt-2.5 w-full"
            onClick={() => setFileLimit((prev) => prev + 25)}
          >
            {t('documentManager.showMoreBtn', { left: visible.length - fileLimit })}
          </button>
        )}

        <div className="h-5" aria-hidden="true" />
      </div>
      ) : null}
      {/* كارد المؤقتة البيضاء — تظهر فقط عند وجود ملفات مجهزة. */}
      {staged.length > 0 && (
      <div className="file-section-card min-h-28">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[0.8125rem] font-semibold" dir="auto">{t('documentManager.stagedTitle', { count: staged.length })}</span>
          <Tooltip content={t('documentManager.clearStagedBtn')}>
            <button
              type="button"
              className="add-field-btn"
              disabled={busy}
              onClick={clearStaged}
              aria-label={t('documentManager.clearStagedBtn')}
            >
              <Trash2 size={15} /> {t('documentManager.clearStagedBtn')}
            </button>
          </Tooltip>
        </div>
        <FileStagingList
          staged={staged}
          busy={busy}
          titleErrors={titleErrors}
          onPatch={patchStaged}
          onUnstage={(src) => {
            setStagedList(staged.filter((s) => s.src !== src))
            setTitleErrors((prev) => {
              if (!prev.has(src)) return prev
              const next = new Set(prev)
              next.delete(src)
              return next
            })
          }}
          onSaveOne={(src) => void saveOne(src)}
          onRequestCategory={(src) => { setCategoryStagedSrc(src); setCategoryModalOpen(true) }}
        />
      </div>
      )}
    </section>
  )
}

const PageTableFiles = forwardRef<FileManagerApi, PageTableFilesProps>(PageTableFilesInner)

export default PageTableFiles
