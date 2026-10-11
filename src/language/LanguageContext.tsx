import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { setActiveLanguage, translate, type Language, type TranslationVars } from './index';

export type TranslateFn = (key: string, vars?: TranslationVars) => string;

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TranslateFn;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

type LanguageProviderProps = {
  language: Language;
  onLanguageChange: (language: Language) => void;
  children: ReactNode;
};

export function LanguageProvider({ language, onLanguageChange, children }: LanguageProviderProps) {
  // اتجاه ولغة المستند يتبعان اللغة المختارة (ar → rtl، en → ltr).
  useEffect(() => {
    setActiveLanguage(language);
    try {
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    } catch {
      // بيئة بلا DOM — لا شيء يُضبط.
    }
  }, [language]);

  // تثبيت الهوية: t/setLang لا تتغيران إلا بتغير اللغة نفسها —
  // وإلا فأي callback أب inline يعيد تشغيل كل تأثيرات المستهلكين (حلقة لا نهائية
  // مع onHeaderActionChange الذي يستدعي setState في الأب).
  const onChangeRef = useRef(onLanguageChange);
  onChangeRef.current = onLanguageChange;
  const value = useMemo<LanguageContextValue>(
    () => ({
      lang: language,
      setLang: (lang: Language) => onChangeRef.current(lang),
      t: (key: string, vars?: TranslationVars) => translate(language, key, vars),
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
