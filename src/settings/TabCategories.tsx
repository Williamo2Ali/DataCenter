// تبويب «تصنيفات الملفات» — الافتراضيات الأربعة ثابتة، والمستخدم يضيف/يحرر مخصصه.
// تُحفَظ في إعدادات التطبيق (عامة)، وتظهر في قوائم التصنيف بتبويب الملفات.
import { useState } from 'react'
import { Check, Pencil, Plus, Save, Tags, Trash2, X } from 'lucide-react'
import type { AppSettings, DocCategoryCustom } from '../lib/appSettings'
import { DOC_CATEGORIES } from '../lib/documents'
import { useLanguage } from '../language/LanguageContext'
import { Tooltip } from "../components/Tooltip"
import { ClearTextInput } from '../components/ClearTextInput'

type TabCategoriesProps = {
  settings: AppSettings
  onChange: (settings: AppSettings) => void
}

type FormState = { ar: string; en: string }

export default function TabCategories({ settings, onChange }: TabCategoriesProps) {
  const { t } = useLanguage()
  const [adding, setAdding] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({ ar: '', en: '' })
  const [error, setError] = useState('')

  const customs = settings.docCategories ?? []
  const builtinLabel = (key: string) => t(`documentManager.category_${key}`)

  const startAdd = () => {
    setForm({ ar: '', en: '' })
    setError('')
    setEditingKey(null)
    setAdding(true)
  }

  const startEdit = (cat: DocCategoryCustom) => {
    setForm({ ar: cat.ar, en: cat.en })
    setError('')
    setAdding(false)
    setEditingKey(cat.key)
  }

  const submit = () => {
    const ar = form.ar.trim()
    const en = form.en.trim()
    if (!ar && !en) {
      setError(t('fileCats.nameRequiredError'))
      return
    }
    const key = editingKey ?? (ar || en)
    if (!editingKey) {
      const taken = (DOC_CATEGORIES as readonly string[]).includes(key) || customs.some((c) => c.key === key)
      if (taken) {
        setError(t('fileCats.keyTakenError'))
        return
      }
      onChange({ ...settings, docCategories: [...customs, { key, ar, en }] })
    } else {
      onChange({ ...settings, docCategories: customs.map((c) => (c.key === editingKey ? { ...c, ar, en } : c)) })
    }
    setAdding(false)
    setEditingKey(null)
    setError('')
  }

  const askDelete = (cat: DocCategoryCustom) => {
    if (!window.confirm(t('fileCats.deleteConfirm', { name: cat.ar || cat.en }))) return
    onChange({ ...settings, docCategories: customs.filter((c) => c.key !== cat.key) })
    setAdding(false)
    setEditingKey(null)
    setError('')
  }

  const cancelForm = () => {
    setAdding(false)
    setEditingKey(null)
    setError('')
  }

  const formOpen = adding || editingKey !== null

  return (
    <div className="px-7 pt-[18px] max-[860px]:px-[18px] max-[560px]:px-3.5">
      <div className="mb-3.5 flex items-start justify-between gap-3.5 max-[860px]:flex-col max-[860px]:items-stretch">
        <div>
          <p className="m-0 text-[0.75rem] text-[#7c8984]">{t('fileCats.note')}</p>
          <p className="mt-1 mb-0 text-[0.6875rem] text-[#9aa49f] dark:text-[#8f8f96]">{t('fileCats.hint')}</p>
        </div>
        {!formOpen && (
          <button type="button" className="vault-primary vault-small max-[860px]:w-full" onClick={startAdd}>
            <Plus size={15} /> {t('fileCats.addBtn')}
          </button>
        )}
      </div>

      {error && <p className="vault-error" role="alert">{error}</p>}

      {formOpen && (
        <div className="mb-3 rounded border border-[#e8ede9] bg-white p-3 dark:border-[#3b3b41] dark:bg-[#242428]">
          <div className="grid grid-cols-2 gap-2 max-[560px]:grid-cols-1">
            <div>
              <label className="mb-1 block text-[0.6875rem] font-semibold text-[#63716d] dark:text-[#b0b0b6]">{t('fileCats.nameAr')}</label>
              <ClearTextInput className="modal-input" type="text" value={form.ar} onChange={(e) => setForm({ ...form, ar: e.target.value })} dir="auto" maxLength={40} autoComplete="off" />
            </div>
            <div>
              <label className="mb-1 block text-[0.6875rem] font-semibold text-[#63716d] dark:text-[#b0b0b6]">{t('fileCats.nameEn')}</label>
              <ClearTextInput className="modal-input" type="text" value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} dir="ltr" maxLength={40} autoComplete="off" />
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" className="vault-primary vault-small" onClick={submit}>
              <Check size={15} /> {t('fileCats.saveBtn')}
            </button>
            <button type="button" className="vault-secondary vault-small" onClick={() => { setAdding(false); setEditingKey(null); setError('') }}>
              <X size={15} /> {t('fileCats.cancelBtn')}
            </button>
          </div>
        </div>
      )}

      <div className="mb-2 text-[0.75rem] font-semibold text-[#63716d] dark:text-[#b0b0b6]">{t('fileCats.builtinTitle')}</div>
      {(DOC_CATEGORIES as readonly string[]).map((key) => (
        <div key={key} className="mb-1.5 flex items-center gap-2 rounded border border-[#e8ede9] bg-[#f8faf8] px-3 py-2 dark:border-[#3b3b41] dark:bg-[#242428]">
          <Tags size={14} aria-hidden="true" className="flex-none text-[#84908c]" />
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.8125rem] text-[#2e413c] dark:text-[#e6e6ea]" dir="auto">{builtinLabel(key)}</span>
        </div>
      ))}

      <div className="mt-3 mb-2 text-[0.75rem] font-semibold text-[#63716d] dark:text-[#b0b0b6]">
        {t('fileCats.customTitle', { count: customs.length })}
      </div>
      {customs.length === 0 ? (
        <p className="m-0 rounded border border-dashed border-[#dfe6e0] px-3 py-3 text-center text-[0.75rem] text-[#84908d] dark:border-[#404046] dark:text-[#b0b0b6]">
          {t('fileCats.emptyCustom')}
        </p>
      ) : (
        customs.map((cat) => (
          editingKey === cat.key ? (
            <div key={cat.key} className="mb-1.5 rounded border border-[#e8ede9] bg-white p-3 dark:border-[#3b3b41] dark:bg-[#242428]">
              {error && <p className="vault-error" role="alert">{error}</p>}
              <div className="grid grid-cols-2 gap-2 max-[560px]:grid-cols-1">
                <div>
                  <label className="mb-1 block text-[0.6875rem] font-semibold text-[#63716d] dark:text-[#b0b0b6]">{t('fileCats.nameAr')}</label>
                  <ClearTextInput className="modal-input" type="text" value={form.ar} onChange={(e) => setForm({ ...form, ar: e.target.value })} dir="auto" maxLength={40} autoComplete="off" />
                </div>
                <div>
                  <label className="mb-1 block text-[0.6875rem] font-semibold text-[#63716d] dark:text-[#b0b0b6]">{t('fileCats.nameEn')}</label>
                  <ClearTextInput className="modal-input" type="text" value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} dir="ltr" maxLength={40} autoComplete="off" />
                </div>
              </div>
              <div className="field-edit-actions equal-btns">
                <button type="button" className="vault-primary vault-small" onClick={submit}>
                  <Save size={16} /> {t('fileCats.saveBtn')}
                </button>
                <button type="button" className="vault-secondary vault-small" onClick={cancelForm}>
                  <X size={16} /> {t('fileCats.cancelBtn')}
                </button>
                <button type="button" className="vault-ghost-danger vault-small" onClick={() => askDelete(cat)}>
                  <Trash2 size={17} /> {t('pageRepoViewer.deleteBtn')}
                </button>
              </div>
            </div>
          ) : (
            <div key={cat.key} className="mb-1.5 flex items-center gap-2 rounded border border-[#e8ede9] bg-[#f8faf8] px-3 py-2 dark:border-[#3b3b41] dark:bg-[#242428]">
              <Tags size={14} aria-hidden="true" className="flex-none text-[#84908c]" />
              <Tooltip content={cat.key}>
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.8125rem] text-[#2e413c] dark:text-[#e6e6ea]" dir="auto">
                {cat.ar}{cat.en && cat.en !== cat.ar ? ` · ${cat.en}` : ''}
              </span>
              </Tooltip>
              <Tooltip content={t('fileCats.editBtn')}>
              <button type="button" className="viewer-icon-button viewer-icon-action flex-none"
                aria-label={t('fileCats.editBtn')} onClick={() => startEdit(cat)}>
                <Pencil size={14} />
              </button>
              </Tooltip>
            </div>
          )
        ))
      )}
      <div className="h-5" aria-hidden="true" />
    </div>
  )
}
