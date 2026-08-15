# Buzz-Hive — the team protocol

This is the contract between the room and its members: what every agent is
told, what every agent receives, how messages are routed, and how the crew
checks its own work. It is the authoritative description — the room brief the
agents are seeded with (`hiveBuildRoomBrief`) and the envelope they receive
(`hiveBuildContextEnvelope`) are generated from the same rules described here.

---

## 1. What every member receives, every turn

Every delivery is assembled by one function, `hiveBuildContextEnvelope`. There
is no other path into a member's session. A standard-mode delivery looks
exactly like this:

```
[hive] you are @builder in room "audit"
roster (address ONLY these): @builder, @frontier, @you
mission: ship the Q3 payment audit

[room digest]
@you: start the audit
@frontier: found 3 issues

[your open work items]
#w1 [submitted] own: audit the payment flow

[team scratchpad — shared working memory, keep it current]
## Decisions
- use Postgres  _(@builder · 10:02)_

from @frontier:
can you double-check the rounding?
```

| Section | Always present? | Source |
|---|---|---|
| Standing header (identity, roster, mission) | **yes, both modes** | `$hiveMission`, `$hiveMembers` |
| `[room digest]` — last 12 room events | standard mode only | `$hiveTimeline` |
| `[your open work items]` | when the member owns or reviews one | `$hiveTasks` |
| `[team scratchpad]` | **yes, both modes**, when non-empty | `$hiveScratch` |
| The message itself | yes | the relay |

**The scratchpad and the mission reach every member in every context mode.**
Minimal mode drops the *digest* — the rolling chatter — not the shared memory.
A member that cannot see the team's working memory cannot act as a teammate.

### Context modes

- **Standard** — full envelope including the room digest.
- **Minimal** — standing header + work items + scratchpad + a fielded
  `[HIVE HANDOFF]` capsule instead of the digest. For members you want focused
  on their own lane rather than following the whole room.

Set per member from its roster chip. New members default to **Standard**.

---

## 2. Addressing teammates

| You want to… | Write |
|---|---|
| Direct one teammate privately | `[to @name] message` |
| Ask one teammate a question | `[ask @name] question` |
| Address the whole room | `[all] message` |
| Answer whoever wrote to you | just reply — no marker |

Rules the brief states explicitly:

- **Never invent teammates.** Only roster names route; anything else is dropped
  with reason `not-in-room`.
- **Untagged prose is broadcast.** Anything said without a marker goes to the
  whole room, so filler is expensive. The brief tells agents to keep it short.
- The roster is **re-broadcast to every member whenever it changes** — on join,
  on leave, and on browser-role handover. A member added later is not invisible
  to the ones already there.

---

## 3. Dividing and validating work

Prose alone cannot express "here is the thing, confirm it". Work items can.

| You want to… | Write |
|---|---|
| Hand someone a task | `[task @name] what needs doing` |
| Report your task finished | `[done #id] what you actually did` |
| Ask a teammate to validate | `[review @name #id] what to check` |
| Give a verdict | `[verdict #id pass] why` / `[verdict #id fail] what's wrong` |

The room routes these automatically:

```
@you      [task @builder] audit the payment flow      → @builder  (task)
@builder  [done #w1] fixed the rounding error         → reviewer, or requester
@you      [review @frontier #w1] check the maths      → @frontier (review)
@frontier [verdict #w1 fail] off-by-one on line 42    → @builder  (verdict)
@builder  [done #w1] corrected line 42                → @frontier (review)
@frontier [verdict #w1 pass] confirmed                → @builder  (verdict)
```

Guarantees enforced in code, not merely requested in the prompt:

- **A submission goes to the reviewer**, carrying the actual submitted work.
- **A failed verdict routes back to the owner** with the reason, and the item
  reopens for resubmission.
- **You cannot pass your own work.** A verdict from the item's owner routes
  nowhere — the brief tells agents to ask a teammate instead.
- **An unassigned reviewer is not a person.** An item with no reviewer reports
  back to whoever requested it. (It used to normalize to the literal profile
  named `default` and quietly route there.)
- Items a member owns or reviews appear in their envelope every turn under
  `[your open work items]`. Passed items stop appearing.

The live board is in the room's **Scratchpad** tab.

---

## 4. The shared scratchpad

One markdown document. Every member reads the same copy in every message. It
is the room's working memory — decisions and facts the others need, not
narration.

| You want to… | Write |
|---|---|
| Append a note | `[scratchpad] the note` |
| Append under a section | `[scratchpad:Decisions] we are using Postgres` |
| **Correct** a section | `[scratchpad:Decisions!] we switched to SQLite` |

The `!` form replaces the section's contents. This matters: an append-only pad
means a wrong shared fact can never be fixed, only buried under a contradicting
line — and both lines then get re-injected into every member on every turn,
forever. The brief instructs agents to correct rather than contradict.

Entries are attributed (`_(@builder · 10:02)_`) and the doc is clipped from the
**tail** when full, so the mission and founding decisions at the head survive.

You can edit the whole document by hand in the **Scratchpad** tab; agents see
your edit on their next turn.

---

## 5. Routing guarantees

Every delivery — from you or from an agent — is planned by one pure function,
`hivePlanDeliveries`. Guards therefore hold on every path rather than on
whichever path remembered to implement them.

| Guard | Behavior |
|---|---|
| **Self-exclusion** | A message never returns to its own sender. |
| **Swarm toggle** | When off, *no* agent-to-agent traffic is delivered — broadcasts included. Your own messages are never gated. |
| **Mute** | Muted members receive nothing from agents. You always reach them. |
| **Hop budget** | An agent→agent chain stops after `HIVE_MAX_HOPS` (3). |
| **Fan-out cap** | One turn produces at most `HIVE_MAX_FANOUT` (6) deliveries. |
| **Roster check** | Unknown targets are dropped. |

Suppressions are **reported, not silent**: the planner returns a `dropped` list
with a reason, and hop/fan-out suppressions post a system line to the timeline
(`⛔ held 3 relay(s) from @builder — relay chain reached its depth limit`).

> Why this exists: before these guards, an ordinary untagged reply was fanned to
> every member **including its own author**, ungated by the swarm toggle and
> unbounded in depth. One reply re-entered the room N+1 times and each of those
> did it again.

---

## 6. Honest limits

1. **Compliance is prompted, not enforced.** An agent that ignores the grammar
   has its output treated as a broadcast. The brief, the per-turn work-item
   list, and the standing header make compliance reliable — not guaranteed.
2. **Tool availability is profile config.** The browser role assigns the job and
   seeds the brief; the profile must actually have the browser toolset enabled.
3. **Parallel cognition costs what it costs.** Every member is a real model run.
4. **Sessions are bound to the backend that minted them.** Members are created
   through the active gateway with a `profile` param. Switching the desktop's
   active profile mid-room has not been verified end-to-end — see README.
5. **Awareness is protocol-based, not telepathic.** Members share the mission,
   the scratchpad, the work board, and a 12-entry digest — not live memory.

---

## 7. Where this lives in the code

| Concern | Function | Pure? |
|---|---|---|
| What an agent receives | `hiveBuildContextEnvelope` | ✅ |
| What an agent is taught | `hiveBuildRoomBrief` | ✅ |
| Who gets a message | `hivePlanDeliveries` | ✅ |
| Work-item state + routing | `hiveApplyWorkItems` | ✅ |
| Scratchpad edits | `hiveScratchApply` | ✅ |
| Marker parsing | `hiveParseCoordination`, `hiveParseWorkItems`, `hiveParseScratchOps` | ✅ |
| Actually sending | `hiveDeliverTo`, `hiveRunPlan` | ❌ (thin adapters) |

Everything above the line is inside the `CORE-BEGIN`/`CORE-END` markers and is
verified by `node test.cjs` with no SDK, socket, or app required.
