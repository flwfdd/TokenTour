import { createContext, useContext } from "react";
import type { Lang } from "./locale";

const LangContext = createContext<Lang>("en");

export function I18nProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}
