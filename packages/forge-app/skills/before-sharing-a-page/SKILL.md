---
name: before-sharing-a-page
description: Check a text for secrets and personal data BEFORE publishing it to a Confluence page, comment, or template. Use whenever an agent is about to create or update Confluence content.
---

# Before sharing a page

You are about to write content into Confluence — a runbook, a procedure, a
comment, a template. The wiki is the most shared and least monitored place in
the company: what you publish there is read by dozens of people, copied,
duplicated, indexed by assistants, and never re-read.

## The rule

Before publishing, verify your text with the `check-text` tool of the
**Placard du wiki** MCP server. It returns fingerprints and masked previews —
never raw values — for anything that looks like a secret or personal data.

## Procedure

1. **Assemble the exact text** you are about to publish (storage format,
   including code blocks, tables and macro bodies).
2. **Call `check-text`** with that text. The text is not stored and not
   logged by the tool.
3. **If the result is empty**: publish normally.
4. **If a fingerprint appears**:
   - Do **not** publish the value. Replace it with a link to the secrets
     manager (or the team's documented retrieval procedure):
     `Retrieve from <secrets-manager> → service → key name`.
   - If the value must appear for the page to make sense (a documentation
     example), use a **known fake value** (e.g. `AKIAIOSFODNN7EXAMPLE`) and
     label it as an example.
   - If you cannot replace it yourself, **stop and report to a human**: name
     the page, the fingerprint, the masked preview and the family. Never
     paste the raw value into the report, the ticket, or the chat.
5. **After publishing**, if a real-time banner from Placard appears on the
   page, follow its `[redact]` action rather than editing the page blindly:
   editing the current version removes nothing from history.

## What you must never do

- Never publish a credential, token, connection string, private key, IBAN,
  card number, identity number, or personal data (address, phone, birth date,
  health, named salary) as a live value.
- Never copy a secret from an existing page into a new page, a template, or a
  comment "to help" — that is propagation, and Placard will date it.
- Never attest a rotation: attestation is a human fact.
- Never assume a page is private: check exposure with `get-exposure` when in
  doubt, and remember that anything readable may also be readable by the
  organization's AI assistants.
