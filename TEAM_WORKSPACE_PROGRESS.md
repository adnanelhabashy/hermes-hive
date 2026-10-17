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
