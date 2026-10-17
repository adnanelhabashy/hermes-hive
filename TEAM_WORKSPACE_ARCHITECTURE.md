# TEAM WORKSPACE ARCHITECTURE

Status: COMPLETE — Phase 0 audit finished 2026-10-17 (ARCH). Every claim below
carries file:line evidence from the worktree `plugin.js` or the installed
Hermes v0.22.2 source (`~/.hermes/hermes-agent`). Labels: **VERIFIED** (read in
installed source; runtime-proven where noted), **PLAUSIBLE-NEEDS-TEST**
(registered/mounted but not yet smoke-tested from a plugin context),
**UNSUPPORTED** (no surface exists in v0.22.2).

## 1. Buzz-Hive v1.3 audit (worktree/plugin.js, 2613 lines)

### 1.1 React component tree

- `HivePage` (2452) — full page at ROUTES_AREA `/hive` (registered 2529-2533).
  - Header (2465-2482): title badge + rename, busy count, Scratchpad toggle,
    `HiveAddMember` (2300) → `HiveRenderOptions` (2285) / `HiveCreateForm` (2245);
    `HiveResetButton` (2201, inline confirm popover); `HiveRoomMenu` (2226, swarm toggle).
  - Roster strip (2483-2496): pinned `you` chip + `HiveRosterChip` (1719) per member
    → dropdown with `HiveContextModeControl` (1700), `HiveModelSubmenu` (1651),
    open-session / stop / SOUL / mute / browser / fresh-context / remove actions.
  - Body switch (2498-2508): `HiveSoulEditor` (2415) | `HiveScratchEditor` (2364,
    embeds `HiveWorkBoard` 2346) | timeline view.
  - Timeline view: `HiveTimelineModeToggle` (2050) → `HiveTimelineBody` (2070) →
    `HiveGroupedTimeline` (1985, per-agent `HiveAgentGroup` 1916) or flat
    `HiveTimeline` (2025); rows are `HiveTurnRow` (1829, live activity spine) or
    `HiveMemberTone` (1792, prose message); `HiveComposer` (2083) with @-mention
    autocomplete and grammar hint chips (2077-2081).
- Light markdown: `hiveRenderText` (977) + `hiveInline` (959) — fenced code, bold,
  inline code only; no raw HTML.
- Follow-scroll with pause-on-user-scroll: `hiveUseFollowScroll` (1952).

### 1.2 State atoms and persistence

Atoms (95-133): `$hiveMembers`, `$hiveTimeline`, `$hiveTitle`, `$hiveCwd`,
`$hiveComposer`, `$hiveMentionOpen`, `$hiveSwarm`, `$hiveScratch`, `$hiveMission`,
`$hiveTasks`, `$hiveView`, `$hiveTimelineMode`, `$hiveAgentExpanded`,
`$hiveGroupSeen`, `$hiveModelCatalog`. Non-atom module state: `_hiveProcessed`
completion dedup (131), `_hiveSeeded` brief-ack suppression (133), `_hiveHops`
per-session relay depth (1028), `_hiveModelCatalogAt` TTL cache (123-124).

Persistence: `hivePersist` (1572) writes one `ctx.storage` key `hive.v2`
(74; legacy `hive.v1` read at 1600) — title, cwd, swarm, scratch, mission, tasks,
timelineMode, agentExpanded, members (profile/storedId/browser/muted/contextMode/
model triple), timeline sliced to last 120 (1593). `hiveBootHydrate` (1597)
restores on load; empty store mints a fresh `@default` member (1602).

**Finding F1 (bug, verified):** hydration reattach calls
`host.request('session.info', { session_id: storedId })` (1631). `session.info`
is an EVENT, not an RPC — it exists only in the event contract
(`tui_gateway/contracts/events.py:393`, emitted from
`tui_gateway/methods_config_set.py:37`); no `@method("session.info")` is
registered anywhere in `tui_gateway/` (grep over the full method registry
returns nothing). The call therefore always throws, the `catch` at 1633-1635
nulls `sessionId`, and every hydrated member comes back sessionless until the
user manually picks "Fresh context". Fix path for a later phase: resolve
stored→live ids via `session.list` (`methods_session.py:540`) or
`session.resume`. Not fixed here (Phase 0 is read-only on code).

### 1.3 Member-session lifecycle

- Mint: `hiveMintMember` (1381) — cap 10 (73, 1383), dedup by profile (1388),
  `host.request('session.create', { cols: 96, source: 'desktop', profile, cwd? })`
  (1391-1393), first member auto-gets browser role (1397-1399), room brief
  seeded as a system delivery (1401-1402), roster change broadcast to existing
  crew via `hiveAnnounceRoster` (1365, called 1406), join noted on timeline (1403).
- Interrupt/stop: `hiveStopMember` (1530) → `session.interrupt` (1534), folds the
  open turn honestly (1536).
- Fresh context: `hiveFreshContext` (1446) — drop + re-mint (new session).
- Remove: `hiveRemoveMember` (1415) — browser role re-assign (1419-1421),
  orphaned open work items surfaced in the roster announcement (1426-1433).
- Reset: `hiveResetRoom` (1544) — interrupts all, clears dedup/seed/hop maps,
  clears timeline/members/tasks, mints fresh `@default` (1563). Scratchpad kept.
- Event wiring (2547-2606): `message.start`→open turn; `message.delta`→append;
  `thinking.delta`/`reasoning.delta`→thinking; `tool.start`/`tool.complete`→tool
  spine; `tool.error` and `error` guarded try/catch (2582-2596);
  `message.complete`→fold + relay (2597-2605); `assistant.completed` fallback (2606).
  All events subscribed exist in the v0.22.2 contract
  (`tui_gateway/contracts/events.py`: message.start :132, message.delta :145,
  reasoning.delta :146, thinking.delta :148, message.complete :232, tool.start
  :299, tool.complete :318, error :117) EXCEPT:
  - **F2:** `tool.error` is not in the event contract — harmless no-op by design
    (the try/catch at 2582 exists precisely for this).
  - **F3:** `assistant.completed` is not a gateway event in v0.22.2 (absent from
    contracts/events.py); per the header (17) it is an api_server-surface
    fallback, so on the desktop gateway this subscription never fires. The real
    completion path is `message.complete` (2597).
- Cleanup on unload: `ctx.onDispose` (2608-2611) disposes every event
  subscription and registration collected in `disposers` (2526+). No timers,
  no polling loops — nothing leaks.

### 1.4 Model selection

- Live catalog: `hiveFetchModelCatalog` (1483) → `host.request('model.options',
  { explicit_only: true })` (1489), 60s TTL cache (124). RPC is registered at
  `tui_gateway/methods_complete.py:357` — the same payload the built-in picker
  uses (verified).
- Assignment: `hiveSetMemberModel` (1458) → POST `/api/model/set` via the desktop
  bridge (1462-1463; route at `hermes_cli/web_routers/models.py:376`),
  profile-scoped body from `hiveModelAssignmentBody` (719), then a fresh member
  session so the model actually takes effect (1474).
- Curated manifest `HIVE_WORKING_MODELS` (690-701) merged with the live catalog,
  dedup by provider::model (757), grouped by provider (774).

### 1.5 Swarm relay + marker protocol

- Turn completion: `hiveHandleAssistantDone` (1116) — strict session-id routing
  (`hiveMemberBySession` 1019, never profile-matched; regression note 677-682),
  1500ms completion dedup (1121-1123), seeded-brief ack suppression (1127-1131).
- Marker grammar (pure core, sliced by test.cjs between CORE-BEGIN 138 /
  CORE-END 941): coordination `[to @x] [ask @x] [@x] [all]`
  (`hiveParseCoordination` 282); work items `[task @x] [done #id]
  [review @x #id] [verdict #id pass|fail]` (`hiveParseWorkItems` 518,
  `hiveApplyWorkItems` 561 — owner/reviewer/status state machine, fail routes
  back to owner, 612-626); scratchpad `[scratchpad] [scratchpad:Sec]
  [scratchpad:Sec!]` append/section/replace (`hiveParseScratchOps` 435,
  `hiveScratchApply` 486); markers scrubbed before timeline render
  (`hiveScrubMarkers` 539).
- Routing policy in ONE seam: `hivePlanDeliveries` (641) — self-drop,
  not-in-room, muted, swarm-off, hop budget (HIVE_MAX_HOPS=3, 147),
  fan-out cap (HIVE_MAX_FANOUT=6, 148); suppressions surfaced as system
  timeline rows, never silent (`hiveRunPlan` 1079-1083).
- Delivery: `hiveDeliverTo` (1030) builds the context envelope
  (`hiveBuildContextEnvelope` 242 — standing header 184, room digest 322,
  per-member open work items 219, scratchpad clipped head-first 174) and calls
  `host.request('prompt.submit', { session_id, text, queued? })` (1058-1062).
  The `queued` param is real: `tui_gateway/methods_prompt.py:824`
  (`queued=bool(params.get("queued"))`). Busy members get an honest "queued"
  chip (1054-1056).
- Context modes: standard | minimal (164-169); minimal ships handoff capsule
  (`hiveBuildHandoffCapsule` 197) without the digest.
- User posts go through the same seam (`HiveComposer.send` 2095-2124 →
  `hiveRouteUserPost` 401), so the user is bound by the same routing rules.

## 2. Integration API surface (installed Hermes v0.22.2 + plugins)

### Kanban — UNSUPPORTED from a desktop plugin (direct), verified indirect paths

- No RPC: the full `@method("…")` registry in `tui_gateway/` (141 methods —
  enumerated 2026-10-17) contains NO `kanban.*` method.
- No HTTP: `hermes_cli/web_routers/` contains no kanban router (only a comment
  mention at `web_routers/profiles.py:1042`).
- Boards on disk: `~/.hermes/kanban/boards/<board>/kanban.db` (team, sandbox,
  atlas-test, test present). `tasks` schema (read-only inspected, team board):
  id/title/body/assignee/status/priority/workspace_kind/workspace_path/
  branch_name/project_id/claim_lock/claim_expires/… — `project_id` links a task
  to a first-class Project with a deterministic branch (schema comment).
- Agent-side access is real: `tools/kanban_tools.py` (the kanban_* tool family
  this very session uses), dispatcher `hermes_cli/kanban_db_dispatch.py`,
  watchers `gateway/kanban_watchers*.py`, worktree lifecycle
  `hermes_cli/kanban_db_workspace.py`. A Python plugin can import
  `hermes_cli.kanban_db` directly — hermes-teammates does exactly that
  (`~/.hermes/plugins/hermes-teammates/teammates_host.py:18-26`).
- Consequence for Team Studio: the UI cannot bind to kanban directly.
  Workable paths, in order of preference:
  1. Drive kanban THROUGH a member agent: `prompt.submit` an instruction, the
     agent's own kanban_* tools do the work, results return via the existing
     event stream. No new surface needed. (VERIFIED mechanism — it is how this
     task itself is running.)
  2. Read-only board mirror via a tiny Python companion plugin with a
     `dashboard/plugin_api.py` exposing board reads under
     `/api/plugins/<id>/` (mount mechanism verified below). PLAUSIBLE-NEEDS-TEST.
- Project↔board link exists at the data layer: `projects.board_slug`
  (`hermes_cli/projects_db.py:36,168,247-250`; `projects.create` accepts
  `board_slug`, `tui_gateway/methods_projects.py:95`).

### Projects — VERIFIED

RPCs (all registered, app sidebar uses them):
`projects.list` / `projects.get` / `projects.create` / `projects.archive` /
`projects.delete` / `projects.set_active` / `projects.for_cwd`
(`tui_gateway/methods_projects.py:81-130`), `projects.update` /
`projects.add_folder` / `projects.remove_folder` / `projects.set_primary`
(60-78), `projects.tree` (`tui_gateway/methods_config.py:138`; also
`projects.record_repos`, `projects.project_sessions` listed in
`tui_gateway/server.py:191`). Change event: `projects.changed`
(`tui_gateway/contracts/events.py:756`). `projects.for_cwd` returns
{project, cwd, branch} (123-130). Project identity = id/slug + folders +
board_slug + primary_path — matches PLAN.md's source-of-truth decision.
Smoke-test from a plugin context still pending → VERIFIED (registration +
app usage), runtime-from-plugin PLAUSIBLE-NEEDS-TEST.

### Agent sessions & messaging — VERIFIED (runtime-proven by v1.3)

- `session.create` (`tui_gateway/methods_session.py:484`) — accepts `profile`
  (334), `cols` (419), `source` (432), `cwd`; returns
  `{ session_id, stored_session_id, … }` (476). Used live at plugin.js:1393.
- `prompt.submit` (`tui_gateway/methods_prompt.py:735`) — `session_id`, `text`,
  `queued` (824). Used live at plugin.js:1058.
- `session.interrupt` — used live at plugin.js:1534.
- Resume/listing for reattach: `session.list` (methods_session.py:540),
  `session.resume`, `session.active_list`, `session.events.since` (2327 —
  replay after `last_seen`, carries open server→client requests).
- Events (§1.3) all verified against contracts/events.py.

### Approvals — VERIFIED (poll + respond); live push not available to plugins

- RPCs: `approval.pending` (`tui_gateway/methods_prompt.py:1238`),
  `approval.received` (1247), `approval.respond` (1258, with durable-identity
  fallback 1423-1449). All session-scoped.
- Push model: approvals are server→client REQUESTS (`server.py:818`
  `_emit_approval_request` → `server_requests.send_async("approval", …)`),
  answered by the session's attached client (the app), redacted payload
  (764-780). A plugin is not that client, so it cannot own the modal.
  `approval.cancelled` is a plain event (`contracts/events.py:442`).
- Team Studio path: per-member pending-approval rows via `approval.pending`
  polls (React Query, few-second interval) + respond via `approval.respond`.
  Choices are server-computed (once/session/always/deny, server.py:767-773).

### Git worktrees — VERIFIED mechanism, UNSUPPORTED direct desktop call

- Kanban task workspaces: `workspace_kind: scratch|dir|worktree`
  (`hermes_cli/kanban_db_workspace.py:1,567`); worktree materialization via
  `git worktree add` (690-716), post-completion cleanup with containment
  guards (429-487); project-linked tasks anchor the worktree under the
  project's primary repo with a deterministic branch (tasks schema comment;
  dispatch params in `tools/kanban_tools.py:1105-1137`).
- CLI: `hermes -w` / `--worktree` (`hermes_cli/_parser.py:188`), `/worktree`
  slash command (`hermes_cli/commands.py:110`).
- No RPC/HTTP route creates a worktree on demand → the desktop plugin reaches
  worktrees only by creating kanban tasks (which itself needs the §Kanban
  workaround) or by instructing a member agent.

### hermes-workflows v1.3.6 — VERIFIED (read + gate), agent-owned writes

- Python half: tool `workflow` + hook `transform_llm_output`
  (`~/.hermes/plugins/hermes-workflows/plugin.yaml`); enabled in
  `~/.hermes/config.yaml` plugins.enabled (line 75).
- REST (FastAPI router in `dashboard/plugin_api.py`): `GET /runs` (230),
  `GET /runs/{run_id}` (234), `GET /runs/{run_id}/nodes/{nid}/log` (239),
  `POST /runs/{run_id}/gate` (253 — release a human gate).
- Mount: plugin API routers serve under `/api/plugins/<name>/`
  (`hermes_cli/web_server_dashboard.py:852,1043`; hot-mount fallback 943-971).
- Desktop half: `/workflows` ROUTES_AREA page (desktop/plugin.js:2531), a pane
  (2540), `::workflow{id}` transcript directive (2525-2527), composer session
  strip (2561). Cross-linking = `host.navigate('/workflows')` — VERIFIED
  mechanism (host.navigate used live at plugin.js:1770).
- Cross-plugin REST from Team Studio: `ctx.rest` is scoped to the CALLING
  plugin's id, so buzz-hive cannot use it for hermes-workflows. The desktop
  bridge `window.hermesDesktop.api({ path, method, body })` forwards ARBITRARY
  paths to the backend (`electron-preload.js` `api:` → `hermes:api` IPC →
  `handleHermesApiRequest` → `fetchJsonForBackend(connection,
  apiRoute.requestPath, …)` in `electron-main.mjs` — no path allowlist
  observed). buzz-hive already calls `/api/profiles` and `/api/model/set`
  through it (plugin.js:1302, 1463), so `GET /api/plugins/hermes-workflows/runs`
  is expected to work — PLAUSIBLE-NEEDS-TEST (no live call made in Phase 0).
- Workflow CREATION stays with the agent's `workflow` tool — drive it via
  prompt.submit instructions; never re-implement the engine (PLAN.md rule).

### hermes-teammates v0.1.2 — VERIFIED agent-side only

- Tools: `teammates_roster`, `teammate_assign`, `teammate_check`,
  `teammate_message`, `teammate_stop` (plugin.yaml `provides_tools`; registered
  in `__init__.py:20-23`). Slash command `/teammates` (`__init__.py:30`).
- No desktop half, no `dashboard/` → no REST, nothing for a UI to bind to.
- Kanban lane integration (agent-side): `teammate_assign` can claim a kanban
  card from a configured lane (`teammates_service.py:164-182`), guarded by
  `host.kanban_available` (`teammates_host.py:18-26`).
- Role overlap with Team Studio: teammates = fire-and-forget subagents in the
  AGENT loop; Hive members = long-lived per-profile sessions in the desktop.
  Complementary; reuse teammates' lane pattern as the Phase 4 kanban adapter
  reference, not as a UI dependency.

## 3. Architecture matrix

| Capability | Current implementation | Integration API | Feasibility |
|---|---|---|---|
| Project selection | none (single room, `$hiveCwd` string, plugin.js:98) | RPC `projects.list` / `projects.for_cwd` / `projects.tree` / `projects.set_active` (methods_projects.py:81-130, methods_config.py:138); event `projects.changed` (events.py:756); `session.create` accepts `cwd` (methods_session.py:330+) | VERIFIED (registered + app-used; plugin-context smoke test pending) |
| Agent sessions | per-profile member sessions, mint/stop/fresh-context (plugin.js:1381-1568) | `session.create` (methods_session.py:484), `session.interrupt`, `session.list` (540), `session.resume`, `session.events.since` (2327) | VERIFIED (runtime-proven v1.3) |
| Agent messaging | marker grammar relay + context envelopes (plugin.js:242-675, 1030-1172) | `prompt.submit` + `queued` (methods_prompt.py:735,824); events message.* / thinking.* / tool.* / error (events.py:117-318) | VERIFIED (runtime-proven v1.3) |
| Kanban | in-room work items only (`$hiveTasks`, plugin.js:109, 499-629) | NONE from desktop: no kanban.* RPC (full registry enumerated), no web router. Indirect: member agents' kanban_* tools via prompt.submit; teammates lane pattern (teammates_service.py:164-182); optional companion plugin_api.py for reads (mount: web_server_dashboard.py:852,1043) | UNSUPPORTED (direct); workaround VERIFIED (agent-relay) / PLAUSIBLE-NEEDS-TEST (companion REST) |
| Git worktrees | none | Kanban `workspace_kind: 'worktree'` + `project_id` (kanban_db_workspace.py:567,690-716; kanban_tools.py:1105-1137); CLI `hermes -w` (_parser.py:188) | VERIFIED mechanism via kanban; UNSUPPORTED as a direct desktop call |
| Approvals | none (members run under their own profile policies) | `approval.pending` / `approval.received` / `approval.respond` (methods_prompt.py:1238-1265); push is a server→client request owned by the app (server.py:818); `approval.cancelled` event (events.py:442) | VERIFIED (poll + respond); live push UNSUPPORTED for plugins |
| Workflow graph | none | REST `/api/plugins/hermes-workflows/runs[...]` (plugin_api.py:230-254; mount web_server_dashboard.py:852,1043) via `window.hermesDesktop.api`; page link `host.navigate('/workflows')`; creation via agent `workflow` tool | VERIFIED (mount + routes + bridge); cross-plugin REST call PLAUSIBLE-NEEDS-TEST |

## 4. Verified SDK calls Phase 1+ may rely on

Runtime-proven by buzz-hive v1.3 in production:
- `host.request('session.create', { profile, cols, source, cwd? })` → `{session_id, stored_session_id}`
- `host.request('prompt.submit', { session_id, text, queued? })`
- `host.request('session.interrupt', { session_id })`
- `host.request('model.options', { explicit_only: true })` → `{providers}`
- `host.onEvent(...)`: message.start, message.delta, thinking.delta,
  reasoning.delta, tool.start, tool.complete, message.complete, error
  (+ session.info event, projects.changed, approval.cancelled available)
- `window.hermesDesktop.api({ path, method?, body? })`: GET/POST `/api/profiles`,
  PUT `/api/profiles/{name}/soul`, POST `/api/model/set` — arbitrary `/api/*`
  forwarding verified in `electron-main.mjs` (handleHermesApiRequest)
- `host.navigate(path)`, `host.notify`, `host.notifyError`,
  `ctx.storage.get/set`, `ctx.register` (ROUTES_AREA / SIDEBAR_NAV_AREA /
  PALETTE_AREA), `ctx.onDispose`

Registered in v0.22.2, app-used, not yet called from this plugin (smoke-test
in Phase 1 before depending on them):
- `projects.list` / `projects.get` / `projects.create` / `projects.for_cwd` /
  `projects.tree` / `projects.set_active` / `projects.update` /
  `projects.add_folder` / `projects.remove_folder` / `projects.set_primary`
- `session.list`, `session.resume`, `session.active_list`,
  `session.events.since`, `session.title`, `session.archive`
- `approval.pending` / `approval.received` / `approval.respond`

Known-dead / do-not-use:
- `host.request('session.info')` — event, not RPC (F1).
- `host.onEvent('tool.error')`, `host.onEvent('assistant.completed')` — not in
  the desktop gateway contract (F2/F3; keep the guards, expect silence).

## 5. Canonical source of truth per data type (confirmed)

- Execution/sessions → Hermes gateway (state.db); UI reads via RPC + events.
- Projects → per-profile `projects.db` via projects.* RPC (never a parallel list).
- Durable coding tasks → native Kanban DBs (`~/.hermes/kanban/boards/<board>/`),
  written ONLY through agent-side tools/dispatcher; the UI reads via agent
  relay or a future companion REST plugin. Never write the DB from JS.
- Team conversation/room state → Hive `ctx.storage` (`hive.v2`), to become
  namespaced per project in Phase 2.
- Workflow runs → hermes-workflows plugin (its store, its REST, its page).
- Approvals → `tools.approval` queue, surfaced via approval.* RPC.
- Git worktrees → git itself + kanban task rows (workspace_path/branch_name).

## 6. Top risks for Phase 1+

1. **Kanban has no UI surface.** Mitigation: Phase 4 adapter is agent-relay
   first (prompt.submit + kanban_* tools); evaluate a tiny companion
   plugin_api.py for read-only board mirrors before any write path.
2. **Session reattach is broken today (F1).** Hydrated members are sessionless
   after app restart. Mitigation: Phase 1 fixes hydrate via `session.list`/
   `session.resume`; until then "Fresh context" is the only recovery.
3. **Approval prompts belong to the app's client handler.** A plugin modal
   would race the app. Mitigation: poll `approval.pending`, render our own
   rows, respond via `approval.respond`; never intercept the app modal.
4. **Cross-plugin REST to hermes-workflows is untested.** Mitigation: Phase 1
   smoke-tests `GET /api/plugins/hermes-workflows/runs` through the bridge;
   fallback is `host.navigate('/workflows')` deep-link only.
5. **Single `hive.v2` storage key mixes room state with what should be
   per-project state.** Mitigation: Phase 2 introduces project-namespaced
   keys with a one-time migration of the v2 blob.
