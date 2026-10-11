// vCard 3.0 لجهات الاتصال — تصدير/استيراد ملفات .vcf بلا اعتماديات.
// الاستيراد يتحمل: طيّ الأسطر، 2.1/3.0، QUOTED-PRINTABLE وBASE64، والقيم الفارغة.
// القاعدة المعتمدة: أول هاتف + أول بريد لكل بطاقة = جهة واحدة.

export type VCardContact = {
  name: string
  phone: string
  email: string
  address: string
}

/** هروب قيم التصدير (\ ; , وسطر جديد). */
function escapeValue(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

/** طيّ سطر طويل (بحد آمن 70 محرفاً — continuation بمسافة بادئة). */
function foldLine(line: string): string {
  if (line.length <= 70) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 70))
  rest = rest.slice(70)
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 69))
    rest = rest.slice(69)
  }
  return parts.join('\r\n')
}

/** بناء ملف vcf من جهات — الاسم والهاتف والبريد والعنوان فقط. */
export function buildVCard(contacts: VCardContact[]): string {
  const out: string[] = []
  for (const c of contacts) {
    const name = c.name.trim() || 'Contact'
    out.push('BEGIN:VCARD')
    out.push('VERSION:3.0')
    out.push(foldLine(`FN:${escapeValue(name)}`))
    out.push(foldLine(`N:${escapeValue(name)};;;;`))
    if (c.phone.trim()) out.push(foldLine(`TEL;TYPE=CELL:${escapeValue(c.phone.trim())}`))
    if (c.email.trim()) out.push(foldLine(`EMAIL:${escapeValue(c.email.trim())}`))
    if (c.address.trim()) out.push(foldLine(`ADR:;;${escapeValue(c.address.trim())};;;;`))
    out.push('END:VCARD')
  }
  return out.join('\r\n') + '\r\n'
}

/** فك QUOTED-PRINTABLE إلى نص (UTF-8 افتراضياً). */
function decodeQuotedPrintable(raw: string, charset: string): string {
  const compact = raw.replace(/=\r?\n/g, '')
  const bytes: number[] = []
  for (let i = 0; i < compact.length; i++) {
    const ch = compact[i]
    if (ch === '=' && i + 2 < compact.length + 1) {
      const hex = compact.slice(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16))
        i += 2
        continue
      }
    }
    if (ch === '_') {
      bytes.push(0x20)
      continue
    }
    bytes.push(ch.charCodeAt(0) & 0xff)
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(new Uint8Array(bytes))
  } catch {
    return compact
  }
}

/** فك قيمة حقل حسب ترميزها (b/BASE64 أو QUOTED-PRINTABLE أو خام). */
function decodeValue(value: string, params: string): string {
  const p = params.toUpperCase()
  if (p.includes('BASE64') || /(^|;)B(;|$)/.test(p)) {
    try {
      const bin = atob(value.replace(/\s/g, ''))
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new TextDecoder('utf-8').decode(bytes)
    } catch {
      return value
    }
  }
  if (p.includes('QUOTED-PRINTABLE')) {
    const cs = (/CHARSET=([^;:]+)/.exec(p)?.[1] ?? 'UTF-8').toLowerCase().replace(/^utf8$/, 'utf-8')
    return decodeQuotedPrintable(value, cs)
  }
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\;/g, ';')
    .replace(/\\,/g, ',')
    .replace(/\\\\/g, '\\')
}

/** تحليل نص vcf → جهات (أول هاتف/بريد لكل بطاقة، والفارغة تُتجاهَل). */
export function parseVCard(text: string): VCardContact[] {
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1)
  const out: VCardContact[] = []
  for (const card of cards) {
    const body = card.split(/END:VCARD/i)[0] ?? ''
    let fn = ''
    let n = ''
    let phone = ''
    let email = ''
    let adr = ''
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('VERSION')) continue
      const sep = line.indexOf(':')
      if (sep < 0) continue
      const head = line.slice(0, sep)
      const semi = head.indexOf(';')
      const prop = (semi < 0 ? head : head.slice(0, semi)).trim().toUpperCase()
      const params = semi < 0 ? '' : head.slice(semi + 1)
      const value = decodeValue(line.slice(sep + 1), params).trim()
      if (prop === 'FN' && !fn) fn = value
      else if (prop === 'N' && !n) n = value
      else if ((prop === 'TEL' || prop === 'PHONE') && !phone) phone = value.replace(/^tel:/i, '')
      else if (prop === 'EMAIL' && !email) email = value
      else if (prop === 'ADR' && !adr) {
        adr = value.split(';').map((s) => s.trim()).filter((s) => s !== '').join('، ')
      }
    }
    let name = fn
    if (!name && n) {
      const parts = n.split(';').map((s) => s.trim()).filter((s) => s !== '')
      // N: عائلة؛معطى؛وسطى — الاسم = المعطى + العائلة.
      name = [parts[1] ?? '', parts[0] ?? ''].filter((s) => s !== '').join(' ') || parts.join(' ')
    }
    if (!name.trim() && !phone && !email) continue
    out.push({ name: name.trim(), phone: phone.trim(), email: email.trim(), address: adr.trim() })
  }
  return out
}

/** بصمة هاتف للمقارنة (أرقام فقط) — كشف المكرر. */
export function phoneKey(phone: string): string {
  return phone.replace(/[^\d]/g, '')
}
