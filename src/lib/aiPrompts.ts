// قوالب برومبتات الاستيراد الذكي — نوع المستند × لغة المستند.
// المستخدم ينسخ البرومبت مع الصورة لذكاء خارجي (حسابه الخاص)، ثم يلصق JSON هنا.
// (مرجعية الخطة: plan/Finished/ai_prompt_extract_text.md)

export type PromptDocType = 'passport' | 'national_id' | 'civil' | 'study' | 'general'
export type PromptLang = 'ar' | 'en' | 'both'

export const PROMPT_DOC_TYPES: PromptDocType[] = ['passport', 'national_id', 'civil', 'study', 'general']

type ExpectedField = { ar: string; en: string }

/** الحقول المتوقعة لكل نوع — تطابق قالب المصنع في الخلفية (تُحقَن في البرومبت). */
const EXPECTED: Record<PromptDocType, ExpectedField[]> = {
  passport: [
    { ar: 'الكنية / اسم العائلة', en: 'Surname' },
    { ar: 'الاسم الأول', en: 'Given Name' },
    { ar: 'الاسم الكامل', en: 'Full Name' },
    { ar: 'اسم الأب', en: "Father's Name" },
    { ar: 'اسم الأم', en: "Mother's Name" },
    { ar: 'الجنس', en: 'Sex' },
    { ar: 'تاريخ الولادة', en: 'Date of Birth' },
    { ar: 'مكان الولادة', en: 'Place of Birth' },
    { ar: 'الرقم الوطني', en: 'National Number' },
    { ar: 'رقم جواز السفر', en: 'Passport Number' },
    { ar: 'نوع الجواز', en: 'Passport Type' },
    { ar: 'رمز البلد', en: 'Country Code' },
    { ar: 'بلد الإصدار', en: 'Country of Issue' },
    { ar: 'مكان الإصدار', en: 'Place of Issue' },
    { ar: 'تاريخ الإصدار', en: 'Date of Issue' },
    { ar: 'تاريخ انتهاء الصلاحية', en: 'Date of Expiry' },
  ],
  national_id: [],
  civil: [],
  study: [
    { ar: 'المرحلة الدراسية', en: 'Education Level' },
    { ar: 'سنة التخرج', en: 'Graduation Year' },
    { ar: 'الفرع / التخصص', en: 'Major' },
    { ar: 'الجامعة / المدرسة', en: 'University / School' },
    { ar: 'ملاحظات', en: 'Notes' },
  ],
  general: [],
}

const LANG_RULE: Record<PromptLang, string> = {
  ar: 'القيم بالعربية، مع valueEn ترجمة إنجليزية لكل قيمة.',
  en: 'Values in English, with valueEn identical to value.',
  both: 'كل قيمة بلغتها الأصلية في value، مع ترجمة مقابلة في valueEn (والعكس للعربية).',
}

/** توليد البرومبت الكامل لنوع مستند ولغة — جاهز للنسخ مع الصورة. */
export function buildPrompt(docType: PromptDocType, lang: PromptLang): string {
  const expected = EXPECTED[docType]
  const fieldsHint = expected.length > 0
    ? `\nالحقول المتوقعة (استخدم هذه الأسماء حرفياً):\n${expected.map((f) => `- ${f.ar} / ${f.en}`).join('\n')}`
    : `\nاستخرج كل حقل تجده: العنوان من السياق (عربي + ترجمته الإنجليزية).`
  return `استخرج كل البيانات النصية من هذه الصورة وأعدها بصيغة JSON فقط — بدون أي شرح أو markdown.

القواعد:
- مصفوفة كائنات، كل كائن = حقل واحد: {"label":"","labelEn":"","value":"","valueEn":"","type":"text"}
- label: اسم الحقل بالعربية. labelEn: ترجمته الإنجليزية.
- ${LANG_RULE[lang]}
- type واحد من: text, number, date, phone, yesno, list — الافتراضي text.
- التواريخ بصيغة YYYY-MM-DD. لا تخترع بيانات غير موجودة — اترك القيمة فارغة "" عند الشك.
- لا تخلط: الاسم في label والقيمة في value فقط.${fieldsHint}

مثال:
[{"label":"الاسم الكامل","labelEn":"Full Name","value":"سامر الحلبي","valueEn":"Samer Alhalabi","type":"text"}]

أعد JSON فقط.`
}
