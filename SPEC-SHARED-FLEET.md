# Shared Fleet Base — Spec & Implementation

**Status:** Implemented (2026-08-07)
**Principle:** *Share skills into the hive by reference — never by copy. Copies are the context killer.*

## The problem

Hive members (each a Hermes profile) need the fleet's universal skills without
duplicating them. Duplicating a skill across N profiles means N copies of the
same bodies drifting apart, and N× the always-on index tokens — which the
research (Anthropic context engineering, Vercel multi-agent) shows degrades
tool-selection accuracy and inflates context.

## The design: three layers

| Layer | What | Shared? | Where |
|---|---|---|---|
| **1. Fleet base** | ~23 universal skills every member may need | ✅ by reference | `~/.hermes/fleet/` |
| **2. Per-role specialty** | each profile's own skills (outreach, code-review, …) | 🔲 per-profile | `~/.hermes/profiles/<name>/skills/` |
| **3. Hive working memory** | digest + scratchpad, injected every turn | ✅ dynamic | the hive plugin |

## How "by reference, not by copy" is achieved

Hermes scans skills with `skills_dir.rglob("SKILL.md")` (gateway `run.py`).
Python's `rglob` does **not** descend into symlinked *directories*. So the fleet
is built as:

- **real directories** (so `rglob` descends), and
- **file-level symlinks** to the canonical skill files (so the bytes live in
  exactly one place — the canonical `~/.hermes/skills/<path>`).

Result: 23 fleet skills, 180 symlinks, 0 copies of content, 0 broken links.

## The curated fleet (23 universal skills)

`pdf, pdf-generator, docx, xlsx, code-review, finding-unknowns, to-prd, to-issues,
document-to-action-items, diagnose, triage, domain-intel, agentmail,
email-best-practices, stripe, react-email, resend, server-infrastructure,
github-pr-workflow, skill-mechanic, hermes-agent, webhook-subscriptions, trello`

Rationale: universal, horizontal value across any role. Role-specific skills
(research, closer outreach, front-end) stay in their owning profile — they're
routed-to by the hive, never duplicated.

## Wiring

`~/.hermes/config.yaml` → `skills.external_dirs`:

```yaml
skills:
  external_dirs:
    - ~/.hermes/fleet
```

`get_external_skills_dirs()` (agent/skill_utils.py) expands `~`, validates the
dir exists, dedupes against the local `~/.hermes/skills/`, and feeds it to every
profile's skill scan. Because the fleet is a set of file-symlinks, skill loads
resolve to the canonical bytes — one source of truth.

> Note: `hermes config set skills.external_dirs '[...]'` writes a JSON *string*,
> which `get_external_skills_dirs` treats as a single bad path. It was applied
> as proper YAML via a surgical edit (backup:
> `~/.hermes/config.yaml.bak-fleet-<ts>`).

## Why this stays light

- Only the skill **name + description** enters each turn's index (~23 entries,
  ~1.2k tokens) — not the bodies.
- Bodies load **on demand** via `skill_view`, so a full fleet costs the same
  per-turn as a few skills.
- The index is small enough to avoid the >10–15 catalog selection-degradation
  cliff (Anthropic / Vercel).

## Rebuild script (reproducible)

```bash
python3 - << 'EOF'
import pathlib, os, shutil
src = pathlib.Path.home()/".hermes/skills"; fleet = pathlib.Path.home()/".hermes/fleet"
curated = [("pdf","productivity/pdf"),("pdf-generator","productivity/pdf-generator"),("docx","productivity/docx"),("xlsx","productivity/xlsx"),("code-review","software-development/code-review"),("finding-unknowns","planning/finding-unknowns"),("to-prd","planning/to-prd"),("to-issues","planning/to-issues"),("document-to-action-items","productivity/document-to-action-items"),("diagnose","quality/diagnose"),("triage","quality/triage"),("domain-intel","research/domain-intel"),("agentmail","email/agentmail"),("email-best-practices","email-best-practices"),("stripe","ecommerce/stripe"),("react-email","react-email"),("resend","resend"),("server-infrastructure","devops/server-infrastructure"),("github-pr-workflow","github/github-pr-workflow"),("skill-mechanic","skill-mechanic"),("hermes-agent","autonomous-ai-agents/hermes-agent"),("webhook-subscriptions","devops/webhook-subscriptions"),("trello","productivity/trello")]
if fleet.exists(): shutil.rmtree(fleet)
fleet.mkdir()
for name, rel in curated:
    canon = src/rel; dest = fleet/name; dest.mkdir()
    for dirpath, dirnames, filenames in os.walk(canon):
        dp = pathlib.Path(dirpath); rel_dir = dest / dp.relative_to(canon)
        for d in dirnames: (rel_dir/d).mkdir(parents=True, exist_ok=True)
        for f in filenames:
            link = rel_dir/f
            if not link.exists(): link.symlink_to(dp/f)
print("fleet rebuilt:", len(list(fleet.rglob('SKILL.md'))), "skills")
EOF
```

## Rollback

- Remove the fleet dir: `rm -rf ~/.hermes/fleet`
- Restore config: `cp ~/.hermes/config.yaml.bak-fleet-<ts> ~/.hermes/config.yaml`