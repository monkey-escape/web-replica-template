---
name: web-replica-experience
description: Use before implementing a clone route and after a green parity loop. Read the trap store and lessons first, then write a lesson. The store in this repo stays the source.
---

# Experience store

Canonical docs: `docs/experience/traps.md`, `docs/experience/lessons/`, `docs/playbook.md`.

Before changing `apps/`, read the trap store and lessons, and record that check in `fixtures/sites/<site-id>/traps-checked.md`. Only traps under `## Active traps` are live. Do not invent traps from memory or a private repository.

After `node scripts/clone-loop.mjs --site <site-id>` (or `replica_clone_loop`) exits 0 (`ready_for_review`), write the lesson with:

```bash
node scripts/clone-loop.mjs --site <site-id> --write-lesson --slug <slug>
```

The script writes `docs/experience/lessons/YYYY-MM-DD-<slug>.md` only when the loop is green and that file is absent. Append to the trap store only for a failure that will happen again.

The public template does not run the clone. After the lesson is edited so it is reusable and has no business data, promote it from this implementation repo:

```bash
node scripts/promote-experience.mjs
node scripts/promote-experience.mjs --pr
```

`--pr` opens a pull request against the template `upstream` with only new lessons and new traps. Do not push fixtures, baselines, apps, or API data.
