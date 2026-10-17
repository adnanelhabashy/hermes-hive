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
| R2 601–1100 px unreachable | **FIXED** | `plugin.js:1977-1978` moved into the `≤1100px` block; 3 new `smoke-render.mjs` CSS assertions on the extracted block text |
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
