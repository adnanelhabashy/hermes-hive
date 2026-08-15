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
  wrap: { overflowWrap: 'anywhere', wordBreak: 'break-word' }
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
// Timeline presentation: 'flat' (chronological feed) | 'agents' (grouped,
// per-agent collapsible sections). Expand/collapse is per-agent, persisted.
const $hiveTimelineMode = atom('agents')
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

// module refs set in register()
let hiveStorageRef = null

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
  const now = ts || 0
  const author = hiveNormalize(from)
  const newId = mkId || hiveMakeTaskId
  const find = (id) => next.findIndex((t) => t && t.id === id)

  for (const t of (parsed && parsed.tasks) || []) {
    const id = newId()
    const owner = hiveNormalize(t.target)
    next.push({ id, title: t.title || '(untitled)', from: author, owner, reviewer: '', status: 'open', artifact: '', ts: now })
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

  return { tasks: next.slice(-HIVE_TASK_KEEP), routes }
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
  $hiveTimeline.set([...t, { id: Math.random().toString(36).slice(2, 9), ts: Date.now(), ...msg }].slice(-200))
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
  $hiveTimeline.set([...tl, entry].slice(-200))
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
    $hiveTimeline.set([...tl, entry].slice(-200))
    return entry
  }
  const folded = hiveTurnFold(tl[i], finalText, Date.now())
  hiveReplaceTurn(i, folded)
  hivePersist()
  return folded
}

/** Mark the member's open turn failed (SPEC B3 honest status). */
function hiveTurnFail(member, error) {
  const i = hiveOpenTurnIndex(member)
  const tl = $hiveTimeline.get()
  if (i === -1) {
    const entry = hiveTurnError(hiveTurnInit(hiveNormalize(member.profile), Date.now()), error, Date.now())
    $hiveTimeline.set([...tl, entry].slice(-200))
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
    hiveMarkStatus(m.sessionId, 'idle')
    hiveFoldTurn(m, undefined) // close the spine with whatever streamed so far
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
    members: $hiveMembers.get().map((m) => ({
      profile: m.profile,
      storedId: m.storedId,
      browser: m.browser,
      muted: m.muted,
      contextMode: hiveNormalizeContextMode(m.contextMode),
      model: m.model || null,
      provider: m.provider || null,
      modelLabel: m.modelLabel || null
    })),
    timeline: $hiveTimeline.get().slice(-120)
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
  if (Array.isArray(saved.timeline)) $hiveTimeline.set(saved.timeline.slice(-120))
  const hydrated = []
  for (const m of saved.members) {
    const live = {
      profile: m.profile,
      storedId: m.storedId || null,
      browser: !!m.browser,
      muted: !!m.muted,
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

function HiveRosterChip({ m }) {
  const { color, soft } = hiveAccent(m.profile)
  const sessionRef = m.storedId || m.sessionId || undefined
  // Phase glyph + tone — honest status vocabulary (SPEC B3): queued clock,
  // thinking dots, tooling gear, streaming pulse, error cross, done check.
  const phase = m.status
  const glyph =
    phase === 'queued' ? '⏳'
    : phase === 'thinking' ? '···'
    : phase === 'tool' ? '⚙'
    : phase === 'streaming' ? '…'
    : phase === 'error' ? '✕'
    : phase === 'done' ? '✓'
    : ''
  const glyphPulse = phase === 'thinking' || phase === 'tool' || phase === 'streaming'
  const glyphTone = phase === 'error' ? { color: 'var(--ui-danger, #e5484d)' } : phase === 'done' ? HIVE_T.xs : HIVE_T.streamDots
  const statusLabel =
    phase === 'queued' ? 'queued behind current turn'
    : phase === 'thinking' ? 'thinking…'
    : phase === 'tool' ? 'using a tool…'
    : phase === 'streaming' ? 'answering…'
    : phase === 'error' ? 'errored'
    : phase === 'done' ? 'done'
    : 'idle'
  return jsx(DropdownMenu, {
    children: [
      jsx(DropdownMenuTrigger, {
        asChild: true,
        children: jsx('div', {
          'data-role': 'member',
          style: { borderColor: color, background: soft },
          title: `${m.muted ? '(muted) ' : ''}@${m.profile} · ${statusLabel} · session ${sessionRef || 'pending'}`,
          className: cn(
            'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs select-none',
            m.browser && 'ring-1',
            m.muted && 'opacity-60'
          ),
          children: [
            jsx('span', { className: 'rounded-full', style: { ...HIVE_T.dot, background: color } }),
            jsx('span', { style: { color }, className: 'font-medium', children: '@' + m.profile }),
            m.browser && jsx(icons.Globe, { size: 12, style: { color } }),
            m.muted && jsx('span', { className: 'uppercase tracking-wide text-muted-foreground', style: HIVE_T.xs, children: 'muted' }),
            jsx('span', { className: 'uppercase tracking-wide text-muted-foreground', style: HIVE_T.xs, children: hiveNormalizeContextMode(m.contextMode) === 'minimal' ? 'minimal' : 'standard' }),
            m.modelLabel && jsx('span', { className: 'truncate text-muted-foreground', style: HIVE_T.xs, title: m.modelLabel, children: m.modelLabel }),
            glyph && jsx('span', { className: cn(glyphPulse && 'animate-pulse'), style: { ...glyphTone, fontSize: 10 }, children: glyph })
          ]
        })
      }),
      jsx(DropdownMenuContent, {
        align: 'start',
        children: [
          sessionRef && jsx(DropdownMenuItem, { onSelect: () => host.navigate('/' + encodeURIComponent(sessionRef)), children: jsxs('span', { children: ['Open session', jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xsRemoveMl, children: sessionRef.slice(0, 12) + '…' })] }) }),
          m.status !== 'idle' && jsx(DropdownMenuItem, { onSelect: () => void hiveStopMember(m.profile), children: 'Stop (interrupt)' }),
          jsx(DropdownMenuItem, { onSelect: () => { $hiveView.set('soul:' + m.profile); haptic('tap') }, children: 'Edit SOUL / persona' }),
          jsx(DropdownMenuItem, { onSelect: () => void hiveToggleMute(m.profile), children: m.muted ? 'Unmute' : 'Mute' }),
          jsx(DropdownMenuItem, { onSelect: () => void hiveSetBrowser(m.profile, !m.browser), children: m.browser ? 'Release browser control' : 'Grant browser control' }),
          jsx(HiveContextModeControl, { m }),
          jsx(HiveModelSubmenu, { m }),
          jsx(DropdownMenuItem, { onSelect: () => void hiveFreshContext(m.profile), children: 'Fresh context (new session)' }),
          jsx(DropdownMenuSeparator, {}),
          jsx(DropdownMenuItem, { variant: 'destructive', onSelect: () => void hiveRemoveMember(m.profile), children: 'Remove from room' })
        ]
      })
    ]
  })
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
        turn.phase === 'error' && jsx('span', { style: { color: 'var(--ui-danger, #e5484d)' }, className: 'font-semibold', children: '✕ error' }),
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
        style: { borderColor: 'var(--ui-danger, #e5484d)', background: 'color-mix(in srgb, var(--ui-danger, #e5484d) 8%, transparent)' },
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

/** Flat chronological feed — turn entries render as inline activity spines. */
function HiveTimeline() {
  const timeline = useValue($hiveTimeline)
  const ref = useRef(null)
  const follow = hiveUseFollowScroll(ref, timeline)
  return jsx('div', { className: 'relative h-full grow min-h-0', children: [
    jsx(ScrollArea, {
      ref, className: 'h-full grow min-h-0', onScroll: follow.onScroll,
      children: jsx('div', {
        className: 'flex flex-col gap-1 p-2',
        'data-hive-timeline': true,
        children: timeline.length
          ? timeline.map((m) => m.kind === 'turn' ? jsx(HiveTurnRow, { key: m.id, turn: m }) : jsx(HiveMemberTone, { key: m.id, m }))
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

/** Slim toggle between the flat feed and grouped-by-agent expandable view. */
function HiveTimelineModeToggle() {
  const mode = useValue($hiveTimelineMode)
  return jsx('div', {
    className: 'flex items-center justify-between gap-2 border-b px-2 py-1',
    'data-hive-mode-toggle': true,
    children: [
      jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: 'Work' }),
      jsx(SegmentedControl, {
        options: [
          { id: 'agents', label: 'By agent' },
          { id: 'flat', label: 'Feed' }
        ],
        value: mode,
        onChange: (v) => { $hiveTimelineMode.set(v === 'agents' ? 'agents' : 'flat'); hivePersist() }
      })
    ]
  })
}

/** Renders the active timeline presentation (grouped or flat). */
function HiveTimelineBody() {
  const mode = useValue($hiveTimelineMode)
  return mode === 'agents' ? jsx(HiveGroupedTimeline, {}) : jsx(HiveTimeline, {})
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
  const ref = useRef(null)
  const [active, setActive] = useState(0)
  const q = open.toLowerCase()
  const matches = useMemo(() => {
    if (!open) return []
    return members.map((m) => '@' + m.profile).concat(['@you']).filter((n) => n.toLowerCase().includes(q)).slice(0, 6)
  }, [open, members])

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
        jsx(Button, { onClick: () => send(composer), disabled: !composer.trim(), size: 'sm', children: jsxs('span', { children: ['Send ', jsx(icons.Send, { size: 12, className: 'inline' })] }) })
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

function HiveRoomMenu() {
  const swarm = useValue($hiveSwarm)
  return jsx(DropdownMenu, {
    children: [
      jsx(DropdownMenuTrigger, { asChild: true, children: jsx(Button, { variant: 'ghost', size: 'sm', 'aria-label': 'Room settings', children: jsxs('span', { className: 'flex items-center gap-1.5', children: [jsx(icons.SlidersHorizontal, { size: 14 }), 'Room settings'] }) }) }),
      jsx(DropdownMenuContent, {
        align: 'end',
        children: [
          jsx('div', { className: 'flex items-center justify-between gap-3 px-2.5 py-1.5', children: [
            jsx('span', { className: 'text-xs', children: 'Agents talk to each other' }),
            jsx(Switch, { checked: swarm, onCheckedChange: (v) => { $hiveSwarm.set(!!v); hivePersist() } })
          ] }),
          jsx('div', { className: 'px-2.5 pb-1 text-muted-foreground', style: HIVE_T.xs, children: swarm ? 'Relays between agents are injected live.' : 'Agents only reply to you — no inter-agent injection.' })
        ]
      })
    ]
  })
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
  const tone = (s) => (s === 'failed' ? 'var(--ui-danger, #e5484d)' : s === 'submitted' ? 'var(--ui-warning, #f5a524)' : undefined)
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



function HivePage() {
  const members = useValue($hiveMembers)
  const title = useValue($hiveTitle)
  const view = useValue($hiveView)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)
  const busyCount = members.filter((m) => ['queued', 'thinking', 'tool', 'streaming'].includes(m.status)).length
  const commitTitle = () => { if (titleDraft.trim()) { $hiveTitle.set(titleDraft.trim().slice(0, 40)); hivePersist() } setEditingTitle(false) }
  const soulProfile = view.startsWith('soul:') ? view.slice(5) : null
  return jsxs('main', {
    'data-hive-page': true,
    className: 'flex h-full min-h-0 min-w-0 flex-col',
    children: [
      jsxs('header', { className: 'flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4', children: [
        jsxs('div', { className: 'min-w-0', children: [
          jsxs('div', { className: 'flex flex-wrap items-center gap-2', children: [
            jsx('h1', { className: 'text-lg font-semibold', children: 'Hive' }),
            editingTitle
              ? jsx(Input, { autoFocus: true, value: titleDraft, className: 'h-7 w-40 text-sm', onChange: (e) => setTitleDraft(e.target.value), onBlur: commitTitle, onKeyDown: (ev) => { if (ev.key === 'Enter') commitTitle() } })
              : jsx(Badge, { variant: 'secondary', className: 'cursor-pointer', onClick: () => { setTitleDraft(title); setEditingTitle(true) }, title: 'Rename room', children: title }),
            jsx(Badge, { variant: busyCount > 0 ? 'default' : 'outline', children: busyCount > 0 ? `${busyCount} active` : 'ready' })
          ] }),
          jsx('p', { className: 'mt-1 max-w-3xl text-sm text-muted-foreground', style: HIVE_T.wrap, children: 'Live agent room — coordinate work, inspect tool activity, and act on any member.' })
        ] }),
        jsxs('div', { className: 'flex flex-wrap items-center gap-1.5', children: [
          jsx(Button, { variant: view === 'scratch' ? 'default' : 'ghost', size: 'sm', onClick: () => $hiveView.set(view === 'scratch' ? 'timeline' : 'scratch'), title: 'Shared team scratchpad', children: jsxs('span', { className: 'flex items-center gap-1.5', children: ['📝', 'Scratchpad'] }) }),
          jsx(HiveAddMember, {}),
          jsx(HiveResetButton, {}),
          jsx(HiveRoomMenu, {})
        ] })
      ] }),
      jsxs('section', { className: 'border-b px-6 py-3', 'data-hive-roster': true, children: [
        jsxs('div', { className: 'flex flex-wrap items-center justify-between gap-2', children: [
          jsx('span', { className: 'text-xs font-semibold uppercase tracking-wide text-muted-foreground', children: 'Crew' }),
          jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: `${members.length + 1}/11 members · click a member for actions` })
        ] }),
        jsx('div', { className: 'mt-2 flex max-h-48 flex-wrap content-start gap-1.5 overflow-auto', children: [
          jsx('div', { className: 'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs select-none opacity-90', 'data-role': 'you', children: [
            jsx(StatusDot, { tone: 'good' }),
            jsx('span', { className: 'font-semibold', children: 'you' }),
            jsx('span', { className: 'text-muted-foreground', style: HIVE_T.xs, children: '(always delivers)' })
          ] }),
          members.map((m) => jsx(HiveRosterChip, { key: m.profile, m }))
        ] })
      ] }),
      jsx('div', { className: 'border-b px-6 py-2 text-xs text-muted-foreground', style: HIVE_T.wrap, children: 'Route directly with @name · use [ask @name] for a focused request · use [all] to broadcast to the room.' }),
      jsx('div', { className: 'flex min-h-0 grow flex-col' , children:
        soulProfile
          ? jsx(HiveSoulEditor, { key: soulProfile, profile: soulProfile })
          : view === 'scratch'
            ? jsx(HiveScratchEditor, {})
            : jsxs('div', { className: 'flex min-h-0 grow flex-col', children: [
                jsx(HiveTimelineModeToggle, {}),
                jsx(HiveTimelineBody, {}),
                jsx(HiveComposer, {})
              ] })
      })
    ]
  })
}

// ── register ────────────────────────────────────────────────────────────────
export default {
  id: HIVE_PLUGIN_ID,
  name: 'Buzz-Hive',

  register(ctx) {
    hiveStorageRef = ctx.storage
    const raw = ctx.storage.get(HIVE_STORAGE_KEY, null)
    if (raw && (!raw.members || !Array.isArray(raw.members))) {
      ctx.storage.set(HIVE_STORAGE_KEY, { title: 'hive', cwd: '', members: [], timeline: [], swarm: true })
    }
    void hiveBootHydrate()

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
      hiveAppendTurnText(m, (e.payload && e.payload.text) || '')
      hiveMarkStatus(e.session_id, 'streaming')
    }))
    disposers.push(host.onEvent('thinking.delta', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      hivePatchOpenTurn(m, { phase: 'thinking' })
      hiveMarkStatus(e.session_id, 'thinking')
    }))
    disposers.push(host.onEvent('reasoning.delta', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      hivePatchOpenTurn(m, { phase: 'thinking' })
      hiveMarkStatus(e.session_id, 'thinking')
    }))
    disposers.push(host.onEvent('tool.start', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
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
        hiveTurnFail(m, (e.error && e.error.message) || (e.payload && e.payload.error) || 'turn failed')
      }))
    } catch { /* event type not offered — fine */ }
    disposers.push(host.onEvent('message.complete', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      // The spine itself holds the streamed text now (single source).
      const open = hiveLastOpenTurn($hiveTimeline.get(), m.profile)
      const buffered = open ? String(open.text || '') : ''
      console.log(`[buzz-hive] turn complete @${m.profile} chars=${buffered.length}`)
      void hiveHandleAssistantDone(e, buffered)
    }))
    disposers.push(host.onEvent('assistant.completed', hiveHandleFallbackCompleted))

    ctx.onDispose(() => {
      hiveOpenPage = null
      disposers.forEach((d) => { try { d() } catch { /* noop */ } })
    })
  }
}
