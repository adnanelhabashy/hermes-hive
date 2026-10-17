# TEAM WORKSPACE PLAN — Hive Team Studio

Transform Buzz-Hive (Hermes desktop plugin) into an AionUI-inspired, project-first
multi-agent development workspace. Full requirements live in the original project
brief; this file is the executable roadmap.

## Hard rules (non-negotiable)

1. Never edit the live plugin at `~/.hermes/desktop-plugins/buzz-hive/` directly.
   All work happens in the git worktree `~/Developer/hive-team-studio/worktree`
   on branch `team-studio`, merged to the live folder only after human approval.
2. One phase at a time; a phase's acceptance criteria must pass before the next starts.
3. Existing marker grammar is preserved: `[to @agent]`, `[ask @agent]`, `[task @agent]`,
   `[done #id]`, `[review @agent #id]`, `[verdict #id pass|fail]`, `[scratchpad:Section]`.
4. No invented SDK methods, endpoints, or tool names. Verify against the installed
   Hermes v0.22.2 source (`~/.hermes/hermes-agent`) and the desktop-plugin SDK docs.
5. No fake functionality: unavailable actions are disabled with an explanation.
6. Backups before changes; atomic patches; never force-reset local changes.
7. Human approval gates: merges to live plugin, destructive ops, deployment.

## Baseline (2026-10-17, Phase 0 start)

- Plugin: buzz-hive v1.3, HEAD `929548d`, working tree clean, restore commit `c71c7fb`.
- Tests: `node test.cjs` → **193/193 PASS** (run in worktree to re-verify before each merge).
- Backup: `~/Developer/hive-team-studio/backups/buzz-hive-pre-team-studio-20261017-215320.tar.gz`
  + git bundle `buzz-hive-bundle-20261017-215320.bundle`.
- Hermes v0.22.2 (2026.9.24). Profiles present: `arch`, `forge`, `sentry`.
- Installed: hermes-workflows (desktop + agent halves), hermes-teammates (agent),
  omh, kanban boards dir at `~/.hermes/kanban/boards`.
- Sandbox `~/Developer/hermes-sandbox/` exists, empty.

## Phase roadmap

| # | Phase | Owner | Status |
|---|-------|-------|--------|
| 0 | Technical audit + architecture matrix | ARCH | RUNNING |
| 1 | Three-column UI rebuild (Team / Conversation / Tasks) | ARCH design → FORGE build → SENTRY verify | WORKING (build + unit/smoke tests done `d6d3a7a`→`49e4fdf`; in-app A1-A13 pending SENTRY) |
| 2 | Real project workspaces (isolation, working dir) | FORGE → SENTRY | NOT STARTED |
| 3 | ATLAS delegation protocol (real sessions, ≤2 concurrent) | FORGE → SENTRY | NOT STARTED |
| 4 | Native Kanban adapter (durable task truth) | FORGE → SENTRY | NOT STARTED |
| 5 | Git worktrees for concurrent coding | FORGE → SENTRY | NOT STARTED |
| 6 | Review & approval system | FORGE → SENTRY | NOT STARTED |
| 7 | Live agent monitoring | FORGE → SENTRY | NOT STARTED |
| 8 | Workflows integration (reuse v1.3.6, no engine rewrite) | FORGE → SENTRY | NOT STARTED |
| 9 | Performance & UX (no constant redraws, keybinds) | FORGE → SENTRY | NOT STARTED |
| 10 | Final acceptance test (20-step journey) | SENTRY | NOT STARTED |

Status values: NOT STARTED / RUNNING / WORKING / PARTIAL / BLOCKED / DONE.

## Source-of-truth decisions

- Hermes owns execution and sessions.
- Native Kanban owns durable coding tasks (adapter, not a second engine).
- Hive owns team conversation and room presentation.
- Hermes Workflows owns workflow execution (link/embed, never re-implement).
- Project identity: stable (gateway, profile, project path), never display name alone.
