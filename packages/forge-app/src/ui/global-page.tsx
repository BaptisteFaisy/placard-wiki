/**
 * La page globale (cahier §18.1, `confluence:globalPage`) : le bâtiment, le
 * registre, le budget/couverture et la file d'adoption, en quatre onglets.
 *
 * Le registre porte exactement la même information que le bâtiment (§10) ; les
 * deux sont navigables au clavier et conformes WCAG AA. La bascule de langue
 * (anglais par défaut, §23) est accessible depuis l'en-tête.
 *
 * Chaque onglet est un composant autonome qui charge ses propres méthodes du
 * bridge (contrat `@placard-wiki/domain`). En l'absence de réponse du backend,
 * un état vide honnête est affiché — jamais un faux zéro.
 */

import { Heading, Inline, Stack, Tab, TabList, TabPanel, Tabs, Text } from '@forge/react';
import { AdoptionPanel } from './adoption-panel.js';
import { BuildingPanel } from './building-panel.js';
import { BudgetPanel } from './budget-panel.js';
import { useI18n } from './i18n.js';
import { RegistryPanel } from './registry-panel.js';
import { LangToggle } from './widgets.js';

/** En-tête de la page : nom, promesse, bascule de langue accessible. */
function PageHeader(): JSX.Element {
  const { t } = useI18n();
  return (
    <Inline space="space.200" alignBlock="center" shouldWrap>
      <Stack space="space.025">
        <Heading size="large">{t('app.name')}</Heading>
        <Text>{t('app.tagline')}</Text>
      </Stack>
      <LangToggle />
    </Inline>
  );
}

/** La page globale : quatre onglets (registre, bâtiment, budget, adoption). */
export default function GlobalPage(): JSX.Element {
  const { t } = useI18n();
  return (
    <Stack space="space.200">
      <PageHeader />
      <Stack space="space.050">
        <Heading size="medium">{t('global.title')}</Heading>
        <Text>{t('global.subtitle')}</Text>
      </Stack>
      <Tabs id="placard-global-tabs" defaultSelected={0}>
        <TabList>
          <Tab>{t('global.tab.registry')}</Tab>
          <Tab>{t('global.tab.building')}</Tab>
          <Tab>{t('global.tab.budget')}</Tab>
          <Tab>{t('global.tab.adoption')}</Tab>
        </TabList>
        <TabPanel testId="panel-registry">
          <RegistryPanel />
        </TabPanel>
        <TabPanel testId="panel-building">
          <BuildingPanel />
        </TabPanel>
        <TabPanel testId="panel-budget">
          <BudgetPanel />
        </TabPanel>
        <TabPanel testId="panel-adoption">
          <AdoptionPanel />
        </TabPanel>
      </Tabs>
    </Stack>
  );
}
