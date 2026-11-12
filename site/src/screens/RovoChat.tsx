// Agent Rovo « Gardien du placard » (§17) — chat SIMULÉ : les réponses sont
// générées localement depuis les données de démo (data/rovo.ts), aucun réseau,
// aucun appel LLM. Discipline de vocabulaire : empreintes, fourchettes,
// « je ne peux pas le savoir » quand un droit manque (cas inclus, Q2).

import { useState } from 'react';
import { ROVO_QUESTIONS, rovoAnswer, rovoFallback } from '../data/rovo.js';
import { useLang } from '../i18n.js';
import { usePlacardData } from '../data/placard-data.js';

/** Un message du chat : rôle + texte (les sauts de ligne sont affichés). */
interface ChatMessage {
  id: number;
  role: 'user' | 'agent';
  text: string;
}

/** Bulle de chat : rôle annoncé, texte préformaté (pre-line). */
function Bubble({ message }: { message: ChatMessage }): JSX.Element {
  const { t } = useLang();
  const who = message.role === 'user' ? t('rovoYou') : t('rovoAgentName');
  return (
    <li className={`bubble bubble-${message.role}`}>
      <strong className="bubble-role">{who}</strong>
      <p className="bubble-text">{message.text}</p>
    </li>
  );
}

/** Les cinq questions du §17, cliquables (conversation starters). */
function Starters({ onAsk }: { onAsk: (id: number) => void }): JSX.Element {
  const { t, lang } = useLang();
  return (
    <nav aria-label={t('rovoStarters')} className="starters">
      {ROVO_QUESTIONS.map((question, index) => (
        <button key={question.id} type="button" className="starter" onClick={() => onAsk(index)}>
          {question[lang]}
        </button>
      ))}
    </nav>
  );
}

/** Fil de la conversation — vide au départ, annoncé aux lecteurs d'écran. */
function ChatLog({ messages }: { messages: readonly ChatMessage[] }): JSX.Element {
  const { t } = useLang();
  return (
    <>
      <ul className="chat" aria-live="polite" aria-label={t('rovoAgentName')}>
        {messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
      </ul>
      {messages.length === 0 && <p className="muted">{t('rovoStarters')}</p>}
    </>
  );
}

/** Zone de saisie libre : la simulation reste dans le cadre du §17. */
function ChatComposer(props: {
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  onReset: () => void;
}): JSX.Element {
  const { t } = useLang();
  return (
    <form
      className="chat-input"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSend();
      }}
    >
      <label className="visually-hidden" htmlFor="rovo-draft">
        {t('rovoPlaceholder')}
      </label>
      <input
        id="rovo-draft"
        type="text"
        value={props.draft}
        placeholder={t('rovoPlaceholder')}
        onChange={(e) => props.onDraft(e.target.value)}
      />
      <button className="action" type="submit">
        {t('rovoSend')}
      </button>
      <button className="action" type="button" onClick={props.onReset}>
        {t('resetBtn')}
      </button>
    </form>
  );
}

export function RovoChatScreen(): JSX.Element {
  const { t, lang } = useLang();
  const { dataset } = usePlacardData();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');

  const push = (question: string, answer: string): void => {
    setMessages((prev) => [
      ...prev,
      { id: prev.length * 2, role: 'user', text: question },
      { id: prev.length * 2 + 1, role: 'agent', text: answer },
    ]);
  };

  const askStarter = (index: number): void => {
    const question = ROVO_QUESTIONS[index];
    if (!question) return;
    push(question[lang], rovoAnswer(question.id, lang, dataset));
  };

  const askFree = (): void => {
    const text = draft.trim();
    if (text === '') return;
    push(text, rovoFallback(lang));
    setDraft('');
  };

  return (
    <section className="screen">
      <h2>{t('rovoTitle')}</h2>
      <p className="small muted">{t('rovoIntro')}</p>
      <Starters onAsk={askStarter} />
      <ChatLog messages={messages} />
      <ChatComposer draft={draft} onDraft={setDraft} onSend={askFree} onReset={() => setMessages([])} />
    </section>
  );
}
