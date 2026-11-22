---
name: web-replica-maintain
description: Use while implementing or when the oracle reports a maintainability failure. Enforces human-maintainable source: sectioned files, shared tokens, /media and /api/mock URLs, no generated soup. A 99% screenshot is not enough.
---

# Human-maintainable output

Canonical docs: `docs/playbook.md`, `docs/media.md`, `docs/api-mocks.md`. The loop already runs these checks; do not argue with a maintainability failure.

- Split pages and styles by section. Do not dump a site into one giant HTML or CSS file.
- Reuse tokens from `fixtures/sites/<site-id>/analysis/tokens.json` and shared layout. Do not paste unexplained magic copies.
- Runtime images, fonts, and video use `/media/<site-id>/<key>` only. Public data APIs use `/api/mock/<site-id>/<key>` (or an explicit `apiMocks: "none"`). Never hotlink the target site or its API.
- Identifiers are English. Comments are Chinese only when they explain a non-obvious why. Project Markdown is Chinese. Keep `AGENTS.md` short; put decisions in `.agents/notes/`.
- If `report.next.kind` is `maintainability`, fix that before chasing more pixels.

See `.agents/notes/proposed/2026-11-22-oracle-loop-and-maintainability.md`.
