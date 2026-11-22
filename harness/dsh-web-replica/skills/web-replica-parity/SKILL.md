---
name: web-replica-parity
description: Use to measure a clone. Runs the parity loop and stops only when strict routes are 1:1. Does not raise visual thresholds or recapture baselines to hide a miss.
---

# Measure parity

Run:

```bash
node scripts/clone-loop.mjs --site <site-id>
```

Read `docs/playbook.md` and `docs/adapt.md` for what a pass means. This skill does not replace them.

- Exit 0 means the recorded gates passed. The next round fixes only failed routes.
- Reports land in `temp/clone-loop/`. Do not commit `temp/`.
- Keep a strict route strict. Do not add `accepted` diffs, do not raise `strictMaxDiffRatio`, and do not pass `--capture-reference` or `--update-baseline` from the fix loop.
- A reference capture during analysis is not a passing measurement. The playbook names the capture command.
