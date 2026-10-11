// طبقة التشفير — WebCrypto فقط (يعمل في المتصفح و Tauri/WebView2).
// الصيغة الثنائية للحاوية:
// [0..4)  magic = "VLT1"
// [4..5)  version = 0x01
// [5..21) salt = 16 bytes (PBKDF2)
// [21..33) iv = 12 bytes (AES-GCM)
// [33..)  ciphertext = AES-GCM-256(zipBytes)

import { tr } from '../language/index'

const MAGIC = [0x56, 0x4c, 0x54, 0x31] // VLT1
const VERSION = 0x01
const SALT_LEN = 16
const IV_LEN = 12
const PBKDF2_ITERATIONS = 120_000

function subtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto
  if (!cryptoObj?.subtle) throw new Error(tr('vaultCrypto.webCryptoUnavailable'))
  return cryptoObj.subtle
}

export async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length)
  globalThis.crypto.getRandomValues(out)
  return out
}

/** تشفير بايتات zip جاهزة → حاوية كاملة جاهزة للحفظ. */
export async function encryptZipBytes(zipBytes: Uint8Array, password: string, existingSalt?: Uint8Array): Promise<ArrayBuffer> {
  if (!password || password.length < 4) throw new Error(tr('vaultCrypto.shortPasswordError'))
  const salt = existingSalt ?? randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const key = await deriveAesKey(password, salt)
  const cipher = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, zipBytes as BufferSource)
  const out = new Uint8Array(4 + 1 + SALT_LEN + IV_LEN + cipher.byteLength)
  out.set(MAGIC, 0)
  out[4] = VERSION
  out.set(salt, 5)
  out.set(iv, 5 + SALT_LEN)
  out.set(new Uint8Array(cipher), 5 + SALT_LEN + IV_LEN)
  return out.buffer as ArrayBuffer
}

/** فك الحاوية → بايتات zip + الـ salt (لإعادة الحفظ بنفس الـ salt). */
export async function decryptToZipBytes(vaultBuffer: ArrayBuffer, password: string): Promise<{ zipBytes: Uint8Array; salt: Uint8Array }> {
  const bytes = new Uint8Array(vaultBuffer)
  if (bytes.length < 4 + 1 + SALT_LEN + IV_LEN + 1) throw new Error(tr('vaultCrypto.corruptFileError'))
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error(tr('vaultCrypto.notVaultError'))
  }
  if (bytes[4] !== VERSION) throw new Error(tr('vaultCrypto.unsupportedVersionError'))
  const salt = bytes.slice(5, 5 + SALT_LEN)
  const iv = bytes.slice(5 + SALT_LEN, 5 + SALT_LEN + IV_LEN)
  const cipher = bytes.slice(5 + SALT_LEN + IV_LEN)
  let plain: ArrayBuffer
  try {
    const key = await deriveAesKey(password, salt)
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, cipher as BufferSource)
  } catch {
    throw new Error(tr('vaultCrypto.wrongPasswordError'))
  }
  return { zipBytes: new Uint8Array(plain), salt: new Uint8Array(salt) }
}

export function isProbablyVault(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer)
  return b.length > 33 && b[0] === MAGIC[0] && b[1] === MAGIC[1] && b[2] === MAGIC[2] && b[3] === MAGIC[3]
}
