# Video script — Placard for Confluence

> Source: specification [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md) §26.
> Under 5 minutes, in English. Screen recording on the seeded demo space
> (§15/§27), plus one sweep on a real populated site at the end (§27).
> All secrets shown on screen are synthetic fake values — never a real one.

| Time | Content |
|---|---|
| 0:00 – 0:25 | **"Everyone scans their repo. Nobody scans their wiki."** An ordinary runbook page, a credentials table, 1,200 potential readers. The problem in one shot. |
| 0:25 – 0:55 | **The sweep.** The building view: wings, glows under doors, open cellar hatches. 400 raw patterns become a sorted, explained register — hierarchy first, no wall of noise. |
| 0:55 – 1:30 | **A finding card.** Every applied score term is displayed (§8), the exposure comes with its method (reader range, sharing state), and the AI surface is stated as a conservative hypothesis. |
| 1:30 – 2:05 | **The trap.** The page gets fixed… and the secret is still readable in version 3. *"Editing the page removes nothing."* Confluence keeps every version — the blind spot of every other scanner. |
| 2:05 – 2:40 | **The ritual, in order.** Rotation attested **by a human** (the app never tests a key) → redaction proposed as a masked diff → applied `asUser()` in the approver's name → purge request to the site admin when the API cannot purge, finding stays **open**. |
| 2:40 – 3:05 | **Propagation.** One fingerprint, seven locations: six pages, two comments, an attachment, a template. The template is redacted **first** — otherwise it keeps copying the secret into new pages. |
| 3:05 – 3:25 | **The real-time banner.** An author publishes a page containing a key pattern; Forge Realtime pushes the warning **while they are still on the page**, under 10 seconds — before anything is copied or indexed. |
| 3:25 – 3:50 | **Rovo agent & MCP.** In Rovo Chat: *"What would the assistant see if we enabled it on the Support space?"* The agent answers with fingerprints, locations and scores — never a value. A quick `scan-page` / `trace-fingerprint` call from an MCP client. |
| 3:50 – 4:15 | **The certificate.** Dated, numbered, for the auditor: open findings, rotated, redacted, purged, residual exposure, **declared blind spots**. No "clean" without proof. |
| 4:15 – 4:45 | **Architecture.** Confluence + Forge Realtime + Forge SQL, hosted LLM on ambiguous candidates only (content-fingerprint cache), Teamwork Graph **read-only** to resolve owners. One fingerprint, every surface. |

## Production notes

- Total runtime target: **4:45** — under the 5-minute limit, no padding.
- Voice-over and on-screen text in **English** (submission language, §23); the
  UI itself is bilingual EN/FR.
- Demo space seeded by script (`packages/demo-space`): one fake secret per
  family, planted in every hiding place — page, comment, attachment, historical
  version, template, title, publicly shared page. Everything visibly marked as
  synthetic.
- The final architecture shot doubles as the honesty statement: what the app
  cannot do (purge history when the API forbids it, read whiteboards if they are
  unreachable) is **declared on screen**, not hidden.
- Captions throughout (accessibility, WCAG AA discipline of the product).
