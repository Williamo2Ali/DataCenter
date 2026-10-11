// مصغرة فيديو حقيقية بأول إطار — للشريط السفلي فقط (المشغّل الرئيسي untouched).
// الوصفة: fetch (يعمل مع asset://) → Blob URL (يدعم Range والتقديم حتى مع moov
// في الذيل) → عنصر video خفي مكتوم → seek → رسم على Canvas → JPEG صغير.
// الحماية: كسل IntersectionObserver + سقف حجم (sizeBytes من الفهرس — بلا stat
// وبلا جلب) + طابور تزامن (2 فقط) + مهلة + تنظيف كامل + Cache ذاكري.
import { useEffect, useRef, useState } from 'react'
import { Film } from 'lucide-react'

/** سقف استخراج المصغرة — فوقه أيقونة فقط (بلا تحميل كامل في الذاكرة). */
const MAX_THUMB_BYTES = 100 * 1024 * 1024
/** مهلة استخراج الإطار الواحد. */
const EXTRACT_TIMEOUT_MS = 20_000
/** أقصى عرض للمصغرة المنتجة. */
const CAPTURE_MAX_W = 480
/** أقصى استخراجين متوازيين — الشريط قد يعرض عشرات الفيديوهات. */
const MAX_CONCURRENT = 2

let activeCount = 0
const waiters: Array<() => void> = []

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeCount >= MAX_CONCURRENT) await new Promise<void>((res) => waiters.push(res))
  activeCount += 1
  try {
    return await fn()
  } finally {
    activeCount -= 1
    waiters.shift()?.()
  }
}

/* Cache ذاكري: src → Promise<dataURL | null> — لا استخراج مرتين. */
const thumbCache = new Map<string, Promise<string | null>>()

const mimeOfExt = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.trim().toLowerCase() ?? ''
  if (ext === 'webm') return 'video/webm'
  if (ext === 'ogv') return 'video/ogg'
  if (ext === 'mov' || ext === 'm4v') return 'video/quicktime'
  if (ext === 'avi') return 'video/x-msvideo'
  if (ext === 'mkv') return 'video/x-matroska'
  return 'video/mp4'
}

async function extractFrame(src: string, fileName: string): Promise<string | null> {
  let objectUrl: string | null = null
  let video: HTMLVideoElement | null = null
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_THUMB_BYTES) return null
    objectUrl = URL.createObjectURL(new Blob([buf], { type: mimeOfExt(fileName) }))
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = objectUrl
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('timeout')), EXTRACT_TIMEOUT_MS)
      video!.addEventListener('loadedmetadata', () => {
        window.clearTimeout(timer)
        // 10% من المدة (أو 0.5s للقصيرة) — يتجنب اللوحة السوداء الأولى.
        try {
          video!.currentTime = Math.min(0.5, (video!.duration || 1) * 0.1)
        } catch {
          reject(new Error('seek'))
        }
      }, { once: true })
      video!.addEventListener('seeked', () => { window.clearTimeout(timer); resolve() }, { once: true })
      video!.addEventListener('error', () => { window.clearTimeout(timer); reject(new Error('decode')) }, { once: true })
    })
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return null
    const scale = Math.min(1, CAPTURE_MAX_W / vw)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vw * scale)
    canvas.height = Math.max(1, Math.round(vh * scale))
    const g = canvas.getContext('2d')
    if (!g) return null
    g.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    // ترميز غير مدعوم (HEVC)، مهلة، فشل فك — أيقونة البديل.
    return null
  } finally {
    if (video) {
      try { video.pause() } catch { /* لا شيء */ }
      video.removeAttribute('src')
      try { video.load() } catch { /* لا شيء */ }
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

function getThumb(src: string, fileName: string): Promise<string | null> {
  let p = thumbCache.get(src)
  if (!p) {
    p = withSlot(() => extractFrame(src, fileName))
    thumbCache.set(src, p)
  }
  return p
}

type VideoThumbnailProps = {
  /** رابط asset المحلول مسبقاً (رخيص ومخزّن) + حجم الملف من الفهرس. */
  src: string | null
  fileName: string
  sizeBytes: number
}

/** محتوى مصغرة الفيديو: لقطة، وإلا أيقونة — تُرسَم داخل زر الأب. */
export default function VideoThumbnail({ src, fileName, sizeBytes }: VideoThumbnailProps) {
  const boxRef = useRef<HTMLSpanElement>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'empty'>('idle')
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    // فوق السقف: أيقونة فوراً — بلا IntersectionObserver وبلا جلب.
    if (!src || sizeBytes > MAX_THUMB_BYTES) {
      setState('empty')
      return
    }
    const box = boxRef.current
    if (!box) return
    let live = true
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        if (!live) return
        setState('loading')
        void getThumb(src, fileName).then((url) => {
          if (!live) return
          if (url) {
            setDataUrl(url)
            setState('ok')
          } else {
            setState('empty')
          }
        })
      },
      { rootMargin: '100px' },
    )
    io.observe(box)
    return () => {
      live = false
      io.disconnect()
    }
  }, [src, fileName, sizeBytes])

  // مرساة الكسل: حيّز المصغرة نفسه (الأب زرّ بعرض/ارتفاع ثابتين).
  if (state === 'ok' && dataUrl) {
    return <img src={dataUrl} alt="" aria-hidden="true" loading="lazy" draggable={false} />
  }
  return (
    <span ref={boxRef} className="thumb-fallback" aria-hidden="true">
      <Film size={22} />
    </span>
  )
}
