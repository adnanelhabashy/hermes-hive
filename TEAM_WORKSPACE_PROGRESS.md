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
single-column case.

**Corrected (see the R2 residual section below): this pass only made the sheet
box appear. Its content still measured `display:none 0x0`, because the same
media blocks also hid the sheet's own copy of the panel body. The claim that
"the rail's tabs and the team row detail now open as the overlay DESIGN §1.3
asks for" was wrong and is withdrawn — SENTRY measured it in Chrome
(`TEAM_WORKSPACE_TESTS.md` §"Phase 1 — re-verification", `t_12e302ea`).**

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

## 2026-10-17 — Phase 1 R2 residual + F6 (FORGE, board task `t_0b9b4c3d`)

SENTRY's re-verification (`b3c2818`, on HEAD `224efbc`) left **R2 open**, with
two more measured sites of the same root cause; F6 was reported non-blocking.
This pass fixes R2 and F6 and nothing else. R1 / F1–F4 were verified fixed and
are untouched.

### R2 — the sheet opened, but hid its own payload

The `≤1100px` / `≤860px` / `≤600px` hide rules were written as *bare class
selectors*, so each one also matched the copy of the same element rendered
INSIDE the overlay sheet:

| rule | also matched |
|---|---|
| `.ts-right-body{display:none}` (`:1975`) | the sheet's `.ts-right-body` → the right sheet rendered only its rail |
| `.ts-team-body{display:none}` (`:1982`) | the sheet's roster rows → no row text |
| `.ts-col-team,.ts-col-right{display:none}` (`:1986`) | the sheet's own panel root → **both** sheets rendered nothing |

Fix: each rule is scoped to the column it was always meant to hide, anchored
with a child combinator from the workspace root. `.ts-sheet` is itself a child
of `.ts-workspace`, so a selector anchored `> .ts-col-*` can no longer reach
anything inside a sheet, while the column it names is unchanged:

```
.ts-right-body{display:none}                 → .ts-workspace > .ts-col-right > .ts-right-body{display:none}
.ts-team-body{display:none}                  → .ts-workspace > .ts-col-team .ts-team-body{display:none}
.ts-col-team,.ts-col-right{display:none}     → .ts-workspace > .ts-col-team,.ts-workspace > .ts-col-right{display:none}
```

The two `≤600px` copies of `.ts-narrow-only` / `.ts-sheet[data-open="true"]` are
unchanged, as the card required. Three CSS lines, one guard line, no other code.

### R2 — evidence is computed layout, not a grep of the CSS text

`smoke-render.mjs` applies no CSS, which is exactly how the previous pass passed
review with the defect alive. So the layout claim is now measured by a new
dependency-free probe, `css-layout-probe.cjs` (Node + the Chrome already on this
machine; no new npm dep):

- it extracts `HIVE_TS_CSS` **verbatim** from `plugin.js` (no copy drift),
- builds a harness whose DOM is the class structure `TsWorkspace` renders —
  both lazily-mounted sheets with `data-open="true"`, the roster rows that carry
  `.ts-team-body`, the right panel's `.ts-right-body` + tab body + rail, and the
  `.ts-narrow-only` toolbar toggles — with the app's own stylesheet linked first,
- runs headless Chrome per viewport and reads `getComputedStyle(el).display` and
  `getBoundingClientRect()` out of the live page.

```
$ node css-layout-probe.cjs --plugin=/tmp/plugin-r2-head.js   # 224efbc, before
FAIL — 10 unsatisfied expectation(s)      # right-sheet body/tab body none 0x0 at 1000/700,
                                          # team-sheet rows none at 700, both sheet roots
                                          # none at 600 — the same three sites SENTRY measured
$ node css-layout-probe.cjs                                   # after
ALL PASS — every reachability expectation holds across 1000/700/600 px
```

The decisive rows (raw output in `TEAM_WORKSPACE_TESTS.md` §"R2 residual"):

| viewport | sheet's `.ts-right-body` | sheet's tab body | team sheet rows | both column roots |
|---|---|---|---|---|
| 1000 px | `none 0x0` → **`flex 337x67`** | `0x0` → **`flex 337x19.5`** | visible | visible |
| 700 px | `none 0x0` → **`flex 337x67`** | `0x0` → **`flex 337x19.5`** | `none 0x0` → **`flex 289x16`** | visible |
| 600 px | `none 0x0` → **`flex 337x67`** | `0x0` → **`flex 337x19.5`** | `none 0x0` → **`flex 289x16`** | `none 0x0` → **`flex 338x144`** |

What the probe does **not** prove is the app itself: it is a replica DOM driven
by real Chrome with the real stylesheet, not a running Hermes window. The
in-app pixel check is still SENTRY's (`TEAM_WORKSPACE_TESTS.md` §"What I still
could not verify").

`smoke-render.mjs` got 7 rows that assert the *property that failed* rather than
the block text — every `display:none` inside a media block must be anchored
`.ts-workspace > …`, the three rules still name the column they hide, and no
unanchored hide rule survives for a class the sheet also renders. The file now
says in-line that it does not measure layout.

### F6 (was non-blocking) — Stop minted an empty `done` turn

`hiveStopMember` awaited `session.interrupt` before its fold. An `error` for the
session arriving during that await closed the turn, and the unguarded
`hiveFoldTurn` then took its no-open-turn fallback and appended a fresh empty
`done` row beside the real error row. Stop now folds only a turn that is still
open (`plugin.js:1813`):

```
if (hiveOpenTurnIndex(m) !== -1) hiveFoldTurn(m, undefined)
```

`hiveFoldTurn` keeps its fallback — it is the legitimate path for
`assistant.completed` with no delta (R1b) — the guard is on the user-Stop path
only. Reproducer `sentry-probe/stop-race.mjs` before/after:

```
before: rows before Stop: 2 / after: 3 / last turn row phase after Stop: done
        empty done turn materialized by Stop: true
after:  rows before Stop: 2 / after: 2 / last turn row phase after Stop: error
        empty done turn materialized by Stop: false
```

### Verification run (raw)

```
$ node test.cjs                 # in worktree/
ALL PASS 292/292

$ node smoke-render.mjs         # in worktree/
ALL PASS 80/80                  # 72 + 7 (R2 scoping) + 1 (F6 guard)

$ cp plugin.js /tmp/plugin-check.mjs && node --check /tmp/plugin-check.mjs
SYNTAX OK

$ node ../sentry-probe/probe-sentry.mjs          # R1 must not regress
PROBE RESULT: ALL PASS 21/21

$ node ../sentry-probe/stop-race.mjs             # F6
rows after Stop:  2
empty done turn materialized by Stop: false

$ node css-layout-probe.cjs --widths=1200,1000,700,600,500
ALL PASS — every reachability expectation holds across 1200/1000/700/600/500 px
```

The control width matters: at **1200 px** (above the band) the probe still
measures the three columns intact — `col_right_body flex 319x737`,
`col_team_row_body flex 191x16`, both columns `flex` — so the scoping did not
disable the rules it scoped.

### Hand-back state

Committed on branch `team-studio` (**no branch switch, no push**); the commit
hash is recorded in the kanban handoff for `t_0b9b4c3d`, and the diff to review
is `git diff b3c2818..HEAD`.

```
plugin.js             sha256 f63a52745edb455cd39d56b7c7aa2c667938f356441af213f146ddff5b79fb9e
smoke-render.mjs      sha256 0449477ecf6c0a2f3a3d83f6a6524fdd06df791fd6a076c912e53077e2fbfffb
css-layout-probe.cjs  sha256 4780254779c315da6bc6460252144009fc782a06ed5740a4d2c00dc3e7ef7d30
```

`css-layout-probe.cjs` is new and untracked in the baseline; it is the runnable
form of the R2 evidence, so SENTRY can re-measure rather than re-read.

The live folder was re-checked after the pass: `git -C
~/.hermes/desktop-plugins/buzz-hive status --porcelain` → empty, `rev-parse
HEAD` → `929548d4a512c3072e0093b4401ecf903397b057` (= baseline).

### Left to SENTRY

Everything in the earlier "Left to SENTRY" list, plus: the in-app confirmation
that a real Hermes window at 700 px and 1000 px shows a populated Work sheet and
a populated Team sheet (the probe measures a replica DOM, not the app).

## 2026-10-18 — Phase 2 design: project workspaces (ARCH, board task `t_bde0e382`)

Deliverable: `TEAM_WORKSPACE_DESIGN-P2.md`. Design only — **no product file was
touched** (`plugin.js`, `test.cjs`, `smoke-render.mjs`, `css-layout-probe.cjs`
are byte-identical to `83f1cfd`; verified by hash below). The live folder
`~/.hermes/desktop-plugins/buzz-hive/` was not opened.

### What Phase 2 will be, in one paragraph

One visible Project Selector, and per-project isolation of room state: the
timeline, scratchpad, mission and work items move into a per-project key
(`hive.v3:room:<projectId>`, plus `hive.v3:room:none` for the projectless room
that preserves today's behavior), the roster and presentation prefs stay global
(`hive.v3:global`), and a member's session binding becomes per-project because a
session is cwd-bound. The v2 blob is migrated once, losslessly, reversibly and
idempotently, and is left in place as the rollback snapshot.

### Evidence labels used

VERIFIED (source read + live-probed where stated) / PLAUSIBLE-NEEDS-TEST /
UNSUPPORTED / NEEDS-SPIKE. Every design decision in the doc carries one.

### Live probes run for this design (raw JSON in `p2-spike-raw.json`, method in the doc's Evidence section)

Standalone JSON-RPC over the running desktop gateway's `/api/ws` with the
loopback session token — the same surface `host.request` forwards to — plus HTTP
for the REST routes. Read-only, except two disclosed empty session drafts on
profile `arch` (`session.create` with no prompt ⇒ no DB row,
`methods_session.py:445-447`). No project was created, selected, modified or
deleted.

1. **F1 is confirmed live, not just by reading.** `session.info` →
   `{"code":-32601,"message":"unknown method: session.info …"}`. It is an event,
   never a method. And a prompt needs a LIVE id: `_sess_nowait`
   (`tui_gateway/server.py:1228-1243`) rejects a stored key with 4001 and logs
   "client should resume the stored session" — so today every hydrated member is
   stranded until the user throws its transcript away via "Fresh context".
2. **The reattach map exists and is one call.** `session.active_list` rows carry
   BOTH ids (`{id: <live>, session_key: <stored>, status, title, …}`,
   `server.py:3058-3079`); after two `session.create` calls the new drafts
   appeared with `session_key` equal to their `stored_session_id`.
   `session.resume { session_id, profile, lazy: true, omit_messages: true }` is
   the on-demand fallback, and a live reattach ATTACHES a viewer rather than
   stealing the app's slot (`methods_session.py:868-873`,
   `session_lifecycle.py:830-848`).
3. **cwd adoption is observable and silently falls back.** `session.create` with
   an existing directory → `info.cwd` is that directory verbatim; with a
   non-existent one → `info.cwd = "/Users/adnan"` (the launch dir) with **no
   error**. That single fact is why the design verifies the directory itself and
   then reports the ADOPTED cwd rather than the requested one.
4. **A directory probe IS reachable from the plugin.** `GET /api/fs/list?path=`
   → `200 {"entries":[…]}` for an existing dir and
   `200 {"entries":[],"error":"ENOENT"}` for a missing one;
   `GET /api/fs/git-root?path=` → `{"root":…}`. Both reproduced live over HTTP
   with the loopback token. The bridge hop inside the renderer is the one
   unproven half → spike S7 (with a documented degraded path).
5. **`ctx.storage` is localStorage, and its writes can fail silently.**
   `createPluginStorage` scopes keys to `hermes.plugin.<id>.<key>`
   (`apps/desktop/src/contrib/plugin.ts:196-216`) and `writeKey` swallows
   quota/permission errors (`apps/desktop/src/lib/storage.ts:47-55`). The design
   therefore verifies room writes by read-back + checksum instead of trusting
   `set`. The live room key was observed as
   `hermes.plugin.buzz-hive.hive.v2` in the Electron `Local Storage/leveldb`.
6. `projects.list` returns real rows (`id/slug/name/board_slug/primary_path/
   folders[{path,is_primary}]`, plus `active_id`), and `projects.for_cwd` on a
   non-project folder returns `{project:null, cwd, branch}` — so "this folder is
   not a project (yet)" is a real, cheap state, not a guess.

### Decisions worth flagging to the human

1. **A plain folder becomes a Hermes Project** (via `projects.create`), rather
   than "run projectless with just a cwd". Isolation needs an immutable id; a
   bare path has no stable identity and would be a second project list, which
   PLAN/ARCHITECTURE forbid. The tradeoff (the plugin writes to the user's
   project list) is stated in the spec, mitigated by an explicit confirm sheet,
   and the genuinely projectless need is still served by the "No project" room.
2. **The key prefix deviates from the card's sketch**: `hive.v3:room:<projectId>`
   instead of `hive.v3:<projectId>`, so the reserved global keys
   (`schema`/`index`/`global`) can never collide with a project key and the whole
   key space fits one testable regex.
3. **`cwd_explicit: true` is sent only after our own existence check passes.**
   The host adopts an explicit pick outright (`session_workdir.py:246-251`), so
   sending it blind could stamp a workspace that does not exist.
4. **No automatic room pruning.** Storage growth is handled with a visible size
   warning and an explicit "Clear this project's room" action — an automatic
   prune is one wrong guess away from destroying a history.
5. **The plugin never calls `session.cwd.set`.** The host refuses it on a running
   session anyway (`4009 session busy`, `methods_session.py:1086-1089`); a
   member's directory is fixed at mint and re-homing means a fresh session in the
   target room.

### Spike gates handed to FORGE (S7-S10)

S7 bridge `/api/fs/list` from the plugin page; S8 reattach end-to-end after an
app restart; S9 `projects.create` from plugin context (incl. the duplicate-path
refusal `5063` and its re-resolve); S10 the storage ceiling with a synthetic
full-size room. Each has a documented degraded state — none of them may turn
into an invention.

### Hand-back state

Committed on branch `team-studio` (**no branch switch, no push**); the commit
hash is recorded in the kanban handoff for `t_bde0e382`.

```
TEAM_WORKSPACE_DESIGN-P2.md   (new)
TEAM_WORKSPACE_PROGRESS.md    (this entry)
TEAM_WORKSPACE_PLAN.md        (Phase 2 row: NOT STARTED -> design DONE)
plugin.js                     UNCHANGED  sha256 f63a52745edb455cd39d56b7c7aa2c667938f356441af213f146ddff5b79fb9e
test.cjs                      UNCHANGED
smoke-render.mjs              UNCHANGED
```

Suite state at hand-back (not a P2 claim — a baseline for FORGE):
`node test.cjs` → **ALL PASS 292/292**; `node smoke-render.mjs` → **ALL PASS
80/80**.

Note: `TEAM_WORKSPACE_TESTS.md` has uncommitted Phase 1 runtime-verification
content owned by board card `t_cd258c97` (a different, still-running card). It is
deliberately NOT part of this commit.

### Left to SENTRY (for the P2 build, Phase 3 of this lane)

The 15-row checklist in `TEAM_WORKSPACE_DESIGN-P2.md` §11 (P2-A1…P2-A15), plus
the three BLOCKED-tolerated rows B1-B3 with their stated reasons. The
independent-reproduction duty: the T2-T9 isolation test must be re-run from the
raw room keys (`hive.v3:*`), not from the UI's claims about them.
## 2026-10-18 — Phase 1.5 UX quality pass — critique + redesign contract (SENTRY)

Trigger: the user's verdict on Phase 1 — the UI *"doesn't feel practical"* despite
passing every checklist row. Board card `t_e3b52d33`. **No product code changed.**

1. **Capture set (16 renders + 3 live).** Built a deterministic render pipeline
   against this revision: `p15-harness.cjs` (the plugin's `HIVE_TS_CSS` extracted
   verbatim + the real desktop stylesheet + a replica of the `.ts-*` render tree),
   `p15-render.cjs` (one headless Chrome over CDP: exact viewport width, dsf=2,
   PNG + measured DOM geometry per capture), `p15-pixels.py` (rendered-pixel
   evidence from the PNG bytes). Captures at 1512/1456/1200/1000/700 dark, 1280
   light, plus empty / agent-detail / add-popover / @-mention / four right-panel
   tabs / both overlay sheets; saved in `sentry-probe/p15-captures/`.
2. **Fidelity contract, stated in the critique and verified.** Plugin layer and
   real stylesheet are exact; geometry/type are read back from the rendered DOM;
   the runtime skin palette is *pinned* from the live capture (panel `#2b243b`
   `(43,36,59)` measured in both the live team and right columns — the harness
   renders back `(43,36,59)`, an exact match); SDK primitive chrome is
   approximated and no finding rests on it. Light mode has no live capture to
   sample (this machine runs dark only) — flagged as approximate.
3. **Live-parity check.** The live window's surface seams (x = 300/530/1120/1430)
   put the real plugin surface at ~1156px → the live app runs the ≤1100px regime,
   where the entire Work half collapses to a 48px rail labelled `Ta Ac Fi Ap Wo`.
4. **Four measured causes** behind "doesn't feel practical": (C1) fixed
   four-column shell — team column 98% flat background (591px run), right panel 77%
   (544px run), feed 68%; (reconciled in run 20 — see the run-20 note below) (C2) five type sizes all ≤14px with 10px dominant (40 leaf
   nodes) because `HIVE_T.xs=10px`; (C3) a 240px roster whose expanded detail
   truncates the work-item title to 114px; (C4) narrow regimes clip instead of
   adapt (at 700px `.ts-strip` 71>55 and `.ts-dock` 110>55 → "TEAM 4", "+ Add").
5. **19 ranked findings** (2 Blocker, 6 High, 8 Medium, 3 Nit) with a capture +
   measurement behind each. Verified in source, not repeated: the `leader` flag is
   reachable only as the 6th of 7 buttons in the expanded card and its whole effect
   is sort-to-top + a word in the 10px meta line (`plugin.js:2892–2899`, `3253`,
   `3267`, `1184–1191`); and granting browser access silently reorders the roster
   because `browser` shares the leader sort rank (`1186–1187`). Also verified: the
   card's `--ui-danger`/`--ui-warning` fallback-hex instruction is already
   satisfied (0 references in `plugin.js`); the real token defect is that
   `--ui-yellow/-purple/-orange/-warm` are defined only at `:root` while
   `--ui-red/-green` are defined in `:root.dark` too, so `IN REVIEW` is `#c08532`
   in both themes.
6. **Verdict: REVISE 41/100** (axis table + `differences` pairs in the critique,
   per `omh-visual-qa`'s verdict contract; 90 is the pass line). Five anti-slop
   patterns rejected with evidence; a `comparative_quality_rubric` against AionUI
   Team Mode (interaction model) and Linear/Stripe/Supabase-class craft.
7. **Redesign contract** (`TEAM_WORKSPACE_DESIGN-P1.5.md`): 24 surgical patches,
   token-level — one 4/8 spacing scale, a six-step type scale (10/11/12/13/15/20)
   with a CJK step-up, one control radius, a plugin-owned theme-aware semantic
   ramp, the responsive ladder that degrades the roster before Work, embedded
   empty states, grouped agent actions, and one selection language. No new files,
   no storage change, no architecture change; P2's `hive.v3:*` scheme untouched.
8. **Evidence plan for the next round**: the exact 14 captures FORGE must retake,
   plus numeric acceptance (type census == {10,11,12,13,15,20}; zero
   `scrollWidth > clientWidth` at 700/1000/1200/1456/1512; `IN REVIEW` differs
   between themes; skeleton + CJK + hover/focus captures now required before PASS).

### Hand-back state

```
TEAM_WORKSPACE_P1.5-CRITIQUE.md     (new)
TEAM_WORKSPACE_DESIGN-P1.5.md       (new)
TEAM_WORKSPACE_PROGRESS.md          (this entry)
p15-harness.cjs / p15-render.cjs / p15-pixels.py   (new — the capture pipeline, committed
                                                    so the retake is reproducible)
plugin.js                           UNCHANGED  sha256 14e0d9618f8546a56281a723a38c877822f1ab9c1dcc0a5f0ce69dfc38dfcb93
                                               (== `git show HEAD:plugin.js`; `git status` shows no modification)
test.cjs                            UNCHANGED (node test.cjs -> ALL PASS 292/292)
smoke-render.mjs                    UNCHANGED
```

Captures live outside the repo at `~/Developer/hive-team-studio/sentry-probe/p15-captures/`
(17 harness PNGs + `p15-measurements.json` + `p15-pixel-evidence.json` + `p15-flatshare.json`), alongside the
three live-app captures from the previous run.

**Not claimed:** no motion/hover/focus/keyboard evidence, no CJK capture, no live
light render, and the Stop click / approvals row from Phase 1's HUMAN-CHECK list are
still unobserved. A PASS is not available on this round.

### Left to FORGE (card `t_5ed602ed`)

Implement the 24 patches, then retake the 14 captures named in the contract's §3 at
the same widths/states/themes and re-run the numeric acceptance block; the QA round
rescores against the new captures.

### Run 20 — reconciliation + Approvals state (design-only, no code change)

1. **Approvals tab captured and reviewed.** The card's tab list is complete
(Tasks/Activity/Files/Approvals/Workflow). `p15-1512-tab-approvals-dark.png` (98 %
flat, 625 px run) shows the mirror/disclaimer copy — "A convenience mirror — the
app's own modal still owns live approval prompts" over "No pending approvals." — so the
panel spends its whole height saying the durable surface is elsewhere; folded into
F-16 and §3.9 rather than left as an unobserved gap.
2. **All flat-share numbers re-measured** with one reproducible metric
(`p15-flatshare.py` → `p15-flatshare.json`; deterministic re-run over the committed
PNGs). Corrected in the critique's §1 C1, §3.1, §3.3, §3.5, §3.9, F-01, F-05, F-07 and
the §8 differences list; the critique gained §10 "Evidence reconciliation". Every
correction moves the same way (columns emptier), so the verdict stays **REVISE 41/100**
and no axis deduction changed.
3. **Lineage re-verified.** `buzz-hive-dev/plugin.js` vs `worktree/plugin.js` (a6872c2) =
26 diff lines, all seven hunks dev-identity strings (route, storage keys, labels) — no
behavioural delta, so the captures are evidence for a6872c2. F-02's clipping claim is
DOM-verified from `p15-measurements.json` `clipped[]` at 700 px (`.ts-col-team` 110>55,
`.ts-strip` 71>55, `.ts-dock` 110>55).
4. **Still unobserved (unchanged):** no populated approvals row, no Stop click, no
motion/hover/focus/keyboard evidence, no CJK capture, no live light render. PASS is not
available on this round.

### Run 25 — P1.5 implementation landed (FORGE, card `t_5ed602ed`)

Branch `team-studio`, `2f44398..196330e` — 7 commits: `2888409`, `8009ec4`, `c87a813`,
`cd16181`, `36f892a`, `92b0bf0`, `196330e`. `plugin.js` ≈ +900/−260; `test.cjs`,
`smoke-render.mjs` and `css-layout-probe.cjs` extended alongside it.

1. **`2888409` / `8009ec4` — adopt, don't redo.** Run 22's uncommitted patch series
   (P-01…P-22 partial) and run 23's pure status/summary helpers were committed as-is
   before any new work, so the inherited series is preserved in history.
2. **`c87a813`** wires the design system into the JSX (P-08/P-09/P-12/P-13/P-17/P-18/P-22/P-24);
   **`cd16181`/`36f892a`** adopt the type scale at the source and move the roster meta line,
   timestamps and code blocks onto the xs step (P-03/P-06); **`92b0bf0`** fixes the mention
   picker close, roster row anatomy and grammar chips starting a flow (P-21).
3. **`196330e` — the last numeric-acceptance straggler.** §3 requires every padding value to
   divide by 4; `.ts-chip` was the only `0 5px` left in the CSS block, now `var(--ts-s1)`.

Verified in the source (not a checklist): `--ui-danger`/`--ui-warning` and their fallback
hexes are gone entirely (0 occurrences) — P-16 maps to `--ui-green`/`--ui-red` with a local
`.dark` override pair for warn/info. Type census is exactly {10,11,12,13,15,20} px; spacing is
the {4,8,12,16,24} scale with no off-scale padding left; radii are {6px, pill};
`--ts-dur:160ms` sits in the contract's 150–250 ms band behind a `prefers-reduced-motion`
guard; media queries at 1240/1100/880/600; CJK body steps up to 14 px.

**Deliberately deferred, with reasons:**

- The §3 before/after capture set and every numeric-acceptance *measurement* — that is the
  visual-QA round (card `t_40252ce7`), which owns the window and the verdict. Nothing visual
  is claimed from this run.
- Leader semantics stay presentational (contract §4); the copy says so.
- No storage change was needed: the `hive.v2` blob keeps its shape, P2's `hive.v3:*` scheme is
  untouched and no new persisted key was added.
- The app's own token defect (`--ui-yellow` etc. defined only at `:root`) is worked around with
  the local `.dark` override pair rather than patched — contract §4 excludes it.

## P1.5 REVISE round (FORGE, card `t_16740abd`) — 8 fixes from the 86/100 verdict

Working notes, one block per fix, committed with that fix. Instrument for the numbers:
`~/.hermes/kanban/workspaces/t_16740abd/probe.cjs` (FORGE's own read-only probe: SENTRY's
`p15-real/{stub,boot}.js` doubles + the same pinned palette, 12 captures, writes only into the
FORGE workspace). Before-state JSON: `probe-out-pre/measure.json`.

### 1/8 F-1 — Add-agent popover anchored inside its column

Root cause measured, not guessed: `.ts-addpop`'s containing block is the trigger wrapper
(`.relative` in the dock), which starts at the dock's `--ts-s3` gutter (x=12), so
`inset-inline-start: var(--ts-s2)` put the box at left=20 and a 192px box ended at right=212 on a
208px column (inner edge 207). Fix: `inset-inline-start: calc(var(--ts-s2) - var(--ts-s3))` — the
declared 8px gutter is measured from the column's inner edge, and the box keeps its 192px width.

Measured (`probe --only=addpop`, 1512 dark):
```
            before            after
addpopLeft   20                8
addpopRight 212               200      (column inner edge 207)
inside      false             true
insideInner false             true
.ts-col-team scrollWidth/clientWidth 212/207 -> 207/207
```

### 2/8 F-2 — collapsed-column overhang at 1000/700

Measured cause: the offending content was the dock's labelled Add-agent control, not hidden roster
text — 92px button + 12px dock gutter = scrollWidth 104 on a 56/48px column. Fix: the label is now
its own node (`ts-addlabel`) and is dropped in the <=1100 avatar-only block, with the dock gutter
tightened to `--ts-s2`; the button keeps `title`/`aria-label` so its name survives. Nothing is
`display:none`d that a user needs: the control stays reachable, it just loses its text.

Measured (`probe --only=-full`):
```
width  .ts-col-team sw/cw   .ts-dock sw/cw
       before     after     before    after
1000   104/55     55/55     104/55    55/55
700    104/47     47/47     104/47    47/47
1512   207/207    207/207   207/207   207/207   (unchanged)
```
Remaining `scrollWidth > clientWidth` hits at 1000/1200 are `text-overflow: ellipsis` on fixed-width
rows (`.ts-row-name`, `.ts-strip-meta`) — the intended device, F-3 addresses the row-name one.

### 3/8 F-3 — work-item titles get a second line

`TsTaskRow`'s title is `.ts-row-name truncate`; at the 280px panel that means one line and a
truncation point in the middle of the sentence. Fix: a `min-width:1200px` block gives
`.ts-col-right .ts-row-name` (and the right sheet copy) `display:-webkit-box` +
`-webkit-line-clamp:2` + `white-space:normal`, which outranks the `.truncate` utility on
specificity. Roster/addpop row names and the agent-detail rows are untouched — they are not in
`.ts-col-right`. Below 1200 the panel is 196–240px wide and keeps one-line ellipsis (measured,
still reported as `truncated[]`, i.e. intended).

Measured (`probe --only=-full`):
```
                before              after
1512 right title  327/236 one line   236/236 clamp 2, h=36 (2x18)
1456              327/236            236/236 clamp 2
1200              327/196            196/196 clamp 2
1000 (below 1200) 327/196            unchanged, ellipsis
```

### 5/8 F-5 — the Approvals tab speaks to the user

Two strings in `TsApprovalsTab` were architecture, not copy: `A convenience mirror — the app's own
modal still owns live approval prompts. Choices come from the server verbatim.` and the empty-state
hint `Answer prompts in the app's own modal — this tab mirrors the queue, it does not own it.` The
panel meta line is now the one user-facing sentence — `Approvals are answered in the app's own
prompt.` — the empty state reads `Nothing is waiting on you right now.`, and the mechanism
(`approval.pending` mirror, choices verbatim from the server, the app's own modal owning the live
prompt) moved into the code comment beside the render. No other string in the tab changed; the
error branch already said `Answer those in the native prompt.`

### 6/8 F-7 — readable micro-meta sits at the tertiary token

`--ui-text-quaternary` is 36% of the base colour against `--ui-text-tertiary`'s 54% (both read from
the app stylesheet). The three elements QA read as low-contrast in separate passes — the right
panel's work-item duration (`0s`), strip meta, the composer hint — now name
`var(--ui-text-tertiary)` directly:
```
.ts-row-meta    var(--ts-idle)  -> var(--ui-text-tertiary)     (the Work-tab row meta, incl. "0s")
.ts-empty-hint  var(--ts-idle)  -> var(--ui-text-tertiary)
.ts-mention-model var(--ts-idle) -> var(--ui-text-tertiary)
composer hint   class text-muted-foreground -> inline var(--ui-text-tertiary)   (plugin.js)
```
`.ts-strip-meta` was already `--ui-text-tertiary`; `--ts-idle` keeps its real job as the semantic
idle *state* tone (`hiveTaskStatusTone`'s OPEN colour), which is why the meta rules no longer route
through it. The rule and its reason are written beside the token block. No colour literal was added;
quaternary remains in use only as the system-member avatar colour in `hiveAccent`.

### 7/8 F-6 — the project chip renders one label, from one place

The trigger handed Radix a `placeholder` and let it decide the label. In the app's own Radix build
(`select-CQr2y4up.js`, `shouldShowPlaceholder = e === '' || e === undefined`) the value node is
either the placeholder span or a portal of the selected item's text, and the item this Select
selects is itself labelled `No project` — two sources for one string. The chip now renders its own
children — `No project` with nothing selected, the project's name with one — which sets Radix's
`valueNodeHasChildren` (`SelectItemText`'s portal is gated on `!valueNodeHasChildren`) so no second
label can be injected: exactly one in both states.

Also corrected the capture driver's `SelectValue` double (`p15-real/stub.js`, one line): it always
rendered the placeholder and ignored children, which contradicts the real component's
`shouldShowPlaceholder ? placeholder : children` and would have painted an empty chip once the
plugin stopped passing a placeholder. Flagged for SENTRY as a harness-double correction, not
evidence.

Not verified: the duplicate in the **live** app. The packaged build opens no CDP port (checked:
nothing listening on 9222/9333; the only loopback listener is the gateway on 8789) and screen
capture is unavailable in this session (cua-driver is running with
`--cua-internal-gate-missing-screen-recording`), so the live Radix render could not be read here.
What is verified is the plugin-side source of the second label, from the app's own component code.

### 8/8 F-8 — the roster row can pin and unpin

The only pin affordance outside the roster was the Add-agent popover's row toggle, so a member
rendered as PINNED could not be unpinned where it is shown. `TsAgentRow` now carries its own toggle
reusing `ts-addpop-pin`'s anatomy — `data-on` for the state, `aria-pressed`, the same PINNED chip as
its on-label, `title` naming the action — with the click stopped at the control so the row's own
click still selects and expands the member.

The first cut put the button in the row's trailing slot and cost the meta line 7px, which started
ellipsizing `v4.1-flash · 09:00 PM` at 208px (caught by re-capturing 1512/1000); it now sits on the
name line, where the read-only chip used to be, and the meta line keeps its width. It stays quiet at
rest and is visible on row hover, on the selected row, on its own focus, and always under
`@media (hover:none)`.

Measured, real DOM, one click (`p15-real.cjs` + a local `pin-click` state in a scratch copy of the
driver; the committed driver's state list is untouched):

```
fa8c-1512-pin-click-dark   ready=true tsClasses=33 scopeNodes=231 clipped=0 errors=0
driveLog  hover([data-ts-team] .ts-row[data-agent="arch"]) -> hovered ; mouseMoved(104,246)
          click([data-ts-team] .ts-row[data-agent="arch"] .ts-row-pin) -> clicked
roster before  you · @arch(unpinned) · @forge(PINNED) · @default(selected)
roster after   you · @arch(PINNED, moved first) · @forge(PINNED) · @default(selected)
```
So the click pinned @arch and the roster reordered (@arch first, `hiveOrderMembers`), @default is
still the selected row (its highlight is unchanged) — the pin click did not toggle the row. `@forge`
and `@arch` both read PINNED because `hiveSetLeader` toggles one member's flag rather than moving a
single one; `@default` renders the `Pin` label. `clipped=0` in the settled and hover states at 1512,
the same reading as the pre-F-8 baseline; the only added markup is the three row toggles.

## P1.5 REVISE round — suites at HEAD

`1a706fb`, worktree clean, `plugin.js` sha256
`70afcb124778784f677a8f90c8aa4437afc3666b79a388eb2986e2bda3841f9d`:

```
$ node test.cjs                                      -> ALL PASS 312/312
$ node smoke-render.mjs                              -> ALL PASS 85/85
$ node css-layout-probe.cjs --widths=1512,1456,1200,1000,700,600,500
                                                     -> ALL PASS (exit 0)
```

Real-DOM captures run for this round went to
`~/.hermes/profiles/forge/cache/scratch/{f6verify,pinrun}/` — SENTRY's `p15-captures/` was not
written to. Not re-verified here (SENTRY owns them): the light-theme repaint, motion (P-19), and the
add-popup row pin toggle that needs a seeded `/api/profiles`.

## P1.5 QA round 2 — F-9, add-agent popover loading state (FORGE)

`HiveAddMember` had three render branches but only two states, so `loadState === 'loading'` fell into
`HiveRenderOptions`, whose `opts.length === 0` arm paints "Every profile is already in the room." —
for the whole `/api/profiles` fetch the popover told the user the room was full. `loading` now owns a
branch: `data-ts-addpop-loading`, `aria-busy="true"`, `role="status"`, "Loading profiles…" and two
static `.ts-skel-row` rows (no shimmer — Phase 9 owns motion); `error` and the empty copy are
untouched. New `f9-probe.mjs` (real `plugin.js` via the `smoke-render.mjs` SDK stub, popover open,
`loadState`/`profiles` forced) passes 13/13 — loading paints its own copy and skeletons and never the
empty copy, idle paints rows, idle+empty keeps the empty copy, error keeps Retry, and `load()` enters
`'loading'` before awaiting the fetch. No `test.cjs` case: pure-function harness, no render coverage.

## P1.5 F-9b — every Add-an-agent entry point drives the fetch (FORGE)

`plugin.js` unchanged at `7d6d704`, sha256
`0f4791bda29c3b032337522923e7e30a10d654c1ddc3ef6f6bc03974852a6033` — the two probe corrections and
these notes are uncommitted in the worktree (`f9-probe.mjs`, `f9b-probe.mjs`, both docs).

```
$ node test.cjs                              -> ALL PASS 312/312
$ node smoke-render.mjs                      -> ALL PASS 85/85
$ node f9-probe.mjs                          -> ALL PASS 13/13
$ node f9b-probe.mjs                         -> ALL PASS 24/24
$ node f9b-probe.mjs --plugin <6dc8c89>      -> FAIL 8/24   (the red control)
$ node css-layout-probe.cjs --widths=1000    -> ALL PASS (exit 0)
$ bash ~/Developer/hive-team-studio/sync-dev.sh -> synced buzz-hive-dev/plugin.js, no residual identities
```

`f9b-probe.mjs` clicks the two REAL CTAs in the real DOM. It reaches a genuinely empty room by failing
`session.create` — a normal boot mints @default and appends "joined the room", so TsRoomEmpty never
renders and the room CTA was previously untestable. Both probes were corrected to the F-9b render
contract (`loadState` + `loaded`), not weakened: `f9-probe.mjs`'s settled fixtures now set `loaded`, and
`f9b-probe.mjs` clicks inside `act()` so the assertion is not one commit behind the click. No CSS
touched, so the 1000px layout probe is a regression check only.

## F-10 — one leader per room, crowned (FORGE)

Both write paths (row toggle, add-as-leader mint) run pure `hiveApplyLeader`: pinning sets the target and
clears the rest in the same update. The leader row gets an inline-SVG crown before the name (`aria-label`
"Team lead", `var(--ts-warn)`) replacing the "Pinned" chip; the toggle's on-label becomes "Unpin".
```
$ node test.cjs -> ALL PASS 336/336  |  node smoke-render.mjs -> ALL PASS 86/86
$ node f10-probe.mjs (real DOM) -> ALL PASS 27/27  |  --plugin 200fc14 (pre-fix) -> FAIL 17/27
$ bash sync-dev.sh -> synced buzz-hive-dev/plugin.js, no residual identities
```

## F-10 round 2 — SENTRY's findings (FORGE): boot collapses legacy rooms, unknown pins no-op

Boot runs pure `hiveCollapseLeaders()` (in `hiveBootHydrate`, before the persist): a room saved by the
pre-fix pin keeps only the lowest-`order` lead (array position, then profile name) and clears the rest
through `hiveApplyLeader`, so the repair is written back. `hiveApplyLeader` now no-ops when the named
profile matches nobody — it used to clear every non-match and leave a typo/race room leaderless.
```
$ node test.cjs -> ALL PASS 352/352 (+16 hydrate-collapse, no-match guard, hydrate wiring)
$ node smoke-render.mjs -> ALL PASS 86/86
$ node f10-probe.mjs -> ALL PASS 33/33 (§E: legacy two-leader room -> one crown)
$ node f10-probe.mjs --plugin ad2b9bc -> FAIL 3/33 (crowns=2, both pinned, persistedLeads=atlas,forge)
```
