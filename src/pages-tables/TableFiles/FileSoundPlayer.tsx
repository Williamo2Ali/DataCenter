/**
 * FileSoundPlayer.tsx — معاينة الملفات الصوتية (ملف واحد)
 *
 * مكوّن معاينة صوتية لملفات التطبيق — ليس مشغّل وسائط كاملاً:
 *  - إشارة الصوت (Waveform) مرسومة بـ Canvas من فك الترميز الفعلي (Web Audio API)
 *  - دائرة تقدّم بلون الثيم فوق الإشارة — تنعكس مع القراءة وتُسحب للتقديم/الإرجاع
 *  - شريط تحكم أسفلها: تشغيل/إيقاف مؤقت، إيقاف وإرجاع، زمن، مستوى صوت/كتم
 *  - العنوان prop قادم من التطبيق (مُدار) + اسم الملف أسفله بلون ثانوي
 *
 * ⚠️ لماذا Blob وليس الرابط المباشر؟
 *    بروتوكول asset:// في Tauri يعمل مع fetch/<img> لكنه يفشل مع عناصر الوسائط
 *    (<audio>/<video>) في WebView أندرويد (PIPELINE_ERROR_READ — سلوك موثق).
 *    لذلك تُقرأ البايتات مرة واحدة عبر fetch (الذي يعمل) وتُصنَع منها Blob،
 *    ويُغذّى <audio> بـ URL.createObjectURL — يدعم التنقل (Range) ولا يمر عبر IPC.
 *    كل الصيغ عبر <audio> (mp3/wav/ogg/m4a/aac/flac/opus/webm…).
 *
 *  - ثيم التطبيق حصراً (var(--paper)/--ink/--muted/--line/--green) فاتح/داكن
 *  - RTL/LTR حسب اتجاه الوثيقة، Tooltip المخصص على الأزرار الأيقونية
 *
 * الاستخدام:
 *   <FileSoundPlayer
 *     src={blobUrl | assetUrl}        // أي رابط يفتحه fetch (asset:// أو blob:)
 *     fileName="recording.mp3"        // اسم الملف الفعلي
 *     title={doc.title}               // العنوان المُدار من التطبيق (اختياري)
 *     autoPlay
 *     onClose={() => ...}             // اختياري — يعرض زر الإغلاق
 *   />
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, Square, Volume2, VolumeX, X, RotateCcw, RotateCw, Music, Gauge } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { useLanguage } from '../../language/LanguageContext'
import { LARGE_FILE_BYTES } from '../../lib/documents'

/* نوع MIME من الامتداد — لضمان فهم WebView للـ Blob */
const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
  mp4: 'audio/mp4',
}
const mimeFromName = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? ''
}

export interface FileSoundPlayerProps {
  /** رابط يفتحه fetch — asset:// أو blob: — يُقرأ مرة واحدة ويُحوَّل Blob للصوت */
  src: string
  /** اسم الملف الفعلي (يظهر ثانوياً تحت العنوان + يحدد نوع Blob) */
  fileName: string
  /** العنوان المُدار من التطبيق — الرئيسي المعروض (يفتّش إلى اسم الملف إن غاب) */
  title?: string
  autoPlay?: boolean
  onClose?: () => void
}

/* CSS مُدمج بنطاق fsp-* — ألوان من متغيرات الثيم فقط، لا قيمة ثابتة */
const FSP_CSS = `
.fsp-root{--fsp-soft:color-mix(in srgb,var(--green) 9%,var(--paper));--fsp-soft2:color-mix(in srgb,var(--green) 16%,var(--paper));--fsp-surface:color-mix(in srgb,var(--ink) 3%,var(--paper));display:flex;flex-direction:column;height:100%;min-height:300px;background:var(--paper);color:var(--ink);overflow:hidden;font-feature-settings:"tnum"}
.fsp-head{display:flex;align-items:center;gap:12px;padding:14px 16px;flex:none}
.fsp-badge{width:42px;height:42px;flex:none;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:var(--fsp-soft2);color:var(--green)}
.fsp-titles{flex:1;min-width:0}
.fsp-title{font-size:15px;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fsp-file{font-size:12px;color:var(--muted);direction:ltr;text-align:start;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.fsp-wave-wrap{flex:1;display:flex;flex-direction:column;justify-content:center;gap:10px;margin:0 16px;padding:18px 16px 12px;min-height:0;border:1px solid var(--line);border-radius:18px;background:var(--fsp-surface);position:relative}
.fsp-wave-note{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted);pointer-events:none}
.fsp-wave{width:100%;height:clamp(64px,16vh,120px);cursor:default;display:block}
.fsp-time{direction:ltr;display:flex;justify-content:space-between;font-variant-numeric:tabular-nums;font-size:12px;color:var(--muted);white-space:nowrap}
.fsp-time b{color:var(--green);font-weight:700}
.fsp-controls{display:flex;flex-direction:column;align-items:center;gap:14px;padding:18px 16px 16px;flex:none}
.fsp-main-controls{display:flex;align-items:center;justify-content:center;gap:14px;width:100%}
.fsp-btn{width:40px;height:40px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0;line-height:0;border-radius:50%;border:1px solid transparent;background:transparent;color:var(--ink);cursor:pointer;transition:background .18s ease,color .18s ease,transform .12s ease,box-shadow .18s ease}
.fsp-btn svg{flex:none;display:block;margin:0}
.fsp-btn:hover{background:var(--fsp-soft);color:var(--green)}
.fsp-btn:active{transform:scale(.93)}
.fsp-btn:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.fsp-btn.is-ghost{border-color:var(--line)}
.fsp-btn-md{width:46px;height:46px}
.fsp-btn-xl{width:68px;height:68px;background:var(--green);color:var(--paper);box-shadow:0 8px 22px -8px color-mix(in srgb,var(--green) 70%,transparent)}
.fsp-btn-xl:hover{background:var(--green);color:var(--paper);filter:brightness(1.07);box-shadow:0 10px 26px -8px color-mix(in srgb,var(--green) 85%,transparent)}
.fsp-btn-xl.is-playing{background:var(--ink)}
.fsp-bottom{display:flex;align-items:center;gap:10px;width:100%;max-width:420px;padding:8px 10px;border:1px solid var(--line);border-radius:999px;background:var(--fsp-surface)}
.fsp-group{display:flex;align-items:center;gap:6px;flex:1;min-width:0}
.fsp-group-speed{flex:1.6}
.fsp-sep{width:1px;height:22px;background:var(--line);flex:none}
.fsp-chip{flex:none;min-width:42px;text-align:center;direction:ltr;font-size:12px;font-weight:700;color:var(--green);background:var(--fsp-soft2);border-radius:999px;padding:4px 8px}
.fsp-range{-webkit-appearance:none;appearance:none;flex:1;min-width:0;height:4px;border-radius:999px;background:var(--line);accent-color:var(--green);cursor:pointer;outline:none}
.fsp-range-vol{margin-top:15px;margin-bottom:15px;margin-left:10px;margin-Right:10px}
.fsp-speed-tip{flex:1 1 0%;min-width:0}
.fsp-btn-mute{width:40px;height:40px}
.fsp-vol-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;line-height:0}
.fsp-range::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--green);border:2px solid var(--paper);box-shadow:0 0 0 1px var(--green)}
.fsp-range::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--green);border:2px solid var(--paper)}
.fsp-range::-moz-range-progress{background:var(--green);height:4px;border-radius:999px}
@media (max-width:420px){.fsp-btn-xl{width:58px;height:58px}.fsp-btn-md{width:42px;height:42px}.fsp-main-controls{gap:10px}.fsp-bottom{flex-wrap:wrap;border-radius:16px}.fsp-sep{display:none}.fsp-group{flex-basis:100%}}
`

export default function FileSoundPlayer({
  src,
  fileName,
  title,
  autoPlay = false,
  onClose,
}: FileSoundPlayerProps) {
  const { lang, t } = useLanguage()
  const isRTL = lang === 'ar'

  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peaksRef = useRef<number[]>([])
  const ratioRef = useRef(0) // نسبة التقدم 0..1 — مرجع حتى لا يعيد الرسم إلا عند الحاجة
  const rafRef = useRef(0)

  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [waveState, setWaveState] = useState<'loading' | 'ok' | 'error'>('loading')
  /** Blob URL لعنصر الصوت — يتجاوز رفض asset:// في عناصر الوسائط على WebView */
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  /* ---------- أدوات ---------- */
  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0
    const m = Math.floor(s / 60)
    const ss = Math.floor(s % 60)
    return `${m}:${ss.toString().padStart(2, '0')}`
  }

  /* رسم الإشارة — يُستدعى عند التقدم/تغيّر الثيم/تغيّر الحجم */
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    const g = canvas.getContext('2d')
    if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    const peaks = peaksRef.current
    if (!peaks.length) return
    const styles = getComputedStyle(document.documentElement)
    const green = styles.getPropertyValue('--green').trim() || '#16715f'
    const line = styles.getPropertyValue('--line').trim() || '#e2e7e3'
    const playedCount = Math.floor(peaks.length * ratioRef.current)
    const gap = Math.max(1.5, w / 400)
    const barW = Math.max(2, (w - gap * (peaks.length - 1)) / peaks.length)
    const mid = h / 2
    for (let i = 0; i < peaks.length; i++) {
      const bh = Math.max(3, peaks[i] * (h - 10))
      g.fillStyle = i < playedCount ? green : line
      const x = i * (barW + gap)
      g.beginPath()
      if (typeof (g as CanvasRenderingContext2D).roundRect === 'function') {
        g.roundRect(x, mid - bh / 2, barW, bh, barW / 2)
      } else {
        g.rect(x, mid - bh / 2, barW, bh)
      }
      g.fill()
    }
  }, [])

  /* ---------- قراءة الملف مرة واحدة: Blob للصوت + فك ترميز للإشارة ---------- */
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setWaveState('loading')
    setAudioUrl(null)
    peaksRef.current = []
    ratioRef.current = 0
    setCurrent(0)
    const run = async () => {
      try {
        const res = await fetch(src)
        if (!res.ok) throw new Error('fetch failed')
        const buf = await res.arrayBuffer()
        if (cancelled) return

        // الملفات الضخمة تُستثنى من فك الترميز (ذاكرة ~10x) — التشغيل يبقى متاحاً بالبث.
        if (buf.byteLength > LARGE_FILE_BYTES) throw new Error('too large for waveform')

        /* Blob URL لعنصر <audio> — يتجاوز رفض asset:// في عناصر الوسائط */
        objectUrl = URL.createObjectURL(new Blob([buf], { type: mimeFromName(fileName) }))
        setAudioUrl(objectUrl)

        /* فك الترميز لرسم الإشارة (فشله لا يوقف التشغيل) */
        try {
          const AC: typeof AudioContext =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          const ctx = new AC()
          try {
            const audioBuf = await ctx.decodeAudioData(buf.slice(0))
            if (cancelled) return
            const ch = audioBuf.getChannelData(0)
            const BUCKETS = 180
            const block = Math.max(1, Math.floor(ch.length / BUCKETS))
            const peaks: number[] = []
            for (let i = 0; i < BUCKETS; i++) {
              let max = 0
              const start = i * block
              const end = Math.min(start + block, ch.length)
              for (let j = start; j < end; j += 64) {
                const v = Math.abs(ch[j])
                if (v > max) max = v
              }
              peaks.push(max)
            }
            const top = Math.max(...peaks, 0.001)
            peaksRef.current = peaks.map((p) => p / top) // تطبيع 0..1
            setWaveState('ok')
            draw()
          } finally {
            void ctx.close()
          }
        } catch {
          if (!cancelled) {
            setWaveState('error') // الإشارة تعذّرت — التشغيل يبقى متاحاً
            draw()
          }
        }
      } catch {
        if (!cancelled) setWaveState('error')
      }
    }
    void run()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, fileName, draw])

  /* ---------- أحداث عنصر الصوت ---------- */
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime = () => {
      ratioRef.current = audio.duration ? audio.currentTime / audio.duration : 0
      setCurrent(audio.currentTime)
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(draw)
    }
    const onMeta = () => setDuration(audio.duration || 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnd = () => {
      setPlaying(false)
      ratioRef.current = 0
      setCurrent(0)
      draw()
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnd)
    if (autoPlay) void audio.play().catch(() => undefined)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnd)
      cancelAnimationFrame(rafRef.current)
      audio.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl])

  /* ---------- تتبّع الثيم والحجم لإعادة الرسم ---------- */
  useEffect(() => {
    const obs = new MutationObserver(draw)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const ro = new ResizeObserver(draw)
    if (canvasRef.current) ro.observe(canvasRef.current)
    return () => {
      obs.disconnect()
      ro.disconnect()
    }
  }, [draw])

  /* ---------- اختصارات لوحة المفاتيح ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      // الحقول والأزرار المركّزة لها سلوكها الأصلي (مسافة الزر تنقره — بلا تبديل مزدوج).
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
      const audio = audioRef.current
      if (!audio) return
      if (e.code === 'Space') {
        e.preventDefault()
        void toggle()
      } else if (e.key === 'ArrowRight') {
        audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5)
      } else if (e.key === 'ArrowLeft') {
        audio.currentTime = Math.max(0, audio.currentTime - 5)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- التحكم ---------- */
  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => undefined)
    else audio.pause()
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      audio.volume = muted ? 0 : volume
      audio.playbackRate = playbackRate
    }
  }, [volume, muted, playbackRate])

  /* ---------- العرض ---------- */
  const back5 = () => {
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = Math.max(0, audio.currentTime - 5)
      setCurrent(audio.currentTime)
      draw()
    }
  }
  const forward5 = () => {
    const audio = audioRef.current
    if (audio && audio.duration) {
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 5)
      setCurrent(audio.currentTime)
      draw()
    }
  }
  const hasTitle = !!title && title.trim() !== ''

  return (
    <div className="fsp-root no-icon-scale" dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{FSP_CSS}</style>

      {/* مصدر الصوت: Blob URL (يفك asset://) مع تراجع للرابط الأصلي */}
      <audio ref={audioRef} src={audioUrl ?? src} preload="metadata" />

      {/* الرأس: أيقونة + العنوان + اسم الملف + إغلاق */}
      <div className="fsp-head">
        <div className="fsp-badge" aria-hidden="true">
          <Music size={20} />
        </div>
        <div className="fsp-titles">
          <div className="fsp-title">{hasTitle ? title : fileName}</div>
          {hasTitle && <div className="fsp-file">{fileName}</div>}
        </div>
        {onClose && (
          <Tooltip content={t('pageRepoViewer.closeAria')} position="bottom">
            <button type="button" className="fsp-btn is-ghost" onClick={onClose} aria-label={t('pageRepoViewer.closeAria')}>
              <X size={18} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* بطاقة الإشارة + الزمن */}
      <div className="fsp-wave-wrap">
        {waveState === 'loading' && <div className="fsp-wave-note">{t('soundPlayer.loadingText')}</div>}
        {waveState === 'error' && <div className="fsp-wave-note">{t('soundPlayer.waveError')}</div>}
        <canvas
          ref={canvasRef}
          className="fsp-wave"
          dir="ltr"
        />
        <div className="fsp-time">
          <b>{fmt(current)}</b>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* التحكم */}
      <div className="fsp-controls">
        {/* الصف الرئيسي: إيقاف | رجوع 5 | تشغيل | تقدم 5 | كتم */}
        <div className="fsp-main-controls">
          <Tooltip content={t('soundPlayer.stopTitle')} position="top">
            <button type="button" className="fsp-btn" onClick={stop} aria-label={t('soundPlayer.stopTitle')}>
              <Square size={17} />
            </button>
          </Tooltip>
          <Tooltip content={t('soundPlayer.back5Title')} position="top">
            <button type="button" className="fsp-btn fsp-btn-md is-ghost" onClick={back5} aria-label={t('soundPlayer.back5Title')}>
              <RotateCcw size={20} />
            </button>
          </Tooltip>
          <Tooltip content={t(playing ? 'soundPlayer.pauseTitle' : 'soundPlayer.playTitle')} position="top">
            <button
              type="button"
              className={`fsp-btn fsp-btn-xl${playing ? ' is-playing' : ''}`}
              onClick={toggle}
              aria-label={t(playing ? 'soundPlayer.pauseTitle' : 'soundPlayer.playTitle')}
            >
              {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
            </button>
          </Tooltip>
          <Tooltip content={t('soundPlayer.forward5Title')} position="top">
            <button type="button" className="fsp-btn fsp-btn-md is-ghost" onClick={forward5} aria-label={t('soundPlayer.forward5Title')}>
              <RotateCw size={20} />
            </button>
          </Tooltip>
          <Tooltip content={t(muted ? 'soundPlayer.unmuteTitle' : 'soundPlayer.muteTitle')} position="top">
            <button
              type="button"
              className="fsp-btn fsp-btn-mute"
              onClick={() => setMuted((m) => !m)}
              aria-label={t(muted ? 'soundPlayer.unmuteTitle' : 'soundPlayer.muteTitle')}
            >
              {muted || volume === 0 ? <VolumeX size={20} color="#c8443c" /> : <Volume2 size={20} />}
            </button>
          </Tooltip>
        </div>

        {/* شريط سفلي: مستوى الصوت | السرعة */}
        <div className="fsp-bottom">
          <div className="fsp-group">
            <span className="fsp-vol-icon" aria-hidden="true">
              {muted || volume === 0 ? <VolumeX size={20} color="#c8443c" /> : <Volume2 size={20} color="var(--muted)" />}
            </span>
            <input
              type="range"
              className="fsp-range fsp-range-vol"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value))
                setMuted(false)
              }}
              aria-label={t('soundPlayer.volumeAria')}
            />
          </div>
          <span className="fsp-sep" />
          <div className="fsp-group fsp-group-speed">
            <span className="fsp-vol-icon" aria-hidden="true">
              <Gauge size={20} color="var(--muted)" />
            </span>
            <Tooltip content={t('soundPlayer.speedTitle')} position="top" className="fsp-speed-tip">
              <input
                type="range"
                className="fsp-range fsp-range-vol"
                min={1}
                max={5.5}
                step={0.25}
                value={playbackRate}
                onChange={(e) => {
                  const audio = audioRef.current
                  if (audio) audio.playbackRate = Number(e.target.value)
                  setPlaybackRate(Number(e.target.value))
                }}
                aria-label={t('soundPlayer.speedAria')}
              />
            </Tooltip>
            <span className="fsp-chip">{playbackRate}×</span>
          </div>
        </div>
      </div>
    </div>
  )
}
