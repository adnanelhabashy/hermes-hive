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
