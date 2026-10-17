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
