/**
 * Buzz-Hive — a Buzz-like agent room inside the Hermes desktop app.
 *
 * Up to 10 Hermes agent profiles share one room with the user + the default
 * agent. The user @-tags any member; members coordinate over a tag grammar
 * relayed by this plugin. One member holds the browser role. Each member runs
 * in its OWN dedicated session (never the main desktop chat).
 *
 * Grounded in ~/.hermes/hermes-agent source (Aug 2026):
 *  - concurrent per-profile sockets  → gateway.ts:9-16 (events carry `profile`)
 *  - profiles                       → window.hermesDesktop.api({path:'/api/profiles'})
 *  - create profile                 → POST /api/profiles {name, clone_from}
 *  - mint member session            → host.request('session.create', {profile,...})
 *  - inject into any session        → host.request('prompt.submit',{session_id,text})
 *  - hear members                   → host.onEvent: message.start/delta/complete,
 *                                     thinking.delta, reasoning.delta, tool.start
 *                                     + assistant.completed fallback (api_server surface)
 *  - interrupt a member             → host.request('session.interrupt',{session_id})
 *  - open a session                 → host.navigate('/' + encodeURIComponent(storedId))
 *
 * UX controls: per-member color accents (profileColor + profileColorSoft, with a
 * stable fallback for `default`), live "answering" rows, reset-room, stop member,
 * mute member, agent-to-agent swarm toggle, timeline persistence, timestamps,
 * light markdown rendering.
 *
 * Save as: ~/.hermes/desktop-plugins/buzz-hive/plugin.js
 * Plain ESM, loaded uncompiled — jsx() calls, not JSX syntax.
 * v1 (restore point tagged v1-restore-point) — public repo: 0-CYBERDYNE-SYSTEMS-0/hermes-hive
 * v1.1: shared scratchpad, inline SOUL editor, add-popover close fix.
 * v1.2: collapsible pane → slim 32px rail (chevron to re-expand, ⌘K retained).
 * v1.3: collapse = pane-shell NATIVE zone minimize (standard vertical rail with
 *   a clickable tab to restore), matching theme-forge. Removed the custom 32px
 *   rail — one pane, always registered; two states only (expanded / native rail).
 */

import {
  atom,
  useValue,
  host,
  Button,
  Input,
  Textarea,
  ScrollArea,
  Badge,
  StatusDot,
  Switch,
  SegmentedControl,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  useQuery,
  queryClient,
  icons,
  cn,
  profileColor,
  profileColorSoft,
  haptic,
  PALETTE_AREA,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useMemo, useRef, useState } from 'react'

// ── config ──────────────────────────────────────────────────────────────────
const HIVE_PLUGIN_ID = 'buzz-hive'
const HIVE_ROUTE = '/hive'
const HIVE_MAX_MEMBERS = 10 // profile members (You is extra, pinned)
const HIVE_STORAGE_KEY = 'hive.v2'
const HIVE_LEGACY_STORAGE_KEY = 'hive.v1'
const HIVE_DEFAULT_ACCENT = 'hsl(208 72% 56%)' // stable blue for `default`
// NOTE: the tuning constants the pure core depends on live INSIDE the
// CORE-BEGIN/CORE-END markers, so the slice test.cjs evaluates is
// self-contained. They used to sit here and be re-declared by the harness,
// which meant the tests could silently drift from the real values.
// Inline style tokens for sizes the frozen build CSS doesn't ship (arbitrary
// Tailwind classes like text-[10px] / size-1.5 generate ZERO rules — audit
// against app.asar.unpacked/dist/assets/index-*.css).

const HIVE_T = Object.freeze({
  dot: { width: 6, height: 6, borderRadius: 999, flexShrink: 0 },
  xs: { fontSize: 10, lineHeight: '14px' },
  xsRemoveMl: { fontSize: 10, lineHeight: '14px', marginLeft: 8 },
  sm: { fontSize: 11, lineHeight: '15px' },
  streamDots: { fontSize: 10, lineHeight: 0 },
  wrap: { overflowWrap: 'anywhere', wordBreak: 'break-word' },
  xsWrapWide: { fontSize: 10, lineHeight: '14px', overflowWrap: 'anywhere', wordBreak: 'break-word' }
})

// ── reactive state ──────────────────────────────────────────────────────────
const $hiveMembers = atom([]) // { profile, sessionId, storedId, status, browser, muted }
const $hiveTimeline = atom([]) // { id, ts, from, kind, text, to? }
const $hiveTitle = atom('hive')
const $hiveCwd = atom('')
const $hiveComposer = atom('')
const $hiveMentionOpen = atom('') // autocomplete filter when composing @name
const $hiveSwarm = atom(true) // agent-to-agent relays on/off
const $hiveScratch = atom('') // shared team scratchpad (markdown), injected every turn
// The room's standing objective. Pinned, never trimmed, shipped in EVERY
// delivery: the rolling digest is only 12 entries deep, so without this the
// original goal scrolls out of every member's view within a few turns.
const $hiveMission = atom('')
// Work items — the validation spine. Prose alone can't express "check my work",
// so review is tracked as state the relay routes on.
const $hiveTasks = atom([])
const $hiveView = atom('timeline') // 'timeline' | 'scratch' | 'soul:<profile>'
// Timeline presentation: 'flat' (chronological feed — the Phase 1 default) |
// 'agents' (grouped, per-agent collapsible sections). An existing room keeps
// whatever it persisted; the toggle stays. Expand/collapse is per-agent.
const $hiveTimelineMode = atom('flat')
const $hiveAgentExpanded = atom({}) // { [profile]: true|false } — default collapsed
// Attention chips: last time a group was expanded, per profile (unseen counting).
const $hiveGroupSeen = atom({}) // { [profile]: ts }
// Live model catalog (ModelOptionsResponse.providers) fetched from the
// gateway's `model.options` RPC — the SAME source the built-in picker uses.
// `null` = not loaded yet; [] = loaded but nothing configured.
const $hiveModelCatalog = atom(null)
// Cache of the last successful fetch so the picker doesn't re-fetch on every
// open (the desktop's model options query is cached the same way).
let _hiveModelCatalogAt = 0
const HIVE_MODEL_CATALOG_TTL = 60_000 // 60s — providers/models rarely change mid-session
// The page is opened through the sidebar, command palette, and internal actions.
// Keep one imperative opener so reset/actions can return the user to the room
// without trying to mutate the desktop pane tree.
let hiveOpenPage = null
const HIVE_PLUGIN_VERSION = 'v1.5'
// Completion dedup: session -> last-processed timestamp.
const _hiveProcessed = new Map()
// Profiles whose next turn is the seeded room brief ack (suppressed from TL).
const _hiveSeeded = new Map()

// ── Phase 1 (Team Studio) workspace state ───────────────────────────────────
// All plugin-local. Persisted keys ride in the SAME `hive.v2` blob (adding keys
// is backward compatible; hiveBootHydrate null-defaults them).
const $tsActiveProject = atom(null) // { id, slug, name, primaryPath, branch } | null
const $tsProjectList = atom(null) // last projects.list rows (null = not loaded)
const $tsProjectError = atom('') // last projects.* failure ('' = fine)
const $tsRightTab = atom('tasks') // tasks | activity | files | approvals | workflow
const $tsAgentSelected = atom(null) // member profile | null (not persisted)
// The left panel's per-agent accordion. Deliberately NOT $hiveAgentExpanded:
// that atom drives the grouped TIMELINE's per-agent sections, and conflating
// the two would change proven timeline behavior.
const $tsAgentExpanded = atom({}) // { [profile]: true }
const $tsDockOpen = atom(false) // bottom dock expanded?
const $tsTeams = atom([]) // roster presets [{ name, members: [{ profile, contextMode, model, provider }] }]
const $tsSheets = atom({ team: false, right: false }) // <600px overlay sheets
const TS_RIGHT_TABS = Object.freeze([
  { id: 'tasks', label: 'Tasks' },
  { id: 'activity', label: 'Activity' },
  { id: 'files', label: 'Files' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'workflow', label: 'Workflow' }
])
const TS_APPROVAL_POLL_MS = 5000
const TS_WORKFLOW_POLL_MS = 30000

// module refs set in register()
let hiveStorageRef = null
let hiveCtxRef = null // register()'s ctx — scoped timers + the curated OS door
let hiveStyleEl = null // the one injected <style>, removed on unload
// Per-session delta coalescer: sessionId -> { text, count, dispose }.
const _hiveDelta = new Map()

// ── create-CORE-BEGIN (pure functions; sliced verbatim by test.cjs) ────────

const HIVE_DIGEST_LEN = 12
const HIVE_PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const HIVE_SCRATCH_INJECT_MAX = 4000 // chars injected into each agent turn
const HIVE_SCRATCH_STORE_MAX = 8000 // chars kept in the shared doc
// Relay budgets. Without these an untagged reply fans out to every member and
// each of those replies fans out again — the room becomes an amplifier instead
// of a team. Hops bound the chain depth; fanout bounds a single turn's blast.
const HIVE_MAX_HOPS = 3
const HIVE_MAX_FANOUT = 6
const HIVE_TASK_KEEP = 40 // work items retained in state

const hiveNormalize = (name) => ((name || '').trim() || 'default').toLowerCase()

/** Normalize a field that is legitimately allowed to be EMPTY (an unassigned
 *  reviewer, say). hiveNormalize answers "which profile?" and falls back to
 *  `default`, which for an optional field silently addresses whoever happens to
 *  be named `default` — an unreviewed submission was being routed to them. */
const hiveNormalizeOpt = (name) => (name || '').trim().toLowerCase()

// Context policy is deliberately small and explicit. Standard ships the full
// room-aware envelope; Minimal ships a fielded handoff without the digest.
// BOTH carry the standing header, the shared scratchpad and the member's open
// work items — those ARE the shared memory, and a member that can't see them
// cannot act as a teammate. "Minimal" bounds the chatter, not the awareness.
const HIVE_CONTEXT_MODES = Object.freeze(['standard', 'minimal'])

function hiveNormalizeContextMode(mode) {
  const value = String(mode || '').trim().toLowerCase()
  return HIVE_CONTEXT_MODES.includes(value) ? value : 'standard'
}

/** Clip a block, keeping the HEAD. The mission and the founding decisions live
 *  at the top of the scratchpad, so trimming from the front is precisely
 *  backwards — it destroys the context worth keeping. */
function hiveClipHead(text, max) {
  const s = String(text || '')
  if (s.length <= max) return s
  return s.slice(0, max) + '\n…(truncated — full doc in the room\'s Scratchpad tab)'
}

/** The standing header every member gets on every delivery, in every mode:
 *  who they are, what the room is for, and who else is on the crew. Roster
 *  drift is the single biggest reason members stop addressing each other, so
 *  the roster ships every turn rather than only at join time. */
function hiveBuildStandingHeader({ member, members, title, mission } = {}) {
  const me = hiveNormalize(member && member.profile)
  const roster = [...(members || []), { profile: 'you' }]
    .map((m) => '@' + hiveNormalize(m.profile))
    .join(', ')
  const goal = String(mission || '').trim()
  return (
    `[hive] you are @${me} in room "${title || 'hive'}"\n` +
    `roster (address ONLY these): ${roster}\n` +
    `mission: ${goal || '(none set — ask @you to set one)'}`
  )
}

function hiveBuildHandoffCapsule(member, sender, text, meta = {}) {
  const target = hiveNormalize(member && member.profile)
  const from = hiveNormalize(sender || 'you')
  const status = String(meta.status || (member && member.status) || 'idle')
  const artifact = String(meta.artifact || 'room-local relay')
  const ask = meta.ask === true ? 'true' : 'false'
  const acceptance = String(meta.acceptance || 'Respond with result, blocker, or next action.')
  return (
    `[HIVE HANDOFF]\n` +
    `from: @${from}\n` +
    `to: @${target}\n` +
    `status: ${status}\n` +
    `artifact: ${artifact}\n` +
    `ask: ${ask}\n` +
    `acceptance: ${acceptance}\n\n` +
    String(text || '')
  )
}

/** Render the work items this member is accountable for. Only their own rows —
 *  a full board in every envelope is noise, and noise is what stopped the
 *  previous protocol from being followed. */
function hiveFormatWorkItems(tasks, member) {
  const me = hiveNormalize(member && member.profile)
  const mine = (tasks || []).filter(
    (t) => t && t.status !== 'passed' && (hiveNormalizeOpt(t.owner) === me || hiveNormalizeOpt(t.reviewer) === me)
  )
  if (!mine.length) return ''
  const rows = mine.map((t) => {
    const role = hiveNormalizeOpt(t.reviewer) === me && hiveNormalizeOpt(t.owner) !== me ? 'reviewing' : 'own'
    return `#${t.id} [${t.status}] ${role}: ${t.title}`
  })
  return `[your open work items]\n${rows.join('\n')}`
}

/**
 * THE context seam. Every message a member receives is assembled here — one
 * place, so what an agent knows is a property of this function rather than of
 * whichever call site happened to reach it.
 *
 * Sections are joined with real newlines. (They were previously written as
 * `\\n` inside template literals, which emits a literal backslash-n: every
 * relay arrived as one run-on line and the "markdown scratchpad" the brief
 * promised never materialized.)
 */
function hiveBuildContextEnvelope({
  mode, member, members, title, mission, sender, text, timeline, scratch, tasks,
  system = false, ask = false, scratchMax = 4000, since = 0
} = {}) {
  if (system) return String(text || '')

  const minimal = hiveNormalizeContextMode(mode) === 'minimal'
  const sections = [hiveBuildStandingHeader({ member, members, title, mission })]

  if (!minimal) {
    const recent = since ? (timeline || []).filter((m) => (m && m.ts ? m.ts : 0) > since) : timeline
    const rows = recent && recent.length ? recent : timeline
    sections.push(`[room digest]\n${hiveBuildDigest(rows, HIVE_DIGEST_LEN)}`)
  }

  const work = hiveFormatWorkItems(tasks, member)
  if (work) sections.push(work)

  const pad = String(scratch || '').trim()
  if (pad) {
    sections.push(`[team scratchpad — shared working memory, keep it current]\n${hiveClipHead(pad, scratchMax)}`)
  }

  sections.push(
    minimal
      ? hiveBuildHandoffCapsule(member, sender, text, { ask })
      : (sender ? `from @${sender}:\n` : '') + String(text || '')
  )

  return sections.join('\n\n')
}

/**
 * Parse a member's finished output (or a user post) into coordination actions.
 *   [to @name] text   → private relay to that member
 *   [ask @name] text  → relay + flagged as a question
 *   [all] text        → broadcast (timeline + digest)
 *   [@name] text      → private relay to that member
 * Short form: [ask @x: question] uses inner text when nothing follows.
 */
function hiveParseCoordination(content, roster) {
  const result = { relays: [], broadcast: '' }
  const text = (content || '').trim()
  if (!text) return { relays: [], broadcast: text }
  const rosterSet = new Set((roster || []).map(hiveNormalize))
  const TOKEN =
    /\[(?:to\s+@?([a-z0-9._-]+)|ask\s+@?([a-z0-9._-]+)|@([a-z0-9._-]+)|all)([^\]]*?)\]/gi
  const bcast = []
  let last = 0
  let m
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(text)) !== null) {
    const pre = text.slice(last, m.index).trim()
    if (pre) bcast.push(pre)
    const name = (m[1] || m[2] || m[3] || '').toLowerCase()
    const isAsk = !!m[2]
    const isAll = !name || name === 'all' || name === 'everyone' || name === 'room'
    const next = text.indexOf('[', TOKEN.lastIndex)
    let chunk = (next === -1 ? text.slice(TOKEN.lastIndex) : text.slice(TOKEN.lastIndex, next)).trim()
    if (!chunk) {
      const inner = (m[4] || '').trim().replace(/^[:,\s]+/, '')
      if (inner) chunk = inner
    }
    if (isAll) {
      if (chunk) bcast.push(chunk)
    } else if (rosterSet.has(name)) {
      // Non-looping: a relay to the sender itself is dropped.
      result.relays.push({ target: name, text: chunk, ask: isAsk })
    } else {
      if (chunk) bcast.push(chunk)
    }
    last = next === -1 ? text.length : next
  }
  const tail = text.slice(last).trim()
  if (tail) bcast.push(tail)
  result.broadcast = bcast.join(' ').trim()
  return result
}

/** Build the digest string from the timeline (latest DIGEST_LEN entries). */
function hiveBuildDigest(timeline, n = HIVE_DIGEST_LEN) {
  const t = timeline || []
  const rows = t.slice(-n).map((msg) => {
    const who = typeof msg.from === 'string' ? msg.from : (msg.from || {}).profile || '?'
    const tail = msg.to ? ` → @${msg.to}` : ''
    // Turn entries expose a digest-safe body (done → text, live → (working));
    // everything else uses its text directly.
    const body = msg && msg.kind === 'turn' ? hiveTurnDigestBody(msg) : String((msg && msg.text) || '')
    const clipped = body.length > 220 ? body.slice(0, 217) + '…' : body
    return `@${who}${tail}: ${clipped}`
  })
  return rows.length ? rows.join('\n') : '(room is quiet)'
}

/**
 * The room brief seeded into a member session on mint/fresh-context/re-role.
 * `timeline` is passed in for pure/testable construction.
 */
function hiveBuildRoomBrief(member, members, title, isBrowserAgent, timeline, opts = {}) {
  const roster = [...members, { profile: 'you' }]
    .map((m) => '@' + hiveNormalize(m.profile))
    .join(', ')
  const digest = hiveBuildDigest(timeline, HIVE_DIGEST_LEN)
  const mission = String(opts.mission || '').trim()
  const scratch = String(opts.scratch || '').trim()
  return (
    `You are @${hiveNormalize(member.profile)}, a member of the Hermes room "${title}".\n` +
    `Roster (use ONLY these names to address members): ${roster}.\n` +
    `You are working with real teammates, not alone: prefer delegating what someone else owns, and ask for a second pair of eyes before you call something done.\n` +
    (isBrowserAgent
      ? `You are the room's BROWSER AGENT. When live or current information is needed, use browser_navigate / browser_snapshot / browser_click / web_extract to fetch and verify it yourself.\n`
      : '') +
    `\nMISSION (what this room is for):\n${mission || '(none set yet — ask @you for the objective before doing speculative work)'}\n` +
    `\nADDRESSING TEAMMATES (follow exactly):\n` +
    `- Direct a teammate privately:  [to @name] message\n` +
    `- Ask one member a question:    [ask @name] question\n` +
    `- Address the whole room:       [all] message\n` +
    `- No marker = the message is addressed to you; answer it.\n` +
    `- Never invent teammates; use only the roster above.\n` +
    `- Keep untagged prose short. Anything you say without a marker is broadcast to the whole room, so think before you narrate.\n` +
    `\nDIVIDING AND CHECKING WORK (this is how the room validates itself):\n` +
    `- Hand someone a task:          [task @name] what needs doing\n` +
    `- Report your task finished:    [done #id] what you actually did\n` +
    `- Ask for validation:           [review @name #id] what to check\n` +
    `- Give your verdict:            [verdict #id pass] why  /  [verdict #id fail] what is wrong\n` +
    `Rules: never mark your OWN work passed — ask a teammate to review it. If you are asked\n` +
    `for a verdict, actually check the work and be specific; "looks good" is not a review.\n` +
    `A failed verdict routes back to the owner, who fixes it and resubmits with [done #id].\n` +
    `Your open items are listed in every message you receive under "[your open work items]".\n` +
    `\nSHARED SCRATCHPAD (the team's working memory):\n` +
    `A shared markdown doc is included in every message you receive. Every teammate sees the\n` +
    `same copy. Record decisions, findings, and facts the others need — not your narration.\n` +
    `- Append a note:                [scratchpad] the note\n` +
    `- Append under a section:       [scratchpad:Decisions] we are using Postgres\n` +
    `- CORRECT a section (replaces): [scratchpad:Decisions!] we switched to SQLite\n` +
    `If you find something in the scratchpad that is wrong, correct it with the ! form rather\n` +
    `than adding a contradicting line — every teammate reads this on every turn.\n` +
    (scratch ? `\nCURRENT SCRATCHPAD:\n${hiveClipHead(scratch, HIVE_SCRATCH_INJECT_MAX)}\n` : '') +
    `\nROOM DIGEST (latest state):\n${digest}`
  )
}

/** Find bare `@name` roster mentions in a user post (composer shorthand). */
function hiveExtractMentions(text, roster) {
  const rosterSet = new Set((roster || []).map(hiveNormalize))
  const found = []
  const re = /@([a-z0-9._-]+)/g
  let m
  while ((m = re.exec(text || '')) !== null) {
    const name = m[1].toLowerCase()
    if (rosterSet.has(name) && !found.includes(name)) found.push(name)
  }
  return found
}

/**
 * Route a user post: bracket directives win; otherwise bare @mentions target
 * members; otherwise broadcast to everyone.
 */
function hiveRouteUserPost(text, members) {
  const roster = (members || []).map((m) => m.profile)
  const parsed = hiveParseCoordination(text, roster)
  if (parsed.relays.length) return parsed
  const mentions = hiveExtractMentions(text, roster)
  if (mentions.length) {
    const body = (text || '').replace(/@[a-z0-9._-]+/g, '').replace(/\s{2,}/g, ' ').trim()
    return {
      relays: mentions.map((t) => ({ target: t, text: body, ask: false })),
      broadcast: ''
    }
  }
  return parsed
}

/** Mirrors the app's CreateProfileDialog name validation. */
function hiveIsValidProfileName(name) {
  return HIVE_PROFILE_NAME_RE.test((name || '').trim())
}

// Any marker that terminates a free-text block. Used to stop a `[scratchpad]`
// body from swallowing the coordination markers that follow it.
const HIVE_NEXT_MARKER = /\[(?:scratchpad|task|done|review|verdict|to|ask|all|@)[\s\]:]/i

/**
 * Parse scratchpad operations out of a member's output.
 *   [scratchpad] text            → append under "Notes"
 *   [scratchpad:Decisions] text  → append under that section
 *   [scratchpad:Decisions!] text → REPLACE that section
 *
 * The `!` form is the point: an append-only pad means a wrong shared fact can
 * never be corrected, only buried — and it gets re-injected into every agent
 * on every turn forever.
 */
function hiveParseScratchOps(content) {
  const text = String(content || '')
  const hits = []
  const re = /\[scratchpad(?::([^\]]+))?\]/gi
  let m
  while ((m = re.exec(text)) !== null) {
    hits.push({ at: m.index, len: m[0].length, sec: (m[1] || '').trim() })
  }
  const ops = []
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]
    const stop = i + 1 < hits.length ? hits[i + 1].at : text.length
    let body = text.slice(h.at + h.len, stop)
    const cut = body.search(HIVE_NEXT_MARKER)
    if (cut !== -1) body = body.slice(0, cut)
    const replace = h.sec.endsWith('!')
    const section = (replace ? h.sec.slice(0, -1) : h.sec).trim() || 'Notes'
    const trimmed = body.trim()
    if (trimmed) ops.push({ section, body: trimmed, replace })
  }
  return ops
}

/** Back-compat surface: the bodies of every scratchpad op, in order. */
function hiveExtractScratchEntries(content) {
  return hiveParseScratchOps(content).map((op) => op.body)
}

/** Split a scratchpad doc into ordered `## heading` sections. */
function hiveScratchSections(doc) {
  const text = String(doc || '')
  const out = []
  const re = /^##\s+(.+)$/gm
  let m
  let open = null
  while ((m = re.exec(text)) !== null) {
    if (open) out.push({ name: open.name, body: text.slice(open.from, m.index).trim() })
    open = { name: m[1].trim(), from: m.index + m[0].length }
  }
  if (open) out.push({ name: open.name, body: text.slice(open.from).trim() })
  return out
}

function hiveScratchRender(sections) {
  return (sections || [])
    .filter((s) => s && s.body)
    .map((s) => `## ${s.name}\n${s.body}`)
    .join('\n\n')
}

/** Apply one parsed op to the doc. Pure — the caller owns persistence. */
function hiveScratchApply(doc, op, author, stamp) {
  const entry = String((op && op.body) || '').trim()
  if (!entry) return String(doc || '')
  const name = String((op && op.section) || 'Notes').trim() || 'Notes'
  const line = `- ${entry}${author ? `  _(@${hiveNormalize(author)}${stamp ? ' · ' + stamp : ''})_` : ''}`
  const sections = hiveScratchSections(doc)
  const i = sections.findIndex((s) => s.name.toLowerCase() === name.toLowerCase())
  if (i === -1) sections.push({ name, body: line })
  else if (op.replace) sections[i] = { name, body: line }
  else sections[i] = { name, body: sections[i].body ? sections[i].body + '\n' + line : line }
  return hiveScratchRender(sections)
}

// ── work items: the validation spine ───────────────────────────────────────
// A room where members only trade prose cannot check each other's work: there
// is no way to say "here is the thing, confirm it" and no way to know whether
// anyone did. A work item is the smallest structure that makes review real —
// an owner, a reviewer, and a verdict the relay can route on.

/** Short, collision-tolerant work id. Injectable so tests stay deterministic. */
function hiveMakeTaskId() {
  return Math.random().toString(36).slice(2, 6)
}

/**
 * Work-item grammar, parsed from any member (or user) output:
 *   [task @name] description   → create and assign
 *   [done #id] summary         → owner submits the result
 *   [review @name #id] note    → ask a teammate to validate
 *   [verdict #id pass] reason  → reviewer accepts
 *   [verdict #id fail] reason  → reviewer rejects; routes back to the owner
 */
function hiveParseWorkItems(content) {
  const text = String(content || '')
  const out = { tasks: [], dones: [], reviews: [], verdicts: [] }
  const scan = (re, fn) => {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) fn(m)
  }
  scan(/\[task\s+@?([a-z0-9._-]+)\]\s*([^\[\n]*)/gi, (m) =>
    out.tasks.push({ target: m[1].toLowerCase(), title: m[2].trim() }))
  scan(/\[done\s+#?([a-z0-9]+)\]\s*([^\[\n]*)/gi, (m) =>
    out.dones.push({ id: m[1].toLowerCase(), text: m[2].trim() }))
  scan(/\[review\s+@?([a-z0-9._-]+)\s+#?([a-z0-9]+)\]\s*([^\[\n]*)/gi, (m) =>
    out.reviews.push({ target: m[1].toLowerCase(), id: m[2].toLowerCase(), text: m[3].trim() }))
  scan(/\[verdict\s+#?([a-z0-9]+)\s+(pass|fail)\]\s*([^\[\n]*)/gi, (m) =>
    out.verdicts.push({ id: m[1].toLowerCase(), ok: m[2].toLowerCase() === 'pass', text: m[3].trim() }))
  return out
}

/** Strip every coordination marker from text destined for the timeline, so the
 *  room reads as prose and markers are never re-relayed as content. */
function hiveScrubMarkers(content) {
  let text = String(content || '')
  for (const op of hiveParseScratchOps(text)) {
    text = text.replace(op.body, '')
  }
  return text
    .replace(/\[scratchpad(?::[^\]]*)?\]/gi, '')
    // Mirror hiveParseWorkItems' own `[^\[\n]*` argument capture: the text
    // after a work marker IS the task title / submission / verdict reason and
    // is already routed as state. Leaving it behind re-broadcast every task
    // title to the whole room on top of assigning it.
    .replace(/\[(?:task\s+@?[a-z0-9._-]+|done\s+#?[a-z0-9]+|review\s+@?[a-z0-9._-]+\s+#?[a-z0-9]+|verdict\s+#?[a-z0-9]+\s+(?:pass|fail))\][^[\n]*/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Fold a turn's work-item markers into the task list, and emit the deliveries
 * the room owes as a result. Pure: `mkId` is injected so tests are
 * deterministic and the caller owns all persistence.
 */
function hiveApplyWorkItems(tasks, { from, parsed, ts, mkId } = {}) {
  const next = (tasks || []).slice()
  const routes = []
  // Timeline cards for every effect that ACTUALLY applied — the §3.5 mapping's
  // Task/Done/Review rows. Derived from this same pure fold, so a card can
  // never claim something the state machine did not do.
  const cards = []
  const now = ts || 0
  const author = hiveNormalize(from)
  const newId = mkId || hiveMakeTaskId
  const find = (id) => next.findIndex((t) => t && t.id === id)

  for (const t of (parsed && parsed.tasks) || []) {
    const id = newId()
    const owner = hiveNormalize(t.target)
    next.push({ id, title: t.title || '(untitled)', from: author, owner, reviewer: '', status: 'open', artifact: '', ts: now })
    cards.push({ kind: 'task', workId: id, owner, reviewer: '', status: 'open', ts: now, text: `task #${id} → @${owner}: ${t.title || '(untitled)'}` })
    routes.push({
      target: owner,
      kind: 'task',
      text: `[work #${id}] You own this task: ${t.title}\nWhen it is finished reply with: [done #${id}] <what you did>`
    })
  }

  for (const d of (parsed && parsed.dones) || []) {
    const i = find(d.id)
    if (i === -1) continue
    next[i] = { ...next[i], status: 'submitted', artifact: d.text, ts: now }
    cards.push({
      kind: 'done', workId: d.id, owner: hiveNormalizeOpt(next[i].owner), reviewer: hiveNormalizeOpt(next[i].reviewer),
      status: 'submitted', ts: now, artifact: hiveTruncatePayload(d.text, 400),
      text: `#${d.id} submitted by @${author}: ${next[i].title}`
    })
    const reviewer = hiveNormalizeOpt(next[i].reviewer)
    const requester = hiveNormalizeOpt(next[i].from)
    if (reviewer && reviewer !== author) {
      routes.push({
        target: reviewer,
        kind: 'review',
        text: `[work #${d.id}] @${author} submitted "${next[i].title}". Validate it, then reply [verdict #${d.id} pass] or [verdict #${d.id} fail] <reason>.\n\nSubmitted result:\n${d.text}`
      })
    } else if (requester && requester !== author) {
      routes.push({ target: requester, kind: 'report', text: `[work #${d.id}] @${author} finished "${next[i].title}":\n${d.text}` })
    }
  }

  for (const r of (parsed && parsed.reviews) || []) {
    const i = find(r.id)
    if (i === -1) continue
    const reviewer = hiveNormalize(r.target)
    next[i] = { ...next[i], reviewer, ts: now }
    cards.push({
      kind: 'review', workId: r.id, owner: hiveNormalizeOpt(next[i].owner), reviewer,
      status: 'submitted', ts: now, review: 'request',
      text: `#${r.id} review requested from @${reviewer}: ${next[i].title}`
    })
    routes.push({
      target: reviewer,
      kind: 'review',
      text:
        `[work #${r.id}] Please validate "${next[i].title}"${r.text ? ' — ' + r.text : ''}. ` +
        `Reply [verdict #${r.id} pass] or [verdict #${r.id} fail] <reason>.` +
        (next[i].artifact ? `\n\nWork to check:\n${next[i].artifact}` : '')
    })
  }

  for (const v of (parsed && parsed.verdicts) || []) {
    const i = find(v.id)
    if (i === -1) continue
    next[i] = { ...next[i], status: v.ok ? 'passed' : 'failed', ts: now }
    cards.push({
      kind: 'review', workId: v.id, owner: hiveNormalizeOpt(next[i].owner), reviewer: author,
      status: v.ok ? 'passed' : 'failed', ts: now, verdict: v.ok ? 'pass' : 'fail',
      reason: hiveTruncatePayload(v.text, 400),
      text: `#${v.id} verdict ${v.ok ? 'pass' : 'fail'} by @${author}: ${next[i].title}`
    })
    const owner = hiveNormalizeOpt(next[i].owner)
    if (owner && owner !== author) {
      routes.push({
        target: owner,
        kind: 'verdict',
        text: v.ok
          ? `[work #${v.id}] @${author} PASSED your work on "${next[i].title}".${v.text ? ' ' + v.text : ''}`
          : `[work #${v.id}] @${author} FAILED your work on "${next[i].title}". Fix it and resubmit with [done #${v.id}].\nReason: ${v.text || '(none given)'}`
      })
    }
  }

  return { tasks: next.slice(-HIVE_TASK_KEEP), routes, cards }
}

/**
 * THE routing seam. Every delivery the room makes is planned here.
 *
 * Previously each guard lived at a different call site, so each was enforced
 * on a different subset of paths: broadcasts skipped the swarm gate entirely,
 * skipped the echo guard, and were fanned to EVERY member including the sender
 * — so one untagged reply re-entered the room N+1 times and each of those did
 * it again. Concentrating the decision here means a guard added once holds
 * everywhere, and the whole policy is testable without a socket.
 */
function hivePlanDeliveries({
  from, parsed, work, members, swarm, hops = 0,
  maxHops = HIVE_MAX_HOPS, maxFanout = HIVE_MAX_FANOUT
} = {}) {
  const author = hiveNormalize(from)
  const roster = members || []
  const fromUser = author === 'you'
  const deliveries = []
  const dropped = []

  const push = (target, text, kind, ask) => {
    const key = hiveNormalizeOpt(target)
    const body = String(text || '').trim()
    if (!key || !body) return
    if (key === author) return dropped.push({ target: key, reason: 'self' })
    const m = roster.find((x) => hiveNormalize(x.profile) === key)
    if (!m) return dropped.push({ target: key, reason: 'not-in-room' })
    if (m.muted && !fromUser) return dropped.push({ target: key, reason: 'muted' })
    if (!fromUser && !swarm) return dropped.push({ target: key, reason: 'swarm-off' })
    if (!fromUser && hops >= maxHops) return dropped.push({ target: key, reason: 'hop-budget' })
    deliveries.push({ target: key, text: body, kind, ask: ask === true, hops: hops + 1 })
  }

  for (const r of (parsed && parsed.relays) || []) push(r.target, r.text, 'relay', r.ask)
  for (const w of (work && work.routes) || []) push(w.target, w.text, w.kind, false)

  const broadcast = String((parsed && parsed.broadcast) || '').trim()
  if (broadcast) for (const m of roster) push(m.profile, broadcast, 'broadcast', false)

  if (deliveries.length > maxFanout) {
    for (const d of deliveries.slice(maxFanout)) dropped.push({ target: d.target, reason: 'fanout-cap' })
    return { deliveries: deliveries.slice(0, maxFanout), dropped }
  }
  return { deliveries, dropped }
}

/** Pure strict-match predicate: does a member own this session? NEVER match on
 *  profile — the main desktop chat shares a profile with hive members, so a
 *  profile fallback leaks main-chat events into the room (regression-tested). */
function hiveIsMemberSession(m, sessionId) {
  return !!(sessionId && m && m.sessionId === sessionId)
}

// ── curated working-model manifest ─────────────────────────────────────────
// ONLY providers/models verified live end-to-end (2026-08). The hive model
// selector shows exactly these — nothing that isn't confirmed good. Add a new
// entry ONLY after a real `hermes chat` round-trip proves it works.
// Entries: { provider, model, base_url?, label }. `base_url` only for custom
// providers (custom:qwen-token-plan). Pure/data — safe to slice for tests.
const HIVE_WORKING_MODELS = Object.freeze([
  { provider: 'custom:qwen-token-plan', model: 'qwen3.8-max-preview', base_url: 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic', label: 'Qwen 3.8 Max (token plan)' },
  { provider: 'cline-pass', model: 'cline-pass/qwen3.7-max', label: 'Qwen 3.7 Max (cline)' },
  { provider: 'command-code', model: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { provider: 'command-code', model: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { provider: 'command-code', model: 'moonshotai/Kimi-K3', label: 'Kimi K3' },
  { provider: 'command-code', model: 'Qwen/Qwen3.7-Max', label: 'Qwen 3.7 Max (cmd)' },
  { provider: 'command-code', model: 'zai-org/GLM-5.2', label: 'GLM-5.2' },
  { provider: 'command-code', model: 'MiniMaxAI/MiniMax-M3', label: 'MiniMax M3' },
  { provider: 'nous', model: 'z-ai/glm-5.2', label: 'GLM-5.2 (Nous)' },
  { provider: 'openrouter', model: 'poolside/laguna-s-2.1:free', label: 'Laguna (free)' }
])

/** Find a manifest entry by its {provider,model} composite key. Returns the
 *  frozen entry or undefined. Key = provider + '::' + model (normalized). */
function hiveModelKey(entry) {
  if (!entry) return ''
  return hiveNormalize(String(entry.provider || '')) + '::' + String(entry.model || '')
}

/** Resolve which manifest entry a member is currently on, by matching the
 *  member's stored provider/model (or a lsat-set override). Best-effort. */
function hiveResolveModelEntry(provider, model) {
  if (!provider && !model) return undefined
  const key = hiveNormalize(String(provider || '')) + '::' + (model || '')
  return (HIVE_WORKING_MODELS || []).find((e) => hiveModelKey(e) === key)
}

/** Build the /api/model/set payload for a manifest entry + profile. Pure. */
function hiveModelAssignmentBody(entry, profile) {
  if (!entry) return null
  const body = {
    provider: entry.provider,
    model: entry.model,
    scope: 'main'
  }
  if (entry.base_url) body.base_url = entry.base_url
  if (profile) body.profile = profile
  return body
}

/** Flatten a `model.options` provider list into manifest-shaped entries.
 *  `providers` is the raw ModelOptionsResponse.providers array (may be null).
 *  Pure/data. Each provider with a non-empty `models` array yields one entry
 *  per model: { provider: slug, model, label: model }. Providers with an
 *  `api_url` (user-defined OpenAI-compatible endpoints) also carry
 *  `base_url` so switching keeps the endpoint. */
function hiveCatalogToEntries(providers) {
  if (!Array.isArray(providers)) return []
  const out = []
  for (const p of providers) {
    if (!p || typeof p.slug !== 'string' || !p.slug) continue
    const models = Array.isArray(p.models) ? p.models : []
    if (!models.length) continue
    for (const model of models) {
      const entry = { provider: p.slug, model, label: model }
      if (p.api_url) entry.base_url = p.api_url
      out.push(entry)
    }
  }
  return out
}

/** Merge the live catalog with the curated manifest, de-duplicated by
 *  provider::model key. Curated entries win (they carry the human label);
 *  catalog-only models are appended so EVERY available provider/model shows.
 *  Pure/data. */
function hiveMergeCatalogEntries(catalog, curated) {
  const out = []
  const seen = new Set()
  const push = (e) => {
    if (!e || !e.provider || !e.model) return
    const k = hiveModelKey(e)
    if (seen.has(k)) return
    seen.add(k)
    out.push(e)
  }
  for (const c of curated || []) push(c)
  for (const c of catalog || []) push(c)
  return out
}

/** Group entries by provider (preserving first-appearance order) for the
 *  grouped model picker. Returns [{ provider, label, entries }]. Pure/data. */
function hiveGroupEntriesByProvider(entries) {
  const groups = []
  const idx = {}
  for (const e of entries || []) {
    if (!e || !e.provider) continue
    if (!(e.provider in idx)) {
      idx[e.provider] = groups.length
      groups.push({ provider: e.provider, label: e.provider, entries: [] })
    }
    groups[idx[e.provider]].entries.push(e)
  }
  return groups
}

/** Pick a short display label for an entry in the grouped picker. Prefers the
 *  curated human label, else the bare model id. */
function hiveEntryDisplayLabel(e) {
  return (e && e.label) || (e && e.model) || ''
}

/** Best-effort human label for a member's current model from the LIVE catalog
 *  (used when the member's stored model isn't in the curated manifest). */
function hiveResolveModelLabel(provider, model, catalog) {
  const key = hiveNormalize(String(provider || '')) + '::' + (model || '')
  const curated = (HIVE_WORKING_MODELS || []).find((e) => hiveModelKey(e) === key)
  if (curated) return curated.label
  const flat = hiveCatalogToEntries(catalog)
  const found = flat.find((e) => hiveModelKey(e) === key)
  return found ? found.label : ''
}

/** Group a flat timeline into per-agent sections, preserving intra-agent order.
 *  Returns [{ profile, messages: [...] }] in first-appearance order. System
 *  messages (from==='system') stay at the top in their own 'system' group.
 *  Pure — used by the grouped/expandable timeline view. */
function hiveGroupTimeline(timeline) {
  const groups = []
  const idx = {}
  for (const m of (timeline || [])) {
    const who = (typeof m.from === 'string' ? m.from : (m.from && m.from.profile)) || 'system'
    const key = who === 'system' ? 'system' : hiveNormalize(who)
    if (!(key in idx)) {
      idx[key] = groups.length
      groups.push({ profile: key, messages: [] })
    }
    groups[idx[key]].messages.push(m)
  }
  // system group first, then others in appearance order
  return groups
}

/** Collapse/expand a single agent section. Returns the next expanded map. */
function hiveToggleAgentExpanded(map, profile, force) {
  const key = hiveNormalize(String(profile || ''))
  const cur = !!(map && map[key])
  const next = { ...(map || {}) }
  next[key] = typeof force === 'boolean' ? force : !cur
  return next
}

// ── turn-entry reducer (pure) ──────────────────────────────────────────────
// A 'turn' timeline entry is the live per-member activity spine: thinking →
// tools → streaming → done/error. Patches are pure; the RENDER layer never
// mutates. These drive BOTH the inline spine and the grouped-header preview
// (single source — no stream-buffer mirrors).

const HIVE_TURN_OPEN = ['queued', 'thinking', 'tool', 'streaming']

/** New turn entry at `ts` (ms). Kind 'turn'. */
function hiveTurnInit(profile, ts) {
  const now = ts || Date.now()
  return {
    id: 't' + Math.random().toString(36).slice(2, 9),
    ts: now, from: hiveNormalize(profile), kind: 'turn',
    phase: 'thinking', text: '', tool: '', tools: [],
    startedAt: now, doneAt: 0, error: '', to: null, queuedSince: 0
  }
}

/** Immutable merge of a patch into a turn entry. */
function hiveTurnPatch(turn, patch) {
  return { ...(turn || {}), ...(patch || {}) }
}

/** Record an open tool (dedup by name while running). Returns next turn. */
function hiveTurnAddTool(turn, name, ts) {
  const tools = (turn.tools || []).slice()
  const open = tools.findIndex((t) => t.name === name && t.status === 'run')
  if (open !== -1) return { ...turn, tool: name, phase: 'tool' }
  tools.push({ name: String(name || 'tool'), ts: ts || Date.now(), dur: 0, status: 'run' })
  return { ...turn, tool: String(name || 'tool'), phase: 'tool', tools }
}

/** Close a recorded tool with duration. Returns next turn (back to streaming). */
function hiveTurnFinishTool(turn, name, ts, status) {
  const fin = ts || Date.now()
  const st = status || 'ok'
  const tools = (turn.tools || []).map((t) =>
    t.name === name ? { ...t, status: st, dur: Math.max(0, fin - (t.ts || fin)) } : t)
  return { ...turn, tool: '', phase: 'streaming', tools }
}

/** Append streamed text. Queued stays queued until the turn actually starts. */
function hiveTurnAppendText(turn, text) {
  const wasQueued = turn.phase === 'queued'
  return { ...turn, text: (turn.text || '') + (text || ''), phase: wasQueued ? 'queued' : 'streaming' }
}

/** Mark the turn queued (relay behind a busy member) at `ts`. */
function hiveTurnQueued(turn, ts) {
  return { ...turn, phase: 'queued', queuedSince: ts || Date.now() }
}

/** Fold the turn into its final message. `finalText` defaults to streamed text. */
function hiveTurnFold(turn, finalText, doneAt) {
  return {
    ...turn, phase: 'done', tool: '',
    text: finalText != null ? String(finalText) : String(turn.text || ''),
    doneAt: doneAt || Date.now()
  }
}

/** Mark the turn failed with an error message. */
function hiveTurnError(turn, error, ts) {
  return {
    ...turn, phase: 'error', tool: '',
    error: String(error || 'turn failed'),
    doneAt: ts || Date.now()
  }
}

/** Digest-safe body for a turn entry: done → text, error → (error), else working. */
function hiveTurnDigestBody(turn) {
  if (!turn) return ''
  if (turn.phase === 'done') return String(turn.text || '').slice(0, 220)
  if (turn.phase === 'error') return `(error) ${String(turn.error || 'failed')}`.slice(0, 220)
  return `(working${turn.tool ? ' · ' + turn.tool : ''})`
}

/** Latest OPEN turn for a profile (queued/thinking/tool/streaming). */
function hiveLastOpenTurn(timeline, profile) {
  const norm = hiveNormalize(String(profile || ''))
  const tl = timeline || []
  for (let i = tl.length - 1; i >= 0; i--) {
    const m = tl[i]
    if (m && m.kind === 'turn' && hiveNormalize(m.from) === norm && HIVE_TURN_OPEN.includes(m.phase)) return m
  }
  return null
}

/** Short preview for collapsed headers: live text / tool / error / working. */
function hiveActivityPreview(turn) {
  if (!turn) return ''
  if (turn.phase === 'error') return String(turn.error || 'failed')
  const t = String(turn.text || '').trim().replace(/\s+/g, ' ')
  if (t) return t.slice(0, 90)
  if (turn.phase === 'tool' && turn.tool) return `using ${turn.tool}…`
  return 'working…'
}

/** Count entries for a profile newer than `seenTs` (attention chips). */
function hiveGroupUnseen(timeline, profile, seenTs) {
  const norm = hiveNormalize(String(profile || ''))
  const since = Number(seenTs) || 0
  return (timeline || []).filter((m) => hiveNormalize(m.from) === norm && (m.ts || 0) > since).length
}

// ── Phase 1 (Team Studio) pure helpers ─────────────────────────────────────
// Status, labels, card mapping, delta batching and payload clipping. All pure,
// so test.cjs covers them with no DOM and no SDK. The shell layer keeps the
// timers and the atoms — nothing here reads host state.

const HIVE_TIMELINE_MEM = 500 // in-memory timeline entries kept
const HIVE_TIMELINE_KEEP = 120 // entries persisted into hive.v2
const HIVE_PAYLOAD_MAX = 2048 // chars of tool/artifact payload kept
const HIVE_DELTA_WINDOW_MS = 50 // message.delta coalescing window

/** Clip stored/render payloads (tool output, artifacts). Head-first, like the
 *  scratchpad: the first bytes of a command result are the informative ones. */
function hiveTruncatePayload(text, max = HIVE_PAYLOAD_MAX) {
  const s = String(text == null ? '' : text)
  const limit = Number.isFinite(max) && max > 0 ? max : HIVE_PAYLOAD_MAX
  return s.length > limit ? s.slice(0, limit) + '…' : s
}

/** Cap a timeline list keeping the TAIL (newest), never mutating the input. */
function hiveCapTimeline(list, max = HIVE_TIMELINE_MEM) {
  const l = Array.isArray(list) ? list : []
  const limit = Number.isFinite(max) && max > 0 ? max : HIVE_TIMELINE_MEM
  return l.length > limit ? l.slice(-limit) : l.slice()
}

/** The LAST timeline entry belonging to a profile. Derived-status input. */
function hiveLastProfileEntry(timeline, profile) {
  const norm = hiveNormalize(String(profile || ''))
  const tl = timeline || []
  for (let i = tl.length - 1; i >= 0; i--) {
    const m = tl[i]
    if (!m) continue
    const who = typeof m.from === 'string' ? m.from : (m.from && m.from.profile) || ''
    if (hiveNormalize(who) === norm) return m
  }
  return null
}

/**
 * Member status is DERIVED, never stored (§2.4): computed from the member's
 * own session plus its timeline records, so it cannot drift from the stream.
 *   offline → no live session
 *   error   → the member's latest entry is a failed turn (clears the moment a
 *             new turn starts, because that turn becomes the latest entry)
 *   working → its open turn has a tool call still running
 *   thinking→ its open turn's latest signal was a thinking/reasoning delta
 *             (a message.delta moves the phase to 'streaming', so this is
 *             "thinking since the last message.delta" by construction)
 *   busy    → any other open turn (queued / streaming)
 *   idle    → no open turn
 */
function hiveMemberStatus(member, timeline) {
  if (!member || !member.sessionId) return 'offline'
  const last = hiveLastProfileEntry(timeline, member.profile)
  if (last && last.kind === 'turn' && last.phase === 'error') return 'error'
  const open = hiveLastOpenTurn(timeline, member.profile)
  if (!open) return 'idle'
  if ((open.tools || []).some((t) => t && t.status === 'run')) return 'working'
  if (open.phase === 'thinking') return 'thinking'
  return 'busy'
}

// Status → SDK StatusDot tone / label / glyph. Tones are the SDK's own
// (good | muted | warn | bad); no color literal is chosen here.
const HIVE_STATUS_TONE = Object.freeze({
  offline: 'muted', error: 'bad', working: 'good', thinking: 'muted', busy: 'good', idle: 'muted'
})
const HIVE_STATUS_LABEL = Object.freeze({
  offline: 'offline', error: 'errored', working: 'using a tool',
  thinking: 'thinking…', busy: 'answering…', idle: 'idle'
})
const HIVE_STATUS_GLYPH = Object.freeze({
  error: '✕', working: '⚙', thinking: '···', busy: '…', idle: '', offline: ''
})

function hiveStatusTone(status) {
  return HIVE_STATUS_TONE[status] || 'muted'
}

function hiveStatusLabel(status) {
  return HIVE_STATUS_LABEL[status] || 'idle'
}

function hiveStatusGlyph(status) {
  return HIVE_STATUS_GLYPH[status] !== undefined ? HIVE_STATUS_GLYPH[status] : ''
}

/** True while a derived status means the member is mid-turn. */
function hiveStatusBusy(status) {
  return status === 'busy' || status === 'thinking' || status === 'working'
}

/** Work-item UI status (§4.1) — the REAL state machine statuses. */
function hiveTaskStatusLabel(task) {
  const s = String((task && task.status) || '')
  if (s === 'submitted') return 'IN REVIEW'
  if (s === 'passed') return 'PASSED'
  if (s === 'failed') return 'FAILED'
  return 'OPEN'
}

/** Theme var for a task status (var(--ui-*) only, no literals). */
function hiveTaskStatusTone(task) {
  const s = hiveTaskStatusLabel(task)
  if (s === 'FAILED') return 'var(--ui-red)'
  if (s === 'PASSED') return 'var(--ui-green)'
  if (s === 'IN REVIEW') return 'var(--ui-yellow)'
  return 'var(--ui-text-tertiary)'
}

/** Ordered task rows: open work first, then review, then settled. */
function hiveSortTasks(tasks) {
  const rank = { open: 0, submitted: 1, failed: 2, passed: 3 }
  return (tasks || []).slice().sort((a, b) => {
    const ra = rank[(a && a.status) || 'open'] ?? 4
    const rb = rank[(b && b.status) || 'open'] ?? 4
    if (ra !== rb) return ra - rb
    return ((b && b.ts) || 0) - ((a && a.ts) || 0)
  })
}

/** Card type for a timeline entry — the §3.5 mapping as DATA, so the render
 *  layer is a dumb switch and this table is the single place it lives. */
function hiveCardKind(entry) {
  if (!entry) return 'system'
  if (entry.kind === 'turn') {
    if (entry.phase === 'error') return 'error'
    if ((entry.tools || []).length) return 'tool'
    return 'agent'
  }
  if (entry.kind === 'user') return 'user'
  if (entry.kind === 'system') return 'system'
  if (entry.kind === 'relay') return entry.to ? 'directed' : 'agent'
  if (entry.kind === 'task' || entry.kind === 'done' || entry.kind === 'review') return entry.kind
  return 'agent'
}

/** Timeline entries → render-ready cards, preserving order. */
function hiveTimelineToCards(entries) {
  return (entries || []).filter(Boolean).map((e) => ({ id: e.id, kind: hiveCardKind(e), entry: e }))
}

// Activity tab (§4.2): structured cards only — no prose bubbles.
const HIVE_ACTIVITY_KINDS = Object.freeze(['tool', 'task', 'done', 'review', 'error', 'system'])

function hiveActivityCards(entries) {
  return hiveTimelineToCards(entries).filter((c) => HIVE_ACTIVITY_KINDS.includes(c.kind))
}

/** Client-side timeline text filter (TimelineHeader search — no backend). */
function hiveFilterCards(cards, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return cards || []
  return (cards || []).filter((c) => {
    const e = c.entry || {}
    const who = typeof e.from === 'string' ? e.from : (e.from && e.from.profile) || ''
    const hay = `${who} ${e.to || ''} ${e.text || ''} ${e.error || ''} ${e.title || ''} ${e.workId || ''}`
    return hay.toLowerCase().includes(q)
  })
}

/**
 * Delta coalescer, reducer form (§8.2). The shell layer owns the ~50ms timer;
 * this owns the accumulation semantics so the buffer is testable without one.
 * Empty/absent chunks are a no-op on `count` — a delta event with no text must
 * not count as a batch.
 */
function hiveBatchDeltas(pending, chunk) {
  const p = pending && typeof pending === 'object' ? pending : { text: '', count: 0 }
  const text = String(p.text == null ? '' : p.text)
  const count = Number(p.count) || 0
  const t = String(chunk == null ? '' : chunk)
  if (!t) return { text, count }
  return { text: text + t, count: count + 1 }
}

/** A card's one-line drawer title for the turn spine (tool rows). */
function hiveCardTitle(entry) {
  if (!entry) return ''
  if (entry.kind === 'turn') return hiveActivityPreview(entry)
  return hiveTruncatePayload(String(entry.text || '').replace(/\s+/g, ' ').trim(), 120)
}

/** Team-panel order: leader/browser members first, then alphabetical. Pure.
 *  ATLAS-on-top comes from the roster the user builds (leader flag), never
 *  from hardcoding a name into the plugin — the room stays team-agnostic. */
function hiveOrderMembers(members) {
  return (members || []).slice().sort((a, b) => {
    const ra = a && (a.leader === true || a.browser === true) ? 0 : 1
    const rb = b && (b.leader === true || b.browser === true) ? 0 : 1
    if (ra !== rb) return ra - rb
    return String((a && a.profile) || '').localeCompare(String((b && b.profile) || ''))
  })
}

// --CORE-END--

// ── accents ─────────────────────────────────────────────────────────────────

/** Deterministic, always-visible accent for any member (`default` included). */
function hiveAccent(profile) {
  const raw = profileColor(profile) || HIVE_DEFAULT_ACCENT
  return { color: raw, soft: profileColorSoft(raw) }
}

/** HH:MM from an epoch-ms timestamp. */
function hiveTime(ts) {
  const d = new Date(ts || Date.now())
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── light markdown renderer (safe — no raw HTML) ────────────────────────────

function hiveInline(text) {
  const nodes = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m
  re.lastIndex = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) nodes.push(jsx('strong', { key: nodes.length, children: tok.slice(2, -2) }))
    else nodes.push(jsx('code', { key: nodes.length, className: 'rounded bg-muted px-1 py-px', style: { ...HIVE_T.wrap, fontSize: '0.9em' }, children: tok.slice(1, -1) }))
    last = m.index + tok.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length ? nodes : text
}

/** Minimal line/block renderer: fenced code blocks, otherwise paragraphs. */
function hiveRenderText(text) {
  const blocks = String(text || '').split(/```(\w*)\n?/)
  const out = []
  for (let i = 0; i < blocks.length; i++) {
    if (i % 2 === 0) {
      if (!blocks[i].trim()) continue
      // paragraphs split on double newline
      const paras = blocks[i].split(/\n{2,}/)
        for (const p of paras) {
          if (!p.trim()) continue
          out.push(jsx('div', { key: out.length, className: 'block min-w-0 whitespace-pre-wrap break-words', style: HIVE_T.wrap, children: hiveInline(p) }))
        }
    } else {
      out.push(
        jsx('pre', {
          key: out.length,
          className: 'mt-1 mb-1 overflow-x-auto rounded-md bg-muted p-2 leading-snug',
          style: { fontSize: '0.85em' },
          children: blocks[i].replace(/\n$/, '')
        })
      )
    }
  }
  return out.length ? out : jsx('span', { children: text })
}

// ── status + router ─────────────────────────────────────────────────────────

function hiveStatusForEvent(e) {
  const t = e && e.type
  if (t === 'assistant.delta' || t === 'message.delta' || t === 'thinking.delta' || t === 'reasoning.delta') return 'streaming'
  if (t === 'message.complete' || t === 'assistant.completed') return 'done'
  if (t === 'done' || t === 'error') return 'idle'
  return null
}

/** Strict session routing: a member is identified by its OWN session id ONLY.
 *  Never match by profile name — the main desktop chat runs on the same
 *  profile as a hive member, so a profile fallback leaks main-chat stream
 *  events into the hive (confirmed bug). Events without a session_id belong to
 *  the focused chat (per app gateway-events.ts), so a null-session member never
 *  attributes stray events. */
function hiveMemberBySession(sessionId) {
  if (!sessionId) return undefined
  const list = $hiveMembers.get()
  return list.find((m) => hiveIsMemberSession(m, sessionId))
}

// How deep into an agent→agent chain each live session currently sits. Read
// when that session finishes a turn, so a relay it triggers inherits the depth
// and the hop budget can actually bite.
const _hiveHops = new Map()

async function hiveDeliverTo(member, text, opts = {}) {
  if (!member || !member.sessionId) {
    host.notify({
      kind: 'warning',
      message: `Hive: @${member ? member.profile : '?'} has no live session — choose "Fresh context".`
    })
    return
  }
  const payload = hiveBuildContextEnvelope({
    mode: member.contextMode,
    member,
    members: $hiveMembers.get(),
    title: $hiveTitle.get(),
    mission: $hiveMission.get(),
    sender: opts.from,
    text,
    timeline: $hiveTimeline.get(),
    scratch: $hiveScratch.get(),
    tasks: $hiveTasks.get(),
    system: opts.system === true,
    ask: opts.ask === true,
    scratchMax: HIVE_SCRATCH_INJECT_MAX
  })
  _hiveHops.set(member.sessionId, opts.system === true ? 0 : Number(opts.hops) || 0)
  const busy = member.status === 'streaming' || member.status === 'thinking' || member.status === 'tool'
  const queued = opts.queued === true || busy
  if (queued && !opts.system) hiveMarkStatus(member.sessionId, 'queued') // honest chip: queued behind current turn
  try {
    await host.request('prompt.submit', {
      session_id: member.sessionId,
      text: payload,
      ...(queued && !opts.system ? { queued: true } : {})
    })
  } catch (err) {
    host.notifyError(err, `Hive: deliver to @${member.profile} failed`)
  }
}

/** Execute a plan from hivePlanDeliveries: timeline first (so the room reads in
 *  causal order), then the injections. Suppressions are surfaced, never silent. */
async function hiveRunPlan(plan, from) {
  for (const d of plan.deliveries) {
    const target = $hiveMembers.get().find((m) => hiveNormalize(m.profile) === d.target)
    if (!target) continue
    if (d.kind !== 'broadcast') {
      hiveAppendTimeline({ from, kind: 'relay', text: d.text, to: d.target })
    }
    await hiveDeliverTo(target, d.text, { from, ask: d.ask, hops: d.hops })
  }
  const held = plan.dropped.filter((d) => d.reason === 'hop-budget' || d.reason === 'fanout-cap')
  if (held.length) {
    const why = held[0].reason === 'hop-budget' ? 'relay chain reached its depth limit' : 'fan-out limit reached'
    hiveAppendTimeline({ from: 'system', kind: 'system', text: `⛔ held ${held.length} relay(s) from @${from} — ${why}`, to: null })
  }
}

function hiveAppendTimeline(msg) {
  const t = $hiveTimeline.get()
  $hiveTimeline.set(hiveCapTimeline([...t, { id: Math.random().toString(36).slice(2, 9), ts: Date.now(), ...msg }]))
}

/** Append the work-item cards a fold produced (task/done/review). The cards
 *  come from hiveApplyWorkItems, so only effects that really applied land. */
function hiveEmitWorkCards(cards, from) {
  for (const c of cards || []) {
    if (!c || !c.kind) continue
    const { kind, workId, owner, reviewer, status, verdict, reason, artifact, review, text } = c
    hiveAppendTimeline({ from, kind, text, to: null, workId, owner, reviewer, status, verdict, reason, artifact, review })
  }
}

/** Apply parsed scratchpad ops to the shared doc. Section-addressed, so a
 *  teammate can CORRECT a wrong shared fact instead of burying it under a
 *  contradicting line that every member then reads forever. */
function hiveApplyScratchOps(profile, ops) {
  const list = (ops || []).filter((op) => op && op.body)
  if (!list.length) return
  const stamp = hiveTime(Date.now())
  let doc = $hiveScratch.get()
  for (const op of list) doc = hiveScratchApply(doc, op, profile, stamp)
  // Clip from the TAIL: the mission and founding decisions sit at the head of
  // the doc, so trimming the front (the old behavior) destroyed exactly the
  // context worth keeping.
  if (doc.length > HIVE_SCRATCH_STORE_MAX) {
    doc = doc.slice(0, HIVE_SCRATCH_STORE_MAX) + '\n\n…(newer entries trimmed — scratchpad is full)'
  }
  $hiveScratch.set(doc)
  const where = [...new Set(list.map((op) => op.section))].join(', ')
  const verb = list.some((op) => op.replace) ? 'corrected' : 'updated'
  hiveAppendTimeline({ from: 'system', kind: 'system', text: `📝 @${profile} ${verb} the scratchpad (${where})`, to: null })
  hivePersist()
}

/** Process a member's finished turn: fold the spine into its final message,
 *  then relay (swarm-gated) per coordination grammar. The open turn entry IS
 *  the agent's message — no duplicate 'agent' entry is appended (SPEC B4). */
async function hiveHandleAssistantDone(e, content) {
  const member = hiveMemberBySession(e.session_id, e.profile)
  if (!member) return

  const now = Date.now()
  const last = _hiveProcessed.get(e.session_id) || 0
  if (now - last < 1500) return
  _hiveProcessed.set(e.session_id, now)

  hiveMarkStatus(e.session_id, 'done')

  if (_hiveSeeded.get(hiveNormalize(member.profile))) {
    _hiveSeeded.delete(hiveNormalize(member.profile))
    hiveFoldTurn(member, '')
    return
  }

  const finalText = (content || '').trim()
  if (!finalText) {
    // Nothing streamed or delivered — close the spine honestly (no ghost turn).
    hiveFoldTurn(member, '')
    return
  }

  const from = hiveNormalize(member.profile)

  // Shared memory first, so a teammate reached below already sees the update.
  hiveApplyScratchOps(from, hiveParseScratchOps(finalText))

  // Work items next: they turn "check my work" from a hope into routed state.
  const work = hiveApplyWorkItems($hiveTasks.get(), {
    from,
    parsed: hiveParseWorkItems(finalText),
    ts: Date.now()
  })
  if (work.tasks !== $hiveTasks.get()) $hiveTasks.set(work.tasks)

  // Everything the markers claimed is now state — strip them so the timeline
  // reads as prose and no marker is ever re-relayed as content.
  const scrubbed = hiveScrubMarkers(finalText)
  const parsed = hiveParseCoordination(scrubbed, $hiveMembers.get().map((m) => m.profile))

  // Floor: the turn entry becomes the final message.
  // (Empty-scrub turns fold to an empty done row — rare, honest, no fabrication.)
  hiveFoldTurn(member, scrubbed || parsed.broadcast || '')

  // The work-item effects become timeline cards (Task/Done/Review) — real
  // state changes only, appended after the reply they came from.
  hiveEmitWorkCards(work.cards, from)

  const plan = hivePlanDeliveries({
    from,
    parsed,
    work,
    members: $hiveMembers.get(),
    swarm: $hiveSwarm.get(),
    hops: _hiveHops.get(e.session_id) || 0
  })
  await hiveRunPlan(plan, from)
  hivePersist()
}

async function hiveHandleFallbackCompleted(e) {
  const member = hiveMemberBySession(e.session_id, e.profile)
  if (!member) return
  // The fallback closes the turn too, so the buffered tail must land first.
  hiveFlushDelta(e.session_id)
  const open = hiveLastOpenTurn($hiveTimeline.get(), member.profile)
  const content = String((e.content || '').trim() || (open ? open.text : '') || '')
  if (!content && !open) return
  await hiveHandleAssistantDone(e, content)
}

function hiveMarkStatus(sessionId, status) {
  if (!sessionId) return
  const list = $hiveMembers.get()
  const idx = list.findIndex((m) => m.sessionId === sessionId)
  if (idx !== -1 && list[idx].status !== status) {
    const next = list.slice()
    next[idx] = { ...next[idx], status }
    $hiveMembers.set(next)
  }
}

// ── turn store (atom wrappers over the pure reducer) ───────────────────────
// The timeline IS the activity store: each member's open turn is a 'turn'
// entry, patched in place. No parallel stream buffers / live mirrors.

/** Open a new turn entry for a member (message.start). Auto-expands group. */
function hiveOpenTurn(member) {
  if (!member) return
  const key = hiveNormalize(member.profile)
  const tl = $hiveTimeline.get()
  const entry = hiveTurnInit(key, Date.now())
  $hiveTimeline.set(hiveCapTimeline([...tl, entry]))
  // Auto-expand on new activity so the working agent is never hidden (SPEC B6).
  $hiveAgentExpanded.set(hiveToggleAgentExpanded($hiveAgentExpanded.get(), key, true))
  hiveMarkStatus(member.sessionId, 'streaming')
  hivePersist()
}

/** Find index of a member's latest OPEN turn entry (-1 if none). */
function hiveOpenTurnIndex(member) {
  if (!member) return -1
  const key = hiveNormalize(member.profile)
  const tl = $hiveTimeline.get()
  for (let i = tl.length - 1; i >= 0; i--) {
    const m = tl[i]
    if (m && m.kind === 'turn' && hiveNormalize(m.from) === key && HIVE_TURN_OPEN.includes(m.phase)) return i
  }
  return -1
}

/** Immutably replace the entry at index. */
function hiveReplaceTurn(i, next) {
  const tl = $hiveTimeline.get()
  const copy = tl.slice()
  copy[i] = next
  $hiveTimeline.set(copy)
}

/** Patch the member's open turn (no-op if none). */
function hivePatchOpenTurn(member, patch) {
  const i = hiveOpenTurnIndex(member)
  if (i === -1) return
  hiveReplaceTurn(i, hiveTurnPatch($hiveTimeline.get()[i], patch))
}

/** Append streamed text to the member's open turn (opens one if missing). */
function hiveAppendTurnText(member, text) {
  if (!member || !text) return
  const i = hiveOpenTurnIndex(member)
  if (i === -1) {
    hiveOpenTurn(member)
    hiveAppendTurnText(member, text)
    return
  }
  hiveReplaceTurn(i, hiveTurnAppendText($hiveTimeline.get()[i], text))
}

/** Record a tool start on the member's open turn; chip → tooling. */
function hiveTurnToolStart(member, name) {
  const i = hiveOpenTurnIndex(member)
  if (i === -1) return
  hiveReplaceTurn(i, hiveTurnAddTool($hiveTimeline.get()[i], name, Date.now()))
  hiveMarkStatus(member.sessionId, 'tool')
}

/** Record a tool finish on the member's open turn; chip → streaming. */
function hiveTurnToolDone(member, name, ok) {
  const i = hiveOpenTurnIndex(member)
  if (i === -1) return
  hiveReplaceTurn(i, hiveTurnFinishTool($hiveTimeline.get()[i], name, Date.now(), ok ? 'ok' : 'err'))
  hiveMarkStatus(member.sessionId, 'streaming')
}

/** Fold the member's open turn into its final message (SPEC B4 dedupe). */
function hiveFoldTurn(member, finalText) {
  const i = hiveOpenTurnIndex(member)
  const tl = $hiveTimeline.get()
  if (i === -1) {
    // Fallback (e.g. completed without any delta): materialize a done turn.
    const entry = hiveTurnFold(hiveTurnInit(hiveNormalize(member.profile), Date.now()), finalText || '', Date.now())
    $hiveTimeline.set(hiveCapTimeline([...tl, entry]))
    return entry
  }
  const folded = hiveTurnFold(tl[i], finalText, Date.now())
  hiveReplaceTurn(i, folded)
  hivePersist()
  return folded
}

/** Mark the member's open turn failed (SPEC B3 honest status). */
function hiveTurnFail(member, error) {
  if (!member) return
  // Fold any buffered delta into the turn BEFORE it closes. Without this the
  // still-pending window would flush onto a turn that no longer exists (the
  // guard in hiveFlushDelta then drops it) and the tail would be lost.
  if (member.sessionId) hiveFlushDelta(member.sessionId)
  const i = hiveOpenTurnIndex(member)
  const tl = $hiveTimeline.get()
  if (i === -1) {
    const entry = hiveTurnError(hiveTurnInit(hiveNormalize(member.profile), Date.now()), error, Date.now())
    $hiveTimeline.set(hiveCapTimeline([...tl, entry]))
    return
  }
  hiveReplaceTurn(i, hiveTurnError(tl[i], error, Date.now()))
  hiveMarkStatus(member.sessionId, 'error')
  hivePersist()
}

// ── profiles + sessions ─────────────────────────────────────────────────────

async function hiveFetchProfiles() {
  try {
    const api = window && window.hermesDesktop && window.hermesDesktop.api
    if (!api) throw new Error('desktop bridge unavailable')
    const res = await api({ path: '/api/profiles' })
    return (res && res.profiles) || []
  } catch {
    return []
  }
}

async function hiveCreateProfile(name, cloneFrom, soul) {
  const api = window && window.hermesDesktop && window.hermesDesktop.api
  if (!api) throw new Error('Desktop bridge unavailable — create the profile in Settings → Profiles instead.')
  const trimmed = (name || '').trim()
  if (!hiveIsValidProfileName(trimmed)) {
    throw new Error('Profile names: lowercase letters, digits, - and _ (start with a letter/digit).')
  }
  const res = await api({ path: '/api/profiles', method: 'POST', body: { name: trimmed, clone_from: cloneFrom } })
  if (soul && soul.trim()) {
    await api({ path: `/api/profiles/${encodeURIComponent(trimmed)}/soul`, method: 'PUT', body: { content: soul.trim() } })
  }
  return res
}

/** Standard scratchpad pointer to drop into a profile's SOUL/persona. */
const HIVE_SOUL_SCRATCH_HINT =
  'SHARED TEAM SCRATCHPAD: the Hive room injects a shared markdown scratchpad into every message you receive. Use it to record progress, decisions, and shared facts. To append for the team, start a line with [scratchpad].'

async function hiveGetSoul(profile) {
  const api = window && window.hermesDesktop && window.hermesDesktop.api
  if (!api) return { content: '', exists: false }
  try {
    const res = await api({ path: `/api/profiles/${encodeURIComponent(hiveNormalize(profile))}/soul` })
    return res || { content: '', exists: false }
  } catch {
    return { content: '', exists: false }
  }
}

async function hiveUpdateSoul(profile, content) {
  const api = window && window.hermesDesktop && window.hermesDesktop.api
  if (!api) throw new Error('Desktop bridge unavailable')
  return await api({ path: `/api/profiles/${encodeURIComponent(hiveNormalize(profile))}/soul`, method: 'PUT', body: { content } })
}

/** The current room brief for a member, with mission + scratchpad folded in. */
function hiveBriefFor(member, members) {
  return hiveBuildRoomBrief(
    member,
    members || $hiveMembers.get(),
    $hiveTitle.get(),
    !!member.browser,
    $hiveTimeline.get(),
    { mission: $hiveMission.get(), scratch: $hiveScratch.get() }
  )
}

/**
 * Tell the existing crew that the roster moved.
 *
 * The brief instructs every member to address ONLY the names it was given, and
 * it used to be delivered once at join time — so a member added later was
 * invisible to everyone already in the room, and by its own instructions
 * nobody was allowed to talk to them. A roster is shared state; it has to be
 * broadcast when it changes.
 */
async function hiveAnnounceRoster(note, exclude) {
  const members = $hiveMembers.get()
  const skip = hiveNormalize(exclude || '')
  const roster = [...members, { profile: 'you' }].map((m) => '@' + hiveNormalize(m.profile)).join(', ')
  const text =
    `[roster update] ${note}\n` +
    `The room is now: ${roster}.\n` +
    `Address ONLY these names. You may hand work to any of them with [task @name] and ask any of them to check yours with [review @name #id].`
  for (const m of members) {
    if (hiveNormalize(m.profile) === skip || !m.sessionId) continue
    _hiveSeeded.set(hiveNormalize(m.profile), true)
    await hiveDeliverTo(m, text, { system: true })
  }
}

/** Mint a live session on a profile and seed it with the room brief. */
async function hiveMintMember(profile, options = {}) {
  const list = $hiveMembers.get()
  if (list.length >= HIVE_MAX_MEMBERS) {
    host.notify({ kind: 'warning', message: `Hive: room is full (${HIVE_MAX_MEMBERS} members).` })
    return null
  }
  const key = hiveNormalize(profile)
  const existing = list.find((m) => hiveNormalize(m.profile) === key)
  if (existing) return existing

  const params = { cols: 96, source: 'desktop', profile: key, ...($hiveCwd.get() ? { cwd: $hiveCwd.get() } : {}) }
  try {
    const created = await host.request('session.create', params)
    const contextMode = hiveNormalizeContextMode(options.contextMode)
    const member = { profile: key, sessionId: created.session_id, storedId: created.stored_session_id || null, status: 'idle', browser: false, muted: false, contextMode }
    $hiveMembers.set([...$hiveMembers.get(), member])
    if (!$hiveMembers.get().some((m) => m.browser)) {
      $hiveMembers.set($hiveMembers.get().map((m) => (hiveNormalize(m.profile) === key ? { ...m, browser: true } : m)))
    }
    const current = $hiveMembers.get().find((m) => hiveNormalize(m.profile) === key)
    _hiveSeeded.set(key, true)
    await hiveDeliverTo(current, hiveBriefFor(current), { system: true })
    hiveAppendTimeline({ from: 'system', kind: 'system', text: `@${key} joined the room`, to: null })
    // Everyone already here learns the new teammate exists — otherwise the
    // brief's "never invent teammates" rule makes them permanently unreachable.
    await hiveAnnounceRoster(`@${key} joined the room.`, key)
    hivePersist()
    return current
  } catch (err) {
    host.notifyError(err, `Hive: couldn't start @${key}`)
    return null
  }
}

async function hiveRemoveMember(profile) {
  const key = hiveNormalize(profile)
  const remaining = $hiveMembers.get().filter((m) => hiveNormalize(m.profile) !== key)
  // Auto-reassign browser role if the holder was removed and nobody holds it.
  if (remaining.length && !remaining.some((m) => m.browser)) {
    remaining[0] = { ...remaining[0], browser: true }
  }
  $hiveMembers.set(remaining)
  hiveAppendTimeline({ from: 'system', kind: 'system', text: `@${key} left the room`, to: null })
  // Departures matter as much as arrivals: a member left addressing a name
  // that no longer resolves will silently get its handoffs dropped.
  const orphaned = $hiveTasks.get().filter(
    (t) => t.status !== 'passed' && (hiveNormalizeOpt(t.owner) === key || hiveNormalizeOpt(t.reviewer) === key)
  )
  await hiveAnnounceRoster(
    `@${key} left the room.` +
      (orphaned.length ? ` ${orphaned.length} open work item(s) they held need a new owner: ${orphaned.map((t) => '#' + t.id).join(', ')}.` : ''),
    key
  )
  hivePersist()
}

async function hiveSetContextMode(profile, mode) {
  const key = hiveNormalize(profile)
  const contextMode = hiveNormalizeContextMode(mode)
  const list = $hiveMembers.get()
  $hiveMembers.set(list.map((m) => hiveNormalize(m.profile) === key ? { ...m, contextMode } : m))
  hivePersist()
  host.notify({ kind: 'success', message: `@${key} context: ${contextMode}. Applies to the next delivery.` })
}

async function hiveFreshContext(profile) {
  const key = hiveNormalize(profile)
  const prior = $hiveMembers.get().find((m) => hiveNormalize(m.profile) === key)
  const contextMode = hiveNormalizeContextMode(prior && prior.contextMode)
  $hiveMembers.set($hiveMembers.get().filter((m) => hiveNormalize(m.profile) !== key))
  await hiveMintMember(key, { contextMode })
}

/** Set a member's model to a curated WORKING model entry, then mint a fresh
 *  session on that profile so it picks up the new model. Uses the official
 *  desktop `/api/model/set` endpoint (profile-scoped) — the same path the
 *  built-in model picker uses. Returns the API result or throws. */
async function hiveSetMemberModel(profile, entry) {
  const api = window && window.hermesDesktop && window.hermesDesktop.api
  if (!api) throw new Error('Desktop bridge unavailable')
  if (!entry) throw new Error('No model entry')
  const body = hiveModelAssignmentBody(entry, hiveNormalize(profile))
  const res = await api({ path: '/api/model/set', method: 'POST', body })
  // Persist the choice on the member for next-boot hydrate + UI checkmark.
  const list = $hiveMembers.get()
  const key = hiveNormalize(profile)
  $hiveMembers.set(list.map((m) =>
    hiveNormalize(m.profile) === key
      ? { ...m, model: entry.model, provider: entry.provider, modelLabel: entry.label }
      : m
  ))
  hivePersist()
  // Fresh session so the new model is actually in effect.
  await hiveFreshContext(key)
  return res
}

/** Fetch the live model catalog from the gateway's `model.options` RPC —
 *  the SAME source the built-in picker uses (explicit_only: true → only
 *  configured providers). Cached for HIVE_MODEL_CATALOG_TTL. Resolves to the
 *  providers array, or [] on any failure (callers fall back to the curated
 *  manifest). */
async function hiveFetchModelCatalog() {
  const now = Date.now()
  if ($hiveModelCatalog.get() !== null && now - _hiveModelCatalogAt < HIVE_MODEL_CATALOG_TTL) {
    return $hiveModelCatalog.get()
  }
  try {
    const res = await host.request('model.options', { explicit_only: true })
    const providers = (res && res.providers) || []
    $hiveModelCatalog.set(providers)
    _hiveModelCatalogAt = now
    return providers
  } catch (err) {
    console.warn('[buzz-hive] model.options failed, falling back to curated manifest', err)
    return []
  }
}

/** Fresh catalog-backed entry list for the picker: curated manifest first
 *  (human labels), then every model from the live catalog. Uses the cached
 *  catalog when present so the dropdown renders instantly on reopen. */
function hivePickerEntries() {
  return hiveMergeCatalogEntries(hiveCatalogToEntries($hiveModelCatalog.get()), HIVE_WORKING_MODELS)
}

async function hiveSetBrowser(profile, on) {
  const list = $hiveMembers.get()
  const key = hiveNormalize(profile)
  const next = list.map((m) =>
    hiveNormalize(m.profile) === key ? { ...m, browser: !!on } : on ? { ...m, browser: false } : m
  )
  $hiveMembers.set(next)
  const holder = next.find((m) => hiveNormalize(m.profile) === key && m.browser)
  const demoted = list.find((m) => m.browser && hiveNormalize(m.profile) !== key)
  if (holder) {
    _hiveSeeded.set(hiveNormalize(holder.profile), true)
    await hiveDeliverTo(holder, hiveBriefFor(holder, next), { system: true })
  }
  if (demoted && !demoted.browser) {
    const fresh = next.find((m) => hiveNormalize(m.profile) === hiveNormalize(demoted.profile))
    if (fresh) {
      _hiveSeeded.set(hiveNormalize(fresh.profile), true)
      await hiveDeliverTo(fresh, hiveBriefFor(fresh, next), { system: true })
    }
  }
  hivePersist()
}

async function hiveStopMember(profile) {
  const m = $hiveMembers.get().find((x) => hiveNormalize(x.profile) === hiveNormalize(profile))
  if (!m || !m.sessionId) return
  try {
    await host.request('session.interrupt', { session_id: m.sessionId })
    // Fold the buffered tail into the turn being closed (Stop is an A4 user
    // action): flush first, then close, so nothing is orphaned mid-window.
    hiveFlushDelta(m.sessionId)
    hiveMarkStatus(m.sessionId, 'idle')
    // F6: a turn an `error` already closed while we awaited the interrupt must
    // stay closed. Folding unconditionally lands in hiveFoldTurn's no-open-turn
    // fallback and mints an empty `done` turn beside the real error row. Stop
    // closes a turn; it never invents one.
    if (hiveOpenTurnIndex(m) !== -1) hiveFoldTurn(m, undefined) // close the spine with whatever streamed so far
    hiveAppendTimeline({ from: 'system', kind: 'system', text: `@${m.profile} stopped`, to: null })
  } catch (err) {
    host.notifyError(err, `Hive: couldn't stop @${m.profile}`)
  }
}

/** Reset the whole crew: interrupt all, clear timeline, mint fresh default. */
async function hiveResetRoom() {
  console.log('[buzz-hive] reset room: start')
  for (const m of $hiveMembers.get()) {
    if (m.sessionId) {
      await host.request('session.interrupt', { session_id: m.sessionId }).catch(() => {})
    }
  }
  _hiveProcessed.clear()
  _hiveSeeded.clear()
  _hiveHops.clear()
  hiveClearDeltas()
  $hiveTimeline.set([])
  $hiveMembers.set([])
  $hiveTasks.set([])
  $hiveGroupSeen.set({})
  $hiveSwarm.set(true)
  $hiveView.set('timeline')
  if (hiveOpenPage) hiveOpenPage()
  hivePersist()
  console.log('[buzz-hive] reset room: cleared, minting fresh @default')
  await hiveMintMember('default')
  hiveAppendTimeline({ from: 'system', kind: 'system', text: 'room reset — new crew', to: null })
  hivePersist()
  console.log('[buzz-hive] reset room: done')
  host.notify({ kind: 'success', message: 'Hive: room reset.' })
}

// ── persistence ─────────────────────────────────────────────────────────────

function hivePersist() {
  if (!hiveStorageRef) return
  hiveStorageRef.set(HIVE_STORAGE_KEY, {
    title: $hiveTitle.get(),
    cwd: $hiveCwd.get(),
    swarm: $hiveSwarm.get(),
    scratch: $hiveScratch.get(),
    mission: $hiveMission.get(),
    tasks: $hiveTasks.get(),
    timelineMode: $hiveTimelineMode.get(),
    agentExpanded: $hiveAgentExpanded.get(),
    // Phase 1 workspace prefs — new keys on the SAME blob (backward compatible).
    rightTab: $tsRightTab.get(),
    dockOpen: $tsDockOpen.get(),
    agentDetailExpanded: $tsAgentExpanded.get(),
    activeProject: $tsActiveProject.get(),
    teams: $tsTeams.get(),
    members: $hiveMembers.get().map((m) => ({
      profile: m.profile,
      storedId: m.storedId,
      browser: m.browser,
      muted: m.muted,
      leader: m.leader === true,
      contextMode: hiveNormalizeContextMode(m.contextMode),
      model: m.model || null,
      provider: m.provider || null,
      modelLabel: m.modelLabel || null
    })),
    timeline: hiveCapTimeline($hiveTimeline.get(), HIVE_TIMELINE_KEEP)
  })
}

async function hiveBootHydrate() {
  if (!hiveStorageRef) return
  const savedV2 = hiveStorageRef.get(HIVE_STORAGE_KEY, null)
  const saved = savedV2 || hiveStorageRef.get(HIVE_LEGACY_STORAGE_KEY, null)
  if (!saved || !Array.isArray(saved.members) || saved.members.length === 0) {
    await hiveMintMember('default')
    hivePersist()
    return
  }
  $hiveTitle.set(saved.title || 'hive')
  $hiveCwd.set(saved.cwd || '')
  $hiveSwarm.set(typeof saved.swarm === 'boolean' ? saved.swarm : true)
  if (typeof saved.timelineMode === 'string') $hiveTimelineMode.set(saved.timelineMode)
  if (saved.agentExpanded && typeof saved.agentExpanded === 'object') $hiveAgentExpanded.set(saved.agentExpanded)
  if (typeof saved.scratch === 'string') $hiveScratch.set(saved.scratch)
  if (typeof saved.mission === 'string') $hiveMission.set(saved.mission)
  if (Array.isArray(saved.tasks)) $hiveTasks.set(saved.tasks.slice(-HIVE_TASK_KEEP))
  if (Array.isArray(saved.timeline)) $hiveTimeline.set(hiveCapTimeline(saved.timeline, HIVE_TIMELINE_KEEP))
  // Phase 1 workspace prefs — absent keys keep their defaults (no migration).
  if (typeof saved.rightTab === 'string' && TS_RIGHT_TABS.some((t) => t.id === saved.rightTab)) $tsRightTab.set(saved.rightTab)
  if (typeof saved.dockOpen === 'boolean') $tsDockOpen.set(saved.dockOpen)
  if (saved.agentDetailExpanded && typeof saved.agentDetailExpanded === 'object') $tsAgentExpanded.set(saved.agentDetailExpanded)
  if (saved.activeProject && typeof saved.activeProject === 'object' && saved.activeProject.id) $tsActiveProject.set(saved.activeProject)
  if (Array.isArray(saved.teams)) $tsTeams.set(saved.teams.filter((t) => t && typeof t.name === 'string'))
  const hydrated = []
  for (const m of saved.members) {
    const live = {
      profile: m.profile,
      storedId: m.storedId || null,
      browser: !!m.browser,
      muted: !!m.muted,
      leader: m.leader === true,
      contextMode: hiveNormalizeContextMode(m.contextMode),
      status: 'idle',
      sessionId: null,
      model: m.model || null,
      provider: m.provider || null,
      modelLabel: m.modelLabel || null
    }
    if (live.storedId) {
      try {
        const info = await host.request('session.info', { session_id: live.storedId })
        if (info && info.session_id) live.sessionId = info.session_id
      } catch {
        live.sessionId = null
      }
    }
    hydrated.push(live)
  }
  $hiveMembers.set(hydrated)
  // Write the normalized v2 shape even when the source was legacy v1.
  hivePersist()
}

// ── UI ──────────────────────────────────────────────────────────────────────

// ── Phase 1 workspace shell: styles, scope, timers ──────────────────────────
// One injected <style>, every selector prefixed `.ts-` and nested under
// `.ts-workspace`, colors only from the app's own theme vars (the canonical
// `--ui-*` set enumerated from the SDK's styles.css — no invented var names, no
// hex/rgb literals). Sizes are px/rem/fr: no JS resize math, no observers.

const HIVE_TS_STYLE_ID = 'buzz-hive-team-studio'
const HIVE_TS_CSS = `
.ts-workspace{--ts-team-w:240px;--ts-right-w:320px;position:relative;display:grid;grid-template-columns:var(--ts-team-w) minmax(420px,1fr) var(--ts-right-w);grid-template-rows:44px minmax(0,1fr) auto;height:100%;min-height:0;min-width:0;overflow:hidden;background:var(--ui-surface-background);color:var(--ui-text-primary)}
.ts-workspace *{box-sizing:border-box}
.ts-toolbar{grid-column:1/-1;grid-row:1;display:flex;align-items:center;gap:.375rem;min-width:0;padding:0 .5rem;border-bottom:1px solid var(--ui-stroke-secondary);overflow:hidden}
.ts-col{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.ts-col-team{grid-column:1;grid-row:2;border-right:1px solid var(--ui-stroke-secondary);background:var(--ui-bg-secondary)}
.ts-col-center{grid-column:2;grid-row:2}
.ts-col-right{grid-column:3;grid-row:2;border-left:1px solid var(--ui-stroke-secondary);background:var(--ui-bg-secondary)}
.ts-dock{grid-column:1/-1;grid-row:3;display:flex;align-items:center;gap:.375rem;min-height:32px;padding:.25rem .5rem;border-top:1px solid var(--ui-stroke-secondary);background:var(--ui-bg-secondary)}
.ts-strip{display:flex;align-items:center;gap:.375rem;min-height:28px;padding:.25rem .5rem;border-bottom:1px solid var(--ui-stroke-secondary)}
.ts-scroll{flex:1 1 auto;min-height:0}
.ts-row{display:flex;align-items:flex-start;gap:.5rem;padding:.375rem .5rem;border-left:2px solid transparent;cursor:pointer;transition:background 120ms ease}
.ts-row:hover{background:var(--ui-row-hover-background)}
.ts-row[data-selected="true"]{background:var(--ui-row-active-background)}
.ts-avatar{display:inline-flex;width:22px;height:22px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:4px;font-size:.6875rem;font-weight:600;line-height:1}
.ts-card{border:1px solid var(--ui-stroke-secondary);border-radius:6px;background:var(--ui-bg-card);padding:.375rem .5rem}
.ts-linkcard{display:inline-flex;align-items:center;padding:.125rem .375rem;border:1px solid var(--ui-stroke-secondary);border-radius:6px;background:var(--ui-bg-card);color:var(--ui-text-secondary);cursor:pointer;transition:background 120ms ease,color 120ms ease}
.ts-linkcard:hover{background:var(--ui-row-hover-background);color:var(--ui-text-primary)}
.ts-entrygroup{position:relative}
.ts-entrygroup .ts-copy{position:absolute;top:2px;right:2px;opacity:0;transition:opacity 120ms ease}
.ts-entrygroup:hover .ts-copy{opacity:1}
.ts-sheet{display:none;position:absolute;top:44px;bottom:0;z-index:30;width:min(340px,80vw);overflow:auto;background:var(--ui-bg-elevated);border:1px solid var(--ui-stroke-secondary)}
.ts-sheet[data-side="team"]{left:0}
.ts-sheet[data-side="right"]{right:0}
.ts-rail{display:none}
.ts-railbutton{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:4px;color:var(--ui-text-secondary);cursor:pointer}
.ts-railbutton:hover{background:var(--ui-control-hover-background);color:var(--ui-text-primary)}
.ts-railbutton[data-active="true"]{background:var(--ui-control-active-background);color:var(--ui-text-primary)}
.ts-narrow-only{display:none}
@media (max-width:1100px){
.ts-workspace{grid-template-columns:var(--ts-team-w) minmax(0,1fr) 48px}
.ts-workspace > .ts-col-right > .ts-right-body{display:none}
.ts-rail{display:flex;flex-direction:column;align-items:center;gap:.25rem;padding-top:.5rem}
.ts-narrow-only{display:inline-flex}
.ts-sheet[data-open="true"]{display:block}
}
@media (max-width:860px){
.ts-workspace{grid-template-columns:56px minmax(0,1fr) 48px}
.ts-workspace > .ts-col-team .ts-team-body{display:none}
}
@media (max-width:600px){
.ts-workspace{grid-template-columns:minmax(0,1fr)}
.ts-workspace > .ts-col-team,.ts-workspace > .ts-col-right{display:none}
.ts-col-center{grid-column:1}
.ts-narrow-only{display:inline-flex}
.ts-sheet[data-open="true"]{display:block}
}`

function hiveInjectStyles() {
  if (hiveStyleEl || typeof document === 'undefined') return
  const existing = document.getElementById(HIVE_TS_STYLE_ID)
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing)
  const el = document.createElement('style')
  el.id = HIVE_TS_STYLE_ID
  el.textContent = HIVE_TS_CSS
  document.head.appendChild(el)
  hiveStyleEl = el
}

function hiveRemoveStyles() {
  if (hiveStyleEl && hiveStyleEl.parentNode) hiveStyleEl.parentNode.removeChild(hiveStyleEl)
  hiveStyleEl = null
  if (typeof document === 'undefined') return
  const stray = document.getElementById(HIVE_TS_STYLE_ID)
  if (stray && stray.parentNode) stray.parentNode.removeChild(stray)
}

/** Run `fn` after `ms`, through the plugin-scoped timer when the host offers
 *  one, so nothing survives unload. Returns a canceller. */
function hiveAfter(ms, fn) {
  if (hiveCtxRef && typeof hiveCtxRef.setTimeout === 'function') return hiveCtxRef.setTimeout(fn, ms)
  const t = setTimeout(fn, ms)
  return () => clearTimeout(t)
}

/** Reveal a NATIVE pane by id. `host.navigate` is a ROUTE door and cannot do
 *  this; `host.revealPane` is the SDK's pane door (feature-detected). */
function hiveRevealPane(paneId) {
  if (host && typeof host.revealPane === 'function') {
    try { host.revealPane(paneId); return true } catch (err) { /* fall through */ }
  }
  host.notify({ kind: 'warning', message: `Hive: this desktop build has no pane-reveal door — open the ${paneId} pane from the tab strip.` })
  return false
}

/** Run a built-in VIEW app action (the same handler its keybind uses). */
function hiveRunAppAction(id) {
  if (hiveCtxRef && typeof hiveCtxRef.runAction === 'function') {
    const res = hiveCtxRef.runAction(id)
    if (res && res.ok === false) host.notify({ kind: 'warning', message: `Hive: ${res.error || 'that action is unavailable in this build.'}` })
    return res
  }
  host.notify({ kind: 'warning', message: 'Hive: this desktop build cannot run app actions.' })
  return { ok: false, error: 'unsupported' }
}

async function hiveCopyText(text) {
  const s = String(text == null ? '' : text)
  if (!s.trim()) return false
  try {
    if (hiveCtxRef && hiveCtxRef.os && typeof hiveCtxRef.os.writeClipboard === 'function') {
      return await hiveCtxRef.os.writeClipboard(s)
    }
  } catch { /* fall through to the renderer clipboard */ }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(s)
      return true
    }
  } catch { /* nothing else to try */ }
  return false
}

// ── delta coalescing (the one new timer) ────────────────────────────────────
// message.delta is high-frequency; batches land in the open bubble at most
// every HIVE_DELTA_WINDOW_MS. ONE buffered flush per session, cancelled on
// fold, reset and unload. The accumulation rules live in the pure reducer.

function hiveFlushDelta(sessionId) {
  const cur = _hiveDelta.get(sessionId)
  if (!cur) return
  _hiveDelta.delete(sessionId)
  if (cur.dispose) { try { cur.dispose() } catch { /* already fired */ } }
  if (!cur.text) return
  const member = hiveMemberBySession(sessionId)
  if (!member) return
  if (hiveOpenTurnIndex(member) === -1) return // the turn already ended: drop stale text
  hiveAppendTurnText(member, cur.text)
  hiveMarkStatus(sessionId, 'streaming')
}

function hiveQueueDelta(member, chunk) {
  if (!member || !member.sessionId) return
  const sid = member.sessionId
  const cur = _hiveDelta.get(sid) || { text: '', count: 0, dispose: null }
  const batched = hiveBatchDeltas(cur, chunk)
  cur.text = batched.text
  cur.count = batched.count
  if (!cur.dispose) cur.dispose = hiveAfter(HIVE_DELTA_WINDOW_MS, () => hiveFlushDelta(sid))
  _hiveDelta.set(sid, cur)
}

function hiveClearDeltas() {
  for (const sid of [..._hiveDelta.keys()]) {
    const cur = _hiveDelta.get(sid)
    if (cur && cur.dispose) { try { cur.dispose() } catch { /* noop */ } }
    _hiveDelta.delete(sid)
  }
}

/** Low-profile per-member model selector. Lists the LIVE model catalog
 *  (all configured providers/models, grouped by provider) PLUS the curated
 *  working manifest — curated entries first (human labels), then every
 *  catalog model. Checkmark on the member's current model. Picking one sets
 *  it profile-wide via /api/model/set + fresh-contexts. */
function HiveModelSubmenu({ m }) {
  const currentKey = m && m.model && m.provider ? 'm-' + hiveModelKey({ provider: m.provider, model: m.model }) : ''
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [catalogState, setCatalogState] = useState('loading') // 'loading' | 'ready' | 'error'
  useEffect(() => {
    let alive = true
    hiveFetchModelCatalog()
      .then(() => { if (alive) setCatalogState('ready') })
      .catch(() => { if (alive) setCatalogState('error') })
    return () => { alive = false }
  }, [])
  const pick = (key) => {
    const entry = hivePickerEntries().find((e) => 'm-' + hiveModelKey(e) === key)
    if (!entry) return
    setBusy(true); setErr('')
    void hiveSetMemberModel(m.profile, entry)
      .then(() => { setBusy(false); host.notify({ kind: 'success', message: `@${m.profile} → ${hiveEntryDisplayLabel(entry)}. Model set + fresh session.` }) })
      .catch((e) => { setBusy(false); setErr((e && e.message) || 'Set failed.') })
  }
  const entries = hivePickerEntries()
  const groups = hiveGroupEntriesByProvider(entries)
  return jsx('div', { className: 'px-1 py-1', 'data-hive-model': true, children: jsxs('div', { className: 'flex flex-col gap-1', children: [
    jsxs('div', { className: 'flex items-center gap-2 px-2', children: [
      jsx('span', { className: 'shrink-0 text-muted-foreground', style: HIVE_T.xs, children: 'Model' }),
      jsx(Select, {
        value: currentKey, disabled: busy,
        onValueChange: (v) => pick(v),
        children: [
          jsx(SelectTrigger, { className: 'h-6 w-full text-xs', children: jsx(SelectValue, { placeholder: m.modelLabel || 'Pick model' }) }),
          jsx(SelectContent, {
            className: 'max-h-72',
            children: [
              catalogState === 'loading' && entries.length === 0 && jsx('div', { className: 'px-2 py-1.5 text-muted-foreground', style: HIVE_T.xs, children: 'Loading available models…' }),
              catalogState === 'error' && entries.length === 0 && jsx('div', { className: 'px-2 py-1.5 text-muted-foreground', style: HIVE_T.xs, children: 'Could not load model list — showing curated models.' }),
              groups.map((g) => jsxs('div', { key: g.provider, children: [
                jsx('div', { className: 'px-2 pt-2 pb-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground', children: g.label }),
                g.entries.map((e) => jsx(SelectItem, { key: 'm-' + hiveModelKey(e), value: 'm-' + hiveModelKey(e), className: 'font-mono text-xs', children: hiveEntryDisplayLabel(e) }))
              ] }))
            ]
          })
        ]
      })
    ] }),
    err && jsx('div', { className: 'px-2 text-destructive', style: HIVE_T.xs, children: err }),
    jsx('div', { className: 'px-2 text-muted-foreground', style: HIVE_T.xs, children: 'All configured providers & models are listed.' })
  ] }) })
}

function HiveContextModeControl({ m }) {
  const mode = hiveNormalizeContextMode(m && m.contextMode)
  return jsx('div', { className: 'px-1 py-1', 'data-hive-context-mode': true, children: jsxs('div', { className: 'flex flex-col gap-1', children: [
    jsxs('div', { className: 'flex items-center justify-between gap-2 px-2', children: [
      jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Context' }),
      jsx('span', { className: 'font-medium', style: HIVE_T.xs, children: mode === 'minimal' ? 'Minimal' : 'Standard' })
    ] }),
    jsx(SegmentedControl, {
      options: [
        { id: 'standard', label: 'Standard' },
        { id: 'minimal', label: 'Minimal' }
      ],
      value: mode,
      onChange: (next) => { void hiveSetContextMode(m.profile, next) }
    }),
    jsx('div', { className: 'px-2 text-muted-foreground', style: HIVE_T.xs, children: mode === 'minimal' ? 'Direct handoff only; no automatic digest or scratchpad.' : 'Room digest + shared scratchpad on direct deliveries.' })
  ] }) })
}

async function hiveToggleMute(profile) {
  const key = hiveNormalize(profile)
  $hiveMembers.set($hiveMembers.get().map((m) => (hiveNormalize(m.profile) === key ? { ...m, muted: !m.muted } : m)))
  hivePersist()
}

function HiveMemberTone({ m }) {
  const from = (m && m.from) || ''
  const to = (m && m.to) || null
  const text = (m && m.text) || ''
  const ts = (m && m.ts) || Date.now()
  const kind = (m && m.kind) || 'agent'
  const isYou = from === 'you'
  const isSystem = from === 'system'
  const isRelay = kind === 'relay' && !!to
  const accent = isYou || isSystem ? hiveAccent('you') : hiveAccent(from)
  const label = isSystem ? 'hive' : isRelay ? `@${from} → @${to}` : `@${from}`
  return jsx('div', {
    className: 'group flex gap-2 rounded-md py-1 pl-1.5',
    style: isSystem ? undefined : { borderLeft: `2px solid ${accent.color}`, background: isYou && !isRelay ? undefined : accent.soft },
    children: isSystem
      ? jsx('div', { className: 'italic min-w-0 leading-snug text-muted-foreground', style: { ...HIVE_T.sm, ...HIVE_T.wrap }, children: text })
      : jsxs('div', { className: 'flex min-w-0 flex-col gap-0.5', children: [
          jsxs('div', { className: 'flex items-center gap-2 uppercase tracking-wide', style: HIVE_T.xs, children: [
            jsx('span', { style: { color: accent.color }, className: 'font-semibold', children: label }),
            isRelay && jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: '⤷ relay' }),
            jsx('time', { className: 'text-muted-foreground', style: { fontSize: 11, lineHeight: '14px' }, children: hiveTime(ts) })
          ] }),
          jsx('div', { className: 'min-w-0 break-words text-sm leading-relaxed text-foreground', style: HIVE_T.wrap, children: hiveRenderText(text) })
        ] })
  })
}

/** Seconds → compact duration ("4s", "2m 12s"). */
function hiveFmtDur(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000))
  if (s < 60) return s + 's'
  return Math.floor(s / 60) + 'm ' + (s % 60) + 's'
}

/** Per-turn activity spine: thinking → tools → streaming → done/error/queued.
 *  Renders INLINE where the turn started (SPEC B2/B3). Tools keep a
 *  collapsible trailer after completion. */
function HiveTurnRow({ turn }) {
  const members = useValue($hiveMembers)
  const [toolsOpen, setToolsOpen] = useState(false)
  const accent = hiveAccent(turn.from)
  const tools = turn.tools || []
  const running = tools.filter((t) => t.status === 'run')
  const now = Date.now()
  const dur = (turn.doneAt || now) - turn.startedAt
  const busy = turn.phase === 'queued' || turn.phase === 'thinking' || turn.phase === 'tool' || turn.phase === 'streaming'
  const member = members.find((mm) => hiveNormalize(mm.profile) === hiveNormalize(turn.from))
  const retry = () => {
    if (!member) return
    const body = String(turn.text || '').trim() || 'Retry the last request.'
    void hiveDeliverTo(member, body, { from: 'you' })
  }
  const stop = () => { if (member) void hiveStopMember(member.profile) }

  return jsxs('div', {
    'data-hive-turn': turn.phase,
    className: cn('flex flex-col gap-1 rounded-md py-1 pl-1.5'),
    style: { borderLeft: `2px solid ${accent.color}`, background: accent.soft },
    children: [
      // header
      jsxs('div', { className: 'flex items-center gap-2', style: HIVE_T.xs, children: [
        jsx('span', { style: { color: accent.color }, className: 'font-semibold uppercase tracking-wide', children: '@' + turn.from }),
        turn.phase === 'queued' && jsx('span', { className: 'text-muted-foreground', children: '⏳ queued behind current turn' }),
        turn.phase === 'thinking' && jsx('span', { className: 'animate-pulse text-muted-foreground', children: 'thinking…' }),
        turn.phase === 'tool' && jsx('span', { className: 'animate-pulse text-muted-foreground', children: `⚙ ${turn.tool || 'tool'}` }),
        turn.phase === 'streaming' && jsx('span', { className: 'animate-pulse text-muted-foreground', children: 'answering…' }),
        turn.phase === 'error' && jsx('span', { style: { color: 'var(--ui-red)' }, className: 'font-semibold', children: '✕ error' }),
        turn.phase === 'done' && jsx('span', { className: 'text-muted-foreground', children: '✓ done' }),
        jsx('time', { className: 'text-muted-foreground', style: { fontSize: 11, lineHeight: '14px' }, children: hiveTime(turn.ts) }),
        busy && jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: hiveFmtDur(dur) })
      ] }),
      // running tools
      ...running.map((t) =>
        jsx('div', { key: 'run-' + t.name, className: 'flex items-center gap-1.5 text-muted-foreground', style: HIVE_T.sm, children: [
          jsx('span', { className: 'animate-pulse', children: '⚙' }),
          jsx('span', { className: 'truncate', children: t.name }),
          jsx('span', { style: HIVE_T.xs, children: hiveFmtDur(now - t.ts) })
        ] })
      ),
      // streaming text
      (turn.phase === 'streaming' || turn.phase === 'queued') && turn.text && jsx('div', {
        className: 'min-w-0 break-words whitespace-pre-wrap text-sm leading-relaxed text-foreground',
        style: HIVE_T.wrap,
        children: turn.text.length > 600 ? turn.text.slice(-600) : turn.text
      }),
      // fielded text (folded done turn)
      turn.phase === 'done' && turn.text && jsx('div', { className: 'min-w-0 break-words text-sm leading-relaxed text-foreground', style: HIVE_T.wrap, children: hiveRenderText(turn.text) }),
      // error card
      turn.phase === 'error' && jsx('div', {
        className: 'rounded-md border p-2 text-xs',
        style: { borderColor: 'var(--ui-red)', background: 'color-mix(in srgb, var(--ui-red) 8%, transparent)' },
        children: jsxs('div', { className: 'flex flex-col gap-1.5', children: [
          jsx('div', { className: 'min-w-0 break-words text-destructive', style: HIVE_T.wrap, children: turn.error || 'turn failed' }),
          jsxs('div', { className: 'flex gap-1.5', children: [
            jsx(Button, { size: 'sm', variant: 'outline', onClick: retry, children: 'Retry' }),
            jsx(Button, { size: 'sm', variant: 'ghost', onClick: stop, children: 'Stop' })
          ] })
        ] })
      }),
      // done tools trailer (collapsible — the reply stays the hero)
      turn.phase === 'done' && tools.length > 0 && jsx('button', {
        type: 'button',
        onClick: () => setToolsOpen((v) => !v),
        className: 'self-start text-muted-foreground',
        style: HIVE_T.xs,
        children: toolsOpen
          ? `▾ ${tools.length} tool${tools.length > 1 ? 's' : ''} · ${tools.filter((t) => t.status === 'err').length} failed`
          : `▸ ${tools.length} tool${tools.length > 1 ? 's' : ''} · ${tools.filter((t) => t.status === 'err').length} failed`
      }),
      toolsOpen && turn.phase === 'done' && jsx('div', { className: 'flex flex-col gap-0.5', children:
        tools.map((t) => jsx('div', { key: t.name + t.ts, className: 'flex items-center gap-1.5 text-muted-foreground', style: HIVE_T.xs, children: [
          jsx('span', { className: t.status === 'err' ? 'text-destructive' : undefined, children: t.status === 'err' ? '✕' : '✓' }),
          jsx('span', { className: 'min-w-0 flex-1 truncate', children: t.name }),
          t.dur ? jsx('span', { children: hiveFmtDur(t.dur) }) : null
        ] }))
      })
    ]
  })
}

/** Per-agent collapsible section in the grouped timeline. Header preview is
 *  DERIVED from the actual timeline entries (reactive — the timeline atom
 *  changes on every delta), so the header always shows the live spine state.
 *  Attention chip ("● N new") appears when collapsed with unseen messages. */
function HiveAgentGroup({ profile, messages, expanded, onToggle, unseen }) {
  const isSystem = profile === 'system'
  const { color, soft } = isSystem ? { color: 'var(--ui-text-quaternary)', soft: 'transparent' } : hiveAccent(profile)
  const last = messages[messages.length - 1]
  const lastIsTurn = last && last.kind === 'turn'
  const busy = lastIsTurn && (last.phase === 'thinking' || last.phase === 'tool' || last.phase === 'streaming' || last.phase === 'queued')
  const preview = lastIsTurn ? hiveActivityPreview(last)
    : last ? String(last.text || '').trim().replace(/\s+/g, ' ').slice(0, 90) : ''
  const count = messages.length
  return jsxs('div', {
    className: 'rounded-lg border', style: { borderColor: color, background: isSystem ? 'transparent' : soft },
    'data-hive-group': profile, 'data-expanded': expanded ? 'true' : 'false',
    children: [
      jsx('button', {
        type: 'button', onClick: onToggle,
        'aria-expanded': expanded ? 'true' : 'false',
        title: expanded ? `Collapse @${profile}` : `Expand @${profile}'s work`,
        className: 'flex w-full items-center gap-1.5 px-2 py-1.5 text-left select-none',
        children: jsxs('span', { className: 'flex min-w-0 flex-1 items-center gap-1.5', children: [
          jsx('span', { className: 'shrink-0', style: HIVE_T.sm, children: expanded ? '▾' : '▸' }),
          jsx('span', { className: 'rounded-full shrink-0', style: { ...HIVE_T.dot, background: color } }),
          jsx('span', { style: { color }, className: 'shrink-0 font-semibold', children: isSystem ? 'hive' : '@' + profile }),
          busy && jsx('span', { className: 'shrink-0 animate-pulse text-muted-foreground', style: HIVE_T.xs, children: '…' }),
          jsx('span', { className: 'truncate text-muted-foreground', style: HIVE_T.xs, children: expanded ? `${count} msg` : (preview || (busy ? 'working…' : `${count} msg`)) }),
          unseen > 0 && !expanded && jsx('span', { className: 'shrink-0 rounded-full px-1.5 text-[10px] font-medium', style: { background: color, color: '#fff' }, children: `● ${unseen} new` })
        ] })
      }),
      expanded && jsx('div', { className: 'flex flex-col gap-0.5 px-1 pb-1', children:
        messages.map((m) => m.kind === 'turn' ? jsx(HiveTurnRow, { key: m.id, turn: m }) : jsx(HiveMemberTone, { key: m.id, m }))
      })
    ]
  })
}

/** Shared follow-mode scroll: auto-scroll only while pinned near the bottom;
 *  show a "↓ latest" chip when the user has scrolled up (SPEC B5). */
function hiveUseFollowScroll(ref, timeline) {
  const [pinned, setPinned] = useState(true)
  const getViewport = () => {
    const root = ref.current
    return root?.querySelector?.('[data-slot="scroll-area-viewport"]') || root
  }
  useEffect(() => {
    const el = getViewport()
    if (el && pinned) el.scrollTop = el.scrollHeight
  }, [timeline, pinned])
  useEffect(() => {
    const el = getViewport()
    if (!el) return undefined
    const handleScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 48
      setPinned(near)
    }
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])
  const onScroll = (ev) => {
    const el = ev.currentTarget
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    setPinned(near)
  }
  const jump = () => {
    const el = getViewport()
    if (el) { el.scrollTop = el.scrollHeight; setPinned(true) }
  }
  return { pinned, onScroll, jump }
}

/** Grouped timeline: each agent's work is its own expandable section. */
function HiveGroupedTimeline() {
  const timeline = useValue($hiveTimeline)
  const expanded = useValue($hiveAgentExpanded)
  const seen = useValue($hiveGroupSeen)
  const ref = useRef(null)
  const follow = hiveUseFollowScroll(ref, timeline)
  const groups = useMemo(() => hiveGroupTimeline(timeline), [timeline])
  const toggle = (profile) => {
    const next = hiveToggleAgentExpanded($hiveAgentExpanded.get(), profile)
    $hiveAgentExpanded.set(next)
    // Expanding marks this group's messages as seen (attention chips reset).
    if (next[hiveNormalize(profile)]) {
      $hiveGroupSeen.set({ ...$hiveGroupSeen.get(), [hiveNormalize(profile)]: Date.now() })
    }
    hivePersist()
  }
  return jsx('div', { className: 'relative h-full grow min-h-0', children: [
    jsx(ScrollArea, {
      ref, className: 'h-full grow min-h-0', onScroll: follow.onScroll,
      children: jsx('div', { className: 'flex flex-col gap-1 p-2', 'data-hive-grouped': true, children:
        groups.length
          ? groups.map((g) => jsx(HiveAgentGroup, {
              key: g.profile, profile: g.profile, messages: g.messages,
              expanded: !!expanded[g.profile],
              unseen: hiveGroupUnseen(timeline, g.profile, seen[g.profile]),
              onToggle: () => toggle(g.profile)
            }))
          : [jsx('div', { key: 'empty', className: 'p-6 text-center text-xs text-muted-foreground', children: 'No activity yet. Message @default or add agents to start the crew.' })]
      })
    }),
    !follow.pinned && jsx(Button, {
      size: 'sm', variant: 'outline',
      onClick: follow.jump,
      className: 'absolute bottom-3 right-3 z-10 shadow',
      children: '↓ latest'
    })
  ] })
}

/** Slim toggle between the flat feed and grouped-by-agent expandable view.
 *  `right` carries extra header content (the feed filter) without another row. */
function HiveTimelineModeToggle({ right }) {
  const mode = useValue($hiveTimelineMode)
  return jsx('div', {
    className: 'flex items-center justify-between gap-2 border-b px-2 py-1',
    'data-hive-mode-toggle': true,
    children: [
      jsxs('span', { className: 'flex items-center gap-2', children: [
        jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Work' }),
        jsx(SegmentedControl, {
          options: [
            { id: 'agents', label: 'By agent' },
            { id: 'flat', label: 'Feed' }
          ],
          value: mode,
          onChange: (v) => { $hiveTimelineMode.set(v === 'agents' ? 'agents' : 'flat'); hivePersist() }
        })
      ] }),
      right || null
    ]
  })
}

/** Coordination grammar shortcuts — the bracket syntax agents actually speak
 *  (SPEC B8 discoverability). Clicking inserts the template into the composer. */
const HIVE_GRAMMAR_HINTS = Object.freeze([
  { id: 'to', label: '[to @name]', tpl: '[to @name]' },
  { id: 'ask', label: '[ask @name]', tpl: '[ask @name]' },
  { id: 'all', label: '[all]', tpl: '[all]' }
])

function HiveComposer() {
  const composer = useValue($hiveComposer)
  const members = useValue($hiveMembers)
  const open = useValue($hiveMentionOpen)
  const selectedAgent = useValue($tsAgentSelected)
  const timeline = useValue($hiveTimeline)
  const ref = useRef(null)
  const [active, setActive] = useState(0)
  const q = open.toLowerCase()
  const matches = useMemo(() => {
    if (!open) return []
    return members.map((m) => '@' + m.profile).concat(['@you']).filter((n) => n.toLowerCase().includes(q)).slice(0, 6)
  }, [open, members])
  // The member a Stop would interrupt: the selected one when it is mid-turn,
  // else the first member that is. Derived, so it can never point at a member
  // that is already idle.
  const stopTarget = useMemo(() => {
    const busy = members.filter((m) => hiveStatusBusy(hiveMemberStatus(m, timeline)))
    if (!busy.length) return null
    const sel = hiveNormalize(selectedAgent || '')
    return busy.find((m) => hiveNormalize(m.profile) === sel) || busy[0]
  }, [members, timeline, selectedAgent])

  const send = (text) => {
    if (!text.trim()) return
    haptic('tap')
    $hiveComposer.set('')
    $hiveMentionOpen.set('')
    setActive(0)

    // You can drive the work protocol too: `[task @builder] …` from the
    // composer assigns real work, not just a message.
    hiveApplyScratchOps('you', hiveParseScratchOps(text))
    const work = hiveApplyWorkItems($hiveTasks.get(), {
      from: 'you',
      parsed: hiveParseWorkItems(text),
      ts: Date.now()
    })
    if (work.tasks !== $hiveTasks.get()) $hiveTasks.set(work.tasks)

    const scrubbed = hiveScrubMarkers(text)
    const parsed = hiveRouteUserPost(scrubbed, members)
    if (!parsed.relays.length && parsed.broadcast) {
      hiveAppendTimeline({ from: 'you', kind: 'user', text: parsed.broadcast, to: null })
    }
    // `you` drives the work protocol too — same cards the agents produce.
    hiveEmitWorkCards(work.cards, 'you')
    // Same seam the agents use — one policy, so `you` can never be routed by
    // rules the room doesn't apply to everyone else.
    void hiveRunPlan(
      hivePlanDeliveries({ from: 'you', parsed, work, members, swarm: $hiveSwarm.get(), hops: 0 }),
      'you'
    )
    hivePersist()
  }

  const onChange = (v) => {
    $hiveComposer.set(v)
    const toks = v.split(/\s+/)
    $hiveMentionOpen.set((toks[toks.length - 1] || '').startsWith('@') ? toks[toks.length - 1].slice(1) : '')
    setActive(0)
  }

  const pickMention = (name) => {
    const toks = $hiveComposer.get().split(/\s+/)
    toks[toks.length - 1] = name + ' '
    $hiveComposer.set(toks.join(' ')); $hiveMentionOpen.set(''); setActive(0); ref.current?.focus?.()
  }

  const insertTemplate = (tpl) => {
    const cur = $hiveComposer.get()
    const sep = cur && !cur.endsWith(' ') ? ' ' : ''
    $hiveComposer.set(cur + sep + tpl + ' ')
    setActive(0); ref.current?.focus?.()
  }

  const onKeyDown = (ev) => {
    if (open && matches.length > 0) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((a) => (a + 1) % matches.length); return }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); return }
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); pickMention(matches[active] || matches[0]); return }
      if (ev.key === 'Escape') { ev.preventDefault(); $hiveMentionOpen.set(''); return }
    }
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(composer) }
  }

  return jsxs('div', {
    className: 'relative border-t p-2 flex flex-col gap-1.5',
    'data-hive-composer': true,
    children: [
      open && matches.length > 0 && jsx('div', {
        className: 'absolute bottom-full left-2 right-2 z-20 max-h-48 overflow-y-auto rounded-md border bg-background p-1 shadow-lg',
        'data-hive-mentions': true,
        children: matches.map((name, i) => jsx(Button, {
          key: name,
          variant: i === active ? 'default' : 'ghost',
          size: 'sm',
          className: 'w-full justify-start text-xs',
          onMouseEnter: () => setActive(i),
          onClick: () => pickMention(name),
          children: name
        }))
      }),
      // grammar hint chips — insert the bracket syntax agents understand
      jsx('div', { className: 'flex flex-wrap items-center gap-1', children: [
        jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Route:' }),
        ...HIVE_GRAMMAR_HINTS.map((h) => jsx(Button, {
          key: h.id, variant: 'ghost', size: 'sm',
          className: 'h-5 px-1.5 text-[10px]',
          title: `Insert ${h.label} — agents read this as a directed message`,
          onClick: () => insertTemplate(h.tpl),
          children: h.label
        }))
      ] }),
      jsx(Textarea, {
        ref, value: composer, rows: 2, className: 'resize-none text-sm',
        placeholder: '@name to direct · [all] to broadcast · or just talk to the room…',
        'data-testid': 'hive-composer',
        onChange: (ev) => onChange(ev.target.value),
        onKeyDown: onKeyDown
      }),
      jsxs('div', { className: 'flex items-center justify-between gap-2', children: [
        jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Enter ↵ send · Shift+↵ newline · @ tag · ↑↓ pick' }),
        jsxs('div', { className: 'flex items-center gap-1.5', children: [
          // Stop the member that is actually mid-turn (§3.3) — the verified
          // session.interrupt path, aimed at the selected member when there is
          // one, else the first busy member.
          stopTarget
            ? jsx(Button, {
                variant: 'outline', size: 'sm', title: `Interrupt @${stopTarget.profile}`,
                onClick: () => void hiveStopMember(stopTarget.profile),
                children: jsxs('span', { className: 'flex items-center gap-1', children: [jsx(icons.StopFilled, { size: 11 }), `Stop @${stopTarget.profile}`] })
              })
            : null,
          jsx(Button, { onClick: () => send(composer), disabled: !composer.trim(), size: 'sm', children: jsxs('span', { children: ['Send ', jsx(icons.Send, { size: 12, className: 'inline' })] }) })
        ] })
      ] })
    ]
  })
}

/** Reliable reset: header button + inline confirm popover (not inside a Radix
 *  dropdown, which eats button clicks). */
function HiveResetButton() {
  const [confirming, setConfirming] = useState(false)
  const rootRef = useRef(null)
  useEffect(() => {
    if (!confirming) return
    const onDocMouse = (ev) => { if (rootRef.current && !rootRef.current.contains(ev.target)) setConfirming(false) }
    const onKey = (ev) => { if (ev.key === 'Escape') setConfirming(false) }
    document.addEventListener('mousedown', onDocMouse)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDocMouse); document.removeEventListener('keydown', onKey) }
  }, [confirming])
  return jsxs('div', { className: 'relative', ref: rootRef, children: [
    confirming &&
      jsx('div', { className: 'absolute right-0 top-9 z-30 w-56 rounded-lg border bg-background p-2 shadow-lg', children: jsxs('div', { className: 'flex flex-col gap-1.5', children: [
        jsx('div', { className: 'text-xs', children: 'Reset the whole room?' }),
        jsx('div', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Interrupts all members, clears the timeline, starts a fresh @default. The shared scratchpad is kept.' }),
        jsx('div', { className: 'flex justify-end gap-1.5', children: [
          jsx(Button, { size: 'sm', variant: 'ghost', onClick: () => setConfirming(false), children: 'Cancel' }),
          jsx(Button, { size: 'sm', variant: 'destructive', onClick: () => { setConfirming(false); void hiveResetRoom() }, children: 'Reset room' })
        ] })
      ] }) }),
    jsx(Button, { variant: 'ghost', size: 'sm', title: 'Reset room', 'aria-label': 'Reset room', onClick: () => setConfirming((c) => !c), children: jsxs('span', { className: 'flex items-center gap-1.5', children: [jsx(icons.Trash2, { size: 14 }), 'Reset'] }) })
  ] })
}

function HiveCreateForm({ onDone, onCancel }) {
  const [name, setName] = useState('')
  const [cloneFrom, setCloneFrom] = useState('default')
  const [soul, setSoul] = useState('')
  const [contextMode, setContextMode] = useState('minimal')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const trimmed = name.trim()
  const invalid = trimmed !== '' && !hiveIsValidProfileName(trimmed)
  const busy = status === 'saving' || status === 'done'
  async function submit() {
    if (!trimmed || invalid) { setError(invalid ? 'Lowercase letters, digits, - or _ (start letter/digit).' : 'Pick a name first.'); return }
    setStatus('saving'); setError('')
    try { await hiveCreateProfile(trimmed, cloneFrom || null, soul); setStatus('done'); onDone(trimmed, contextMode) }
    catch (err) { setStatus('error'); setError(err instanceof Error ? err.message : 'Create failed.') }
  }
  return jsxs('div', { className: 'flex flex-col gap-1.5 border-t p-2', 'data-hive-create': true, children: [
    jsx('div', { className: 'text-xs font-medium', children: 'New profile' }),
    jsx(Input, { autoFocus: true, placeholder: 'profile-name', value: name, 'aria-invalid': invalid, onChange: (e) => setName(e.target.value), className: 'text-xs' }),
    jsx(Input, { placeholder: 'Clone from (default)', value: cloneFrom, onChange: (e) => setCloneFrom(e.target.value), className: 'text-xs' }),
    jsxs('div', { className: 'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5', children: [
      jsxs('span', { className: 'flex flex-col', children: [
        jsx('span', { className: 'text-xs', children: 'Context mode' }),
        jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'New clones default to Minimal.' })
      ] }),
      jsx(SegmentedControl, {
        options: [{ id: 'standard', label: 'Standard' }, { id: 'minimal', label: 'Minimal' }],
        value: contextMode,
        onChange: (next) => setContextMode(hiveNormalizeContextMode(next))
      })
    ] }),
    jsx(Textarea, { placeholder: 'Optional SOUL.md / persona', value: soul, rows: 2, onChange: (e) => setSoul(e.target.value), className: 'resize-none text-xs' }),
    error && jsx('div', { className: 'text-destructive', style: HIVE_T.sm, children: error }),
    jsxs('div', { className: 'flex items-center justify-between', children: [
      jsx(Button, { variant: 'ghost', size: 'sm', onClick: onCancel, disabled: busy, children: 'Cancel' }),
      jsx(Button, { size: 'sm', onClick: () => void submit(), disabled: busy || !trimmed, children: status === 'saving' ? 'Creating…' : 'Create & join' })
    ] })
  ] })
}

function HiveRenderOptions({ opts, onPick, onNew }) {
  return jsxs('div', { className: 'flex flex-col gap-0.5', style: { maxHeight: 220, overflowY: 'auto' }, children: [
    opts.length ? opts.map((p) => {
      const { color } = hiveAccent(p.name)
      return jsx(Button, { key: p.name, variant: 'ghost', size: 'sm', className: 'justify-start text-xs', onClick: () => onPick(p), children: jsxs('div', { className: 'flex items-center gap-1.5', children: [
        jsx('span', { className: 'rounded-full', style: { ...HIVE_T.dot, background: color } }),
        jsx('span', { style: { color }, children: '@' + p.name }),
        jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: p.model || 'no model' })
      ] }) })
    }) : jsx('div', { className: 'p-2 text-xs text-muted-foreground', children: 'Every profile is already in the room.' }),
    jsx('div', { className: 'mt-1 border-t pt-1' }),
    jsx(Button, { variant: 'ghost', size: 'sm', className: 'justify-start text-xs', onClick: onNew, children: jsxs('span', { children: [jsx(icons.Plus, { size: 13, className: 'inline mr-1' }), 'New profile…'] }) })
  ] })
}

function HiveAddMember() {
  const [q, setQ] = useState('')
  const [profiles, setProfiles] = useState([])
  const [open, setOpen] = useState(false)
  const [loadState, setLoadState] = useState('idle')
  const [creating, setCreating] = useState(false)
  const rootRef = useRef(null)
  const members = useValue($hiveMembers)
  const present = new Set(members.map((m) => hiveNormalize(m.profile)).concat(['you']))
  const opts = profiles.filter((p) => !present.has(hiveNormalize(p.name))).filter((p) => p.name.includes(q.toLowerCase())).slice(0, 20)

  // Close on outside-click or Escape.
  useEffect(() => {
    if (!open) return
    const onDocMouse = (ev) => { if (rootRef.current && !rootRef.current.contains(ev.target)) setOpen(false) }
    const onKey = (ev) => { if (ev.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocMouse)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDocMouse); document.removeEventListener('keydown', onKey) }
  }, [open])

  const load = () => { setLoadState('loading'); void hiveFetchProfiles().then((p) => { setProfiles(p); setLoadState(p.length ? 'idle' : 'error') }) }
  const toggle = () => { if (open) { setOpen(false); return } load(); setOpen(true) }
  const pick = (p) => { void hiveMintMember(p.name); setOpen(false); setQ('') }

  return jsxs('div', { className: 'relative', ref: rootRef, children: [
    open && jsxs('div', { className: 'absolute z-20 right-0 top-9 w-64 rounded-lg border bg-background p-2 shadow-lg', children: [
      jsxs('div', { className: 'mb-1 flex items-center justify-between', children: [
        jsx('div', { className: 'text-xs font-medium', children: creating ? 'New profile' : 'Add agent' }),
        jsx(Button, { variant: 'ghost', size: 'icon-micro', 'aria-label': 'Close', onClick: () => { setOpen(false); setCreating(false) }, children: jsx(icons.X, { size: 13 }) })
      ] }),
      creating
        ? jsx(HiveCreateForm, { onDone: (name, contextMode) => { setCreating(false); setOpen(false); setQ(''); void hiveMintMember(name, { contextMode }); void hiveFetchProfiles().then(setProfiles) }, onCancel: () => setCreating(false) })
        : jsxs('div', { className: 'flex flex-col gap-1.5', children: [
            jsx(Input, { autoFocus: true, placeholder: 'Search profiles…', value: q, onChange: (e) => setQ(e.target.value), className: 'mb-1 text-xs' }),
            loadState === 'error'
              ? jsx('div', { className: 'flex items-center justify-between p-1', children: [jsx('span', { className: 'text-muted-foreground', style: HIVE_T.sm, children: 'Couldn’t load profiles.' }), jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => { load(); setOpen(true) }, children: 'Retry' })] })
              : jsx(HiveRenderOptions, { opts, onPick: pick, onNew: () => setCreating(true) })
          ] })
    ] }),
    jsx(Button, { variant: 'ghost', size: 'sm', onClick: toggle, disabled: members.length >= HIVE_MAX_MEMBERS && !open, children: jsxs('span', { children: [jsx(icons.Plus, { size: 13, className: 'mr-1 inline' }), 'Add'] }) })
  ] })
}

/** Shared team scratchpad — markdown, injected into every agent turn. */
/** The work board: what the room has assigned, submitted, and validated. */
function HiveWorkBoard() {
  const tasks = useValue($hiveTasks)
  const open = tasks.filter((t) => t && t.status !== 'passed')
  if (!open.length) {
    return jsx('div', { className: 'rounded-md border border-dashed p-2 text-muted-foreground', style: HIVE_T.xs,
      children: 'No open work items. Assign one with [task @name] …, then ask for a check with [review @name #id].' })
  }
  const tone = (s) => (s === 'failed' ? 'var(--ui-red)' : s === 'submitted' ? 'var(--ui-yellow)' : undefined)
  return jsx('div', { className: 'flex flex-col gap-1', children: open.map((t) =>
    jsxs('div', { key: t.id, className: 'flex items-center gap-2 rounded-md border px-2 py-1', style: HIVE_T.xs, children: [
      jsx('span', { className: 'font-mono text-muted-foreground', children: '#' + t.id }),
      jsx('span', { className: 'font-medium uppercase tracking-wide', style: { color: tone(t.status) }, children: t.status }),
      jsx('span', { className: 'min-w-0 flex-1 truncate', title: t.title, children: t.title }),
      jsx('span', { className: 'text-muted-foreground', children: `@${t.owner}${t.reviewer ? ' → @' + t.reviewer : ' · unreviewed'}` })
    ] }))
  })
}

function HiveScratchEditor() {
  const scratch = useValue($hiveScratch)
  const mission = useValue($hiveMission)
  const [draft, setDraft] = useState(scratch)
  const [goal, setGoal] = useState(mission)
  const len = draft.length
  const saveMission = () => {
    $hiveMission.set(goal)
    hivePersist()
    host.notify({ kind: 'success', message: 'Mission set — every member sees it on their next turn.' })
  }
  return jsxs('div', { className: 'flex h-full min-h-0 flex-col gap-2 p-2', 'data-hive-scratch': true, children: [
    // Mission: pinned, never trimmed, shipped in every delivery. Without it the
    // 12-entry digest is the only shared context and the goal scrolls away.
    jsxs('div', { className: 'flex flex-col gap-1', 'data-hive-mission': true, children: [
      jsx('span', { className: 'font-medium text-xs', children: 'Mission' }),
      jsxs('div', { className: 'flex items-center gap-1.5', children: [
        jsx(Input, {
          value: goal,
          onChange: (e) => setGoal(e.target.value),
          className: 'h-7 flex-1 text-xs',
          placeholder: 'What is this room trying to achieve? Pinned into every agent turn.'
        }),
        jsx(Button, { size: 'sm', disabled: goal === mission, onClick: saveMission, children: 'Set' })
      ] })
    ] }),
    jsxs('div', { className: 'flex flex-col gap-1', children: [
      jsx('span', { className: 'font-medium text-xs', children: 'Work board' }),
      jsx(HiveWorkBoard, {})
    ] }),
    jsxs('div', { className: 'flex items-center justify-between text-xs', children: [
      jsx('span', { className: 'font-medium', children: 'Shared scratchpad' }),
      jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: `${len} chars · injected every turn · [scratchpad:Section] appends, [scratchpad:Section!] corrects` })
    ] }),
    jsx(Textarea, {
      value: draft,
      onChange: (e) => setDraft(e.target.value),
      className: 'min-h-0 w-full grow resize-none rounded-md border bg-background p-2 font-mono text-xs',
      placeholder: '# Team scratchpad\n\nRecord progress, decisions, and shared facts here.\nEvery member sees this every turn. Agents can append via [scratchpad].'
    }),
    jsxs('div', { className: 'flex items-center justify-between', children: [
      jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => { setDraft(''); $hiveScratch.set(''); hivePersist() }, children: 'Clear' }),
      jsx('div', { className: 'flex gap-1.5', children: [
        jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => $hiveView.set('timeline'), children: 'Back' }),
        jsx(Button, { size: 'sm', onClick: () => { $hiveScratch.set(draft); hivePersist(); host.notify({ kind: 'success', message: 'Scratchpad saved — agents get it next turn.' }) }, children: 'Save & sync' })
      ] })
    ] })
  ] })
}

/** Inline SOUL/persona editor for a member profile (light + fast). */
function HiveSoulEditor({ profile }) {
  const [draft, setDraft] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState(false)
  useEffect(() => {
    let on = true
    void hiveGetSoul(profile).then((r) => { if (on) { setDraft(r.content || ''); setHint(String(r.content || '').includes('[scratchpad]')); setLoaded(true) } })
      .catch(() => { if (on) { setError('Couldn’t load SOUL'); setLoaded(true) } })
    return () => { on = false }
  }, [profile])
  const acc = hiveAccent(profile)
  return jsxs('div', { className: 'flex h-full min-h-0 flex-col gap-2 p-2', 'data-hive-soul': true, children: [
    jsxs('div', { className: 'flex items-center justify-between text-xs', children: [
      jsx('span', { className: 'font-medium', children: jsx('span', { style: { color: acc.color }, children: '@' + profile + ' · SOUL' }) }),
      jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => $hiveView.set('timeline'), children: 'Back' })
    ] }),
    hint &&
      jsx('div', { className: 'rounded-md border bg-muted/40 p-1.5 text-muted-foreground', style: HIVE_T.xs, children: '✓ Scratchpad pointer is in this SOUL.' }),
    loaded
      ? jsx(Textarea, {
          value: draft,
          onChange: (e) => setDraft(e.target.value),
          className: 'min-h-0 w-full grow resize-none rounded-md border bg-background p-2 font-mono text-xs',
          placeholder: '(blank SOUL — add a persona here, then remember it to drive the room)'
        })
      : jsx('div', { className: 'p-4 text-xs text-muted-foreground', children: 'Loading…' }),
    error && jsx('div', { className: 'text-destructive', style: HIVE_T.sm, children: error }),
    jsxs('div', { className: 'flex items-center justify-between gap-1.5', children: [
      jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => { setDraft((d) => { const cur = d.trim() ? d + '\n\n' : ''; return cur + HIVE_SOUL_SCRATCH_HINT }); setHint(true) }, title: 'Adds a pointer to the shared scratchpad', children: 'Insert scratchpad pointer' }),
      jsx(Button, { size: 'sm', onClick: async () => { try { await hiveUpdateSoul(profile, draft); host.notify({ kind: 'success', message: `@${profile} SOUL saved.` }); $hiveView.set('timeline') } catch (e) { setError((e && e.message) || 'Save failed') } }, children: 'Save SOUL' })
    ] })
  ] })
}



// ── Phase 1 workspace: project, presets, leader ─────────────────────────────

/** Load projects.list once and reconcile the active project from cwd.
 *  Registered RPC, smoke-tested live (see TEAM_WORKSPACE_PROGRESS.md §spikes).
 *  Every failure lands in $tsProjectError so the toolbar shows an honest
 *  degraded state instead of an empty dropdown. */
async function hiveLoadProjects() {
  try {
    const res = await host.request('projects.list', {})
    const list = (res && res.projects) || []
    $tsProjectList.set(list)
    $tsProjectError.set('')
    if (!$tsActiveProject.get() && $hiveCwd.get()) {
      const found = await host.request('projects.for_cwd', { cwd: $hiveCwd.get() })
      const p = found && found.project
      if (p) {
        $tsActiveProject.set({
          id: p.id, slug: p.slug, name: p.name || p.slug,
          primaryPath: p.primary_path || '', branch: (found && found.branch) || ''
        })
        hivePersist()
      }
    }
  } catch (err) {
    $tsProjectList.set([])
    $tsProjectError.set((err && err.message) || 'Projects unavailable')
    console.warn('[buzz-hive] projects.list failed', err)
  }
}

/** Select a project. Relabels the room and stamps cwd for FUTURE member
 *  sessions only — per-project history is Phase 2 (ARCHITECTURE.md risk 5). */
async function hiveSelectProject(project) {
  if (!project) {
    $tsActiveProject.set(null)
    hivePersist()
    return
  }
  const next = {
    id: project.id, slug: project.slug, name: project.name || project.slug,
    primaryPath: project.primary_path || '', branch: $tsActiveProject.get() ? ($tsActiveProject.get().branch || '') : ''
  }
  $tsActiveProject.set(next)
  if (next.primaryPath) $hiveCwd.set(next.primaryPath)
  hivePersist()
  try {
    const found = await host.request('projects.for_cwd', { cwd: next.primaryPath || '' })
    if (found && found.branch && $tsActiveProject.get() && $tsActiveProject.get().id === next.id) {
      $tsActiveProject.set({ ...$tsActiveProject.get(), branch: found.branch })
      hivePersist()
    }
  } catch { /* branch is decoration; the selection already stands */ }
  try {
    await host.request('projects.set_active', { id: next.id })
  } catch (err) {
    host.notifyError(err, 'Hive: could not set the active project')
  }
  host.notify({ kind: 'success', message: `Hive: project → ${next.name}. New member sessions use its folder; history is per-room until Phase 2.` })
}

/** Mark/clear the room's leader flag (presentational ordering only). */
function hiveSetLeader(profile) {
  const key = hiveNormalize(profile)
  const list = $hiveMembers.get()
  const cur = list.find((m) => hiveNormalize(m.profile) === key)
  const next = !(cur && cur.leader === true)
  $hiveMembers.set(list.map((m) => (hiveNormalize(m.profile) === key ? { ...m, leader: next } : m)))
  hivePersist()
}

/** Save the current roster as a preset (plugin-local, same hive.v2 blob). */
function hiveSaveTeamPreset(name) {
  const members = $hiveMembers.get().map((m) => ({
    profile: m.profile,
    contextMode: hiveNormalizeContextMode(m.contextMode),
    model: m.model || null,
    provider: m.provider || null
  }))
  const trimmed = String(name || '').trim() || `room-${($tsTeams.get().length || 0) + 1}`
  const rest = $tsTeams.get().filter((t) => t && t.name !== trimmed)
  $tsTeams.set([...rest, { name: trimmed, members }])
  hivePersist()
  host.notify({ kind: 'success', message: `Hive: preset "${trimmed}" saved (${members.length} members).` })
}

/** Apply a preset: mint the MISSING members through the existing mint path and
 *  re-apply a saved model when it resolves to a real entry. Never removes
 *  anyone — a preset adds a crew, it does not evict the current one. */
async function hiveApplyTeamPreset(preset) {
  const saved = (preset && preset.members) || []
  let minted = 0
  for (const s of saved) {
    const key = hiveNormalize(s && s.profile)
    if (!key) continue
    if ($hiveMembers.get().some((m) => hiveNormalize(m.profile) === key)) continue
    await hiveMintMember(key, { contextMode: s.contextMode })
    minted++
    const entry = s.model ? hiveResolveModelEntry(s.provider, s.model) : undefined
    if (entry) {
      try { await hiveSetMemberModel(key, entry) } catch (err) { host.notifyError(err, `Hive: preset model for @${key} failed`) }
    }
  }
  host.notify({
    kind: 'success',
    message: `Hive: preset "${preset.name}" applied — ${minted} member(s) started.`
  })
}

// ── approvals / workflow reads (React Query over the app's own client) ──────

/** Per-member pending approvals, polled on the app's query client (one query
 *  for the whole roster so the hook count never depends on the roster). Each
 *  member's failure is captured INSIDE the payload, so one dead session can
 *  never blank the tab or throw the query. */
function hiveUseApprovals(members) {
  const live = (members || []).filter((m) => m && m.sessionId)
  const key = live.map((m) => `${m.profile}:${m.sessionId}`).join(',')
  const query = useQuery({
    queryKey: ['buzz-hive', 'approvals', key],
    enabled: live.length > 0,
    refetchInterval: TS_APPROVAL_POLL_MS,
    queryFn: async () => {
      const out = {}
      for (const m of live) {
        try {
          const res = await host.request('approval.pending', { session_id: m.sessionId })
          out[m.profile] = { sessionId: m.sessionId, pending: (res && res.approvals) || [], error: '' }
        } catch (err) {
          out[m.profile] = { sessionId: m.sessionId, pending: [], error: (err && (err.message || err.code)) || 'unavailable' }
        }
      }
      return out
    }
  })
  const byProfile = query.data || {}
  let total = 0
  for (const v of Object.values(byProfile)) total += (v.pending || []).length
  const errored = Object.keys(byProfile).length > 0 && Object.values(byProfile).every((v) => !!v.error)
  return { byProfile, total, errored, loading: query.isLoading }
}

async function hiveRespondApproval(member, requestId, choice) {
  try {
    await host.request('approval.respond', {
      session_id: member.sessionId,
      choice,
      ...(requestId ? { request_id: requestId } : {})
    })
    host.notify({ kind: 'success', message: `Hive: @${member.profile} — "${choice}" recorded.` })
    await queryClient.invalidateQueries({ queryKey: ['buzz-hive', 'approvals'] })
  } catch (err) {
    host.notifyError(err, `Hive: could not answer @${member.profile}'s approval`)
  }
}

// ── shared bits ─────────────────────────────────────────────────────────────

function TsStatusDot({ status }) {
  return jsx(StatusDot, { tone: hiveStatusTone(status), title: hiveStatusLabel(status) })
}

function TsAgentAvatar({ profile }) {
  const { color, soft } = hiveAccent(profile)
  const initial = (String(profile || '?').trim()[0] || '?').toUpperCase()
  return jsx('span', {
    className: 'ts-avatar',
    'data-accent': color,
    style: { background: soft, border: `1px solid ${color}`, color },
    children: initial
  })
}

function TsCopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = (ev) => {
    if (ev && ev.stopPropagation) ev.stopPropagation()
    void hiveCopyText(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      hiveAfter(1200, () => setCopied(false))
    })
  }
  return jsx(Button, {
    variant: 'ghost', size: 'icon-xs', className: 'ts-copy', title: 'Copy this message',
    'aria-label': 'Copy message', onClick: copy,
    children: jsx(icons.Copy, { size: 11, className: copied ? 'text-(--ui-green)' : undefined })
  })
}

// ── toolbar ─────────────────────────────────────────────────────────────────

function TsRoomTitle() {
  const title = useValue($hiveTitle)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const commit = () => {
    if (draft.trim()) { $hiveTitle.set(draft.trim().slice(0, 40)); hivePersist() }
    setEditing(false)
  }
  if (editing) {
    return jsx(Input, {
      autoFocus: true, value: draft, className: 'h-6 w-36 text-xs',
      onChange: (e) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (ev) => { if (ev.key === 'Enter') commit() }
    })
  }
  return jsx(Badge, {
    variant: 'muted', className: 'cursor-pointer',
    title: 'Rename room', onClick: () => { setDraft(title); setEditing(true) },
    children: title
  })
}

function TsProjectSelect() {
  const active = useValue($tsActiveProject)
  const list = useValue($tsProjectList)
  const err = useValue($tsProjectError)
  const pick = (value) => {
    if (value === 'none') { void hiveSelectProject(null); return }
    const found = ($tsProjectList.get() || []).find((p) => 'p:' + p.id === value)
    if (found) void hiveSelectProject(found)
  }
  return jsxs('div', {
    className: 'flex min-w-0 items-center gap-1.5',
    'data-ts-project': true,
    title: 'Switching project relabels the room and sets the folder for FUTURE member sessions. Conversation history is per-room until the Phase 2 namespacing migration.',
    children: [
      jsx(icons.FolderOpen, { size: 13, className: 'shrink-0 text-muted-foreground' }),
      list && list.length
        ? jsx(Select, {
            value: active ? 'p:' + active.id : 'none',
            onValueChange: pick,
            children: [
              jsx(SelectTrigger, { className: 'h-6 max-w-56 min-w-32 text-xs', children: jsx(SelectValue, { placeholder: 'No project' }) }),
              jsx(SelectContent, {
                children: [
                  jsx(SelectItem, { value: 'none', children: 'No project' }),
                  list.map((p) => jsx(SelectItem, { key: p.id, value: 'p:' + p.id, children: p.name || p.slug }))
                ]
              })
            ]
          })
        : jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: err ? 'Projects unavailable' : 'Loading projects…' }),
      active && jsx(Badge, { variant: 'outline', size: 'xs', children: active.branch || 'no branch' }),
      active && active.primaryPath
        ? jsx('span', { className: 'truncate text-muted-foreground', style: { ...HIVE_T.xs, maxWidth: 180 }, title: active.primaryPath, children: active.primaryPath })
        : null
    ]
  })
}

function TsTeamPresetMenu() {
  const teams = useValue($tsTeams)
  const members = useValue($hiveMembers)
  const [name, setName] = useState('')
  return jsx(DropdownMenu, {
    children: [
      jsx(DropdownMenuTrigger, {
        asChild: true,
        children: jsx(Button, { variant: 'ghost', size: 'sm', title: 'Roster presets', children: jsxs('span', { className: 'flex items-center gap-1.5', children: [jsx(icons.Users, { size: 13 }), 'Teams'] }) })
      }),
      jsx(DropdownMenuContent, {
        align: 'start',
        children: [
          jsx('div', { className: 'px-2 py-1 text-muted-foreground', style: HIVE_T.xs, children: `${members.length} member(s) in the room` }),
          ...(teams.length
            ? teams.map((t) => jsx(DropdownMenuItem, { key: t.name, onSelect: () => void hiveApplyTeamPreset(t), children: jsxs('span', { children: [t.name, jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xsRemoveMl, children: `${(t.members || []).length} members` })] }) }))
            : [jsx('div', { key: 'none', className: 'px-2 py-1 text-muted-foreground', style: HIVE_T.xs, children: 'No presets saved yet.' })]),
          jsx(DropdownMenuSeparator, {}),
          jsx('div', { className: 'flex items-center gap-1.5 px-2 py-1.5', children: [
            jsx(Input, { value: name, placeholder: 'preset name', className: 'h-6 flex-1 text-xs', onChange: (e) => setName(e.target.value) }),
            jsx(Button, { size: 'xs', onClick: () => { hiveSaveTeamPreset(name); setName('') }, children: 'Save current' })
          ] })
        ]
      })
    ]
  })
}

function TsRoomControls() {
  const members = useValue($hiveMembers)
  const [stopping, setStopping] = useState(false)
  const stopAll = async () => {
    setStopping(true)
    // Every stop is the verified session.interrupt path, via hiveStopMember.
    for (const m of $hiveMembers.get()) { if (m.sessionId) await hiveStopMember(m.profile) }
    setStopping(false)
  }
  const anyLive = members.some((m) => m.sessionId)
  return jsxs('div', {
    className: 'flex items-center gap-1',
    children: [
      jsx(Button, {
        variant: 'ghost', size: 'sm', disabled: stopping || !anyLive,
        title: anyLive ? 'Interrupt every member session' : 'No live member sessions', onClick: () => void stopAll(),
        children: jsxs('span', { className: 'flex items-center gap-1.5', children: [jsx(icons.StopFilled, { size: 12 }), 'Stop all'] })
      }),
      jsx(HiveResetButton, {})
    ]
  })
}

function TsWorkersBadge() {
  const members = useValue($hiveMembers)
  const timeline = useValue($hiveTimeline)
  const n = members.filter((m) => hiveStatusBusy(hiveMemberStatus(m, timeline))).length
  return jsx(Badge, { variant: n ? 'default' : 'muted', title: 'Members mid-turn (derived from the live event stream)', children: n ? `${n} working` : 'ready' })
}

function TsApprovalsBadge() {
  const members = useValue($hiveMembers)
  const { total, errored } = hiveUseApprovals(members)
  if (errored || total <= 0) return null
  const open = () => {
    $tsRightTab.set('approvals')
    $tsSheets.set({ team: false, right: true })
    hivePersist()
  }
  return jsx(Button, { variant: 'ghost', size: 'sm', title: 'Pending approvals', onClick: open, children: jsxs('span', { className: 'flex items-center gap-1.5', children: [jsx(icons.Bell, { size: 13 }), String(total)] }) })
}

function TsSwarmRow() {
  const swarm = useValue($hiveSwarm)
  return jsxs('div', {
    className: 'flex items-center justify-between gap-3 px-2.5 py-1.5',
    children: [
      jsx('span', { className: 'text-xs', children: 'Agents talk to each other' }),
      jsx(Switch, { checked: swarm, onCheckedChange: (v) => { $hiveSwarm.set(!!v); hivePersist() } })
    ]
  })
}

function TsSettingsMenu() {
  const swarm = useValue($hiveSwarm)
  const view = useValue($hiveView)
  const dock = useValue($tsDockOpen)
  return jsx(DropdownMenu, {
    children: [
      jsx(DropdownMenuTrigger, {
        asChild: true,
        children: jsx(Button, { variant: 'ghost', size: 'sm', 'aria-label': 'Room settings', children: jsxs('span', { className: 'flex items-center gap-1.5', children: [jsx(icons.SlidersHorizontal, { size: 13 }), 'Settings'] }) })
      }),
      jsx(DropdownMenuContent, {
        align: 'end',
        children: [
          jsx(TsSwarmRow, {}),
          jsx('div', { className: 'px-2.5 pb-1 text-muted-foreground', style: HIVE_T.xs, children: swarm ? 'Relays between agents are injected live.' : 'Agents only reply to you — no inter-agent injection.' }),
          jsx(DropdownMenuSeparator, {}),
          jsx(DropdownMenuItem, { onSelect: () => { $hiveView.set(view === 'scratch' ? 'timeline' : 'scratch'); hivePersist() }, children: view === 'scratch' ? 'Close scratchpad' : 'Open scratchpad' }),
          jsx(DropdownMenuItem, { onSelect: () => { $tsDockOpen.set(!dock); hivePersist() }, children: dock ? 'Hide bottom dock' : 'Show bottom dock' })
        ]
      })
    ]
  })
}

function TsToolbar() {
  const sheets = useValue($tsSheets)
  return jsxs('div', {
    className: 'ts-toolbar', 'data-ts-toolbar': true,
    children: [
      jsx(TsRoomTitle, {}),
      jsx(TsProjectSelect, {}),
      jsx('span', { className: 'flex-1' }),
      jsx(TsTeamPresetMenu, {}),
      jsx(TsRoomControls, {}),
      jsx(TsWorkersBadge, {}),
      jsx(TsApprovalsBadge, {}),
      jsx(TsSettingsMenu, {}),
      jsx('button', {
        type: 'button', className: 'ts-narrow-only ts-railbutton', title: 'Team', 'aria-label': 'Team panel',
        onClick: () => $tsSheets.set({ team: !sheets.team, right: false }),
        children: jsx(icons.Users, { size: 14 })
      }),
      jsx('button', {
        type: 'button', className: 'ts-narrow-only ts-railbutton', title: 'Work panel', 'aria-label': 'Work panel',
        onClick: () => $tsSheets.set({ team: false, right: !sheets.right }),
        children: jsx(icons.Layers3, { size: 14 })
      })
    ]
  })
}

// ── left column: Team ───────────────────────────────────────────────────────

function TsAgentDetail({ m, status, turn }) {
  const tasks = useValue($hiveTasks)
  const key = hiveNormalize(m.profile)
  const mine = hiveSortTasks((tasks || []).filter(
    (t) => t && t.status !== 'passed' && (hiveNormalizeOpt(t.owner) === key || hiveNormalizeOpt(t.reviewer) === key)
  ))
  const sessionRef = m.storedId || m.sessionId || null
  const action = (label, onClick, opts = {}) => jsx(Button, {
    variant: opts.variant || 'outline', size: 'xs', disabled: !!opts.disabled, title: opts.title || label, onClick,
    children: label
  })
  return jsxs('div', {
    className: 'ts-card m-1 flex flex-col gap-1.5', 'data-ts-agent-detail': m.profile,
    children: [
      jsxs('div', { className: 'flex flex-col gap-0.5', style: HIVE_T.xs, children: [
        jsxs('span', { className: 'text-muted-foreground', children: ['model: ', jsx('span', { className: 'text-(--ui-text-primary)', children: m.model ? `${m.provider || '?'} / ${m.modelLabel || m.model}` : 'inherits the profile default' })] }),
        jsxs('span', { className: 'text-muted-foreground', children: ['context: ', jsx('span', { className: 'text-(--ui-text-primary)', children: hiveNormalizeContextMode(m.contextMode) })] }),
        jsxs('span', { className: 'text-muted-foreground', children: ['session: ', jsx('span', { className: 'text-(--ui-text-primary)', children: sessionRef || 'none — Fresh context to start one' })] }),
        jsxs('span', { className: 'text-muted-foreground', children: ['status: ', jsx('span', { className: 'text-(--ui-text-primary)', children: hiveStatusLabel(status) })] }),
        turn && jsxs('span', { className: 'text-muted-foreground', children: ['this turn: ', jsx('span', { className: 'text-(--ui-text-primary)', children: hiveFmtDur((turn.doneAt || Date.now()) - turn.startedAt) })] })
      ] }),
      jsxs('div', { className: 'flex flex-col gap-0.5', children: [
        jsx('span', { className: 'font-medium text-muted-foreground', style: HIVE_T.xs, children: 'Open work items' }),
        mine.length
          ? mine.map((t) => jsxs('div', { key: t.id, className: 'flex items-center gap-1.5', style: HIVE_T.xs, children: [
              jsx('span', { className: 'font-mono text-muted-foreground', children: '#' + t.id }),
              jsxs('span', { style: { color: hiveTaskStatusTone(t) }, className: 'font-semibold', children: [hiveTaskStatusLabel(t), hiveNormalizeOpt(t.reviewer) === key && hiveNormalizeOpt(t.owner) !== key ? ' · reviewing' : ''] }),
              jsx('span', { className: 'min-w-0 flex-1 truncate', title: t.title, children: t.title })
            ] }))
          : jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'None.' })
      ] }),
      jsxs('div', { className: 'flex flex-wrap items-center gap-1', children: [
        action('Stop', () => void hiveStopMember(m.profile), { variant: 'outline', disabled: status === 'idle' || status === 'offline', title: 'Interrupt this session (session.interrupt)' }),
        action('View session', () => { if (sessionRef) host.navigate('/' + encodeURIComponent(sessionRef)) }, { disabled: !sessionRef, title: 'Open the native sessions pane on this session' }),
        action(m.muted ? 'Unmute' : 'Mute', () => void hiveToggleMute(m.profile), {}),
        action(m.browser ? 'Release browser' : 'Grant browser', () => void hiveSetBrowser(m.profile, !m.browser), {}),
        action(m.leader ? 'Clear leader' : 'Mark leader', () => hiveSetLeader(m.profile), { title: 'Sort this member to the top of the panel' }),
        action('Fresh context', () => void hiveFreshContext(m.profile), { title: 'Drop the session and mint a new one' }),
        action('Remove', () => void hiveRemoveMember(m.profile), { variant: 'destructive', title: 'Remove from the room' })
      ] }),
      jsx(HiveContextModeControl, { m }),
      jsx(HiveModelSubmenu, { m })
    ]
  })
}

function TsAgentRow({ m, status, turn, open }) {
  const selected = useValue($tsAgentSelected)
  const isSelected = hiveNormalize(selected || '') === hiveNormalize(m.profile)
  const meta = [
    m.leader ? 'leader' : null,
    m.muted ? 'muted' : null,
    m.model ? (m.modelLabel || m.model) : 'no model',
    turn ? hiveFmtDur((turn.doneAt || Date.now()) - turn.startedAt) : null
  ].filter(Boolean).join(' · ')
  const toggle = () => {
    $tsAgentSelected.set(m.profile)
    $tsAgentExpanded.set(hiveToggleAgentExpanded($tsAgentExpanded.get(), m.profile))
    hivePersist()
  }
  return jsxs('div', {
    className: 'ts-row', 'data-selected': isSelected ? 'true' : 'false', 'data-agent': m.profile,
    onClick: toggle,
    title: `@${m.profile} · ${hiveStatusLabel(status)} · session ${m.sessionId || 'pending'}`,
    children: [
      jsx(TsAgentAvatar, { profile: m.profile }),
      jsxs('span', { className: 'ts-team-body flex min-w-0 flex-1 flex-col gap-0.5', children: [
        jsxs('span', { className: 'flex min-w-0 items-center gap-1.5', children: [
          jsx(TsStatusDot, { status }),
          jsx('span', { className: 'truncate text-xs font-semibold', children: '@' + m.profile }),
          m.browser && jsx(icons.Globe, { size: 11, className: 'shrink-0 text-muted-foreground' }),
          hiveStatusGlyph(status) ? jsx('span', { className: cn('shrink-0', hiveStatusBusy(status) && 'animate-pulse'), style: { ...HIVE_T.xs, color: status === 'error' ? 'var(--ui-red)' : undefined }, children: hiveStatusGlyph(status) }) : null
        ] }),
        jsx('span', { className: 'truncate text-muted-foreground', style: HIVE_T.xs, children: meta })
      ] }),
      jsx('span', { className: 'ts-team-body shrink-0 text-muted-foreground', style: HIVE_T.xs, children: open ? '▾' : '▸' })
    ]
  })
}

function TsTeamPanel() {
  const members = useValue($hiveMembers)
  const timeline = useValue($hiveTimeline)
  const expanded = useValue($tsAgentExpanded)
  const ordered = useMemo(() => hiveOrderMembers(members), [members])
  return jsxs('div', {
    className: 'ts-col ts-col-team', 'data-ts-team': true,
    children: [
      jsxs('div', { className: 'ts-strip', children: [
        jsx('span', { className: 'text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground', children: 'Team' }),
        jsx('span', { className: 'flex-1' }),
        jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: `${members.length + 1}/11` })
      ] }),
      jsx(ScrollArea, {
        className: 'ts-scroll',
        children: jsxs('div', { className: 'flex flex-col', children: [
          jsxs('div', { className: 'ts-row', 'data-role': 'you', title: 'You are always in the room', children: [
            jsx(TsAgentAvatar, { profile: 'you' }),
            jsxs('span', { className: 'ts-team-body flex min-w-0 flex-1 items-center gap-1.5', children: [
              jsx(StatusDot, { tone: 'good' }),
              jsx('span', { className: 'text-xs font-semibold', children: 'you' }),
              jsx('span', { className: 'truncate text-muted-foreground', style: HIVE_T.xs, children: 'always delivers' })
            ] })
          ] }),
          ordered.map((m) => {
            const status = hiveMemberStatus(m, timeline)
            const turn = hiveLastOpenTurn(timeline, m.profile)
            const isOpen = !!expanded[hiveNormalize(m.profile)]
            return jsxs('div', { children: [
              jsx(TsAgentRow, { m, status, turn, open: isOpen }),
              isOpen && jsx(TsAgentDetail, { m, status, turn })
            ] }, m.profile)
          })
        ] })
      }),
      jsx('div', { className: 'ts-dock', children: [
        jsx(HiveAddMember, {}),
        jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: members.length >= HIVE_MAX_MEMBERS ? `Room full (${HIVE_MAX_MEMBERS})` : `${members.length} member(s)` })
      ] })
    ]
  })
}

// ── center column: conversation ─────────────────────────────────────────────

function TsWorkCard({ entry }) {
  const kind = entry.kind
  const tone = hiveTaskStatusTone(entry)
  const label = kind === 'task' ? 'TASK' : kind === 'done' ? 'SUBMITTED' : (entry.verdict ? 'VERDICT' : 'REVIEW')
  const who = kind === 'task' ? `→ @${entry.owner}`
    : kind === 'done' ? `@${entry.owner} → @${entry.reviewer || 'unreviewed'}`
    : entry.verdict ? `@${entry.reviewer} → @${entry.owner || '?'}`
    : `@${entry.reviewer} ← @${entry.owner || '?'}`
  return jsxs('div', {
    className: 'ts-card flex flex-col gap-1', 'data-ts-work': kind,
    // The one-line drawer title (hiveCardTitle) as the native tooltip, so a
    // long work card is identifiable from its header alone.
    title: hiveCardTitle(entry),
    style: { borderLeft: `2px solid ${tone}` },
    children: [
      jsxs('div', { className: 'flex items-center gap-2', style: HIVE_T.xs, children: [
        entry.workId ? jsx('span', { className: 'font-mono text-muted-foreground', children: '#' + entry.workId }) : null,
        jsx('span', { className: 'font-semibold uppercase tracking-wide', style: { color: tone }, children: label }),
        jsx('span', { className: 'truncate text-muted-foreground', children: who }),
        jsx('time', { className: 'ml-auto text-muted-foreground', style: { fontSize: 11, lineHeight: '14px' }, children: hiveTime(entry.ts) })
      ] }),
      jsx('div', { className: 'min-w-0 break-words text-xs leading-relaxed', style: HIVE_T.wrap, children: hiveRenderText(entry.text || '') }),
      kind === 'done' && entry.artifact
        ? jsx('div', { className: 'rounded border p-1.5 text-muted-foreground', style: HIVE_T.xsWrapWide, children: entry.artifact })
        : null,
      entry.reason
        ? jsx('div', { className: 'text-muted-foreground', style: { ...HIVE_T.xs, color: tone }, children: entry.reason })
        : null
    ]
  })
}

/** The dumb switch §3.5 asks for: kind → renderer. Prose and turn cards are
 *  handed to the proven renderers (HiveMemberTone / HiveTurnRow) rather than
 *  reimplemented, so the timeline keeps its existing behavior exactly. */
function TsCard({ card }) {
  const entry = card.entry
  if (card.kind === 'task' || card.kind === 'done' || card.kind === 'review') return jsx(TsWorkCard, { entry })
  if (entry.kind === 'turn') return jsx(HiveTurnRow, { turn: entry })
  return jsxs('div', { className: 'ts-entrygroup', children: [
    jsx(HiveMemberTone, { m: entry }),
    String(entry.text || '').trim() ? jsx(TsCopyButton, { text: entry.text }) : null
  ] })
}

function TsCardList({ cards, empty, followKey }) {
  const ref = useRef(null)
  const follow = hiveUseFollowScroll(ref, followKey)
  return jsxs('div', {
    className: 'relative flex min-h-0 grow flex-col',
    children: [
      jsx(ScrollArea, {
        ref, className: 'ts-scroll', onScroll: follow.onScroll,
        children: jsx('div', {
          className: 'flex flex-col gap-1 p-2', 'data-ts-feed': true,
          children: cards.length
            ? cards.map((c) => jsx(TsCard, { key: c.id, card: c }))
            : jsx('div', { className: 'p-6 text-center text-xs text-muted-foreground', children: empty })
        })
      }),
      !follow.pinned && jsx(Button, {
        size: 'sm', variant: 'outline', onClick: follow.jump,
        className: 'absolute bottom-3 right-3 z-10 shadow', children: '↓ latest'
      })
    ]
  })
}

function TsTimelineHeader({ search, onSearch }) {
  return jsx(HiveTimelineModeToggle, {
    right: jsx(Input, {
      value: search, onChange: (e) => onSearch(e.target.value),
      placeholder: 'Filter the feed…', className: 'h-6 w-40 text-xs', 'aria-label': 'Filter the conversation feed'
    })
  })
}

function TsTimelineBody({ search }) {
  const mode = useValue($hiveTimelineMode)
  const timeline = useValue($hiveTimeline)
  const filtered = useMemo(() => hiveFilterCards(hiveTimelineToCards(timeline), search), [timeline, search])
  // A filter always switches to the Feed: the By-agent sections group by
  // speaker, so a text filter there would silently do nothing.
  if (mode === 'agents' && !String(search || '').trim()) return jsx(HiveGroupedTimeline, {})
  return jsx(TsCardList, {
    cards: filtered,
    followKey: timeline,
    empty: timeline.length
      ? 'Nothing matches that filter.'
      : 'No activity yet. Message @default or add agents to start the crew.'
  })
}

function TsConversationPanel() {
  const view = useValue($hiveView)
  const [search, setSearch] = useState('')
  const soulProfile = view.startsWith('soul:') ? view.slice(5) : null
  return jsxs('div', {
    className: 'ts-col ts-col-center', 'data-ts-center': true,
    children: [
      soulProfile
        ? jsx(HiveSoulEditor, { key: soulProfile, profile: soulProfile })
        : view === 'scratch'
          ? jsx(HiveScratchEditor, {})
          : jsxs('div', { className: 'flex min-h-0 min-w-0 grow flex-col', children: [
              jsx(TsTimelineHeader, { search, onSearch: setSearch }),
              jsx(TsTimelineBody, { search }),
              jsx(HiveComposer, {})
            ] })
    ]
  })
}

// ── right column: tabs ──────────────────────────────────────────────────────

function TsTaskRow({ task }) {
  const tone = hiveTaskStatusTone(task)
  const dur = task.status === 'passed' ? null : hiveFmtDur(Date.now() - (task.ts || Date.now()))
  return jsxs('div', {
    className: 'ts-card flex flex-col gap-1', 'data-ts-task': task.id,
    style: { borderLeft: `2px solid ${tone}` },
    children: [
      jsxs('div', { className: 'flex items-center gap-2', style: HIVE_T.xs, children: [
        jsx('span', { className: 'font-mono text-muted-foreground', children: '#' + task.id }),
        jsx('span', { className: 'font-semibold uppercase tracking-wide', style: { color: tone }, children: hiveTaskStatusLabel(task) }),
        dur ? jsx('span', { className: 'text-muted-foreground', children: dur }) : null,
        jsx('span', { className: 'ml-auto truncate text-muted-foreground', children: `@${task.owner}${task.reviewer ? ' → @' + task.reviewer : ' · unreviewed'}` })
      ] }),
      jsx('div', { className: 'min-w-0 break-words text-xs', style: HIVE_T.wrap, children: task.title }),
      task.artifact
        ? jsx('div', { className: 'rounded border p-1.5 text-muted-foreground', style: HIVE_T.xsWrapWide, children: hiveTruncatePayload(task.artifact, 400) })
        : null,
      task.status === 'failed'
        ? jsx('div', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Failed — routed back to the owner; a new [done] returns it to IN REVIEW.' })
        : null
    ]
  })
}

function TsTasksTab() {
  const tasks = useValue($hiveTasks)
  const rows = useMemo(() => hiveSortTasks(tasks), [tasks])
  return jsx(ScrollArea, {
    className: 'ts-scroll',
    children: jsxs('div', { className: 'flex flex-col gap-1 p-2', 'data-ts-tasks': true, children: [
      jsxs('div', { className: 'ts-card flex flex-col gap-0.5', children: [
        jsx('span', { className: 'font-medium text-xs', children: 'Board' }),
        jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Durable tasks live in native Kanban (board `team`) — no desktop surface exists for it, so ask an agent: @atlas show the board.' }),
        jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'These rows are this room\u2019s work items. Dependencies, branch/worktree links and error reasons arrive with the Phase 4 kanban adapter.' })
      ] }),
      rows.length
        ? rows.map((t) => jsx(TsTaskRow, { key: t.id, task: t }))
        : jsx('div', { className: 'rounded-md border border-dashed p-2 text-muted-foreground', style: HIVE_T.xs, children: 'No work items. Assign one with [task @name] …, then ask for a check with [review @name #id].' })
    ] })
  })
}

function TsActivityTab() {
  const timeline = useValue($hiveTimeline)
  const cards = useMemo(() => hiveActivityCards(timeline), [timeline])
  return jsx(ScrollArea, {
    className: 'ts-scroll',
    children: jsxs('div', { className: 'flex flex-col gap-1 p-2', 'data-ts-activity': true, children: [
      jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Tools, work items and room events only — no prose. Read-only.' }),
      cards.length
        ? cards.map((c) => jsx(TsCard, { key: c.id, card: c }))
        : jsx('div', { className: 'rounded-md border border-dashed p-2 text-muted-foreground', style: HIVE_T.xs, children: 'Nothing has happened yet.' })
    ] })
  })
}

function TsFilesTab() {
  const active = useValue($tsActiveProject)
  const roomCwd = useValue($hiveCwd)
  const [state, setState] = useState({ loading: false, folders: [], error: '' })
  const activeId = active && active.id ? active.id : ''
  useEffect(() => {
    let live = true
    if (!activeId) { setState({ loading: false, folders: [], error: 'no-project' }); return () => { live = false } }
    setState((s) => ({ ...s, loading: true, error: '' }))
    host.request('projects.get', { id: activeId }).then((res) => {
      if (!live) return
      const p = res && res.project
      setState({ loading: false, folders: (p && p.folders) || [], error: '' })
    }).catch((err) => {
      if (!live) return
      setState({ loading: false, folders: [], error: (err && err.message) || 'unavailable' })
    })
    return () => { live = false }
  }, [activeId])

  const openFiles = () => hiveRunAppAction('view.showFiles')

  if (!activeId || state.error) {
    return jsx(ScrollArea, {
      className: 'ts-scroll',
      children: jsxs('div', { className: 'flex flex-col gap-1.5 p-2', 'data-ts-files': 'degraded', children: [
        jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: !activeId
          ? 'No project selected — pick one in the toolbar to list its folders.'
          : `Couldn\u2019t read the project folders (${state.error}).` }),
        jsx('button', { type: 'button', className: 'ts-linkcard', onClick: openFiles, children: jsxs('span', { className: 'flex items-center gap-1.5', children: [jsx(icons.FolderOpen, { size: 12 }), 'Open the native Files pane'] }) }),
        jsx('span', { className: 'break-words text-muted-foreground', style: HIVE_T.xs, children: roomCwd || 'no room folder set' })
      ] })
    })
  }

  return jsx(ScrollArea, {
    className: 'ts-scroll',
    children: jsx('div', { className: 'flex flex-col gap-1 p-2', 'data-ts-files': 'ready', children:
      state.loading && !state.folders.length
        ? jsx('div', { className: 'p-2 text-xs text-muted-foreground', children: 'Loading folders…' })
        : jsxs('div', { className: 'flex flex-col gap-1', children: [
            jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: `${(active && active.name) || ''} · ${state.folders.length} folder(s)` }),
            ...state.folders.map((f) => jsxs('div', {
              key: f.path, className: 'ts-card flex items-center gap-2', style: HIVE_T.xs,
              children: [
                jsx('span', { className: 'min-w-0 flex-1 truncate', title: f.path, children: f.label || f.path }),
                f.is_primary ? jsx(Badge, { variant: 'muted', size: 'xs', children: 'primary' }) : null,
                jsx(Button, { variant: 'ghost', size: 'xs', onClick: openFiles, title: 'Open the native Files pane', children: 'Open in Files' })
              ]
            }))
          ] })
    })
  })
}

function TsApprovalsTab({ data }) {
  const members = useValue($hiveMembers)
  const byProfile = data.byProfile || {}
  const rows = members.filter((m) => byProfile[m.profile])
  const errored = rows.filter((m) => byProfile[m.profile].error)
  return jsx(ScrollArea, {
    className: 'ts-scroll',
    children: jsxs('div', { className: 'flex flex-col gap-1 p-2', 'data-ts-approvals': true, children: [
      jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'A convenience mirror — the app\u2019s own modal still owns live approval prompts. Choices come from the server verbatim.' }),
      errored.length
        ? jsx('div', { className: 'ts-card', children: jsxs('div', { className: 'flex flex-col gap-0.5', children: [
            jsx('span', { className: 'font-medium text-xs', children: 'Approval reads unavailable' }),
            jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: `approval.pending failed for: ${errored.map((m) => '@' + m.profile).join(', ')}. Answer those in the native prompt.` })
          ] }) })
        : null,
      ...(!rows.length && !errored.length ? [jsx('div', { className: 'rounded-md border border-dashed p-2 text-muted-foreground', style: HIVE_T.xs, key: 'empty', children: 'No pending approvals.' })] : []),
      ...rows.map((m) => {
        const info = byProfile[m.profile]
        if (info.error || !info.pending.length) return null
        return jsxs('div', { className: 'ts-card flex flex-col gap-1.5', key: m.profile, children: [
          jsx('span', { className: 'font-medium text-xs', children: '@' + m.profile }),
          ...info.pending.map((p, i) => jsxs('div', {
            className: 'flex flex-col gap-1', key: (p && p.request_id) || String(i),
            children: [
              jsx('span', { className: 'min-w-0 break-words text-muted-foreground', style: HIVE_T.xs, children: (p && (p.command || p.tool || p.title || p.kind)) || 'approval requested' }),
              jsx('div', { className: 'flex flex-wrap gap-1', children: ((p && p.choices) || ['deny']).map((c) => jsx(Button, {
                key: c, size: 'xs', variant: c === 'deny' ? 'destructive' : 'outline',
                onClick: () => void hiveRespondApproval(m, p && p.request_id, c),
                children: c
              })) })
            ]
          }))
        ] })
      })
    ] })
  })
}

function TsWorkflowTab() {
  const query = useQuery({
    queryKey: ['buzz-hive', 'workflows'],
    refetchInterval: TS_WORKFLOW_POLL_MS,
    queryFn: async () => {
      const api = window && window.hermesDesktop && window.hermesDesktop.api
      if (!api) throw new Error('desktop bridge unavailable')
      return (await api({ path: '/api/plugins/hermes-workflows/runs' })) || {}
    }
  })
  const runs = (query.data && query.data.runs) || []
  const openPage = () => host.navigate('/workflows')
  if (query.error) {
    return jsx(ScrollArea, {
      className: 'ts-scroll',
      children: jsxs('div', { className: 'flex flex-col gap-1.5 p-2', 'data-ts-workflow': 'degraded', children: [
        jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Workflow runs are not readable from this page in this build.' }),
        jsx('button', { type: 'button', className: 'ts-linkcard', onClick: openPage, children: jsxs('span', { className: 'flex items-center gap-1.5', children: [jsx(icons.Zap, { size: 12 }), 'Open the native Workflows page'] }) })
      ] })
    })
  }
  return jsx(ScrollArea, {
    className: 'ts-scroll',
    children: jsxs('div', { className: 'flex flex-col gap-1 p-2', 'data-ts-workflow': 'ready', children: [
      jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Read-only mirror. Gate release and run creation stay on the Workflows page (the workflow engine owns them).' }),
      runs.length
        ? runs.map((r) => jsxs('div', {
            className: 'ts-card flex flex-col gap-1', key: r.id,
            children: [
              jsxs('div', { className: 'flex items-center gap-2', style: HIVE_T.xs, children: [
                jsx('span', { className: 'font-mono text-muted-foreground', children: r.id }),
                jsx('span', { className: 'font-semibold uppercase tracking-wide', children: r.status || 'unknown' }),
                r.held_gate ? jsx(Badge, { variant: 'warn', size: 'xs', children: 'gate held' }) : null,
                jsx('span', { className: 'ml-auto text-muted-foreground', children: `${r.nodes_done || 0}/${r.nodes_total || 0} nodes` })
              ] }),
              jsx('div', { className: 'min-w-0 truncate text-xs', title: r.name, children: r.name || '(unnamed run)' }),
              jsxs('div', { className: 'flex items-center gap-1.5', style: HIVE_T.xs, children: [
                jsx('span', { className: 'truncate text-muted-foreground', children: r.owner_profile ? '@' + r.owner_profile : 'unowned' }),
                jsx(Button, { variant: 'ghost', size: 'xs', onClick: openPage, children: 'Open' })
              ] })
            ]
          }))
        : jsx('div', { className: 'rounded-md border border-dashed p-2 text-muted-foreground', style: HIVE_T.xs, children: 'No workflow runs yet.' })
    ] })
  })
}

function TsRightRail() {
  const tab = useValue($tsRightTab)
  const select = (id) => {
    $tsRightTab.set(id)
    $tsSheets.set((s) => ({ team: false, right: true }))
    hivePersist()
  }
  return jsx('div', {
    className: 'ts-rail', 'data-ts-rail': true,
    children: TS_RIGHT_TABS.map((t) => jsx('button', {
      key: t.id, type: 'button', className: 'ts-railbutton', 'data-active': tab === t.id ? 'true' : 'false',
      title: t.label, 'aria-label': t.label, onClick: () => select(t.id),
      children: jsx('span', { style: { fontSize: 10 }, children: t.label.slice(0, 2) })
    }))
  })
}

function TsRightPanel() {
  const tab = useValue($tsRightTab)
  const members = useValue($hiveMembers)
  const approvals = hiveUseApprovals(members)
  const setTab = (v) => { $tsRightTab.set(v); hivePersist() }
  return jsxs('div', {
    className: 'ts-col ts-col-right', 'data-ts-right': true,
    children: [
      jsxs('div', { className: 'ts-right-body flex min-h-0 grow flex-col', children: [
        jsxs('div', { className: 'ts-strip', children: [
          jsx('span', { className: 'text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground', children: 'Work' }),
          jsx('span', { className: 'flex-1' }),
          approvals.total > 0 ? jsx(Badge, { variant: 'warn', size: 'xs', children: String(approvals.total) }) : null
        ] }),
        jsx(Tabs, {
          value: tab, onValueChange: setTab, className: 'gap-0',
          children: jsx(TabsList, {
            className: 'mx-2 mt-1 h-7 w-auto max-w-[calc(100%-1rem)] justify-start gap-0.5 overflow-x-auto p-0.5',
            children: TS_RIGHT_TABS.map((t) => jsx(TabsTrigger, {
              key: t.id, value: t.id, className: 'h-6 gap-1 px-1.5 text-[0.6875rem]',
              children: t.label
            }))
          })
        }),
        jsx('div', { className: 'flex min-h-0 grow flex-col', children:
          tab === 'tasks' ? jsx(TsTasksTab, {})
            : tab === 'activity' ? jsx(TsActivityTab, {})
              : tab === 'files' ? jsx(TsFilesTab, {})
                : tab === 'approvals' ? jsx(TsApprovalsTab, { data: approvals })
                  : jsx(TsWorkflowTab, {})
        })
      ] }),
      jsx(TsRightRail, {})
    ]
  })
}

// ── bottom dock (links only — nothing is embedded) ──────────────────────────

function TsBottomDock() {
  const open = useValue($tsDockOpen)
  const links = [
    { id: 'terminal', label: 'Terminal', icon: icons.Terminal, run: () => hiveRevealPane('terminal') },
    { id: 'logs', label: 'Logs', icon: icons.FileText, run: () => hiveRevealPane('logs') },
    { id: 'sessions', label: 'Sessions', icon: icons.MessageSquareText, run: () => hiveRevealPane('sessions') },
    { id: 'review', label: 'Review', icon: icons.Eye, run: () => hiveRunAppAction('view.toggleReview') }
  ]
  return jsxs('div', {
    className: 'ts-dock', 'data-ts-dock': open ? 'open' : 'closed',
    children: [
      jsx(Button, {
        variant: 'ghost', size: 'xs', 'aria-expanded': open ? 'true' : 'false',
        title: 'Bottom dock — links out to the native panes',
        onClick: () => { $tsDockOpen.set(!open); hivePersist() },
        children: jsxs('span', { className: 'flex items-center gap-1', children: [jsx(icons.PanelBottom, { size: 12 }), 'Dock'] })
      }),
      open
        ? links.map((l) => jsx('button', {
            key: l.id, type: 'button', className: 'ts-linkcard', title: `Reveal the native ${l.label} pane`,
            onClick: l.run,
            children: jsxs('span', { className: 'flex items-center gap-1.5', style: HIVE_T.xs, children: [jsx(l.icon, { size: 12 }), l.label] })
          }))
        : jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Native terminal / logs / sessions / review live in their own panes — open them from here.' })
    ]
  })
}

// ── <600px overlay sheets ───────────────────────────────────────────────────

function TsSheet({ side, open, children }) {
  return jsx('div', {
    className: 'ts-sheet', 'data-side': side, 'data-open': open ? 'true' : 'false',
    children
  })
}

function TsWorkspace() {
  const sheets = useValue($tsSheets)
  return jsxs('div', {
    className: 'ts-workspace', 'data-ts-workspace': true,
    children: [
      jsx(TsToolbar, {}),
      jsx(TsTeamPanel, {}),
      jsx(TsConversationPanel, {}),
      jsx(TsRightPanel, {}),
      jsx(TsBottomDock, {}),
      // Lazy: a closed sheet must not mount its panel. Mounting both sheets
      // unconditionally rendered every column twice and gave the approvals
      // query three observers sharing one query key (3x poll per tick).
      !!sheets.team && jsx(TsSheet, { side: 'team', open: true, children: jsx(TsTeamPanel, {}) }),
      !!sheets.right && jsx(TsSheet, { side: 'right', open: true, children: jsx(TsRightPanel, {}) })
    ]
  })
}

function HivePage() {
  return jsx(TsWorkspace, {})
}

// ── register ────────────────────────────────────────────────────────────────
export default {
  id: HIVE_PLUGIN_ID,
  name: 'Buzz-Hive',

  register(ctx) {
    hiveStorageRef = ctx.storage
    hiveCtxRef = ctx
    hiveInjectStyles()
    const raw = ctx.storage.get(HIVE_STORAGE_KEY, null)
    if (raw && (!raw.members || !Array.isArray(raw.members))) {
      ctx.storage.set(HIVE_STORAGE_KEY, { title: 'hive', cwd: '', members: [], timeline: [], swarm: true })
    }
    void hiveBootHydrate().then(() => hiveLoadProjects())

    const disposers = []
    hiveOpenPage = () => host.navigate(HIVE_ROUTE)

    disposers.push(ctx.register({
      id: 'page', area: ROUTES_AREA, title: 'Hive',
      data: { path: HIVE_ROUTE },
      render: () => jsx(HivePage, {})
    }))
    disposers.push(ctx.register({
      id: 'nav', area: SIDEBAR_NAV_AREA, order: 45,
      data: { codicon: 'comment-discussion', label: 'Hive', path: HIVE_ROUTE }
    }))
    disposers.push(ctx.register({
      id: 'palette-open', area: PALETTE_AREA,
      data: {
        id: 'buzz-hive-open', label: 'Hive: open the agent room',
        keywords: ['hive', 'buzz', 'room', 'agents', 'multi', 'coordinate'],
        run: () => { hiveOpenPage(); hivePersist(); host.notify({ kind: 'success', message: 'Hive room opened.' }) }
      }
    }))

    disposers.push(host.onEvent('message.start', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      console.log(`[buzz-hive] turn start @${m.profile} session=${e.session_id}`)
      hiveOpenTurn(m)
    }))
    disposers.push(host.onEvent('message.delta', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      // Coalesced: the batch lands in the open bubble on the ~50ms window.
      hiveQueueDelta(m, (e.payload && e.payload.text) || '')
      hiveMarkStatus(e.session_id, 'streaming')
    }))
    disposers.push(host.onEvent('thinking.delta', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      hiveFlushDelta(e.session_id) // keep text and phase in event order
      hivePatchOpenTurn(m, { phase: 'thinking' })
      hiveMarkStatus(e.session_id, 'thinking')
    }))
    disposers.push(host.onEvent('reasoning.delta', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      hiveFlushDelta(e.session_id)
      hivePatchOpenTurn(m, { phase: 'thinking' })
      hiveMarkStatus(e.session_id, 'thinking')
    }))
    disposers.push(host.onEvent('tool.start', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      hiveFlushDelta(e.session_id)
      hiveTurnToolStart(m, (e.payload && (e.payload.tool || e.payload.name)) || 'tool')
    }))
    disposers.push(host.onEvent('tool.complete', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      hiveTurnToolDone(m, (e.payload && (e.payload.tool || e.payload.name)) || '', !e.error)
    }))
    // Defensive tool.error — silently no-op if this gateway never emits it.
    try {
      disposers.push(host.onEvent('tool.error', (e) => {
        const m = hiveMemberBySession(e.session_id, e.profile)
        if (!m) return
        hiveTurnToolDone(m, (e.payload && (e.payload.tool || e.payload.name)) || '', false)
      }))
    } catch { /* event type not offered — fine */ }
    // Honest failure surfacing: any per-session error marks the turn failed.
    try {
      disposers.push(host.onEvent('error', (e) => {
        const m = hiveMemberBySession(e.session_id, e.profile)
        if (!m) return
        // Gateway ErrorPayload is `{message}` (tui_gateway/contracts/events.py),
        // delivered as GatewayEvent.payload; `e.error` is the older shape.
        hiveTurnFail(m, (e.payload && e.payload.message) || (e.error && e.error.message) || 'turn failed')
      }))
    } catch { /* event type not offered — fine */ }
    disposers.push(host.onEvent('message.complete', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      hiveFlushDelta(e.session_id) // the fold must see every buffered delta
      // The spine itself holds the streamed text now (single source).
      const open = hiveLastOpenTurn($hiveTimeline.get(), m.profile)
      const buffered = open ? String(open.text || '') : ''
      console.log(`[buzz-hive] turn complete @${m.profile} chars=${buffered.length}`)
      void hiveHandleAssistantDone(e, buffered)
    }))
    disposers.push(host.onEvent('assistant.completed', hiveHandleFallbackCompleted))

    // ── Phase 1 cleanup (§8.3) ──────────────────────────────────────────────
    // Everything this plugin added — subscriptions (above), the delta timers,
    // the injected style sheet, the query caches it owns — is released here.
    // Load → use → disable → re-enable must leave no duplicate rows and no
    // live timers.
    ctx.onDispose(() => {
      hiveOpenPage = null
      hiveClearDeltas()
      disposers.forEach((d) => { try { d() } catch { /* noop */ } })
      try { queryClient.removeQueries({ queryKey: ['buzz-hive'] }) } catch { /* noop */ }
      try { hivePersist() } catch { /* noop */ }
      hiveRemoveStyles()
      hiveCtxRef = null
    })
  }
}
