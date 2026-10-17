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
