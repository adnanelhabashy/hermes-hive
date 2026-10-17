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

## 2026-10-17 — Phase 1 implementation complete (FORGE, board task t_a7898aa3)

### Changes (branch `team-studio`, commits `d6d3a7a` → `49e4fdf`)

1. `d6d3a7a` **core: Phase 1 pure helpers.** Added inside the CORE slice (so
   test.cjs covers them with no DOM/SDK): `hiveMemberStatus` (DERIVED status —
   offline/error/working/thinking/busy/idle), `hiveStatusTone/Label/Glyph/Busy`,
   `hiveTaskStatusLabel/Tone`, `hiveSortTasks`, `hiveCardKind`,
   `hiveTimelineToCards`, `hiveActivityCards`, `hiveFilterCards`,
   `hiveBatchDeltas`, `hiveTruncatePayload`, `hiveCapTimeline`,
   `hiveLastProfileEntry`, `hiveCardTitle`, plus the caps
   (`HIVE_TIMELINE_MEM` 500 / `HIVE_TIMELINE_KEEP` 120 / `HIVE_PAYLOAD_MAX` /
   `HIVE_DELTA_WINDOW_MS` 50).
2. `77c24ea` **work items: Timeline cards.** `hiveApplyWorkItems` now also
   returns `cards` for every effect that ACTUALLY applied (task/submission/
   review request/verdict) — derived from the same pure fold, so a card cannot
   claim a state change the state machine did not make. `hiveEmitWorkCards`
   appends them at both real fold sites (agent turns, and `you`). Timeline
   appends now go through `hiveCapTimeline`.
3. `49e4fdf` **ui: the three-column workspace.** New atoms on the same
   `hive.v2` blob (rightTab / dockOpen / agentDetailExpanded / activeProject /
   teams / member.leader — absent keys keep their defaults, no migration);
   one injected `<style>` (`buzz-hive-team-studio`) scoped entirely under
   `.ts-*`; toolbar, Team panel, conversation feed, right tabs, bottom dock,
   narrow-window rails/sheets; project selector, roster presets, stop-all,
   derived workers badge, approvals badge, settings; composer Stop button;
   delta coalescing (one 50 ms scoped timer per session) and the extended
   `ctx.onDispose`.
4. `smoke-render.mjs` (new, 51 checks) — see TESTS.md for what it proves.

### Spikes S1-S6 — status and evidence

- **S6 (SDK var list + components) — DONE by inspection of the installed
  source** (`~/.hermes/hermes-agent/apps/desktop/src/sdk/index.ts`,
  `src/styles.css`, `src/components/ui/*`). Canonical `--ui-*` set enumerated
  (55 props); `Tabs/TabsList/TabsTrigger`, `StatusDot`, `ScrollArea`, `Badge`,
  `Button`, `Select*`, `DropdownMenu*`, `Switch`, `SegmentedControl`,
  `Input`, `Textarea`, `useQuery`, `queryClient`, `host.revealPane`,
  `ctx.os.writeClipboard`, `ctx.runAction`, `ctx.setTimeout/setInterval` all
  exist in the installed bundle (`app.asar.unpacked/dist/assets/sdk-*.js`).
  Consequences handled: there is **no `Card` and no `TabsContent` export** →
  rows are `.ts-card` and tab bodies render outside the Radix root; the design's
  `--ui-error` / `--ui-success` / `--ui-danger` / `--ui-warning` names do **not**
  exist → status/verdict tones use the real `--ui-red` / `--ui-yellow` /
  `--ui-green` / `--ui-text-tertiary`. **Corrected 2026-10-17 (Phase 1 fix
  pass, card `t_38382fa2`):** the claim that this "also removed the two dead
  `var(--ui-danger, #e5484d)` / `var(--ui-warning, #f5a524)` fallbacks" was
  **wrong**. Of the 4 baseline occurrences exactly **1** disappeared, and only
  because `HiveRosterChip` was deleted along with the roster strip. The other
  three stayed live in reused components (`HiveTurnRow` header `:2226` and
  error card `:2250`, `HiveWorkBoard` `:2700`). They are fixed in the Phase 1
  fix pass below.
- **S3 (projects.*) — VERIFIED against the LIVE gateway**, not just by
  registration: a standalone JSON-RPC client on the running desktop's
  `/api/ws` returned real payloads —
  `projects.list` → `{projects:[{id,slug,name,primary_path,board_slug,folders,…}]}`,
  `projects.for_cwd {cwd}` → `{project,cwd,branch}`,
  `projects.get {id}` → `{project:{…folders}}`,
  `projects.tree` → `{projects:[…]}`.
  `projects.set_active` was verified registered in
  `tui_gateway/methods_projects.py:124` (`{id}` → `{active_id}`) but was
  deliberately NOT called (it mutates the user's active project).
- **S4 (approvals) — VERIFIED reachable against the live gateway**:
  `approval.pending` / `approval.received` answer with a *domain* error
  (`{code:4001,"session not found"}`) for a bogus session id, while an unknown
  method answers `{code:-32601}` — so the methods are registered and callable.
  Result shape confirmed in source: `{approvals:[{request_id,choices,command,…}]}`
  (`_approval_reply` → `list_gateway_approvals`, `tools/approval.py:193`);
  `approval.respond` takes `{session_id, choice, request_id?}` and replies
  `{resolved}`.
- **S5 (workflows REST) — VERIFIED live over HTTP**:
  `GET /api/plugins/hermes-workflows/runs` → `200 {roots,runs,total,counts}`
  (real, if empty, run list). Run row fields read from
  `~/.hermes/plugins/hermes-workflows/dashboard/plugin_api.py:106-130`.
- **S2 (clipboard) — resolved to the SDK door**: `ctx.os.writeClipboard(text)`
  exists (documented, in the installed bundle). Used first, with
  `navigator.clipboard` only as a fallback.
- **S1 (`session.events.since`) — informational only**: it answered live
  (`{events:[],latest_seq,open_requests}`), but Phase 1 never depends on it —
  "View session" navigates to the native pane as the design specifies.

Caveat on all four runtime probes: they were made from a standalone WS/HTTP
client against the running backend (the headless worker cannot render the
plugin page). `host.request` performs **no method allow-listing** — it forwards
straight to the live gateway socket (`src/sdk/index.ts:1623`), and the plugin's
only other door is the desktop bridge, which forwards arbitrary `/api/*` paths
(`electron-main.mjs`) — so the plugin-context path is the same surface. The two
remaining in-app unknowns are therefore *layout* and *live-push* behavior, both
of which are SENTRY's.

### Bugs / regressions found and handled

1. **The Phase 1 default view was wrong (found by the harness).** DESIGN §3.1
   says the chronological flat feed is the Phase 1 default, but
   `$hiveTimelineMode` still defaulted to `agents` (grouped), so a fresh room
   opened on collapsed per-agent sections instead of the conversation. Fixed:
   the atom default is now `flat`. A persisted value still wins, and the
   grouped view is unchanged and still reachable from the toggle. (No marker
   leaked anywhere — the harness checks the rendered feed for raw `[task` /
   `[done` / `[verdict` / `[scratchpad` text and finds none.)
2. **`--ui-danger` / `--ui-warning` were never defined** in the app's
   stylesheet, so the existing error/warning tones silently used hardcoded hex
   fallbacks. The NEW status/verdict tones were written against the real vars
   from the start (no behavior change in dark mode, correct in light). The three
   PRE-EXISTING fallbacks in the reused components were **not** removed here —
   corrected above; they are removed in the Phase 1 fix pass (`t_38382fa2`).
3. **`host.navigate` cannot open a pane** (it is a route door —
   `src/app/routes.ts`). The design's bottom dock said "`host.navigate` to the
   native `terminal` pane"; that would have done nothing. Implemented with
   `host.revealPane(paneId)` (feature-detected) and `ctx.runAction(
   'view.toggleReview' | 'view.showFiles')` for the two pane ids that have a
   built-in plugin action, with an honest toast when neither door exists.
4. **React 19 `key`-in-props warnings** are a *development-build* advisory; the
   shipped renderer is production (`hermes-build.json` env NODE_ENV=production),
   so the harness runs with NODE_ENV=production to match. No plugin churn.

### Deviations from TEAM_WORKSPACE_DESIGN.md (with reasons)

1. **Approvals/Workflow use the app's React Query client** (`useQuery`,
   `queryClient`) — the design already said "React Query"; confirmed the SDK
   exports it (§158-160 of the desktop-plugins reference), so no hand-rolled
   poll loop.
2. **`$tsAgentExpanded` is a NEW atom, not an extension of
   `$hiveAgentExpanded`.** The design's table said "replaces/extends
   `$hiveAgentExpanded` for the new panel", but that atom drives the grouped
   TIMELINE's per-agent sections; sharing it would have coupled the left-panel
   accordion to proven timeline behavior. Two atoms; both persisted under
   distinct keys.
3. **Row click toggles selection AND the accordion** in one gesture (the design
   described them as separate affordances). One click, one state pair; the
   chevron is the affordance.
4. **The feed filter forces the Feed view** when a query is non-empty: the
   By-agent sections group by speaker, so a text filter there would silently do
   nothing.
5. **`Card` / `Tooltip` not used** — no `Card` exists in the SDK; `title`
   attributes (the file's existing convention) replace tooltips.
6. **No `TsAgentMessage`/`TsDirectedMessage`/`TsToolEvent`/`TsSystemCard`
   components.** §3.5/§9 ask for the card mapping to be DATA with a dumb switch
   — so `TsCard` switches on `hiveCardKind` and delegates prose/turn kinds to
   the already-proven `HiveMemberTone` / `HiveTurnRow` renderers instead of
   reimplementing them. Only the new work cards are new components.
7. **Removed as dead after the move:** `HiveRosterChip` (roster strip replaced
   by the Team panel), `HiveRoomMenu` (replaced by `TsSettingsMenu`), and the old
   flat `HiveTimeline` / `HiveTimelineBody` (replaced by `TsCardList` /
   `TsTimelineBody`). Everything else — grouped timeline, turn row, work board,
   scratch/SOUL editors, composer, and every pure helper — is behaviorally
   unchanged.
8. **Roster presets store `{profile, contextMode, model, provider}` and re-apply
   a saved model only when it resolves to a real entry** (`hiveResolveModelEntry`
   → the existing `/api/model/set` path). A preset that names an unresolvable
   model mints the member without it and says so; it never fabricates a model.

### Open blocker (recorded, not worked around)

**F1 — hydration reattach is still broken, and the fix is NOT safe to invent.**
`hiveBootHydrate` still calls `host.request('session.info', …)`, which is an
event, not an RPC (ARCHITECTURE §1.2/F1), so hydrated members come back
sessionless. Phase 1's UI now shows that state honestly: the row reads
`offline`, the detail card says `session: none — Fresh context to start one`,
and `Fresh context` is present as the recovery action. The two candidate fix
paths were inspected and **not** taken: `session.list` returns stored ids only
(no runtime id — verified live), and `session.resume` is a real backend
ACTIVATION (`tui_gateway/methods_session.py:1049` → `_resume_eager` /
`_resume_lazy` / `_resume_cold`, plus `restore_session_yolo`), so calling it for
every hydrated member at plugin load would spawn N agent backends the user did
not ask for. Per PLAN rule 4 and the task's hard rule, inventing that behavior
is worse than recording it. **Needs a decision (ATLAS):** either add a cheap
verified lookup, or make reattach an explicit user action per member.

### Verification run (raw)

```
$ node test.cjs
ALL PASS 283/283

$ node smoke-render.mjs
ALL PASS 51/51

$ node --check plugin.js   # (as .mjs; the file is plain ESM)
SYNTAX OK
```

### Left to SENTRY (cannot be checked headlessly)

A1/A2 (real layout + breakpoints), A3 light theme (the harness proves no color
literal and only real vars; it cannot repaint), A4 in-app Stop against a real
session, A8 a real pending approval, A9 the Files/Workflow degraded states under
a real failure, A12 console + duplicate-rows across disable/re-enable, A13 other
plugins/panes unaffected.

## 2026-10-17 — Phase 1 fix pass (FORGE, board task `t_38382fa2`)

Worked the full findings checklist from SENTRY's FAIL on `t_6d3f2ad7`
(`TEAM_WORKSPACE_TESTS.md` §"Phase 1 — SENTRY verification"). Branch
`team-studio`, worktree `~/Developer/hive-team-studio/worktree`. The live folder
`~/.hermes/desktop-plugins/buzz-hive/` was not touched.

### R1 — BLOCKING: a buffered delta resurrected a turn that already ended

Both halves of the required fix are in:

1. **Guard** — `hiveFlushDelta` now refuses to write into a turn that is no
   longer open (`plugin.js:2068`):
   `if (hiveOpenTurnIndex(member) === -1) return`. This is what makes the flush
   *unable* to open a new turn, whatever path closed the previous one.
2. **Flush before closing** — the three non-`message.complete` endings now fold
   the buffered tail into the turn they are closing instead of orphaning it:
   - `hiveTurnFail` (`:1549`, first statement — covers the `error` event),
   - `hiveStopMember` (`:1806`, before `hiveFoldTurn` — Stop is an A4 action),
   - `hiveHandleFallbackCompleted` (`:1443`, before the open turn is read).

   `message.complete` already flushed (`:3824`).

Regression test added to `smoke-render.mjs`: `message.start` → `message.delta`
→ `error` **with the delta still inside the 50 ms window**, then the window is
run. Asserts the member still reads `errored`, no live delta timer survives, no
new turn row appears, nothing reads `answering…`, and the stale text is not
replayed anywhere. The old handler emitted `error` with no pending delta, which
is exactly why it could not see this.

### R2 — right/team panel content unreachable between 601 px and 1100 px

`.ts-sheet[data-open="true"]{display:block}` and
`.ts-narrow-only{display:inline-flex}` moved from the `≤600px` block into the
`≤1100px` block (`plugin.js:1977-1978`); the `≤600px` copies stay for the
single-column case. In 601–1100 px the rail's tabs and the team row detail now
open as the overlay DESIGN §1.3 asks for.

### F1 — `TsSheet` mounted its children while closed

`TsWorkspace` now mounts a sheet only when it is open (`plugin.js:3735-3736`).
Before: `data-ts-right="true"` ×2, `data-ts-team="true"` ×2 and three observers
on `['buzz-hive','approvals',key]` (badge + both `TsRightPanel` copies), so the
5 s approval poll fired 3× per tick. Now one of each, two observers, and the
sheets are not in the DOM at all while closed.

### F2 — three live hardcoded colour fallbacks

`var(--ui-danger, #e5484d)` / `var(--ui-warning, #f5a524)` at `:2226`, `:2250`
and `:2700` replaced with the real theme vars (`--ui-red` / `--ui-yellow`), so
the same FAILED item is one colour in the Work board and the Tasks tab.
**The earlier claim in this file that these had already been removed was wrong
and is corrected above** — only 1 of the 4 baseline occurrences ever
disappeared, and only because `HiveRosterChip` was deleted with the roster
strip.

### F3 — the error reason never surfaced

The `error` handler read `e.error.message` / `e.payload.error`, but the
gateway's `ErrorPayload` is `{message}` (`tui_gateway/contracts/events.py:112`,
delivered as `GatewayEvent.payload`, `apps/shared/src/gateway-events.ts:46`) —
so every error card showed the literal `turn failed`. Now
`(e.payload && e.payload.message) || (e.error && e.error.message) || 'turn failed'`
(`:3836`), and `smoke-render.mjs` emits the REAL shape and asserts the reason
renders.

### F4 — cleanups

- `hiveCardTitle` (`:1175`) was dead. Wired, not deleted: the work cards now
  carry it as their native tooltip (`plugin.js:3334`), asserted in
  `smoke-render.mjs`.
- `TEAM_WORKSPACE_DESIGN.md` §10 A7 corrected: "the row returns to **IN
  REVIEW** on resubmission", with a pointer to §4.1:265. The state machine was
  not changed (A7-as-written was the document's defect).
- No raw `--ui-danger` / `--ui-warning` literal remains anywhere in `plugin.js`.

### Verification run (raw)

```
$ node test.cjs                 # in worktree/
ALL PASS 292/292                # 283 + 9 new (turn-closing safety)

$ node smoke-render.mjs         # in worktree/
ALL PASS 72/72                  # 51 + 21 new (F1, R2, R1, R1b, A7, F4)

$ cp plugin.js /tmp/plugin-check.mjs && node --check /tmp/plugin-check.mjs
SYNTAX OK

$ node ../sentry-probe/probe-sentry.mjs
PROBE RESULT: FAIL 1/15         # was FAIL 6/15
```

The single remaining probe failure is **A7's literal expectation** — the probe
asserts the row reads `OPEN` after resubmission ("DESIGN A7, literally"), which
is the sentence this pass fixes in DESIGN §10. Its companion row in the same
block, `...and it mirrors $hiveTasks by reading IN REVIEW instead`, passes. The
probe was not edited: it is SENTRY's artifact. The corrected expectation is
absorbed as a real assertion in `smoke-render.mjs` ("after resubmission the row
reads IN REVIEW" / "no row in the Tasks tab reads a bare OPEN during IN
REVIEW"), both green.

### Hand-back state

Committed on branch `team-studio` (**no branch switch, no push**). The
re-verification card `t_12e302ea` step 4 diffs `531c6e5..HEAD`, so HEAD has to
carry the rework:

```
$ git status --porcelain        # after the commit — empty
$ git log -1 --format=%B
fix(team-studio): P1 rework — delta-window turn resurrection + 601-1100px reachability + F1-F4

plugin.js       sha256 b27f4c7a99262a1c6e3436f5ed4fb0f024af0215b3607cc2598212ea319548a8
smoke-render.mjs sha256 2f3c6ebb57aa221b6dec1dc26c1d8105fe9e6a40a19c1f7a384db9a88f763518
test.cjs        sha256 35a7a5cee55639aabd851a5f4032651b4621d1449b082bef78bd5d55b020a09f
```

The rework commit's hash is recorded in the kanban handoff for `t_38382fa2`;
the diff to review is `git diff 531c6e5..HEAD` (the range the re-verification
card names).

The live folder was re-checked after the pass: `git rev-parse HEAD` →
`929548d4a512c3072e0093b4401ecf903397b057` (= baseline), `git status
--porcelain` empty, and no `TEAM_WORKSPACE_*` / `smoke-render.mjs` present.

### Left to SENTRY (still cannot be checked headlessly)

The same runtime items as before: A1/A2 real pixel layout, A3 a real light-theme
repaint, A4 in-app Stop against a real session (the source ORDER of the flush is
asserted here; the click is not), A8 a real pending approval (the 3×→2× poll
observation needs a live query client), A12 duplicate rows across a real
disable/re-enable, A13 other plugins/panes.
