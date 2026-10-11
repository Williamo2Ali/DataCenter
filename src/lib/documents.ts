// مساعدات تبويب الملفات — النوع من الامتداد (تلقائي)، والتصنيفات مُدارة بمفاتيح.
import type { FieldLang } from './appSettings'

export type FileKind = 'pdf' | 'image' | 'text' | 'other'

/** التصنيفات الافتراضية الأربعة (مفاتيح ثابتة غير قابلة للحذف). */
export const DOC_CATEGORIES = ['passport', 'civil_id', 'certificate', 'other'] as const
export type DocCategory = (typeof DOC_CATEGORIES)[number]

export type CategoryDef = { key: string; ar: string; en: string }

/** كل التصنيفات: الافتراضية (تُترجَم عبر i18n في الواجهة) + مخصصة المستخدم. */
export function allCategories(customs: CategoryDef[]): CategoryDef[] {
  const builtin: CategoryDef[] = (DOC_CATEGORIES as readonly string[]).map((key) => ({ key, ar: '', en: '' }))
  const seen = new Set(builtin.map((c) => c.key))
  const extra = customs.filter((c) => c.key && !seen.has(c.key))
  return [...builtin, ...extra]
}

/** اسم التصنيف حسب لغة العرض — الافتراضية عبر i18n (يمررها المستدعي جاهزة). */
export function categoryLabel(key: string, fieldLang: FieldLang, customs: CategoryDef[], tBuiltin: (key: string) => string): string {
  if ((DOC_CATEGORIES as readonly string[]).includes(key)) return tBuiltin(key)
  const custom = customs.find((c) => c.key === key)
  if (!custom) return key
  if (fieldLang === 'en') return custom.en || custom.ar || key
  return custom.ar || custom.en || key
}

export function fileKindOf(fileName: string): FileKind {
  const ext = fileName.split('.').pop()?.trim().toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'].includes(ext)) return 'image'
  if (TEXT_PREVIEW_EXTS.has(ext)) return 'text'
  return 'other'
}

// امتدادات الفيديو — تُعايَن بمشغّل أصلي (تبقى ضمن نوع other في الفلاتر).
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'avi', 'mkv'])

export function isVideoFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.trim().toLowerCase() ?? ''
  return VIDEO_EXTS.has(ext)
}

// امتدادات الصوت — تُعايَن بمشغّل SoundPlayer داخل التطبيق.
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'aac', 'm4a', 'flac', 'weba', 'aif', 'aiff', 'amr'])

export function isAudioFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.trim().toLowerCase() ?? ''
  return AUDIO_EXTS.has(ext)
}

// امتدادات النصوص والبرمجة — تُعايَن كلها بعارض النصوص داخل التطبيق.
const TEXT_PREVIEW_EXTS = new Set([
  'txt', 'md', 'markdown', 'mdown', 'mkd', 'csv', 'json', 'log', 'rtf',
  'py', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx',
  'css', 'cs', 'csx', 'vb', 'vbs', 'bas', 'cls',
  'java', 'kt', 'kts', 'c', 'h', 'cpp', 'hpp',
  'php', 'jsp', 'sql', 'xml', 'sh', 'bash', 'ps1', 'bat', 'cmd',
  'lua', 'go', 'rs', 'rb', 'swift', 'dart', 'scala', 'pl', 'r',
  'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'properties', 'gradle',
])

// امتدادات أوفيس — بلا معاينة داخلية (تنزيل أو مشاركة فقط).
const OFFICE_EXTS = new Set([
  'doc', 'docx', 'docm', 'dot', 'dotx', 'odt',
  'xls', 'xlsx', 'xlsm', 'xlt', 'xltx', 'xlsb', 'ods',
  'ppt', 'pptx', 'pptm', 'pot', 'potx', 'pps', 'ppsx', 'odp',
])

export function isOfficeFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.trim().toLowerCase() ?? ''
  return OFFICE_EXTS.has(ext)
}

// امتدادات الملفات المضغوطة — تُرشَّح بزر «مضغوطة» (تبقى ضمن other في fileKindOf).
const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz'])

export function isArchiveFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.trim().toLowerCase() ?? ''
  return ARCHIVE_EXTS.has(ext)
}
// امتدادات HTML — تُعايَن بعارض HtmlFileViewer داخل التطبيق (تبقى ضمن نوع other في الفلاتر).
const HTML_EXTS = new Set(['html', 'htm'])

export function isHtmlFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.trim().toLowerCase() ?? ''
  return HTML_EXTS.has(ext)
}

/** صور أنواع الملفات من `public/FilesIcons` (تُنسَخ لجذر dist تلقائياً). */
const FILE_TYPE_ICON_FILES = {
  threeFR: '3FR.png',
  sevenZip: '7Zip.png',
  aac: 'AAC.png',
  ai: 'AI File.png',
  apk: 'APK.png',
  asc: 'ASC.png',
  audio: 'Audio File.png',
  avi: 'AVI.png',
  csharp: 'C#.png',
  code: 'Code File.png',
  css: 'CSS Filetype.png',
  dds: 'DDS Filetype.png',
  diploma: 'Diploma.png',
  dll: 'DLL.png',
  dmg: 'DMG.png',
  dng: 'DNG.png',
  document: 'Document.png',
  eps: 'EPS.png',
  exe: 'EXE.png',
  excel: 'XLS.png',
  fff: 'FFF.png',
  file: 'File.png',
  flv: 'FLV.png',
  gif: 'GIF.png',
  gpx: 'GPX.png',
  heic: 'HEIC Filetype.png',
  html: 'HTML Filetype.png',
  csv: 'CSV.png',
  jpg: 'JPG.png',
  jp2: 'JP2.png',
  js: 'JS.png',
  json: 'JSON.png',
  jsp: 'JSP.png',
  kml: 'KML.png',
  kmz: 'KMZ.png',
  mov: 'MOV.png',
  mp3: 'MP3.png',
  mpg: 'MPG.png',
  markdown: 'Markdown.png',
  nef: 'NEF.png',
  nmea: 'NMEA.png',
  ogg: 'OGG.png',
  osm: 'OSM.png',
  otf: 'OTF.png',
  php: 'PHP.png',
  png: 'PNG.png',
  ppt: 'PowerPoint File.png',
  py: 'Python.png',
  rar: 'RAR.png',
  raw: 'Raw.png',
  rrp: 'RRP.png',
  sourceCode: 'Source Code.png',
  sql: 'SQL.png',
  tar: 'TAR.png',
  tif: 'TIF.png',
  ttf: 'TTF.png',
  textFile: 'TXT.png',
  vb: 'VB.png',
  vcf: 'Vcf.png',
  wav: 'WAV.png',
  wma: 'WMA.png',
  woff: 'WOFF.png',
  word: 'Word File.png',
  xml: 'XML File.png',
  zip: 'ZIP.png',
  pdf: 'PDF.png',
  picture: 'Image File.png',
  video: 'Video File.png',
} as const

type IconKey = keyof typeof FILE_TYPE_ICON_FILES

/** امتداد → أيقونة محددة (قبل الرجوع لأيقونات العائلات أدناه). */
const EXT_ICON_FILE: Record<string, IconKey> = {
  '3fr': 'threeFR',
  '7z': 'sevenZip', zip: 'zip',
  aac: 'aac', ai: 'ai', apk: 'apk', asc: 'asc',
  avi: 'avi', flv: 'flv', mov: 'mov', mpg: 'mpg', mpeg: 'mpg',
  mp3: 'mp3', wav: 'wav', wma: 'wma',
  c: 'code', h: 'code', cpp: 'code', hpp: 'code', java: 'code', kt: 'code',
  kts: 'code', swift: 'code', go: 'code', rs: 'code', rb: 'code', sh: 'code',
  bash: 'code', ps1: 'code', bat: 'code', cmd: 'code', lua: 'code', dart: 'code',
  ts: 'sourceCode', tsx: 'sourceCode', mts: 'sourceCode', cts: 'sourceCode',
  css: 'css', dds: 'dds', dll: 'dll', dmg: 'dmg', dng: 'dng',
  doc: 'word', docx: 'word', docm: 'word', dot: 'word', dotx: 'word', odt: 'word',
  rtf: 'textFile',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', xlt: 'excel', xltx: 'excel', xlsb: 'excel', ods: 'excel',
  ppt: 'ppt', pptx: 'ppt', pptm: 'ppt', pot: 'ppt', potx: 'ppt', pps: 'ppt', ppsx: 'ppt', odp: 'ppt',
  eps: 'eps', exe: 'exe', fff: 'fff', gif: 'gif',
  gpx: 'gpx', kml: 'kml', kmz: 'kmz', nmea: 'nmea', osm: 'osm',
  heic: 'heic', html: 'html', htm: 'html', csv: 'csv',
  jpg: 'jpg', jpeg: 'jpg', js: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
  json: 'json', jsp: 'jsp', nef: 'nef', md: 'markdown', markdown: 'markdown', mdown: 'markdown', mkd: 'markdown',
  otf: 'otf', php: 'php', py: 'py', rar: 'rar', png: 'png', ogg: 'ogg', jp2: 'jp2',
  raw: 'raw', rrp: 'rrp', sql: 'sql',
  tar: 'tar', gz: 'tar', tgz: 'tar',
  tif: 'tif', tiff: 'tif', ttf: 'ttf', ttc: 'ttf',
  txt: 'textFile', vb: 'vb', vbs: 'vb', bas: 'vb', cls: 'vb',
  cs: 'csharp', csx: 'csharp', vcf: 'vcf',
  woff: 'woff', woff2: 'woff', xml: 'xml',
  pdf: 'pdf',
}

export type FileTypeGroup =
  | 'word' | 'excel' | 'powerpoint' | 'pdf' | 'image'
  | 'video' | 'audio' | 'text' | 'archive' | 'unknown'
  | 'markdown' | 'csv' | 'html' | 'json' | 'yaml' | 'xml'
  | 'javascript' | 'typescript' | 'python' | 'java' | 'cpp'
  | 'csharp' | 'php' | 'ruby' | 'go' | 'rust' | 'sql'
  | 'shell' | 'css'

/** امتداد → مجموعة العرض (القائمة المعتمدة — `csv` حصرياً لمجموعته، وإكسل `xls/xlsx`). */
const EXT_FILE_GROUP: Record<string, FileTypeGroup> = {
  md: 'markdown', markdown: 'markdown', mdown: 'markdown', mkd: 'markdown',
  csv: 'csv',
  html: 'html', htm: 'html',
  json: 'json', jsonc: 'json',
  yaml: 'yaml', yml: 'yaml',
  xml: 'xml',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', pyw: 'python', ipynb: 'python',
  java: 'java', class: 'java', jar: 'java',
  c: 'cpp', cpp: 'cpp', h: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  sql: 'sql',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  doc: 'word', docx: 'word', docm: 'word', dot: 'word', dotx: 'word', odt: 'word',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', xlt: 'excel', xltx: 'excel', xlsb: 'excel', ods: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', pptm: 'powerpoint', pot: 'powerpoint', potx: 'powerpoint', pps: 'powerpoint', ppsx: 'powerpoint', odp: 'powerpoint',
  pdf: 'pdf',
  webp: 'image', svg: 'image', bmp: 'image', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  heic: 'image', heif: 'image', tif: 'image', tiff: 'image', jp2: 'image', dng: 'image', nef: 'image', raw: 'image', '3fr': 'image', dds: 'image', eps: 'image', ai: 'image',
  mp4: 'video', mkv: 'video', webm: 'video', avi: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio', aac: 'audio', oga: 'audio', opus: 'audio', weba: 'audio', aif: 'audio', aiff: 'audio', amr: 'audio',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
}

/** مجموعة النوع النصية للامتداد — تُعرَض في معلومات الملف (مفتاح `fileTypeLabel_<group>`).
    بلا مجموعة مستقلة: أي نص/كود معروف → `text`، وإلا `unknown`. */
export function fileTypeGroup(ext: string | null | undefined): FileTypeGroup {
  const e = (ext ?? '').trim().toLowerCase()
  if (!e) return 'unknown'
  const direct = EXT_FILE_GROUP[e]
  if (direct) return direct
  if (TEXT_PREVIEW_EXTS.has(e) || e === 'vue') return 'text'
  return 'unknown'
}

/** صورة PNG المناسبة للملف حسب امتداده (والتصنيف للشهادات) — للتمييز البصري في بطاقات الملفات. */
export function fileTypeIconSrc(fileName: string, category?: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const pick = (f: (typeof FILE_TYPE_ICON_FILES)[keyof typeof FILE_TYPE_ICON_FILES]) =>
    `${base}FilesIcons/${encodeURIComponent(f)}`
  if (category === 'certificate') return pick(FILE_TYPE_ICON_FILES.diploma)
  const ext = fileName.split('.').pop()?.trim().toLowerCase() ?? ''
  const specific = EXT_ICON_FILE[ext]
  if (specific) return pick(FILE_TYPE_ICON_FILES[specific])
  if (['webp', 'bmp', 'svg', 'heif'].includes(ext)) return pick(FILE_TYPE_ICON_FILES.picture)
  if (isVideoFile(fileName)) return pick(FILE_TYPE_ICON_FILES.video)
  if (isAudioFile(fileName)) return pick(FILE_TYPE_ICON_FILES.audio)
  if (['md', 'log'].includes(ext)) return pick(FILE_TYPE_ICON_FILES.document)
  return pick(FILE_TYPE_ICON_FILES.file)
}

/** هل يدعم التطبيق معاينة هذا الملف داخلياً (صورة/PDF/نص/فيديو/صوت/HTML) —
    أوفيس والمضغوط والمجهول بلا معاينة داخلية. */
export function canPreviewInApp(fileName: string): boolean {
  if (fileKindOf(fileName) !== 'other') return true
  return isVideoFile(fileName) || isAudioFile(fileName) || isHtmlFile(fileName)
}

/** حد الملف الكبير (25MB) — فوقه يُطلب تأكيد قبل الحفظ وتُعطَّل معاينة الفيديو
    المباشرة، لأن نسخ كامل الملف عبر IPC يجمّد الواجهة على الهواتف. */
export const LARGE_FILE_BYTES = 25 * 1024 * 1024

/** سقف المعاينة المباشرة للفيديو (100MB) — تحته يعمل المشغّل مباشرة بلا زر تأكيد. */
export const VIDEO_PREVIEW_BYTES = 100 * 1024 * 1024

/** سقف المعاينة الداخلية (200MB) — فوقه تنبيه فقط بلا زر معاينة (212MB نجح، 600MB انهار). */
export const PREVIEW_MAX_BYTES = 200 * 1024 * 1024

/** سقف معاينة النصوص (5MB) — النص يُحمَّل كاملاً في الذاكرة قبل عرضه،
    ففوقه تنبيه فقط مع إبقاء التنزيل/المشاركة. */
export const TEXT_PREVIEW_MAX_BYTES = 5 * 1024 * 1024

/** حجم بشري: B/KB/MB — بلا مكتبات. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** اسم الملف بلا امتداد (للعرض والعناوين الافتراضية). */
export function stemOfFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  return stem.trim() || name
}

/** كشف امتداد الملف من بصمة البايتات الأولى — لأسماء content:// بلا امتداد. */
export function sniffFileExtension(bytes: ArrayLike<number>): string | null {
  const b = (i: number): number => bytes[i] ?? -1
  const ascii = (from: number, len: number): string => {
    let s = ''
    for (let i = from; i < from + len; i += 1) {
      const c = bytes[i]
      if (c === undefined || c < 32 || c > 126) return ''
      s += String.fromCharCode(c)
    }
    return s
  }
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return 'pdf'
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47) return 'png'
  if (b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return 'jpg'
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return 'gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'wav'
  if (ascii(0, 4) === 'fLaC') return 'flac'
  if (ascii(0, 3) === 'ID3') return 'mp3'
  // إطار MP3 خام (مزامنة 11 بت) — مع حارس الطول حتى لا يُقرَأ الناقص.
  if (b(0) === 0xFF && b(1) !== -1 && (b(1) & 0xE0) === 0xE0) return 'mp3'
  if (b(0) === 0x42 && b(1) === 0x4D) return 'bmp'
  if (ascii(4, 4) === 'ftyp') return ascii(8, 4) === 'M4A ' ? 'm4a' : 'mp4'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'AVI ') return 'avi'
  if (ascii(0, 5) === '#!AMR') return 'amr'
  // صوت AAC خام (ADTS) — يُفحَص قبل MP3 لأن قناعه أضيق ويتداخل معه.
  if (b(0) === 0xFF && b(1) !== -1 && (b(1) & 0xF6) === 0xF0) return 'aac'
  if (b(0) === 0x1A && b(1) === 0x45 && b(2) === 0xDF && b(3) === 0xA3) return 'mkv'
  if (ascii(0, 4) === 'OggS') {
    // حاوية Ogg للصوت والفيديو معاً — نميّز بالمحتوى (الترميز يبدأ عند 28):
    // OpusHead/Vorbis صوت (تسجيلات الواتساب opus غالباً)، وtheora فيديو.
    if (ascii(28, 8) === 'OpusHead') return 'opus'
    if (b(28) === 0x01 && ascii(29, 6) === 'vorbis') return 'ogg'
    if (b(28) === 0x80 && ascii(29, 6) === 'theora') return 'ogv'
    return 'ogg'
  }
  // حاوية ZIP (ملف فارغ/مقسّم/عادي) — ملفات أوفيس الحديثة ZIP بداخلها أجزاء مميزة:
  // ppt/ للبوربوينت، word/ للوورد، xl/ للإكسل (نصوص مضغوطة لا تظهر، لكن أسماء
  // الأجزاء في الترويسات الأولى ظاهرة — تُقرَأ أول 2KB لهذا الغرض).
  if (b(0) === 0x50 && b(1) === 0x4B && b(2) === 0x05 && b(3) === 0x06) return 'zip'
  if (b(0) === 0x50 && b(1) === 0x4B && b(2) === 0x03 && b(3) === 0x04) {
    let head = ''
    const n = Math.min(2048, bytes.length)
    for (let i = 0; i < n; i += 1) head += String.fromCharCode(bytes[i] ?? 0)
    if (head.includes('ppt/')) return 'pptx'
    if (head.includes('word/')) return 'docx'
    if (head.includes('xl/')) return 'xlsx'
    return 'zip'
  }
  return null
}

/** نافذة حفظ الملف الأصلية (ديسكتوب) — typing مشترك لمنطق التنزيل. */
export type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>
      close: () => Promise<void>
    }>
  }>
}

/** إجمالي مساحة ملفات المستودع — لعدّاد التحذير. */
export function totalSize(documents: { sizeBytes: number }[]): number {
  return documents.reduce((sum, d) => sum + (d.sizeBytes || 0), 0)
}
