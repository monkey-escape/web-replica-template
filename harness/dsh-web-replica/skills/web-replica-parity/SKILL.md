---
name: web-replica-parity
description: Use to measure a clone. Runs the oracle loop and treats the script report as the only completion signal. Does not self-certify, raise thresholds, or recapture baselines to hide a miss.
---

# Measure with the oracle

Canonical docs: `docs/oracle.md`, `docs/playbook.md`. You may not declare the clone done yourself.

```bash
node scripts/clone-loop.mjs --site <site-id>
```

Or call `replica_clone_loop`. That tool (and this loop) refuse `--capture-reference`, `--update-baseline`, and `--accept`.

- The report in `temp/clone-loop/<site-id>/report.json` is authoritative. Read `brief`, `status`, `stage`, and `next`. The full `residuals` stay in that file; do not load them all into context.
- Stages are progressive and meant for the agent: shared-component skeleton, page composition, box/computed style, visual residual, then interactive. Repair only `next`. If `stage` is earlier than visual, do not tune pixels. Do not rework passing routes.
- Exit 0 / `ready_for_review` is the only passing completion. Exit 4 / `--conclude` is an honest stop with residuals, not a pass. If `stuck` is true, stop and run `node scripts/recap-daily.mjs`; do not retry the same next.
- A high pixel score with unmaintainable source is a fail. Pixel diffs are later evidence; strict visual residuals still block `ready_for_review`.
- Keep a strict route strict. Do not add `accepted` diffs and do not raise `strictMaxDiffRatio`.
- Do not commit `temp/`.
