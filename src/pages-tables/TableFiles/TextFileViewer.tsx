/**
 * TextFileViewer.tsx
 * ------------------------------------------------------------------
 * عارض نصوص/أكواد للقراءة فقط (React + TypeScript) بدون أي ثيم أو تلوين.
 * لا يحتاج أي مكتبة خارجية (فقط React 16.8 فأعلى) وكل شيء داخل هذا الملف.
 *
 * ماذا يفعل؟
 *   - يعرض النص داخل <pre> (لا يمكن الكتابة فيه إطلاقاً، مع إمكانية التحديد والنسخ).
 *   - تكبير / تصغير / تغيير حجم الخط (أزرار + شريط تمرير + Ctrl + عجلة الماوس).
 *   - اكتشاف نوع المحتوى تلقائياً: نص عادي، JSON، CSS، C#، VB، TypeScript، TSX، JavaScript.
 *     (حسب امتداد اسم الملف أولاً، ثم حسب شكل المحتوى نفسه)
 *   - زر "تنسيق (Format)" لإعادة ترتيب المسافات والأسطر حسب النوع، بدون تلوين.
 *     ويمكنك تصحيح النوع يدوياً من القائمة إذا أخطأ الاكتشاف.
 *
 * طريقة الاستخدام:
 *      import TextFileViewer from "./TextFileViewer";
 *
 *      // أ) نص جاهز:
 *      <TextFileViewer text={code} fileName="app.ts" />
 *
 *      // ب) ملف يختاره المستخدم (File من <input type="file">):
 *      <TextFileViewer file={file} />
 *
 *      // ج) رابط (يجب أن يسمح الخادم بـ CORS إذا كان من دومين آخر):
 *      <TextFileViewer url="https://example.com/data.json" />
 *
 * ملاحظات مهمة:
 *   - التنسيق "خفيف" وليس بديلاً عن Prettier أو VS Code: هو يعيد ضبط المسافات البادئة
 *     وتقسيم الأسطر (خصوصاً للكود المضغوط minified) ولا يغيّر محتوى النصوص والتعليقات.
 *   - لا يتم تعديل النص الأصلي أبداً؛ التنسيق للعرض فقط، ويمكنك العودة للأصل بزر واحد.
 *   - الملفات الكبيرة جداً تُقتطع عند maxChars (الافتراضي 2,000,000 حرف) حفاظاً على الأداء.
 *   - الملفات الثنائية (صور، exe...) لا تُعرض، وتظهر رسالة بدلاً من ذلك.
 */

// عارض نصوص/أكواد للقراءة فقط بمعايير التطبيق: نصوصه من ملفي اللغة،
// وأزراره بأيقونات lucide داخل Tooltip المخصص، وألوانه من متغيرات الثيم.
// يعرض النص خاماً (بلا تلوين) مع تنسيق اختياري بزر — بلا أي مكتبة خارجية.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AArrowDown, AArrowUp, Braces, Copy, RotateCcw, TextSelect as TextSelectIcon, Type, WrapText } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { useToast } from 'react-theme-toast'
import TextKindModal from './TextKindModal'
import TextSelect, { type DropdownItem } from '../../components/Custom/TextSelect'
import { useLanguage, type TranslateFn } from '../../language/LanguageContext'

/* ==================================================================
 * 1) الأنواع (Types)
 * ================================================================== */

/** أنواع المحتوى المدعومة */
export type TextKind =
  | "text"
  | "json"
  | "css"
  | "csharp"
  | "vb"
  | "typescript"
  | "tsx"
  | "javascript";

export interface TextFileViewerProps {
  /** نص جاهز للعرض (له الأولوية على file و url) */
  text?: string;
  /** ملف أو Blob لقراءته */
  file?: File | Blob;
  /** رابط لتحميل النص منه */
  url?: string;
  /** اسم الملف (للمساعدة في معرفة النوع من الامتداد). يؤخذ تلقائياً من File إن وُجد */
  fileName?: string;
  /** حجم الخط الابتدائي بالبكسل (الافتراضي 14) */
  initialFontSize?: number;
  /** أصغر حجم خط مسموح (الافتراضي 8) */
  minFontSize?: number;
  /** أكبر حجم خط مسموح (الافتراضي 48) */
  maxFontSize?: number;
  /** أقصى عدد أحرف يتم عرضه (الافتراضي 2,000,000) */
  maxChars?: number;
  /** أقصى ارتفاع لمنطقة العرض (الافتراضي "60vh")، عند تجاوزه يظهر شريط تمرير */
  maxHeight?: number | string;
  /** كلاس اختياري للحاوية الخارجية لتنسيقها من الخارج */
  className?: string;
  /** يُستدعى عند فشل قراءة الملف أو تحميله */
  onError?: (message: string) => void;
}

export interface FormatResult {
  /** النص بعد التنسيق */
  text: string;
  /** ملاحظة اختيارية للمستخدم (مثلاً: JSON غير صالح) */
  note?: string;
}

/** أسماء الأنواع في الواجهة (عبر `textViewer.kind_<kind>`). */
const ALL_KINDS: TextKind[] = ['text', 'json', 'css', 'csharp', 'vb', 'typescript', 'tsx', 'javascript']

/* ==================================================================
 * 2) اكتشاف نوع المحتوى
 * ================================================================== */

/** خريطة امتداد الملف -> النوع */
const KIND_BY_EXTENSION: Record<string, TextKind> = {
  json: "json",
  jsonc: "json",
  geojson: "json",
  webmanifest: "json",
  css: "css",
  cs: "csharp",
  csx: "csharp",
  vb: "vb",
  vbs: "vb",
  bas: "vb",
  cls: "vb",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  txt: "text",
  rtf: "text",
  log: "text",
  md: "text",
  csv: "text",
};

/** يستخرج الامتداد من اسم ملف أو رابط (مع تجاهل ?query و #hash) */
function getExtension(name: string): string {
  const clean = name.split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

/**
 * يعرف نوع المحتوى.
 * 1) إذا كان الامتداد معروفاً (وليس txt) نعتمد عليه.
 * 2) وإلا نفحص شكل المحتوى نفسه بنظام نقاط بسيط (Heuristics).
 */
export function detectKind(content: string, fileName?: string): TextKind {
  if (fileName) {
    const byExt = KIND_BY_EXTENSION[getExtension(fileName)];
    if (byExt && byExt !== "text") return byExt;
  }
  return sniffKind(content);
}

/** كلمات تدل على أن النص "كود برمجي" وليس CSS */
const CODE_WORDS = /(^|[^.#@\w-])(function|const|let|var|class|interface|return|import|namespace|public|private|using)\b/;

/** هل يبدو أن النص يحتوي على JSX؟ */
function looksLikeJsx(src: string): boolean {
  return /<\/[A-Za-z][\w.]*\s*>|<\/>|<[A-Za-z][\w.]*(\s[^<>]*)?\/>/.test(src);
}

/** اكتشاف النوع من المحتوى فقط */
function sniffKind(content: string): TextKind {
  const t = content.trim();
  if (!t) return "text";

  // JSON: يبدأ بـ { أو [ ويمكن تحليله فعلاً
  if (/^[[{]/.test(t)) {
    try {
      JSON.parse(t);
      return "json";
    } catch {
      /* ليس JSON صالحاً، نكمل الفحص */
    }
  }

  const sample = t.slice(0, 20000); // نفحص أول جزء فقط للسرعة
  const score = { vb: 0, csharp: 0, typescript: 0, javascript: 0, css: 0 };
  const add = (k: keyof typeof score, re: RegExp, w: number) => {
    if (re.test(sample)) score[k] += w;
  };

  // --- VB ---
  add("vb", /^\s*(Imports|Option\s+(Explicit|Strict)|Module|Namespace)\s+\w/im, 2);
  add("vb", /^\s*(Public|Private|Friend|Protected)?\s*(Shared\s+)?(Sub|Function)\s+\w+\s*\(/im, 2);
  add("vb", /^\s*End\s+(Sub|Function|If|Class|Module|Namespace|Select|While|Try|With)\b/im, 3);
  add("vb", /^\s*Dim\s+\w+\s+As\s+\w+/im, 2);

  // --- C# ---
  add("csharp", /^\s*using\s+[\w.]+\s*;/m, 3);
  add("csharp", /^\s*namespace\s+[\w.]+\s*(\{|;|$)/m, 2);
  add(
    "csharp",
    /\b(public|private|internal|protected)\s+(static\s+|sealed\s+|abstract\s+|partial\s+|async\s+|override\s+|virtual\s+)*(class|struct|interface|enum|void|string|int|bool|var|Task)\b/,
    2
  );
  add("csharp", /\{\s*get;\s*(private\s+|init;|set;)/, 3);
  add("csharp", /\bConsole\.(WriteLine|ReadLine)\s*\(/, 2);
  add("csharp", /\bstatic\s+(async\s+)?(void|int|Task)\s+Main\s*\(/, 3);
  add("csharp", /\[(HttpGet|HttpPost|Serializable|Fact|Test|TestMethod)\b/, 2);

  // --- TypeScript ---
  add("typescript", /^\s*(export\s+)?(interface|type)\s+\w+(<[^>]*>)?\s*(=|\{|extends)/m, 3);
  add("typescript", /\b(const|let|var)\s+\w+\s*:\s*[\w<>[\]|&\s.'"]+\s*=/, 2);
  add("typescript", /\)\s*:\s*(void|string|number|boolean|Promise<[^>]*>|any|unknown|never)\s*(\{|=>)/, 3);
  add("typescript", /\b(readonly|implements|declare)\s+\w+/, 1);
  add("typescript", /\bas\s+(const|string|number|any|unknown)\b/, 2);
  add("typescript", /\w+\??\s*:\s*(string|number|boolean)\s*[;,)]/, 2);

  // --- JavaScript ---
  add("javascript", /\bfunction\s*\*?\s*\w*\s*\(|=>\s*[{(\w]/, 2);
  add("javascript", /\b(const|let|var)\s+\w+\s*=/, 1);
  add("javascript", /\brequire\s*\(|module\.exports|exports\.\w+|console\.(log|error|warn)\s*\(/, 2);
  add("javascript", /^\s*(import\s+.+\s+from\s+['"]|export\s+(default|const|function|class))/m, 2);
  add("javascript", /\bdocument\.(getElementById|querySelector)\b|\bwindow\./, 1);

  // --- CSS (فقط إذا لم نجد كلمات كود برمجي) ---
  if (!CODE_WORDS.test(sample)) {
    add("css", /^\s*@(media|import|font-face|keyframes|charset|supports)\b/m, 3);
    add("css", /[.#a-zA-Z][^{};\n]*\{\s*[\w-]+\s*:[^{};]+[;}]/, 2);
    const decl = sample.match(/^\s*[a-z-]+\s*:\s*[^;{}]+;\s*$/gm);
    if (decl && decl.length >= 2) score.css += 2;
  }

  // نختار الأعلى نقاطاً (بحد أدنى نقطتين)
  const tsLike = score.typescript >= 3;
  const best = (Object.keys(score) as (keyof typeof score)[])
    .filter((k) => k !== "typescript" && k !== "javascript")
    .sort((a, b) => score[b] - score[a])[0];
  const codeFamilyScore = Math.max(score.typescript, score.javascript);

  if (tsLike && score.typescript >= score[best]) return looksLikeJsx(sample) ? "tsx" : "typescript";
  if (score[best] >= 2 && score[best] >= codeFamilyScore) return best;
  if (score.javascript >= 2) return "javascript";
  if (score.typescript >= 2) return "typescript";
  return "text";
}

/* ==================================================================
 * 3) أدوات مشتركة للتنسيق
 * ================================================================== */

/** يحذف الأسطر الفارغة المتكررة من أول وآخر النص */
function trimBlankEdges(lines: string[]): string {
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/** هل النص "مضغوط" (minified)؟ أي أسطر طويلة جداً */
function isMinified(text: string): boolean {
  const lines = text.split("\n");
  if (lines.some((l) => l.length > 600)) return true;
  return text.length > 1000 && text.length / lines.length > 160;
}

/** كلمات إذا جاءت قبل / فهي بداية Regex وليست قسمة */
const REGEX_KEYWORDS = new Set([
  "return", "typeof", "case", "in", "of", "delete", "void", "throw", "new",
  "else", "do", "instanceof", "yield", "await",
]);

/** هل الحرف / هنا بداية regex literal (وليس عملية قسمة)؟ */
function regexAllowed(prevSig: string, lastWord: string): boolean {
  if (prevSig === "") return true;
  if ("(,=:[!&|?{};+-*%<>~^".includes(prevSig)) return true;
  return lastWord !== "" && REGEX_KEYWORDS.has(lastWord);
}

/** نهاية regex literal ابتداءً من الفهرس i (يعيد i+1 إذا لم يكن regex صالحاً) */
function regexEnd(s: string, i: number): number {
  let j = i + 1;
  let inClass = false;
  while (j < s.length && s[j] !== "\n") {
    const c = s[j];
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      j++;
      while (j < s.length && /[a-z]/i.test(s[j])) j++; // flags مثل gi
      return j;
    }
    j++;
  }
  return i + 1;
}

/* ==================================================================
 * 4) تنسيق نص عادي
 * ================================================================== */

/** إزالة المسافات الزائدة في نهاية الأسطر، ودمج الأسطر الفارغة المتكررة */
function formatPlain(src: string): string {
  const out: string[] = [];
  let blank = false;
  for (const raw of src.split("\n")) {
    const line = raw.replace(/[ \t]+$/, "");
    if (line === "") {
      if (!blank && out.length) out.push("");
      blank = true;
    } else {
      out.push(line);
      blank = false;
    }
  }
  return trimBlankEdges(out);
}

/* ==================================================================
 * 5) تنسيق JSON
 *    نعيد كتابة النص حرفاً بحرف (بدون JSON.parse) حتى لا نغيّر ترتيب
 *    المفاتيح أو نفقد دقة الأرقام الكبيرة.
 * ================================================================== */

function formatJson(src: string): string {
  const unit = "  ";
  let out = "";
  let depth = 0;
  let inStr = false;
  let esc = false;
  const nl = () => "\n" + unit.repeat(depth);

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      out += ch;
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (/\s/.test(ch)) continue; // نتجاهل المسافات خارج النصوص
    switch (ch) {
      case '"':
        inStr = true;
        out += ch;
        break;
      case "{":
      case "[": {
        // الكائن/المصفوفة الفارغة تبقى في سطر واحد: {} أو []
        let j = i + 1;
        while (j < src.length && /\s/.test(src[j])) j++;
        const closer = ch === "{" ? "}" : "]";
        if (src[j] === closer) {
          out += ch + closer;
          i = j;
        } else {
          depth++;
          out += ch + nl();
        }
        break;
      }
      case "}":
      case "]":
        depth = Math.max(0, depth - 1);
        out += nl() + ch;
        break;
      case ",":
        out += "," + nl();
        break;
      case ":":
        out += ": ";
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/* ==================================================================
 * 6) تنسيق CSS
 * ================================================================== */

function formatCss(src: string): string {
  const unit = "  ";
  const n = src.length;
  let out = "";
  let buf = ""; // السطر الحالي قيد البناء
  let depth = 0;
  let paren = 0; // عمق الأقواس () مثل url(data:...;base64,...)
  let i = 0;

  const flush = () => {
    const t = buf.trim();
    if (t) out += unit.repeat(depth) + t + "\n";
    buf = "";
  };

  // أول رمز من { ; } بعد موضع معين: يخبرنا هل نحن في "محدد" أم "تصريح"
  const nextStop = (from: number): string => {
    for (let k = from; k < n; k++) {
      const c = src[k];
      if (c === "{" || c === ";" || c === "}") return c;
    }
    return "";
  };

  while (i < n) {
    const ch = src[i];

    // تعليق /* ... */
    if (ch === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      const stop = e < 0 ? n : e + 2;
      const hadText = buf.trim() !== "";
      buf += src.slice(i, stop);
      if (!hadText) flush(); // تعليق في سطر مستقل
      i = stop;
      continue;
    }

    // نصوص "..." أو '...' تُنسخ كما هي
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && src[j] !== ch && src[j] !== "\n") {
        if (src[j] === "\\") j++;
        j++;
      }
      const end = j < n && src[j] === ch ? j + 1 : j;
      buf += src.slice(i, end);
      i = end;
      continue;
    }

    // مسافات: نختصرها إلى مسافة واحدة
    if (/\s/.test(ch)) {
      if (buf !== "" && !buf.endsWith(" ")) buf += " ";
      i++;
      continue;
    }

    if (ch === "(") {
      paren++;
      buf += ch;
      i++;
      continue;
    }
    if (ch === ")") {
      paren = Math.max(0, paren - 1);
      buf += ch;
      i++;
      continue;
    }
    if (paren > 0) {
      buf += ch;
      i++;
      continue;
    }

    if (ch === "{") {
      buf = buf.trim();
      buf += buf ? " {" : "{";
      flush();
      depth++;
      i++;
      continue;
    }
    if (ch === "}") {
      flush();
      depth = Math.max(0, depth - 1);
      out += unit.repeat(depth) + "}\n";
      if (depth === 0) out += "\n"; // سطر فارغ بين القواعد الرئيسية
      i++;
      continue;
    }
    if (ch === ";") {
      if (buf.trim() !== "") {
        buf = buf.trimEnd() + ";";
        flush();
      }
      i++;
      continue;
    }
    if (ch === ",") {
      buf = buf.trimEnd() + ",";
      if (nextStop(i + 1) === "{") flush(); // محددات متعددة: كل محدد في سطر
      else buf += " ";
      i++;
      continue;
    }
    if (ch === ":" && depth > 0 && nextStop(i + 1) !== "{") {
      buf = buf.trimEnd() + ": "; // color:red  ->  color: red
      i++;
      continue;
    }

    buf += ch;
    i++;
  }
  flush();
  return out.replace(/\n+$/, "");
}

/* ==================================================================
 * 7) تنسيق VB / VB.NET (حسب الكلمات المفتاحية)
 * ================================================================== */

const VB_MODIFIERS =
  /^(?:(?:Public|Private|Protected|Friend|Shared|Overrides|Overridable|NotOverridable|MustOverride|Overloads|Shadows|Static|ReadOnly|WriteOnly|Default|Partial|MustInherit|NotInheritable|Async|Iterator|Narrowing|Widening|Custom)\s+)+/i;

/** يعيد السطر بدون التعليق (') وبدون مسافات الأطراف */
function vbCode(line: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inStr && line[i + 1] === '"') {
        out += '""';
        i++;
        continue;
      }
      inStr = !inStr;
      out += c;
      continue;
    }
    if (!inStr && c === "'") break; // بداية تعليق
    out += c;
  }
  const t = out.trim();
  return /^rem\b/i.test(t) ? "" : t;
}

function formatVb(src: string): string {
  const unit = "    ";
  const lines = src.split("\n");
  const out: string[] = [];
  const stack: string[] = []; // الكتل المفتوحة حالياً
  let continued = false; // هل السطر السابق ينتهي بـ " _" ؟
  let blank = false;

  const top = () => stack[stack.length - 1];
  const popTo = (kind: string) => {
    const idx = stack.lastIndexOf(kind);
    if (idx >= 0) stack.length = idx;
  };
  const nextCode = (from: number): string => {
    for (let k = from; k < lines.length; k++) {
      const c = vbCode(lines[k]);
      if (c) return c;
    }
    return "";
  };
  const stripAttrs = (s: string) => s.replace(/^(<[^>]*>\s*_?\s*)+/, "");

  for (let idx = 0; idx < lines.length; idx++) {
    const trimmed = lines[idx].trim();
    if (!trimmed) {
      if (!blank && out.length) out.push("");
      blank = true;
      continue;
    }
    blank = false;

    const code = vbCode(trimmed);
    let level = stack.length;

    if (continued) {
      level = stack.length + 1; // تكملة سطر سابق
    } else if (code) {
      const stmt = stripAttrs(code).replace(VB_MODIFIERS, "");
      const first = (stmt.match(/^[A-Za-z]+/)?.[0] ?? "").toLowerCase();
      const endM = stmt.match(/^End\s+([A-Za-z]+)/i);
      const mustOverride = /\bMustOverride\b/i.test(code);
      const inInterface = top() === "interface";

      if (endM) {
        popTo(endM[1].toLowerCase());
        level = stack.length;
      } else if (first === "else" || first === "elseif") {
        level = Math.max(0, stack.length - (top() === "if" ? 1 : 0));
      } else if (first === "catch" || first === "finally") {
        level = Math.max(0, stack.length - (top() === "try" ? 1 : 0));
      } else if (first === "case" && stack.includes("select")) {
        if (top() === "case") stack.pop();
        level = stack.length;
        if (top() === "select") stack.push("case");
      } else if (first === "next") {
        popTo("for");
        level = stack.length;
      } else if (first === "loop") {
        popTo("do");
        level = stack.length;
      } else if (first === "wend") {
        popTo("while");
        level = stack.length;
      } else {
        let opener = "";
        if (["sub", "function", "class", "module", "namespace", "structure", "enum", "interface", "event", "operator"].includes(first)) {
          opener = first;
          if (mustOverride) opener = "";
          if (inInterface && ["sub", "function", "event"].includes(first)) opener = "";
          if (first === "event" && !/\bCustom\b/i.test(code)) opener = ""; // Event عادي بلا End Event
        } else if (first === "property") {
          // Property تفتح كتلة فقط إذا كان لها Get/Set (وليست Auto-property)
          const nx = stripAttrs(nextCode(idx + 1)).replace(VB_MODIFIERS, "");
          if (!mustOverride && !inInterface && /^(get|set)\b/i.test(nx)) opener = "property";
        } else if ((first === "get" || first === "set") && top() === "property") {
          opener = first;
        } else if (first === "if") {
          if (/\bThen$/i.test(code)) opener = "if"; // If سطر واحد لا تفتح كتلة
        } else if (first === "select" && /^Select\s+Case\b/i.test(stmt)) {
          opener = "select";
        } else if (["for", "while", "do", "try", "with", "synclock", "using"].includes(first)) {
          opener = first;
        }
        if (opener) stack.push(opener);
      }
    }

    out.push(unit.repeat(level) + trimmed);
    continued = code !== "" && /(^|\s)_$/.test(code);
  }
  return trimBlankEdges(out);
}

/* ==================================================================
 * 8) تنسيق الأكواد ذات الأقواس: C# / JavaScript / TypeScript / TSX
 *    الفكرة: نعيد حساب المسافة البادئة لكل سطر حسب عمق الأقواس { } ( ) [ ]
 *    مع تجاهل النصوص والتعليقات، وفي الكود المضغوط نقسمه إلى أسطر أولاً.
 *    لا نغيّر داخل النصوص متعددة الأسطر (template strings / verbatim).
 * ================================================================== */

interface BraceOptions {
  unit: string; // مسافة المستوى الواحد
  jsx: boolean; // هل نتعامل مع وسوم JSX؟
  regex: boolean; // هل توجد regex literals؟ (JS/TS فقط)
  csharp: boolean; // قواعد C# للنصوص (@"..." و """...""")
  backtick: boolean; // هل `template strings` موجودة؟
}

const JS_OPTIONS: BraceOptions = { unit: "  ", jsx: false, regex: true, csharp: false, backtick: true };
const CS_OPTIONS: BraceOptions = { unit: "    ", jsx: false, regex: false, csharp: true, backtick: false };

/** نهاية نص literal كامل (للنص كله) أو -1 إن لم يكن هنا نص */
function literalEnd(s: string, i: number, o: BraceOptions): number {
  const ch = s[i];
  if (ch === '"' && o.csharp) {
    if (s.startsWith('"""', i)) {
      const e = s.indexOf('"""', i + 3);
      return e < 0 ? s.length : e + 3;
    }
    if (s[i - 1] === "@" || (s[i - 1] === "$" && s[i - 2] === "@")) {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === '"') {
          if (s[j + 1] === '"') {
            j += 2;
            continue;
          }
          return j + 1;
        }
        j++;
      }
      return s.length;
    }
  }
  if (ch === '"' || ch === "'") {
    let j = i + 1;
    while (j < s.length && s[j] !== ch && s[j] !== "\n") {
      if (s[j] === "\\") j++;
      j++;
    }
    return j < s.length && s[j] === ch ? j + 1 : j;
  }
  if (ch === "`" && o.backtick) {
    let j = i + 1;
    while (j < s.length && s[j] !== "`") {
      if (s[j] === "\\") j++;
      j++;
    }
    return Math.min(s.length, j + 1);
  }
  return -1;
}

/** تقسيم الكود المضغوط إلى أسطر: بعد { و ; وقبل } (مع الحفاظ على الأسطر الموجودة) */
function splitStatements(src: string, o: BraceOptions): string {
  const n = src.length;
  const parts: string[] = [];
  let atNl = true;
  let paren = 0;
  let prevSig = "";
  let lastWord = "";

  const emit = (s: string) => {
    parts.push(s);
    atNl = false;
  };
  const nl = () => {
    if (parts[parts.length - 1] === " ") parts.pop();
    if (!atNl) {
      parts.push("\n");
      atNl = true;
    }
  };
  const peekNext = (from: number) => {
    let k = from;
    while (k < n && /\s/.test(src[k])) k++;
    return k;
  };

  let i = 0;
  while (i < n) {
    const ch = src[i];

    if (ch === "\n") { nl(); i++; continue; }
    if (ch === " " || ch === "\t" || ch === "\r") {
      if (!atNl && parts[parts.length - 1] !== " ") emit(" ");
      i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      let e = src.indexOf("\n", i);
      if (e < 0) e = n;
      emit(src.slice(i, e));
      i = e;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      const stop = e < 0 ? n : e + 2;
      emit(src.slice(i, stop));
      i = stop;
      continue;
    }
    const le = literalEnd(src, i, o);
    if (le >= 0) {
      emit(src.slice(i, le));
      i = le;
      prevSig = ch;
      lastWord = "";
      continue;
    }
    if (o.regex && ch === "/" && regexAllowed(prevSig, lastWord)) {
      const re = regexEnd(src, i);
      if (re > i + 1) {
        emit(src.slice(i, re));
        i = re;
        prevSig = "/";
        lastWord = "";
        continue;
      }
    }
    if (ch === "(") paren++;
    if (ch === ")") paren = Math.max(0, paren - 1);

    if (ch === "{") {
      const k = peekNext(i + 1);
      if (src[k] === "}") {
        emit("{}");
        i = k + 1;
        prevSig = "}";
        continue;
      }
      emit("{");
      nl();
      i++;
      prevSig = "{";
      lastWord = "";
      continue;
    }
    if (ch === "}") {
      nl();
      emit("}");
      i++;
      const k = peekNext(i);
      const rest = src.slice(k, k + 8);
      if (/^(else|catch|finally|while)\b/.test(rest) || /^[);,.\]]/.test(rest)) emit(" ");
      else nl();
      prevSig = "}";
      lastWord = "";
      continue;
    }
    if (ch === ";" && paren === 0) {
      emit(";");
      const k = peekNext(i + 1);
      // تعليق في نفس السطر بعد الفاصلة المنقوطة يبقى معها
      if (src.startsWith("//", k) && !src.slice(i + 1, k).includes("\n")) emit(" ");
      else nl();
      i++;
      prevSig = ";";
      lastWord = "";
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(src[j])) j++;
      const w = src.slice(i, j);
      emit(w);
      lastWord = w;
      prevSig = src[j - 1];
      i = j;
      continue;
    }
    emit(ch);
    prevSig = ch;
    lastWord = "";
    i++;
  }
  return parts.join("");
}

/** إطار قوس مفتوح */
interface Frame {
  t: "(" | "[" | "{" | "tag" | "jsx"; // tag = وسم JSX مفتوح، jsx = محتوى عنصر JSX
  lv: number; // مستوى إزاحة السطر الذي فُتح فيه (محتواه يكون بمستوى أعمق، وسطر إغلاقه بنفس المستوى)
  sw?: boolean; // هل هذا { هو جسم switch؟
  caseOpen?: boolean; // هل بدأ أول case داخل switch؟
}

/** إعادة حساب المسافات البادئة سطراً بسطر */
function reindent(src: string, o: BraceOptions): string {
  const lines = src.split("\n");
  const out: string[] = [];
  const stack: Frame[] = [];

  // حالة الإنشاءات متعددة الأسطر عند بداية السطر
  let mode: null | "block" | "tpl" | "verb" | "raw" = null;
  let prevSig = "";
  let lastWord = "";
  let pendingSwitch = false;
  let blank = false;
  let lineLevel = 0; // مستوى إزاحة السطر الذي نمسحه الآن

  const top = () => stack[stack.length - 1];

  /**
   * مستوى محتوى السطر التالي = مستوى سطر فتح آخر قوس + 1.
   * وبهذا فإن foo(function () {  تُحسب مستوى واحداً مهما كان عدد الأقواس المفتوحة في ذلك السطر.
   * داخل switch يضاف مستوى لمحتوى case.
   */
  const bodyLevel = () => {
    const t = top();
    if (!t) return 0;
    return t.lv + 1 + (t.t === "{" && t.sw && t.caseOpen ? 1 : 0);
  };

  /** إغلاق قوس: نتسامح مع الأخطاء (مثل regex غير مكتشف) لنتعافى عند أول } */
  const closeBracket = (ch: string): number | undefined => {
    if (ch === "}") {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].t === "{") {
          const lv = stack[k].lv;
          stack.length = k;
          return lv;
        }
      }
      return undefined;
    }
    const open = ch === ")" ? "(" : "[";
    let k = stack.length - 1;
    while (k >= 0 && (stack[k].t === "jsx" || stack[k].t === "tag")) k--;
    if (k >= 0 && stack[k].t === open) {
      const lv = stack[k].lv;
      stack.length = k;
      return lv;
    }
    return undefined;
  };

  // دوال إيجاد نهاية الإنشاء متعدد الأسطر داخل سطر واحد (-1 = يستمر للسطر التالي)
  const endBlock = (s: string, i: number) => { const e = s.indexOf("*/", i); return e < 0 ? -1 : e + 2; };
  const endTemplate = (s: string, i: number) => {
    for (let j = i; j < s.length; j++) {
      if (s[j] === "\\") j++;
      else if (s[j] === "`") return j + 1;
    }
    return -1;
  };
  const endVerbatim = (s: string, i: number) => {
    for (let j = i; j < s.length; j++) {
      if (s[j] === '"') {
        if (s[j + 1] === '"') { j++; continue; }
        return j + 1;
      }
    }
    return -1;
  };
  const endRaw = (s: string, i: number) => { const e = s.indexOf('"""', i); return e < 0 ? -1 : e + 3; };

  /** يمسح السطر ابتداءً من from ويحدّث الحالة (الأقواس، النصوص، التعليقات...) */
  const scan = (s: string, from: number) => {
    const n = s.length;
    let i = from;

    // استكمال إنشاء متعدد الأسطر بدأ في سطر سابق
    if (mode) {
      const fn = mode === "block" ? endBlock : mode === "tpl" ? endTemplate : mode === "verb" ? endVerbatim : endRaw;
      const e = fn(s, i);
      if (e < 0) return;
      i = e;
      mode = null;
    }

    while (i < n) {
      const ch = s[i];
      const t = top();

      // --- داخل محتوى عنصر JSX: فقط < و { لهما معنى، والباقي نص ---
      if (t && t.t === "jsx") {
        if (ch === "<") {
          if (s[i + 1] === "/") {
            const e = s.indexOf(">", i);
            stack.pop();
            i = e < 0 ? n : e + 1;
            prevSig = ">";
            lastWord = "";
            continue;
          }
          if (s[i + 1] === ">") {
            stack.push({ t: "jsx", lv: lineLevel });
            i += 2;
            prevSig = ">";
            continue;
          }
          if (/[A-Za-z_$]/.test(s[i + 1] ?? "")) {
            stack.push({ t: "tag", lv: lineLevel });
            i++;
            while (i < n && /[\w.$:-]/.test(s[i])) i++;
            prevSig = "a";
            continue;
          }
        }
        if (ch === "{") {
          stack.push({ t: "{", lv: lineLevel });
          prevSig = "{";
          lastWord = "";
        }
        i++;
        continue;
      }

      // --- داخل وسم JSX مفتوح (الخصائص) ---
      if (t && t.t === "tag") {
        if (ch === ">") {
          const selfClosing = s[i - 1] === "/";
          const tf = stack.pop();
          if (!selfClosing) stack.push({ t: "jsx", lv: tf ? tf.lv : lineLevel });
          prevSig = ">";
          lastWord = "";
          i++;
          continue;
        }
        if (ch === "{") {
          stack.push({ t: "{", lv: lineLevel });
          prevSig = "{";
          lastWord = "";
          i++;
          continue;
        }
        if (ch === '"' || ch === "'") {
          let j = i + 1;
          while (j < n && s[j] !== ch) j++;
          i = Math.min(n, j + 1);
          continue;
        }
        i++;
        continue;
      }

      // --- كود عادي ---
      if (ch === "/" && s[i + 1] === "/") return; // تعليق سطر
      if (ch === "/" && s[i + 1] === "*") {
        const e = s.indexOf("*/", i + 2);
        if (e < 0) { mode = "block"; return; }
        i = e + 2;
        continue;
      }

      if (ch === '"' || ch === "'") {
        if (o.csharp && ch === '"') {
          if (s.startsWith('"""', i)) {
            const e = endRaw(s, i + 3);
            if (e < 0) { mode = "raw"; return; }
            i = e; prevSig = '"'; lastWord = "";
            continue;
          }
          if (s[i - 1] === "@" || (s[i - 1] === "$" && s[i - 2] === "@")) {
            const e = endVerbatim(s, i + 1);
            if (e < 0) { mode = "verb"; return; }
            i = e; prevSig = '"'; lastWord = "";
            continue;
          }
        }
        // نص عادي: ينتهي بعلامة الإغلاق أو بنهاية السطر (حماية من الفواصل العليا في نص JSX)
        let j = i + 1;
        while (j < n && s[j] !== ch) {
          if (s[j] === "\\") j++;
          j++;
        }
        i = Math.min(n, j + 1);
        prevSig = ch;
        lastWord = "";
        continue;
      }
      if (ch === "`" && o.backtick) {
        const e = endTemplate(s, i + 1);
        if (e < 0) { mode = "tpl"; return; }
        i = e; prevSig = "`"; lastWord = "";
        continue;
      }
      if (o.regex && ch === "/" && regexAllowed(prevSig, lastWord)) {
        const re = regexEnd(s, i);
        if (re > i + 1) { i = re; prevSig = "/"; lastWord = ""; continue; }
      }

      // بداية عنصر JSX
      if (o.jsx && ch === "<") {
        const nx = s[i + 1] ?? "";
        const okPrev = prevSig === "" || "(,=?:{[&|!;>".includes(prevSig) || lastWord === "return" || lastWord === "default";
        if (okPrev && nx === ">") {
          stack.push({ t: "jsx", lv: lineLevel });
          i += 2; prevSig = ">"; lastWord = "";
          continue;
        }
        if (okPrev && /[A-Za-z_$]/.test(nx)) {
          stack.push({ t: "tag", lv: lineLevel });
          i++;
          while (i < n && /[\w.$:-]/.test(s[i])) i++;
          prevSig = "a"; lastWord = "";
          continue;
        }
      }

      if (ch === "(" || ch === "[" || ch === "{") {
        stack.push({ t: ch, lv: lineLevel, sw: ch === "{" && pendingSwitch });
        if (ch === "{") pendingSwitch = false;
        i++; prevSig = ch; lastWord = "";
        continue;
      }
      if (ch === ")" || ch === "]" || ch === "}") {
        closeBracket(ch);
        i++; prevSig = ch; lastWord = "";
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        let j = i + 1;
        while (j < n && /[\w$]/.test(s[j])) j++;
        const w = s.slice(i, j);
        if (w === "switch") pendingSwitch = true;
        lastWord = w;
        prevSig = s[j - 1];
        i = j;
        continue;
      }
      if (!/\s/.test(ch)) { prevSig = ch; lastWord = ""; }
      i++;
    }
  };

  for (const rawLine of lines) {
    // 1) أسطر داخل نص متعدد الأسطر: تُترك كما هي حرفياً
    if (mode === "tpl" || mode === "verb" || mode === "raw") {
      out.push(rawLine);
      blank = false;
      lineLevel = bodyLevel();
      scan(rawLine, 0);
      continue;
    }
    // 2) أسطر داخل تعليق /* */
    if (mode === "block") {
      const tr = rawLine.trim();
      const level = bodyLevel();
      out.push(tr.startsWith("*") ? o.unit.repeat(level) + " " + tr : rawLine);
      blank = false;
      lineLevel = level;
      scan(rawLine, 0);
      continue;
    }

    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (!blank && out.length) out.push("");
      blank = true;
      continue;
    }
    blank = false;

    // 3) الأقواس الختامية في بداية السطر تُنقص المسافة لهذا السطر نفسه
    let k = 0;
    let closedLv: number | undefined; // مستوى السطر الذي فُتح فيه أول قوس أُغلق هنا
    while (k < trimmed.length) {
      const c = trimmed[k];
      if (c === ")" || c === "]" || c === "}") {
        const lv = closeBracket(c);
        if (closedLv === undefined) closedLv = lv;
        k++;
      } else if (o.jsx && trimmed.startsWith("</", k) && top()?.t === "jsx") {
        const e = trimmed.indexOf(">", k);
        const jf = stack.pop();
        if (closedLv === undefined && jf) closedLv = jf.lv;
        k = e < 0 ? trimmed.length : e + 1;
      } else break;
    }

    const rest = trimmed.slice(k);
    let level: number;
    const t = top();

    if (closedLv !== undefined) {
      level = closedLv; // سطر يبدأ بإغلاق: يحاذي السطر الذي فتح القوس
    } else if (t && t.t === "tag" && (rest.startsWith(">") || rest.startsWith("/>"))) {
      level = t.lv; // سطر يُغلق وسماً متعدد الأسطر
    } else if (t && t.t === "{" && t.sw && /^(case\b|default\s*:)/.test(rest)) {
      level = t.lv + 1; // case/default بمستوى واحد داخل switch
      t.caseOpen = true;
    } else {
      level = bodyLevel();
      // أسطر تكملة مثل: .then(...) أو && أو || في بداية السطر
      if (!(t && t.t === "jsx") && /^(\.[A-Za-z_$]|\?\.|&&|\|\||\?\?|\?\s|=>)/.test(rest)) level++;
    }

    lineLevel = Math.max(0, level);
    scan(trimmed, k);

    // إذا انتهى السطر داخل نص متعدد الأسطر نحافظ على المسافات في آخره
    const endsInString = mode === "tpl" || mode === "verb" || mode === "raw";
    const body = endsInString ? rawLine.replace(/^\s+/, "") : trimmed;
    out.push(o.unit.repeat(Math.max(0, level)) + body);
  }
  return trimBlankEdges(out);
}

/** تنسيق كود بأقواس: تقسيم (إن كان مضغوطاً) ثم إعادة المسافات */
function formatBraceCode(src: string, o: BraceOptions): string {
  const text = !o.jsx && isMinified(src) ? splitStatements(src, o) : src;
  return reindent(text, o);
}

/* ==================================================================
 * 9) نقطة الدخول للتنسيق حسب النوع
 * ================================================================== */

export function formatByKind(text: string, kind: TextKind, t: TranslateFn): FormatResult {
  try {
    switch (kind) {
      case "json":
        try {
          JSON.parse(text); // للتأكد من الصلاحية فقط
          return { text: formatJson(text) };
        } catch {
          return {
            text: formatBraceCode(text, JS_OPTIONS),
            note: t('textViewer.jsonInvalidNote'),
          };
        }
      case "css":
        return { text: formatCss(text) };
      case "vb":
        return { text: formatVb(text) };
      case "csharp":
        return { text: formatBraceCode(text, CS_OPTIONS) };
      case "typescript":
        return { text: formatBraceCode(text, JS_OPTIONS) };
      case "tsx":
        return { text: formatBraceCode(text, { ...JS_OPTIONS, jsx: true }) };
      case "javascript":
        return { text: formatBraceCode(text, { ...JS_OPTIONS, jsx: looksLikeJsx(text) }) };
      default:
        return { text: formatPlain(text) };
    }
  } catch {
    return { text, note: t('textViewer.formatFailedNote') };
  }
}

/* ==================================================================
 * 10) المكوّن الرئيسي
 * ================================================================== */

export default function TextFileViewer({
  text,
  file,
  url,
  fileName,
  initialFontSize = 14,
  minFontSize = 8,
  maxFontSize = 48,
  maxChars = 2000000,
  maxHeight = "60vh",
  className,
  onError,
}: TextFileViewerProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const clamp = (v: number) => Math.min(maxFontSize, Math.max(minFontSize, v));

  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fontSize, setFontSize] = useState(() => clamp(initialFontSize));
  const [wrap, setWrap] = useState(false);
  const [formatted, setFormatted] = useState(false);
  const [override, setOverride] = useState<"auto" | TextKind>("auto");
  // مودال نوع النص (يُفتَح من زر النوع في الشريط).
  const [kindModalOpen, setKindModalOpen] = useState(false);

  const preRef = useRef<HTMLPreElement>(null);

  // نحتفظ بآخر onError بدون إعادة تشغيل التحميل عند تغيّره
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  /* ---------- تحميل المصدر (نص / ملف / رابط) ---------- */
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // عند تغيّر المصدر نرجع للحالة الافتراضية
    setError(null);
    setFormatted(false);
    setOverride("auto");

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

    if (text !== undefined) {
      done(text);
    } else if (file) {
      setLoading(true);
      file.text().then(done).catch(() => fail(t('textViewer.readError')));
    } else if (url) {
      setLoading(true);
      fetch(url, { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.text();
        })
        .then(done)
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name !== "AbortError") fail(t('textViewer.loadError'));
        });
    } else {
      done("");
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [text, file, url]);

  /* ---------- تجهيز النص ---------- */
  const { content, truncated } = useMemo(() => {
    // نحذف BOM ونوحّد نهايات الأسطر إلى \n
    let t = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const cut = t.length > maxChars;
    if (cut) t = t.slice(0, maxChars);
    return { content: t, truncated: cut };
  }, [raw, maxChars]);

  const isBinary = useMemo(() => content.slice(0, 8000).includes("\u0000"), [content]);

  const name = fileName ?? (typeof File !== "undefined" && file instanceof File ? file.name : undefined) ?? url;
  const detected = useMemo(() => detectKind(content, name), [content, name]);
  const kind: TextKind = override === "auto" ? detected : override;

  // التنسيق يتم فقط عند الضغط على الزر
  const result = useMemo<FormatResult | null>(
    () => (formatted && !isBinary ? formatByKind(content, kind, t) : null),
    [formatted, isBinary, content, kind, t]
  );
  const shown = result ? result.text : content;
  const lineCount = useMemo(() => (shown ? shown.split("\n").length : 0), [shown]);

  /* ---------- Ctrl + عجلة الماوس لتغيير حجم الخط ---------- */
  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault(); // منع تكبير الصفحة نفسها
      setFontSize((s) => Math.min(maxFontSize, Math.max(minFontSize, s + (e.deltaY < 0 ? 1 : -1))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [maxFontSize, minFontSize, isBinary, error, loading]);

  /* ---------- الواجهة ---------- */
  const isCode = kind !== "text";
  const kindLabel = t(`textViewer.kind_${kind}`);
  const detectedLabel = t(`textViewer.kind_${detected}`);
  const kindItems: DropdownItem[] = [
    { id: 'auto', content: t('textViewer.autoOption', { kind: detectedLabel }) },
    ...ALL_KINDS.map((k) => ({ id: k, content: t(`textViewer.kind_${k}`) })),
  ];
  const formatTitle = formatted ? t('textViewer.showOriginalBtn') : t('textViewer.formatBtn');

  /** تحديد كامل النص المعروض (للنسخ اليدوي) — بلا تغيير في المحتوى. */
  const selectAllText = () => {
    const el = preRef.current
    if (!el) return
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    el.focus({ preventScroll: true })
  };

  /** نسخ النص المعروض إلى الحافظة مع توست نجاح/فشل. */
  const copyShown = async () => {
    try {
      await navigator.clipboard.writeText(shown)
      toast.success(t('textViewer.copiedMsg'))
    } catch {
      toast.error(t('textViewer.copyError'))
    }
  };

  return (
    <div className={`text-viewer flex flex-col gap-2 rounded border border-[var(--line)] bg-[var(--paper)] p-3 text-[var(--ink)]${className ? ` ${className}` : ''}`}>
      {/* شريط الأدوات — على الموبايل في المعاينة يثبَّت أسفل الشاشة عبر CSS */}
      <div className="text-viewer-toolbar no-icon-scale flex flex-wrap items-center gap-1" role="toolbar" aria-label={t('textViewer.toolbarAria')}>
        <div className="w-44 flex-none text-kind-select">
          <TextSelect
            items={kindItems}
            value={override}
            onItemChanged={(item) => setOverride(item.id as "auto" | TextKind)}
          />
        </div>
        <Tooltip content={formatTitle}>
          <button type="button" className="viewer-icon-button" onClick={() => setFormatted((f) => !f)} disabled={isBinary || !content} aria-label={formatTitle} aria-pressed={formatted}>
            <Braces size={22} />
          </button>
        </Tooltip>
        <Tooltip content={t('textViewer.decFontTitle')}>
          <button type="button" className="viewer-icon-button" onClick={() => setFontSize((s) => clamp(s - 1))} disabled={fontSize <= minFontSize} aria-label={t('textViewer.decFontTitle')}>
            <AArrowDown size={26} />
          </button>
        </Tooltip>
        <input
          type="range"
          className="text-font-slider w-24 min-w-0 flex-none accent-[var(--green)]"
          min={minFontSize}
          max={maxFontSize}
          step={1}
          value={fontSize}
          onChange={(e) => setFontSize(clamp(Number(e.target.value)))}
          aria-label={t('textViewer.fontSizeAria')}
        />
        <Tooltip content={t('textViewer.incFontTitle')}>
          <button type="button" className="viewer-icon-button" onClick={() => setFontSize((s) => clamp(s + 1))} disabled={fontSize >= maxFontSize} aria-label={t('textViewer.incFontTitle')}>
            <AArrowUp size={26} />
          </button>
        </Tooltip>
        <Tooltip content={t('textViewer.kindTitle')}>
          <button
            type="button"
            className="viewer-icon-button text-kind-btn"
            onClick={() => setKindModalOpen(true)}
            aria-label={t('textViewer.kindTitle')}
            aria-haspopup="dialog"
          >
            <Type size={22} />
          </button>
        </Tooltip>
        <Tooltip content={t('textViewer.resetSizeTitle')}>
          <button type="button" className="viewer-icon-button" onClick={() => setFontSize(clamp(initialFontSize))} aria-label={t('textViewer.resetSizeTitle')}>
            <RotateCcw size={22} />
          </button>
        </Tooltip>
        <Tooltip content={t('textViewer.wrapLabel')}>
          <button type="button" className="viewer-icon-button" onClick={() => setWrap((w) => !w)} aria-label={t('textViewer.wrapLabel')} aria-pressed={wrap}>
            <WrapText size={22} />
          </button>
        </Tooltip>
        <Tooltip content={t('textViewer.selectAllTitle')}>
          <button type="button" className="viewer-icon-button" onClick={selectAllText} disabled={!shown || isBinary} aria-label={t('textViewer.selectAllTitle')}>
            <TextSelectIcon size={22} />
          </button>
        </Tooltip>
        <Tooltip content={t('textViewer.copyTitle')}>
          <button type="button" className="viewer-icon-button" onClick={() => void copyShown()} disabled={!shown || isBinary} aria-label={t('textViewer.copyTitle')}>
            <Copy size={22} />
          </button>
        </Tooltip>
      </div>
      <TextKindModal
        isOpen={kindModalOpen}
        onClose={() => setKindModalOpen(false)}
        kinds={ALL_KINDS}
        activeKind={override}
        title={t('textViewer.kindTitle')}
        autoLabel={t('textViewer.autoOption', { kind: detectedLabel })}
        kindLabel={(k) => t(`textViewer.kind_${k}`)}
        onSelect={(k) => setOverride(k)}
      />

      {/* معلومات وحالات — الإحصاءات أولاً وحجم الخط في الجهة الثانية */}
      <div role="status" className="flex items-center justify-between gap-2 text-[0.75rem] text-[var(--muted)]">
        <div className="min-w-0">
          {loading && <span>{t('textViewer.loadingText')} </span>}
          {!loading && !error && !isBinary && (
            <span>
              {t('textViewer.statsLine', { lines: lineCount, chars: shown.length, kind: kindLabel })}
              {formatted ? ` ${t('textViewer.formattedSuffix')}` : ""}
            </span>
          )}
          {truncated && <span> · {t('textViewer.truncatedNote', { max: maxChars })}</span>}
          {result?.note && <p>{result.note}</p>}
        </div>
        <span className="flex-none">{fontSize}px</span>
      </div>

      {error && <p role="alert" className="text-[0.75rem] text-[#c8443c]">{error}</p>}
      {isBinary && <p role="alert" className="text-[0.75rem] text-[#c8443c]">{t('textViewer.binaryNotice')}</p>}

      {/* منطقة العرض: <pre> لا يقبل الكتابة، فقط قراءة وتحديد ونسخ */}
      {!error && !isBinary && (
        <pre
          ref={preRef}
          tabIndex={0}
          aria-label={t('textViewer.contentAria')}
          dir={isCode ? "ltr" : "auto"}
          className="no-icon-scale"
          style={{
            margin: 0,
            overflow: "auto",
            maxHeight,
            fontFamily: '"DM Mono", Consolas, Menlo, Monaco, "Courier New", monospace',
            fontSize,
            tabSize: 4,
            textAlign: isCode ? "left" : undefined,
            whiteSpace: wrap ? "pre-wrap" : "pre",
            overflowWrap: wrap ? "anywhere" : "normal",
          }}
        >
          <code>{shown}</code>
        </pre>
      )}
    </div>
  );
}
