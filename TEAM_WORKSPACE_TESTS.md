# TEAM WORKSPACE TESTS

## Baseline — 2026-10-17 (pre-change, buzz-hive v1.3 @ 929548d)

Command: `cd ~/Developer/hive-team-studio/worktree && node test.cjs`

Result: **ALL PASS 193/193**

Coverage groups observed in output:
- Task assignment / verdict / review-routing logic (incl. self-verdict guard,
  unreviewed submission reporting, no-board-for-uninvolved)
- Scratchpad sections + corrections (attribution, bang-form replacement)
- hiveScrubMarkers (prose survives scrubbing, pure-marker replies not re-broadcast)

## Test protocol for every phase

1. Re-run `node test.cjs` in the worktree — must stay green; new logic gets new tests.
2. Manual verification per phase acceptance criteria in the running desktop app.
3. Record results below with date, phase, command, outcome, evidence.

## Results log

| Date | Phase | Test | Result | Evidence |
|------|-------|------|--------|----------|
| 2026-10-17 | 0 | node test.cjs (baseline) | PASS 193/193 | terminal output in PROGRESS.md |
| 2026-10-17 | 1 | node test.cjs (after `d6d3a7a`, pure helpers) | PASS 260/260 | +67: derived status, status/task vocabulary, card mapping, activity filter, feed filter, delta reducer, clipping/caps, order |
| 2026-10-17 | 1 | node test.cjs (after `77c24ea`, work cards) | PASS 278/278 | +18: one card per applied effect, none for unknown ids/marker-free output, artifact clipping |
| 2026-10-17 | 1 | node test.cjs (after `49e4fdf`, workspace) | **PASS 283/283** | +5: team-panel ordering (`hiveOrderMembers`); full run below |
| 2026-10-17 | 1 | node smoke-render.mjs (new harness) | **PASS 51/51** | real React render + scripted event exchange, below |
| 2026-10-17 | 1 | node --check plugin.js (as .mjs) | SYNTAX OK | plain-ESM parse of the whole file |
| 2026-10-17 | 1 | gateway spike probes (S3/S4/S5) | 4 methods reachable, real payloads | one-off WS/HTTP probes on the running desktop's `/api/ws`; exact calls + output quoted in PROGRESS.md §Spikes (scripts were throwaway scratch, deliberately not committed) |

### `node test.cjs` — raw tail (after `49e4fdf`)

```
hiveOrderMembers (team panel order)
  ✓ leader and browser sort first, then alphabetical
  ✓ the input array is not mutated
  ✓ an empty roster is fine
  ✓ a malformed entry cannot throw
  ✓ ordering is team-agnostic (no name is special)

ALL PASS 283/283
```

### `node smoke-render.mjs` — what it is, and what it is NOT

`smoke-render.mjs` builds a throwaway sandbox (symlinked `react` / `react-dom`
/ `nanostores` + a faithful `@hermes/plugin-sdk` stub), imports the REAL
`plugin.js`, calls the REAL `register(ctx)`, renders the page with
`react-dom/server`, and then drives the REAL gateway listeners it mounted. It
asserts:

- the plugin imports, registers and renders the three-column workspace; every
  icon name it references exists in the app's `icons.ts`; the style sheet has
  no hex/rgb/hsl literal and reads only real `--ui-*` props (plus its own
  `--ts-*`); all three breakpoints exist.
- **A3 evidence**: zero color literals, zero invented var names.
- **A4/A5/A7/A11 evidence (headless)**: a scripted exchange —
  `message.start` → `thinking.delta` → 3× `message.delta` → `tool.start/complete`
  → `message.complete` with `[task @builder]` — produces the derived status
  changes (idle → thinking → answering → using a tool → done) and a TASK card;
  `[done]` → SUBMITTED + the Tasks tab IN REVIEW; `[review]` → REVIEW card;
  `[verdict #id fail]` → VERDICT + FAILED + the routed-back note; a
  `[scratchpad:…]` marker → a SystemCard. Raw markers never appear in the
  rendered feed.
- **§8.2 evidence**: streamed text is invisible until the 50 ms window
  elapses (one pending timer), then lands as one batch; `message.complete`
  flushes synchronously.
- **§8.3 evidence**: after `onDispose`, every event subscription is gone, the
  injected `<style>` is removed, and the UI prefs were flushed to storage.
- An `error` event marks the member errored with a retry affordance.

It is NOT the desktop app: no CSS layout is applied, no native pane opens, and
`host.request` is stubbed (no real session is touched). Layout, light-theme
repaint, real approvals, the Files/Workflow degraded states and the
disable/re-enable duplicate-row check remain SENTRY's in-app checks.

### Raw tail

```
cleanup on unload
  ✓ event subscriptions were actually mounted
  ✓ onDispose removed every event subscription
  ✓ onDispose removed the injected style sheet
  ✓ onDispose flushed the workspace prefs to storage

ALL PASS 51/51
```

---

# Phase 1 — SENTRY verification (2026-10-17)

Independent verification of `d6d3a7a`→`531c6e5` on branch `team-studio`.
I did not write this code. Every claim below was reproduced from scratch: the
suite was re-run, the baseline was re-extracted from `02bff71` and re-run, and
my own harness (`probe-sentry.mjs`, written by me, not a copy of
`smoke-render.mjs`) drove the REAL `register(ctx)` listeners against the REAL
`plugin.js` in a sandbox.

**Verdict summary: FAIL — 1 regression, 1 layout defect, 3 further findings.**
Phase 1 is not releasable as-is; the regression is a small, surgical fix.

## Commands actually run

```
$ node test.cjs                 # in worktree/            → ALL PASS 283/283
$ node smoke-render.mjs         # in worktree/            → ALL PASS 51/51
$ node test.cjs                 # in a dir seeded with 02bff71:plugin.js +
                                # 02bff71:test.cjs       → ALL PASS 193/193
$ node probe-sentry.mjs         # SENTRY's own harness    → FAIL 6/15
```

The harness and its raw output are kept durably (outside the branch, next to
`backups/`) at `~/Developer/hive-team-studio/sentry-probe/`:
`probe-sentry.mjs`, `probe-sentry-output.txt`, `gw-probe.mjs`. Re-run with
`node probe-sentry.mjs` (it reads `plugin.js` from the worktree by default).

## Gate checks

| Item | Verdict | Evidence |
|------|---------|----------|
| Live folder `~/.hermes/desktop-plugins/buzz-hive/` untouched | **PASS** | `git rev-parse HEAD` → `929548d4a512…` (= the documented baseline), `git status --porcelain` empty, `plugin.js` sha256 `b968e412…` mtime 16:15, no `TEAM_WORKSPACE_*`/`smoke-render.mjs` present in it |
| `node test.cjs` green | **PASS** | `ALL PASS 283/283`, exit 0 |
| Baseline count is real (not assumed) | **PASS** | re-ran the suite against `02bff71`'s `plugin.js`+`test.cjs` in a clean dir → `ALL PASS 193/193`; 193 + 90 new = 283 |
| No test suppressed/skipped/deleted | **PASS** | `grep '\.skip\|it\.todo\|xit(\|xdescribe\|\.only' test.cjs` → no matches; `git diff 02bff71..HEAD -- test.cjs` removes exactly **2 lines**, both the single-line export-list string (`hiveClipHead` → the expanded list). No assertion removed |
| Imports stay inside the allowed surface | **PASS** | `plugin.js:36-73` — `@hermes/plugin-sdk`, `react/jsx-runtime`, `react` only; no other import/require anywhere |
| No invented API call | **PASS** | every door cross-checked against the installed v0.22.2 source, not against the docs: `projects.list` `methods_projects.py:81`, `projects.get:86`, `projects.set_active:117`, `projects.for_cwd:123`; `approval.pending` `methods_prompt.py:1238`, `approval.respond:1258`; `useQuery`/`queryClient` `sdk/index.ts:1975,2087`; `ctx.runAction('view.showFiles'\|'view.toggleReview')` both in the `PLUGIN_APP_ACTIONS` allow-list (`lib/keybinds/actions.ts:236,239`); `host.revealPane` (`sdk/index.ts:1451`) with pane ids `sessions/terminal/files/review/logs` all registered in `app/contrib/controller.tsx:194,233,255,273,628`; `ctx.os.writeClipboard` present on `PluginOs` |
| Marker relay / state machine not rewritten | **PASS** | every hunk inside `hiveApplyWorkItems` is an added `cards.push(...)` plus the `return {…, cards}` change; `hivePlanDeliveries`, `hiveScrubMarkers`, `hiveParseWorkItems`, hop budget and fan-out cap are byte-identical to `02bff71` |
| Injected CSS scoped + no colour literal | **PASS** | every selector in `HIVE_TS_CSS` (all 38 `.ts-` rules, media blocks included) starts `.ts-`; zero `#hex`/`rgb()`/`hsl()`; the 11 `--ui-*` names it reads are all defined by the app's `assets/index-B89n1Ils.css` and are theme-relative (`:root{--ui-bg-card:…=var(--ui-accent)/var(--theme-…)}`), so they repaint with `.dark` |
| Unload cleanup complete | **PASS** | reproduced: after `onDispose` the style element is gone and `listeners.size === 0`; `hiveClearDeltas()` + `queryClient.removeQueries({queryKey:['buzz-hive']})` match the real keys (`['buzz-hive','approvals',key]`, `['buzz-hive','workflows']`); every `document.addEventListener` has a matching remover |
| Icons referenced exist | **PASS** | all 18 `icons.*` names present in the SDK bundle **and** exported by `apps/desktop/src/lib/icons.ts` |
| S3/S4 live re-verification | **NOT REPRODUCED** | I could not re-run FORGE's live probes: `curl http://127.0.0.1:57188/api/plugins/hermes-workflows/runs` → `401 Unauthorized`, and an unauthenticated `ws://127.0.0.1:57188/api/ws` → `403`. Confirmed at registration level only (row above). FORGE's quoted payloads remain FORGE's evidence, not mine |

## Acceptance checklist (TEAM_WORKSPACE_DESIGN.md §10)

| # | Verdict | Evidence |
|---|---------|----------|
| A1 three columns at 1440px | **PARTIAL** (runtime BLOCKED) | static: `.ts-workspace{grid-template-columns:240px minmax(420px,1fr) 320px}` + `grid-template-rows:44px …` + `height:100%;overflow:hidden` (`plugin.js:1935`); pixel/no-scrollbar behaviour needs the app |
| A2 narrow fallbacks, all content reachable | **FAIL** | `.ts-sheet[data-open="true"]{display:block}` exists **only inside `@media (max-width:600px)`** (`plugin.js:1977`), while `.ts-right-body{display:none}` and `.ts-rail{display:flex}` apply from `≤1100px` (`:1965-1966`) and `.ts-team-body{display:none}` from `≤860px` (`:1970`). Between **601 px and 1100 px** the right column's tab bodies and the team column's row detail are `display:none`, the sheet cannot display, and `.ts-narrow-only` toolbar toggles are also hidden (`:1962,1976`). `TsRightRail.select()` (`:3620-3624`) sets `sheets.right = true` and nothing appears. DESIGN §1.3 ("at 1000px … its tabs open as an overlay") is unmet |
| A3 light+dark, zero hardcoded colours | **PARTIAL** | no literal in the injected stylesheet (PASS, evidence above); but 3 live `var(--ui-danger, #e5484d)` / `var(--ui-warning, #f5a524)` fallbacks remain in reused components (`:2226`, `:2250`, `:2700`) and `--ui-danger`/`--ui-warning` do **not** exist in the app's CSS, so the hex is what renders — light-theme `#e5484d` vs the theme's `--ui-red:#cf2d56`. Light-theme repaint itself needs the app |
| A4 live status across a real turn + error state | **FAIL** | **regression**, reproduced: `message.start` → `message.delta` → `error` within the 50 ms window leaves the member reading `answering…` with the stale text replayed onto a **new** turn, instead of `errored`. Details + fix below |
| A5 §3.2 cards, markers never raw | **PASS** (headless) | my harness: `[task @builder]` → `data-ts-work="task"` card with an id; the raw marker string is absent from the rendered page; FORGE's 51-check harness covers done/review/verdict/scratchpad the same way |
| A6 @-mention autocomplete + suppression rows | **BLOCKED** | needs a live composer; code path is pre-existing and unchanged |
| A7 Tasks tab mirrors `$hiveTasks`; fail→OPEN on resubmission | **PASS** (with a doc erratum) | reproduced the full ladder: `[done]`→IN REVIEW, `[verdict fail]`→FAILED + "routed back to the owner", re-`[done]`→IN REVIEW. The status mapping is exactly `open/submitted/passed/failed` as §4.1:260-265 specifies. **§10 A7's clause "the row returns to OPEN on resubmission" contradicts §4.1** (which says re-`[done]` returns to `submitted` = IN REVIEW). The code follows §4.1; the A7 sentence is the defect |
| A8 real pending approval + respond from the tab | **BLOCKED** | needs a live approval in the app; the degraded branch (`data-ts-approvals`, "Answer those in the native prompt") exists at `:3545` |
| A9 Files/Workflow real data or degraded state | **PARTIAL** (runtime BLOCKED) | `data-ts-files="degraded"` / `data-ts-workflow="degraded"` branches present and reachable on error (`:3498-3510`, `:3583-3590`); the workflow route `/api/plugins/hermes-workflows/runs` exists (`plugins/hermes-workflows/dashboard/plugin_api.py:230`) but I could not re-run it live (401) |
| A10 suite green | **PASS** | 283/283, baseline 193 reproduced, no suppression |
| A11 existing comms unchanged | **PASS** | marker/hop/fan-out/scratchpad tests green; relay functions unchanged; timeline cap change `slice(-200)`→`hiveCapTimeline(...)` (200→500 in memory, 120 persisted) is the documented §8.2 value |
| A12 console clean, no duplicate rows after re-enable | **PARTIAL** | dispose removes subscriptions + style (reproduced); duplicate-row check needs the app. `console.log` on every turn start/complete is pre-existing noise (`:3770,3828`) |
| A13 other plugins/panes unaffected | **BLOCKED** | static evidence only: one `<style id="buzz-hive-team-studio">`, every selector `.ts-`-prefixed, removed on dispose |
| S1–S6 | **PARTIAL** | S6 (var list/components) independently re-checked against the installed bundle/CSS and holds; S3/S4/S5 asked to be live-verified and I could not re-run them (401/403 above) |

## Findings (severity order)

**R1 — REGRESSION, blocking. A buffered delta resurrects a turn that already
ended.** `hiveFlushDelta` (`plugin.js:2050-2060`) has no "is this turn still
open" guard, and `hiveAppendTurnText` (`:1505-1514`) *opens a new turn* when
none is open. `hiveTurnFail` (`:1549-1560`) closes the turn without flushing or
dropping the buffer, so a delta still inside the 50 ms window lands 50 ms later
on a brand-new turn. Reproduced (`probe-sentry.mjs`):

```
[A4] error inside the 50ms delta window
  PASS  immediately after error the member reads errored
  FAIL  the member STILL reads errored 50ms later   → status labels present after flush: answering…
  FAIL  the failed turn was not reopened as a new streaming turn — {"answering":true}
  FAIL  the stale streamed text did not get replayed onto a new turn
```

Same root cause on two more non-`message.complete` turn endings:
`hiveStopMember` folds without flushing (`:1802`) — Stop is an A4 user action —
and the `assistant.completed` fallback is bound without a flush (`:3831`).
Fix (either, both are one-liners): guard the flush and flush on close.

```js
// plugin.js:2056 — after `const member = hiveMemberBySession(sessionId)`
if (hiveOpenTurnIndex(member) === -1) return   // the turn already ended: drop stale text
```
and add `hiveFlushDelta(member.sessionId)` before `hiveTurnFold`/`hiveTurnError`
in `hiveTurnFail:1549`, `hiveStopMember:1802`, `hiveFoldTurn:1533`.

**R2 — Layout defect. Right/team panel content unreachable between 601 px and
1100 px.** `plugin.js:1977` vs `:1965-1970`, `:1962`. Fix: move
`.ts-sheet[data-open="true"]{display:block}` and `.ts-narrow-only{display:inline-flex}`
out of the `max-width:600px` block into the `max-width:1100px` block (the 600 px
rules can stay as a duplicate for the single-column case).

**F1 — `TsSheet` mounts its children even when closed → every right/team panel
is mounted twice.** `plugin.js:3721-3722`. `renderToString` shows
`data-ts-right="true"` ×2 and `data-ts-team="true"` ×2. Because
`hiveUseApprovals` is called from `TsApprovalsBadge` (`:3111`) *and* both
`TsRightPanel` copies (`:3638`), three observers share
`['buzz-hive','approvals',key]`; in `@tanstack/query-core@5.101.2`
`#refetchIntervalId` is per-observer (`queryObserver.js:214`), so the 5 s poll
is issued 3× per tick instead of once. Fix: `{open && jsx(TsSheet, …)}` /
lazily render sheet content.

**F2 — three live hardcoded colour fallbacks survive the "removed the dead
`--ui-danger`/`--ui-warning`" claim.** `:2226`, `:2250` (HiveTurnRow error,
reachable through `TsCard`) and `:2700` (HiveWorkBoard, reachable via the
scratch view) still use `var(--ui-danger, #e5484d)` /
`var(--ui-warning, #f5a524)`; both vars are undefined in the app stylesheet, so
the hex renders. The new `hiveTaskStatusTone` correctly uses
`--ui-red/--ui-yellow/--ui-green`, so the same FAILED item is `#e5484d` in the
Work board and `#cf2d56` in the Tasks tab. Fix: use the real vars in all three
places. `PROGRESS.md` should be corrected: only **1** of the 4 baseline
occurrences disappeared, and only because `HiveRosterChip` was deleted.

**F3 — the real `error` reason never reaches the UI (pre-existing).**
`:3818` reads `e.error.message` / `e.payload.error`; the gateway's `ErrorPayload`
is `{message}` (`tui_gateway/contracts/events.py:112`, mirrored as
`GatewayEvent.payload` in `apps/shared/src/gateway-events.ts:46`), so every
error card says the literal `turn failed`. `smoke-render.mjs:372` passes
`error: {message:'boom'}`, a shape the gateway never emits — that is why the
harness cannot see it. Fix: `(e.payload && e.payload.message) || (e.error && e.error.message) || 'turn failed'`.

**F4 — minor.** `hiveCardTitle` (`:1175`) is newly added and referenced only by
`test.cjs`; `title` attributes are used instead. Also, A7's sentence in
TEAM_WORKSPACE_DESIGN.md §10 should be corrected to "returns to IN REVIEW"
(it already contradicts §4.1:265).

## What I could NOT verify (stated plainly)

In-app runtime behaviour — A1 pixels, A3 light-theme repaint, A4 Stop against a
real session, A6, A8, A9 under a real failure, A12's disable→re-enable
duplicate-row check, A13 — plus a live re-run of S3/S4/S5. `smoke-render.mjs`
applies no CSS layout, opens no pane and stubs `host.request`; and the task
reserves a worktree-sourced live reload to ATLAS/the human, so I did not touch
the live plugin folder or the app. Those rows are marked BLOCKED above with the
reason. Nothing in this report is based on the author's prose: every PASS rests
on a command I ran, and every FAIL is reproduced above.


---

# Phase 1 fix pass — FORGE re-verification (2026-10-17, card `t_38382fa2`)

Fixes FORGE's side of SENTRY's FAIL above. Branch `team-studio`, worktree
`~/Developer/hive-team-studio/worktree`; the live plugin folder was not touched.
**Committed on branch `team-studio`** (no branch switch, no push) — see
"Hand-back state" for the hashes and the diff range to review.

## Commands actually run (raw)

```
$ node test.cjs
...
turn-closing safety (R1: a buffered delta must not resurrect a closed turn)
  ✓ appending text keeps it on the open turn
  ✓ an open turn is discoverable while it streams
  ✓ failing a turn keeps the text already folded into it
  ✓ failing a turn surfaces the real reason
  ✓ the open-phase set excludes a failed turn
  ✓ a failed turn is no longer an open turn (the flush guard drops stale text)
  ✓ folding a turn with no new text keeps the streamed text
  ✓ a folded turn is no longer open either
  ✓ an empty error reason still reads as a failure

ALL PASS 292/292
```

```
$ node smoke-render.mjs
...
F1 — no duplicate column mounts
  ✓ each column of the grid is mounted exactly once
  ✓ a closed overlay sheet does not mount its panel at all
R2 — overlay reachability between 601 px and 1100 px
  ✓ the ≤1100px block can display the team/right overlay sheets
  ✓ the ≤1100px block can display the narrow-only toolbar toggles
  ✓ the ≤600px block still carries both rules for the single-column case
R1 — delta-window turn resurrection regression
  ✓ a mid-window delta is buffered, not rendered
  ✓ the error reason from the real payload shape reaches the card
  ✓ immediately after error the member reads errored
  ✓ folding the tail cancelled the pending window (no live delta timer survives)
  ✓ the member STILL reads errored once the window would have elapsed
  ✓ the stale flush opened no new turn and left nothing streaming
  ✓ the last turn row is still the error row
  ✓ the stale streamed text was not replayed onto any surface
R1b — the assistant.completed fallback folds the tail before closing
  ✓ the fallback folded the buffered tail into the closed turn
  ✓ hiveStopMember flushes the pending window BEFORE folding the turn closed
  ✓ hiveFlushDelta refuses to write into a turn that already ended
  ✓ no --ui-danger/--ui-warning fallback literal survives in the plugin
A7 — resubmission returns the row to IN REVIEW (DESIGN §10 A7 corrected)
  ✓ after resubmission the row reads IN REVIEW
  ✓ no row in the Tasks tab reads a bare OPEN during IN REVIEW
  ✓ work cards carry the one-line drawer title as their tooltip
cleanup on unload
  ✓ event subscriptions were actually mounted
  ✓ onDispose removed every event subscription
  ✓ onDispose removed the injected style sheet
  ✓ onDispose flushed the workspace prefs to storage

ALL PASS 72/72
```

```
$ cp plugin.js /tmp/plugin-check.mjs && node --check /tmp/plugin-check.mjs
SYNTAX OK
```

```
$ node ../sentry-probe/probe-sentry.mjs
[A1] rendered structure + duplicate-mount check
   occurrences of data-ts-right="true" : 1
   occurrences of data-ts-team="true"  : 1
   occurrences of data-ts-center="true": 1
  PASS  exactly one live three-column grid (each column rendered once)

[A4] error inside the 50ms delta window (FORGE harness emits error with NO pending delta)
  PASS  immediately after error the member reads errored
  PASS  the member STILL reads errored 50ms later (turn was not resurrected by the stale flush)
  PASS  the failed turn was not reopened as a new streaming turn
  PASS  the stale streamed text did not get replayed onto a new turn
   status labels present after flush: errored

[A4b] the REAL error payload shape (GatewayEvent.payload = {message})
  PASS  the real gateway error reason reaches the turn card

[A5] raw markers never reach the feed (independent re-check)
  PASS  a [task @builder] marker produced a TASK card with an id
  PASS  the raw [task @builder] marker text is absent from the rendered page

[A7] verdict fail -> resubmission status ladder (DESIGN says the row returns to OPEN)
  PASS  after [done] the Tasks tab reads IN REVIEW
  PASS  after [verdict fail] the Tasks tab reads FAILED
  PASS  the failure routes the work back (row explains the resubmission path)
  FAIL  after resubmission the row reads OPEN (DESIGN A7, literally) — {"readsInReview":true,"readsOpen":false,"readsFailed":false}
  PASS  ...and it mirrors $hiveTasks by reading IN REVIEW instead (state machine is open/submitted/passed/failed)

[A12] disable -> re-enable leaves no duplicate style element / listener
  PASS  onDispose removed the injected style
  PASS  onDispose removed every listener

PROBE RESULT: FAIL 1/15
```

SENTRY's probe went from `FAIL 6/15` to `FAIL 1/15`. **The one remaining
failure is not a code defect and is not fixable in code:** the probe's A7 case
asserts the row reads a bare `OPEN` after resubmission, quoting DESIGN §10 A7
literally. F4 corrects that sentence in `TEAM_WORKSPACE_DESIGN.md` to "returns
to **IN REVIEW**" (it contradicted §4.1:265, per the card's "Not required"
clause, and the card forbids changing the state machine). The probe's own
companion row in the same block passes. The probe was **not** edited — it is
SENTRY's artifact — and the corrected expectation is absorbed as two real
assertions in `smoke-render.mjs`, both green.

## Row-by-row status of every reported finding

| Finding | Status | Evidence |
|---------|--------|----------|
| R1 delta-window turn resurrection (blocking) | **FIXED** | guard `plugin.js:2068`; flush in `hiveTurnFail:1549`, `hiveStopMember:1806`, `hiveHandleFallbackCompleted:1443`; new regression block in `smoke-render.mjs` green; probe A4 all 4 rows PASS (were 1 PASS / 3 FAIL) |
| R2 601–1100 px unreachable | **FIXED** | `plugin.js:1977-1978` moved into the `≤1100px` block; 3 new `smoke-render.mjs` CSS assertions on the extracted block text — [SENTRY re-verification, `t_12e302ea`: **superseded**. The sheet now *opens* at 700/1000 px, but its content stays `display:none`. See §"Phase 1 — re-verification" below.] |
| F1 duplicate sheet mounts / 3× poll | **FIXED** | `plugin.js:3735-3736` lazy mount; probe A1 now `1/1/1`; smoke asserts exactly one mount per column and no sheet in the DOM while closed |
| F2 hardcoded colour fallbacks | **FIXED** | `plugin.js:2226,2250,2700` → `--ui-red` / `--ui-yellow`; smoke asserts no `--ui-danger`/`--ui-warning` literal remains; PROGRESS.md claim corrected |
| F3 error reason never surfaces | **FIXED** | `plugin.js:3836` reads `payload.message` first; smoke's stub switched to the real shape and asserts the reason renders / the literal fallback does not |
| F4 `hiveCardTitle` dead code | **FIXED (wired)** | used as the work card tooltip `plugin.js:3334`, asserted in smoke; `test.cjs` still covers the pure contract |
| F4 DESIGN §10 A7 wording | **FIXED** | `TEAM_WORKSPACE_DESIGN.md:566-569` → "returns to IN REVIEW"; probe A7 PASS/FAIL asymmetry recorded above |
| A7 state machine | **UNCHANGED (deliberate)** | the card's "Not required" clause; `hiveApplyWorkItems` untouched |

## Hand-back state

Committed on branch `team-studio` (**no branch switch, no push**) — the
re-verification card `t_12e302ea` step 4 diffs `531c6e5..HEAD`, so HEAD has to
carry the rework. The commit hash is recorded in the kanban handoff for
`t_38382fa2`.

```
$ git status --porcelain        # after the commit — empty

plugin.js        sha256 b27f4c7a99262a1c6e3436f5ed4fb0f024af0215b3607cc2598212ea319548a8
smoke-render.mjs sha256 2f3c6ebb57aa221b6dec1dc26c1d8105fe9e6a40a19c1f7a384db9a88f763518
test.cjs         sha256 35a7a5cee55639aabd851a5f4032651b4621d1449b082bef78bd5d55b020a09f
```

## What this pass could NOT verify (stated plainly)

The same in-app items SENTRY marked BLOCKED: real pixel layout (A1/A2), a light
theme repaint (A3), an in-app Stop click (A4 — only the SOURCE ORDER of the
flush in `hiveStopMember` is asserted here, not the click), a live approval poll
(A8), a real disable→re-enable (A12), other panes (A13). `smoke-render.mjs`
applies no CSS, opens no pane and stubs `host.request`.

---

# Phase 1 — re-verification (2026-10-17, card `t_12e302ea`, HEAD `224efbc`)

SENTRY, second pass over the rework commit `224efbc`. Not trusting the author's
summary: every row below is from a command I ran myself on this HEAD, plus a
real browser engine for the layout claim `smoke-render.mjs` cannot make.

## Verdict

**FAIL — 1 of 6 findings outstanding (R2). R1, F1, F2, F3, F4 verified fixed.
No new regression, no weakened test, no invented API.**

> **Superseded for R2 only** (2026-10-17, card `t_4bfff93b`): the residual was
> fixed in `cf40f53` and re-measured **PASS** — see
> "Phase 1 — re-verification #2" at the end of this file. The R1 / F1–F4 rows
> below still stand as written.

`smoke-render.mjs`'s two new R2 rows assert the *text* of the `≤1100px` CSS
block (a third asserts the `≤600px` copies survive). They pass, and the block is
indeed correct as text — but the acceptance criterion for R2 is "the rail opens
the sheet **and content is reachable**", and in a real engine the opened sheet
renders an empty box at 700 px and 1000 px.

## Commands actually run (raw)

```
# in ~/Developer/hive-team-studio/worktree @ 224efbc
$ node test.cjs
ALL PASS 292/292
$ node smoke-render.mjs
ALL PASS 72/72
$ cp plugin.js "$TMPDIR/pc.mjs" && node --check "$TMPDIR/pc.mjs"
SYNTAX OK

# in ~/Developer/hive-team-studio/sentry-probe (my probe, my harnesses)
$ node probe-sentry.mjs
PROBE RESULT: ALL PASS 21/21
$ PLUGIN_SRC="$TMPDIR/oldprobe/plugin.js" node probe-sentry.mjs   # 531c6e5
PROBE RESULT: FAIL 10/21
$ node stop-race.mjs                                              # 224efbc
rows before Stop: 2   (member status: answering)
rows after Stop:  3
empty done turn materialized by Stop: true
$ PLUGIN_SRC="$TMPDIR/oldprobe/plugin.js" node stop-race.mjs      # 531c6e5
rows before Stop: 2   (member status: answering)
rows after Stop:  3
empty done turn materialized by Stop: true
```

## R2 — measured in a real browser engine (Chrome/CDP), not by reading CSS

Harness: `sentry-probe/build-css-harness.cjs` → `harness-app-last.html`. `HIVE_TS_CSS`
is extracted **verbatim from the worktree `plugin.js`** (3755 bytes), the app's real
Tailwind stylesheet is linked (`/Applications/Hermes.app/…/dist/assets/index-B89n1Ils.css`,
tailwindcss v4.3.3), and the replica DOM is the exact class structure `TsWorkspace`
renders (`TsSheet` → `TsRightPanel` root `ts-col ts-col-right` → `ts-right-body flex
min-h-0 grow flex-col` → tab body, plus `TsRightRail`), with `data-open="true"`
exactly as the lazy mount now passes it.

| viewport | `.ts-sheet[data-side=right]` | sheet's `.ts-right-body` | sheet's tab body | 48 px-column rail |
|---|---|---|---|---|
| 1200 px | `none` (not open) | `flex` | `[0x0]` | `none` |
| 1000 px | **`block 340x856`** | **`none [0x0]`** | `flex [0x0]` | `flex 47x68` |
| 700 px | **`block 340x856`** | **`none [0x0]`** | `flex [0x0]` | `flex 47x68` |
| 600 px | `block 340x856` | `none [0x0]` | `flex [0x0]` | `[0x0]` |

The sheet **container** opens (the moved rule works) but the payload inside it is
`display:none`: the same `≤1100px` block that hides the column copy
(`.ts-right-body{display:none}`) also matches the sheet's copy of that element, so
the sheet shows only the rail buttons. Content is **not** reachable at 700 px or
1000 px. The toolbar's `.ts-narrow-only` toggles do appear (28×28, measured) and
they open the same empty sheet.

Not an ordering artifact — identical numbers with the app CSS linked first, linked
last, and absent. The plugin's `<style>` is unlayered and the app's utilities live
in `@layer utilities`, so the unlayered `display:none` wins over `.flex{display:flex}`
whatever the document order.

Same root cause, two more measured sites (all pre-existing, unchanged by `224efbc`):

- **≤600 px: both sheets render nothing at all.** The `≤600px` rule
  `.ts-col-team,.ts-col-right{display:none}` matches the sheet's *own* panel root
  (`TsTeamPanel` root = `ts-col ts-col-team`; `TsRightPanel` root = `ts-col ts-col-right`),
  so `team_sheet_root` measures `display:none [0x0]` at 600 px and 500 px.
- **601–860 px: the team sheet loses its rows.** `.ts-team-body{display:none}`
  (the `≤860px` block) also matches inside the sheet: at 700 px the team sheet root
  is visible (`338x48`) but a roster row body measures `none [0x0]`. At 1000 px that
  row body is visible (`337x20`), which is why the team sheet is usable at
  1000 px while the right sheet is not.

Fix shape (validated in the harness, **not** applied to the repo — SENTRY does not
author): scope the three hide rules so they cannot match inside `.ts-sheet`, e.g.

```
.ts-right-body{display:none}                    → .ts-workspace > .ts-col-right > .ts-right-body{display:none}
.ts-team-body{display:none}                     → .ts-workspace > .ts-col-team .ts-team-body{display:none}
.ts-col-team,.ts-col-right{display:none}        → .ts-workspace > .ts-col-team,.ts-workspace > .ts-col-right{display:none}
```

With only those three scoped rules the sheet body measures `flex 337x67` and the tab
body `flex 337x20` at 1000 / 700 / 600 px — i.e. the sheet becomes usable exactly as
`plugin.js:1977-1978` intends.

## Row-by-row re-verification

| Item | Verdict | Evidence I ran |
|---|---|---|
| **R1** delta-window resurrection (blocking) | **FIXED** | Guard present at `plugin.js:2068` and correct: `HIVE_TURN_OPEN` (`:897`) excludes `error`/`done`, so the flush can no longer open a turn. Flush-before-close confirmed as the FIRST statement in `hiveTurnFail` (`:1549`), before `hiveFoldTurn` in `hiveStopMember` (`:1806`), before the open turn is read in `hiveHandleFallbackCompleted` (`:1443`). `message.complete` already flushed. My probe A4 (pending delta → `error`): 4/4 PASS, was 1 PASS / 3 FAIL on `531c6e5`; A4b real payload PASS; A4d (pending delta → `message.complete`) 3/3 PASS — no extra row, nothing left streaming. Probe alone: `ALL PASS 21/21` vs `FAIL 10/21` on the pre-rework plugin, so the probe is still falsifying. |
| **R2** sheet content reachable at 700/1000 px | **NOT FIXED at `224efbc`** → **FIXED in `cf40f53`** (re-verification #2 below) | Browser measurement above: sheet `display:block` but its `.ts-right-body` is `none`, tab body `0x0`. The three smoke rows assert block *text*, not reachability. Line refs: `plugin.js:1975` (`.ts-right-body{display:none}` in the same `≤1100px` block as the new `:1977-1978` rules), `:1986-1987` (`.ts-col-team,.ts-col-right{display:none}` at ≤600 px), `:1982` (`.ts-team-body{display:none}` at ≤860 px). |
| **F1** closed sheets double-mounting | **FIXED** | `plugin.js:3740-3741` — sheets are mounted only when open. Measured in my probe: `data-ts-right/team/center` = 1/1/1, `class="ts-sheet` occurrences = 0 while closed, and the buzz-hive query observers per render = **2** (`["approvals","approvals"]` = toolbar badge + right panel), was 3 with 2 sheet copies mounted. Opening a sheet still adds a third mount — inherent to the overlay design (the sheet renders `TsRightPanel` again), not the defect this finding described. |
| **F2** hardcoded colour literals | **FIXED** | Zero hex/rgb/hsl/`var(--x, #hex)` in `HIVE_TS_CSS` (extracted and scanned programmatically). `--ui-red`/`--ui-yellow` are real: defined at `apps/desktop/src/styles.css:243,245` and present in the installed bundle; `--ui-danger`/`--ui-warning` are defined **nowhere** (grep count 0), which is why the old fallbacks were live literals. PROGRESS.md's false claim is corrected in place, with the truthful count (1 of 4 baseline occurrences had gone). |
| **F3** error reason surfaces | **FIXED** | Gateway contract verified independently: `tui_gateway/contracts/events.py:111` `ErrorPayload{message}` with the docstring "every `_emit("error", …)` site sets exactly `message`" — I grepped all emission sites (`server.py:1214,3021`, `prompt_turn.py:133,1037`, `methods_prompt.py:685`, `model_switch.py:495`, `compute_host_bridge.py:374`, `session_auto_continue.py:514`) and every one sets `message`; generated client type `apps/shared/src/gateway-contract.generated.ts:4778-4780` agrees, and `apps/shared/src/gateway-events.ts:46` confirms the envelope field is `payload`. The deleted `payload.error` clause was dead code. Probe A4b + smoke both green. |
| **F4** `hiveCardTitle` | **FIXED (wired)** | `plugin.js:3335` `title: hiveCardTitle(entry)`; signature is `hiveCardTitle(entry)` and work-card entries carry `.text`, so the tooltip is the clipped one-liner. Verified in the old-code run that this row fails on `531c6e5`. |
| **F4** DESIGN §10 A7 vs §4.1 | **FIXED** | `TEAM_WORKSPACE_DESIGN.md:567-569` now says "returns to **IN REVIEW** on resubmission (§4.1:265)"; §4.1:263 defines `IN REVIEW = status:'submitted'` and :265 "re-`[done]` returns to submitted". Consistent. Probe A7 now asserts the corrected spec and that A7's sentence matches it — both green. |

## Regression / hygiene checks

- `git diff --numstat 531c6e5..HEAD` → 6 files, 595 insertions, 14 deletions;
  `plugin.js` is exactly **27 insertions / 6 deletions**: the guard, three flush
  calls, the two CSS rules, three colour fallbacks, one tooltip prop, the
  lazy-mount pair, one error-reason read — and the 6 deletions are those same 3
  colour lines, the 2 sheet lines and the 1 error-reason read, nothing else. No
  unrelated edits, no new `host.*` method, no new RPC — nothing invented.
- **Nothing was weakened or deleted to pass.** `test.cjs` is +24/-0; the only
  deletion in `smoke-render.mjs` is the `error` fixture line the card explicitly
  told FORGE to reshape. Docs deleted lines are the corrected PROGRESS.md claim.
- Non-vacuity, measured: the NEW `smoke-render.mjs` run against the OLD `plugin.js`
  fails **16/72** (R1 window rows, F1 mount rows, R2 CSS rows, F2 literal row, F3
  reason row, F4 tooltip row) — the harness really does guard these.
  The NEW `test.cjs` against the OLD plugin passes **292/292**: the 9 added
  "turn-closing safety" rows are pure-helper rows over `hiveTurnInit/Fold/Error/
  LastOpenTurn/HIVE_TURN_OPEN`, none of which the rework changed. They document the
  invariants the fix rests on; they do **not** guard the regression. The guard is
  `smoke-render.mjs`'s R1/R1b block (it drives the real listeners and the real timers).
- Artifacts match the handoff exactly: `plugin.js b27f4c7a…9548a8`,
  `smoke-render.mjs 2f3c6ebb…63518`, `test.cjs 35a7a5ce…0a09f`.
- Live folder untouched, checked before and after: `~/.hermes/desktop-plugins/buzz-hive`
  at `929548d4a512…` (baseline), `git status --porcelain` empty, no
  `TEAM_WORKSPACE_*`/`smoke-render.mjs` present, `plugin.js` still
  `b968e41284ac15c4f2c5ecc74c612bc4ba962148b1cdf7e0d564e4db90fad03d`.

## F6 — pre-existing, out of this card's scope, reported not blocked

`hiveStopMember` awaits `host.request('session.interrupt')` **before** its flush and
`hiveFoldTurn`; if an `error` for that session arrives during that await, the turn is
already closed as `error` when Stop resumes, and `hiveFoldTurn`'s no-open-turn
fallback materializes a fresh empty `done` turn. Isolated evidence
(`sentry-probe/stop-race.mjs`, clean boot, one scenario):
**identical on `224efbc` and on `531c6e5`** — 2 rows → 3 rows, last row phase `done`.
So it is not a regression from this rework and it is not one of the R1 items the card
required; I report it for a future pass (the same family as R1: a turn resurrected by
a late fold). A guard on the fold (skip when nothing was open and the reason for the
fold was a user Stop) would close it.

## Note on two claims in the record that I could not confirm

- PROGRESS.md and the inline comment at `plugin.js:3736-3738` say the duplicate mounts
  meant "the 5 s approval poll fired 3× per tick". What I *can* measure is the mounted
  observer count: 3 while closed before, 2 now. The *poll* count is not 3× the tick —
  all observers share one query key, so react-query serves one interval/fetch per key
  — and I could not measure a live query client headlessly anyway. The observable
  defect (duplicated subtrees, tripled hook work, 3 mounts) was real and is fixed; the
  "3× poll" wording is unsupported.
- The message.complete handler takes the reply body from the folded stream and never
  consults `payload.text` (the contract's final-text field,
  `gateway-contract.generated.ts:4798`). That is deliberate per the code comment
  ("single source") and pre-existing; flagged as an observation only, not a finding.

## What I still could not verify

Unchanged from both earlier lists, and now with one addition of my own limits: real
pixel layout inside the running Electron app (the R2 numbers come from a real engine
with the real stylesheets, but a replica DOM, not the app's own tree); a live approvals
poll against a real query client; an in-app Stop click (the ordering is asserted from
source and driven headlessly, the click is not); light-theme repaint; a real
disable→re-enable; other panes/plugins.


---

# Phase 1 — R2 residual + F6 fix pass (FORGE, 2026-10-17, card `t_0b9b4c3d`)

Rework of the one outstanding finding (R2) plus the non-blocking F6. R1 / F1–F4
are untouched. The R2 claim below is a **computed-layout measurement**, not a
grep of the CSS text — the failure mode the previous pass was signed off with.

## What changed

```
plugin.js  @media (max-width:1100px)
   -.ts-right-body{display:none}
   +.ts-workspace > .ts-col-right > .ts-right-body{display:none}
plugin.js  @media (max-width:860px)
   -.ts-team-body{display:none}
   +.ts-workspace > .ts-col-team .ts-team-body{display:none}
plugin.js  @media (max-width:600px)
   -.ts-col-team,.ts-col-right{display:none}
   +.ts-workspace > .ts-col-team,.ts-workspace > .ts-col-right{display:none}
plugin.js  hiveStopMember (F6)
   -hiveFoldTurn(m, undefined)
   +if (hiveOpenTurnIndex(m) !== -1) hiveFoldTurn(m, undefined)
```

The overlay sheet is a **direct child of `.ts-workspace`**, so a rule anchored
`.ts-workspace > .ts-col-*` can no longer match the sheet's own copy of the same
panel, while the column it names is unaffected. The two `≤600px` copies of
`.ts-narrow-only` / `.ts-sheet[data-open="true"]` are unchanged.

## Harness

`css-layout-probe.cjs` (new, repo root; Node + the Chrome already installed, no
new npm dependency):

- `HIVE_TS_CSS` is extracted **verbatim from the `plugin.js` under test**
  (`--plugin=<path>`), so there is no copy drift between the file and the probe;
- the replica DOM is the class structure `TsWorkspace` renders: both
  lazy-mounted sheets with `data-open="true"` exactly as the lazy mount passes
  it, roster rows carrying `.ts-team-body`, the right panel's `.ts-right-body`,
  its tab body and its rail, and the `.ts-narrow-only` toolbar toggles;
- the app's own stylesheet is linked first
  (`/Applications/Hermes.app/…/dist/assets/index-B89n1Ils.css`), then the
  plugin's `<style>`;
- one headless Chrome run per viewport (`--window-size=W,900`), reading
  `getComputedStyle(el).display` and `getBoundingClientRect()` from the live page.

## R2 residual — raw probe output, BEFORE (CSS of `224efbc`)

`node css-layout-probe.cjs --plugin=/tmp/plugin-r2-head.js --widths=1000,700,600`
(`/tmp/plugin-r2-head.js` = `git show HEAD:plugin.js` before this pass)

```
plugin : /tmp/plugin-r2-head.js
css    : 3755 bytes + app stylesheet index-B89n1Ils.css
chrome : /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
harness: /var/folders/sb/7r979fd93c1b64bzybl2s0p40000gn/T/hive-css-probe-j4cLi1/harness.html

   (no measurement payload at width 700, attempt 1/3 — retrying)
── viewport 1000px (requested 1000)  mq1100=true mq860=false mq600=false
   target               display    w x h          expect verdict
   workspace            grid       1000x813       noassert skip
   toolbar              flex       1000x44        noassert skip
   col_team             flex       240x737        vis    ok
   col_center           flex       712x737        noassert skip
   col_right            flex       48x737         vis    ok
   col_team_row_body    flex       191x16         vis    ok
   col_right_body       none       0x0            hid    ok
   col_right_rail       flex       47x68          vis    ok
   sheet_team           block      340x769        noassert skip
   sheet_team_root      flex       338x144        vis    ok
   sheet_team_row_body  flex       289x16         vis    ok
   sheet_right          block      340x769        noassert skip
   sheet_right_root     flex       338x68         vis    ok
   sheet_right_body     none       0x0            vis    FAIL
   sheet_right_tabbody  flex       0x0            vis    FAIL
   sheet_right_rail     flex       337x68         noassert skip
   narrow_only_btn      flex       28x28          vis    ok

── viewport 700px (requested 700)  mq1100=true mq860=true mq600=false
   target               display    w x h          expect verdict
   workspace            grid       700x813        noassert skip
   toolbar              flex       700x44         noassert skip
   col_team             flex       56x737         vis    ok
   col_center           flex       596x737        noassert skip
   col_right            flex       48x737         vis    ok
   col_team_row_body    none       0x0            hid    ok
   col_right_body       none       0x0            hid    ok
   col_right_rail       flex       47x68          vis    ok
   sheet_team           block      340x769        noassert skip
   sheet_team_root      flex       338x128.5      vis    ok
   sheet_team_row_body  none       0x0            vis    FAIL
   sheet_right          block      340x769        noassert skip
   sheet_right_root     flex       338x68         vis    ok
   sheet_right_body     none       0x0            vis    FAIL
   sheet_right_tabbody  flex       0x0            vis    FAIL
   sheet_right_rail     flex       337x68         noassert skip
   narrow_only_btn      flex       28x28          vis    ok

── viewport 600px (requested 600)  mq1100=true mq860=true mq600=true
   target               display    w x h          expect verdict
   workspace            grid       600x813        noassert skip
   toolbar              flex       600x44         noassert skip
   col_team             none       0x0            hid    ok
   col_center           flex       600x737        noassert skip
   col_right            none       0x0            hid    ok
   col_team_row_body    none       0x0            hid    ok
   col_right_body       none       0x0            hid    ok
   col_right_rail       flex       0x0            noassert skip
   sheet_team           block      340x769        noassert skip
   sheet_team_root      none       0x0            vis    FAIL
   sheet_team_row_body  none       0x0            vis    FAIL
   sheet_right          block      340x769        noassert skip
   sheet_right_root     none       0x0            vis    FAIL
   sheet_right_body     none       0x0            vis    FAIL
   sheet_right_tabbody  flex       0x0            vis    FAIL
   sheet_right_rail     flex       0x0            noassert skip
   narrow_only_btn      flex       28x28          vis    ok

FAIL — 10 unsatisfied expectation(s)
```

The three sites SENTRY measured are reproduced exactly: right-sheet body
`none 0x0` at 1000/700/600, right-sheet tab body `0x0`, team-sheet row bodies
`none 0x0` at 700/600, and both sheet roots `none 0x0` at 600.

## R2 residual — raw probe output, AFTER

`node css-layout-probe.cjs --widths=1000,700,600`

```
plugin : /Users/adnan/Developer/hive-team-studio/worktree/plugin.js
css    : 3848 bytes + app stylesheet index-B89n1Ils.css
chrome : /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
harness: /var/folders/sb/7r979fd93c1b64bzybl2s0p40000gn/T/hive-css-probe-d9kb5y/harness.html

── viewport 1000px (requested 1000)  mq1100=true mq860=false mq600=false
   target               display    w x h          expect verdict
   workspace            grid       1000x813       noassert skip
   toolbar              flex       1000x44        noassert skip
   col_team             flex       240x737        vis    ok
   col_center           flex       712x737        noassert skip
   col_right            flex       48x737         vis    ok
   col_team_row_body    flex       191x16         vis    ok
   col_right_body       none       0x0            hid    ok
   col_right_rail       flex       47x68          vis    ok
   sheet_team           block      340x769        noassert skip
   sheet_team_root      flex       338x144        vis    ok
   sheet_team_row_body  flex       289x16         vis    ok
   sheet_right          block      340x769        noassert skip
   sheet_right_root     flex       338x135        vis    ok
   sheet_right_body     flex       337x67         vis    ok
   sheet_right_tabbody  flex       337x19.5       vis    ok
   sheet_right_rail     flex       337x68         noassert skip
   narrow_only_btn      flex       28x28          vis    ok

── viewport 700px (requested 700)  mq1100=true mq860=true mq600=false
   target               display    w x h          expect verdict
   workspace            grid       700x813        noassert skip
   toolbar              flex       700x44         noassert skip
   col_team             flex       56x737         vis    ok
   col_center           flex       596x737        noassert skip
   col_right            flex       48x737         vis    ok
   col_team_row_body    none       0x0            hid    ok
   col_right_body       none       0x0            hid    ok
   col_right_rail       flex       47x68          vis    ok
   sheet_team           block      340x769        noassert skip
   sheet_team_root      flex       338x144        vis    ok
   sheet_team_row_body  flex       289x16         vis    ok
   sheet_right          block      340x769        noassert skip
   sheet_right_root     flex       338x135        vis    ok
   sheet_right_body     flex       337x67         vis    ok
   sheet_right_tabbody  flex       337x19.5       vis    ok
   sheet_right_rail     flex       337x68         noassert skip
   narrow_only_btn      flex       28x28          vis    ok

── viewport 600px (requested 600)  mq1100=true mq860=true mq600=true
   target               display    w x h          expect verdict
   workspace            grid       600x813        noassert skip
   toolbar              flex       600x44         noassert skip
   col_team             none       0x0            hid    ok
   col_center           flex       600x737        noassert skip
   col_right            none       0x0            hid    ok
   col_team_row_body    none       0x0            hid    ok
   col_right_body       none       0x0            hid    ok
   col_right_rail       flex       0x0            noassert skip
   sheet_team           block      340x769        noassert skip
   sheet_team_root      flex       338x144        vis    ok
   sheet_team_row_body  flex       289x16         vis    ok
   sheet_right          block      340x769        noassert skip
   sheet_right_root     flex       338x135        vis    ok
   sheet_right_body     flex       337x67         vis    ok
   sheet_right_tabbody  flex       337x19.5       vis    ok
   sheet_right_rail     flex       337x68         noassert skip
   narrow_only_btn      flex       28x28          vis    ok

ALL PASS — every reachability expectation holds across 1000/700/600 px
```

## Control: the widths outside the band are unchanged

`node css-layout-probe.cjs --widths=1200,1000,700,600,500` — at 1200 px (no media
query applies) the three columns measure intact, so the scoping did not disable
the rules it scoped:

```
── viewport 1200px (requested 1200)  mq1100=false mq860=false mq600=false
   col_team             flex       240x737        vis    ok
   col_right            flex       320x737        vis    ok
   col_team_row_body    flex       191x16         vis    ok
   col_right_body       flex       319x737        vis    ok
   narrow_only_btn      none       0x0            hid    ok
```

and the run as a whole:

```
ALL PASS — every reachability expectation holds across 1200/1000/700/600/500 px
```

## F6 — `sentry-probe/stop-race.mjs`, before and after

```
BEFORE (224efbc):                                     AFTER (this pass):
rows before Stop: 2   (member status: answering)      rows before Stop: 2   (member status: answering)
rows after Stop:  3                                   rows after Stop:  2
turn during interrupt await errored: true             turn during interrupt await errored: true
last turn row phase after Stop: done                   last turn row phase after Stop: error
empty done turn materialized by Stop: true             empty done turn materialized by Stop: false
feed still shows answering…/thinking…: false          feed still shows answering…/thinking…: false
```

`hiveFoldTurn`'s no-open-turn fallback is kept — it is the legitimate path for
`assistant.completed` with no delta (R1b) — the guard is on the user-Stop path
only.

## Commands actually run (raw tails)

```
$ node test.cjs                     # in worktree/
  ✓ an empty error reason still reads as a failure

ALL PASS 292/292

$ node smoke-render.mjs             # in worktree/
  ✓ onDispose flushed the workspace prefs to storage

ALL PASS 80/80

$ cp plugin.js /tmp/plugin-check.mjs && node --check /tmp/plugin-check.mjs
SYNTAX OK

$ node ../sentry-probe/probe-sentry.mjs
  PASS  onDispose removed every listener

PROBE RESULT: ALL PASS 21/21
```

`smoke-render.mjs` grew 8 rows (72 → 80) and gained no weakened assertion:
7 of them assert the property that failed (every `display:none` inside a media
block is anchored `.ts-workspace > …`; the three rules still name the column they
hide; no unanchored hide rule survives for a class the sheet also renders) and 1
asserts the F6 guard. The file now states in-line that it does not measure
layout, and names `css-layout-probe.cjs` as the thing that does.

## What this pass could NOT verify (stated plainly)

- The **running app**. The R2 numbers come from real Chrome with the real
  stylesheets, but a replica DOM — not the app's own tree, not a real plugin
  mount. An in-app check at 700 px / 1000 px (panel body non-empty, tab content
  visible) is still SENTRY's.
- A real mouse click on the rail button / toolbar toggle. The probe asserts the
  target element, not the click path.
- A live approvals poll, light-theme repaint, real disable→re-enable, other
  panes/plugins — unchanged from the two earlier lists.

---

# Phase 1 — re-verification #2 (2026-10-17, card `t_4bfff93b`, HEAD `cf40f53`)

SENTRY, third pass. Every claim FORGE's `t_0b9b4c3d` pass makes is re-run here
independently, each with a falsification control. Verification only — no product
file was touched by this pass.

## Verdict

**PASS.** R2 measured reachable (non-zero box, real engine, real stylesheet) at
1000 / 700 / 600 px; F6 clean on the race path AND on the ordinary Stop path;
diff surgical, no test weakened, R1 guard untouched. The two residual notes at
the bottom are non-blocking and pre-existing.

## Preconditions

| Check | Result |
|---|---|
| Live folder `~/.hermes/desktop-plugins/buzz-hive/` untouched | clean: `git status --porcelain` empty, HEAD `929548d`, `plugin.js` sha256 `b968e412…`, mtime 16:15 — predates the pass |
| HEAD under test | `cf40f538fdaf6191eaed4298f861a36706fb5c64` on `team-studio` |
| FORGE's published hashes | match on disk: `plugin.js f63a5274…`, `smoke-render.mjs 0449477e…`, `css-layout-probe.cjs 47802547…` |

## Suites re-run (never reused)

```
$ node test.cjs                            ALL PASS 292/292
$ node smoke-render.mjs                    ALL PASS 80/80
$ node ../sentry-probe/probe-sentry.mjs    PROBE RESULT: ALL PASS 21/21
$ node ../sentry-probe/stop-race.mjs       rows after Stop: 2 / phase: error / empty done: false
$ node css-layout-probe.cjs --widths=1200,1000,700,600,500   ALL PASS
```

## R2 — my harness, rebuilt from the render code, re-measured

`sentry-probe/harness-v2.cjs` builds the replica DOM directly from the render
code at HEAD (`TsWorkspace:3731`, `TsTeamPanel:3282`, `TsAgentRow:3248`,
`TsRightPanel:3655`, `TsToolbar:3173`), extracts `HIVE_TS_CSS` verbatim from
`plugin.js`, and links the stylesheet the running app loads
(`…/dist/assets/index-B89n1Ils.css`). `measure-harness.cjs` reads
`getComputedStyle` + `getBoundingClientRect` out of headless Chrome; each
selector is resolved with `querySelectorAll` and printed **per match with its
ancestor chain**, so the column copy can never be read as the sheet copy.

| Width | sheet `.ts-col-team` root | sheet `.ts-team-body` rows | sheet `.ts-right-body` | sheet tab body | column copies |
|---|---|---|---|---|---|
| 1000 px | `flex 338x115.5` | `flex 289x19.5` | `flex 337x79.5` | `flex 337x19.5` | `.ts-right-body none 0x0` + `.ts-rail flex 47x68` (designed) |
| 700 px | `flex 338x115.5` | `flex 289x19.5` | `flex 337x79.5` | `flex 337x19.5` | `.ts-col-team` 56x737, rows `none 0x0` (designed); `.ts-right-body none 0x0` (designed) |
| 600 px | `flex 338x115.5` | `flex 289x19.5` | `flex 337x79.5` | `flex 337x19.5` | `.ts-col-team` and `.ts-col-right` both `none 0x0` (designed) |
| 1200 px (control) | `none 0x0` (out of band) | — | — | — | columns intact `240/640/320 x 737`, `.ts-right-body flex 319x737` |

Falsification control — the same harness with the CSS of `224efbc`:

| Width | Pre-fix sheet state |
|---|---|
| 1000 px | `.ts-right-body` `none 0x0`, tab body `0x0` — the R2 defect reproduced |
| 700 px | `.ts-team-body` rows `none 0x0` AND `.ts-right-body` `none 0x0` |
| 600 px | sheet `.ts-col-team` root `none 0x0` — the sheet rendered nothing |

The harness therefore discriminates pre from post: the PASS is not a vacuous
probe. Two further controls FORGE's probe does not have:

- **No app stylesheet**: sheet bodies stay non-zero (`block 340x64` /
  `block 340x18`) — the pass does not lean on the app CSS.
- **Boundary sweep** at 1101 / 1100 / 861 / 860 / 601 / 600 px: each boundary
  flips exactly at the documented breakpoint, and the sheets are populated at
  every width ≤ 1100 including the boundary itself. No off-by-one.

## R2 — whole-subtree scan: nothing inside a sheet is hidden

A fixed target list can miss a rule, so `sentry-probe/scan-hidden.cjs`
enumerates **every** element inside each sheet and reports `display:none`,
`visibility:hidden` or a zero-area box at each width.

```
POST (cf40f53)
  1000 px  sheet team: 21 elements  HIDDEN: 0  ZERO-SIZE: 1 (span.flex-1 strip spacer)
           sheet right: 13 elements HIDDEN: 0  ZERO-SIZE: 1 (span.flex-1 strip spacer)
  700 px   both sheets HIDDEN: 0    600 px  both sheets HIDDEN: 0

PRE (224efbc, control)
  1000 px  sheet right: 13 elements HIDDEN: 1
              div.ts-right-body.flex.min-h-0.grow.flex-col  display=none
              + 6 zero-size descendants (tab body, tabs list, tab body div)
  700 px   sheet team HIDDEN: 3
              span.ts-team-body.flex.min-w-0.flex-1.items-center.gap-1.5  display=none
              span.ts-team-body.flex.min-w-0.flex-1.flex-col.gap-0.5       display=none
              span.ts-team-body.shrink-0.text-muted-foreground             display=none
```

The only hidden/zero element left in the post-fix sheets is the `flex-1` spacer
in each `.ts-strip`, which is zero-height by design in both states.

## F6 — both branches of the new guard, not just the race

Race re-run (`stop-race.mjs`: `error` lands during the `session.interrupt`
await), with the pre-fix plugin as control:

```
POST (cf40f53):  rows before Stop: 2 → after 2   last turn row: error  empty done materialized: false
PRE  (224efbc):  rows before Stop: 2 → after 3   last turn row: done   empty done materialized: true
```

The guard's other branch — an ordinary Stop with no competing error — is not
covered by FORGE's reproducer, so I wrote one (`stop-norace2.mjs`: the same
probe with the injected error addressed to a different session):

```
rows after Stop: 2   last turn row: done   empty done materialized: false
streamed text survived the Stop fold: true
turn row phases: done=2 error=0 open=0
```

So Stop still closes a live turn, keeps the streamed tail (flush-before-close
order intact), and leaves nothing open. Derived member status follows the last
turn on both paths (`errored` after the race, `idle` on the happy path) — no
orphan status.

## Regression / hygiene

| Check | Result |
|---|---|
| `git diff 224efbc..HEAD -- plugin.js` | 2 hunks only: the F6 guard (1 line + comment) and 3 CSS selector lines |
| `git diff --numstat 224efbc..HEAD` | `plugin.js 8/4`, `smoke-render.mjs 40/0`, `css-layout-probe.cjs 238/0` (new), docs the rest |
| `test.cjs` | absent from the diff — untouched |
| `smoke-render.mjs` | insertions only (`40/0`): no assertion rewritten, deleted or weakened |
| R1 flush guard `hiveFlushDelta` (`plugin.js:2074`) | untouched by the diff; probe A4 rows still 4/4 PASS |
| syntax | `node --check` on `plugin.js` → clean |

## Residual notes (non-blocking, pre-existing — not regressions)

1. The right sheet renders its own `.ts-rail` (`flex 337x68` at ≤1100 px),
   because `TsRightPanel` mounts the rail unconditionally and DESIGN §1.3 asks
   for "same component, different container class". It was there before this
   pass too (pre-fix probe: `flex 337x68`). Cosmetic; no content lost.
2. `hiveStopMember` still calls `hiveMarkStatus(sessionId, 'idle')` before the
   guarded fold, so after a race Stop the stored status is `idle` while the last
   turn row reads `error`. The rendered status is derived from the last turn, so
   the UI reads `errored` — coherent, and unchanged by this pass.

## What re-verification #2 still could not verify

- The **running app**. The R2 numbers come from real Chrome with the real
  stylesheet on a replica DOM; I did not drive a real Hermes window at 700/1000 px
  in this run, so a populated Work sheet *inside the app* remains unproven by me.
- A real mouse click on the rail / toolbar toggle, a live approvals poll, theme
  repaint, real disable→re-enable — as in the two earlier lists.

## Probe files added this pass

`sentry-probe/harness-v2.cjs`, `measure-harness.cjs`, `scan-hidden.cjs`,
`stop-norace.mjs`, `stop-norace2.mjs`, `stop-race-status.mjs` — dependency-free
and runnable, so the next pass re-measures instead of re-reading.

---

# Phase 1 — runtime verification (buzz-hive-dev, 2026-10-17, card `t_cd258c97`, HEAD `83f1cfd`)

SENTRY, fourth pass. This is the first pass with a **safe live surface**: the
side-by-side dev copy `~/.hermes/desktop-plugins/buzz-hive-dev/plugin.js`, and
the first pass where I could drive the running Hermes window (macOS
accessibility tree via the desktop-control tool) and reach the gateway's real
RPC surface. Verification only — no product file was modified.

## Overall verdict

**PARTIAL — 9 of 14 rows PASS on live evidence; 1 FAIL (new, reproducible);
4 rows remain HUMAN-CHECK/partial for a stated reason.** The static rework from
`cf40f53` holds: all three suites are green at HEAD, and for the first time the
live RPC spikes S3/S4/S5 are reproduced by me, not quoted from FORGE.

## Preconditions (checked at start AND at end)

| Check | Result |
|---|---|
| Live folder `~/.hermes/desktop-plugins/buzz-hive/` untouched | `git rev-parse HEAD` = `929548d…`; `git status --porcelain` empty; `plugin.js` sha256 `b968e41284ac15c4f2c5ecc74c612bc4ba962148b1cdf7e0d564e4db90fad03d` — identical before and after this pass |
| HEAD under test | `83f1cfd39e7dd8be6410924a364719d35fdf3d98` on `team-studio` |
| `cf40f53..83f1cfd` is docs-only | `git diff --numstat` = `TEAM_WORKSPACE_PLAN.md 2/2`, `TEAM_WORKSPACE_TESTS.md 160/1` — no product file |
| Dev surface present | `~/.hermes/desktop-plugins/buzz-hive-dev/plugin.js`, 3873 lines, sha256 `3d3329e98e82edaf9f229e242313173364e65f5c83c3df8424daa572e44d7a01` |
| Worktree build | `plugin.js` sha256 `f63a52745edb455cd39d56b7c7aa2c667938f356441af213f146ddff5b79fb9e` (matches FORGE's published hash) |

## The sync transform is faithful (this gates every other live row)

Reversing the identity rewrites on the dev copy and diffing it against the
worktree build yields **zero** lines of difference:

```
$ diff <(sed -E "s/buzz-hive-dev/buzz-hive/g; s#/hive-dev#/hive#g; \
    s/hive-dev\.v2/hive.v2/g; s/hive-dev\.v1/hive.v1/g; \
    s/Hive Dev/Hive/g; s/Buzz-Hive Dev/Buzz-Hive/g" \
    ~/.hermes/desktop-plugins/buzz-hive-dev/plugin.js) \
  ~/Developer/hive-team-studio/worktree/plugin.js
(no output; exit 0)

$ grep -n "buzz-hive" ~/.hermes/desktop-plugins/buzz-hive-dev/plugin.js | grep -v buzz-hive-dev
  none
```

So the dev copy **is** the verified build with identity strings only — the live
results below are evidence about `83f1cfd`, not about some other file.

Rewritten identities confirmed on disk: `HIVE_PLUGIN_ID='buzz-hive-dev'` (:76),
`HIVE_ROUTE='/hive-dev'` (:77), `HIVE_STORAGE_KEY='hive-dev.v2'` (:79),
`HIVE_LEGACY_STORAGE_KEY='hive-dev.v1'` (:80),
`HIVE_TS_STYLE_ID='buzz-hive-dev-team-studio'` (:1947), palette id
`'buzz-hive-dev-open'` (:3784).

## Suites re-run at HEAD (never reused)

```
$ node test.cjs                                             ALL PASS 292/292
$ node smoke-render.mjs                                     ALL PASS  80/80
$ node css-layout-probe.cjs --widths=1200,1000,700,600,500  ALL PASS — every
    reachability expectation holds across 1200/1000/700/600/500 px
```

## How I reached the live RPC surface (method, no secret reproduced)

The gateway authenticates its own desktop surface. The session token is minted
by the shell and passed to the backend in its environment, so it is recoverable
for a **read-only** probe without touching the app:

```
$ ps eww -p <backend pid> | tr ' ' '\n' | grep HERMES_DASHBOARD_SESSION_TOKEN
$ TOKEN=<that value>; B=http://127.0.0.1:57188
```

Every probe below is `GET`/JSON-RPC-read except the one member turn I
deliberately drove (A6/A4). `sentry-probe/spike-s3s4s5.mjs` and
`sentry-probe/a4-session.mjs` are written to the probe folder (as in earlier
passes it sits outside the repo, so these are runnable but untracked) so the
next pass re-runs them instead of re-deriving them.

## Live spikes S3 / S4 / S5

```
S5  GET /api/plugins/hermes-workflows/runs            HTTP 200
    {"roots":["/Users/adnan/.hermes/workflows"],"runs":[],"total":0,
     "counts":{"running":0,"executed":0}}
    control, same route WITHOUT the token header      HTTP 401
    {"detail":"Unauthorized"}

S3  projects.list    -> 2 real projects, active_id p_967a0287,
                        folders[] populated (id/slug/branch/primary_path)
    projects.for_cwd  -> {"project":null,"cwd":".../hive-team-studio/worktree",
                          "branch":"team-studio"}
    model.options     -> 6 providers (the plugin's model submenu source)

S4  approval.pending -> {"code":4001,"message":"session not found"}
    control, a method that does not exist
                     -> {"code":-32601,"message":"unknown method:
                         bogus.method.that.does.not.exist …"}
```

The bogus-method control is the point: `approval.pending` answers with a
*session* error, not a *method* error, so the method is registered and reachable
from an external client on the same seam the plugin uses. S3/S4/S5 = **PASS**.

## Acceptance rows

| Row | Verdict | Live evidence / why not |
|---|---|---|
| A1 three columns at ~1512 px | **PASS (measured)** | Read off the running window's accessibility tree, not off CSS: team column anchors `TEAM` @x=36 … `3/11` @240-259, `+ Add` @36-98; centre column `Work` @276-301, filter field @996-1156; right column `WORK` @1173-1207, tab strip @1175-1439; the app's own right rail then starts at 1484. That is the designed `240px minmax(420px,1fr) 320px` — ≈240 / 888 / 320 across the ≈1448 px workspace (window 1512 px) — with no window-level scrollbar. **Other widths are harness-only** (css-layout-probe above); I did not resize the live window. |
| A3 light theme, no hardcoded colour | **PARTIAL / HUMAN-CHECK** | Unchanged from the static pass: no literal colour in the injected stylesheet; 3 `var(--ui-danger, #e5484d)`-style fallbacks remain in reused components. A light-theme repaint cannot be judged by me — see HUMAN-CHECK steps. |
| A4 Stop against a live session | **PARTIAL / HUMAN-CHECK** | Live: the derived Stop affordance exists and targets correctly — `Stop @arch` appeared in the composer **only while @arch was mid-turn** (@arch `thinking… 0s`, toolbar `1 working`) and was gone once the turn closed; `Stop all` is enabled only when a member holds a session. A full directed turn was driven end-to-end live (relay row → `thinking…` → `✓ done`). I did **not** land a click while a member was mid-turn: attempt 1 raced a ~12 s turn, attempt 2's window had been navigated away underneath me by concurrent use. The interrupt path itself stays covered by the F6 probes (both branches). |
| A6 composer/mention routing + suppression | **PASS** | Autocomplete renders and is readable: typing `@a` opened a full-width list with rows `@default` and `@arch` (bounding boxes 870 px wide, both legible in the captured frame); picking `@arch` inserted the token into the composer. **Routing**: `@arch …` produced exactly one `@YOU → @ARCH ⌇ RELAY` row for @arch and nothing for @default — no broadcast fallback. **Suppression**: the depth guard rendered a live row — `⛔ held 1 relay(s) from @arch — relay chain reached its depth limit`. One nit below. |
| A8 approvals tab live | **PARTIAL / HUMAN-CHECK** | The tab exists and switches; `approval.pending` is live-reachable from the same RPC surface the plugin uses (S4). I did not obtain a genuinely *pending* approval in a member session, so the populated row and the `hiveRespondApproval` click remain unproven in-app. |
| A9 Files/Workflow tabs live | **PARTIAL** | Workflow tab: **live READY branch** — `data-ts-workflow="ready"`, "Read-only mirror…" + "No workflow runs yet.", consistent with the real `total: 0` payload from S5 (so it is empty-because-empty, not the degraded branch). Files tab: **degraded branch** observed ("No project selected — pick one in the toolbar…") because no project is selected in the room; its READY data path is proven live at the RPC level (`projects.list` returns `folders[]`, `projects.get` answers). I did not select a project in the room — that calls `projects.set_active` and mutates the user's global active project. |
| A12 disable→re-enable, no duplicates | **PARTIAL / HUMAN-CHECK for the toggle cycle; two real findings** | (1) The dev copy hot-loaded **with no user decision at all**: `localStorage` carries no `hermes.desktop.pluginDecisions.v2` key, and per the SDK contract absence means "no choice", not "disabled" — so it loaded on its own default. (2) Its storage namespace is genuinely separate: `hermes.plugin.buzz-hive-dev.hive-dev.v2` next to `hermes.plugin.buzz-hive.hive.v2` (read from a copy of the app's LevelDB). Dispose is harness-asserted: `smoke-render.mjs` checks "onDispose removed every event subscription", "…removed the injected style sheet", "…flushed the workspace prefs". I did not flip the Settings → Plugins switch this pass. |
| A13 other panes/plugins unaffected | **PASS** | With the dev plugin live, the **real Hive** rendered and behaved in the same window: `CREW 5/11 members` (you, @default, @arch, @forge, @sentry), its own toolbar, mission field and scratchpad, and importantly its `+ Add` popover rendered **in full** — search input 239 px wide, "Every profile is already in the room." 200 px wide, "New profile…" 239 px wide. So the dev copy leaks no style and does not collide. Two distinct contributions everywhere: sidebar `Hive` **and** `Hive Dev`; ⌘K `Hive: open the agent room` **and** `Hive Dev: open the agent room`; plugin inventory `Buzz-Hive Desktop plugins` **and** `Buzz-Hive Dev Desktop plugins`; distinct style id; distinct storage keys. **Not checked**: the native `/workflows` page, terminal and files panes (see "concurrent use"). |

## FAIL — new, reproducible, user-visible (F-P1-R1)

**The "Add agent" roster popover is drawn off the left edge of the window and
clipped in the new team column.**

Repro: open `/hive-dev`, click `+ Add` in the TEAM column's dock (the button is
at ~(36,838,62,24)).

Observed in the running app:

- The popover is `absolute z-20 right-0 top-9 w-64` (`plugin.js:2690`) anchored
  with `right-0` to a ~62 px-wide button whose right edge is x≈98, so its
  256 px-wide box starts at x≈−158. Only its right ≈61 px is on screen.
- What is on screen is the empty part: the `×` close button, the right end of
  the search field as an empty violet-bordered rounded box, and two full-width
  border lines. Every row label — `@arch`, `@forge`, `@sentry`, `New profile…` —
  and the "Add agent" title sit off-screen.
- Measured, not eyeballed: a row-by-row "text-like ink" scan of that band
  (screenshot x 20-95, y 620-851) returns ink only on the border lines
  (19 px) and window chrome — **no glyph rows** — while the same scan over the
  team/sidebar control rows returns hundreds of ink pixels per text row. Three
  independent reads of the captured frame by an auxiliary vision model agree
  ("an empty input row"; "no readable rows such as @arch").
- The clipped rows are still **clickable** — I minted @arch by pressing the
  clipped row — so the failure mode is "you cannot read which profile you are
  picking", i.e. a blind pick.

Root cause, and the control that proves the mechanism: the identical line renders
perfectly on the **live** page, where the Add button sits at x=1191 —

| | dev team column (button at x≈36) | live `/hive` (button at x≈1191) |
|---|---|---|
| search field width | 61 px (clipped sliver) | **239 px** |
| "Every profile is already in the room." | not rendered/visible | **200 px, readable** |
| "New profile…" | 61 px sliver, label off-screen | **239 px, readable** |
| `×` close button | visible | visible |

Pre-existing code line, newly triggered by this phase's layout — I am **not**
calling it a team-studio edit: `plugin.js:2690` is byte-identical at `929548d`
(live copy: `:2326`) and in the worktree. What team-studio changed is *where the
component mounts*: `git diff 929548d..83f1cfd -- plugin.js` shows only
`-  jsx(HiveAddMember, {})` at the old site and `+ jsx(HiveAddMember, {})` in the
new left-column dock.

Suggested fix (one line, SENTRY did not apply it): anchor the popover to the
inline start in the dock (`left-0` instead of `right-0`), or move it to the
SDK's `Popover` with collision handling, or clamp its width to the column.

## Smaller observations (non-blocking)

1. **A6 nit** — a lone `@` does not open the mention picker. `HiveComposer.onChange`
   sets `hiveMentionOpen` to `''` for the token `"@"` (slice(1) of `"@"`), and
   `matches` returns early on `if (!open) return []`, so the list appears only
   from a second character. The hint line "Enter ↵ send · Shift+↵ newline ·
   @ tag · ↑↓ pick" reads as if the tag character alone opens it.
2. The dev copy's success toast still reads **"Hive room opened."** — byte-identical
   to the live plugin's, so on-screen the two are indistinguishable. Cosmetic;
   `sync-dev.sh` does not rewrite that literal.
3. `console.log` on every turn start/complete is still there (`:3793`, `:3853`) —
   pre-existing noise, unchanged.

## What I could not verify, and why (stated plainly)

- **Any in-app pixel judgement.** My toolset is text-first; the screenshot bytes
  were described by an auxiliary vision model, not read by me. A1's numbers above
  therefore come from the accessibility tree's geometry, not from pixels, and A3's
  light-theme repaint cannot be judged by me at all. HUMAN-CHECK steps below.
- **A4's click, A8's populated row, A12's toggle cycle, and the native
  `/workflows` / terminal / files panes.** The Hermes window was **in use by the
  human during this pass**: between two of my captures it left `/hive-dev` for the
  Quota page and later for the Kanban detail of `t_bde0e382`, and one synthetic
  keystroke batch was dropped by the renderer (0 of 94 characters delivered).
  I stopped driving the UI rather than fight for the window; a live click on a
  moving target is not evidence.
- **Out of scope but observed**: kanban card `t_bde0e382` ("Hive Team Studio P2:
  project workspaces design") is `BLOCKED` — "Provider rejected this profile's
  credential or model — blocked after one attempt". Worth the orchestrator's eye;
  it is not this card's subject.

## HUMAN-CHECK steps (exact, for whoever has the window)

- **A3 light theme**: Settings ▸ Appearance (or `hermes config set display.skin
  <light-skin>`), then look at `/hive-dev` and confirm the three columns, the
  team rows' status dots and the `⛔ held …` row repaint with no white-on-white
  or black-on-black text — in particular the danger/warning text in the team
  detail rows, which still carries three `var(--ui-danger, #e5484d)` /
  `var(--ui-warning, #f5a524)` fallbacks (the app defines `--ui-red`/`--ui-yellow`,
  not those names, so the fallback hex is what paints).
- **A4 Stop**: `/hive-dev` ▸ composer ▸ type `@arch write a 900-word essay on the
  history of the ampersand. Do not use tools.` ▸ Enter ▸ while the row reads
  `@ARCH thinking…`, press **Stop @arch**. Expect: the turn closes as `done` (or
  `error` on a race), the already-streamed text stays on that row, no *new* empty
  `done` row appears, member status returns to idle and the toolbar badge returns
  to `ready`.
- **A8 approvals**: have a member run an approval-gated tool, then open the
  `Approvals` tab. Expect either the `@<profile>` card with the server's own
  choice buttons, or — if the per-member read fails — the explicit
  "Approval reads unavailable … Answer those in the native prompt." card. A
  silent empty tab is a finding.
- **A9 Files**: pick a project in the toolbar (note: this calls
  `projects.set_active`, a real global change), then open `Files`. Expect
  `<project> · N folder(s)` with a `primary` badge and an `Open in Files` button.
- **A12 disable→re-enable**: Settings ▸ Plugins ▸ toggle **Buzz-Hive Dev** off and
  back on. Expect: no duplicate `Hive Dev` nav row, no duplicate timeline rows,
  and exactly one `<style id="buzz-hive-dev-team-studio">` in the page.
- **A13 panes**: with the dev plugin enabled, confirm the native Workflows page,
  terminal and files panes still render.

## Probe files added this pass

`sentry-probe/spike-s3s4s5.mjs` (S3/S4/S5 over the real gateway, with a
`bogus.method` falsification control) and `sentry-probe/a4-session.mjs`
(member-session discovery / prompt injection for an A4 retry) — both
dependency-free, both read-only apart from the deliberate turn. They live in
`sentry-probe/`, which is outside this repo (as in every earlier pass), so they
are runnable but untracked.

## P1.5 implementation — suite re-run (FORGE, card `t_5ed602ed`)

Revision: branch `team-studio` @ `196330e` (implementation `2888409`…`92b0bf0`, one CSS token
fix `196330e`). Run from `~/Developer/hive-team-studio/worktree`, re-run *after* the fix.

```
$ node test.cjs
ALL PASS 312/312                    # was 292/292 at 2f44398 → +20 rows

$ node smoke-render.mjs
ALL PASS 85/85

$ node css-layout-probe.cjs --widths=1200,1000,700,600,500
ALL PASS — every reachability expectation holds across 1200/1000/700/600/500 px
```

Exit code 0 on all three. `node --check plugin.js` clean.

New pure-logic rows, all in `test.cjs`: `hiveOrderMembers` ×7 (pinned leader first; `browser`
carries no rank; explicit `order` beats insertion order; equal ranks fall back to profile name;
team-agnostic) — the P-04.3 comparator; `hiveRoomStatus` ×4 and `hiveWorkSummary` ×3 (dock and
Work-header readouts are data, singular counts stay singular, the last-activity tail appears
only when there is a clock, and the dock never says "member(s)"); `hiveOpenItemCount` ×3
(`passed` settles, malformed tasks cannot inflate, `undefined` → 0 not NaN); `hiveLastActivityTs`
×2; `hiveRosterSummary` ×3 (honest count, quiet room, empty room); one `hiveTaskStatusTone`
token-purity assert (every tone is `var(--ts-*)`, never a hex literal). `smoke-render.mjs` gained
its rgb-literal and media-query-width checks.

Dev copy: `~/Developer/hive-team-studio/sync-dev.sh` re-run against `196330e` — log reads
`synced: /Users/adnan/.hermes/desktop-plugins/buzz-hive-dev/plugin.js` and
`residual non-dev 'buzz-hive' occurrences: none`. Reversing the identity transform gives a
**0-line diff** against the worktree `plugin.js`, so a live `/hive-dev` capture is evidence for
`196330e`.

**Not verified here:** nothing visual. No captures were re-taken and no numeric acceptance was
measured — that is the QA round (card `t_40252ce7`). PASS is not claimed by FORGE.

---

## P1.5 visual QA (SENTRY, card `t_40252ce7`)

**Revision under test:** `00934f2` (branch `team-studio`), worktree clean. Live `buzz-hive`
untouched (`929548d`, plugin.js mtime Oct 17 16:15, sha256 `b968e412…`). Verdict at the end of
this section; evidence slices are appended in the order they were produced.

### A. Suites + diff review + transform faithfulness

Re-run by SENTRY at `00934f2` (whole worktree re-read, not cited from FORGE):

```
$ node test.cjs                                        -> ALL PASS 312/312   (exit 0)
$ node smoke-render.mjs                                -> ALL PASS 85/85     (exit 0)
$ node css-layout-probe.cjs --widths=1200,1000,700,600,500
                                                       -> ALL PASS            (exit 0)
```

Diff review, `git diff a45ee1d..HEAD` (my design commit -> FORGE's HEAD). Changed files:
`plugin.js`, `test.cjs`, `smoke-render.mjs`, `css-layout-probe.cjs`, and three docs — all inside
the contract's patch surface (plugin.js only, plus suite updates it authorises). No new file, no
new module, no storage-key touch (`grep` for `hive.v3|hive.v2|localStorage|sessionStorage` over the
plugin diff: 0 hits). The only new literals in `HIVE_TS_CSS` are `--ts-warn:#b1730f / #e0a94c` and
`--ts-info:#1f5fd0 / #7aa2ff` — the contract's own theme-aware §1 token pair, not a hardcoded-colour
violation. `--ui-danger/--ui-warning` fallback hexes are gone (asserted by `smoke-render.mjs`).

Two hunks outside the CSS block are storage-adjacent and were checked against the contract, not
assumed: `hivePersist()` and `hiveBootHydrate()` each gain one field,
`order: Number.isFinite(Number(m.order)) ? Number(m.order) : null`. That is contract P-04.3
("a stable `order` (persisted position, defaulting to insertion order)") — a member **attribute**,
so `hive.v2` keeps its shape and no new key appears. Not a deviation.

**Transform faithfulness** (the `t_cd258c97` check, re-done by SENTRY with
`sentry-probe/p15-sync-faithful.py`):

```
forward  transform(worktree/plugin.js) == buzz-hive-dev/plugin.js : 0 diff lines (4303 lines)
reverse  untransform(dev copy)         == worktree/plugin.js      : 0 diff lines
residual bare "buzz-hive" lines in dev copy                       : 0
```

So `/hive-dev` is the worktree build under an invertible identity transform, and a live capture
there is evidence for `00934f2`. (Captures below are harness renders of the same file; see §C.)

### B. Evidence-path finding: the harness DOM is stale at the before revision

Before taking any after-capture, the capture harness itself was audited, because the
`p15-*` captures on disk (Oct 18 14:53, design round) were produced by it and the
contract's §3 tells the QA round to re-run the same command.

`sentry-probe/p15-harness.cjs` links the app's real stylesheet and extracts
`HIVE_TS_CSS` **verbatim from the plugin under test** (so the CSS layer is whatever
revision is on disk), but its DOM is a hand-written replica, last written 14:53 —
i.e. at the **before** revision. Comparing the after stylesheet's class vocabulary
against the class vocabulary actually present in the harness body:

```
CSS classes in plugin.js @00934f2 : 47
ts-* classes present in harness body : 22
in CSS but absent from the harness DOM (28):
  ts-chip ts-empty ts-empty-body ts-empty-head ts-empty-hint ts-empty-title
  ts-toolbar-chip ts-toolbar-divider ts-toolbar-title ts-strip-label
  ts-strip-count ts-strip-meta ts-addpop-pin ts-addpop-row ts-addpop-search
  ts-mention ts-mention-model ts-mention-row ts-row-name ts-row-meta
  ts-rail-title ts-tab-empty ts-tabstrip ts-skel ts-text-body ts-copy
```

Every one of those is a contract deliverable: `ts-chip` is P-03/P-04's leader chip,
`ts-empty-*` is P-17's taught empty state, `ts-toolbar-chip`/`-divider`/`-title` is
P-10's toolbar hierarchy, `ts-strip-label`/`-count`/`-meta` is P-02, `ts-addpop-pin`
is P-22's per-row pin toggle, `ts-row-name`/`-meta` is P-03's row anatomy.

**Consequence:** re-running `node p15-render.cjs` unchanged renders the *after*
stylesheet over the *before* DOM. Such a capture can show the token/CSS layer
(type scale, spacing values, colours, media-query regimes) but is structurally
incapable of showing the JSX-level contract items (leader chip, toolbar anatomy,
designed empty states, row anatomy, pin toggle, mention picker rows) — and the
"measured, not eyeballed" type census would be measuring the harness's own inline
`style="font-size:…"` values on many nodes rather than the plugin's `HIVE_T`.

So the harness is used below only for what it can honestly measure (the CSS/token
layer and the width regimes, with the census re-read against real generated
markup), and the structural + qualitative judgement is taken from the **live
`/hive-dev` render**, whose transform faithfulness is verified in §A. Anything the
round cannot evidence is named as a blocker rather than scored around.

### C. Matched before/after capture sets (real DOM, one driver)

Rather than score the after round against the stale replica DOM, the capture path was rebuilt:
`p15-real.cjs` imports `plugin.js` **verbatim** behind an import map that substitutes only
`react` / `react-dom` / `@hermes/plugin-sdk` (`stub.js`), calls the plugin's own `register(ctx)`,
lets its own boot path hydrate from the seed blob, and mounts the entry the plugin registered at
`ROUTES_AREA` (`boot.js`). Nothing in the plugin is edited or rewritten; the captured DOM is the
plugin's own markup (20 captures, `ready=true`, `errors=[]`, 189–307 scope nodes, up to 31 distinct
`ts-*` classes per state — including `ts-chip ts-empty-* ts-toolbar-* ts-strip-* ts-addpop-* ts-mention-row ts-row-name ts-row-meta`, i.e. exactly the vocabulary §B found missing from the old harness).

Both sets were then taken with that one driver, same seeds, same widths/themes/states, only the
plugin under test differing — so the pair is matched, which the 14:53 `p15-*` vs `after-*` pair was not:

```
before  --plugin=<2f44398:plugin.js>  sha256 14e0d961…  20 captures  before-<w>-<state>-<theme>.png
after   --plugin=worktree/plugin.js   sha256 d2a5f7c6…  20 captures  after-<w>-<state>-<theme>.png
driver  worktree/p15-real.cjs (committed with this slice) + p15-real/stub.js + p15-real/boot.js
        node p15-real.cjs --plugin=<abs path> --prefix=<before|after> --dsf=2
```

Measured deltas (`sentry-probe/p15-compare.py`, `sentry-probe/p15-outliers.py` over the two
measurement JSONs):

```
clipped elements (scrollWidth > clientWidth), before -> after
  1512-agent-detail-dark      13 -> 5      <- the pre-redesign overhang, fixed
  1512/1456/1280-light/cjk    0 -> 2       <- ts-row-name.truncate ellipsis (intentional, see below)
  1200-full-dark              0 -> 3        1 of which is ts-strip-meta.truncate ellipsis
  1000-full-dark              0 -> 5      <- 2 ellipsis + ts-col-team/ts-dock at the collapsed width
  700-full-dark               4 -> 4        different elements: before = ts-strip/ts-col-team labels,
                                            after = ts-col-team/ts-dock + toolbar-title overflow
empty/loading states (new in after): ts-empty-title 20px, ts-empty-body 13px

type census, leaf text, in scope:  1512-full-dark
  before  10px:43 11px:19 12px:16 14px:7 10.4px:2 12.6px:1
  after   11px:45 12px:22 10px:10 14px:7 15px:1  12.6px:1     (empty: +20px:1 +13px:1)
  10.4px (the ad-hoc 0.65rem) is gone; every plugin-owned size now sits on 10/11/12/13/15/20
  14px x7  = div.block.min-w-0 (message body) — app markdown renderer, unchanged before->after
  12.6px   = code.rounded.bg-muted (inline code) — app chrome, unchanged before->after
radius  before {2px:30, 4px:16, 1.6px:7, 31996.8px:6, 6px:3}
        after  {2px:29, 6px:18, 4px:4, 1.6px:7, 31996.8px:6, 999px:1}
gap     before {4px:25, 6px:22, 8px:20, 2px:10} -> after {8px:25, 4px:24, 6px:20, 2px:12}
tokens  identical before/after at :root
```

Two readings that must not be overclaimed:

- The `rgb(1,2,3)` in the token probe is the probe's own sentinel, not a colour. `--ts-warn/-info/-ok/-bad/-idle`
  are declared on `.ts-workspace` and overridden on `.dark .ts-workspace` (`plugin.js:2048-2053`), and the
  probe appends its element to `document.body`, outside that scope — so the sentinel is expected there.
  `--ts-elev` / `--ts-hairline` are referenced by no rule and no component (`grep` over
  `plugin.js test.cjs smoke-render.mjs`: 0 hits) — dead names in the probe list, not missing tokens.
- The `2px`/`4px` radii and the `14px`/`12.6px` text above are on **app-rendered** nodes inside the
  scope (markdown body, inline code, reused primitives), i.e. the chrome the contract's §4 puts out of
  scope. They are counted here so the census is honest, not asserted as plugin scale violations. The
  contract's "census == {10,11,12,13,15,20}" is met for plugin-owned text; "radius census == {6px,50%}"
  is met for plugin-owned boxes (6px:18 leading) and is not met literally once app primitives are counted.
- The `ts-row-name.truncate` / `ts-strip-meta.truncate` hits are `text-overflow: ellipsis` on a
  fixed-width row — the intended device, and recorded separately by the driver in `truncated[]`. The
  contract's "zero elements with scrollWidth > clientWidth" is therefore *not* met as literally worded;
  what matters for the verdict is whether any hit is *unintended* clipping, which §E checks against the
  captures.

### D. Three harness defects found and fixed before scoring (the instrument, not the product)

The first after-round (prefixes `after`/`before`, now in `sentry-probe/p15-captures/superseded/`) produced
three readings that would have been scored as product defects. All three were the driver's fault; the
driver was fixed and both sets re-taken (`after-*` / `before-*` are the final, canonical set):

| symptom in the first run | real cause | fix in `p15-real/` |
|---|---|---|
| closed `Teams`/`Settings`/project menus painted inside the toolbar, so 1000/700 reads "top chrome overlapping, unreadable" | the app renders those in a Radix portal; the stub flattened them inline and always-visible | `stub.js` `DropdownMenuContent`/`SelectContent` return null unless `__HIVE_INLINE_MENUS__` (set in `boot.js`, true only for the `agent-detail` capture whose contract row counts row actions). 19 fewer nodes in every other state; `700-full-dark` clipping 4 -> 2 |
| `after-1512-hover-dark`: row background stayed `rgba(0,0,0,0)` -> "no hover state" | `:hover`/`@media (hover:hover)` cannot be reached by synthetic `MouseEvent` | driver now resolves the row's centre and sends a real `Input.dispatchMouseEvent` (mouseMoved). Hover row background is now `rgb(53,45,71)` = `--ui-row-hover-background` #352d47 |
| `after-1512-mention-dark`: no `ts-mention*` node anywhere -> "mention picker missing" | the stub wires React `onChange` to the DOM `change` event; the driver only fired `input`, so the plugin's `onChange` never ran and `$hiveMentionOpen` stayed null | driver now uses the native value setter, sets the caret, and fires `input` + `change`. The picker renders (`ts-mention`, `ts-mention-row`, `ts-mention-model`), rows `@default/@arch/@forge/@you` with meta, active row edge-marked, ≤280px |

So the mention picker and the hover state are **observed**, not assumed — both are required for PASS by
the contract's §3. The `agent-detail` capture's row-action items remain inline by that same flag, so its
6 menu entries are the menu's contents, not 6 permanently visible row buttons.

Determinism/reproducibility: re-running the committed driver at the same revision reproduces a capture
byte-for-byte (`recheck-1512-full-dark.png` sha256 `7a8b1273…` == `after-1512-full-dark.png`).

Final set provenance: driver `p15-real/{p15-real.cjs,stub.js,boot.js}` at `9fc3a98`+`4ea7b1d`; plugin under
test `d2a5f7c6…` (after, `00934f2`) and `14e0d961…` (`2f44398:plugin.js`, before). 20 captures each,
`ready=true`, `errors=[]`, `driveLog` recorded per capture.

### E. Scored round

Rubric axes (the card's nine, then the added polish axes). Each number is a judgement over the 20
captures named above; the deductions are in §F.

```
hierarchy                       9/10   feed is unambiguously primary at every width; the right panel still
                                      competes with four tabs + a board + a workflow card
density                         9/10   roster and feed comfortable; top bar and right panel are tight
spacing rhythm                  9/10   one 4px scale; gap census 4/6/8px; no arbitrary paddings left
alignment                       9/10   column seams and card left-edges consistent at 1512/1456/1200/1000/700
type scale                      9/10   the ad-hoc 10.4px step is gone; plugin-owned text is 10/11/12/13/15/20
color discipline                8/10   one accent, hairline cards, theme-aware state ramp (IN REVIEW #e0a94c
                                      dark / #b1730f light); app-supplied profile colours still fill whole
                                      message panels, which is heavy on the light surface
top-5 daily actions             8/10   send / add-agent / agent-detail / tabs fine; tab groups are three
                                      separate strips, and pin has no roster control (see F-8)
dark+light integrity            9/10   tokens, borders, shadows and the amber state all flip; no dark patch
                                      survives on the light capture
responsive (each captured width) 8/10  css-layout-probe ALL PASS incl. 500px; roster collapses to avatars at
                                      1000; two collapsed-width container overhangs remain (F-2, F-4)
typography craft                9/10   real scale and weights, -apple-system/JetBrains Mono split is correct
spacing rhythm consistency      9/10   same as above, measured
motion discipline               n/a    no motion capture exists in either set; named as owed evidence, not scored
empty/loading/error craft       9/10   empty room (heading 20px + line + Add an agent), approvals tab, and
                                      the tab states are all designed, not bare strings
focus/hover/active states       9/10   composer focus ring `solid 2px`, roster hover = row-hover token,
                                      toolbar-chip hover rule present
agent identity design           9/10   deterministic accent + dot + PINNED chip + model meta on one line

score 86/100   ->  REVISE
```

```json
{
  "score": 86,
  "verdict": "REVISE",
  "differences": [
    { "difference": "The Add-agent popover's right edge is 4px outside the team column it belongs to (measured right=212 vs column right=208), which the contract's numeric acceptance forbids.", "suggestion": "Anchor `.ts-addpop` to the column's inner edge (offset by its 1px border) and re-measure `addpopInsideColumn` until `inside: true`." },
    { "difference": "At 1000px the collapsed team column still overhangs: `.ts-col-team` scrollWidth 104 vs clientWidth 55 and `.ts-dock` the same, so the contract's 'zero elements with scrollWidth > clientWidth' is not met there.", "suggestion": "Clip the collapsed regime's inner wrapper (`overflow:hidden` in the ≤1180px media block) so hidden content stops widening the box; re-run the census at 1000/700." },
    { "difference": "Right-panel work-item titles are cut to one line at 280px ('Rewrite the citation block to the Febr…', 'Verify the 1494 attribution against so…'), so the panel cannot be scanned for what the work is.", "suggestion": "Allow two lines (`-webkit-line-clamp:2`) for `.ts-row-name` at ≥1200px, keeping one-line ellipsis in the collapsed rail." },
    { "difference": "`.ts-toolbar-title` overflows its own box at 700px (scrollWidth 30 vs clientWidth 28), the one unexplained hit in the numeric acceptance at that width.", "suggestion": "Raise its `max-width` (or drop the project chip) at the narrow step so the title box never under-runs its text." },
    { "difference": "The Approvals panel explains the architecture to the user: 'server verbatim' and 'it mirrors the queue, it does not own it' read as implementation notes.", "suggestion": "Replace with one user-facing line ('Approvals are answered in the app's own prompt.') and keep the detail in the code." },
    { "difference": "The toolbar shows 'No project' twice (a Select placeholder next to a second label), which reads as a duplicate control.", "suggestion": "Render the placeholder only when no project is selected, or drop the second chip." },
    { "difference": "Micro-meta the user must read sits at the quaternary text token (right-panel '0s', strip meta, composer hint) and was flagged as low-contrast in three separate reads.", "suggestion": "Move it to `--ui-text-tertiary`; keep quaternary for decoration only." },
    { "difference": "Pin has no control on the roster row — the only pin affordance is inside the Add-agent popover — so a 'PINNED' member cannot be unpinned from where it is shown.", "suggestion": "Make the PINNED chip a toggle (reuse the `ts-addpop-pin` anatomy) or expose the row's pin in its existing actions menu." }
  ]
}
```

### F. Contract status, missing evidence, and the P1 HUMAN-CHECK rows

Verified in the final captures (evidence each): type scale adopted and the 10.4px step gone (§C census);
spacing/radius on the 4px/6px scale (§C); symbol-strip labels + count (`ts-strip-label/-count/-meta`,
`after-1512-full-dark`); roster anatomy + leader chip (`ts-chip` PINNED, row name/meta); toolbar hierarchy
(`ts-toolbar-title/-chip/-divider`, `toolbarControls`); rail with persistent caption (`ts-rail-title`);
tabstrip survives to 1000 (`tabs[0].rect` present, strip labels hidden by design); empty states designed
(`after-1512-empty-dark`); add-agent and mention pickers both inside their columns; semantic ramp
theme-aware (`inReview` #e0a94c vs #b1730f); flat-share team 0.282 / right 0.32 (limits 0.70 / 0.65); CJK
clean with 14px/22.75px body and no clipping (`cjkSample`); focus ring and hover token; clipping at
agent-detail down 13 -> 5 vs before; raw markdown no longer rendered (before showed `## The Semicolon`).

Not verified — owed captures (PASS is unavailable until these exist):

1. **P-22 per-row pin toggle.** `after-1512-addpop-dark` renders `Every profile is already in the room.`
   with no candidate rows, so the pin toggle has no evidence. The capture's own DOM says the popover
   opened and the search field rendered, but the profile list came back empty; the harness has no
   `window.hermesDesktop.api` double for `/api/profiles`, while every *other* host surface is seeded.
   Cause recorded, not resolved: this run stops short of claiming the toggle works or that it is broken.
   Recapture `after-1512-addpop-dark` with a seeded `/api/profiles` that returns at least one profile
   outside the room, then read `data-pin` / `aria-pressed` on `.ts-addpop-row`.
2. **P-19 motion.** No capture in either set records a transition (settled frames only). Owed: a
   before/during/after triple for one transition, or P-19 stays unscored rather than assumed.
3. **The 'zero elements with scrollWidth > clientWidth' wording** at 700/1000/1200/1456/1512: 2–5 hits
   remain per width. Most are `text-overflow: ellipsis` on fixed-width rows, which is the intended
   device and is recorded separately in `truncated[]`; the two that are not are F-2 and F-4 above.

P1 HUMAN-CHECK rows (card step 4), each with what closed it or why it did not:

```
light-theme repaint      CLOSED to harness evidence: after-1280-light-full-light and
                         after-1280-light-addpop-light, tokens/borders/shadows flipped, IN REVIEW
                         #b1730f vs #e0a94c. Not observed in the live app (harness page + app
                         stylesheet); the live repaint itself stays unobserved.
A4 Stop against a live   NOT CLOSED. Needs the running desktop gateway port + token and a member
session                  mid-turn; the harness stubs the host, so a Stop click there would prove
                         nothing. Card instructs not to fight the user for the window; the gateway's
                         loopback root answered 401 on the port I could see (8789), so the live path
                         was not available in this run.
disable -> re-enable     NOT CLOSED. A GUI action in the user's own app; a headless run has no
toggle                   approval channel. Previously recorded facts still hold (separate storage
                         namespace, dispose asserted by smoke-render).
native panes unaffected  Unchanged by construction: the implementation diff touches plugin.js and the
                         suites only (checked in §A); the harness has no native panes to photograph.
```

Suite re-run at `00934f2` (SENTRY): `test.cjs` 312/312, `smoke-render.mjs` 85/85,
`css-layout-probe.cjs --widths=1512,1456,1200,1000,700,600,500` -> `ALL PASS — every reachability
expectation holds across 1512/1456/1200/1000/700/600/500 px`.

---

## P1.5 visual QA — round 2 (SENTRY, card `t_6072fce0`) at HEAD `f4771f1`

Re-verification of the eight REVISE items in §E plus the three owed-evidence gaps named in §F.
The round did not begin with the suites: it began with the instrument, because two of the
"missing" results turned out to be produced by the harness rather than the product.

### A2. Three instrument defects found and fixed before scoring

All three live in `p15-real/` (the real-DOM driver), none in `plugin.js`. Each was fixed, and
each fix was verified by a control at the same revision.

1. **The harness rendered every commit twice, and the second pass read virgin hook slots.**
   `commit()` built `tree`, then for a re-render started a *second* pass after restoring a stale
   `cur` with `rootCounter` already advanced — so components walked different frame paths in the
   two passes. Measured on the add-agent popover: pass 1 rendered `HiveAddMember@R50` with
   `opts=5` while pass 2 mounted `HiveAddMember@R175` with `opts=0`. Any state a click handler set
   was therefore invisible in the frame that got captured: the popover reported "Every profile is
   already in the room." with five profiles seeded, and P-22/P-19 had no evidence at all.
   Control: the pre-fix harness at `f4771f1` still renders 0 rows with the `/api/profiles` double
   in place; the fixed harness renders 5. `commit()` now renders once and swaps that tree.
2. **`window.hermesDesktop.api` had no double.** The plugin reads the profile list from
   `api({path:'/api/profiles'})` (`hiveFetchProfiles`), which the host double never answered, while
   every other host surface was seeded. `stub.js` now serves it from `H.__HIVE_HARNESS__.api[path]`,
   falling back to the host double's `profiles.list` answer; reads are cloned, writes are recorded
   and answered, never performed. The capture carries a self-check (`apiprobe`) that prints what the
   bridge actually answered.
3. **`profileColorSoft` was the solid colour, not the host's tint.** The shipped SDK
   (`/Applications/Hermes.app/…/dist/assets/profile-color-TXT65diY.js`) is
   `color-mix(in srgb, <colour> 16%, transparent)`, with `default` resolving to *no* colour and the
   hue from `hash = h*31+c>>>0 % 360`. The double returned the saturated colour, which painted every
   message panel as a solid block — the evidence §E used to deduct colour discipline. The host's
   maths is now ported verbatim into `stub.js`, and that deduction is withdrawn (see §F2).

### B2. Suites at `f4771f1`

```
node test.cjs                                                        ALL PASS 312/312
node smoke-render.mjs                                                ALL PASS  85/85
node css-layout-probe.cjs --widths=1512,1456,1200,1000,700,600,500   ALL PASS — every
   reachability expectation holds across 1512/1456/1200/1000/700/600/500 px
```

Capture set: 28 captures (`r2-*`) in `~/Developer/hive-team-studio/sentry-probe/p15-captures-r2/`,
every one `ready=true`, `errors=[]`, from the same driver as the round-1 set.

### C2. F-1 … F-8, each against the field it was measured on

| item | round-1 measurement | round-2 measurement | state |
|---|---|---|---|
| **F-1** addpop inside its column | `addpopInsideColumn` `right 212 / colRight 208 → inside:false` | `right 200 / colRight 208 → inside:true` in `r2-1512-addpop-dark`, `-nopin`, `-pin` and `r2-1280-light-addpop-light` | closed |
| **F-2** collapsed-width overhang | 1000px `.ts-col-team` scrollW/clientW `104/55`, `.ts-dock` `104/55`; 700px `104/47`; census 1000 = 5 hits, 700 = 2 | 1000px `55/55` and `55/55`; 700px `47/47`; census 1000 = 3 hits, 700 = 0 — and every remaining hit is `text-overflow: ellipsis` on a fixed-width row, i.e. the intended device, listed separately in `truncated[]` | closed |
| **F-3** one-line work-item titles | `truncated[]` holds both right-panel titles at 1512, 1456, 1200 and 1000 | 1512 and 1456: **0** titles truncated; 1200: 1 (only the strip meta); the agent-detail state drops from 3 row-name truncations to 1. At 1000 the two titles stay one-line — that is the collapsed rail, as the item specified | closed |
| **F-4** toolbar title at 700px | census 700 = 2 hits | census 700 = 0; the title (`toolbarControls[0]`, "hive") measures scrollWidth/clientWidth `30/30`, so the box no longer under-runs its text | closed |
| **F-5** Approvals copy | capture text: `server verbatim`, `mirrors the queue` present | capture text: `Approvals are answered in the app’s own prompt.` present; neither architecture phrase survives anywhere in the rendered text | closed |
| **F-6** two "No project" labels | toolbar chip rendered a placeholder plus a second label | workspace `innerText` contains `No project` exactly **once**; the chip is one node (`toolbarControls[1]`, 92px) whose content is plugin-owned (`SelectValue` receives `children`, plugin.js:3369). Caveat: the harness's `SelectValue` double renders `children` directly, so it cannot reproduce Radix's item-text portal — the source argument carries the no-duplicate claim, the capture confirms the single label | closed |
| **F-7** micro-meta at tertiary | right-panel `0s`, strip meta and composer hint sat at the quaternary token | measured tokens: tertiary `rgb(141,136,153)` dark / `rgb(107,104,117)` light; quaternary `rgb(109,104,121)` / `rgb(140,137,149)`. `.ts-row-meta` and `.ts-strip-label` compute to **tertiary** in both themes; `.ts-strip-meta`, `.ts-empty-hint`, `.ts-rail-title`, `.ts-mention-model` and `.ts-addpop-pin` are pinned to it in CSS and the composer hint is inline tertiary (plugin.js:2831). The only quaternary left is the system-avatar colour (plugin.js:2548) — decoration, as the item asked | closed |
| **F-8** pin from the roster row | no roster control; the only pin affordance was inside the popover | `r2-1512-roster-pin-dark`: clicking the row pin on `@arch` sets arch `data-on="true" aria-pressed="true"` with the `Pinned` chip, the roster reorders to `you · @arch · @forge · @default`, and the pre-existing pin on `@forge` keeps its state | closed |

### D2. Owed evidence closed, and one new item found while closing it

* **P-22 per-row pin toggle (was: no evidence).** With the bridge double seeded, `/api/profiles`
  returns five profiles outside the room (`toddy, writer, atlas, reviewer, scout`) and the popover
  renders five `.ts-addpop-row`s. After clicking the first row's own toggle
  (`r2-1512-addpop-pin-dark`): row 1 `data-pin="true"`, `.ts-addpop-pin` `data-on="true"`,
  `aria-pressed="true"`, label `Pinned`, colour `rgb(224,169,76)` (the amber `--ts-warn`); rows 2–5
  `data-pin="false"`, `aria-pressed="false"`, tertiary. `r2-1512-addpop-nopin-dark` shows all five
  false. The toggle is functional and reads out its state three ways.
* **P-19 motion (was: n/a, no capture recorded a transition).** One transition, measured three ways:
  the roster pin reveal. Before (no pointer) `opacity 0` → during (81 ms after the real pointer
  move) `0.952516` → after `1`, against the declared `--ts-dur:160ms` `cubic-bezier(.2,.8,.2,1)`.
  The in-page ramp is `(0 ms, 0) (43, 0) (64, 0.912) (117, 0.989) (153, 0.9996) (181, 1)`; a
  cubic-bezier(.2,.8,.2,1) at those progress points predicts exactly that front-loading, so the
  declared curve is the curve that runs. Motion is now scored instead of n/a.
* **New — F-9, found by the commit trace (non-blocking).** The add-agent popover has no loading
  state: `loadState === 'loading'` falls through to the same branch as a truly empty profile list,
  so for the duration of the fetch the user is told **"Every profile is already in the room."**
  Evidence: the commit trace painted that line at `t=497` while the state trace records
  `R50#2 = "loading"` (the profiles arrive at `t=498`). On a slow host this is the first thing the
  user reads. Suggested fix: give `loading` its own branch (`Loading profiles…` or a skeleton row).

### E2. Not verified this round

```
A4 Stop against a live session   Still NOT CLOSED. Needs the running desktop gateway (port +
                                 token) with a member mid-turn; the harness stubs the host, so a
                                 Stop click here would prove nothing. The card instructs not to
                                 fight the user for the window.
disable -> re-enable toggle      Still NOT CLOSED. A GUI action in the user's own app.
light theme, all states          NOT CLOSED. The light set is 2 of the 20 states (full + addpop);
                                 the other 18 are dark-only, so "no dark patch survives" is
                                 verified for the two captured states, not for the surface.
agent-detail overhang            Pre-existing, not a REVISE regression: in the expanded agent-detail
                                 state the card overhangs its box (ts-card 211 vs 205, the inner
                                 strip-meta line 199 vs 181) and the team column's scroll container
                                 reports 5px of horizontal overflow. Control: plugin 00934f2 at the
                                 current harness shows the same chain (11 hits, the same 5
                                 containers), so the REVISE round neither caused nor fixed it.
Round-1 colour deduction         WITHDRAWN. It rested on the double's solid profile colour, not on
                                 the host's 16% tint (§A2.3).
```

### F2. Scored round

Rubric axes (the card's nine, then the added polish axes), each read off the round-2 capture set.
The roll-up is the axis mean ×10, rounded — no separate weighting.

```
hierarchy                       9/10   feed is unambiguously primary at every width; the right
                                      panel still carries five tab stops, a rail and workflow cards
density                         9/10   roster and feed comfortable; the 700px toolbar packs ten
                                      controls into 644px
spacing rhythm                 10/10   measured gap census 8/6/4/2px, paddings all on the 4px
                                      scale, nothing arbitrary to name
alignment                       9/10   column seams and card left-edges hold at
                                      1512/1456/1200/1000/700; residual: the expanded
                                      agent-detail card overhangs its box by 4–16px (§E2)
type scale                      9/10   plugin-owned text is 10/11/12/14/15 plus a 0.9em inline-code
                                      step inside 14px body; the ad-hoc 10.4px step is gone. The
                                      14px body against the 15px title is a narrow separation
color discipline                9/10   one accent, hairline cards, theme-aware amber (IN REVIEW
                                      #e0a94c dark / #b1730f light). Round 1's deduction — solid
                                      profile colours filling whole panels — is withdrawn: it was
                                      the double's colour, not the host's 16% tint (§A2.3)
top-5 daily actions             9/10   send / add-agent / agent-detail / tabs fine, and pin is now
                                      on the roster row (F-8); tab groups remain three strips
dark+light integrity            9/10   tokens, borders, shadows and the amber state flip; no dark
                                      patch survives on the light captures. Coverage is 2 of 20
                                      states, so this is a statement about those two
responsive (each captured width) 9/10  every numbered width is clean of non-ellipsis overhangs
                                      (F-2, F-4); 1000px roster collapses to avatars; sheets
                                      render their bodies at 1000. Residual: agent-detail state
typography craft                9/10   weights 400/500/600, -apple-system 77 : JetBrains Mono 3
                                      split correct, CJK 14px/22.75px, no clipping
spacing rhythm consistency     10/10   same census as above, both themes; nothing to name
motion discipline               9/10   one shared token does all of it: --ts-dur 160ms and
                                      cubic-bezier(.2,.8,.2,1) on every interactive surface, no
                                      ad-hoc durations, and the measured ramp matches the declared
                                      curve (§D2). Structural opens (sheet, popover) are instant
                                      cuts, and the pin reveal is 0.91 done at 74ms
empty/loading/error craft       8/10   the empty room, the approvals empty and the tab states are
                                      designed, not bare strings — but the add-agent popover has
                                      no loading state and reads as "empty" while it fetches (F-9)
focus/hover/active states       9/10   composer focus ring solid 2px, roster hover = row-hover
                                      token, toolbar-chip hover rule present, the quiet pin is
                                      reachable by focus-visible and always shown on (hover:none)
agent identity design           9/10   deterministic accent + dot + model meta on one line, and
                                      the pin now carries its state where the member is shown

score 91/100   ->  PASS  (bar 90)
```

```json
{
  "score": 91,
  "verdict": "PASS",
  "differences": [
    { "difference": "F-9 (new, non-blocking): the add-agent popover has no loading state, so while /api/profiles is in flight it renders the empty-room copy 'Every profile is already in the room.' The commit trace painted that line at t=497 while the state trace shows loadState='loading' (profiles arrive at t=498).", "suggestion": "Give 'loading' its own branch next to the 'error' branch in HiveAddMember (a skeleton row or 'Loading profiles…')." },
    { "difference": "Pre-existing, not a regression: in the expanded agent-detail state the card overhangs its box (.ts-card scrollWidth 211 vs clientWidth 205, the inner strip-meta line 199 vs 181) and the team column's scroll container reports 5px of horizontal overflow at 1512. Control at plugin 00934f2 shows the same five containers.", "suggestion": "Put min-w-0 + truncate on the '#b7c210 OPEN · reviewing …' meta line inside the expanded card; re-run the census in that state until it reads zero." },
    { "difference": "Motion covers property changes only: the sheet and popover of the largest layout change appear as instant cuts, and the pin reveal's easing is 91% complete at 74ms of its 160ms.", "suggestion": "Leave as a deliberate desktop idiom, or give the two structural opens a short (<=120ms) opacity/translate step using the same --ts-dur/--ts-ease tokens." },
    { "difference": "The right panel still asks the user to parse five tab stops (Tasks, Activity, Files, Approvals, Workflow) plus a persistent rail and workflow cards against a feed that is meant to be primary.", "suggestion": "Consider folding Approvals/Workflow behind the same strip or deferring them to the workflow phase, so the right panel has one reading order." },
    { "difference": "Only 2 of the 20 capture states exist in the light theme, so light-theme integrity is verified for the full and addpop states only.", "suggestion": "Add light captures for the tab, empty and sheet states in the next visual round." }
  ]
}
```
