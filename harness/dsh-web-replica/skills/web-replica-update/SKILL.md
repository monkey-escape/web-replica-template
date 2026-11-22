---
name: web-replica-update
description: Use when the live target site has been maintained — new features, new pages, or layout or API changes. Compare first, accept the analysis refresh, then oracle the delta. Does not recapture baselines from the fix loop, and is not a scheduled watcher.
---

# Update after the target site changes

Canonical docs: `docs/target-update.md`, `docs/playbook.md`. This is on-demand, not a cron job, and not `git fetch upstream`.

```bash
node scripts/compare-target.mjs --site <site-id>
node scripts/compare-target.mjs --site <site-id> --accept
node scripts/clone-loop.mjs --site <site-id>
```

Or `replica_compare_target` with `action=compare` (or `from-staging`), then `action=accept` only after you review the report, then `replica_clone_loop`. Never pass `--accept` or `--capture-reference` to clone-loop.

- Recapture goes to `temp/clone-loop/<site-id>/target-update/staging/`. It must not overwrite fixtures until `--accept`.
- Analyze the delta before editing `apps/web`. Identify new or changed shared components and new pages. Implement shared components first, then compose pages.
- `--accept` is the only allowed baseline / fixture refresh after a target change.
- Removed routes are listed in the report. Do not silently delete clone source.
- After accept, let clone-loop chase only the changed or failed routes. Use `status`, `next`, and `residuals`.
- Public pages only: no login, no `/requisition`, no writes to the target.
