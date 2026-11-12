# SOUMISSION — Codegeist 2026 (Devpost)

> **Placard for Confluence** — Atlassian Forge app (Confluence Cloud).
> Fichier de soumission : tout ce qui suit le chapeau est en anglais (langue de
> soumission) et se colle tel quel dans les champs Devpost.

## Chapeau (français) — quoi copier où

| Champ Devpost | Bloc à copier | Remarque |
|---|---|---|
| Project name | `## Project name` | Nom public de l'app. |
| Tagline | `## Tagline` | Une seule ligne. |
| Description | `## Description` | Le texte principal, le plus long. |
| How we built it | `## How we built it` | |
| Challenges we ran into | `## Challenges we ran into` | Les contraintes **mesurées** sur une vraie app Forge, pas celles imaginées. |
| Accomplishments that we're proud of | `## Accomplishments that we're proud of` | |
| What we learned | `## What we learned` | |
| What's next | `## What's next` | Rien de ce qui est annoncé ici n'est déjà livré. |
| Built with | `## Built with` | |
| Links / « Try it out » | `## Links` | **Trois** placeholders à remplacer au moment du dépôt. |

**Les chiffres sont mesurés dans l'arbre**, pas estimés : la source de chacun
est citée entre parenthèses, et le tableau `## Sources of the numbers` les
récapitule. Aucun chiffre sans source.

**Placeholders à compléter avant le dépôt** (ces informations n'existent pas
encore) : lien d'installation Marketplace, identifiants de démonstration,
vidéo de soumission.

**Aucun secret dans ce dossier** — ni réel, ni factice en clair. Le seul aperçu
qui apparaît est un aperçu masqué (`AKIA…(20)`) : famille visible, valeur
inutilisable.

---

## Project name

Placard for Confluence

## Tagline

Everyone scans their repo. Nobody scans their wiki.

## Description

**The wiki is the most shared and least monitored place in a company. Nobody scans it.**

In Confluence live, in clear: the credential tables of runbooks, the service-account password pasted "just to debug", the staging DSN, the customer export sitting as an attachment, an HR table holding a national ID number. A runbook page is read by dozens of people, copied, duplicated as a template, and never re-read.

**Placard for Confluence** is an Atlassian Forge app that does three things, in this order.

**1. It finds — across seven hiding places.** Page body, comments, attachments, **version history**, page templates, titles and labels, space description and home page. Version history is the blind spot of every other scanner: editing a page today removes nothing from yesterday, and the secret is still readable in version 3.

**2. It prices — who can read, humans and AI alike.** For each finding, the **exposure** combines potential readers (a range, never a fake precise number — and its method is always displayed), public sharing ("anyone with the link"), page restrictions, and the **AI surface**: what assistants and agents of the organisation could reach from that page. The question of 2026 is not "who can open this page?" but "what did I hand to my AI?".

**3. It repairs — in the right order.** The **ritual** has five steps with locks: **rotate** → **redact** → **purge** → **prevent** → **verify**. Rotation comes first, because a published key must be revoked before anything is edited: copies already exist, and Confluence keeps every version. Redaction is refused until the rotation has been attested **by a human** — never by the app, never by an agent. Purging version history, when the API forbids it, produces a grouped request to the site administrator and the **foyer stays open**: saying "we cannot" is part of the product.

### The vocabulary is the product

A secret is identified by its **fingerprint** (HMAC-SHA-256, key private to the installation) and shown only as a **masked preview** (`AKIA…(20)` — family visible, value unusable). One fingerprint is one **foyer**, which may carry many **locations**; each location sits in a **hiding place** and belongs to a detection **family**. Every foyer carries a **danger score** (0–100) with **every applied term displayed** (base by family, still in the current version, present in the history, reader count, public sharing, AI surface, unknown rotation, propagation — and the bonuses for test data, known fake values, archived pages), an **exposure** with its method, an **AI surface**, a **propagation** timeline (one fingerprint copied from page to page), and a row in the **register** — the table view that carries exactly the same information as the visual building. A repaired foyer ends in a **wax seal** (rotation attested by a human **and** redaction done **and** purge verified or documented as impossible); a false positive gets a **ribbon** (a written reason, a person, a review date — a ribbon is revalidated when the page changes). A **certificate** is the dated, counted summary an auditor receives: open foyers, rotated, redacted, purged, residual exposure, and **declared blind spots**.

The **building** is the same information drawn: a wing is a space, a room is a page (its size is its audience), the light under the door is the highest danger behind it, the cellar is the version history, an open cellar hatch is a secret still readable in an old version, a draught between two rooms is the same fingerprint in two places, a wax seal is a closed foyer and a ribbon a dismissed false positive. Every element of the drawing carries one datum and nothing else — no gratuitous decoration. The **register** holds the same information, sortable, filterable and keyboard-navigable (WCAG AA): the building is the only sacrificial part of the product, the register alone is enough.

### Four states, never mixed

**present** (a pattern matched) ≠ **exposed** (someone can read it) ≠ **alive** (we can never know) ≠ **revealed** (no proof of access). The app never says "this key is active": it says "rotation unknown for 412 days". It never tests a secret it found.

### What the app never does

- it never **uses** a secret it found (no outbound call to AWS, Stripe or GitHub with a value read);
- it never **stores** a raw value — not in the database, not in the logs, not in an LLM prompt, not in the MCP output, not in the certificate;
- it never **modifies** a page without a human's explicit approval, and the edit is applied in that person's name (`asUser()`), with a version comment;
- it never **claims** to have erased what it cannot erase;
- it never **rates people** — it names an owner when the audit demands it, never a ranking.

### Try it in two minutes

The public demo site runs the product's own packages on 100 % synthetic data (16 screens, bilingual EN/FR). The three screens that simulate a platform behaviour — MCP playground, Rovo chat, real-time banner — say so on screen. The Confluence demo space is seeded by script: one fake secret per family, planted in every hiding place, everything visibly marked as synthetic — the same space is the test oracle of the CI, so what you see is what the tests check.

## How we built it

A **pnpm monorepo** with eight packages and a one-way dependency chain (no cycles): `wiki-source` (readers of the seven hiding places, CQL, cursor pagination) → `detectors` (twelve families + scan pipeline) → `propagation` (one fingerprint → one foyer → N locations, dated, template first) → `exposure` (readers range, sharing, AI surface, danger score and its terms) → `ritual` (rotate → redact → purge → prevent → verify, attestations, masked diffs, purge requests, ribbons, certificate, Jira ticket). `domain` holds the shared types, the product vocabulary and the SQL schema; `forge-app` is the Forge app itself; `demo-space` is the seeded demo space and the test oracle.

**One implementation per logic.** The detection families, the explainable score, the HMAC fingerprint and the "no secret in the outputs" discipline already existed in `placard` (a Git-side engine). They are **reused without copy** through a pinned Git submodule (`vendor/placard`) — a scan pass never changes under our feet. The target form is npm packages (`@placard/detectors`, `@placard/analysis`, `@placard/core`); until a registry exists, the pinned submodule guarantees reproducibility.

**Five processing chains.** Detection at publication (content trigger → detection → Forge Realtime banner to the author, wired end to end in code — the targeted delivery and its sub-10-second latency are on the list of things only a real site can settle); incremental sweep (scheduled trigger on the single 5-minute slot the platform allows, CQL `lastModified`, resume cursor); full sweep (weekly scheduled trigger + `consumer`, sliced by space, prioritised by exposure); exposure (computed in the background, per page); ritual (driven by a person from the screens).

**The Forge app** is a Node.js 22 runtime app whose manifest is verified against the real platform, not against a doc page: `forge lint` returns **0 error**, and `forge build`, `forge deploy` and `forge install` are verified on a real site. Measured on the manifest (`node tools/validate_manifest.mjs`): **21 functions, 3 triggers, 1 consumer, 2 scheduled triggers, 4 Confluence screens** (global page, space settings, content action, custom content), **1 web trigger, 1 SQL module, 1 LLM module, 13 MCP actions**, plus `rovo:agent`, `rovo:skill` and `rovo:mcp`.

**Data.** Eleven Forge SQL tables (`finding`, `location`, `exposure`, `page_scan`, `attachment_scan`, `ritual_step`, `purge_request`, `owner_resolution`, `certificate`, `sweep_cursor`, `budget`) — and **not one column holds a raw secret value, page text or attachment**. The only persisted link to a secret is its fingerprint and its masked preview.

**Agent surface.** Thirteen MCP tools, one function each, so an agent can call them one by one: `scan-page`, `scan-space`, `list-exposed-secrets`, `get-finding`, `trace-fingerprint`, `get-exposure`, `get-certificate`, `check-text`, `record-rotation`, `request-redaction`, `apply-redaction`, `dismiss-finding`, `open-remediation-ticket`. No tool returns a raw value; no tool accepts one in input except `check-text`, whose text is neither stored nor logged. `record-rotation` **refuses an agent's attestation** — attestation is a human fact. The Rovo agent "Gardien du placard" answers exposure questions with fingerprints, locations and scores, and says "I cannot know" when the answer depends on a missing permission. The open-source skill `before-sharing-a-page` makes a coding agent check its text with `check-text` **before** publishing a page, a comment or a template.

**AI, sparingly.** The hosted LLM sees only ambiguous candidates (families 9 and 11, and cases where context decides), never a raw secret: the prompt is built from masked spans, and the answer is cached by content fingerprint.

**Teamwork Graph, read-only.** The graph is read to resolve owners; it is never written to, because its ingestion forbids personal, health, financial and HR data. We ship no connector.

**Honest coverage.** A missing permission never becomes a silent zero: the coverage screen distinguishes "no permission" from "no data", and attachments that cannot be read inside the payload budget are declared "not read, and why". A finding is visible only to people who can read the underlying page; others get space-level aggregates.

**Tests and CI.** **298 automated tests in 34 files** (`pnpm test`, worktree at commit `d6396c5`, all green) cover the domain, the readers, the detectors, the score and its terms, the propagation, the ritual locks, the SQL schema, the sweep and the guards of the Forge app. The acceptance catalogue (§25) was rewritten **from the tests that really exist**: every line cites the package, the file and the exact test name — 10 points covered by an automated test, 8 partial (they need a real installed site), 0 uncovered. CI is deliberately boring: typecheck, tests, size limits, manifest coherence, UTF-8/non-empty docs, and the CI guards testing themselves — **5 minutes maximum per job**, `fetch-depth: 1`, self-hosted runners.

## Challenges we ran into

Everything below was **measured on a real Forge app**, not read in a doc page — the whole point of the exercise was that the platform's own documentation is incomplete in places.

**1. Some modules simply do not exist.** `confluence:macro` is not in the manifest schema at all: the certificate screen had to be moved to `confluence:customContent` (`supportedContainerTypes: [page]`). And the space-settings module is `confluence:spaceSettings`, **not** `spaceSettingsPage`. The screen shape is also not the Jira pattern: a Confluence UI Kit screen is `{key, title, route?, function}` — no `render`, no `resource`, no `resolver` — and the official `confluence-global-page-ui-kit` template generates a shape the linter rejects. The manifest was rewritten against the linter's verdicts until `forge lint` returned **0 error**.

**2. OAuth scopes must be exact, and the obvious ones are invalid.** The Teamwork Graph scopes are `read:graph:page:confluence`, `read:graph:space:confluence`, `read:graph:project:atlassian`; the forms `read:graph:document`, `read:graph:project` and `read:graph:space` are **invalid**. The Confluence scopes are likewise exact (`read:confluence-content.all`, `read:attachment:confluence`, `read:space:confluence`, `read:space.permission:confluence`, `read:content.restriction:confluence`, `read:template:confluence`, `read:content:confluence`, `read:confluence-user`, `write:confluence-content`, `search:confluence`). Nothing wider was requested: no `content.styles`, no `external.images`.

**3. The Forge bundler refuses relative imports carrying the `.js` extension.** Webpack + `ts-loader` cannot resolve `./resolver.js` when the source is `./resolver.ts`. This forced a codemod of every relative import in the packages, plus an upstream change in `placard` for the four reused packages — because "one implementation per logic" also means "one way to import it".

**4. The execution budget shapes the architecture.** A standard Forge function gets **25 s** (55 s for a web trigger, an action or an agent); only a `consumer` or a scheduled trigger may run up to **900 s**. So the page panel and the register answer from the detection cache (under 2 s), and every long sweep runs in slices with a resume cursor. A platform allows **5 scheduled triggers per app, and only one at a 5-minute interval** — the incremental sweep takes that single slot, the full sweep is weekly. Payload is capped at 5 MB (500 KB from a custom UI) and outbound network at 100 requests per minute per runtime: large attachments are therefore listed and declared "not read, and why" rather than transported.

**5. Purging version history may be impossible from Forge.** Rather than hide it, we made it a product behaviour: the API call is attempted, and when it is refused — or when administrator rights are missing — the app writes the reason, produces a grouped request to the site administrator (page, version number, fingerprint — never a value), keeps the **foyer open** and keeps the exposure high. The certificate carries that declared impossibility.

**6. A missing permission looks like an empty result.** In Teamwork Graph, an unreadable object type yields data omitted **without an error**. A naive implementation would display "0 secrets here". Ours distinguishes "no permission" from "no data" in the coverage report, and the reader count is a **range** ("between 340 and 1,200 people"), because nested groups are not always resolvable — a range with its method beats a precise invented number.

**7. The vocabulary needed to become code, not a slogan.** The sentences the app must never say are listed in the shared domain package (`FORBIDDEN_ASSERTIONS`), so "this key is active" is a failing test, not a style guide. Likewise the four epistemic states are separate types: `present`, `expose`, `vivant`, `revele`.

## Accomplishments that we're proud of

- **The ritual is genuinely locked.** Redaction is refused until a human attestation exists, and an attestation filed by an agent is explicitly refused — enforced in the ritual package, re-checked by the Forge services, and forced by the MCP surface itself (`record-rotation` marks the actor as an agent). A key rotated by a machine, by mistake, by an agent, is not a rotation.
- **One fingerprint, one foyer, N locations.** The same secret pasted in six pages, two comments, an attachment and a template can become **one** foyer with ten locations, with a dated propagation timeline — and the **template is redacted first**, otherwise it keeps copying the secret into every page created afterwards.
- **Every score term is shown, including the bonuses.** No score without its terms, no exposure without its method, no "clean" without a certificate — the bonuses (test content, known fake values, archived or restricted pages) are displayed exactly like the penalties.
- **A public acceptance catalogue that follows the tests.** The §25 recipe cites, for each of the 18 points, the package, the file and the **exact test name** — replayable with `pnpm vitest run packages/<package>/<file> -t "<name>"`. Ten points are covered, eight are partial with the missing half named (it needs a real installed site), none is claimed without proof.
- **The demo space is the CI oracle.** The seeded space (one fake secret per family in each hiding place) is both what judges see and what the tests verify — no divergence between the pitch and the product.
- **A public demo site that needs no installation.** 16 screens, bilingual, 100 % synthetic data, with the screens that simulate a platform behaviour explicitly labelled as such — so a judge can understand the product in two minutes, before installing anything.
- **Honest coverage instead of a green light.** Unreadable attachments, missing rights, unreachable whiteboards and databases are declared in the coverage screen. What the app cannot do is part of the certificate, not a footnote.

## What we learned

- **The hard part of a secret scanner is not detection, it is ordering.** Everyone wants to edit the page. The correct first gesture is to revoke the key, because copies already exist and Confluence keeps every version. Our ritual exists to make that order hard to get wrong.
- **Declaring a blind spot is a feature.** "Not read, and why", "no permission", "cannot purge — admin request filed" are product behaviours that a judge can verify. A scanner that quietly reports zero is worse than no scanner.
- **An honest range beats a precise number.** Readers are reported as a range with their method, because nested groups are not always resolvable. The same discipline applied to every other number we publish.
- **The LLM is a last resort, not a detector.** Deterministic families first (mod-97, Luhn, entropy, headers), the model only on ambiguous candidates, prompts built from masked spans, answers cached by content fingerprint. It is fast, cheap and auditable.
- **Testing the vocabulary is as valuable as testing the detection.** The sentences the app may not say are part of the domain types; the "active key" temptation is a test that fails.
- **Measure the platform, do not believe the documentation.** A module that does not exist, scopes that look right and are invalid, a bundler that cannot resolve `.js` imports — each of these would have shipped as a broken assumption. Every one of them was found by running `forge lint`, `forge build`, `forge deploy` and `forge install` against the real thing.
- **The demo and the tests must share one source of truth.** Our demo space is the test oracle and our public site runs the product's own packages; the acceptance catalogue was rewritten from the tests rather than the other way round. A doc that drifts from the code is worse than no doc.

## What's next

Nothing below is shipped yet — it is the roadmap, and it stays honest about what still needs a real site.

- **Marketplace listing.** Submission for review from 16 December 2026; the installation link is not available yet.
- **The nine prototype points** that only a real site can settle: purging a precise version, reading an attachment binary (and up to which size), extracting text from PDF/DOCX/XLSX in the bundle, reading the real "anyone with the link" state, a targeted Realtime push to the author, `asUser()` write on a page the approver does not own, whiteboards and Confluence databases access, the real cost of 50,000 pages in one pass, and counting readers with nested groups. Each of them already has its documented fallback in the product, but the fallback is not the goal.
- **The eight partial acceptance points** (§25): runtime network-egress logging as an automated proof, a cross-corpus test over the thirteen MCP outputs, and the coverage/budget screens driven by a real installed site.
- **The "C" requirements of the specification**: whiteboards and Confluence databases, OCR of screenshots, cross-surface correlation with the Git engine (the same fingerprint followed across Git, Confluence, Jira tickets and JSM — one secret, every surface), and anonymised comparison between spaces.
- **The pre-activation sweep inside the app**: "what would the assistant see if we enabled it on this space?", answered before the assistant is enabled, with a certificate to prove it — today demonstrated on the public demo site.
- **A real-time flow, verified on a real site**: the targeted Realtime push to the author, measured end to end (under 10 seconds), with the documented fallback (automatic comment + notification) for the sites that refuse the targeting.
- **The contamination tree**: a dated propagation graph per fingerprint — pages, comments, attachments, templates — so that "copied four times between March and October" becomes a tree instead of a list.
- **Rotation verified without using the secret**: raise the proof from *attested by a human* to *third-party* (provider audit log, Jira trail). The app will still never test a key it finds.
- **An exposure budget**: residual exposure tracked per space over time, next to the existing sweep budget (pages scanned, attachments unread and why, LLM calls, tokens, estimated cost).
- **The video** and the final judging guide for the seeded space.

## Built with

- **Atlassian Forge** (Node.js 22 runtime) — Confluence Cloud REST API, Forge Realtime, Forge SQL (MySQL engine), Forge UI Kit (React 18), Forge hosted LLM (Claude)
- **Rovo** — `rovo:agent` (the "Gardien du placard"), `rovo:mcp` (13 tools), `rovo:skill` (`before-sharing-a-page`, open source)
- **Teamwork Graph** — GraphQL, read-only, to resolve owners
- **TypeScript**, pnpm monorepo (8 packages), Vitest, webpack + ts-loader (the Forge bundler), Vite (public demo site), React 18
- **GitHub Actions** (CI, 5-minute budget per job, guard self-tests), **Mergify** (merge queue), **Git submodules** (`vendor/placard`, pinned)
- **GitHub Pages** — the public demo site
- **MIT licence**

## Links

- **Repository:** https://github.com/BaptisteFaisy/placard-wiki
- **Live demo — no installation needed:** https://baptistefaisy.github.io/placard-wiki/ *(static, 100 % synthetic data, 16 screens, bilingual EN/FR)*
- **App installed on a real Confluence Cloud site** (our own demo instance, deployed v2.0.0 and installed on 12 November 2026): <https://one-atlas-cndz.atlassian.net/wiki/apps/dc47d23f-e4cd-4681-bb64-14ac02ea1c98/187530d6-48dd-414c-8215-ee19afe04033/placard> — with the seeded demo space <https://one-atlas-cndz.atlassian.net/wiki/spaces/PLACARDDEMO> (one fake secret per family in every hiding place, everything marked as synthetic; read access granted to judges on request)
- **Marketplace installation link:** ⟨placeholder — the public Marketplace listing URL, provided by **Baptiste Faisy** in the Devpost submission once the listing goes out (submission for review from 16 December 2026). It does not exist yet and must never be invented; until then, the links above are enough to judge the product.⟩
- **Demo credentials:** ⟨placeholder — the Confluence Cloud account that grants read access to the demo instance and to the `PLACARDDEMO` space, provided by **Baptiste Faisy** in the private field of the Devpost submission. It does not exist yet and must never be invented.⟩
- **Submission video:** ⟨placeholder — recorded from the script in `docs/VIDEO.md` (4:45, English, minute by minute); the URL is added to Devpost once the file is published. It does not exist yet and must never be announced in advance.⟩
- **Judges' guide (in the repo):** `docs/JUGES.md` — a 10-minute tour of the seeded space, the MCP tools and the Rovo agent
- **Acceptance catalogue (in the repo):** `docs/RECETTE-25.md` — the 18 points, each one citing the package, the file and the exact test name
- **Technical documentation (in the repo):** `docs/ARCHITECTURE.md`, `docs/VALIDATION-22.md`, `docs/CAHIER-DES-CHARGES.md`

---

## Sources of the numbers

Every figure quoted above was measured in the repository, not estimated.

| Figure | Where it comes from |
|---|---|
| 298 tests, 34 test files | `pnpm test` (worktree at commit `d6396c5`) — all green |
| 21 functions, 3 triggers, 1 consumer, 2 scheduled triggers, 4 Confluence screens, 1 web trigger, 1 SQL module, 1 LLM module, 13 MCP actions, `rovo:agent`/`rovo:skill`/`rovo:mcp` | `node tools/validate_manifest.mjs` — manifest coherence with the real exports |
| 13 MCP tools | `packages/forge-app/src/mcp.ts` (13 exported tool functions) and the `rovo:mcp` block of `packages/forge-app/manifest.yml` |
| Twelve detection families (eleven identifiers — bank data covers both IBAN and card) | `packages/domain/src/vocabulary.ts` (`FAMILY_LABELS`) |
| Seven hiding places | `packages/domain/src/vocabulary.ts` (`GITES`) |
| Eleven SQL tables, no raw-value column | `packages/domain/src/sql.ts` |
| Eight packages | `packages/` (domain, wiki-source, detectors, exposure, propagation, ritual, forge-app, demo-space) |
| 16 screens of the public demo, three of them explicit simulations | `site/src/App.tsx`, `site/src/screens/` (Rovo chat, MCP playground, real-time banner) |
| Building and register in the app | `packages/forge-app/src/ui/building-panel.tsx`, `packages/forge-app/src/ui/global-page.tsx`, bridge method `building/get` (`packages/domain/src/bridge.ts`) |
| `forge lint` 0 error, build / deploy / install verified on a real site, `confluence:macro` absent, `confluence:spaceSettings` (not `spaceSettingsPage`), exact scopes including `read:graph:page:confluence`, the `.js` import rule | `docs/VALIDATION-22.md` (measurements of 12 November 2026, forge CLI 15.1.0) |
| 10 covered / 8 partial / 0 uncovered acceptance points | `docs/RECETTE-25.md` |
| 25 s standard function, 900 s for a consumer or scheduled trigger, 5 scheduled triggers with a single 5-minute slot, 5 MB payload, 100 outbound requests per minute | `docs/VALIDATION-22.md` and `docs/ARCHITECTURE.md` (platform limits) |
| Mergify queue, `couche0` scope guard, 5-minute CI budget | `.mergify.yml`, `.github/couche0/`, `.github/workflows/` |
| Demo site answers HTTP 200 | checked against the live URL at submission time |
