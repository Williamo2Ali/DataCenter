// تبويب «العرض» — حجم الخط ونوعه + تكبير الواجهة.
// (الملف باسم TabApperance كما هو في المشروع.)
// الأنماط أدوات Tailwind؛ القواعد المقابلة حُذفت من index.css.

import { Monitor, RotateCcw, Type } from 'lucide-react'
import { defaultAppearance, type AppSettings } from '../lib/appSettings'
import { useLanguage } from '../language/LanguageContext'

const fontOptions = [
  { value: 'IBM Plex Sans Arabic', label: 'IBM Plex Sans Arabic' },
  { value: 'Cairo', label: 'Cairo' },
  { value: 'Markazi Text', label: 'Markazi Text' },
  { value: 'Carlito', label: 'Carlito' },
  { value: 'Tahoma', label: 'Tahoma · Windows' },
  { value: 'Segoe UI', label: 'Segoe UI · Windows' },
  { value: 'Arial', label: 'Arial' },
]

type TabApperanceProps = {
  settings: AppSettings
  onChange: (settings: AppSettings) => void
}

const ROW =
  'grid min-h-28 grid-cols-[minmax(0,1fr)_minmax(260px,400px)] items-center gap-7 border-b border-[#edf0ed] ' +
  'max-[860px]:min-h-0 max-[860px]:grid-cols-[minmax(0,1fr)] max-[860px]:gap-[13px] max-[860px]:py-[18px] ' +
  'dark:border-[#3b3b41]'

const LABEL_GROUP = 'flex items-center gap-3'
const LABEL_ICON = 'grid size-[38px] flex-none place-items-center rounded bg-[#edf4ef] text-green dark:bg-[#303035] dark:text-[#a2d3b6]'
const LABEL_COPY = 'flex flex-col gap-1'
const LABEL_TEXT = 'text-[0.9375rem] font-semibold text-[#2e413c] dark:text-[#e4e4e8]'
const LABEL_DESC = 'text-[0.75rem] text-[#85908c] dark:text-[#b0b0b6]'

const RANGE_WRAP = 'grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-[7px] max-[860px]:w-full'
const RANGE_VALUE = 'font-[IBM_Plex_Sans_Arabic,sans-serif] text-[0.75rem] font-semibold text-green'
const RANGE_INPUT = 'col-span-full m-0 w-full cursor-pointer accent-green focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-2'
const RANGE_ENDS = 'col-span-full flex justify-between text-[0.625rem] text-[#99a39f] [font-family:DM_Mono,monospace]'

const SELECT =
  'min-h-[42px] w-full cursor-pointer rounded border border-[#dfe6e0] bg-[#f8faf8] px-3 text-[0.875rem] text-[#344741] ' +
  'focus-visible:outline-2 focus-visible:outline-orange focus-visible:outline-offset-2 ' +
  'dark:border-[#404046] dark:bg-[#29292d] dark:text-[#d7d7db]'

const FOOTER =
  'flex min-h-[76px] items-center justify-between gap-[15px] px-7 py-[15px] ' +
  'max-[860px]:flex-col max-[860px]:items-start max-[860px]:px-[18px] max-[560px]:px-3.5 max-[560px]:py-3'

const PREVIEW = 'm-0 text-[0.8125rem] text-[#596a64] dark:text-[#d0d0d4]'

export default function TabApperance({ settings, onChange }: TabApperanceProps) {
  const { t } = useLanguage()

  return (
    <div className="px-7 max-[860px]:px-[18px] max-[560px]:px-3.5">
      <div className={ROW}>
        <div className={LABEL_GROUP}>
          <span className={LABEL_ICON}><Type size={18} /></span>
          <span className={LABEL_COPY}>
            <span className={LABEL_TEXT}>{t('settingsPanel.fontSizeLabel')}</span>
            <span className={LABEL_DESC}>{t('settingsPanel.fontSizeDesc')}</span>
          </span>
        </div>
        <div className={RANGE_WRAP}>
          <output htmlFor="font-size-setting" className={RANGE_VALUE}>{settings.fontSize}px</output>
          <input
            id="font-size-setting"
            type="range"
            min="14"
            max="32"
            step="1"
            className={RANGE_INPUT}
            value={settings.fontSize}
            onChange={(event) => onChange({ ...settings, fontSize: Number(event.target.value) })}
          />
          <div className={RANGE_ENDS}><span>14px</span><span>32px</span></div>
        </div>
      </div>

      <div className={ROW}>
        <div className={LABEL_GROUP}>
          <span className={LABEL_ICON}><Type size={18} /></span>
          <span className={LABEL_COPY}>
            <span className={LABEL_TEXT}>{t('settingsPanel.inputFontSizeLabel')}</span>
            <span className={LABEL_DESC}>{t('settingsPanel.inputFontSizeDesc')}</span>
          </span>
        </div>
        <div className={RANGE_WRAP}>
          <output htmlFor="input-font-size-setting" className={RANGE_VALUE}>{settings.inputFontSize ?? 16}px</output>
          <input
            id="input-font-size-setting"
            type="range"
            min="14"
            max="32"
            step="1"
            className={RANGE_INPUT}
            value={settings.inputFontSize ?? 16}
            onChange={(event) => onChange({ ...settings, inputFontSize: Number(event.target.value) })}
          />
          <div className={RANGE_ENDS}><span>14px</span><span>32px</span></div>
        </div>
      </div>

      <div className={ROW}>
        <div className={LABEL_GROUP}>
          <span className={LABEL_ICON}><Type size={18} /></span>
          <span className={LABEL_COPY}>
            <span className={LABEL_TEXT}>{t('settingsPanel.buttonFontSizeLabel')}</span>
            <span className={LABEL_DESC}>{t('settingsPanel.buttonFontSizeDesc')}</span>
          </span>
        </div>
        <div className={RANGE_WRAP}>
          <output htmlFor="button-font-size-setting" className={RANGE_VALUE}>{settings.buttonFontSize ?? 14}px</output>
          <input
            id="button-font-size-setting"
            type="range"
            min="12"
            max="32"
            step="1"
            className={RANGE_INPUT}
            value={settings.buttonFontSize ?? 14}
            onChange={(event) => onChange({ ...settings, buttonFontSize: Number(event.target.value) })}
          />
          <div className={RANGE_ENDS}><span>12px</span><span>32px</span></div>
        </div>
      </div>

      <div className={ROW}>
        <div className={LABEL_GROUP}>
          <span className={LABEL_ICON}><Type size={18} /></span>
          <span className={LABEL_COPY}>
            <span className={LABEL_TEXT}>{t('settingsPanel.buttonIconSizeLabel')}</span>
            <span className={LABEL_DESC}>{t('settingsPanel.buttonIconSizeDesc')}</span>
          </span>
        </div>
        <div className={RANGE_WRAP}>
          <output htmlFor="button-icon-size-setting" className={RANGE_VALUE}>{settings.buttonIconSize ?? 16}px</output>
          <input
            id="button-icon-size-setting"
            type="range"
            min="12"
            max="32"
            step="1"
            className={RANGE_INPUT}
            value={settings.buttonIconSize ?? 16}
            onChange={(event) => onChange({ ...settings, buttonIconSize: Number(event.target.value) })}
          />
          <div className={RANGE_ENDS}><span>12px</span><span>32px</span></div>
        </div>
      </div>

      <div className={ROW}>
        <div className={LABEL_GROUP}>
          <span className={LABEL_ICON}><Type size={18} /></span>
          <span className={LABEL_COPY}>
            <span className={LABEL_TEXT}>{t('settingsPanel.fontFamilyLabel')}</span>
            <span className={LABEL_DESC}>{t('settingsPanel.fontFamilyDesc')}</span>
          </span>
        </div>
        <label>
          <span className="sr-only">{t('settingsPanel.fontFamilyLabel')}</span>
          <select
            className={SELECT}
            value={settings.fontFamily}
            onChange={(event) => onChange({ ...settings, fontFamily: event.target.value })}
          >
            {fontOptions.map((font) => <option value={font.value} key={font.value}>{font.label}</option>)}
          </select>
        </label>
      </div>

      <div className={ROW}>
        <div className={LABEL_GROUP}>
          <span className={LABEL_ICON}><Monitor size={18} /></span>
          <span className={LABEL_COPY}>
            <span className={LABEL_TEXT}>{t('settingsPanel.displayZoomLabel')}</span>
            <span className={LABEL_DESC}>{t('settingsPanel.displayZoomDesc')}</span>
          </span>
        </div>
        <div className={RANGE_WRAP}>
          <output htmlFor="display-zoom-setting" className={RANGE_VALUE}>{settings.displayZoom}%</output>
          <input
            id="display-zoom-setting"
            type="range"
            min="80"
            max="120"
            step="5"
            className={RANGE_INPUT}
            value={settings.displayZoom}
            onChange={(event) => onChange({ ...settings, displayZoom: Number(event.target.value) })}
          />
          <div className={RANGE_ENDS}><span>80%</span><span>120%</span></div>
        </div>
      </div>

      <div className={ROW}>
        <div className={LABEL_GROUP}>
          <span className={LABEL_ICON}><Monitor size={18} /></span>
          <span className={LABEL_COPY}>
            <span className={LABEL_TEXT}>{t('settingsPanel.fieldLangLabel')}</span>
            <span className={LABEL_DESC}>{t('settingsPanel.fieldLangDesc')}</span>
          </span>
        </div>
        <label>
          <span className="sr-only">{t('settingsPanel.fieldLangLabel')}</span>
          <select
            className={SELECT}
            value={settings.fieldLang ?? 'ar'}
            onChange={(event) => onChange({ ...settings, fieldLang: event.target.value as AppSettings['fieldLang'] })}
          >
            <option value="ar">{t('settingsPanel.fieldLangAr')}</option>
            <option value="en">{t('settingsPanel.fieldLangEn')}</option>
          </select>
        </label>
      </div>

      <footer className={FOOTER}>
        <p className={PREVIEW}><span className="me-2 text-[0.6875rem] text-[#89958f]">{t('settingsPanel.previewLabel')}</span> {t('settingsPanel.previewText')}</p>
        <button type="button" onClick={() => onChange({ ...settings, ...defaultAppearance })} className="vault-secondary max-lg:hidden">
          <RotateCcw size={15} /> {t('settingsPanel.resetBtn')}
        </button>
      </footer>
    </div>
  )
}