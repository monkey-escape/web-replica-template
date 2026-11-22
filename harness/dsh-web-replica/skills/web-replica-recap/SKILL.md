---
name: web-replica-recap
description: Use at the end of a clone day. Writes the daily recap from complete loop logs and the day's commits, and cleans only marked rotten files.
---

# Daily recap

Run:

```bash
node scripts/recap-daily.mjs
```

It writes `docs/recap/YYYY-MM-DD.md` from complete loop logs and the day's commits. Read `docs/recap/README.md` before changing that behavior.

Cleanup is separate:

```bash
node scripts/recap-daily.mjs --apply-clean
```

That deletes files marked rotten and the gitignored `temp/` directory. Do not delete unrelated work.
