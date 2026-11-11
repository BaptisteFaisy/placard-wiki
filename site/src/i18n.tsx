import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DICT } from './i18n-dict.js';
import type { DictKey } from './i18n-dict.js';

/** Langues de l'interface (§23) : anglais par défaut, français sur bascule. */
export type Lang = 'en' | 'fr';

/** Paire bilingue : tout texte du site passe par là (ou par le domaine). */
export interface Bilingual {
  readonly fr: string;
  readonly en: string;
}

export interface LangApi {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Traduit une clé du dictionnaire UI. */
  t: (key: DictKey) => string;
  /** Choisit la bonne langue dans une paire bilingue (libellés du domaine). */
  pick: (b: Bilingual) => string;
}

const LangContext = createContext<LangApi | null>(null);

/** Fournisseur de langue : état local, défaut anglais, persistance aucune. */
export function LangProvider({ children }: { children: ReactNode }): ReactNode {
  const [lang, setLang] = useState<Lang>('en');
  const api = useMemo<LangApi>(
    () => ({
      lang,
      setLang,
      t: (key: DictKey) => DICT[key][lang],
      pick: (b: Bilingual) => b[lang],
    }),
    [lang],
  );
  return <LangContext.Provider value={api}>{children}</LangContext.Provider>;
}

/** Accès à la langue courante — plante proprement si hors provider. */
export function useLang(): LangApi {
  const api = useContext(LangContext);
  if (!api) throw new Error('useLang doit être utilisé sous <LangProvider>');
  return api;
}
