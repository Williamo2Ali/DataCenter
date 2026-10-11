/**
 * HtmlFileViewer.tsx
 * ------------------------------------------------------------------
 * عارض ملفات HTML للقراءة فقط (React + TypeScript) بدون تنفيذ أي سكربت.
 * لا يحتاج أي مكتبة خارجية (فقط React 16.8 فأعلى) وكل شيء داخل هذا الملف.
 *
 * كيف يحقق الأمان؟ (ثلاث طبقات تعمل معاً — Defense in depth)
 *   1) التعقيم (Sanitize): نحلل الـ HTML بواسطة DOMParser (وثيقة خاملة لا تنفذ سكربتات
 *      ولا تحمّل صوراً) ثم نحذف: <script> و <iframe> و <object> و <embed> و <link> و <meta>
 *      و <base> والفيديو/الصوت ونحو ذلك، وكل سمات الأحداث (onclick, onerror, ...)،
 *      وكل الروابط الخطرة (javascript: / data:text/html / http: ...).
 *   2) سياسة أمان المحتوى (CSP): نحقن في المستند وسم <meta> بسياسة default-src 'none'
 *      فتُمنع السكربتات وأي طلب شبكة (صور خارجية، خطوط، CSS خارجي، إلخ).
 *   3) الصندوق الرملي (Sandbox): نعرض النتيجة داخل <iframe sandbox=""> الفارغ تماماً:
 *      لا سكربتات، لا نماذج، لا نوافذ منبثقة، لا تنقل للصفحة الأم، ومصدر معزول (opaque origin).
 *      حتى لو فاتت ثغرة في الطبقتين الأوليين فالمتصفح لن ينفذ أي سكربت.
 *
 * طريقة الاستخدام:
 *      import HtmlFileViewer from "./HtmlFileViewer";
 *
 *      // أ) نص HTML جاهز:
 *      <HtmlFileViewer html={htmlString} />
 *
 *      // ب) ملف يختاره المستخدم (File من <input type="file">):
 *      <HtmlFileViewer file={file} />
 *
 *      // ج) رابط (يجب أن يسمح الخادم بـ CORS إذا كان من دومين آخر):
 *      <HtmlFileViewer url="https://example.com/page.html" />
 *
 * ملاحظات مهمة:
 *   - الروابط <a> تصبح غير فعّالة (عدا روابط # داخل الصفحة نفسها) لمنع الخروج لمواقع أخرى.
 *   - الصور الخارجية محظورة افتراضياً (خصوصية: منع بكسلات التتبع). الصور المضمنة data: تعمل.
 *     يمكنك السماح بالصور الخارجية عبر allowRemoteImages (صور فقط، وليس سكربت أو CSS).
 *   - عناصر النماذج (input, button...) تُعرض معطّلة (disabled) حتى لا تُستخدم للتضليل.
 *   - يوجد تبويب "المصدر" يعرض كود HTML الأصلي كنص عادي (آمن) داخل <pre>.
 *   - لا تعتمد على جهة العميل وحدها إذا كان المحتوى سيُحفظ أو يُنشر لمستخدمين آخرين:
 *     في تلك الحالة عقّم المحتوى أيضاً في الخادم.
 */

import { useEffect, useMemo, useRef, useState } from "react";

/* ==================================================================
 * 1) الأنواع
 * ================================================================== */

export interface HtmlFileViewerProps {
  /** نص HTML جاهز للعرض (له الأولوية على file و url) */
  html?: string;
  /** ملف أو Blob لقراءته */
  file?: File | Blob;
  /** رابط لتحميل الـ HTML منه */
  url?: string;
  /** السماح بتحميل الصور الخارجية http/https (الافتراضي false لحماية الخصوصية) */
  allowRemoteImages?: boolean;
  /** ارتفاع منطقة العرض (الافتراضي "60vh") */
  height?: number | string;
  /** أقصى عدد أحرف يتم عرضه (الافتراضي 2,000,000) */
  maxChars?: number;
  /** كلاس اختياري للحاوية الخارجية لتنسيقها من الخارج */
  className?: string;
  /** يُستدعى عند فشل قراءة الملف أو تحميله */
  onError?: (message: string) => void;
}

/** نتيجة التعقيم */
export interface SanitizeResult {
  /** مستند HTML كامل وآمن جاهز لـ srcDoc */
  srcDoc: string;
  /** عدد العناصر التي حُذفت (مثل script) */
  removedElements: number;
  /** عدد السمات التي حُذفت (مثل onclick و javascript:) */
  removedAttributes: number;
}

/* ==================================================================
 * 2) قوائم الحظر
 * ================================================================== */

/** وسوم تُحذف بالكامل مع محتواها */
const BLOCKED_TAGS = new Set([
  "script", "noscript", "iframe", "frame", "frameset", "object", "embed", "applet",
  "link", "meta", "base", "portal", "template", "slot",
  "video", "audio", "source", "track", "param",
  // وسوم SVG القادرة على تنفيذ أو تحميل محتوى
  "foreignobject", "use", "animate", "animatemotion", "animatetransform", "set",
  "handler", "listener",
]);

/** وسوم النماذج: تبقى ظاهرة لكن معطّلة */
const FORM_CONTROLS = new Set(["input", "button", "select", "textarea", "option", "optgroup"]);

/** سمات تحمل روابط */
const URL_ATTRS = new Set([
  "href", "src", "xlink:href", "action", "formaction", "poster", "data", "background",
  "ping", "srcset", "cite", "longdesc", "codebase", "manifest", "icon", "usemap",
]);

/** يزيل الفراغات والمحارف التحكمية (للتغلب على حيل مثل "java\tscript:") ويحوّل لأحرف صغيرة */
function normalizeUrl(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0020\u007f-\u009f]+/g, "").toLowerCase();
}

/** صورة data: آمنة (لا نسمح بـ data:text/html ولا غيرها) */
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|bmp|avif|x-icon|svg\+xml)[;,]/;

/** هل قيمة الرابط مسموحة لهذه السمة وهذا الوسم؟ */
function isAllowedUrl(tag: string, attr: string, value: string, allowRemoteImages: boolean): boolean {
  const v = normalizeUrl(value);
  if (v === "") return true;
  // روابط داخل الصفحة نفسها (#section) آمنة
  if (v.startsWith("#") && (attr === "href" || attr === "xlink:href")) return true;
  // الصور فقط يمكن أن تحمل data: أو (اختيارياً) http/https
  const isImageTag = tag === "img" || tag === "image";
  if (isImageTag && (attr === "src" || attr === "href" || attr === "xlink:href")) {
    if (SAFE_DATA_IMAGE.test(v)) return true;
    if (allowRemoteImages && /^https?:\/\//.test(v)) return true;
  }
  return false;
}

/* ==================================================================
 * 3) دالة التعقيم
 * ================================================================== */

export function sanitizeHtml(source: string, allowRemoteImages = false): SanitizeResult {
  // خارج المتصفح (SSR) لا يوجد DOMParser: نعيد مستنداً فارغاً بدل المجازفة
  if (typeof DOMParser === "undefined") {
    return { srcDoc: "", removedElements: 0, removedAttributes: 0 };
  }

  // DOMParser ينتج مستنداً "خاملاً": لا تُنفَّذ فيه السكربتات ولا تُحمَّل الصور
  const doc = new DOMParser().parseFromString(source, "text/html");
  let removedElements = 0;
  let removedAttributes = 0;

  const all = Array.from(doc.querySelectorAll("*"));
  for (const el of all) {
    // قد يكون العنصر أُزيل سابقاً مع أبيه
    if (!doc.documentElement.contains(el)) continue;

    const tag = (el.localName || "").toLowerCase();

    if (BLOCKED_TAGS.has(tag)) {
      el.remove();
      removedElements++;
      continue;
    }

    // تنظيف السمات
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      let remove = false;

      if (name.startsWith("on")) remove = true; // onclick, onerror, onload ...
      else if (name === "srcdoc" || name === "target" || name === "is") remove = true;
      else if (URL_ATTRS.has(name)) remove = !isAllowedUrl(tag, name, attr.value, allowRemoteImages);
      else if (name === "style" && /expression\s*\(|javascript:|@import|behavior\s*:/i.test(attr.value)) remove = true;

      if (remove) {
        el.removeAttribute(attr.name);
        removedAttributes++;
      }
    }

    // نعطّل عناصر النماذج
    if (FORM_CONTROLS.has(tag)) el.setAttribute("disabled", "");

    // نزيل @import من وسوم <style> (CSP يمنعه أيضاً)
    if (tag === "style" && el.textContent && /@import/i.test(el.textContent)) {
      el.textContent = el.textContent.replace(/@import[^;]*;?/gi, "");
      removedAttributes++;
    }
  }

  // سياسة المحتوى: لا شيء مسموح عدا الأنماط المضمنة والصور (data: وربما https)
  const imgSrc = allowRemoteImages ? "data: https: http:" : "data:";
  const csp =
    `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:; ` +
    `base-uri 'none'; form-action 'none'`;

  // نبني مستنداً جديداً: وسوم CSP أولاً (يجب أن تسبق أي محتوى) ثم head ثم body بعد التعقيم
  const srcDoc =
    "<!DOCTYPE html><html><head>" +
    '<meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    '<meta name="referrer" content="no-referrer">' +
    doc.head.innerHTML +
    "</head>" +
    doc.body.outerHTML +
    "</html>";

  return { srcDoc, removedElements, removedAttributes };
}

/* ==================================================================
 * 4) المكوّن الرئيسي
 * ================================================================== */

export default function HtmlFileViewer({
  html,
  file,
  url,
  allowRemoteImages = false,
  height = "60vh",
  maxChars = 2000000,
  className,
  onError,
}: HtmlFileViewerProps) {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"render" | "source">("render");

  // نحتفظ بآخر onError بدون إعادة تشغيل التحميل عند تغيّره
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  /* ---------- تحميل المصدر (نص / ملف / رابط) ---------- */
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setError(null);

    const fail = (message: string) => {
      if (cancelled) return;
      setError(message);
      setLoading(false);
      onErrorRef.current?.(message);
    };
    const done = (value: string) => {
      if (cancelled) return;
      setRaw(value);
      setLoading(false);
    };

    if (html !== undefined) {
      done(html);
    } else if (file) {
      setLoading(true);
      file.text().then(done).catch(() => fail("تعذر قراءة الملف."));
    } else if (url) {
      setLoading(true);
      fetch(url, { signal: controller.signal, credentials: "omit" }) // لا نرسل كوكيز
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.text();
        })
        .then(done)
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name !== "AbortError") fail("تعذر تحميل الملف من الرابط.");
        });
    } else {
      done("");
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [html, file, url]);

  /* ---------- تجهيز المحتوى ---------- */
  const { content, truncated } = useMemo(() => {
    let t = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const cut = t.length > maxChars;
    if (cut) t = t.slice(0, maxChars);
    return { content: t, truncated: cut };
  }, [raw, maxChars]);

  const isBinary = useMemo(() => content.slice(0, 8000).includes("\u0000"), [content]);

  // نعقّم فقط عند عرض النتيجة (وليس عند عرض المصدر)
  const sanitized = useMemo<SanitizeResult | null>(
    () => (view === "render" && !isBinary && content ? sanitizeHtml(content, allowRemoteImages) : null),
    [view, isBinary, content, allowRemoteImages]
  );

  const blockedCount = sanitized ? sanitized.removedElements + sanitized.removedAttributes : 0;

  /* ---------- الواجهة ---------- */
  return (
    <div className={className}>
      {/* التبديل بين العرض والمصدر */}
      <div role="toolbar" aria-label="أدوات العارض">
        <button type="button" onClick={() => setView("render")} aria-pressed={view === "render"} disabled={view === "render"}>
          عرض الصفحة
        </button>{" "}
        <button type="button" onClick={() => setView("source")} aria-pressed={view === "source"} disabled={view === "source"}>
          المصدر (HTML)
        </button>
      </div>

      {/* معلومات وحالات */}
      <div role="status">
        {loading && <span>جارٍ التحميل... </span>}
        {!loading && !error && !isBinary && <span>{content.length} حرف</span>}
        {view === "render" && blockedCount > 0 && (
          <span>
            {" "}
            · تم تعطيل {sanitized!.removedElements} عنصر و {sanitized!.removedAttributes} سمة غير آمنة
          </span>
        )}
        {truncated && <span> · تم اقتطاع الملف عند {maxChars} حرف</span>}
      </div>

      {error && <p role="alert">{error}</p>}
      {isBinary && <p role="alert">هذا الملف يبدو ثنائياً (غير نصي) ولا يمكن عرضه.</p>}

      {!error && !isBinary && view === "render" && (
        /*
          sandbox="" (فارغ) = أقصى قيود: لا سكربتات، لا نماذج، لا نوافذ منبثقة،
          لا تنقل للصفحة الأم، ولا same-origin.
          لا تضف أبداً allow-scripts أو allow-same-origin هنا!
        */
        <iframe
          title="معاينة HTML (للقراءة فقط)"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={sanitized?.srcDoc ?? ""}
          style={{ width: "100%", height }}
        />
      )}

      {!error && !isBinary && view === "source" && (
        // المصدر يُعرض كنص عادي داخل <pre> (React يهرّب المحتوى تلقائياً)
        <pre
          tabIndex={0}
          aria-label="مصدر HTML (للقراءة فقط)"
          dir="ltr"
          style={{
            margin: 0,
            maxHeight: height,
            overflow: "auto",
            textAlign: "left",
            fontFamily: 'Consolas, Menlo, Monaco, "Courier New", monospace',
          }}
        >
          <code>{content}</code>
        </pre>
      )}
    </div>
  );
}
