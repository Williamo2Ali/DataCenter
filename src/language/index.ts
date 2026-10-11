// طبقة الترجمة — المصدر الوحيد للنصوص.
// القواميس ملفات JSON محلية (ar.json / en.json)، والمفاتيح منقطة مثل 'pageHome.title'.
// الاستيفاء بصيغة {{var}} أو {var} (الثانية كانت مستخدمة فعلاً في القواميس — تُدعَم صراحةً).

import ar from './ar.json';
import en from './en.json';

export type Language = 'ar' | 'en';

export const languages: Language[] = ['ar', 'en'];

export const defaultLanguage: Language = 'ar';

const dictionaries: Record<Language, unknown> = { ar, en };

export function isLanguage(value: unknown): value is Language {
  return value === 'ar' || value === 'en';
}

export type TranslationVars = Record<string, string | number>;

function pick(dict: unknown, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(lang: Language, key: string, vars?: TranslationVars): string {
  const template = pick(dictionaries[lang], key) ?? pick(dictionaries.ar, key) ?? key;
  if (!vars) return template;
  return template.replace(/\{\{?\s*([\w]+)\s*\}?\}/g, (match: string, name: string) =>
    (vars[name] === undefined ? match : String(vars[name])),
  );
}

// ——— الطبقة غير-التفاعلية ———
// مثل VaultSession أو vaultStore: ملفات غير-React لا تستطيع استدعاء useLanguage().
// يتابع LanguageProvider اللغة النشطة هنا عبر setActiveLanguage، فيقرأونها بـ tr().
let activeLanguage: Language = defaultLanguage;

export function setActiveLanguage(lang: Language): void {
  activeLanguage = lang;
}

export function getActiveLanguage(): Language {
  return activeLanguage;
}

export function tr(key: string, vars?: TranslationVars): string {
  return translate(activeLanguage, key, vars);
}
