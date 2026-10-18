# Hive Team Studio — P1.5 redesign contract (token-level, surgical)

**Implements the findings in `TEAM_WORKSPACE_P1.5-CRITIQUE.md` (verdict REVISE 41/100).**
**Target revision:** `a6872c2`. **Patch surface:** `plugin.js` only — the injected `HIVE_TS_CSS` string
(one place) and the `Ts*` render functions + `HIVE_T` tokens. **No new files, no architecture change, no
storage change.** **Patch count: 24** (P-01…P-24; 9 are CSS-block edits, 15 are JSX/token-value edits).

**Taste direction (single primary, declared per taste-foundations §"Name one primary direction"):**
**operational** — density, stable dimensions, restrained colour, one accent with a budget — with one
explicitly borrowed **premium** layer (a real type scale, hairline borders, crafted empty states,
purposeful motion). Every token below is a decision, not a default.

---

## 1. Token set (the whole design system in one block)

Add to the head of `HIVE_TS_CSS` (replacing the two ad-hoc width vars). Everything downstream references
these; no call site may invent a value.

```css
.ts-workspace{
  /* geometry */
  --ts-team-w:208px; --ts-right-w:280px; --ts-lead-w:280px;
  --ts-toolbar-h:44px; --ts-strip-h:32px; --ts-dock-h:36px; --ts-row-h:40px; --ts-rail-w:44px;
  /* space: one scale, 4px base */
  --ts-s1:4px; --ts-s2:8px; --ts-s3:12px; --ts-s4:16px; --ts-s5:24px;
  /* type: 6 steps, two of them non-reading */
  --ts-f-micro:10px;  --ts-lh-micro:14px;   /* uppercase micro labels, badges only  */
  --ts-f-meta:11px;   --ts-lh-meta:16px;
  --ts-f-sm:12px;     --ts-lh-sm:18px;
  --ts-f-body:13px;   --ts-lh-body:20px;
  --ts-f-lead:15px;   --ts-lh-lead:22px;
  --ts-f-display:20px;--ts-lh-display:28px;
  /* radii: one control radius, one circle */
  --ts-r:6px; --ts-r-pill:999px;
  /* motion */
  --ts-dur:160ms; --ts-ease:cubic-bezier(.2,.8,.2,1);
  /* one accent budget: primary action, selection, focus. Nothing else. */
  --ts-accent:var(--ui-accent);
  /* semantic states, theme-aware (see §3) */
  --ts-ok:var(--ui-green); --ts-bad:var(--ui-red);
  --ts-warn:#b1730f; --ts-info:#1f5fd0; --ts-idle:var(--ui-text-tertiary);
}
.dark .ts-workspace{ --ts-warn:#e0a94c; --ts-info:#7aa2ff; }
/* CJK: the Latin 13px body is below the CJK floor of 14px, so body copy steps up
   when the app is set to a CJK language. */
[lang^="ko"] .ts-workspace,[lang^="ja"] .ts-workspace,[lang^="zh"] .ts-workspace{
  --ts-f-body:14px; --ts-lh-body:22px; --ts-f-meta:12px; --ts-lh-meta:18px;
}
@media (prefers-reduced-motion:reduce){
  .ts-workspace *{transition-duration:.01ms!important;animation-duration:.01ms!important}
}
.ts-workspace :focus-visible{outline:2px solid var(--ts-accent);outline-offset:1px;border-radius:var(--ts-r)}
```

**Type roles (binding):** `micro` = uppercase section labels, badges, counts only. `meta` = timestamps,
model/status lines, hints. `sm` = secondary reading text, tab labels, control labels. `body` = timeline
body, work-item titles, empty-state copy. `lead` = the room title in the toolbar. `display` = the empty
room heading only. **No new size may appear in a capture; the census must return exactly these six.**

## 2. Patch list

Each patch states: **where (current line)**, **before → after**, **what it fixes**, **how it is checked**.
Line numbers are `plugin.js` at `a6872c2`.

### P-01 — Shell grid: content gets the width (F-05, F-01)
`plugin.js:1947` `.ts-workspace{…grid-template-columns:var(--ts-team-w) minmax(420px,1fr) var(--ts-right-w)…}`
→ keep the declaration but with the new vars, and add the degradation ladder as one media-query block:

```css
@media (max-width:1240px){.ts-workspace{--ts-team-w:208px;--ts-right-w:240px}}
@media (max-width:1100px){
  /* degrade the ROSTER first (it degrades honestly to avatars); keep Work labelled */
  .ts-workspace{--ts-team-w:56px;--ts-right-w:240px}
  .ts-workspace > .ts-col-team .ts-team-body{display:none}
  .ts-workspace > .ts-col-team .ts-strip-label{display:none}
}
@media (max-width:880px){.ts-workspace{--ts-team-w:48px;--ts-right-w:40px}}
@media (max-width:600px){.ts-workspace{grid-template-columns:minmax(0,1fr)}}
```
Check: at 1000 the Work column keeps all five labels (wrapped tabstrip, P-09); at 700 no element may
report `scrollWidth > clientWidth`.

### P-02 — Team strip: label, count, and an honest count (F-02, F-05)
`TsTeamPanel` strip (`plugin.js:3305–3309`) currently renders `Team` + `${members.length + 1}/11`.
→ `<span class="ts-strip-label">Team</span>`, right side becomes a **role summary**, not a fake capacity:
`members.length ? `${members.length} agent(s)`` and, when a member is busy, `· 1 working`. The `N/11`
denominator is an internal cap (`HIVE_MAX_MEMBERS = 10`) and means nothing to a user.
Check: capture at 1512 shows `Team … 3 agents · 1 working`.

### P-03 — Roster row anatomy (F-06, F-08, F-13)
`TsAgentRow` (`plugin.js:3263–3295`) → three-line-safe anatomy at `--ts-row-h:40px`:
row = `24px avatar (radius var(--ts-r)) · name line · meta line · trailing affordance`. The name line
carries, in order: status dot (6px, `--ts-ok`/`--ts-warn`/`--ts-bad`/`--ts-idle`), `@profile` in
`--ts-f-sm/600`, a **leader chip** (`-ts-chip`, `--ts-f-micro`, `--ts-warn` text on a 10 % tint) when
`m.leader`, a browser glyph when `m.browser`. The meta line carries `model · last activity · duration`,
`--ts-f-meta/--ts-f-idle`. The trailing affordance is `▸/▾` at `--ts-f-meta`.
Check: leader chip visible in `p15-1512-agent-detail-dark.png` recapture; row height 40px in measurements.

### P-04 — Leader as a first-class role (F-08, F-09) — *the ATLAS finding*
Three sub-edits:
1. `HIVE_T`/`TsAgentDetail` action (`plugin.js:3253`): relabel to `Pin to top` / `Unpin`, title
   *"Pins this member to the top of the roster. Coordination roles arrive in Phase 3."* (The current
   label promises a role the flag does not have; its own tooltip already admits it.)
2. **Set it at add-time**: the add-agent popover (P-22) gains a per-row pin toggle and the row is pinned
   on pick; the roster-strip `+` is the same path.
3. **Sort key split** (`hiveOrderMembers`, `plugin.js:1184–1191`): `browser` must NOT share the leader
   rank — today granting browser access silently reorders the roster. New order: `leader` first, then
   a stable `order` (persisted position, defaulting to insertion order), then profile name.
4. **Default on room creation: no implicit leader.** An implicit leader would imply coordination the flag
   does not have; instead the empty state answers "who leads?" explicitly (P-17) and the pin is one tap
   once a member exists.
Check: unit rows exist for the new comparator (`test.cjs`, CORE slice — pure function, testable);
`git diff` shows no new storage key.

### P-05 — Spacing rhythm (F-12)
Everywhere in `HIVE_TS_CSS`: `.ts-row{padding:var(--ts-s2) var(--ts-s3)}`, `.ts-strip/.ts-dock{padding:var(--ts-s1) var(--ts-s3)}`,
`.ts-toolbar{padding:0 var(--ts-s3)}`, all `gap:.375rem` → `gap:var(--ts-s2)`; `.ts-card{padding:var(--ts-s2) var(--ts-s3)}`.
Drops the 6px base. Check: padding census (measurements) returns ≤5 distinct values, all multiples of 4.

### P-06 — Type scale adopted at the source (F-03, F-15)
`HIVE_T` (`plugin.js:90–98`) becomes:
```js
const HIVE_T = Object.freeze({
  dot: { width: 6, height: 6, borderRadius: 999, flexShrink: 0 },
  micro: { fontSize: 10, lineHeight: '14px' },
  xs:    { fontSize: 11, lineHeight: '16px' },   // kept name: every existing xs call site
  sm:    { fontSize: 12, lineHeight: '18px' },
  md:    { fontSize: 13, lineHeight: '20px' },
  lg:    { fontSize: 15, lineHeight: '22px' },
  wrap:  { overflowWrap: 'anywhere', wordBreak: 'break-word' },
  wrapWide: { overflowWrap: 'anywhere', wordBreak: 'break-word' }
})
```
Then: timeline card body `HIVE_T.wrap` → `md`; `TsTaskRow`/work-item titles → `md`; agent-detail metadata
stays `xs` (now 11); strip labels keep `text-[0.65rem]` → move to `HIVE_T.micro`; the `[to @name]` chips
and hint line `xs`. **Reserve 10px for non-reading chrome** (labels, badges, counts, chips).
Check: type census returns exactly 10/11/12/13/15/20 px; 10px appears only on label/badge nodes.

### P-07 — Small-width columns hide whole things (F-02)
At `--ts-team-w:56px`/`48px`: hide `.ts-strip-label` and the dock's count text (P-02 already gated the
label), and render the strip as `avatar-count badge` (`N` in a `--ts-r` box, `--ts-f-micro`). The dock at
those widths shows only the `+` button (`aria-label="Add agent"`).
Check: at 700 nothing reports `scrollWidth > clientWidth`; recapture shows a clean avatar column.

### P-08 — Rail: icon + persistent caption (F-01)
`TsRightRail` (`plugin.js:3653–3668`): button children become `jsx(t.icon,{size:14})` (a `TS_RIGHT_TABS`
entry gains `icon: icons.ListChecks|Activity|FolderOpen|ShieldCheck|Zap`), plus a `10px` rotated caption
at the rail's top: `<span class="ts-rail-title">WORK</span>` with `writing-mode:vertical-rl`.
`button` keeps `title` + `aria-label`.
Check: at 1000/880 the rail shows icons + a visible `WORK` caption; no two-letter labels anywhere.

### P-09 — Tabstrip survives to 880 (F-01)
`TsRightPanel` tabstrip (`plugin.js:3684–3693`): `TabsList` gets `flex-wrap:wrap;height:auto;min-height:28px`
via class `ts-tabstrip`; at `--ts-right-w:240px` the five labels wrap to two rows instead of collapsing
the body to `display:none`. The `display:none` rule in the ≤1100 media query is deleted; only ≤880 falls
back to the rail + sheet.
Check: at 1000 the right column is 240px with all five labels visible and a body region present.

### P-10 — Toolbar hierarchy (F-03, F-05)
`TsToolbar` (`plugin.js:3188–3213`): left cluster = room title (`--ts-f-lead/600`) + project chip
(`--ts-f-meta`, `--ts-r`, hairline border; when unavailable the chip reads `No project` and is a link to
the native projects pane instead of the dead string "Projects unavailable"); right cluster = workers badge,
approvals badge (only when > 0), settings; then the destructive pair `Stop all` / `Reset` visually
separated by a `1px` divider and the `destructive` variant for `Reset` only. Remove the two icon-only
sheet buttons (the rail P-08 owns that job at ≤880; above it the columns are visible).
Check: recapture 1512 + 1000; toolbar has one lead (title), one chip, one action group.

### P-11 — Agent detail: content first, actions grouped (F-06)
`TsAgentDetail` (`plugin.js:3217–3261`) is rebuilt as:
1. `What it is doing` — `--ts-f-sm/600` label + current work-item title at `--ts-f-body`, **full width on
   its own line** (fixes the 114px truncation), with status + elapsed right-aligned.
2. Metadata collapsed to one line: `model · context · session` at `--ts-f-meta`, plus a `Details`
   disclosure for the rest (removes the duplicated `context`/`model` rows at `:3257–3258`).
3. Actions: `Stop` (`outline`, disabled until busy — it already is), `View session`, then an overflow
   `…` menu holding `Mute · Grant/Release browser · Pin to top · Fresh context`, and `Remove` separated at
   the end in `destructive`. Three visible controls maximum.
Check: recapture agent-detail dark; title not truncated at 208px; ≤3 visible actions.

### P-12 — Work-item row: title on its own line (F-06)
`plugin.js:3241–3245` → line 1 `#id · STATUS`, line 2 title (`--ts-f-sm`, one line, `title` attr),
line 3 duration/owner at `--ts-f-meta` when present. Check: no `truncate` element under 160px.

### P-13 — Bottom dock gets a job (F-16, §6 filler)
`TsBottomDock` (`plugin.js:3709–3735`): closed state renders a compact room status line instead of the
placeholder sentence: `Room · N agents · N open items · last activity 11:56 PM`, with the `Dock` toggle at
the end. Open state keeps the four link-cards, each `--ts-f-sm` with its icon.
Check: recapture; the dock text is data, not a sentence about panes.

### P-14 — Cards: hairline + one elevation rule (F-04, §3.13)
`.ts-card{border:1px solid var(--ui-stroke-secondary);border-radius:var(--ts-r);background:var(--ui-bg-card);padding:var(--ts-s2) var(--ts-s3)}`
plus a single elevation rule for floating surfaces only (`--ts-sheet`, `--ts-addpop`, the mention picker):
`box-shadow:0 8px 24px -12px rgba(0,0,0,.45)`. Light theme gets the same shadow at
`rgba(24,20,40,.14)` via `:root:not(.dark) .ts-workspace`. No shadow on cards, rows, strips or tabs.
Check: light recapture; panels separate by border + one shadow on floaters only.

### P-15 — Radii unified (F-13)
`--ts-r:6px` for cards, controls, inputs, sheets, popovers, chips, tabstrip track (drop the 8px track);
avatars `24px` at `var(--ts-r)`; dots stay circles (`50%`). Check: radius census returns `6px` + `50%`.

### P-16 — Semantic colour ramp, theme-aware (F-04)
Replace every borrow of the theme-invariant tokens (`--ui-yellow/-purple/-orange/-warm`) in
`hiveTaskStatusTone` (`plugin.js:1100–1106`), `:2732`, `:3243`, `:3255` and the relay/error lines with the
plugin's own ramp: `IN REVIEW → var(--ts-warn)`, `PASSED → var(--ts-ok)`, `FAILED → var(--ts-bad)`,
`SUBMITTED → var(--ts-info)`, `BLOCKED/held relay → var(--ts-warn)`, idle → `var(--ts-idle)`.
Both themes are then correct by construction (§1). `--ui-danger/--ui-warning/--ui-success` are never
referenced (verified: 0 references today) and stay that way.
Check: `IN REVIEW` renders `#b1730f` on light and `#e0a94c` on dark; grep shows 0 `--ui-yellow` in tone
functions.

### P-17 — Empty states that teach (F-07, F-14)
- **Room empty** (`TsTimelineBody`, `plugin.js:3429–3431`): a centred block, max 320px:
  `display` heading `This room is empty`; body `You are always in the room. Add an agent to start a crew —
  it will work in the shared session and report back here.`; primary action `+ Add an agent` (opens the
  popover); secondary line `No leader yet — pin a member any time from its row.`
- **Per-tab empties** (Tasks `:3494`, Activity `:3508`, Files `:3513+`, Approvals `:3530+`, Workflow
  `:3590+`): each keeps its honest sentence and gains a heading (`--ts-f-sm/600`) + one action
  (`+ Add an agent` for Tasks, `Open the native Files pane` for Files, `Open the native Workflows page`
  for Workflow). No dashed boxes; use a `1px` hairline block on `--ui-bg-tertiary`.
- **Skeletons** for the fetching tabs: three static `--ts-skel` rows (no animation — Phase 9 budget),
  32px tall, `--ui-bg-tertiary` at 40 %.
Check: recapture `empty`, `tab-tasks`, `tab-files`, `tab-workflow`; every panel body's flat-share drops
below 90 % (measured today: 94 %, 77 %, 95 %, 96 %).

### P-18 — Right panel earns its 280px (F-05, F-16)
Header row above the tabstrip: `Work` (`micro`) + the room's open-item count + `last activity`. The Tasks
body leads with a one-line `Board` card that now *links* to the native Kanban board
(`host.navigate('/kanban')` — verify the route exists at implementation time; if not, keep the honest
sentence but at `--ts-f-meta` and without the "ask an agent" instruction). Below it, the room's work items.
Check: right-panel flat-share for Tasks < 65 %; recapture.

### P-19 — Motion (F-19)
All transitions: `transition:background var(--ts-dur) var(--ts-ease),color var(--ts-dur) var(--ts-ease)`.
No entrance animations, no shimmer, no pulse except the existing busy glyph (which reports state).
Harness/capture note: recapture after motion is settled (single settled frame is what this contract scores).
Check: `HIVE_TS_CSS` contains `var(--ts-dur)` and the `prefers-reduced-motion` block; no other duration.

### P-20 — States on every control (F-14)
`@media (hover:hover)`: `.ts-row:hover{background:var(--ui-row-hover-background)}` (exists),
`.ts-railbutton:hover`, `.ts-linkcard:hover`, `.ts-chip:hover`; `[data-active="true"]` and
`:focus-visible` for all four; `.ts-row[data-selected="true"]` gains the 2px accent edge (P-21).
Check: source review + one hover/focus capture (a browser can be driven for this in the QA round; if not
possible, the QA card must mark hover/focus as source-verified only).

### P-21 — One selection language, two pickers aligned (F-11, F-17, F-18)
- Selected row / active tab / active rail button: `2px` accent edge or a `--ui-bg-tertiary` track, never a
  filled accent slab.
- Mention picker (`plugin.js:2546–2558`): rows use the roster anatomy (dot + `@name` `--ts-f-sm` +
  model `--ts-f-meta`); the active row is `background:var(--ui-bg-tertiary)` with a 2px accent left edge;
  width `min(280px, 100% - var(--ts-s4))` instead of the full column; anchored above the composer (as now).
- **Open on a bare `@`**: `$hiveMentionOpen` becomes `null` (closed) | string (filter, `''` allowed) and
  `matches` computes on `open !== null` (`plugin.js:2465–2468`). Closes F-17 and makes the `[to ` chip
  flow (below) work.
- **Grammar chips start a flow, not a literal**: `[to @name]` / `[ask @name]` insert `[to ` / `[ask ` and
  open the picker with all members; `[all]` inserts `[all] ` (it has no argument)
  (`plugin.js:2450–2454`, `2525–2530`).
Check: recapture mention-open dark; picker ≤280px wide; the first row is marked by an edge, not a fill.

### P-22 — Add-agent popover inside its column, and discoverable (F-10)
- Box: `width:min(232px, calc(var(--ts-team-w) - var(--ts-s4)))`, anchored `inset-inline-start:var(--ts-s2)`;
  per-row pin toggle (P-04); search input sticky at the top; rows keep the dot + `@name` + model anatomy
  at `--ts-f-sm/--ts-f-meta`.
- The dock button label becomes `Add agent` (not `+ Add`) and gains `aria-haspopup`/`aria-expanded`.
- Keep the F-P1-R1 anchor fix (`.ts-addpop{position:absolute;left:0;bottom:100%}`) — the harness measured
  the box at x8→264 in a 240 column; the new width removes the 24px overhang.
Check: measurement reports `.ts-addpop` right edge ≤ column right edge at 1512 and 1000.

### P-23 — Sheets match the columns (F-01)
`.ts-sheet{width:min(320px,80vw)}` and inside a sheet the tabstrip is the wrapped one (P-09); the team
sheet renders the same avatar-only rules as the column when the viewport is ≤880. Check: recapture both
sheets at 1000.

### P-24 — Durable-surface honesty (F-16)
One line in the Tasks body states what the panel is: `This room's work items.` and, if the native board
route exists, a `Kanban board` link. No "ask an agent" instruction in a UI panel. Check: recapture
`tab-tasks`.

## 3. Before/after evidence plan (what FORGE must recapture)

Re-run exactly this (same command, same widths, same states; the harness takes `--state`):

```sh
cd ~/Developer/hive-team-studio/sentry-probe && node p15-render.cjs --dsf=2 && python3 p15-pixels.py
```

| # | capture | must show |
|---|---|---|
| 1 | `p15-1512-full-dark` | new type scale, hairline cards, one accent, no overhang |
| 2 | `p15-1456-full-dark` | live-width parity: roster column readable, Work labelled |
| 3 | `p15-1200-full-dark` | right column 240/264, all five tab labels |
| 4 | `p15-1000-full-dark` | **Work still labelled** (two-row tabstrip), roster degraded to avatars, no clipping |
| 5 | `p15-700-full-dark` | no clipping anywhere (`scrollWidth==clientWidth` for every node), avatar column + count badge |
| 6 | `p15-1280-full-light` | light ramp correct, one shadow on floaters only, `IN REVIEW` amber-on-light readable |
| 7 | `p15-1280-addpop-light` | popover inside the column, correct light chrome |
| 8 | `p15-1512-empty-dark` | designed empty room: heading, one line, `+ Add an agent`, "No leader yet" |
| 9 | `p15-1512-agent-detail-dark` | work-item title untruncated, ≤3 visible actions, leader chip |
| 10 | `p15-1512-addpop-dark` | 232px box inside the column, pin toggle per row |
| 11 | `p15-1512-mention-dark` | ≤280px picker, edge-marked active row, opens on a bare `@` |
| 12 | `p15-1512-tab-{activity,files,workflow}-dark` | each empty/degraded state designed; flat-share < 90 % |
| 13 | `p15-1000-sheet-{team,right}-dark` | sheets mirror the columns |
| 14 | NEW `p15-1512-cjk-dark` | one Korean (or Japanese) render via the app's language setting, body ≥14px, no broken line-height |

**Numeric acceptance (measured, not eyeballed):** type census == {10,11,12,13,15,20} px; padding census
≤5 values all divisible by 4; radius census == {6px, 50 %}; zero elements with `scrollWidth > clientWidth`
at 700/1000/1200/1456/1512; team-column flat-share < 70 % and right-panel < 65 % at 1512 populated;
`IN REVIEW` differs between dark and light captures; `.ts-addpop` right edge ≤ column right edge.
**Then** the QA card re-runs the visual-verdict round against these captures: 90 is the pass line, and
`p15-1512-cjk-dark` plus the hover/focus capture are required for PASS (today's round could not verify
either).

## 4. Guardrails

- **No storage change.** The `hive.v2` blob keeps its shape; P2's `hive.v3:*` scheme (`room:<id>`,
  `global`, `index`, `schema`) is untouched, and this contract adds **no new persisted key**. Any new UI
  state (leader-picker open, disclosure state) is session-local. The roster keeps `leader` as an attribute,
  which is exactly where P2's `hive.v3:global.roster` expects it.
- **Leader semantics stay presentational** until Phase 3; the copy says so (P-04).
- **No new architecture:** one CSS block, the `Ts*` render functions, `HIVE_T`, and the two pure helpers
  (`hiveOrderMembers`, the tone function). `test.cjs`'s CORE slice keeps working; P-04 adds one pure
  comparator, so a test row belongs with it.
- **Not in scope:** the app's own token defects (`--ui-yellow` etc. defined only at `:root`), the SDK
  primitive chrome, and the native Kanban surface. The contract works around the first, never patches it.
- **Patch budget:** 24 patches, of which 9 are CSS-block edits. If FORGE finds a patch needs a 25th file
  or a new module, stop and hand it back — that is an architecture change, not this contract.
