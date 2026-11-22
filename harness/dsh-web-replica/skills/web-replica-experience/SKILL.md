---
name: web-replica-experience
description: Use before implementing a clone route and after a green parity loop. Read the trap store and lessons first, then write a lesson. The store in this repo stays the source.
---

# Experience store

Read `docs/experience/traps.md` and `docs/experience/lessons/` before changing `apps/`. Record that check in `fixtures/sites/<site-id>/traps-checked.md`.

Only traps under the heading `## Active traps` are live. Do not invent traps from memory or from a private repository.

After `node scripts/clone-loop.mjs --site <site-id>` exits 0, write the lesson with:

```bash
node scripts/clone-loop.mjs --site <site-id> --write-lesson --slug <slug>
```

The script writes `docs/experience/lessons/YYYY-MM-DD-<slug>.md` only when the loop is green and that file is absent. Append to the trap store only for a failure that will happen again.
