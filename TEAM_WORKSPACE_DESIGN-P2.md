# TEAM WORKSPACE DESIGN — Phase 2: Project Workspaces

Status: **DESIGN COMPLETE** — 2026-10-18, branch `team-studio`, base `83f1cfd`
(Phase 1 PASS). Owner: ARCH. Consumers: FORGE (build), SENTRY (verify).

Phase 2 makes Team Studio project-first: one visible Project Selector, and
**fully isolated per-project state** — timeline, scratchpad, mission, work items
and the member→session bindings are per project; the roster and the presentation
prefs stay global.

Read first: `TEAM_WORKSPACE_PLAN.md` (rules), `TEAM_WORKSPACE_ARCHITECTURE.md`
§1.2/§1.5/§2 (the verified surface + risks 2 and 5), `TEAM_WORKSPACE_DESIGN.md`
§5 (toolbar) and §"honest gaps" #5 (the gap this phase closes).

Evidence labels used below, same as ARCHITECTURE.md: **VERIFIED** (read in the
installed Hermes v0.22.2 source at `~/.hermes/hermes-agent` and/or measured live),
**PLAUSIBLE-NEEDS-TEST** (registered/available, not yet exercised from a plugin
context), **UNSUPPORTED** (no surface exists), **NEEDS-SPIKE** (a named spike
FORGE must run before the dependent piece is built).

---

## 0. What this phase changes, in one table

| Concern | Phase 1 (today) | Phase 2 |
|---|---|---|
| Room state | one blob, `ctx.storage['hive.v2']` | `hive.v3:room:<projectId\|none>` per project + `hive.v3:global` |
| Project selection | relabels the room, sets cwd for FUTURE sessions, `$hiveCwd` string | opens THAT project's room; identity = project id, never a name |
| Member sessions | `members[].storedId` in the one blob | `room.sessions[profile].storedId`; roster stays global |
| Working directory | `session.create` gets `cwd: $hiveCwd` (no verification, no `cwd_explicit`) | resolved from the project, **verified** via `/api/fs/list`, passed with `cwd_explicit`, and displayed as actually adopted |
| Restored members | sessionless after restart (**F1**) | reattached via `session.active_list` (+ `session.resume` on demand) |
| Marker grammar | unchanged | unchanged — same parser, same relay seam, same caps |

---

## 1. Invariants and non-goals

**Invariants (must hold in every build):**

1. The marker grammar (`[to @x]`, `[ask @x]`, `[task @x]`, `[done #id]`,
   `[review @x #id]`, `[verdict #id pass|fail]`, `[scratchpad*]`) and every Phase 1
   behavior are preserved verbatim. P2 adds a storage/key layer and a session
   reattach path; it does not touch `hivePlanDeliveries`, the envelopes, the hop
   budget (`HIVE_MAX_HOPS`), the fan-out cap (`HIVE_MAX_FANOUT`) or the caps in
   `hiveCapTimeline`.
2. A project is referenced by its immutable `id` (`p_` + 8 hex) only. No storage
   key, no request body and no atom may carry a display name, slug or path as
   identity. Names and paths are **display** and are re-derived from
   `projects.list` on every boot.
3. The migration must not lose a v2 user's room: with no project selected the
   user's existing room must come back exactly as it was, under a key that
   preserves today's behavior.
4. Every unavailable action is disabled with a reason (PLAN.md rule 5). No
   fabricated project, folder, branch or directory state.
5. `projects.db` is the single source of truth for projects. The plugin never
   keeps a parallel project list (ARCHITECTURE §5); `hive.v3:index` is a
   bookkeeping record, never a project source.

**Non-goals (Phase 3+):** delegation protocol, kanban adapter, git worktrees,
review/approval system, live monitoring, workflows, performance pass. Where P2
touches their future surface it says so explicitly (see §12).

---

## 2. Project model in-plugin

### 2.1 Atoms

`$tsActiveProject` keeps its Phase 1 shape and meaning, with one addition:

```js
$tsActiveProject  // null | {
                  //   id: 'p_xxxxxxxx',       // identity — the ONLY key material
                  //   slug: 'the-eye-ai-model', // display/reconcile only
                  //   name: 'the-eye-ai-model', // display
                  //   primaryPath: '/Users/…',  // display + cwd source (re-verified every boot)
                  //   branch: 'team-studio',    // display, from projects.for_cwd
                  //   dirState: 'verified' | 'unverified' | 'unknown'  // NEW (§5)
                  // }
```

New atoms (all project-agnostic bookkeeping, none of them a project source):

- `$tsProjectList` — unchanged (`null` = not loaded, `[]` = loaded and empty).
- `$tsProjectError` — unchanged (last `projects.*` failure; `''` = fine).
- `$tsRoomKey` — `'hive.v3:room:none'` | `'hive.v3:room:p_xxxxxxxx'`. Derived by
  `hiveV3RoomKey()`; the only thing the UI needs to know which room is open.
- `$tsRoomDirty` — `true` while a room write has not been confirmed by a
  read-back (§3.5).
- `$tsSwitchPending` — `null | { projectId, reason: 'busy' }` for the §7 gate.

`$hiveCwd` is **kept but demoted**: it is now a projection of the open room's
`cwd` (so every existing reader, including `hiveMintMember` at plugin.js:1664,
keeps working), and it is written only from the room, never from a bare project
selection. That is what makes "switch project" and "switch room" the same
operation instead of two half-operations.

### 2.2 The join: roster ⨝ room sessions

`$hiveMembers` keeps its current element shape (so `hiveMemberBySession`,
`hivePlanDeliveries`, the roster UI and the tests keep working), but it is now a
**join** of two persisted records:

```
roster (global,  hive.v3:global.roster)   : [{ profile, browser, muted, leader,
                                               contextMode, model, provider, modelLabel }]
room   (per project, …sessions)           : { [profile]: { storedId } }
members (runtime, $hiveMembers)           : [ …rosterEntry, storedId, sessionId|null,
                                               status, attach ]
```

Why this split and not "everything per project": a member's **session is
cwd-bound**. Live-verified: `session.create { cwd }` returns
`info.cwd` = the requested directory when it exists and `info.cwd = /Users/adnan`
(the launch dir) when it does not — so a session carries its workspace, and one
member cannot have one session serving two projects. The **roster**, by
contrast, is team config and the card requires it to be global. Splitting exactly
at the session boundary is the only split that satisfies both.

### 2.3 "No project selected"

`hive.v3:room:none` is a first-class room with the same shape as any project
room. Selecting "No project" opens it. A v2 user whose blob has no
`activeProject` is migrated **into this key**, so their room is preserved
byte-for-byte (minus the documented key split) and their `session.create` calls
continue to send no `cwd` — today's behavior, unchanged. There is deliberately no
"bare cwd without a project" state (§6.4).

---

## 3. Storage namespacing

### 3.1 What `ctx.storage` actually is (VERIFIED)

- `ctx.storage` is a per-plugin key/value facade over **`localStorage`**:
  `createPluginStorage` scopes every key to `hermes.plugin.<pluginId>.<key>`
  and JSON-encodes the value (`apps/desktop/src/contrib/plugin.ts:196-216`);
  `set` marshals, `get(key, fallback)` parses, `remove(key)` **deletes the key**
  by writing `null` (`apps/desktop/src/lib/storage.ts:29-56`). Keys are arbitrary
  strings; there is no schema, no per-key size limit of its own, and no
  transaction.
- Observed live store key for the current room:
  `hermes.plugin.buzz-hive.hive.v2` (Electron `Local Storage/leveldb` under
  `~/Library/Application Support/Hermes/`).
- **A failed write is swallowed**: `writeKey` catches quota/permission errors and
  returns normally (`lib/storage.ts:47-55`). A room write can therefore silently
  do nothing. P2 must not trust `set` (§3.5).

### 3.2 Key scheme

All keys are built by one pure function so nothing hand-assembles a key:

```
hive.v3:schema                 → { schema: 3, migratedAt, source, rooms:[…],
                                   upstreamHash, unknownKeys:[…] }
hive.v3:index                  → { lastProjectId: 'p_…'|null,
                                   rooms: [{ key, projectId|null, updatedAt, title }] }
hive.v3:global                 → { swarm, timelineMode, agentExpanded, rightTab,
                                   dockOpen, agentDetailExpanded, teams,
                                   roster: [ … ] }
hive.v3:room:none              → room record (the projectless room)
hive.v3:room:<projectId>       → room record for project p_xxxxxxxx
```

The card's sketch was `hive.v3:<projectId>` + `hive.v3:index`. The `room:` infix
is a deliberate deviation: it keeps the three reserved global keys (`schema`,
`index`, `global`) in a namespace that a project key can never occupy, and it
gives the tests one regex to assert the whole key space:

```
^hive\.v3:(schema|index|global|room:(none|p_[0-9a-f]{8}))$
```

`hiveV3RoomKey(projectId)` throws on any id that is not `none` or `p_[0-9a-f]{8}`
— a name or path can never reach a key even if a caller passes one by mistake.

**Room record** (identical shape for `none` and for projects):

```js
{ title, cwd, scratch, mission, tasks: […], timeline: […],
  sessions: { [profile]: { storedId } },
  updatedAt }
```

**Global record** is project-agnostic by construction: no timeline, no tasks, no
scratch, no milestone, no cwd, no session ids.

### 3.3 Global vs per-project — the field map

Every `hive.v2` key (persisted by `hivePersist`, plugin.js:1853-1883) maps to
exactly one destination:

| v2 field | destination | reason |
|---|---|---|
| `title` | room | the room's name belongs to the room |
| `cwd` | room | projection of the room's project dir |
| `swarm` | global | relay preference, not project data |
| `scratch` | room | the shared scratchpad is this project's working doc |
| `mission` | room | the objective is per project |
| `tasks` | room | work items belong to the project's work |
| `timeline` | room | history is per project (the point of the phase) |
| `timelineMode` | global | presentation |
| `agentExpanded` | global | presentation |
| `rightTab` | global | presentation |
| `dockOpen` | global | presentation |
| `agentDetailExpanded` | global | presentation |
| `teams` (presets) | global | roster presets are team config |
| `members[].profile/browser/muted/leader/contextMode/model/provider/modelLabel` | global `.roster[]` | team config is project-agnostic |
| `members[].storedId` | room `.sessions[profile]` | **a session is cwd-bound, hence project-bound** |
| `members[].sessionId` | not persisted (runtime, as today) | unchanged from P1 |

### 3.4 Write path

`hivePersist()` keeps its name and its call sites (there are ~25 of them); it now
splits its argument instead of writing one blob:

```
hivePersist() → hiveSplitMembers($hiveMembers.get())      // { roster, sessions }
              → storage.set('hive.v3:global', buildGlobal())
              → storage.set($tsRoomKey.get(), buildRoom())   // room.sessions from the split
              → storage.set('hive.v3:index', touchIndex())   // updatedAt + title only
```

`buildRoom()` caps the timeline with the existing `hiveCapTimeline`
(plugin.js:1017) and the tasks with `HIVE_TASK_KEEP` (185), exactly as today —
**the caps do not change**, they just apply per room instead of once.

### 3.5 Verifying a write (because `set` can fail silently)

After writing a room key, the shell re-reads it and compares `hiveChecksum` of
the serialized record. On mismatch (or if the re-read is `null` while we wrote a
non-empty record) it sets `$tsRoomDirty`, appends ONE system timeline row
("room state could not be saved — storage rejected the write; free space or clear
this project's room") and stops retrying for 30 s. This is the honest handling of
a swallowed failure, and it is cheaper than a quota probe.

### 3.6 Growth

`localStorage` shares one per-origin quota across everything the app stores
(Chromium: typically 5–10 MB; S10 measures the real ceiling). P2 does **not**
delete rooms automatically — an automatic prune is a wrong guess away from
destroying someone's history. Instead: the selector shows a warning row when the
total serialized `hive.v3:*` size exceeds 3 MB, and the room menu gains an
explicit **"Clear this project's room"** action (inline confirm, same pattern as
`HiveResetButton`, plugin.js:2584) that deletes one room key and leaves the roster
alone.

---

## 4. Migration from the v2 blob

One-time, lossless, reversible, idempotent. Split into a **pure** part
(`hiveSplitV2`, in the CORE slice, covered by `test.cjs`) and a **shell** part
(`hiveV3Migrate`, storage I/O only).

### 4.1 Algorithm

```
hiveV3Migrate():                                  // called in register(), before bootHydrate
  1  schema = storage.get('hive.v3:schema', null)
  2  if schema && schema.schema === 3: return      // ← idempotent exit
  3  v2 = storage.get('hive.v2', null) ?? storage.get('hive.v1', null)
  4  if !v2 || !Array.isArray(v2.members) || v2.members.length === 0:
       set('hive.v3:global', emptyGlobal())        // the @default mint happens in bootHydrate,
       set('hive.v3:schema', { schema:3, source:'fresh', … })   // exactly as today
       return
  5  key  = v2.activeProject?.id ? hiveV3RoomKey(v2.activeProject.id) : 'hive.v3:room:none'
  6  { global, room, unknownKeys } = hiveSplitV2(v2)
  7  if storage.get(key, null) === null: set(key, room)          // never clobber a newer room
     else:                              set(key, hiveMergeRoom(get(key), room))
  8  if storage.get('hive.v3:global', null) === null: set('hive.v3:global', global)
  9  set('hive.v3:index', { lastProjectId: v2.activeProject?.id ?? null, rooms:[{key, …}] })
 10  set('hive.v3:schema', { schema:3, migratedAt:Date.now(), source:'hive.v2',
                             upstreamHash: hiveChecksum(rawText(v2)), rooms:[key],
                             unknownKeys })
 11  // hive.v2 / hive.v1 are LEFT IN PLACE. They are the rollback snapshot.
```

### 4.2 Lossless

`hiveSplitV2` is table-driven from §3.3 and **copies any unrecognised key into
the room verbatim**, reporting it in `unknownKeys` (which lands in
`hive.v3:schema`). So a future v2 field cannot be silently dropped by an older
P2 build — it survives and is auditable. Documented, intentional
transformations (and only these): `members` is split (roster/sessions), the
runtime `sessionId` is dropped (as `hivePersist` already drops it), and the
timeline is capped at `HIVE_TIMELINE_KEEP` (120) exactly as `hivePersist` already
caps it (plugin.js:1881). The test is a round-trip: for a full v2 fixture,
`union(global, room) === v2` apart from those three rules, asserted key by key.

### 4.3 Reversible

`hiveV3RevertToV2()` (a palette command, "Hive: revert project storage to v2"):

- refuses unless exactly one room key exists (and lists the extras), because v2
  cannot express two rooms;
- rebuilds a v2 blob = the global fields + that room + `members` joined from
  `roster ⨝ room.sessions`, and writes it to `hive.v2`;
- deletes `hive.v3:schema` so the next boot re-migrates.

Honest scope, stated in the UI: at migration time the single migrated room
round-trips exactly. Once several project rooms exist, `hive.v2` is a snapshot of
migration day, not a live mirror — and it is never modified, so it stays a valid
snapshot.

### 4.4 Idempotent

Gated on `hive.v3:schema.schema === 3` (step 2). A second run is a no-op:
rooms are written only when absent, and the global record only when absent. The
test runs the shell migration twice against a fake storage and asserts an
identical storage snapshot (same keys, same serialized values).

### 4.5 Boot order (replaces plugin.js:3759-3767)

```
register(ctx):
  hiveStorageRef = hiveStorageRef ?? ctx.storage
  hiveV3Migrate()                       // sync
  hiveInjectStyles()
  void hiveBootHydrate()                // global → index.lastProjectId → room → join
      .then(hiveLoadProjects)           // projects.list + projects.for_cwd reconcile
      .then(hiveReattachAll)            // ONE session.active_list (§5.3)
  … registrations, event wiring, a NEW host.onEvent('projects.changed', …) that
    refreshes $tsProjectList and re-resolves the active project (a vanished id
    degrades the selector; it never rewrites the room)
```

The legacy normalisation branch at plugin.js:3763-3766 (`hive.v2` without
`members`) is preserved inside `hiveBootHydrate` for the `room:none` record, so a
corrupt store still self-heals the way it does today.

---

## 5. Working-directory plumbing

### 5.1 Resolve

```
hiveProjectDir(project)                        // pure, no I/O
  project.primary_path → first folder with is_primary → folders[0] → ''
```

`projects.get { id }` (VERIFIED registered, methods_projects.py:86) refreshes the
folder list at selection time; `projects.list` rows already carry `folders[]`
with `is_primary` and `primary_path` (live-verified payload shape below).

### 5.2 Verify — what is available from a plugin (VERIFIED, live)

The desktop bridge forwards arbitrary `/api/*` paths
(`window.hermesDesktop.api({ path, method, body })` → `hermes:api` →
`handleHermesApiRequest` → `fetchJsonForBackend`, ARCHITECTURE §Workflows), and
`hermes_cli/web_routers/files.py` exposes a real directory probe:

```
GET /api/fs/list?path=<abs dir>
  existing dir → 200 {"entries":[{name,path,isDirectory}, …]}
  missing dir  → 200 {"entries":[],"error":"ENOENT"}
GET /api/fs/git-root?path=<abs dir>   → 200 {"root":"…"}
```

Both were reproduced live against the running gateway with the loopback session
token (raw output in §"Evidence" below). The bridge hop inside the renderer is
the one unproven half → **spike S7**. The guard that could refuse it
(`_hosted_fs_read_guard`, `hermes_cli/web_server_files.py:209-218`) only bites on
a locked/hosted deployment (`locked_root` set); on a local desktop it is a no-op.

### 5.3 Stamp

`hiveMintMember` (plugin.js:1654-1686) changes exactly two things:

```js
const dir = $tsActiveProject.get()?.dirState === 'verified' ? $hiveCwd.get() : ''
const params = { cols: 96, source: 'desktop', profile: key,
                 ...(dir ? { cwd: dir, cwd_explicit: true } : {}) }
```

- `cwd_explicit: true` is what makes a deliberate pick win outright over the
  host's own probe (`_resolve_create_cwd`, `tui_gateway/session_workdir.py:246-251`:
  a desktop-sourced `cwd_explicit` adopts the raw path). We only ever send it
  **after our own check passed**, so it can never fabricate a workspace.
- Unverified / no project → **no `cwd` key at all**, which is exactly today's
  behavior (`plugin.js:1664`) and lets the member profile's own configured
  workspace keep winning.
- After create, compare `created.info.cwd` with what we asked for. If they differ,
  append ONE system timeline row: `@x runs in <info.cwd> — the gateway did not
  adopt <dir>`. Live-verified that this fallback is silent otherwise: creating a
  session with a nonexistent path returns `info.cwd = "/Users/adnan"` with no
  error.

### 5.4 Show

Toolbar item 1 shows, for the open room: project name · `git branch` · the
directory · a verified/unverified badge. The directory is set from the **room's
`cwd`**, which is written from the **verified** dir at selection time — so what
the user reads is what sessions get. A per-member line in the agent detail
(§2.3 of DESIGN.md) shows the member's own `info.cwd` when known, which is the
only honest answer to "where does @x actually run".

### 5.5 F1 — the reattach design (required, and it is a correctness fix)

**F1 is confirmed live, not just by reading.** `host.request('session.info', …)`
(plugin.js:1926) cannot work:

- `session.info` is an **event**, never a method. Live probe:
  `{"error":{"code":-32601,"message":"unknown method: session.info …"}}`. Source:
  `_emit("session.info", …)` at `tui_gateway/server.py:1117, 2461, 2503, 2793`;
  no `@method("session.info")` exists anywhere in `tui_gateway/`.
- A prompt needs a **live runtime id**. `_sess_nowait` (`tui_gateway/server.py:1228-1243`)
  rejects a stored key with `4001` and logs "client should resume the stored
  session". So every hydrated member is unreachable until the user hits "Fresh
  context" — which throws the transcript away.

Design:

```
hiveReattachAll()                                   // once, at boot
  rows = await host.request('session.active_list', {})       // read-only, no attach
  plan = hiveReattachPlan($hiveMembers.get(), rows.sessions) // PURE (tested)
  apply: member.sessionId = plan.liveId ?? null
         member.attach    = 'live' | 'stored' | 'gone'

hiveEnsureLive(member)                              // before prompt.submit / stop / open-session
  1 if member.sessionId is still in the cached active map → use it
  2 else re-run session.active_list → match session_key === member.storedId
  3 else session.resume { session_id: member.storedId, profile: member.profile,
                          lazy: true, omit_messages: true }
        → { session_id, session_key, running, status }   // _resume_response :894-910
  4 else (4007) member.attach = 'gone' → roster entry reads
        "session is gone — restart @x"; never silently re-mint
```

Why each choice:

- `session.active_list` is the mapping source because its rows carry **both**
  ids: `{ id: <live sid>, session_key: <stored id>, status, title, … }`
  (`_session_live_item`, `tui_gateway/server.py:3058-3079`) — live-verified: after
  `session.create` the two new drafts appeared with `session_key` equal to their
  `stored_session_id`. One call, no per-member RPC, no transport attach.
- `session.resume` is only used on demand, never for all members at boot: a live
  reattach **attaches an extra viewer** rather than stealing the slot
  (`_resume_reuse_live` → `_live_session_payload`, `methods_session.py:868-873`;
  `_rebind_live_transport` — "Attach a live peer without displacing existing
  subscribers", `tui_gateway/session_lifecycle.py:830-848`), but doing it ten
  times at load would be ten attachments and ten potential agent builds for no
  benefit.
- `lazy: true, omit_messages: true` keeps a 287-message transcript out of the
  renderer (the room reads events, not history) and keeps `_resume_guard`
  tip-only (`methods_session.py:854-855`), so the `sessions.max_resume_messages`
  guard cannot refuse a well-compressed member.
- `session.list` (methods_session.py:541-566) is **not** the primary path: it
  reads the profile's `state.db` rows (`{id, title, preview, source, …}`,
  live-verified: `id` is the stored key, `source: 'desktop'`), which is a fine
  fallback for "does this stored session still exist" but carries no live id and
  costs a DB open per profile.

---

## 6. Project selector (toolbar, DESIGN.md §5 item 1)

### 6.1 States

| state | trigger | what the trigger shows |
|---|---|---|
| `loading` | `$tsProjectList === null` | name placeholder + spinner |
| `ready` | list loaded, our id resolves | project name · branch · verified dir |
| `no-project` | user chose "No project" | "No project — projectless room" + dir "—" |
| `degraded` | `$tsProjectError !== ''` | "Projects unavailable" + reason on hover/focus + Retry row; the room keeps working |
| `unresolved` | persisted id absent from the list (profile switch, project deleted) | "<name> (unavailable)" → rows: Choose a project · Keep this room |

`unresolved` never rewrites or migrates anything: the room is served from its own
key, and `$tsActiveProject` keeps the id so a later boot can resolve it again
(project ids are unique in the launch profile's `projects.db`). The list itself
**includes archived projects** — `_projects_payload` calls
`list_projects(include_archived=True)` (methods_projects.py:18-20) — so archived
rows render with an `archived` tag and stay selectable when a room exists for
them; archiving therefore never strands a room, and only a real delete can.

### 6.2 Menu rows

1. **No project** — opens `hive.v3:room:none`.
2. one row per `projects.list` entry — name, `git branch` (from the cached
   `projects.for_cwd` probe of its primary path, refreshed on open), full path in
   the tooltip; a ✓ marks the app's own `active_id`, a filled dot marks ours.
3. **Open a folder…** — `ctx.os.pickOpenPath({ title: 'Choose a project folder' })`
   (SDK door: `PluginOs.pickOpenPath` → `bridge.selectPaths`,
   `apps/desktop/src/contrib/plugin.ts:259-265`, interface at :82). Returns a path or `null`
   (cancel = no change).
4. **New project workspace…** — a small sheet (name, folder, board slug optional)
   → `projects.create { name, primary_path, folders:[path], use: true }`
   (registered, methods_projects.py:91-103) → the returned `{project}` is
   selected. Failure modes handled explicitly:
   - `5063` (`_E_PROJECT_ARG`) "folder already belongs to project 'X' (p_…)"
     (`hermes_cli/projects_db.py:239-244` names the owner) → re-resolve with
     `projects.for_cwd { cwd: path }` and select that project, telling the user.
   - `projects.create` unavailable → the row is disabled with the reason.

### 6.3 The plain-folder tradeoff, and the decision

**Decision: creating a Hermes Project is the chosen path; projectless-with-a-cwd
is rejected.**

| | create a project (chosen) | run projectless with just a cwd (rejected) |
|---|---|---|
| isolation key | immutable `p_…` id | none — would need a path hash |
| stability | survives rename/move (`projects.update`), has folders, board link | orphans on rename; two rooms can name the same path |
| user visibility | the folder appears in the app's own sidebar — no hidden state | state exists only inside the plugin |
| fidelity to ARCHITECTURE §5 | one project source (`projects.db`) | a second, parallel project identity — forbidden |
| cost | writes to a shared surface | none |
| reversibility | `projects.archive` / `projects.delete` exist (user's door, not ours) | n/a |

The cost is mitigated, not hidden: the confirm sheet states exactly what will be
created (name = folder basename by default, primary path = the picked folder, no
board), the write happens only on the explicit click, and a system timeline row
records "created project <name> for <path>". The **projectless** need is still
served — by "No project", which sends no `cwd` at all instead of a half-bound one.

### 6.4 Remembering the selection

`hive.v3:index.lastProjectId` is written on every selection. At boot:

- our stored id **wins for the room** — we open `hive.v3:room:<storedId>`;
- `projects.list.active_id` is **read-only at boot** (it drives the ✓);
- the app's `set_active` is written **only** on an explicit user selection
  (`projects.set_active { id }`, methods_projects.py:117-121; P1 already calls it
  at plugin.js:2869 and keeps its failure non-fatal).

That rule keeps the plugin from stealing the app's active project on load while
still letting the sidebar follow the user's choice.

---

## 7. Switching during active work

Gate: `hiveProjectSwitchAction(busyCount)` (pure). `busyCount` comes from the
existing status derivation (DESIGN.md §2.4) over the **open room's** members.

- `busyCount === 0` → switch immediately: write `lastProjectId`, open the target
  room, `projects.set_active`, refresh the toolbar. Nothing running is touched.
- `busyCount > 0` → a three-option confirm. Never silent, never automatic:

| option | what happens | what it guarantees |
|---|---|---|
| **Open in a new room** (default) | the target room opens in the same page; the running members keep their room, their sessions and their cwd | the running turn's stream keeps landing in the original room; no `cwd` is touched anywhere |
| **Wait until they finish** | the selection is queued (`$tsSwitchPending`), applied when the derived busy count reaches 0; a visible pending chip + Cancel | nothing is interrupted |
| **Stop them and switch** | `hiveStopMember` for each busy member (existing `session.interrupt` path, plugin.js:1803-1821) behind the inline confirm, then switch | the user's intent is explicit, twice |

Two hard rules behind the table:

1. **Never re-cwd a running agent.** The host enforces this and we rely on it:
   `session.cwd.set` refuses a running session with `4009 session busy`
   (`tui_gateway/methods_session.py:1086-1089`). P2 does not call
   `session.cwd.set` anywhere — a member's directory is fixed at mint and the
   only way to re-home an agent is a fresh session in the target room.
2. **Fresh sessions when required.** A member with no `sessions[profile]` entry in
   the target room is minted fresh there with that project's cwd on its first
   delivery; a member that already has one is reattached to it (§5.5). Both paths
   are visible in the roster ("fresh session" vs "reattached").

The "open in a new room" default is what makes switching back free: the original
room's state is untouched on disk while another room is open, so returning is a
read of a key that never moved.

---

## 8. Isolation acceptance test plan

Sandboxes (the folder exists; `projects.for_cwd` on it returned
`{project:null, cwd:…, branch:'master'}` and `/api/fs/git-root` returned the root,
live-verified):

```sh
mkdir -p ~/Developer/hermes-sandbox/proj-a ~/Developer/hermes-sandbox/proj-b
for d in proj-a proj-b; do (cd ~/Developer/hermes-sandbox/$d && git init -q && echo "# $d" > README.md && git add . && git commit -qm init); done
```

Nothing outside `~/Developer/hermes-sandbox/` may be created, modified or deleted
by any P2 test. No test may point a project at the live plugin folder
(`~/.hermes/desktop-plugins/buzz-hive/`) or the worktree.

| # | steps | pass condition |
|---|---|---|
| T1 | create `proj-a` and `proj-b` through the selector's own "Open a folder…" flow | both appear in `projects.list` with `primary_path` = the sandbox dir; no duplicate project was created |
| T2 | select `proj-a`; mint 1 member; exchange a marker turn (`[task @x]`, `[done #1]`) | the cards land in room A's timeline; `hive.v3:room:<A>` exists, `hive.v3:room:<B>` does not; A's `sessions[profile].storedId` is set |
| T3 | switch to `proj-b` with no busy members | B's timeline/scratch/mission/tasks are B's (empty); the **roster is identical**; every member shows "no session yet in this project" |
| T4 | mint the same profile in B | a NEW `stored_session_id` (≠ A's) and the `session.create` params contained `cwd = …/proj-b` |
| T5 | switch back to A | A's timeline/tasks/scratch are identical to T2's state (compare serialized `hive.v3:room:<A>`, ignoring `updatedAt`); the member reads `attach: 'live'` or reattaches to A's session; no re-mint happened |
| T6 | in the B member's session, submit a `pwd` / `git rev-parse --show-toplevel` turn | the `tool.complete` payload shows `…/proj-b` **and** the mint-time `info.cwd` agreed; a disagreement FAILS the run (that is the silent-fallback path §5.3 guards) |
| T7 | reload the window (Cmd-R) | same project open, same room, timeline intact, members reattached; the console shows **zero** `session.info` requests; no duplicated rows |
| T8 | migration: snapshot the real `hive.v2` to a fixture first, then boot once, then boot again | v2-shaped content lands under the right room key; `hive.v2` is byte-identical; `hive.v3:schema` written once; the second boot's storage snapshot equals the first's |
| T9 | non-regression | `node test.cjs` and `node smoke-render.mjs` fully green (292 + 80 baseline counts unchanged, plus the new P2 tests) |

**How "agents actually run in the right folders" is verified** (the question the
card asks): two independent signals that must agree — (a) the `info.cwd` echoed
by `session.create` at mint, and (b) the member's own `pwd`/`git rev-parse`
tool output arriving through the existing `tool.complete` event. The
`projects.for_cwd` probe answers a different question (which project owns a
path), so it is used as a third, corroborating signal only.

---

## 9. Pure helpers promoted into the CORE slice (plugin.js:174-1193)

So `test.cjs` can cover the whole storage layer without a DOM:

| helper | contract (asserted) |
|---|---|
| `hiveV3RoomKey(projectId)` | `'none'`→`hive.v3:room:none`; `p_xxxxxxxx`→`…:room:p_…`; anything else throws |
| `hiveSplitV2(v2)` | table-driven per §3.3; every unknown key preserved in `room` + reported in `unknownKeys`; total: `union(global, room)` covers every v2 key |
| `hiveMergeRoom(old, next)` | union by timeline id, newest scalar wins, never drops a task |
| `hiveJoinMembers(roster, sessions)` / `hiveSplitMembers(members)` | inverse of each other; `sessionId` never survives a persist round-trip |
| `hiveChecksum(text)` | FNV-1a over the string; stable across runs; used by the migration fingerprint and the write verification |
| `hiveProjectDir(project)` | `primary_path` → primary folder → first folder → `''` |
| `hiveReattachPlan(members, activeRows)` | `[{profile, storedId, liveId, attach}]`, pure |
| `hiveProjectSwitchAction(busyCount)` | `'open'` \| `'confirm'` |

Component deltas (referring to the P1 tree in DESIGN.md §9): `TsProjectSelector`
gains the five states of §6.1, the two extra menu rows and `TsDirBadge`;
`TsNewProjectSheet` is new; `TsWorkspace` gains a one-line degraded/unresolved
banner strip above the timeline; `TsAgentDetail` gains the member's `info.cwd`
line and the attach state. Nothing else in the tree moves.

---

## 10. Spike gates FORGE runs before building the dependent piece

| # | spike | exact check | if it fails |
|---|---|---|---|
| **S7** | `/api/fs/list` through the desktop bridge | from the plugin page console: `await window.hermesDesktop.api({ path: '/api/fs/list?path=' + encodeURIComponent(dir) })` for an existing and a missing dir | `dirState` degrades to `unknown`: pass `cwd` without `cwd_explicit`, and always report the adopted `info.cwd` (§5.3). The HTTP half is already VERIFIED (§Evidence) — only the bridge hop is open. |
| **S8** | reattach end-to-end | restart the app with a room of ≥2 members; confirm `session.active_list` maps both `storedId`s, no `session.info` call appears, and a prompt to a hydrated member succeeds without "Fresh context" | fall back to Today's behavior **only for the resolution step** (the member still shows "detached" + a "Fresh context" button) — never re-introduce the dead RPC |
| **S9** | `projects.create` from plugin context | create a throwaway project on `…/hermes-sandbox/proj-a` through the selector flow, assert it in `projects.list`, then delete it and confirm the deletion | "New project workspace…" row becomes disabled with the reason; "Open a folder…" then requires an existing project for that path |
| **S10** | storage ceiling | write a synthetic full-size room (120 timeline entries + 40 tasks + 8 kB scratch) through `ctx.storage`, read it back, and compare `hiveChecksum` — repeat until a write fails; record the byte ceiling | lower `HIVE_TIMELINE_KEEP` for rooms and raise the §3.6 warning threshold to 60 % of the measured ceiling |

S1–S6 from Phase 1 keep their results (S3/S4/S5 already live-verified — see
`TEAM_WORKSPACE_PROGRESS.md`); P2 adds no new event subscriptions beyond
`projects.changed`, which is a plain contract event
(`tui_gateway/contracts/events.py:756`).

---

## 11. Acceptance checklist (SENTRY verifies)

Rendering & persistence
- [ ] **P2-A1** The selector renders all five states of §6.1 with real data; `degraded` and `unresolved` show a reason, not an empty menu.
- [ ] **P2-A2** The toolbar shows project name · branch · directory for the open room, and the directory matches the room record.
- [ ] **P2-A3** With no project selected the room is the Phase 1 room (key `hive.v3:room:none`, same timeline, and `session.create` sends no `cwd`).

Isolation
- [ ] **P2-A4** T2 + T5: two projects hold independent timeline/scratch/mission/tasks; switching back is byte-identical (modulo `updatedAt`).
- [ ] **P2-A5** T4 + T6: agents run in the selected folder — the member's own `pwd`/`git rev-parse` output and the mint-time `info.cwd` agree.
- [ ] **P2-A6** The roster and team presets are shared across projects while sessions are not (same profile in two projects ⇒ two `storedId`s, `hive.v3:global.roster` unchanged).

Migration
- [ ] **P2-A7** `hive.v2` is byte-identical after migration; a second boot writes nothing new; a full v2 fixture round-trips through `hiveSplitV2` with zero dropped keys and the unknown keys reported.
- [ ] **P2-A8** Revert reconstructs a valid `hive.v2` with one room, and refuses (destroying nothing) with two.

Reattach
- [ ] **P2-A9** After an app restart a hydrated member receives a prompt without "Fresh context"; the console shows zero `session.info` requests.
- [ ] **P2-A10** A member whose stored session was deleted resolves to `attach:'gone'` and says so; it is never silently re-minted.

Switching
- [ ] **P2-A11** Switching during a busy turn offers the three options; "Open in a new room" leaves the running member's cwd untouched (its own `pwd` still reports the old project) and its stream still lands in the old room.
- [ ] **P2-A12** No code path calls `session.cwd.set` (grep + runtime).

Non-regression
- [ ] **P2-A13** `node test.cjs` all pass (292 baseline + the new pure tests); `node smoke-render.mjs` all pass (80 baseline + new).
- [ ] **P2-A14** Marker grammar unchanged: the scripted `[task]/[done]/[review]/[verdict]/[to @x]` exchange produces the same cards, and hop budget, fan-out cap, queued chips, scratchpad and mission are unchanged.
- [ ] **P2-A15** Console clean across load → project switch → reload → disable → re-enable; no duplicate timeline rows; `ctx.onDispose` still removes every subscription and the injected style.

**BLOCKED-tolerated rows (with the reason, so SENTRY does not have to guess):**

- **B1 — the app's own sidebar reflecting `projects.set_active`.** The mutation is
  called (§6.4) but the sidebar is a different React tree; proving it needs a
  human looking at the window. Tolerated as HUMAN-CHECK.
- **B2 — the native folder picker.** `ctx.os.pickOpenPath` needs a real user
  gesture in the Electron window; headless verification can only assert the call
  site, the `null`-cancel path and the manual-path entry as a fallback.
- **B3 — `session.cwd.set` returning `4009 session busy`.** Source-verified
  (`methods_session.py:1086-1089`); triggering it live needs a genuinely running
  member turn. P2 never calls it, so the row is a guard, not a feature.

---

## 12. Honest gaps (do not overclaim)

1. **Room granularity is (project id), not (project, branch).** `projects.for_cwd`
   reports a branch, but the project model has no branch dimension, so two
   worktrees of one project share one room. Phase 5 (worktrees) must revisit this
   or accept shared rooms.
2. **Rooms for deleted projects are not garbage-collected.** They are listed in
   `hive.v3:index` and removable by hand ("Clear this project's room"); automatic
   deletion is deliberately absent — a wrong guess destroys a history.
3. **No cross-project view.** The roster is shared, but nothing shows two
   projects' rooms at once.
4. **The project namespace is the launch profile's `projects.db`.** `projects.*`
   is `@registry.profile_scoped` (`methods_projects.py:24-39`) and the plugin
   calls it with no `profile`, so a member running on another profile gets the
   directory but the project itself is not "its" project. Deliberate: the room is
   app-global (ARCHITECTURE §5), and a per-profile project list would be the
   parallel list the plan forbids.
5. **Storage is `localStorage`.** All of P2 inherits that medium: one shared
   per-origin quota, synchronous writes, no transactions, and a `set` that can
   fail silently (§3.5 is the mitigation, not a fix).
6. **P2 does not fix the delegation, kanban, worktree, approval or workflow
   gaps** in DESIGN.md §"honest gaps" 1-4. Those are Phases 3-8.

---

## 13. Risks

- **R1 — one member profile can be unusable** (the Phase 2 design task itself
  crashed on a provider 403). Unchanged by this phase; a member whose profile
  cannot start shows the existing `notifyError` path.
- **R2 — `session.resume` can briefly refuse** a session whose disconnect
  interrupt is settling (`_reattach_refusal` → `4009 "session disconnect
  interrupt settling"`, `tui_gateway/session_lifecycle.py:819-827`). The design
  retries once after 1.5 s and then reports "not attachable right now" — it never
  loops and never re-mints.
- **R3 — storage growth across projects.** Mitigated by the unchanged per-room
  caps, the §3.6 size warning and the explicit clear action; measured by S10.
- **R4 — a `projects.changed` burst** (the app moves the active project, the user
  selects one) could thrash the selector. Mitigated: the subscription only
  refreshes `$tsProjectList` and re-resolves the active project; it never writes
  a room and never calls `set_active`, so no loop is possible.

---

## Evidence — live probe, 2026-10-18

Runnable probe: `sentry-probe/p2-spike.mjs`; unedited output:
`sentry-probe/p2-spike-raw.json` (re-run instructions in
`sentry-probe/README-p2-spike.md`).

Method: raw JSON-RPC over the running desktop gateway's `/api/ws` with the
loopback session token — the same surface `host.request` forwards to
(`src/sdk/index.ts:1623`, no method allow-list), plus HTTP for the REST routes.
Read-only except two disclosed empty session drafts on profile `arch`
(`session.create` with no prompt ⇒ no DB row, `methods_session.py:445-447`). No
project was created, selected or modified.

```
REST  GET /api/fs/list?path=<existing sandbox>   → 200 {"entries":[]}
REST  GET /api/fs/list?path=<missing dir>        → 200 {"entries":[],"error":"ENOENT"}
REST  GET /api/fs/git-root?path=<sandbox>        → 200 {"root":"/Users/adnan/Developer/hermes-sandbox"}

RPC   projects.list            → {"projects":[{id:"p_e2b0e663", slug:"the-eye-ai-model",
                                   primary_path:"/Users/adnan/Projects/the-eye-ai-model",
                                   board_slug:"team", folders:[{path:…, is_primary:true}]}, …],
                                   "active_id":"p_967a0287"}
RPC   projects.for_cwd{sandbox}   → {"project":null,"cwd":"/Users/adnan/Developer/hermes-sandbox","branch":"master"}
RPC   projects.for_cwd{worktree}  → {"project":null,"cwd":"…/hive-team-studio/worktree","branch":"team-studio"}
RPC   session.active_list      → {"sessions":[{id:"9c24f508", session_key:"20261017_200347_fc2cf1",
                                   status:"idle", title:"…", message_count:145}, …]}   ← both ids present
RPC   session.list{limit:3}    → rows {id:"20261017_215235_b43849", resolved_id:null,
                                   title:"…", source:"desktop", message_count:133}
RPC   session.info             → {"error":{"code":-32601,"message":"unknown method: session.info …"}}   ← F1
RPC   session.create{profile:"arch", cwd:"<existing dir>"}
                               → info.cwd = "/Users/adnan/Developer/hermes-sandbox"   ← adopted verbatim
RPC   session.create{profile:"arch", cwd:"<missing dir>"}
                               → info.cwd = "/Users/adnan"                            ← silent fallback, no error
RPC   session.active_list      → both new drafts present with session_key === stored_session_id
RPC   session.cwd.set          → {"cwd":"…/hermes-sandbox","branch":"master"} on an idle session
                                 (the 4009 busy guard needs a running turn → B3)
```
