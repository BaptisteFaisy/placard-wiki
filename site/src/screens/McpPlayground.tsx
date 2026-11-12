// Playground MCP (§17) — les 13 outils de `rovo:mcp`, exécutés SIMULÉS sur
// le jeu de démo. Les réponses sont affichées en JSON exact. Les refus, les
// verrous et les diffs viennent du vrai code des paquets ; les lectures sont
// assemblées depuis les données de démo. Jamais de valeur brute (§17, PW-04).

import { useRef, useState } from 'react';
import { MCP_TOOLS, MCP_TOOL_BY_KEY } from '../data/mcp.js';
import type { McpToolSpec } from '../data/mcp.js';
import { useLang } from '../i18n.js';
import { newSession, runTool } from '../lib/mcp-run.js';
import type { ActorKind, JsonValue, McpSession } from '../lib/mcp-run.js';

/** Valeurs d'entrée de démonstration pour un outil. */
function initialArgs(tool: McpToolSpec): Record<string, string> {
  return Object.fromEntries(tool.inputs.map((input) => [input.name, input.demo]));
}

/** Liste des 13 outils : boutons, verbe visible, aria-pressed. */
function ToolList({ selected, onSelect }: { selected: string; onSelect: (t: McpToolSpec) => void }): JSX.Element {
  const { t } = useLang();
  return (
    <div className="mcp-tools" role="group" aria-label={t('mcpToolList')}>
      {MCP_TOOLS.map((tool) => (
        <button
          key={tool.key}
          type="button"
          aria-pressed={selected === tool.key}
          onClick={() => onSelect(tool)}
        >
          <span className={`verb verb-${tool.verb}`}>{tool.verb}</span>
          {tool.key}
        </button>
      ))}
    </div>
  );
}

/** Champ de saisie d'un outil : select si options, textarea pour un texte. */
function InputField({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options?: readonly string[];
  onChange: (name: string, value: string) => void;
}): JSX.Element {
  if (options) {
    return (
      <label>
        {name}
        <select value={value} onChange={(e) => onChange(name, e.target.value)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (name === 'text') {
    return (
      <label>
        {name}
        <textarea rows={4} value={value} onChange={(e) => onChange(name, e.target.value)} />
      </label>
    );
  }
  return (
    <label>
      {name}
      <input type="text" value={value} onChange={(e) => onChange(name, e.target.value)} />
    </label>
  );
}

/** Bascule personne/agent — l'auteur de l'appel (record-rotation refuse agent). */
function ActorToggle({ actorKind, onActor }: { actorKind: ActorKind; onActor: (kind: ActorKind) => void }): JSX.Element {
  const { t } = useLang();
  return (
    <fieldset>
      <legend>{t('mcpActorKind')}</legend>
      <label>
        <input type="radio" name="mcp-actor" checked={actorKind === 'human'} onChange={() => onActor('human')} />{' '}
        {t('actorHuman')}
      </label>{' '}
      <label>
        <input type="radio" name="mcp-actor" checked={actorKind === 'agent'} onChange={() => onActor('agent')} />{' '}
        {t('actorAgent')}
      </label>
    </fieldset>
  );
}

/** Formulaire de l'outil sélectionné + bascule personne/agent. */
function ToolForm({
  spec,
  args,
  actorKind,
  running,
  onArgs,
  onActor,
  onRun,
}: {
  spec: McpToolSpec;
  args: Record<string, string>;
  actorKind: ActorKind;
  running: boolean;
  onArgs: (name: string, value: string) => void;
  onActor: (kind: ActorKind) => void;
  onRun: () => void;
}): JSX.Element {
  const { t, pick } = useLang();
  return (
    <div className="mcp-form">
      <h3>{spec.key}</h3>
      <p className="small muted">
        <strong>{t('mcpReturns')}</strong> — {pick(spec.returns)}
      </p>
      {spec.note && <p className="tool-note">{pick(spec.note)}</p>}
      <p className="small muted">{t('mcpDemoData')}</p>
      {spec.inputs.map((input) => (
        <InputField
          key={input.name}
          name={input.name}
          value={args[input.name] ?? ''}
          {...(input.options ? { options: input.options } : {})}
          onChange={onArgs}
        />
      ))}
      <ActorToggle actorKind={actorKind} onActor={onActor} />
      <button className="action" type="button" onClick={onRun} disabled={running}>
        {running ? '…' : t('mcpRun')}
      </button>
    </div>
  );
}

/** Réponse JSON affichée (aria-live : la lecture à voix haute suit l'appel). */
function ResponsePanel({ response }: { response: JsonValue | null }): JSX.Element {
  const { t } = useLang();
  return (
    <section aria-live="polite">
      <h3>{t('mcpResponse')}</h3>
      {response === null ? (
        <p className="muted">{t('mcpAwait')}</p>
      ) : (
        <pre className="json-out">{JSON.stringify(response, null, 2)}</pre>
      )}
    </section>
  );
}

export function McpPlaygroundScreen(): JSX.Element {
  const { t } = useLang();
  const [selected, setSelected] = useState<string>(MCP_TOOLS[0]!.key);
  const [args, setArgs] = useState<Record<string, string>>(() => initialArgs(MCP_TOOLS[0]!));
  const [actorKind, setActorKind] = useState<ActorKind>('human');
  const [response, setResponse] = useState<JsonValue | null>(null);
  const [running, setRunning] = useState(false);
  const sessionRef = useRef<McpSession>(newSession());

  const select = (tool: McpToolSpec): void => {
    setSelected(tool.key);
    setArgs(initialArgs(tool));
    setResponse(null);
  };

  const run = async (): Promise<void> => {
    setRunning(true);
    const out = await runTool(selected, args, actorKind, sessionRef.current);
    setResponse(out);
    setRunning(false);
  };

  const spec = MCP_TOOL_BY_KEY.get(selected) ?? MCP_TOOLS[0]!;

  return (
    <section className="screen">
      <h2>{t('mcpTitle')}</h2>
      <p className="small muted">{t('mcpIntro')}</p>
      <p className="small muted">{t('mcpSessionNote')}</p>
      <div className="mcp-layout">
        <ToolList selected={selected} onSelect={select} />
        <div>
          <ToolForm
            spec={spec}
            args={args}
            actorKind={actorKind}
            running={running}
            onArgs={(name, value) => setArgs((a) => ({ ...a, [name]: value }))}
            onActor={setActorKind}
            onRun={() => void run()}
          />
          <ResponsePanel response={response} />
        </div>
      </div>
    </section>
  );
}
