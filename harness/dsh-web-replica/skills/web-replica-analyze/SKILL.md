---
name: web-replica-analyze
description: Use before editing apps/web or apps/api on a website clone. Records screenshots, structure, components, interactions, and tokens for one site id. The playbook remains the method.
---

# Analyze the target site

Read `docs/playbook.md` and `AGENTS.md` before writing pages. Do not edit `apps/web` or `apps/api` until the analysis files for this site exist.

1. Pick a kebab-case `<site-id>`.
2. Write the analysis under `fixtures/sites/<site-id>/`, including the trap check the playbook requires.
3. Record screenshots, structure, components, interactions, and tokens from the target. Do not copy credentials or another repository's private pages into this repo.
4. Mark each route strict or adapt using `docs/adapt.md`. A strict route cannot accept a visual diff.

`fixtures/sites/example/` is the template skeleton, not a third-party site.
