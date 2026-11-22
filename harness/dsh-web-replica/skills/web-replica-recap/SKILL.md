---
name: web-replica-recap
description: Use at the end of a clone day. Writes the daily recap from complete loop logs and the day's commits, and cleans only marked rotten files.
---

# Daily recap

Canonical docs: `docs/recap/README.md`, `docs/playbook.md`.

```bash
node scripts/recap-daily.mjs
```

It writes `docs/recap/YYYY-MM-DD.md` from complete loop logs and the day's commits.

Cleanup is separate:

```bash
node scripts/recap-daily.mjs --apply-clean
```

That deletes files marked rotten and the gitignored `temp/` directory. Do not delete unrelated work.
