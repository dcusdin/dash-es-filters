---
name: client-sync
description: Roll out this shared feature module (e.g. dash-es-filters) to every client plugin folder on this machine. Use when the user asks to "roll out", "push", "sync", or "deploy" changes from a dash-feature-modules plugin (dash-es-filters, dash-search, dash-bookmarks, dash-data-selectors, ...) out to client copies.
---

# Rollout: shared feature module → client plugin folders

Copies the current state of a `dash-feature-modules/<module>` plugin (source
of truth, its own git repo) out to every client's copy of that same module.

Client dev roots differ machine to machine, and client folder layout isn't
consistent (some nest the module under `feature-modules/`, some don't) — so
**never hardcode absolute paths**. Always rediscover both the workspace root
and each client's copy by search, every run.

## Args

`args` is an optional module name, e.g. `dash-search`. Default to the module
this skill is invoked from (the git repo containing the `.claude/skills/`
folder this file lives in — normally `dash-es-filters`).

## Steps

1. **Resolve the source directory** — the `dash-feature-modules/<module>`
   folder itself (its git root — run `git rev-parse --show-toplevel` from
   there to confirm, since this must be a real repo, not a stray copy).

2. **Find client folders by searching known dev roots — not by walking up
   from the source, and not by crawling all of `$HOME`.** Client checkouts
   are NOT necessarily under a shared ancestor of the source repo — they can
   sit in a totally unrelated top-level tree on the same machine. Walking up
   from the source can miss them; crawling the whole home directory picks up
   noise (stray duplicate checkouts, leftover git worktrees under folders
   like `Claude Code Worktrees/`, etc.).

   Instead, search a short list of known per-machine dev roots, in order,
   and use the first one that exists:
   ```
   ~/Development
   ~/Websites
   ```
   (This list is machine-specific — on Darren's main desktop it's
   `~/Websites`; on his laptop it's `~/Development`, which is the better-
   organised one. If neither exists, or the one that exists turns up zero
   matches, ask the user for the right dev root rather than falling back to
   a blind `$HOME` crawl.)

   Within the chosen root:
   ```
   find <dev root> -maxdepth 5 -type d -name 'dash-*-plugin-corp-reporting' \
     -not -path '*/node_modules/*' -not -path '*/vendor/*' \
     -not -path '*Worktrees*' 2>/dev/null
   ```
   Exclude the literal template placeholder folder
   `dash-[client]-plugin-corp-reporting` from the results (that's the
   scaffold, not a real client) — match on the folder's own basename only,
   never on the full path. Real clients can be nested *inside* it (e.g.
   `dash-[client]-plugin-corp-reporting/dash-creams-corporate-plugin-corp-reporting`),
   so a path-substring filter like `grep -v 'dash-\[client\]'` wrongly drops
   them. Always exclude any match under a path
   containing "Worktrees" — those are temporary git worktrees from past
   sessions, not real client checkouts.

3. **The result of step 2 is your candidate client folder list** — no
   separate "workspace root" concept needed. Don't stop to resolve duplicate
   client names yet — a duplicate only matters if the module you're actually
   syncing exists in more than one of them. Move straight to step 4 for
   every candidate.

4. **Locate the module inside each candidate folder** — for each one,
   ```
   find <client folder> -type d -name '<module>' -not -path '*/node_modules/*' -not -path '*/vendor/*'
   ```
   Layout varies (root-level, under `feature-modules/`, etc.) — take whatever
   matches. Zero matches means that client doesn't have this module: drop it
   from the sync list entirely — don't mention it to the user and don't ask
   about it, since a client folder with no copy of this module isn't a real
   ambiguity to resolve, it's just not a target. (Don't create the module
   there either, unless the user separately asks to add it somewhere new.)

   *Now* check for duplicates, restricted to folders that actually matched:
   if the same client name produced more than one folder that both contain
   this module, stop and ask the user which is canonical rather than
   guessing or syncing to both. If only one of the duplicate-named folders
   contains the module, there's no ambiguity — use that one and move on
   without asking.

5. **Diff before touching anything** — for each target found, run
   `diff -rq --exclude=.git --exclude=.DS_Store --exclude=.claude <source> <target>` and
   summarize what would change (files added/removed/modified). Also check
   whether the target lives inside a git repo of its own
   (`git -C <client folder> rev-parse --show-toplevel`) with uncommitted
   changes touching that module path — if so, flag it explicitly; per the
   standing git-safety rules, never overwrite uncommitted local work without
   the user seeing it first.

6. **Show the user a summary table** — client name, target path, and status
   (in sync / N files differ / not present / has uncommitted local changes)
   — before syncing anything.

7. **Confirm, then sync** — only after the user confirms, apply per target:
   ```
   rsync -a --delete --exclude='.git' --exclude='.DS_Store' --exclude='.claude' <source>/ <target>/
   ```
   `.claude/` (this skill, etc.) is source-repo tooling only — client
   copies don't carry it.
   Skip (or ask individually about) any target flagged with uncommitted local
   changes in step 5 rather than blowing them away.

8. **Report results** — which targets were updated, which were skipped and
   why, and remind the user these are working-tree changes only — they still
   need reviewing/committing in each client's own repo.
