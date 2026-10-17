# TEAM WORKSPACE PROGRESS — chronological log

## 2026-10-17 — Phase 0 kickoff (ATLAS)

1. Verified environment: Hermes v0.22.2, buzz-hive v1.3 at
   `~/.hermes/desktop-plugins/buzz-hive/` (git repo, HEAD 929548d, clean tree).
2. Baseline tests: `node test.cjs` in plugin repo → **193/193 PASS**. No regressions.
3. Backup created:
   - `~/Developer/hive-team-studio/backups/buzz-hive-pre-team-studio-20261017-215320.tar.gz`
   - `~/Developer/hive-team-studio/backups/buzz-hive-bundle-20261017-215320.bundle`
4. Isolated worktree created: `~/Developer/hive-team-studio/worktree`, branch `team-studio`.
   Live plugin folder untouched from here on.
5. SDK reference loaded (`hermes-agent` skill → references/desktop-plugins.md):
   confirmed import surface is `@hermes/plugin-sdk` + react only; panes/pages via
   `ctx.register`; gateway RPC via `host.request`/`host.onEvent`; persistence via
   `ctx.storage`; no terminal embedding needed (native `terminal` pane exists).
6. Tracking docs created (this file, PLAN, TESTS, ARCHITECTURE).
7. Next: ARCH completes deep audit → architecture matrix (TEAM_WORKSPACE_ARCHITECTURE.md).

### Known issues / notes
- `git tag` is empty; the "v1-restore-point" mentioned in plugin.js comments is
  commit `c71f7fb` ("restore point before inter-agent comms overhaul").
- No package.json — plugin is a single plain-ESM plugin.js loaded uncompiled (jsx() calls).
- Sandbox repo needs `git init` + harmless content before Phase 2/5 tests.

## 2026-10-17 — Phase 0 audit complete (ARCH)

1. Read the full plugin (worktree/plugin.js, 2613 lines): component tree, state
   atoms, member-session lifecycle, model selection, swarm relay, marker
   protocol, persistence, unload cleanup — all documented with file:line in
   TEAM_WORKSPACE_ARCHITECTURE.md §1.
2. Inspected installed integrations in Hermes v0.22.2 source + plugins:
   kanban (no RPC/HTTP surface — UNSUPPORTED direct), projects (full RPC
   family + projects.changed event), approvals (approval.pending/received/
   respond RPCs; push owned by app), git worktrees (kanban workspace_kind
   mechanism), hermes-workflows v1.3.6 (REST /api/plugins/hermes-workflows/*,
   desktop /workflows page, ::workflow directive), hermes-teammates v0.1.2
   (agent tools only, kanban lane pattern).
3. Completed the capability matrix with VERIFIED / PLAUSIBLE-NEEDS-TEST /
   UNSUPPORTED labels and evidence (ARCHITECTURE.md §3), the verified SDK call
   list (§4), canonical sources of truth (§5), and top risks (§6).
4. Findings filed: F1 session reattach calls non-existent `session.info` RPC
   (plugin.js:1631; event-only at tui_gateway/contracts/events.py:393) —
   hydrated members return sessionless; F2/F3 `tool.error`/`assistant.completed`
   subscriptions are dead on the desktop gateway (guarded, harmless).
5. Acceptance checks: matrix filled, SDK call list written, code untouched
   (only this file + ARCHITECTURE.md changed).
6. Next: Phase 1 UI/UX design spec (board task t_1e021903) reads
   ARCHITECTURE.md §3-§4 as its constraint set.

## 2026-10-17 — Phase 1 design spec complete (ARCH)

1. Wrote `TEAM_WORKSPACE_DESIGN.md`: all 10 required sections — three-column
   layout w/ media-query narrow fallbacks, Team panel with derived (never
   stored) member status, conversation timeline with normative event→card
   mapping table, right-panel tabs (Tasks/Activity/Files/Approvals/Workflow),
   toolbar, link-only bottom dock, theme-var visual design, state model with
   delta batching + unload cleanup, component tree, and a 13-item acceptance
   checklist (A1-A13) plus 6 spike gates (S1-S6).
2. Constraint discipline: every dependency is VERIFIED per ARCHITECTURE.md §4;
   PLAUSIBLE-NEEDS-TEST items (projects.*, approval.*, workflows REST via
   bridge, clipboard, SDK var list) are spike-gated with documented degraded
   states, never invented APIs. Spot-re-verified audit citations against
   plugin.js (atoms, hive.v2, marker fns, HIVE_MAX_HOPS, CORE slice markers,
   ROUTES_AREA, onDispose, work-item state machine statuses open/submitted/
   passed/failed at plugin.js:561-626).
3. Honest gaps recorded in the spec: native kanban board UI (UNSUPPORTED
   direct — agent-relay only), live approval push (app-owned), pause/resume
   (no RPC), embedded terminal/git view (native panes own), per-project
   history (Phase 2 namespacing).
4. Tests untouched and still green: `node test.cjs` → 193/193 PASS (docs-only
   change). Live plugin folder untouched.
5. Next: FORGE implements per spec (board task t_a7898aa3); SENTRY verifies
   against A1-A13.
