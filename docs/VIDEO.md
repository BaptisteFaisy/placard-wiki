# Video script — Placard for Confluence

> Source: specification [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md) §26.
> Under 5 minutes, in English. Screen recording on the seeded demo space
> (§15/§27), plus one sweep on a real populated site at the end (§27).
> All secrets shown on screen are synthetic fake values — never a real one.
> Every shot is listed below with the screen it comes from and its status:
> nothing is filmed that the product does not do.

| Time | Content |
|---|---|
| 0:00 – 0:25 | **"Everyone scans their repo. Nobody scans their wiki."** An ordinary runbook page, a credentials table, readers counted as a range (never a precise number). The problem in one shot. |
| 0:25 – 0:55 | **The sweep.** The building view: wings, glows under doors, open cellar hatches. Raw patterns become a sorted, explained register — hierarchy first, no wall of noise. |
| 0:55 – 1:30 | **A finding sheet.** Every applied score term is displayed (§8), the exposure comes with its method (reader range, sharing state), and the AI surface is stated as a conservative hypothesis. |
| 1:30 – 2:05 | **The trap.** The page gets fixed… and the secret is still readable in an old version. *"Editing the page removes nothing."* Confluence keeps every version — the blind spot of every other scanner. |
| 2:05 – 2:40 | **The ritual, in order.** Rotation attested **by a human** (the app never tests a key) → redaction proposed as a masked diff → applied `asUser()` in the approver's name → purge request to the site admin when the API cannot purge, the finding stays **open**. |
| 2:40 – 3:05 | **Propagation.** One fingerprint, several locations — page, comment, historical version, and the **template, redacted first**, otherwise it keeps copying the secret into new pages. |
| 3:05 – 3:25 | **The real-time banner.** An author publishes a page containing a key pattern; the warning reaches the author **while they are still on the page**, under 10 seconds — before anything is copied or indexed. |
| 3:25 – 3:50 | **Rovo agent & MCP.** In Rovo Chat: *"What would the assistant see if we enabled it on the Support space?"* The agent answers with fingerprints, locations and scores — never a value. A `scan-page` / `trace-fingerprint` call from an MCP client. |
| 3:50 – 4:15 | **The certificate.** Dated, numbered, for the auditor: open findings, rotated, redacted, purged, residual exposure, **declared blind spots**. No "clean" without proof. |
| 4:15 – 4:45 | **Architecture.** Confluence + Forge Realtime + Forge SQL, hosted LLM on ambiguous candidates only (content-fingerprint cache), Teamwork Graph **read-only** to resolve owners. One fingerprint, every surface. |

## Shot sources and status

Checked against the repository on 12 November 2026 — every shot below is a
screen or a document that exists today.

| Time | Recorded on | Status |
|---|---|---|
| 0:00 – 0:25 | public demo site — Home, then the Register tab (or the seeded page in the installed app) | real screens; the figures on screen are the demo fixture's own numbers |
| 0:25 – 0:55 | public demo site — Building and Register | real screens (the building is PW-25, the only sacrificable part of the product — the register carries the same information) |
| 0:55 – 1:30 | public demo site — Foyer sheet | real screen: every applied term with its method and evidence, exposure with its method, AI surface as a hypothesis |
| 1:30 – 2:05 | public demo site — Foyer sheet, locations panel | real: the seeded finding is still readable in an old version, with the "present in the history" term applied to the score |
| 2:05 – 2:40 | public demo site — Ritual (local demo, no backend) | real code path — locks, masked diff, purge request; the effective `asUser()` attribution on a live site is still to be validated ([validation #7](VALIDATION-22.md)) |
| 2:40 – 3:05 | public demo site — Propagation | real screen; the fingerprint shown is the seeded one (page, comment, old version, template) and the **template is first**. If the §24 case (six pages + one template) is seeded before recording, film that one; otherwise the numbers on screen are the fixture's, never a narration |
| 3:05 – 3:25 | public demo site — Banner | the site shows the banner as an **explicitly labelled simulation**; a targeted Realtime push on a real site is still to be validated ([validation #5](VALIDATION-22.md)) — if it passes before recording, film the real push instead |
| 3:25 – 3:50 | public demo site — Rovo chat and MCP playground | the site's chat and tool runner are labelled **simulations**; the real `rovo:agent`, `rovo:mcp` (13 tools) and `rovo:skill` modules are declared in the manifest and pass `forge lint` |
| 3:50 – 4:15 | public demo site — Certificate | real screen: dated, hashed, with the declared blind spots |
| 4:15 – 4:45 | motion graphics from [`ARCHITECTURE.md`](ARCHITECTURE.md) §4 | the five processing chains and the "one fingerprint, every surface" flow |
| final sweep (§27) | the app installed on a real Confluence Cloud site | depends on the week-1 prototype points ([validation #1…#9](VALIDATION-22.md)). If they are not settled when the video is recorded, sweep the seeded demo space instead **and say so on screen** — a declared limit beats an unverified claim |

## Production notes

- Total runtime target: **4:45** — under the 5-minute limit, no padding.
- Voice-over and on-screen text in **English** (submission language, §23); the
  UI itself is bilingual EN/FR.
- Demo space seeded by script (`packages/demo-space`): one fake secret per
  family, planted in every hiding place — page, comment, attachment, historical
  version, template, title, publicly shared page. Everything visibly marked as
  synthetic; the same space is the test oracle of the CI.
- The final architecture shot doubles as the honesty statement: what the app
  cannot do (purge history when the API forbids it, read whiteboards if they
  are unreachable) is **declared on screen**, not hidden.
- Captions throughout (accessibility, WCAG AA discipline of the product).
- The submission text this video illustrates is
  [`SOUMISSION.md`](SOUMISSION.md); the judges' walkthrough is
  [`JUGES.md`](JUGES.md).
