// Écran d'accueil : pitch + ce que l'app fait / ne fait pas (§5).

import { useLang } from '../i18n.js';

const DOES_KEYS = ['does1', 'does2', 'does3', 'does4', 'does5'] as const;
const DOES_NOT_KEYS = ['doesNot1', 'doesNot2', 'doesNot3', 'doesNot4', 'doesNot5'] as const;

interface HomeProps {
  onGotoRegister: () => void;
  onGotoBuilding: () => void;
}

/** Liste simple d'items traduits. */
function Items({ keys }: { keys: readonly string[] }): JSX.Element {
  const { t } = useLang();
  return (
    <ul>
      {keys.map((k) => (
        <li key={k}>{t(k as Parameters<typeof t>[0])}</li>
      ))}
    </ul>
  );
}

export function HomeScreen({ onGotoRegister, onGotoBuilding }: HomeProps): JSX.Element {
  const { t } = useLang();
  return (
    <section className="screen">
      <h2>{t('appTitle')}</h2>
      <p className="pitch">“{t('pitch')}”</p>
      <p>{t('pitchSub')}</p>
      <p className="muted small">{t('demoMode')}</p>
      <button className="action primary" type="button" onClick={onGotoRegister}>
        {t('tabRegister')}
      </button>{' '}
      <button className="action" type="button" onClick={onGotoBuilding}>
        {t('tabBuilding')}
      </button>
      <div className="does-not">
        <div>
          <h3>{t('doesTitle')}</h3>
          <Items keys={DOES_KEYS} />
        </div>
        <div>
          <h3>{t('doesNotTitle')}</h3>
          <Items keys={DOES_NOT_KEYS} />
        </div>
      </div>
    </section>
  );
}