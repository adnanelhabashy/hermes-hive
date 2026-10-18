# Hive Team Studio — P1.5 UX quality pass: critique

**Owner:** SENTRY (design owner for P1.5) · **Revision under review:** `a6872c2` (branch `team-studio`)
**Surface:** `/hive-dev` in `~/.hermes/desktop-plugins/buzz-hive-dev/` (side-by-side copy, byte-equal to
`worktree/plugin.js` after the dev identity rewrites — verified below) · **Product code changed:** none.
**Taste direction claimed:** *operational core, one premium layer* (declared per
`omh-frontend/references/taste-foundations.md` §"Name one primary direction", hybrid brief). The core is an
operational tool: density, stable dimensions, restrained colour. The borrowed layer is the premium one the
user asked for: a deliberate type scale, one accent with a budget, crafted empty states, purposeful motion.
**Verdict: REVISE — 41/100** (rubric table in §8; 90 is the pass line).

---

## 1. Why it "doesn't feel practical" — four causes, each measured

The Phase 1 checklist passed and the UI is still wrong in daily use because the four things below are
*structural*, not cosmetic. None of them is visible to a functional checklist.

**C1 — The shell is a fixed four-column grid; the only growing content gets the middle third, and two
thirds of the width is permanently empty furniture.**
`.ts-workspace` is `grid-template-columns: 240px minmax(420px,1fr) 320px` (`plugin.js:1947`). Measured on
the captures: the team column is **88 % flat background** (one unbroken run from y=229 to y=826, 597 px of
a 730 px column) and the right panel is **77 % flat** (y=282→830, 548 px). The conversation — the only
thing that grows — gets 896 px at 1512, 584 px at 1200. A user opening the room to talk to agents sees two
empty columns flanking a chat pane that scrolls early. Evidence: `p15-1512-full-dark.png` (team x0–240,
right x1136–1456), `p15-1456-full-dark.png`, `p15-1280-full-light.png`.

**C2 — Everything is 10–11 px, so nothing leads, including the work itself.**
Measured leaf-node type census over `.ts-workspace` at 1512 dark: **10 px ×40, 11 px ×23, 12 px ×11,
13 px ×5, 10.4 px ×2** — five sizes, all ≤14 px, dominant size 10 px. The plugin's own tokens are the
cause: `HIVE_T.xs = 10px/14px`, `HIVE_T.sm = 11px/15px` (`plugin.js:90–98`), and every status line, model
label, work-item row, artifact and hint uses `xs`. Line-height is not a scale either: 14, 15, 15.6, 16,
16.5, 19.5, 24 px all appear. A 10 px meta line is the correct *secondary* treatment; it is not a correct
*primary* one, and here it is also the reading size for task titles and agent detail.
Evidence: `p15-1512-full-dark.png`, `p15-1512-agent-detail-dark.png` (see §3.6).

**C3 — The 240 px roster cannot hold what the roster is for, and its detail card truncates the one field
that matters.** Expanded `@arch` detail: the work-item title renders in a **114 px** box (`scrollWidth`
184 px) inside a 240 px column → the title is cut to ~18 characters ("Semicolon essay: verif…") while
~120 px of the row is spent on `#a41f9c` + `IN REVIEW` + the tone colour. `p15-1512-agent-detail-dark.png`.
The same column shows no per-member progress, no cost, no last-activity — four line items of metadata sit
above the truncated title, and seven action buttons below it.
Evidence: `p15-1512-agent-detail-dark.png`, measurements `p15-measurements.json`.

**C4 — The narrow regimes are clipped, not adapted.** At 700 px the team column is 56 px and is supposed
to be avatar-only (`@media (max-width:860px){.ts-team-body{display:none}}`), but the strip and the dock do
not hide: measured `.ts-strip` `scrollWidth` **71 > clientWidth 55** and `.ts-dock` **110 > 55**. The
capture shows exactly that: the header reads **"TEAM 4"** (of "TEAM 4/11") and the footer **"+ Add"**
(of "+ Add · 3 member(s)"). `p15-700-full-dark.png`.

## 2. Capture set, lineage and fidelity contract

Sixteen captures in `sentry-probe/p15-captures/`, rendered from this revision:

| capture | width / app-w | theme | state |
|---|---|---|---|
| `p15-1512-full-dark.png` | 1512 / 1456 | dark | populated timeline, right panel = Tasks |
| `p15-1456-full-dark.png` | 1456 / 1206 | dark | **live-parity** (see §2.2) |
| `p15-1200-full-dark.png` | 1200 / 1144 | dark | populated |
| `p15-1000-full-dark.png` | 1000 / 944 | dark | populated, **rail regime** |
| `p15-700-full-dark.png` | 700 / 644 | dark | populated, **avatar-only team column** |
| `p15-1280-full-light.png` | 1280 / 1224 | light | populated |
| `p15-1280-addpop-light.png` | 1280 / 1224 | light | add-agent popover open |
| `p15-1512-empty-dark.png` | 1512 / 1456 | dark | empty-ish room (0 members, no activity) |
| `p15-1512-agent-detail-dark.png` | 1512 / 1456 | dark | `@arch` row expanded |
| `p15-1512-addpop-dark.png` | 1512 / 1456 | dark | add-agent popover open |
| `p15-1512-mention-dark.png` | 1512 / 1456 | dark | @-mention autocomplete open |
| `p15-1512-tab-{activity,files,workflow}-dark.png` | 1512 / 1456 | dark | remaining right-panel tabs |
| `p15-1000-sheet-{team,right}-dark.png` | 1000 / 944 | dark | overlay sheets |

Three further captures are the **live app itself**, not a harness: `p15-1512-timeline-dark.png`,
`p15-1512-sidebaropen-timeline-dark.png`, `p15-1512-mention-pre-dark.png` (captured from the running
desktop app in the previous run, session `20261018_135121_80425c`).

**Render/read commands (reproducible):**

```sh
cd ~/Developer/hive-team-studio/sentry-probe
node p15-render.cjs --dsf=2          # 16 captures + p15-measurements.json
python3 p15-pixels.py                # rendered-pixel evidence -> p15-pixel-evidence.json
```

### 2.1 Fidelity contract — what these captures are evidence *for*

- **Exact:** the plugin's own layer. `HIVE_TS_CSS` is extracted verbatim from `plugin.js` under test, and
  the real desktop stylesheet (`/Applications/Hermes.app/…/dist/assets/index-B89n1Ils.css`, the same build
  as this CLI) is linked. So `.ts-*` structure, the `44 px / minmax(0,1fr) / auto` grid rows, every media
  query, every utility class the plugin uses, and every `.ts-*` colour *token* are the shipped values.
- **Exact:** geometry and type. Column widths, rail, sheets, strips, docks and font sizes are read back
  from the rendered DOM (`p15-measurements.json`) — these are the numbers quoted throughout.
- **Pinned, not invented:** the runtime palette. The app applies `--theme-*` on `<html>` at runtime from
  the active skin (see `context-BRCtUBSa.js`, `en()` → `style.setProperty`), so the frozen stylesheet
  cannot supply the colour seeds. The harness pins the `--ui-*` values the plugin reads, sampled from the
  live capture: panel **#2b243b** (measured `(43,36,59)` in both the team and right columns of
  `p15-1512-timeline-dark.png`), feed/canvas `#0e0f13` `(14,15,19)`, selected row `#44345b` `(68,52,91)`,
  accent `#a34bff` `(163,75,255)`. **Fidelity check:** the rendered team column in
  `p15-1512-full-dark.png` reads back `(43,36,59)` — identical to the live app's panel colour.
  Light mode has no live capture to sample (this machine runs dark only) and uses the app's own static
  `:root` values over a neutral canvas; see §7.
- **Approximated:** SDK primitives that live in the app bundle, not this repo (`Button`, `Tabs`, `Input`,
  `Badge`, `StatusDot`, `ScrollArea`). Their chrome is hand-drawn, so no finding below rests on
  primitive chrome — only on the plugin's own markup, CSS and layout.
- **Not evidence for:** motion frames, focus-visible, keyboard order, or live event/streaming states.
  Those are listed as unverified in §7.

### 2.2 Live-parity cross-check

The live window is 1456 CSS px; with the app's own nav sidebar open (~250 px) the plugin surface is
~1206 px, so `p15-1456-full-dark.png` is the capture to compare against `p15-1512-timeline-dark.png`.
Scanning a mid-height row of the live capture gives surface seams at x = **300, 530, 1120, 1430** →
team ≈230 px, feed ≈590 px, right ≈310 px, plus a ~26 px strip that is the app's own chrome. The harness
at app-w 1206 renders **240 / 646 / 320**. The columns are the declared tokens (`--ts-team-w:240px`,
`--ts-right-w:320px`, `plugin.js:1947`); the live read is ~10 px smaller per side, which is the app's own
page padding around the plugin route. **Conclusion: the live app runs this exact layout at this exact
width — the ≤1100 px regime is not hypothetical.** In the live capture the right panel body shows only
four tab labels where the harness renders five; at 303 px of tabstrip in a 340 px sheet the fifth
(`Workflow`) is the one at risk, and `p15-1000-sheet-right-dark.png` shows all five fitting in the sheet —
so I am *not* claiming a clipped tab; I am claiming the live width regime matters.

## 3. Capture-by-capture critique

Regions are CSS px inside the plugin surface (`x` from the surface's left edge, `y` from its top).

**3.1 `p15-1512-full-dark.png` — 88 % / 78 % / 77 % empty columns.** First, second and third fixations
compete: the 11 px white user bubble (x248–896, y66–112), the bordered task chip (x248–470, y196–214), and
the avatar squares (x8–30, y62–230). Nothing has a claim to lead: the room title in the toolbar is 12 px
and the tabstrip is 11 px. Dead space: team y229→826 (597 px, 88 %), right y282→830 (548 px, 77 %), feed
y443→734 (291 px, 78 % — the transcript ends mid-column because the composer is pinned at the bottom).
Rail/column radii disagree (see 3.9).

**3.2 `p15-1456-full-dark.png` / `p15-1200-full-dark.png` — the squeeze is in the middle.** At 1200 the
feed is 584 px while the two empty side columns keep 560 px. The composer's 2-row textarea plus the route
chips plus the hint line occupy ~96 px of a 584 px column; the route chips (`[to @name] [ask @name] [all]`)
wrap at this width and read as three equal-weight buttons above a text field — grammar scaffolding
competing with the primary input.

**3.3 `p15-1000-full-dark.png` — the whole work half of the product becomes five two-letter buttons.**
At ≤1100 px the right column collapses to a 48 px rail (measured rail 47×164, five 28×28 buttons, labels
`Ta Ac Fi Ap Wo`) and the right body is `display:none`. The rail is **96 % flat** — five tiny controls in
a 730 px column. This is the regime the live app actually runs in (§2.2). A new user looking for
"Approvals" or "Workflow" sees `Ap`/`Wo` and nothing else; the toolbar adds icon-only "T"/"W" buttons that
open the same two sheets — two affordances for one action, neither labelled in the visible column.

**3.4 `p15-700-full-dark.png` — clipped header and footer.** As measured in C4: `TEAM 4` (11 clipped) and
`+ Add` (member count clipped). The avatars themselves are fine (22 px at x17–39). Icons in the toolbar
compress but do not clip. Below 600 px the team and right columns are removed and both become sheets.

**3.5 `p15-1512-empty-dark.png` — the empty room is a dead room.** Team column 100 % flat (y100→826);
feed **94 % flat** (y113→734, 621 px) carrying one 11 px sentence: *"No activity yet. Message @default or
add agents to start the crew."* The right panel is unchanged from the populated state (77 % flat, Tasks
tab showing a "Board" explainer about native Kanban). A brand-new user sees three empty panels and one
line of grey text; nothing shows what the room is for, who leads, or what to type. The sentence also names
`@default`, which exists only because `Reset` mints it (`plugin.js:1843`) — in a room created from zero
members it is a promise the UI has not yet made.

**3.6 `p15-1512-agent-detail-dark.png` — a 114 px title above a wall of seven buttons.** Structure: five
metadata lines (model/context/session/status) at 10 px, "Open work items" + one truncated row, then
`Stop · View session · Mute · Grant browser · Mark leader · Fresh context · Remove` as seven equal
`outline` xs buttons wrapping across two lines, then two more metadata rows (`context`, `model`) that
duplicate the first five. `Remove` — the only destructive action — is `variant:'destructive'`
(`plugin.js:3255`) but sits last in the same row and at the same weight, so nothing separates it. The
single most important content (what this agent is doing) is absent; the card is metadata and controls.

**3.7 `p15-1512-addpop-dark.png` — the popover is fixed but overhangs.** Measured 256×185 at x8,y635
(bottom-anchored above the dock). It clears the window, opens upward, and is the one crafted-looking
surface in the product (title, search, per-row accent dot + model, divider, "New profile…"). But its right
edge is x264 against a column that ends at x240: **it overhangs the conversation column by 24 px**, and
`.ts-dock` reports `scrollWidth` 264 vs `clientWidth` 239 while it is mounted. Nothing is obscured today
only because the feed's left padding absorbs it. It is also the only place where "add a member" is
discoverable — the roster itself has no inline affordance and no "who leads?" prompt.

**3.8 `p15-1512-mention-dark.png` — two name-pickers, two different selection languages.** The picker is
880×106 at y620, i.e. it spans the entire 896 px conversation column to choose from four names, and its
active row is a **filled accent button** (`variant:'default'`, `plugin.js:2551`) — a solid violet slab.
The add-agent popover marks its rows with a coloured dot and an accent-coloured name. The same UI marks
"active" three ways: filled accent (mention row), 2 px left edge (`ts-row[data-selected]`), and a hairline
tab background (tabstrip). Also confirmed: a lone `@` does not open the picker — `matches` is computed
only when the filter string is non-empty (`plugin.js:2465–2468`), so `@` alone shows nothing and the user
must type at least one character (the A6 nit from the Phase 1 pass, still open).

**3.9 `p15-1512-tab-{tasks,activity,files,workflow}-dark.png` — four tabs, three dead, one useful.**
Flat-background share per tab body measured over y100–830: Tasks 77 %, Activity 90 %, Files **95 %**
(y169→830), Workflow **96 %** (y201→830). Files and Workflow each carry 2–3 lines of grey text at 10 px
plus one dashed box; the workflow body is 548 px of empty panel under a single sentence. None of them
offers a next action beyond a link-card. Empty and degraded states *exist* (Files/Approvals/Workflow have
degraded branches, `plugin.js:3513–3640`) — they are honestly written, and they are visually
indistinguishable from each other.

**3.10 `p15-1000-sheet-{team,right}-dark.png` — sheets are the best-behaved layer.** 340 px wide, x0 or
x604, y44→884, full-height scroll, all five tabs fit (`scrollWidth` 303 ≤ container). The team sheet
duplicates the column exactly, including the dock and the popover anchor. This is the one responsive
mechanism that works; the ≤1100 px discovery problem (§3.3) is about the rail that opens it, not the sheet.

**3.11 Radii, gaps and tokens disagree across the surface.** Measured at 1512 dark: radii `6px ×20`,
`4px ×18`, `8px ×1`, plus `999px` dots; paddings **ten distinct values** — `0 8px ×8`, `4px 8px ×9`,
`6px 8px ×11`, `2px 6px ×4`, `0 6px ×6`, `2px 8px ×2`, `2px 10px`, `4px 10px`, `8px`, `2px` — of which
only the 4/8/0 multiples are on any grid; gaps `6px ×14`, `8px ×5`, `2px ×5`, `4px ×5`. In the plugin's own
CSS the 6 px value is deliberate and repeated (`gap:.375rem` in `.ts-toolbar`, `.ts-strip`, `.ts-dock`;
`padding:.375rem .5rem` in `.ts-row`, `plugin.js:1948–1958`). It is a second spacing base, not an accident
— and that is the defect: two bases (6 and 8) interleaved with 2/4/10 fillers.

**3.12 Typography and colour discipline.** Weights: `400 ×63`, `600 ×17`, `500 ×1` — hierarchy is carried
almost entirely by colour, on text that is already 10 px. Status tones come from tokens with unequal
theme support (§4 F-04): `IN REVIEW` is `#c08532` in *both* themes because `--ui-yellow` is defined once
at `:root` and never in `:root.dark`, while `--ui-red`/`--ui-green` are defined in both. The accent
(`#a34bff` live) is spent on the Send button, the mention active row, selected rows, focus rings and the
user-bubble left edge — no budget.

**3.13 `p15-1280-full-light.png` and `p15-1280-addpop-light.png` — a dark theme with inverted variables.**
Cards are `#ffffff` on `#f2f0f6` panels with `1px` `#dcd8e4` borders: measurable but weak elevation —
borders do the work that layered background + a single soft shadow should do, so the three columns merge
into near-white mush. Meta text at 10 px over `#ffffff` at `--ui-text-tertiary` is the legibility floor.
Status colour is carried straight across: the yellow `IN REVIEW` token is byte-identical to dark
(`#c08532`), and the dark-green/dark-red dots keep their dark values, so the semantic layer is the one
part of the light theme that was not designed at all. Caveat: the light palette is the harness's pinned
approximation (§2.1) — the *token* findings here are exact; the absolute greys are not.

## 4. Ranked findings

Blocker = the product is not usable as designed at a stated regime. High = a normal user loses time or
trust daily. Medium = quality debt the premium bar will not pass. Nit = cosmetic.

| # | Rank | Finding | Evidence | Smallest fix |
|---|---|---|---|---|
| F-01 | **Blocker** | At ≤1100 px the entire Work half of the product (Tasks/Activity/Files/Approvals/Workflow) is behind a 48 px rail whose labels are `Ta Ac Fi Ap Wo`, duplicated by unlabelled toolbar buttons. This is the regime the live app runs in. | `p15-1000-full-dark.png` (rail 47×164, 96 % flat); `p15-1456-full-dark.png` §2.2 | Keep a labelled, icon+text tabstrip down to 1000 px (shrink the two side columns first); make the rail icon-only with tooltips and a visible "Work" label. |
| F-02 | **Blocker** | At 700 px the team header and dock are clipped mid-word (`TEAM 4`, `+ Add`) instead of adapting: `.ts-strip` 71>55, `.ts-dock` 110>55. | `p15-700-full-dark.png`; `p15-measurements.json` | At ≤860 px hide the strip label text and dock text, show a count badge on the avatar column, or replace the header with an icon + count. |
| F-03 | **High** | No hierarchy: five sizes all ≤14 px, 10 px dominant (40 leaf nodes); the reading size for titles and metadata is the same. | Type census §1 C2; `p15-1512-full-dark.png` | Adopt the 11/12/13/15/20 scale (§5 contract P-06) and reserve 10 px for non-reading chrome only. |
| F-04 | **High** | Status colour is not theme-aware: `--ui-yellow #c08532`, `--ui-purple #9e94d5`, `--ui-orange #db704b`, `--ui-warm #cf806d` are defined only at `:root` while `--ui-red`/`--ui-green` are defined twice. `IN REVIEW` is identical in both themes. | app CSS `:root` vs `:root.dark`; `p15-1512-full-dark.png`, `p15-1280-full-light.png` | Ship a plugin-owned semantic ramp (see contract P-16) instead of borrowing the four theme-invariant tokens. |
| F-05 | **High** | Two thirds of the width is permanently empty furniture: team 88 % flat (597 px), right 77 % (548 px), while the feed gets 584 px at 1200. | §1 C1; `p15-1512-full-dark.png` | Narrow the fixed columns to 208/264, let the right column collapse to a labelled strip below 1200, and give both columns real content (§5 P-01/P-18). |
| F-06 | **High** | The expanded agent card truncates the work-item title to 114 px and buries the answer to "what is this agent doing?" under 5 metadata lines and 7 equal buttons. | `p15-1512-agent-detail-dark.png`; `plugin.js:3217–3261` | Work-item title full width; actions grouped primary / secondary / overflow; metadata collapsed to one line + disclosure (contract P-11/P-12). |
| F-07 | **High** | The empty room is a dead room: team 100 % flat, feed 94 % flat (621 px) with one 11 px sentence, right panel unchanged from the populated state. | `p15-1512-empty-dark.png` | A designed empty state that answers "what is this room, who leads, what do I type" and shows the two real next actions (contract P-17/P-13). |
| F-08 | **High** | The `leader` feature is effectively invisible and its label over-promises: reachable only as the 6th of 7 buttons in the expanded card; its whole effect is sort-to-top (`hiveOrderMembers`, `plugin.js:1184–1191`) plus a `leader` word in the 10 px meta line. The button's own `title` admits it ("Sort this member to the top of the panel") while the label says "Mark leader". | `plugin.js:2892–2899`, `3253`, `3267`, `1184–1191`; `p15-1512-agent-detail-dark.png` | First-class role marker on the row, settable at add-time, honest label ("Pin to top" until Phase 3 gives the flag semantics) (contract P-13). |
| F-09 | **Medium** | Granting browser access silently reorders the roster: `hiveOrderMembers` puts `browser===true` in the same sort bucket as `leader`, so a member jumps position when an unrelated permission toggles. | `plugin.js:1186–1187` | Separate the sort keys; keep roster order stable and mark position changes explicitly. |
| F-10 | **Medium** | The add-agent popover overhangs its column by 24 px (256 px box in a 240 px column; `.ts-dock` 264>239) and is the only discoverable path to adding a member. | `p15-1512-addpop-dark.png`; measurement §3.7 | 232 px box (or anchor to the column's start edge + 8 px inset) and an inline "add" affordance on the roster (contract P-22). |
| F-11 | **Medium** | Three different active/selected languages: filled accent (mention row), 2 px left edge (selected row), hairline track (tabstrip). | `p15-1512-mention-dark.png`; `plugin.js:2551`, CSS `.ts-row[data-selected]` | One selection language: 2 px accent edge + tinted row, everywhere (contract P-21). |
| F-12 | **Medium** | Two spacing bases interleaved: 6 px (deliberate, `.375rem`) and 8 px, plus 2/4/10 px fillers — 10 distinct padding values, only 4 on a grid. | §3.11 | One 4/8 scale, documented per surface (contract P-05). |
| F-13 | **Medium** | Radii disagree: 6 px cards/controls, 4 px rail/avatar, 8 px tabstrip track, 999 px dots. | §3.11 | 6 px for all controls/surfaces, 2 px for micro-dots (contract P-15). |
| F-14 | **Medium** | No loading states on the tabs that fetch (Tasks board, Files, Workflow render an empty dashed box while data is in flight), no skeletons. | `plugin.js:3481–3640`; `p15-1512-tab-files-dark.png` | Skeleton rows for each fetching tab; keep the existing degraded text (contract P-17). |
| F-15 | **Medium** | CJK/localization is untested and the Latin metrics are the failure mode the rubric names: all body copy is 10–11 px with `truncate` on names and titles. | type census §1 C2 | Set the floor at 12–13 px for reading text and 14 px for any CJK-facing body; verify with a Korean/Japanese capture (contract P-06, §7). |
| F-16 | **Medium** | The right panel duplicates the room's only durable task list nowhere: Tasks lists this room's work items and tells the user the durable board lives in native Kanban with no desktop surface ("ask an agent: @atlas show the board", `plugin.js:3489`). | `p15-1512-tab-*`; `plugin.js:3489` | Say what the panel *is* in its header and link the native board, or surface the board (contract P-18). |
| F-17 | **Nit** | The mention picker does not open on a lone `@`. | `plugin.js:2465–2468` | Open on a bare `@` with the full roster (`open === ''` treated as "show all"). |
| F-18 | **Nit** | The mention picker spans the full 896 px column to choose from ≤4 names. | `p15-1512-mention-dark.png` (880×106) | Size to content, max 280 px, anchored to the caret side (contract P-21). |
| F-19 | **Nit** | `.ts-row` and `.ts-linkcard` transition at 120 ms — below the declared 150–250 ms band. | plugin CSS `plugin.js:1959–1965` | 160 ms, `ease-out` (contract P-19). |

Note on the card's token instruction: the card asked for "the remaining `--ui-danger`/`--ui-warning`
fallback hexes" to be fixed. **Verified: they are already clean.** `plugin.js` contains **0**
references to `--ui-danger`, `--ui-warning` and `--ui-success`, and **0** occurrences of `#f87171`. The
fallback hexes exist only inside app-CSS utilities the plugin never applies
(`.text-(--ui-danger,#f87171)`). The real token defect is F-04.

## 5. Interaction practicality — the top-5 daily actions

Click counts derived from the source paths, cross-checked against the captures (a "click" = one pointer
action; keystrokes counted only where the keyboard is the documented path).

| Action | Clicks | Path | Verdict |
|---|---|---|---|
| Open the room | 1 | app sidebar nav "Hive" (`plugin.js:3792–3795`) or ⌘K → "Hive: open the agent room" | Fine. |
| Add an agent | 2 (+2 if the profile does not exist) | `+ Add` → pick a profile (`plugin.js:2704–2719`); "New profile…" opens a create form | Acceptable, but it is the *only* path and it hides behind a dock button in a 240 px column (F-10). |
| Send to `@agent` | 2–3 | type `@` + ≥1 char → picker opens → ↑↓/click → Enter (`plugin.js:2512–2538`) | The grammar is invisible until you know the bracket chips: `[to @name]` chips *insert the literal text* `[to @name]` — including the placeholder `@name` — rather than starting the mention flow (`plugin.js:2450–2454`, `2525–2530`). Fix: chips should insert `[to ` and open the picker, or be pre-filled with the selected member. |
| Stop one agent | 2 | expand the row → `Stop` (disabled unless busy) (`plugin.js:3249`) | The only per-agent stop is inside the detail card; `Stop all` is one click but stops everyone. There is no stop control on the row itself. |
| Find a task | 1–2 | right panel tab (1) when the panel is visible; otherwise rail button (1) then read; the *durable* board is not in the UI at all (`plugin.js:3489`) | The room's own work items are reachable; the durable board is a chat request. |

## 6. Anti-slop patterns I reject in this build

Each is a named rejection against `omh-frontend/references/taste-foundations.md` "Anti-slop checklist" and
`omh-design-quality-gate/references/design-critique-rubric.md`, with the evidence in this document:

1. **Weak hierarchy / one size doing three jobs** — 10 px is simultaneously meta, work-item row, agent
   detail and empty-state copy (F-03, §1 C2).
2. **Arrhythmic spacing** — two bases (6/8) plus 2/4/10 fillers; 10 padding values, 4 on-grid (§3.11).
3. **Uniform grid for unequal content** — three peer columns where the middle one is the only growing
   content; 88 %/77 % of the side columns is empty surface (F-05).
4. **Placeholder gravity / empty states never designed** — one 11 px sentence for the whole empty room,
   one dashed box per tab, the right panel identical in empty and populated states (F-07).
5. **Missing states** — no loading treatment while Tasks/Files/Workflow fetch; no `prefers-reduced-motion`
   anywhere in `HIVE_TS_CSS` (F-14, F-19).
6. **Framework-inherited choices with no stated reason** — the app's default accent spent on five
   different roles, default control chrome, a 4-column grid inherited from the shell rather than chosen
   for this content (F-11, §3.12).
7. **Filler copy** — "Projects unavailable" in the toolbar and "no room folder set" in Files are statuses
   dressed as labels; they occupy prime toolbar space with a dead end and no action (F-16).

## 7. What this round could NOT verify (explicit limits)

- **No live light-mode capture.** This machine runs dark; the light tokens in the harness are pinned from
  the app's static `:root` values over a neutral canvas. Light *token* findings (F-04) are exact; light
  *absolute greys* are approximate.
- **No motion, hover, focus, disabled or keyboard evidence.** The captures are settled single frames; the
  harness does not simulate hover/focus. `prefers-reduced-motion` was checked in source only.
- **No CJK capture.** F-15 is a policy finding (10–11 px Latin metrics + `truncate`), not a measured CJK
  render. A Korean/Japanese capture is owed before any PASS.
- **SDK primitive chrome is approximated** (§2.1); no finding rests on it.
- **Streaming/live-event states** (delta coalescing, remote/browser badges, approvals rows) were not
  exercised; Phase 1's HUMAN-CHECK list (light theme, Stop click, approvals row, disable/re-enable) is
  still only partly discharged — the Stop click and the approvals row remain unobserved.
- **The user's window was in use.** No live capture was attempted in this run; the three live captures
  quoted are from the previous run's session at the same revision.

## 8. Rubric verdict (axes scored, then the number)

| Axis (design-critique-rubric) | Verdict | Deduction | Evidence |
|---|---|---|---|
| Hierarchy | FAIL | −10 | §3.1, F-03 |
| Type discipline | FAIL | −12 | type census §1 C2, `plugin.js:90–98` |
| Spacing rhythm | FAIL | −9 | §3.11, F-12 |
| Colour system | FAIL | −10 | F-04, §3.12 |
| State coverage | FAIL | −6 | F-14, F-19, §7 |
| Signature | FAIL | −6 | no designed identity: 1-letter 22 px avatars, default controls, §3.6 |
| Motion restraint | FAIL | −3 | 120 ms background-only transitions, no reduced-motion handling (`plugin.js:1959–1965`) |
| CJK / localization fit | NOT VERIFIED | 0 | §7 — no CJK capture; blocks PASS regardless of score |
| Default-prior fit | PASS | 0 | operational dark surface, no editorial prior leaking in |
| Chosen, not inherited | FAIL | −3 | default accent ×5 roles, default control chrome; the `.ts-*` token discipline is the partial credit |
| **Score** | | **41 / 100** | |

```json
{
  "score": 41,
  "verdict": "REVISE",
  "differences": [
    {
      "difference": "Below 1100px the Work half of the product is five two-letter rail buttons (Ta/Ac/Fi/Ap/Wo) while two empty side columns keep 560px of width; the live app runs in this regime (seam scan: team 230, feed 590, right 310).",
      "suggestion": "Keep a labelled tabstrip to 1000px by shrinking the side columns first, and make the rail icon-only with a persistent 'Work' label; recapture 1000/1200/1456."
    },
    {
      "difference": "At 700px the team strip and dock are clipped mid-word: 'TEAM 4' (of 4/11) and '+ Add' (of '3 member(s)'); measured .ts-strip 71>55, .ts-dock 110>55.",
      "suggestion": "Hide strip/dock text at <=860px and show a count badge on the avatar column; recapture 700 dark."
    },
    {
      "difference": "Type hierarchy is flat: five sizes all <=14px, 10px dominant (40 leaf nodes) and used for work-item titles, agent metadata and empty-state copy alike.",
      "suggestion": "Adopt the 11/12/13/15/20 scale from the P1.5 contract and reserve 10px for non-reading chrome; recapture 1512 dark + 1280 light."
    },
    {
      "difference": "Status colour is theme-blind: --ui-yellow/-purple/-orange/-warm are defined only at :root while --ui-red/-green are defined in both, so IN REVIEW is #c08532 in dark and light.",
      "suggestion": "Ship the plugin-owned semantic ramp (contract P-16) and verify both themes at 1512/1280."
    },
    {
      "difference": "Two thirds of the surface is permanently empty: team column 88% flat (597px), right panel 77% (548px), feed 78%.",
      "suggestion": "Narrow fixed columns to 208/264, collapse the right column to a labelled strip below 1200, and put real content in both (P-01/P-18)."
    },
    {
      "difference": "The expanded agent card truncates its work-item title to 114px while spending the row on #id + IN REVIEW, and lists seven equal-weight action buttons including the destructive one.",
      "suggestion": "Full-width title, actions grouped primary/secondary/overflow with Remove separated, metadata collapsed; recapture agent-detail dark."
    },
    {
      "difference": "The empty room is one 11px sentence in a 94%-flat feed with both side columns empty and the right panel identical to the populated state.",
      "suggestion": "Design the empty state: what the room is, who leads, the two real next actions; recapture empty dark."
    },
    {
      "difference": "The leader flag is invisible (6th of 7 buttons in a detail card) and its label ('Mark leader') over-promises ordering-only behaviour, which its own tooltip admits.",
      "suggestion": "Role marker on the row, settable at add time, labelled 'Pin to top' until Phase 3 gives it semantics."
    },
    {
      "difference": "Three different active/selected languages (filled accent row, 2px accent edge, hairline tab track) and two name-pickers that mark selection differently.",
      "suggestion": "One selection language everywhere: 2px accent edge + tinted row; picker rows use roster anatomy."
    },
    {
      "difference": "Spacing and radii have no single scale: 6px and 8px bases interleaved with 2/4/10px fillers (10 padding values), radii 6/4/8px plus 999px dots.",
      "suggestion": "One 4/8 scale and a 6px control radius, documented per surface (P-05/P-15)."
    },
    {
      "difference": "Fetching tabs render an empty dashed box while data is in flight and no surface honours prefers-reduced-motion.",
      "suggestion": "Skeletons for fetching tabs, and a reduced-motion block in HIVE_TS_CSS (P-17/P-19)."
    },
    {
      "difference": "CJK/localization is unverified for a surface whose reading text is 10-11px with truncation on names and titles.",
      "suggestion": "Raise the reading floor and capture one Korean/Japanese render before any PASS is claimed."
    }
  ]
}
```

**Next action owed:** FORGE implements `TEAM_WORKSPACE_DESIGN-P1.5.md`, recaptures the exact set named in
its §6 at the same widths/states/themes, and the QA round rescores against the new captures. 90 is the
pass line; rescoring these captures is not a round.

## 9. comparative_quality_rubric — how this must beat ordinary output

The gate artifact the raised bar asks for. Reference A drives the interaction model; references B drive
craft. "Ordinary output" below means what a competent implementation of the same brief produces without a
design decision: the current build is a fair example of it.

**Reference A — AionUI Team Mode (interaction model).** Multi-agent rooms that read as a *workspace*: the
team roster carries live state per member, addressing a teammate is one gesture from the composer, and the
artifact the team produces sits beside the conversation rather than in a third unrelated panel. Beat it
by: (1) one obvious address gesture — the `@` affordance visible before typing, picker sized to content;
(2) per-member state readable at a glance in the row (status + current work + progress), not behind a
disclosure; (3) artifacts anchored to the conversation that produced them.

**Reference B — Linear / Stripe / Supabase-class dev tools (craft).** The craft signals: a modular type
scale with a real display step, one accent with a budget, hairline borders over boxes, 4/8 spacing rhythm,
keyboard-first affordances, empty states that teach, and motion that only reports state.

| Axis | Ordinary output (today) | The bar for this surface | Measured target |
|---|---|---|---|
| Hierarchy | 10 px dominant, 5 sizes ≤14 px, colour carries everything | One lead per region: room title 15/20, section labels 11 uppercase, body 12–13, meta 11 | Type census shows exactly 11/12/13/15/20 + a 10 px non-reading tier |
| Spacing rhythm | 6 & 8 px bases + 2/4/10 fillers | One 4/8 scale, sibling gaps identical, section padding proportional to weight | Padding census ≤5 values, all multiples of 4 |
| Type discipline | sizes chosen per call site | scale + reserved tiers | see hierarchy |
| Colour discipline | default accent spent on 5 roles; status tokens theme-blind | one accent, ≤3 roles (primary action, selection, focus); semantic states theme-aware in dark **and** light | accent appears only on Send/selection/focus; both themes verified |
| Density | 240 px roster truncating a title at 114 px; 7 equal buttons | a 240 px roster that answers "who, doing what, how far" — and an actions layer with a primary + overflow | no truncation of the work-item title at ≥1200; ≤3 visible actions, rest in a menu |
| Motion | 120 ms background only, no reduced-motion | 150–250 ms, state-reporting only, honours reduced motion | token documented; `@media (prefers-reduced-motion:reduce)` present |
| Empty states | one grey sentence; dashed box per tab | each empty state says what the surface is, why it is empty, and the one next action | every panel has a designed empty state with a CTA |
| Identity | 22 px 1-letter squares | deliberate member identity: initials + per-profile accent, status as a subtle glow/dot, leader as a role marker | identity rules in the contract's tokens; visible in every roster capture |
| Responsive | 56 px column clipped mid-word; Work half behind 2-letter rail | labels survive degradation: what is hidden is hidden *whole*, what remains is named | no element reports scrollWidth > clientWidth at 700/1000/1200/1512 |

**Explicitly rejected as insufficient (verdict-blocking in the QA card):** a one-note palette, weak
hierarchy, cramped cards, ungrounded gradients, decorative filler, placeholder copy, and default-looking
controls — the seven patterns named in §6 with their evidence.

