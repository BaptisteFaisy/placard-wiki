import { useState } from 'react';
import type { Foyer, SpaceSettings } from '@placard-wiki/domain';
import { LangProvider, useLang } from './i18n.js';
import type { DictKey } from './i18n-dict.js';
import { FOYERS } from './data/demo.js';
import { INITIAL_SETTINGS } from './data/settings.js';
import { HomeScreen } from './screens/Home.js';
import { RegisterScreen } from './screens/Register.js';
import { BuildingScreen } from './screens/Building.js';
import { FoyerSheetScreen } from './screens/FoyerSheet.js';
import { RitualScreen } from './screens/Ritual.js';
import { CertificateScreen } from './screens/Certificate.js';
import { BudgetScreen } from './screens/Budget.js';
import { McpPlaygroundScreen } from './screens/McpPlayground.js';
import { RovoChatScreen } from './screens/RovoChat.js';
import { SkillCheckScreen } from './screens/SkillCheck.js';
import { PreActivationScreen } from './screens/PreActivation.js';
import { PropagationScreen } from './screens/Propagation.js';
import { OwnerScreen } from './screens/Owner.js';
import { SpaceSettingsScreen } from './screens/SpaceSettings.js';
import { RealtimeBannerScreen } from './screens/RealtimeBanner.js';
import { CoverageScreen } from './screens/Coverage.js';

/** Onglets du site — foyer et rituel agissent sur le foyer sélectionné. */
type Tab =
  | 'home' | 'register' | 'building' | 'foyer' | 'ritual' | 'certificate' | 'budget'
  | 'mcp' | 'rovo' | 'skill' | 'preact' | 'propagation' | 'owner' | 'settings' | 'banner' | 'coverage';

const TAB_KEYS: Record<Tab, DictKey> = {
  home: 'tabHome',
  register: 'tabRegister',
  building: 'tabBuilding',
  foyer: 'tabFoyer',
  ritual: 'tabRitual',
  certificate: 'tabCertificate',
  budget: 'tabBudget',
  mcp: 'tabMcp',
  rovo: 'tabRovo',
  skill: 'tabSkill',
  preact: 'tabPreact',
  propagation: 'tabPropagation',
  owner: 'tabOwner',
  settings: 'tabSettings',
  banner: 'tabBanner',
  coverage: 'tabCoverage',
};

const TABS: Tab[] = [
  'home', 'register', 'building', 'foyer', 'ritual', 'certificate', 'budget',
  'mcp', 'rovo', 'skill', 'preact', 'propagation', 'owner', 'settings', 'banner', 'coverage',
];

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

/** Tout ce dont le contenu d'onglet a besoin (navigation + état partagé). */
interface TabContentProps {
  tab: Tab;
  foyer: Foyer;
  setFoyerId: (id: string) => void;
  setTab: (tab: Tab) => void;
  settings: Record<string, SpaceSettings>;
  setSettings: (settings: Record<string, SpaceSettings>) => void;
}

/** Écran actif — un seul aiguillage, chaque écran reste autonome. */
function TabContent(props: TabContentProps): JSX.Element | null {
  const openFoyer = (id: string): void => {
    props.setFoyerId(id);
    props.setTab('foyer');
  };
  switch (props.tab) {
    case 'home':
      return <HomeScreen onGotoRegister={() => props.setTab('register')} onGotoBuilding={() => props.setTab('building')} />;
    case 'register':
      return <RegisterScreen onOpenFoyer={openFoyer} settings={props.settings} />;
    case 'building':
      return <BuildingScreen onOpenFoyer={openFoyer} />;
    case 'foyer':
      return <FoyerSheetScreen foyer={props.foyer} onSelectFoyer={props.setFoyerId} />;
    case 'ritual':
      return <RitualScreen foyer={props.foyer} />;
    case 'certificate':
      return <CertificateScreen />;
    case 'budget':
      return <BudgetScreen />;
    case 'mcp':
      return <McpPlaygroundScreen />;
    case 'rovo':
      return <RovoChatScreen />;
    case 'skill':
      return <SkillCheckScreen />;
    case 'preact':
      return <PreActivationScreen onOpenCertificate={() => props.setTab('certificate')} />;
    case 'propagation':
      return <PropagationScreen />;
    case 'owner':
      return <OwnerScreen />;
    case 'banner':
      return <RealtimeBannerScreen onOpenFoyer={openFoyer} />;
    case 'coverage':
      return <CoverageScreen onGotoBudget={() => props.setTab('budget')} />;
    case 'settings':
      return (
        <SpaceSettingsScreen
          settings={props.settings}
          setSettings={props.setSettings}
          onGotoRegister={() => props.setTab('register')}
        />
      );
  }
}

/** Corps de l'application : navigation + contenu de l'onglet actif. */
function Shell(): JSX.Element {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>('home');
  const [foyerId, setFoyerId] = useState<string>(FIRST_FOYER_ID);
  const [settings, setSettings] = useState<Record<string, SpaceSettings>>({ ...INITIAL_SETTINGS });

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
      <TabContent
        tab={tab}
        foyer={foyer}
        setFoyerId={setFoyerId}
        setTab={setTab}
        settings={settings}
        setSettings={setSettings}
      />
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
