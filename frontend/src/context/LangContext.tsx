import { createContext, useContext, useState } from 'react';
import { setLang, getLang, type Lang } from '@/i18n/i18n';

interface LangCtx {
  lang: Lang;
  switchLang: (l: Lang) => void;
}

const LangContext = createContext<LangCtx>({
  lang: getLang(),
  switchLang: () => {},
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang());

  function switchLang(l: Lang) {
    setLang(l);
    setLangState(l);
  }

  return (
    <LangContext.Provider value={{ lang, switchLang }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
