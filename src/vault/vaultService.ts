import JSZip from 'jszip'
import { decryptToZipBytes, encryptZipBytes } from './vaultCrypto'
import { guessMime, type VaultFileMeta } from './types'
import { tr } from '../language/index'

// جلسة حاوية واحدة في الذاكرة. كلمة المرور لا تغادر هذه الجلسة.
// الملفات تُحفظ مشفرة فقط عند استدعاء save().

export type VaultEntry = VaultFileMeta & { data: Uint8Array }

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50MB للملف الواحد
const MAX_TOTAL_BYTES = 300 * 1024 * 1024 // 300MB للحاوية

function sanitizeName(raw: string): string {
  // منع مسارات مطلقة أو ../ حتى لا تُكسر بنية الـ zip
  const base = raw.split(/[\\/]/).pop() ?? raw
  const cleaned = base.replace(/[^a-zA-Z0-9\u0600-\u06FF._()\- +]/g, '_').trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error(tr('vaultService.invalidFileNameError'))
  return cleaned
}

export class VaultSession {
  private password: string
  private salt: Uint8Array | undefined
  private files = new Map<string, VaultEntry>()
  private dirty = false

  private constructor(password: string, salt?: Uint8Array) {
    this.password = password
    this.salt = salt ? new Uint8Array(salt) : undefined
  }

  /** إنشاء حاوية فارغة جديدة. */
  static async create(password: string): Promise<VaultSession> {
    if (!password || password.length < 4) throw new Error(tr('vaultService.shortPasswordError'))
    return new VaultSession(password)
  }

  /** فتح حاوية مشفرة من قرص/ذاكرة. */
  static async open(vaultBuffer: ArrayBuffer, password: string): Promise<VaultSession> {
    const { zipBytes, salt } = await decryptToZipBytes(vaultBuffer, password)
    const session = new VaultSession(password, salt)
    if (zipBytes.length === 0) return session
    const zip = await JSZip.loadAsync(zipBytes)
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
    for (const name of names) {
      const data = await zip.files[name].async('uint8array')
      session.files.set(name, {
        name,
        size: data.byteLength,
        lastModified: Date.now(),
        mime: guessMime(name),
        data,
      })
    }
    return session
  }

  list(): VaultFileMeta[] {
    return [...this.files.values()]
      .map(({ name, size, lastModified, mime }) => ({ name, size, lastModified, mime }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  }

  get(name: string): VaultEntry | undefined {
    return this.files.get(name)
  }

  totalSize(): number {
    let total = 0
    this.files.forEach((f) => (total += f.size))
    return total
  }

  isDirty(): boolean {
    return this.dirty
  }

  markClean(): void {
    this.dirty = false
  }

  /** إضافة ملفات جديدة (صور/PDF/أي نوع). تُستبدل الأسماء المكررة. */
  async addFiles(incoming: File[] | { name: string; data: Uint8Array; lastModified?: number }[]): Promise<string[]> {
    const added: string[] = []
    for (const item of incoming) {
      const rawName = item instanceof File ? item.name : item.name
      const name = sanitizeName(rawName)
      const data = item instanceof File ? new Uint8Array(await item.arrayBuffer()) : item.data
      if (data.byteLength === 0) throw new Error(tr('vaultService.emptyFileError', { name }))
      if (data.byteLength > MAX_FILE_BYTES) throw new Error(tr('vaultService.fileTooLargeError', { name }))
      if (this.totalSize() + data.byteLength > MAX_TOTAL_BYTES) throw new Error(tr('vaultService.containerTooLargeError'))
      this.files.set(name, {
        name,
        size: data.byteLength,
        lastModified: item instanceof File ? item.lastModified : (item.lastModified ?? Date.now()),
        mime: guessMime(name),
        data,
      })
      added.push(name)
    }
    if (added.length) this.dirty = true
    return added
  }

  remove(name: string): void {
    if (this.files.delete(name)) this.dirty = true
  }

  clearPassword(): void {
    // مسح كلمة المرور عند القفل — الجلسة تصبح غير قابلة للحفظ
    this.password = ''
  }

  /** إعادة الضغط والتشفير → ArrayBuffer جاهز للحفظ على القرص. */
  async save(): Promise<ArrayBuffer> {
    if (!this.password) throw new Error(tr('vaultService.sessionLockedError'))
    const zip = new JSZip()
    for (const entry of this.files.values()) {
      zip.file(entry.name, entry.data, { binary: true })
    }
    const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const out = await encryptZipBytes(zipBytes, this.password, this.salt)
    // تثبيت الـ salt بعد أول حفظ حتى تبقى نفس كلمة المرور صالحة
    if (!this.salt) {
      const view = new Uint8Array(out)
      this.salt = view.slice(5, 21)
    }
    this.dirty = false
    return out
  }
}

/** إنشاء objectURL للمعاينة — يجب تحريره بـ revokeObjectURL بعد الاستخدام. */
export function toPreviewUrl(entry: VaultEntry): string {
  const blob = new Blob([entry.data as unknown as BlobPart], { type: entry.mime })
  return URL.createObjectURL(blob)
}
