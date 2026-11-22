---
name: web-replica-analyze
description: Use before editing apps/web or apps/api on a website clone. Records screenshots at 1440 and 390, structure, sections, styles, tokens, public assets, shared vs page-specific components, and an API-mock decision. The repo playbook remains the method.
---

# Analyze the target site

Canonical docs: `docs/playbook.md`, `docs/oracle.md`, `docs/api-mocks.md`, `docs/media.md`, `AGENTS.md`. Do not invent a second method.

Do not edit `apps/web` or `apps/api` until analysis files exist and `node scripts/check-gates.mjs --site <site-id>` (or `replica_check_gates`) passes.

1. Pick a kebab-case `<site-id>` and write analysis under `fixtures/sites/<site-id>/`, including the trap check.
2. In `analysis/components.md`, identify shared/common components (header, footer, nav, repeated cards) vs page-specific ones, and record the routes each shared component appears on. If there are none, write `shared-components: none`. Do not start route pages until that is done.
3. Capture public pages at desktop 1440 and mobile 390. Record structure and `sections.json`. Run `node scripts/capture-sections.mjs --site <site-id> --from-target` (or `replica_capture_sections` with `source=target`). Viewport-specific hints: `targetSelectors`, `viewports`, `absentViewports`; child typography: `styleProbes`. `--route` merges. `--from-clone` must not overwrite target style fixtures.
4. Download public media and rewrite runtime URLs to `/media/<site-id>/<key>`. Do not hotlink the target site.
5. Decide API mocks: `node scripts/capture-api.mjs --site <site-id>` (or `replica_capture_api`) for public JSON the pages already trigger, rewritten to `/api/mock/<site-id>/<key>`; or record `apiMocks: "none"`. Do not invent endpoints.
6. Mark each route strict or adapt using `docs/adapt.md`. Implementation order after this skill: shared components first, then compose pages.

Public pages only. An age-gate may be dismissed. Do not log in, do not navigate to `/api/` or `/requisition`, and do not write to the target. `fixtures/sites/example/` is the template skeleton, not a third-party site.

If the live target later changes, use `web-replica-update` / `docs/target-update.md`. Do not recapture baselines from clone-loop.
