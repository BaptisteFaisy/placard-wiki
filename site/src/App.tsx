import { useState } from 'react';
import { LangProvider, useLang } from './i18n.js';
import type { DictKey } from './i18n-dict.js';
import { FOYERS } from './data/demo.js';
import { HomeScreen } from './screens/Home.js';
import { RegisterScreen } from './screens/Register.js';
import { BuildingScreen } from './screens/Building.js';
import { FoyerSheetScreen } from './screens/FoyerSheet.js';
import { RitualScreen } from './screens/Ritual.js';
import { CertificateScreen } from './screens/Certificate.js';
import { BudgetScreen } from './screens/Budget.js';

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

const TABS: Tab[] = ['home', 'register', 'building', 'foyer', 'ritual', 'certificate', 'budget'];

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

/** Le foyer sélectionné par défaut : un vrai foyer de la démo. */
const FIRST_FOYER_ID = 'F-1';

/** Corps de l'application : navigation + contenu de l'onglet actif. */
function Shell(): JSX.Element {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>('home');
  const [foyerId, setFoyerId] = useState<string>(FIRST_FOYER_ID);

  const openFoyer = (id: string): void => {
    setFoyerId(id);
    setTab('foyer');
  };

  const foyer = FOYERS[foyerId] ?? FOYERS[FIRST_FOYER_ID]!;

  return (
    <>
      <header className="app-header">
        <h1>{t('appTitle')}</h1>
        <LangToggle />
      </header>
      <p className="synthetic-banner" role="status">
        {t('synthetic')} — {t('syntheticNote')}
      </p>
      <nav className="tabs" role="tablist" aria-label={t('appTitle')}>
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
          >
            {t(TAB_KEYS[k])}
          </button>
        ))}
      </nav>
      {tab === 'home' && <HomeScreen onGotoRegister={() => setTab('register')} onGotoBuilding={() => setTab('building')} />}
      {tab === 'register' && <RegisterScreen onOpenFoyer={openFoyer} />}
      {tab === 'building' && <BuildingScreen onOpenFoyer={openFoyer} />}
      {tab === 'foyer' && <FoyerSheetScreen foyer={foyer} onSelectFoyer={setFoyerId} />}
      {tab === 'ritual' && <RitualScreen foyer={foyer} />}
      {tab === 'certificate' && <CertificateScreen />}
      {tab === 'budget' && <BudgetScreen />}
    </>
  );
}

/** Racine du site : provider de langue + coquille applicative. */
export function App(): JSX.Element {
  return (
    <LangProvider>
      <Shell />
    </LangProvider>
  );
}