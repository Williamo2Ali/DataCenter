// أيقونة نوع الملف — صورة PNG من `public/FilesIcons` حسب الامتداد (والتصنيف للشهادات)،
// مع تراجع لأيقونة lucide العامة إن تعذّر تحميل الصورة.
import { useEffect, useState } from 'react'
import { Files } from 'lucide-react'
import { fileTypeIconSrc } from '../../lib/documents'

type FileTypeIconProps = {
  fileName: string
  category?: string
}

export default function FileTypeIcon({ fileName, category }: FileTypeIconProps) {
  const src = fileTypeIconSrc(fileName, category)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [src])
  if (failed) {
    return <Files size={28} strokeWidth={1.5} aria-hidden="true" className="text-[var(--muted)]" />
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="size-9 object-contain"
      onError={() => setFailed(true)}
    />
  )
}
