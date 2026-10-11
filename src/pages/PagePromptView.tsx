// صفحة البرومبت والاستيراد الذكي — توليد برومبت مخصص (نوع المستند × اللغة)
// ينسخه المستخدم لذكاء خارجي مع الصورة، ثم يلصق JSON هنا: تحقق ← معاينة مطابقة
// للأعمدة الفيزيائية ← تأكيد يكتب في الجدول مباشرة عبر أوامر upsert_*.
// المجهول يُتجاهَل بصدق ولا يُخمَّن.
import { useMemo, useState } from 'react'
import { Check, ClipboardPaste, Copy } from 'lucide-react'
import {
  upsertCivil, upsertNationalId, upsertPassport, upsertStudy, updateCoreExtra,
  type RepoData,
} from '../repos/repoService'
import { buildPrompt, PROMPT_DOC_TYPES, type PromptDocType, type PromptLang } from '../lib/aiPrompts'
import { recordName } from '../lib/records'
import { matchToPhysicalColumns, parseAiJson, type AiMappedRow, type AiFieldItem } from '../lib/aiImport'
import { PHYSICAL_TABLES, applyBaseLabels, customColumnToDef, physicalLabel, type PhysicalTableId } from '../lib/physicalTables'
import { ClearTextArea } from '../components/ClearTextInput'
import { useLanguage } from '../language/LanguageContext'

type PagePromptViewProps = {
  repo: RepoData | null
  repoPassword: string | null
  onRepoUpdated: (data: RepoData) => void
}

const DOC_TABLE: Record<PromptDocType, PhysicalTableId | null> = {
  passport: 'passports',
  national_id: 'national_ids',
  civil: 'civil',
  study: 'study',
  general: null,
}

const PHYSICAL_IDS: PhysicalTableId[] = ['passports', 'national_ids', 'civil', 'study']

type Preview = { tableId: PhysicalTableId; memberId: string; mapped: AiMappedRow[]; unmatched: AiFieldItem[] }

export default function PagePromptView({ repo, repoPassword, onRepoUpdated }: PagePromptViewProps) {
  const { t, lang } = useLanguage()
  const [docType, setDocType] = useState<PromptDocType>('passport')
  const [docLang, setDocLang] = useState<PromptLang>('both')
  const [copied, setCopied] = useState(false)
  const [pasted, setPasted] = useState('')
  const [parseError, setParseError] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const prompt = useMemo(() => buildPrompt(docType, docLang), [docType, docLang])

  const members = useMemo(
    () => [...(repo?.peoples ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [repo],
  )
  const [tableId, setTableId] = useState<PhysicalTableId | ''>('')
  const [memberId, setMemberId] = useState('')
  const activeTableId: PhysicalTableId | '' = DOC_TABLE[docType] ?? tableId
  const activeMemberId = memberId || members[0]?.id || ''

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const validate = () => {
    setParseError('')
    setPreview(null)
    setNotice('')
    setError('')
    if (!repo || !activeTableId || !activeMemberId) {
      setParseError(t('promptPage.err_noTarget'))
      return
    }
    const result = parseAiJson(pasted)
    if (!result.ok) {
      setPreview(null)
      setParseError(t(`promptPage.err_${result.error.split(':')[0]}`, { index: result.error.split(':')[1] ?? '' }))
      return
    }
    const match = matchToPhysicalColumns(result.items, [
      // المخفية والمحذوفة ناعماً لا تُعرض ولا تُستورَد — تُترَك للمجهول بصدق.
      // وتسميات التجاوز هي ما تُطابَق به الأعمدة.
      ...applyBaseLabels(
        PHYSICAL_TABLES[activeTableId],
        repo.customTables.find((ct) => ct.tabId === activeTableId)?.labels ?? [],
      ).filter((d) => {
        const ct = repo.customTables.find((ct) => ct.tabId === activeTableId)
        return ![...(ct?.hidden ?? []), ...(ct?.deleted ?? [])].includes(d.key)
      }),
      ...((repo.customTables.find((ct) => ct.tabId === activeTableId)?.columns ?? []).map(customColumnToDef)),
    ])
    if (match.mapped.length === 0) {
      setParseError(t('promptPage.noMapped'))
      return
    }
    const targetTab = repo.tabs.find((tb) => tb.id === activeTableId)
    if (targetTab?.isDeleted) {
      setParseError(t('promptPage.targetDeleted'))
      return
    }
    setPreview({ tableId: activeTableId, memberId: activeMemberId, mapped: match.mapped, unmatched: match.unmatched })
  }

  const confirm = async () => {
    if (!repo || !preview || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const baseKeys = new Set(PHYSICAL_TABLES[preview.tableId].map((d) => d.key))
      const baseValues: Record<string, string | number | null> = {}
      const extraValues: Record<string, string | number | null> = {}
      for (const m of preview.mapped) {
        if (baseKeys.has(m.def.key)) baseValues[m.def.key] = m.value
        else extraValues[m.def.key] = m.value
      }
      // دمج مع الصف الحالي — أوامر upsert تتطلب كل البارامترات.
      const currentRows: Record<PhysicalTableId, Record<string, unknown> | undefined> = {
        passports: repo.passports.find((r) => r.recordId === preview.memberId) as unknown as Record<string, unknown> | undefined,
        national_ids: repo.nationalIds.find((r) => r.recordId === preview.memberId) as unknown as Record<string, unknown> | undefined,
        civil: repo.civils.find((r) => r.recordId === preview.memberId) as unknown as Record<string, unknown> | undefined,
        study: repo.studies.find((r) => r.recordId === preview.memberId) as unknown as Record<string, unknown> | undefined,
      }
      const input = { ...(currentRows[preview.tableId] ?? {}), ...baseValues, recordId: preview.memberId }
      delete (input as Record<string, unknown>).createdAt
      delete (input as Record<string, unknown>).updatedAt
      delete (input as Record<string, unknown>).extra
      let data: RepoData
      switch (preview.tableId) {
        case 'passports': data = await upsertPassport(repo.meta.id, repoPassword, input); break
        case 'national_ids': data = await upsertNationalId(repo.meta.id, repoPassword, input); break
        case 'civil': data = await upsertCivil(repo.meta.id, repoPassword, input); break
        default: data = await upsertStudy(repo.meta.id, repoPassword, input); break
      }
      if (Object.keys(extraValues).length > 0) {
        data = await updateCoreExtra(repo.meta.id, repoPassword, preview.tableId, preview.memberId, extraValues as Record<string, unknown>)
      }
      onRepoUpdated(data)
      setPreview(null)
      setPasted('')
      setNotice(t('promptPage.importedValues', { count: preview.mapped.length }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('promptPage.importError'))
    } finally {
      setBusy(false)
    }
  }

  if (!repo) {
    return (
      <section className="dashboard" aria-label={t('promptPage.pageAria')}>
        <p className="vault-empty">{t('promptPage.openRepoFirstHint')}</p>
      </section>
    )
  }

  return (
    <section className="dashboard" aria-label={t('promptPage.pageAria')}>
      <header className="dashboard-header">
        <div className="dashboard-title-group">
          <p className="dashboard-kicker">{t('promptPage.kicker')} — {repo.meta.name}</p>
          <h1 className="dashboard-title">{t('promptPage.title')}</h1>
          <p className="dashboard-subtitle">{t('promptPage.subtitle')}</p>
        </div>
      </header>

      <div className="modal-field">
        <label htmlFor="prompt-doctype" className="modal-label">{t('promptPage.docTypeLabel')}</label>
        <select
          id="prompt-doctype" className="modal-input" value={docType} disabled={busy}
          onChange={(e) => { setDocType(e.target.value as PromptDocType); setPreview(null) }}
        >
          {PROMPT_DOC_TYPES.map((dt) => <option key={dt} value={dt}>{t(`promptPage.doctype_${dt}`)}</option>)}
        </select>
      </div>
      <div className="modal-field">
        <label htmlFor="prompt-doclang" className="modal-label">{t('promptPage.docLangLabel')}</label>
        <select
          id="prompt-doclang" className="modal-input" value={docLang} disabled={busy}
          onChange={(e) => setDocLang(e.target.value as PromptLang)}
        >
          {(['ar', 'en', 'both'] as const).map((l) => <option key={l} value={l}>{t(`promptPage.doclang_${l}`)}</option>)}
        </select>
      </div>
      <div className="modal-field">
        <label htmlFor="prompt-text" className="modal-label">{t('promptPage.promptLabel')}</label>
        <ClearTextArea id="prompt-text" className="modal-input" value={prompt} readOnly rows={6} dir="auto" onChange={() => {}} />
        <p className="m-0 mt-1 text-[0.6875rem] text-[#9aa49f]">{t('promptPage.promptHint')}</p>
      </div>
      <div className="field-edit-actions">
        <button type="button" className="vault-primary vault-small" onClick={() => void copyPrompt()}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t('promptPage.copiedBtn') : t('promptPage.copyBtn')}
        </button>
      </div>

      <div className="modal-field">
        <label htmlFor="prompt-member" className="modal-label">{t('promptPage.targetMember')}</label>
        <select
          id="prompt-member" className="modal-input" value={activeMemberId} disabled={busy}
          onChange={(e) => { setMemberId(e.target.value); setPreview(null) }}
        >
          {members.map((m) => <option key={m.id} value={m.id}>{recordName(m, lang)}</option>)}
        </select>
      </div>
      {DOC_TABLE[docType] === null && (
        <div className="modal-field">
          <label htmlFor="prompt-table" className="modal-label">{t('promptPage.targetTable')}</label>
          <select
            id="prompt-table" className="modal-input" value={tableId} disabled={busy}
            onChange={(e) => { setTableId(e.target.value as PhysicalTableId | ''); setPreview(null) }}
          >
            <option value="">{t('promptPage.chooseTable')}</option>
            {PHYSICAL_IDS.map((id) => {
              const tab = repo.tabs.find((tb) => tb.id === id)
              const title = tab ? (lang === 'en' ? tab.titleEn || tab.title : tab.title) : id
              return <option key={id} value={id}>{title}</option>
            })}
          </select>
        </div>
      )}

      <div className="modal-field">
        <label htmlFor="prompt-paste" className="modal-label">{t('promptPage.pasteLabel')}</label>
        <ClearTextArea
          id="prompt-paste" className="modal-input" value={pasted}
          onChange={(e) => { setPasted(e.target.value); setPreview(null) }}
          rows={5} dir="auto" placeholder="[{&quot;label&quot;:…}]"
        />
      </div>
      <div className="field-edit-actions">
        <button type="button" className="vault-secondary vault-small" disabled={busy || !pasted.trim()} onClick={validate}>
          <ClipboardPaste size={15} /> {t('promptPage.validateBtn')}
        </button>
      </div>

      {parseError && <p className="modal-error" role="alert">{parseError}</p>}
      {error && <p className="modal-error" role="alert">{error}</p>}
      {notice && <p className="vault-notice" role="status">{notice}</p>}

      {preview && (
        <div className="mt-4">
          <p className="m-0 mb-2 text-[0.8125rem] font-semibold">
            {t('promptPage.previewTitle', { count: preview.mapped.length })}
          </p>
          <ul className="m-0 flex flex-col gap-2 p-0" style={{ listStyle: 'none' }}>
            {preview.mapped.map((m) => (
              <li key={m.def.key} className="rounded border border-[#e8ede9] bg-[#f8faf8] px-3 py-2 dark:border-[#3b3b41] dark:bg-[#242428]">
                <span className="block truncate text-[0.8125rem] font-semibold" dir="auto">
                  {m.item.label || m.item.labelEn}
                </span>
                <span className="block truncate text-[0.75rem] text-[#63716d]" dir="auto">
                  {t('promptPage.mappedTo', { column: physicalLabel(m.def, lang === 'en' ? 'en' : 'ar') })}: {String(m.value)}
                </span>
              </li>
            ))}
            {preview.unmatched.map((item, i) => (
              <li key={`u-${i}`} className="rounded border border-dashed border-[#dfe6e0] px-3 py-2 dark:border-[#404046]">
                <span className="block truncate text-[0.75rem] text-[#84908c]" dir="auto">
                  {item.label || item.labelEn} — {t('promptPage.ignoredBadge')}
                </span>
              </li>
            ))}
          </ul>
          <div className="field-edit-actions">
            <button type="button" className="vault-primary vault-small" disabled={busy} onClick={() => void confirm()}>
              <Check size={15} /> {t('promptPage.confirmBtn')}
            </button>
            <button type="button" className="vault-secondary vault-small" disabled={busy} onClick={() => setPreview(null)}>
              {t('promptPage.cancelBtn')}
            </button>
          </div>
        </div>
      )}
      <div className="h-5" aria-hidden="true" />
    </section>
  )
}
