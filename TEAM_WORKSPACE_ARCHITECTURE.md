# TEAM WORKSPACE ARCHITECTURE

Status: DRAFT — Phase 0 audit in progress (ARCH owns completion of this file).

## Verified environment facts (2026-10-17)

- Hermes Agent v0.22.2 (2026.9.24), git install at ~/.hermes/hermes-agent.
- Desktop plugin contract (from installed SDK reference + plugin.js header comments):
  - Import surface: `@hermes/plugin-sdk`, `react`, `react/jsx-runtime` ONLY.
  - `ctx.register({id, area, render, data})` — areas include `panes` (placement
    left/right/bottom/main, dock support), `ROUTES_AREA` (full pages), `SIDEBAR_NAV_AREA`,
    `PALETTE_AREA`, `KEYBINDS_AREAS`, `statusBar.*`, `TRANSCRIPT_DIRECTIVE_AREA`.
  - `host.request(method, params)` — gateway JSON-RPC; `host.onEvent(type, fn)` — live events.
  - `ctx.storage.get/set/remove` — plugin-namespaced persistence.
  - `useQuery/useMutation/queryClient` — app's React Query client (no hand-rolled polls).
  - Native panes available for docking: `workspace`, `sessions`, `terminal`, `files`,
    `review`, `logs` — reuse instead of embedding new terminal.
  - Theme vars only (`var(--ui-*)`); NO hardcoded colors; NO external libs.
- buzz-hive v1.3 already uses: per-profile member sessions via
  `host.request('session.create', {profile,...})`, `prompt.submit`,
  `session.interrupt`, message/thinking/tool events, `/api/profiles`,
  `host.navigate('/'+sessionId)`, per-member colors, timeline persistence,
  agent-to-agent swarm toggle, ⌘K palette.

## Architecture matrix (to be completed in Phase 0)

| Capability | Current implementation | Integration API | Feasibility |
|---|---|---|---|
| Project selection | TBD | TBD | TBD |
| Agent sessions | buzz-hive member sessions | `host.request('session.create')` etc. | Verified in v1.3 |
| Agent messaging | marker grammar relay | existing plugin relay + events | Verified in v1.3 |
| Kanban | TBD (inspect installed) | TBD | TBD |
| Git worktrees | TBD | TBD | TBD |
| Approvals | TBD | TBD | TBD |
| Workflow graph | hermes-workflows v1.3.6 installed | TBD (inspect its API) | TBD |

## Canonical sources of truth (proposal — confirm in audit)

- Execution/sessions → Hermes gateway (state.db).
- Durable coding tasks → native Kanban (if safe mutation API exists; else read-only link).
- Team conversation/rooms → Hive plugin storage (namespaced per project).
- Workflow runs → hermes-workflows plugin.
- Project identity → project path + gateway + profile (path canonicalized, verified on host).
