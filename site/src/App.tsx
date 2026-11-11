import { useState } from 'react';
import { LangProvider, useLang } from './i18n.js';
import type { DictKey } from './i18n-dict.js';

/** Onglets du site — foyer et rituel agissent sur le foyer sélectionné. */
type Tab = 'home' | 'register' | 'building' | 'foyer' | 'ritual' | 'certificate' | 'budget';

const TAB_KEYS: Record<Tab, DictKey> = {
  home: 'tabHome',
  register: 'tabRegister',
  building: 'tabBuilding',
  foyer: 'tabFoyer',
  ritual: 'tabRitual',
  certificate: 'tabCertificate',
  budget: 'tabBudget',
};

/** Bascule de langue accessible (boutons aria-pressed). */
function LangToggle(): JSX.Element {
  const { lang, setLang, t } = useLang();
  return (
    <div className="lang-toggle" role="group" aria-label={t('langLabel')}>
      <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
        EN
      </button>
      <button type="button" aria-pressed={lang === 'fr'} onClick={() => setLang('fr')}>
        FR
      </button>
    </div>
  );
}

/** Coquille minimale — remplacée par les écrans réels dans l'itération suivante. */
function Shell(): JSX.Element {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>('home');
  return (
    <>
      <header className="app-header">
        <h1>{t('appTitle')}</h1>
        <LangToggle />
      </header>
      <p className="synthetic-banner" role="status">
        {t('synthetic')} — {t('syntheticNote')}
      </p>
      <nav className="tabs" aria-label={t('tabHome')}>
        {(Object.keys(TAB_KEYS) as Tab[]).map((k) => (
          <button key={k} type="button" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(TAB_KEYS[k])}
          </button>
        ))}
      </nav>
      <section className="screen" aria-live="polite">
        <p>{t('pitch')}</p>
      </section>
    </>
  );
}

/** Racine du site : provider de langue + coquille. */
export function App(): JSX.Element {
  return (
    <LangProvider>
      <Shell />
    </LangProvider>
  );
}