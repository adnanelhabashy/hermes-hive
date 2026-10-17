# TEAM WORKSPACE DESIGN — Phase 1 UI/UX Spec

Status: COMPLETE — 2026-10-17 (ARCH). Constraint set: TEAM_WORKSPACE_ARCHITECTURE.md
§3–§4 (only VERIFIED APIs are design dependencies; PLAUSIBLE-NEEDS-TEST items are
flagged "smoke-test first"; UNSUPPORTED items are display-only or omitted).
Phase 0 findings F1/F2/F3 are incorporated. This is a spec; FORGE implements.

Every reference to existing code is a worktree `plugin.js` line citation from the
Phase 0 audit (TEAM_WORKSPACE_ARCHITECTURE.md §1), spot-re-verified 2026-10-17.

---

## 1. Layout

### 1.1 Surface

Full page at ROUTES_AREA, replacing the current `HivePage` registration
(plugin.js:2529-2533) at route `/hive`. The existing SIDEBAR_NAV_AREA entry and
PALETTE_AREA commands stay; only the page body changes shape. Keeping the same
route preserves user muscle memory and any existing links into `/hive`.

### 1.2 Grid

```
┌──────────────────────────────────────────────────────────────────────┐
│ TopToolbar (fixed, 44px)                                             │
├───────────────┬──────────────────────────────────────┬───────────────┤
│ TeamPanel     │ ConversationPanel                    │ RightPanel    │
│ 240px         │ flexible (min 420px)                 │ 320px         │
│ (agents)      │ (timeline + composer)                │ (tabs)        │
├───────────────┴──────────────────────────────────────┴───────────────┤
│ BottomDock (collapsible, 0/160px, links out — never embeds terminal) │
└──────────────────────────────────────────────────────────────────────┘
```

- CSS Grid on the page root: `grid-template-columns: 240px minmax(420px, 1fr) 320px`,
  `grid-template-rows: 44px 1fr auto`. All sizing in px/rem + fr — no JS resize
  math, no resize observers (Phase 9 concern, not Phase 1).
- Panel widths are CSS custom-property driven (`--ts-team-w`, `--ts-right-w`)
  scoped to the page root, so a later drag-resize can set two properties instead
  of reworking the grid. Phase 1 ships fixed widths.
- Left panel 240px is inside the 230–260px brief band; right panel 320px inside
  300–360px. Chosen: left must fit an agent row with status dot + two text
  lines without truncation at default font; right must fit a task card with
  id + title + two badge rows.

### 1.3 Narrow-window fallback

Breakpoints (window width, via CSS media queries only — no JS):

- **< 1100px**: right panel collapses to a 48px icon rail; tab content opens as
  an overlay sheet anchored right (same component, different container class).
- **< 860px**: left panel also collapses to a 56px avatar rail (avatar + status
  dot only); center keeps min 420px until 600px, then takes full width and both
  rails become overlay sheets.
- **< 600px**: single-column mode — center only; toolbar gains two icon buttons
  that toggle the Team and Right sheets. This is the floor; below it the page
  remains usable, just paged.

Rationale: the desktop app window can be narrowed arbitrarily; media queries
give the fallback for free with zero runtime cost and nothing to clean up.

### 1.4 Scroll ownership

Each column scrolls internally (SDK ScrollArea per column). The page itself
never scrolls; the toolbar and composer are fixed. Conversation uses the
existing follow-scroll hook `hiveUseFollowScroll` (plugin.js:1952) unchanged —
pause-on-user-scroll behavior is already correct and tested in production.

---

## 2. Left panel — Team

### 2.1 Roster model

Reuse the existing `$hiveMembers` atom (plugin.js:95-133) as the ONLY roster
source — no parallel team list. A member = `{ name, profile, storedId,
sessionId, browser, muted, contextMode, provider, model, … }` exactly as v1.3
persists them in `hive.v2` (plugin.js:1572). Profiles come from the existing
`GET /api/profiles` bridge call (runtime-proven, plugin.js:1302); the spec does
NOT create profiles — ATLAS/arch/forge/sentry already exist, and "add member"
reuses `HiveAddMember`/`HiveCreateForm` (plugin.js:2245-2300) which mint from
existing profiles via `session.create` (plugin.js:1391-1393).

Leader/specialist ordering is presentational: members with `browser` role or an
explicit `leader` flag sort first, then the rest alphabetically. ATLAS-on-top is
achieved by the roster the user builds (add ATLAS first / flag it leader), not
by hardcoding names into the plugin — the plugin must stay team-agnostic.
A small `leader: true` member attribute (persisted in `hive.v2`, default false,
settable from the member's expanded detail) is the only schema addition.

### 2.2 Agent row (collapsed)

One row per member, 56px tall:

```
(●) AV  ATLAS                    ⌄
        leader · kimi-k3 · 2m14s
```

- Status dot (SDK StatusDot) — derivation in §2.4.
- Avatar: initial tile with the member's accent color (§7.3). No image fetches.
- Line 1: display name. Line 2: `role · model · live duration`.
- Chevron expands to the detail card (§2.3). Row click selects the agent and
  filters nothing — selection only drives the expanded detail and the
  composer's default target.

### 2.3 Agent detail (expanded, in-panel accordion)

- Full model triple (provider / model / context mode) — read-only display from
  the member record; changing it goes through the existing `HiveModelSubmenu`
  (plugin.js:1651) which already calls `model.options` + `/api/model/set`
  (plugin.js:1458-1474). Do not rebuild model picking.
- Current task: the member's open in-room work items from `$hiveTasks`
  (`owner === member.name`, status open/submitted — state machine at
  plugin.js:561-626).
- Execution duration: live timer from the member's open-turn start timestamp
  (see §2.4); resets when the turn folds.
- Actions row (all verified):
  - **Stop** → `hiveStopMember` → `session.interrupt` (plugin.js:1530-1536).
  - **View session** → `host.navigate` to the native sessions pane
    (`host.navigate` is runtime-proven at plugin.js:1770; the native pane id
    `sessions` is in the verified pane list). The plugin does NOT render a
    foreign transcript inline in Phase 1 — `session.events.since` replay is
    registered but not plugin-proven; see NEEDS SPIKE S1.
  - **Mute / context mode / fresh context / remove** → existing roster-chip
    actions (plugin.js:1719-1792), moved here unchanged.
- Pause/active toggle: **OMITTED** — there is no verified "pause session" RPC;
  per PLAN.md rule 5 (no fake functionality) the control does not exist rather
  than existing disabled. Stop + re-prompt is the honest equivalent.

### 2.4 Status derivation (pure, testable)

Member status is DERIVED from the event stream, never stored. One pure function
(home in the CORE slice so test.cjs covers it):

```
hiveMemberStatus(member, openTurn, lastError, now) ->
  'offline'   if !member.sessionId
  'error'     if lastError unresolved for this session (clears on next turn start)
  'working'   if openTurn has an open tool call (tool.start w/o tool.complete)
  'thinking'  if openTurn has thinking/reasoning deltas since last message.delta
  'busy'      if openTurn exists (message.start seen, not yet folded)
  'idle'      otherwise
```

Event inputs are exactly the verified subscriptions already wired at
plugin.js:2547-2606 (`message.start/delta/complete`, `thinking.delta`,
`reasoning.delta`, `tool.start/complete`, `error`). No new event types needed.
Status label + StatusDot color map: busy=accent, working=accent, thinking=muted
accent, idle=muted, error=error var, offline=disabled var (all `var(--ui-*)`).

### 2.5 Team panel footer

"Add member" button reusing `HiveAddMember` (plugin.js:2300). Cap messaging
(member limit 10, plugin.js:73/1383) surfaces as a disabled button + tooltip,
reusing the existing cap check.

---

## 3. Center panel — Conversation

### 3.1 Timeline model

Chronological flat timeline is the Phase 1 default view. The existing grouped
mode (`HiveGroupedTimeline`, plugin.js:1985) is KEPT as a toggle
(`HiveTimelineModeToggle`, plugin.js:2050) — it costs nothing to retain and is
covered by existing behavior. Timeline entries remain the `$hiveTimeline` atom,
persisted sliced to last 120 (plugin.js:1593) — the cap stays; §8.2 covers
in-memory batching on top of it.

### 3.2 Message kinds → card types

Every visual card maps to a real event source. The mapping table (§3.5) is
normative; this is the card inventory:

| Card | Renders | Existing basis |
|---|---|---|
| AgentMessage | scrubbed prose from a member turn | `HiveMemberTone` (plugin.js:1792) |
| DirectedMessage | AgentMessage + "→ @target" header chip | coordination parse (plugin.js:282) already extracts targets |
| UserMessage | user prose, right-aligned accent | existing user rows in timeline |
| ToolEvent | collapsed one-liner "tool.name(args…)", expandable to full payload | live activity spine in `HiveTurnRow` (plugin.js:1829) |
| TaskCard | "[task @x] title" assignment card | work-item parse (plugin.js:518) + `$hiveTasks` diff |
| DoneCard | submission card w/ artifact excerpt | `[done #id]` application (plugin.js:573-583) |
| ReviewCard | review request / verdict (pass=success, fail=error accent) | `[review …]` / `[verdict …]` (plugin.js:585-626) |
| ErrorCard | error event payload, error accent, dismissible | `error` event guard (plugin.js:2582-2596) |
| SystemCard | routing suppressions, roster changes, join/leave | existing system rows from `hiveRunPlan` (plugin.js:1079-1083) |

Markers are scrubbed before render by `hiveScrubMarkers` (plugin.js:539) —
unchanged. The cards above render STRUCTURED entries derived from the marker
parse, so a turn that was pure markers produces a TaskCard/etc., not an empty
bubble (that is existing behavior; the design makes it explicit).

### 3.3 Composer

Reuse `HiveComposer` (plugin.js:2083-2124) wholesale: @-mention autocomplete
against the roster, grammar hint chips, send routing through
`hiveRouteUserPost` (plugin.js:401) so the user obeys the same
`hivePlanDeliveries` policy (plugin.js:641) as agents. Phase 1 changes are
presentational only (docked at center-column bottom, full-width input, send
button + target chip).

Stop-generation: when any member has an open turn, the composer shows a Stop
button → `hiveStopMember` for the selected/streaming member (same verified
`session.interrupt` path).

### 3.4 Per-message affordances

- Timestamp on hover (entry `ts`; already on every timeline entry).
- Copy action: `navigator.clipboard.writeText` of the scrubbed text (no SDK
  dependency; clipboard API is available in the Electron renderer — used by
  standard web apps; flag: if the desktop shell restricts it, fall back to the
  SDK clipboard helper IF one exists in the SDK component list — otherwise
  selection-only. Labeled NEEDS SPIKE S2, one-line check.)
- Markdown/code: existing light renderer `hiveRenderText`/`hiveInline`
  (plugin.js:977/959 — fenced code, bold, inline code, no raw HTML). Phase 1
  does not extend the grammar.
- Auto-scroll: `hiveUseFollowScroll` unchanged (§1.4).

### 3.5 Event → UI-card mapping table (normative)

| Backend source (verified) | Derivation | UI card |
|---|---|---|
| `message.start` (events.py:132) | open turn for session → member | open AgentMessage bubble (streaming) |
| `message.delta` (events.py:145) | append to open bubble | streaming text |
| `thinking.delta` / `reasoning.delta` (events.py:146/148) | openTurn.thinking | ThinkingCard inline (collapsed "Thinking…") |
| `tool.start` / `tool.complete` (events.py:299/318) | openTurn.tools[] | ToolEvent row (live → done state) |
| `message.complete` (events.py:232) | fold turn; parse markers | finalize bubble + emit Task/Done/Review cards per §3.2 |
| `error` (events.py:117) | lastError[session] | ErrorCard + member status=error |
| coordination markers `[to @x] [ask @x] [@x] [all]` (plugin.js:282) | scrub + target header | DirectedMessage header chip |
| work markers `[task]/[done]/[review]/[verdict]` (plugin.js:518) | `hiveApplyWorkItems` (561) state diff | TaskCard / DoneCard / ReviewCard |
| scratch markers `[scratchpad…]` (plugin.js:435) | `$hiveScratch` update | no timeline card; Scratchpad badge dot |
| `hivePlanDeliveries` suppressions (plugin.js:1079-1083) | already system rows | SystemCard |
| roster mint/remove (plugin.js:1381/1415) | join/leave notes already emitted | SystemCard |
| `projects.changed` (events.py:756) | refresh project label | toolbar re-render (no card) |
| `approval.cancelled` (events.py:442) | remove pending row | Approvals tab row removal |

Dead subscriptions stay dead: `tool.error` and `assistant.completed` (F2/F3) —
guards remain, no card depends on them.

---

## 4. Right panel — Tabs

SDK Tabs component, five tabs. Tab badges show live counts (open tasks, pending
approvals). Panel state (active tab) persists in `hive.v2` (one new key in the
existing blob — same storage key, no migration needed).

### 4.1 Tasks tab

Source of truth: `$hiveTasks` (in-room work items — the ONLY task state the
plugin owns). Each row:

- `#id` + title, owner chip, reviewer chip, StatusBadge, created `ts`,
  duration (now − ts while open), artifact excerpt when submitted, fail reason
  when failed.

Status mapping (REAL — from `hiveApplyWorkItems`, plugin.js:561-626):

| UI status | Backing state |
|---|---|
| OPEN | `status: 'open'` |
| IN REVIEW | `status: 'submitted'` (artifact present, awaiting verdict) |
| PASSED | `status: 'passed'` |
| FAILED | `status: 'failed'` (routes back to owner; re-`[done]` returns to submitted) |

The brief's BACKLOG→CANCELLED ladder is the NATIVE Kanban ladder. Native kanban
has **no RPC/HTTP surface for desktop plugins** (ARCHITECTURE.md §2 Kanban —
UNSUPPORTED direct). Therefore:

- Tasks tab shows in-room items with the four real statuses above.
- A "Board" section header with a read-only note: "Durable tasks live in native
  Kanban (board `team`). Ask an agent: `@atlas show the board`." — the agent's
  own kanban_* tools answer through the conversation (VERIFIED agent-relay
  path, ARCHITECTURE.md §2). Any BACKLOG/READY/RUNNING/… labels appear only
  inside agent messages, never as plugin-computed state.
- Dependencies, branch/worktree link, error reason: **display-only, Phase 4**
  (kanban adapter). Phase 1 renders no fake columns for them. In-room items
  have no dependency graph — stating so in the empty-state copy is the honest
  UI.

### 4.2 Activity tab

A filtered mirror of the timeline: only ToolEvent, TaskCard, DoneCard,
ReviewCard, ErrorCard, SystemCard entries (no prose bubbles). Read-only,
chronological, dense rows. Purpose: answer "what happened while I was away"
without scrolling chat. Pure derivation from `$hiveTimeline` — no new state.

### 4.3 Files tab

- Project folders from `projects.get`/`projects.tree` (registered + app-used;
  plugin-context smoke test pending → flagged S3). Render folder list with
  primary badge.
- Row action: "Open in Files" → `host.navigate` to the native `files` pane
  (verified pane id; navigate mechanism runtime-proven). The plugin does NOT
  embed a file browser.
- If S3 fails, the tab degrades to a single button linking to the native files
  pane + the project's `primary_path` string (available from `projects.for_cwd`
  fallback or the room's `$hiveCwd`). No blank tab.

### 4.4 Approvals tab

- Per-member pending approvals: poll `approval.pending` per member `sessionId`
  on a 5s interval via React Query (app's query client is available per the
  SDK facts). RPC registered (methods_prompt.py:1238) but not yet called from
  this plugin → flagged S4 (smoke test before build of this tab).
- Respond: `approval.respond` (methods_prompt.py:1258). Choices rendered
  verbatim from the server-computed choice set (once/session/always/deny) —
  the plugin never invents choices.
- The app's native approval modal still owns live push (server.py:818); our
  rows are a convenience mirror. Copy in the tab header says so, so a double
  prompt never reads as a bug.
- Empty state: "No pending approvals." Toolbar badge counts total pending
  across members.
- If S4 fails: tab renders per-member "approve in the native prompt" note with
  a disabled mirror, per PLAN.md rule 5.

### 4.5 Workflow tab

- Runs list: `GET /api/plugins/hermes-workflows/runs` through
  `window.hermesDesktop.api` (bridge forwards arbitrary `/api/*`; mount
  verified at web_server_dashboard.py:852,1043; cross-plugin call
  PLAUSIBLE-NEEDS-TEST → flagged S5).
- Row: run id, status, started, current node. Gate release stays on the native
  page — row action "Open" → `host.navigate('/workflows')` (VERIFIED).
- If S5 fails: tab is a deep-link card to `/workflows` only. No re-implemented
  run rendering, no engine (PLAN.md source-of-truth: Workflows owns workflows).

---

## 5. Top toolbar

Left → right:

1. **Project selector** — dropdown from `projects.list`; selection calls
   `projects.set_active` and stamps `session.create` `cwd` for new members
   from the project's primary path. `projects.for_cwd` reconciles on load.
   All registered + app-used; plugin-context smoke test = S3 (shared with
   Files tab). Display: project name + `git branch` (branch comes from
   `projects.for_cwd` payload `{project, cwd, branch}`, methods_projects.py
   :123-130) + primary path (truncated, title attr full).
   Phase 1 scope note: switching project re-labels the room and sets cwd for
   FUTURE member sessions; per-project state namespacing (hive.v2 split) is
   Phase 2 by design (ARCHITECTURE.md risk 5) — the selector must NOT pretend
   to switch history. Toolbar tooltip states this.
2. **Team selector** — roster presets stored plugin-locally in `hive.v2`
   (`teams: [{name, members:[{profile, model…}]}]`). Applying a preset mints
   missing members via the existing `hiveMintMember` path. Pure plugin state;
   no backend dependency. (Phase 1 minimum: one "current room" entry + save/
   load preset; editing UX is a follow-up.)
3. **Room controls** — Stop all (loops verified `session.interrupt`),
   Reset room (`hiveResetRoom`, plugin.js:1544, with the existing inline
   confirm popover pattern from `HiveResetButton`, plugin.js:2201).
   No "pause" control (no such RPC — §2.3).
4. **Active workers** — count of members with status busy/thinking/working,
   derived from §2.4 (pure).
5. **Approvals badge** — total pending from §4.4 polling; click opens right
   panel → Approvals tab. Hidden when zero (or when S4 fails).
6. **Settings** — existing `HiveRoomMenu` (plugin.js:2226: swarm toggle) +
   Scratchpad toggle (plugin.js:2465-2482 pattern), moved into a dropdown.

---

## 6. Bottom area

Collapsible strip (default collapsed; toggle in toolbar Settings and a chevron
on the strip edge). Contains ONLY link-cards, never embedded widgets:

- **Terminal** → `host.navigate` to the native `terminal` pane. (Native pane
  exists; embedding a terminal is explicitly out — verified constraint.)
- **Logs** → native `logs` pane link.
- **Sessions** → native `sessions` pane link.
- **Review** → native `review` pane link.
- Git changes: **OMITTED from the dock** — no verified RPC returns a git diff
  for a path; the native `review` pane owns that surface. A fake summary would
  violate PLAN.md rule 5.

Collapsed height 0, expanded ~160px. No timers, no subscriptions — pure links,
so nothing to clean up.

---

## 7. Visual design

### 7.1 Theme

- Dark-mode-first, but every color is a theme var: `var(--ui-bg)`,
  `var(--ui-bg-elevated)`, `var(--ui-border)`, `var(--ui-text)`,
  `var(--ui-text-muted)`, `var(--ui-accent)`, `var(--ui-error)`,
  `var(--ui-success)`, etc. — exact names taken from the SDK's documented
  `--ui-*` set; FORGE must grep the SDK styles for the canonical names and use
  only those (no invented var names, no hex anywhere).
- Light mode therefore works by construction (vars flip with the app theme).

### 7.2 Components

Native SDK components wherever they exist: Button, Badge, StatusDot, Tabs,
ScrollArea, Tooltip, Popover/Menu (for toolbar dropdowns and agent detail
actions), Input (composer), Card (right-panel rows). Custom CSS only for
layout (the grid) and card compositions.

### 7.3 Agent accents

Each member gets a stable accent derived by hashing the member NAME into a
small palette of theme-safe hues — implemented as `color-mix(in srgb,
var(--ui-accent) X%, <hue-rotate>)`? No: color-mix support in the shell is
unverified. Instead: N predefined classes `.ts-agent-0..7` each mapping to an
approved `--ui-*` accent variant if the SDK exposes them, else to
`var(--ui-accent)` with different border-left treatments (shape/weight, not
color). Final palette choice is FORGE's first task against the actual SDK var
list; if only one accent var exists, differentiation is by avatar glyph +
border pattern, never hardcoded color. (NEEDS SPIKE S6: enumerate the SDK's
full `--ui-*` var list from the installed package before styling.)

### 7.4 Style scoping

All selectors prefixed `.ts-` and nested under the page root class
`.ts-workspace`; the plugin injects one `<style>` element on register and
removes it in `ctx.onDispose` (extending the existing disposer list at
plugin.js:2526+/2608-2611). No global selectors (`*`, `body`, bare element
tags) — other views and plugins must be pixel-identical with buzz-hive loaded.

### 7.5 Motion

Opacity/transform transitions ≤150ms on hover and tab switch only. No layout
animations, no streaming-text animations (deltas render as they arrive, as
today).

---

## 8. State model

### 8.1 Atoms (extend, don't fork)

Keep every existing atom (plugin.js:95-133). New atoms, all plugin-local:

| Atom | Contents | Persisted? |
|---|---|---|
| `$tsActiveProject` | `{id, slug, name, primaryPath, branch} \| null` | yes (hive.v2) |
| `$tsRightTab` | 'tasks'/'activity'/'files'/'approvals'/'workflow' | yes |
| `$tsAgentSelected` | member name or null | no |
| `$tsAgentExpanded` | replaces/extends `$hiveAgentExpanded` for the new panel | yes (reuse existing key semantics) |
| `$tsDockOpen` | bool | yes |
| `$tsApprovals` | `{[sessionId]: pending[]}` poll cache | no (5s TTL) |
| `$tsWorkflowRuns` | last runs fetch | no (30s TTL) |
| `$tsTeams` | roster presets | yes (hive.v2 `teams` key) |

Roster, timeline, tasks, scratch, mission: unchanged atoms, unchanged
`hivePersist` shape plus the new keys (single `hive.v2` blob, plugin.js:1572 —
adding keys to the existing blob is backward compatible; `hiveBootHydrate`
(plugin.js:1597) gains null-defaults for the new keys).

### 8.2 Timeline batching & memory

- `message.delta` events are high-frequency. Batch into the open bubble with a
  ~50ms coalescing window (requestAnimationFrame or setTimeout — ONE timer per
  open turn, cleared on fold). This is the only new timer in Phase 1.
- Turn fold (message.complete) flushes pending deltas synchronously.
- `$hiveTimeline` stays capped (last 120 persisted, plugin.js:1593); in-memory
  cap raised to 500 entries with the same slice on persist. Tool payloads in
  ToolEvent entries store at most 2KB of args/result text (truncate with
  ellipsis) so a long session cannot balloon memory.
- Status derivation (§2.4) is computed per render from open-turn records, not
  stored — no drift possible.

### 8.3 Cleanup on unload

Extend the existing `ctx.onDispose` disposer list (plugin.js:2608-2611):

1. All event subscriptions (already disposed — unchanged).
2. NEW: the delta-batching timer(s) — cleared.
3. NEW: React Query polling for approvals/workflows — cancelled via query
   client removal of the plugin's query keys (the app's client owns cache
   teardown; the plugin stops issuing).
4. NEW: injected `<style>` element removed (§7.4).
5. `hivePersist` flush of UI prefs (right tab, dock open, selected agent).

No polling loops besides React Query intervals; no global listeners outside
`host.onEvent`. Verification: load → use → disable plugin → re-enable: no
duplicate rows, no leaked timers (SENTRY checks via devtools).

---

## 9. Component tree

Root replaces `HivePage` internals; the ROUTES_AREA registration
(plugin.js:2529-2533) and the disposer wiring stay.

```
HiveWorkspacePage                      (page root .ts-workspace; grid; atoms)
├─ TsToolbar
│  ├─ TsProjectSelect                  (projects.list/for_cwd/set_active — S3)
│  ├─ TsTeamPresetMenu                 ($tsTeams; mints via hiveMintMember)
│  ├─ TsRoomControls                   (stop all; reset w/ confirm — reuse 2201)
│  ├─ TsWorkersBadge                   (derived count §2.4)
│  ├─ TsApprovalsBadge                 (poll count §4.4 — S4)
│  └─ TsSettingsMenu                   (HiveRoomMenu 2226 + scratch toggle)
├─ TsTeamPanel
│  ├─ TsAgentRow (per member)
│  │  ├─ StatusDot                     (SDK)
│  │  ├─ TsAgentAvatar                 (initial tile, §7.3)
│  │  └─ TsAgentMeta                   (role · model · live duration)
│  ├─ TsAgentDetail (expanded accordion; reuses HiveModelSubmenu 1651,
│  │                 context-mode + roster actions 1719-1792)
│  └─ TsAddMemberButton                (reuse HiveAddMember 2300)
├─ TsConversationPanel
│  ├─ TsTimelineHeader                 (mode toggle — reuse 2050; search input:
│  │                                   client-side filter, no backend)
│  ├─ TsTimeline (ScrollArea; follow-scroll 1952)
│  │  ├─ TsAgentMessage                (from HiveMemberTone 1792)
│  │  ├─ TsDirectedMessage             (agent→agent header chip)
│  │  ├─ TsToolEvent                   (from HiveTurnRow spine 1829)
│  │  ├─ TsTaskCard / TsDoneCard / TsReviewCard
│  │  ├─ TsErrorCard / TsSystemCard
│  │  └─ (grouped mode: HiveGroupedTimeline 1985 kept as-is)
│  └─ TsComposer                       (restyled HiveComposer 2083-2124 +
│                                      Stop button → hiveStopMember)
├─ TsRightPanel (SDK Tabs)
│  ├─ TsTasksTab                       ($hiveTasks rows, §4.1 mapping)
│  ├─ TsActivityTab                    (filtered mirror §4.2)
│  ├─ TsFilesTab                       (projects.get/tree — S3; navigate links)
│  ├─ TsApprovalsTab                   (approval.pending/respond — S4)
│  └─ TsWorkflowTab                    (bridge GET runs — S5; /workflows link)
└─ TsBottomDock                        (link cards to native panes, §6)
```

Pure helpers promoted INTO the CORE-BEGIN/CORE-END slice (plugin.js:138/941)
so test.cjs covers them without a DOM:

- `hiveMemberStatus(...)` (§2.4)
- `hiveTaskStatusLabel(task)` → OPEN/IN REVIEW/PASSED/FAILED (§4.1)
- `hiveTimelineToCards(entries)` — event/entry → card-type mapping (§3.5) as
  data, so the render layer is a dumb switch
- `hiveTruncatePayload(text, 2048)` (§8.2)
- `hiveBatchDeltas` (pure reducer form of the coalescer; the timer stays in
  the shell layer)

Data flow: gateway events → existing handlers (2547-2606) → atoms → React.
New backend reads (projects/approvals/workflows) flow through React Query with
the app client, keyed per project/session; nothing bypasses `host.request` or
the bridge. One direction only — UI never writes except through the verified
mutations (prompt.submit, session.*, model set, approval.respond).

---

## 10. Acceptance checklist (SENTRY verifies)

Rendering & layout:
- [ ] A1. Three columns render at 1440px window: team 240 / center flex /
      right 320, toolbar 44px, no page-level scrollbar.
- [ ] A2. At 1000px the right panel is an icon rail and its tabs open as an
      overlay; at 800px the team panel is an avatar rail; at 550px
      single-column with toolbar toggles. All content reachable at every size.
- [ ] A3. Light and dark app themes both render correctly with zero hardcoded
      colors (dev tools: no hex/rgb literals in the plugin's injected style).

Function:
- [ ] A4. Every agent row shows live status through a real turn: idle → busy/
      thinking/working → idle, plus error state on a forced failure; Stop
      interrupts the session (native sessions pane confirms).
- [ ] A5. Timeline shows all §3.2 card kinds produced by a scripted two-agent
      exchange using the real marker grammar ([task], [done], [review],
      [verdict], [to @x]); markers never appear as raw text.
- [ ] A6. Composer @-mention autocomplete works; user posts route through the
      existing delivery policy (suppression rows appear as SystemCards).
- [ ] A7. Tasks tab statuses exactly mirror `$hiveTasks` state (OPEN /
      IN REVIEW / PASSED / FAILED); a [verdict fail] routes work back and the
      row returns to OPEN on resubmission.
- [ ] A8. Approvals tab lists a real pending approval (trigger one in a member
      session) and responding from the tab resolves it — OR the tab shows its
      documented degraded state if S4 fails.
- [ ] A9. Files/Workflow tabs either show real data (S3/S5 pass) or their
      documented link-only degraded states. No fake rows anywhere.

Non-regression:
- [ ] A10. `node test.cjs` → ALL PASS, 193 baseline tests + new pure-logic
      tests (status derivation, card mapping, truncation, batching reducer).
- [ ] A11. Existing Hive comms unchanged: marker relay, hop budget, fan-out
      cap, queued chips, scratchpad, mission — verified by the same scripted
      exchange as A5 plus the existing test suite.
- [ ] A12. Console clean: no errors/warnings from the plugin across load →
      exercise → disable → re-enable; no duplicate timeline rows after
      re-enable (cleanup §8.3 works).
- [ ] A13. Other plugins and native panes unaffected: with the plugin loaded,
      /workflows page, native terminal, and files pane render and behave as
      before (style scoping §7.4).

Spike gates (FORGE runs BEFORE building the dependent piece; failure flips the
piece to its documented degraded state, not to an invention):
- S1. `session.events.since` replay from plugin context (informs Phase 7 view-
      session inline; Phase 1 uses navigate regardless).
- S2. Renderer clipboard write from the plugin page.
- S3. `projects.list/for_cwd/tree/set_active` from plugin context.
- S4. `approval.pending/respond` from plugin context.
- S5. `GET /api/plugins/hermes-workflows/runs` via `window.hermesDesktop.api`.
- S6. Enumerate the SDK's actual `--ui-*` var list + native component exports.

---

## Acceptance bullets the verified API surface could NOT cover (honest gaps)

1. **Native kanban task board in the UI** — no RPC/HTTP from desktop plugins
   (UNSUPPORTED). Phase 1 shows in-room tasks only; kanban is agent-relay +
   Phase 4 adapter. Any kanban status ladder in-plugin would be fabricated.
2. **Live approval push** — server→client requests are owned by the app
   (server.py:818). Polling is the only plugin path.
3. **Pause/resume agent** — no such RPC exists. Stop + re-prompt only.
4. **Embedded terminal / git-diff view** — native panes own both; the plugin
   links out. No verified API renders either inside a plugin page.
5. **Cross-project conversation history** — single `hive.v2` blob until the
   Phase 2 namespacing migration (ARCHITECTURE.md risk 5). The toolbar project
   selector re-labels + sets cwd; it does not and must not imply history
   switching in Phase 1.
