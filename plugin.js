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
 * v1 (restore point tagged v1-restore-point) — public repo: 0-CYBERDYNE-SYSTEMS-0/buzz-hive
 * v1.1: shared scratchpad, inline SOUL editor, add-popover close fix.
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  icons,
  cn,
  profileColor,
  profileColorSoft,
  haptic
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useMemo, useRef, useState } from 'react'

// ── config ──────────────────────────────────────────────────────────────────
const HIVE_PLUGIN_ID = 'buzz-hive'
const HIVE_MAX_MEMBERS = 10 // profile members (You is extra, pinned)
const HIVE_DIGEST_LEN = 12
const HIVE_STORAGE_KEY = 'hive.v1'
const HIVE_PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const HIVE_DEFAULT_ACCENT = 'hsl(208 72% 56%)' // stable blue for `default`
const HIVE_SCRATCH_INJECT_MAX = 4000 // chars injected into each agent turn
const HIVE_SCRATCH_STORE_MAX = 8000 // chars kept in the shared doc

// ── reactive state ──────────────────────────────────────────────────────────
const $hiveMembers = atom([]) // { profile, sessionId, storedId, status, browser, muted }
const $hiveTimeline = atom([]) // { id, ts, from, kind, text, to? }
const $hiveTitle = atom('hive')
const $hiveCwd = atom('')
const $hiveComposer = atom('')
const $hiveMentionOpen = atom('') // autocomplete filter when composing @name
const $hiveSwarm = atom(true) // agent-to-agent relays on/off
const $hiveScratch = atom('') // shared team scratchpad (markdown), injected every turn
const $hiveView = atom('timeline') // 'timeline' | 'scratch' | 'soul:<profile>'
// Live per-member stream buffers for in-flight feedback.
const $hiveStreams = atom({}) // { [profile]: { text, tool } }
// Completion dedup: session -> last-processed timestamp.
const _hiveProcessed = new Map()
// Profiles whose next turn is the seeded room brief ack (suppressed from TL).
const _hiveSeeded = new Map()

// module refs set in register()
let hiveStorageRef = null

// ── create-CORE-BEGIN (pure functions; sliced verbatim by test.cjs) ────────

const hiveNormalize = (name) => ((name || '').trim() || 'default').toLowerCase()

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
    const body = String(msg.text || '')
    const clipped = body.length > 220 ? body.slice(0, 217) + '…' : body
    return `@${who}${tail}: ${clipped}`
  })
  return rows.length ? rows.join('\n') : '(room is quiet)'
}

/**
 * The room brief seeded into a member session on mint/fresh-context/re-role.
 * `timeline` is passed in for pure/testable construction.
 */
function hiveBuildRoomBrief(member, members, title, isBrowserAgent, timeline) {
  const roster = [...members, { profile: 'you' }]
    .map((m) => '@' + hiveNormalize(m.profile))
    .join(', ')
  const digest = hiveBuildDigest(timeline, HIVE_DIGEST_LEN)
  return (
    `You are @${hiveNormalize(member.profile)}, a member of the Hermes room "${title}".\n` +
    `Roster (use ONLY these names to address members): ${roster}.\n` +
    (isBrowserAgent
      ? `You are the room's BROWSER AGENT. When live or current information is needed, use browser_navigate / browser_snapshot / browser_click / web_extract to fetch and verify it yourself.\n`
      : '') +
    `\nCOORDINATION RULES (follow exactly):\n` +
    `- Direct a teammate privately:  [to @name] message\n` +
    `- Ask one member a question:    [ask @name] question\n` +
    `- Address the whole room:       [all] message\n` +
    `- No marker = the message is addressed to you; answer it.\n` +
    `- Never invent teammates; use only the roster above.\n` +
    `\nSHARED SCRATCHPAD:\n` +
    `You have a shared team scratchpad (markdown) included in every message you receive.\n` +
    `Use it to record progress, decisions, and shared facts the team needs. Keep it concise and current.\n` +
    `To update it for the team, start a line with [scratchpad] followed by the markdown entry you want appended.\n` +
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

/** Extract `[scratchpad] …` blocks from an agent's finished output. */
function hiveExtractScratchEntries(content) {
  const out = []
  const re = /\[scratchpad\]\s*([\s\S]*?)(?=\[scratchpad\]|$)/g
  let m
  while ((m = re.exec(content || '')) !== null) {
    const t = m[1].trim()
    if (t) out.push(t)
  }
  return out
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
    else nodes.push(jsx('code', { key: nodes.length, className: 'rounded bg-muted px-1 py-px text-[0.9em]', children: tok.slice(1, -1) }))
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
          out.push(jsx('div', { key: out.length, className: 'block whitespace-pre-wrap', children: hiveInline(p) }))
        }
    } else {
      out.push(
        jsx('pre', {
          key: out.length,
          className: 'mt-1 mb-1 overflow-x-auto rounded-md bg-muted p-2 text-[0.85em] leading-snug',
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

function hiveMemberBySession(sessionId, profile) {
  const list = $hiveMembers.get()
  return list.find(
    (m) => m.sessionId === sessionId || (profile && hiveNormalize(m.profile) === hiveNormalize(profile))
  )
}

async function hiveDeliverTo(member, text, opts = {}) {
  if (!member || !member.sessionId) {
    host.notify({
      kind: 'warning',
      message: `Hive: @${member ? member.profile : '?'} has no live session — choose "Fresh context".`
    })
    return
  }
  const scratch = $hiveScratch.get()
  const scratchSection = scratch
    ? `\n\n[team scratchpad — shared, keep current]\n${scratch.length > HIVE_SCRATCH_INJECT_MAX ? scratch.slice(0, HIVE_SCRATCH_INJECT_MAX) + '\n…(truncated)' : scratch}`
    : ''
  const payload =
    `[room digest]\n${hiveBuildDigest($hiveTimeline.get(), HIVE_DIGEST_LEN)}${scratchSection}\n\n` +
    (opts.from ? `from @${opts.from}:\n` : '') +
    text
  const busy = member.status === 'streaming' || member.status === 'thinking'
  try {
    await host.request('prompt.submit', {
      session_id: member.sessionId,
      text: payload,
      ...(busy && !opts.system ? { queued: true } : {})
    })
  } catch (err) {
    host.notifyError(err, `Hive: deliver to @${member.profile} failed`)
  }
}

async function hiveDeliverToAll(text, opts) {
  for (const m of $hiveMembers.get()) {
    if (m.muted && opts.from !== 'you') continue // broadcasts skip muted (you always reaches them)
    await hiveDeliverTo(m, text, opts)
  }
}

// last-relay echo guard: prevent A→B→A verbatim loops.
const _hiveLastRelay = new Map()
function hiveGuardEcho(target, text) {
  const key = hiveNormalize(target)
  if (_hiveLastRelay.get(key) === text) return false
  _hiveLastRelay.set(key, text)
  return true
}

function hiveAppendTimeline(msg) {
  const t = $hiveTimeline.get()
  $hiveTimeline.set([...t, { id: Math.random().toString(36).slice(2, 9), ts: Date.now(), ...msg }].slice(-200))
}

/** Append a dated agent entry to the shared scratchpad (agents can't wipe it). */
function hiveAppendScratch(profile, entry) {
  const entryText = (entry || '').trim()
  if (!entryText) return
  const stamp = hiveTime(Date.now())
  const block = `\n\n## @${hiveNormalize(profile)} · ${stamp}\n${entryText}`
  const base = $hiveScratch.get()
  let next = base.trim() ? base + block : `# Hive scratchpad\n\n## @${hiveNormalize(profile)} · ${stamp}\n${entryText}`
  if (next.length > HIVE_SCRATCH_STORE_MAX) {
    next = '…(older entries trimmed)\n' + next.slice(next.length - HIVE_SCRATCH_STORE_MAX)
  }
  $hiveScratch.set(next)
  hiveAppendTimeline({ from: 'system', kind: 'system', text: `📝 @${profile} updated the shared scratchpad`, to: null })
  hivePersist()
}

/** Process a member's finished turn: render, relay (swarm-gated), broadcast. */
async function hiveHandleAssistantDone(e, content) {
  const member = hiveMemberBySession(e.session_id, e.profile)
  if (!member) return

  const now = Date.now()
  const last = _hiveProcessed.get(e.session_id) || 0
  if (now - last < 1500) return
  _hiveProcessed.set(e.session_id, now)

  hiveStreamClear(member.profile)
  hiveMarkStatus(e.session_id, e.profile, 'done')

  if (_hiveSeeded.get(hiveNormalize(member.profile))) {
    _hiveSeeded.delete(hiveNormalize(member.profile))
    return
  }

  const finalText = (content || '').trim()
  if (!finalText) return

  const entries = hiveExtractScratchEntries(finalText)
  // Strip scratchpad blocks so they don't clutter the timeline or get re-relayed.
  const scrubbed = finalText.replace(/\[scratchpad\]\s*[\s\S]*?(?=\[scratchpad\]|$)/g, '').trim()

  const parsed = hiveParseCoordination(scrubbed, $hiveMembers.get().map((m) => m.profile))
  const from = hiveNormalize(member.profile)
  const swarm = $hiveSwarm.get()
  for (const en of entries) hiveAppendScratch(from, en)
  const visible = [parsed.broadcast, ...parsed.relays.map((r) => r.text)].filter(Boolean).join(' ')
  if (visible) hiveAppendTimeline({ from, kind: 'agent', text: visible, to: null })

  for (const r of parsed.relays) {
    const target = $hiveMembers.get().find((m) => hiveNormalize(m.profile) === r.target)
    if (!target) continue
    // Non-looping: never relay to the sender, and respect mute.
    if (!target || hiveNormalize(target.profile) === from) continue
    if (target.muted) continue
    if (!swarm) {
      // Swarm off: log the intent, don't inject into the teammate.
      hiveAppendTimeline({ from, kind: 'relay', text: r.text, to: r.target })
      continue
    }
    if (!hiveGuardEcho(r.target, r.text)) continue
    hiveAppendTimeline({ from, kind: 'relay', text: r.text, to: r.target })
    await hiveDeliverTo(target, r.text, { from })
  }

  if (parsed.broadcast) {
    await hiveDeliverToAll(parsed.broadcast, { from })
  }
}

async function hiveHandleFallbackCompleted(e) {
  const member = hiveMemberBySession(e.session_id, e.profile)
  if (!member) return
  const buffered = $hiveStreams.get()[hiveNormalize(member.profile)]?.text || ''
  const content = (e.content || '').trim() || buffered
  if (!content) return
  await hiveHandleAssistantDone(e, content)
}

function hiveMarkStatus(sessionId, profile, status) {
  const list = $hiveMembers.get()
  const idx = list.findIndex(
    (m) => m.sessionId === sessionId || (profile && hiveNormalize(m.profile) === hiveNormalize(profile))
  )
  if (idx !== -1 && list[idx].status !== status) {
    const next = list.slice()
    next[idx] = { ...next[idx], status }
    $hiveMembers.set(next)
  }
}

// ── stream accumulation ─────────────────────────────────────────────────────

function hiveStreamReset(profile) {
  const key = hiveNormalize(profile)
  const s = $hiveStreams.get()
  $hiveStreams.set({ ...s, [key]: { text: '', tool: '' } })
}
function hiveStreamAppend(profile, text) {
  const key = hiveNormalize(profile)
  const s = $hiveStreams.get()
  $hiveStreams.set({ ...s, [key]: { ...(s[key] || { text: '', tool: '' }), text: (s[key]?.text || '') + (text || '') } })
}
function hiveStreamSetTool(profile, tool) {
  const key = hiveNormalize(profile)
  const s = $hiveStreams.get()
  $hiveStreams.set({ ...s, [key]: { ...(s[key] || { text: '', tool: '' }), tool: tool || '' } })
}
function hiveStreamClear(profile) {
  const key = hiveNormalize(profile)
  const s = $hiveStreams.get()
  if (!(key in s)) return
  const next = { ...s }
  delete next[key]
  $hiveStreams.set(next)
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

/** Mint a live session on a profile and seed it with the room brief. */
async function hiveMintMember(profile) {
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
    const member = { profile: key, sessionId: created.session_id, storedId: created.stored_session_id || null, status: 'idle', browser: false, muted: false }
    $hiveMembers.set([...$hiveMembers.get(), member])
    if (!$hiveMembers.get().some((m) => m.browser)) {
      $hiveMembers.set($hiveMembers.get().map((m) => (hiveNormalize(m.profile) === key ? { ...m, browser: true } : m)))
    }
    const current = $hiveMembers.get().find((m) => hiveNormalize(m.profile) === key)
    _hiveSeeded.set(key, true)
    await hiveDeliverTo(current, hiveBuildRoomBrief(current, $hiveMembers.get(), $hiveTitle.get(), current.browser, $hiveTimeline.get()), { system: true })
    hiveAppendTimeline({ from: 'system', kind: 'system', text: `@${key} joined the room`, to: null })
    hivePersist()
    return current
  } catch (err) {
    host.notifyError(err, `Hive: couldn't start @${key}`)
    return null
  }
}

function hiveRemoveMember(profile) {
  const key = hiveNormalize(profile)
  const remaining = $hiveMembers.get().filter((m) => hiveNormalize(m.profile) !== key)
  // Auto-reassign browser role if the holder was removed and nobody holds it.
  if (remaining.length && !remaining.some((m) => m.browser)) {
    remaining[0] = { ...remaining[0], browser: true }
  }
  $hiveMembers.set(remaining)
  hivePersist()
}

async function hiveFreshContext(profile) {
  const key = hiveNormalize(profile)
  $hiveMembers.set($hiveMembers.get().filter((m) => hiveNormalize(m.profile) !== key))
  await hiveMintMember(key)
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
    await hiveDeliverTo(holder, hiveBuildRoomBrief(holder, next, $hiveTitle.get(), true, $hiveTimeline.get()), { system: true })
  }
  if (demoted && !demoted.browser) {
    const fresh = next.find((m) => hiveNormalize(m.profile) === hiveNormalize(demoted.profile))
    if (fresh) {
      _hiveSeeded.set(hiveNormalize(fresh.profile), true)
      await hiveDeliverTo(fresh, hiveBuildRoomBrief(fresh, next, $hiveTitle.get(), false, $hiveTimeline.get()), { system: true })
    }
  }
  hivePersist()
}

async function hiveStopMember(profile) {
  const m = $hiveMembers.get().find((x) => hiveNormalize(x.profile) === hiveNormalize(profile))
  if (!m || !m.sessionId) return
  try {
    await host.request('session.interrupt', { session_id: m.sessionId })
    hiveMarkStatus(m.sessionId, m.profile, 'idle')
    hiveStreamClear(m.profile)
    hiveAppendTimeline({ from: 'system', kind: 'system', text: `@${m.profile} stopped`, to: null })
  } catch (err) {
    host.notifyError(err, `Hive: couldn't stop @${m.profile}`)
  }
}

/** Reset the whole crew: interrupt all, clear timeline, mint fresh default. */
async function hiveResetRoom() {
  for (const m of $hiveMembers.get()) {
    if (m.sessionId) {
      await host.request('session.interrupt', { session_id: m.sessionId }).catch(() => {})
    }
  }
  _hiveProcessed.clear()
  $hiveTimeline.set([])
  $hiveMembers.set([])
  $hiveSwarm.set(true)
  hivePersist()
  await hiveMintMember('default')
  hiveAppendTimeline({ from: 'system', kind: 'system', text: 'room reset — new crew', to: null })
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
    members: $hiveMembers.get().map((m) => ({ profile: m.profile, storedId: m.storedId, browser: m.browser, muted: m.muted })),
    timeline: $hiveTimeline.get().slice(-120)
  })
}

async function hiveBootHydrate() {
  if (!hiveStorageRef) return
  const saved = hiveStorageRef.get(HIVE_STORAGE_KEY, null)
  if (!saved || !Array.isArray(saved.members) || saved.members.length === 0) {
    await hiveMintMember('default')
    hivePersist()
    return
  }
  $hiveTitle.set(saved.title || 'hive')
  $hiveCwd.set(saved.cwd || '')
  $hiveSwarm.set(typeof saved.swarm === 'boolean' ? saved.swarm : true)
  if (typeof saved.scratch === 'string') $hiveScratch.set(saved.scratch)
  if (Array.isArray(saved.timeline)) $hiveTimeline.set(saved.timeline.slice(-120))
  const hydrated = []
  for (const m of saved.members) {
    const live = { profile: m.profile, storedId: m.storedId || null, browser: !!m.browser, muted: !!m.muted, status: 'idle', sessionId: null }
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
}

// ── UI ──────────────────────────────────────────────────────────────────────

function HiveRosterChip({ m }) {
  const { color, soft } = hiveAccent(m.profile)
  const statusTone = m.status === 'streaming' ? 'warn' : m.status === 'done' ? 'good' : m.status === 'error' ? 'bad' : m.muted ? 'muted' : 'good'
  const sessionRef = m.storedId || m.sessionId || undefined
  const dots = m.status === 'streaming' ? 'warn' : 'muted'
  return jsx(DropdownMenu, {
    children: [
      jsx(DropdownMenuTrigger, {
        asChild: true,
        children: jsx('div', {
          'data-role': 'member',
          style: { borderColor: color, background: soft },
          title: m.muted ? `@${m.profile} (muted)` : `@${m.profile} · session ${sessionRef || 'pending'}`,
          className: cn(
            'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs select-none',
            m.browser && 'ring-1',
            m.muted && 'opacity-60'
          ),
          children: [
            jsx('span', { className: 'size-1.5 rounded-full', style: { background: color } }),
            jsx('span', { style: { color }, className: 'font-medium', children: '@' + m.profile }),
            m.browser && jsx(icons.Globe, { size: 12, style: { color } }),
            m.muted && jsx('span', { className: 'text-[9px] uppercase tracking-wide text-muted-foreground', children: 'muted' }),
            m.status === 'streaming' && jsx('span', { className: 'animate-pulse text-[10px] leading-none', children: '…' })
          ]
        })
      }),
      jsx(DropdownMenuContent, {
        align: 'start',
        children: [
          sessionRef && jsx(DropdownMenuItem, { onSelect: () => host.navigate('/' + encodeURIComponent(sessionRef)), children: jsxs('span', { children: ['Open session', jsx('span', { className: 'ml-2 text-[10px] text-muted-foreground', children: sessionRef.slice(0, 12) + '…' })] }) }),
          m.status !== 'idle' && jsx(DropdownMenuItem, { onSelect: () => void hiveStopMember(m.profile), children: 'Stop (interrupt)' }),
          jsx(DropdownMenuItem, { onSelect: () => { $hiveView.set('soul:' + m.profile); haptic('tap') }, children: 'Edit SOUL / persona' }),
          jsx(DropdownMenuItem, { onSelect: () => void hiveToggleMute(m.profile), children: m.muted ? 'Unmute' : 'Mute' }),
          jsx(DropdownMenuItem, { onSelect: () => void hiveSetBrowser(m.profile, !m.browser), children: m.browser ? 'Release browser control' : 'Grant browser control' }),
          jsx(DropdownMenuItem, { onSelect: () => void hiveFreshContext(m.profile), children: 'Fresh context (new session)' }),
          jsx(DropdownMenuSeparator, {}),
          jsx(DropdownMenuItem, { variant: 'destructive', onSelect: () => hiveRemoveMember(m.profile), children: 'Remove from room' })
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

function HiveMemberTone({ from, to, text, ts }) {
  const isYou = from === 'you'
  const accent = isYou ? hiveAccent('you') : hiveAccent(from)
  const isSystem = from === 'system'
  const label = isSystem ? 'hive' : `@${from}${to ? ' → @' + to : ''}`
  return jsx('div', {
    className: 'group flex gap-2 rounded-md py-1 pl-1.5',
    style: isSystem ? undefined : { borderLeft: `2px solid ${accent.color}`, background: isYou ? undefined : accent.soft },
    children: isSystem
      ? jsx('div', { className: 'text-[11px] italic leading-snug text-muted-foreground', children: text })
      : jsxs('div', { className: 'flex min-w-0 flex-col gap-0.5', children: [
          jsxs('div', { className: 'flex items-center gap-2 text-[10px] uppercase tracking-wide', children: [
            jsx('span', { style: { color: accent.color }, className: 'font-semibold', children: label }),
            jsx('time', { className: 'text-[9px] text-muted-foreground/70', children: hiveTime(ts) })
          ] }),
          jsx('div', { className: 'min-w-0 text-sm leading-relaxed text-foreground', children: hiveRenderText(text) })
        ] })
  })
}

function HiveLiveRow() {
  const streams = useValue($hiveStreams)
  const members = useValue($hiveMembers)
  const active = members.filter((m) => m.status === 'streaming')
  if (active.length === 0) return null
  return jsx('div', {
    className: 'flex flex-col gap-1 px-2 pb-1',
    'data-hive-live': true,
    children: active.map((m) => {
      const { color, soft } = hiveAccent(m.profile)
      const s = streams[hiveNormalize(m.profile)] || { text: '', tool: '' }
      const preview = s.text.trim().replace(/\s+/g, ' ').slice(0, 180)
      return jsx('div', {
        key: m.profile,
        className: 'flex items-start gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs',
        style: { borderColor: color, background: soft },
        children: [
          jsx('span', { style: { color }, className: 'shrink-0 font-semibold', children: '@' + m.profile }),
          jsx('span', { className: 'shrink-0 animate-pulse text-muted-foreground', children: '•••' }),
          jsx('span', { className: 'min-w-0 flex-1 truncate text-muted-foreground', children: preview || (s.tool ? `using ${s.tool}…` : 'thinking…') })
        ]
      })
    })
  })
}

function HiveTimeline() {
  const timeline = useValue($hiveTimeline)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [timeline.length])
  return jsx(ScrollArea, {
    ref,
    className: 'h-full grow min-h-0',
    children: jsx('div', {
      className: 'flex flex-col gap-1 p-2',
      'data-hive-timeline': true,
      children: [
        ...(timeline.length
          ? timeline.map((m) => jsx(HiveMemberTone, { key: m.id, from: m.from, to: m.to, text: m.text, ts: m.ts }))
          : [jsx('div', { key: 'empty', className: 'p-6 text-center text-xs text-muted-foreground', children: 'No activity yet. Message @default or add agents to start the crew.' })]),
        jsx(HiveLiveRow, { key: 'live' })
      ]
    })
  })
}

function HiveComposer() {
  const composer = useValue($hiveComposer)
  const members = useValue($hiveMembers)
  const open = useValue($hiveMentionOpen)
  const ref = useRef(null)
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
    const parsed = hiveRouteUserPost(text, members)
    if (parsed.relays.length) {
      for (const r of parsed.relays) {
        const target = members.find((m) => hiveNormalize(m.profile) === r.target)
        if (target) {
          hiveAppendTimeline({ from: 'you', kind: 'relay', text: r.text, to: r.target })
          hiveMarkStatus(target.sessionId, target.profile, 'streaming')
          hiveStreamReset(target.profile)
          void hiveDeliverTo(target, r.text, { from: 'you' })
        }
      }
    } else {
      const targets = members.filter((m) => !(m.muted && parsed.broadcast))
      hiveAppendTimeline({ from: 'you', kind: 'user', text: parsed.broadcast, to: null })
      for (const m of targets) { hiveMarkStatus(m.sessionId, m.profile, 'streaming'); hiveStreamReset(m.profile) }
      void hiveDeliverToAll(parsed.broadcast, { from: 'you' })
    }
    hivePersist()
  }

  const onChange = (v) => {
    $hiveComposer.set(v)
    const toks = v.split(/\s+/)
    $hiveMentionOpen.set((toks[toks.length - 1] || '').startsWith('@') ? toks[toks.length - 1].slice(1) : '')
  }

  return jsxs('div', {
    className: 'border-t p-2 flex flex-col gap-1.5',
    'data-hive-composer': true,
    children: [
      open && matches.length > 0 && jsx('div', { className: 'flex flex-wrap gap-1 pb-1', children: matches.map((name) =>
        jsx(Button, {
          key: name, variant: 'outline', size: 'sm', onClick: () => {
            const toks = $hiveComposer.get().split(/\s+/)
            toks[toks.length - 1] = name + ' '
            $hiveComposer.set(toks.join(' ')); $hiveMentionOpen.set(''); ref.current?.focus?.()
          }, children: name
        })
      ) }),
      jsx(Textarea, {
        ref, value: composer, rows: 2, className: 'resize-none text-sm',
        placeholder: 'Direct a member with @name, or broadcast to the room…',
        'data-testid': 'hive-composer',
        onChange: (ev) => onChange(ev.target.value),
        onKeyDown: (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(composer) } }
      }),
      jsxs('div', { className: 'flex items-center justify-between gap-2', children: [
        jsx('span', { className: 'text-[10px] text-muted-foreground', children: 'Enter ↵ send · Shift+↵ newline · @ to tag' }),
        jsx(Button, { onClick: () => send(composer), disabled: !composer.trim(), size: 'sm', children: jsxs('span', { children: ['Send ', jsx(icons.Send, { size: 12, className: 'inline' })] }) })
      ] })
    ]
  })
}

function HiveRoomMenu() {
  const swarm = useValue($hiveSwarm)
  const [confirmReset, setConfirmReset] = useState(false)
  return jsx(DropdownMenu, {
    children: [
      jsx(DropdownMenuTrigger, { asChild: true, children: jsx(Button, { variant: 'ghost', size: 'icon-micro', 'aria-label': 'Room menu', children: jsx(icons.SlidersHorizontal, { size: 14 }) }) }),
      jsx(DropdownMenuContent, {
        align: 'end',
        children: confirmReset
          ? [
              jsx('div', { className: 'px-2.5 py-1.5 text-xs', children: 'Reset the whole crew? Interrupts all members, clears history, starts a fresh @default.' }),
              jsx('div', { className: 'flex gap-1.5 px-2.5 pb-1.5', children: [
                jsx(Button, { size: 'sm', variant: 'default', onClick: () => { setConfirmReset(false); void hiveResetRoom() }, children: 'Reset room' }),
                jsx(Button, { size: 'sm', variant: 'ghost', onClick: () => setConfirmReset(false), children: 'Cancel' })
              ] })
            ]
          : [
              jsx('div', { className: 'flex items-center justify-between gap-3 px-2.5 py-1.5', children: [
                jsx('span', { className: 'text-xs', children: 'Agents talk to each other' }),
                jsx(Switch, { checked: swarm, onCheckedChange: (v) => { $hiveSwarm.set(!!v); hivePersist() } })
              ] }),
              jsx('div', { className: 'px-2.5 pb-1 text-[10px] text-muted-foreground', children: swarm ? 'Relays between agents are injected live.' : 'Agents only reply to you — no inter-agent injection.' }),
              jsx(DropdownMenuSeparator, {}),
              jsx(DropdownMenuItem, { variant: 'destructive', onSelect: () => setConfirmReset(true), children: 'Reset room…' })
            ]
      })
    ]
  })
}

function HiveCreateForm({ onDone, onCancel }) {
  const [name, setName] = useState('')
  const [cloneFrom, setCloneFrom] = useState('default')
  const [soul, setSoul] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const trimmed = name.trim()
  const invalid = trimmed !== '' && !hiveIsValidProfileName(trimmed)
  const busy = status === 'saving' || status === 'done'
  async function submit() {
    if (!trimmed || invalid) { setError(invalid ? 'Lowercase letters, digits, - or _ (start letter/digit).' : 'Pick a name first.'); return }
    setStatus('saving'); setError('')
    try { await hiveCreateProfile(trimmed, cloneFrom || null, soul); setStatus('done'); onDone(trimmed) }
    catch (err) { setStatus('error'); setError(err instanceof Error ? err.message : 'Create failed.') }
  }
  return jsxs('div', { className: 'flex flex-col gap-1.5 border-t p-2', 'data-hive-create': true, children: [
    jsx('div', { className: 'text-xs font-medium', children: 'New profile' }),
    jsx(Input, { autoFocus: true, placeholder: 'profile-name', value: name, 'aria-invalid': invalid, onChange: (e) => setName(e.target.value), className: 'text-xs' }),
    jsx(Input, { placeholder: 'Clone from (default)', value: cloneFrom, onChange: (e) => setCloneFrom(e.target.value), className: 'text-xs' }),
    jsx(Textarea, { placeholder: 'Optional SOUL.md / persona', value: soul, rows: 2, onChange: (e) => setSoul(e.target.value), className: 'resize-none text-xs' }),
    error && jsx('div', { className: 'text-[11px] text-destructive', children: error }),
    jsxs('div', { className: 'flex items-center justify-between', children: [
      jsx(Button, { variant: 'ghost', size: 'sm', onClick: onCancel, disabled: busy, children: 'Cancel' }),
      jsx(Button, { size: 'sm', onClick: () => void submit(), disabled: busy || !trimmed, children: status === 'saving' ? 'Creating…' : 'Create & join' })
    ] })
  ] })
}

function HiveRenderOptions({ opts, onPick, onNew }) {
  return jsxs('div', { className: 'flex flex-col gap-0.5 max-h-48 overflow-auto', children: [
    opts.length ? opts.map((p) => {
      const { color } = hiveAccent(p.name)
      return jsx(Button, { key: p.name, variant: 'ghost', size: 'sm', className: 'justify-start text-xs', onClick: () => onPick(p), children: jsxs('div', { className: 'flex items-center gap-1.5', children: [
        jsx('span', { className: 'size-1.5 rounded-full', style: { background: color } }),
        jsx('span', { style: { color }, children: '@' + p.name }),
        jsx('span', { className: 'text-[10px] text-muted-foreground', children: p.model || 'no model' })
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
  const opts = profiles.filter((p) => !present.has(hiveNormalize(p.name))).filter((p) => p.name.includes(q.toLowerCase())).slice(0, 8)

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
        ? jsx(HiveCreateForm, { onDone: (name) => { setCreating(false); setOpen(false); setQ(''); void hiveMintMember(name); void hiveFetchProfiles().then(setProfiles) }, onCancel: () => setCreating(false) })
        : jsxs('div', { className: 'flex flex-col gap-1.5', children: [
            jsx(Input, { autoFocus: true, placeholder: 'Search profiles…', value: q, onChange: (e) => setQ(e.target.value), className: 'mb-1 text-xs' }),
            loadState === 'error'
              ? jsx('div', { className: 'flex items-center justify-between p-1', children: [jsx('span', { className: 'text-[11px] text-muted-foreground', children: 'Couldn’t load profiles.' }), jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => { load(); setOpen(true) }, children: 'Retry' })] })
              : jsx(HiveRenderOptions, { opts, onPick: pick, onNew: () => setCreating(true) })
          ] })
    ] }),
    jsx(Button, { variant: 'ghost', size: 'sm', onClick: toggle, disabled: members.length >= HIVE_MAX_MEMBERS && !open, children: jsxs('span', { children: [jsx(icons.Plus, { size: 13, className: 'mr-1 inline' }), 'Add'] }) })
  ] })
}

/** Shared team scratchpad — markdown, injected into every agent turn. */
function HiveScratchEditor() {
  const scratch = useValue($hiveScratch)
  const [draft, setDraft] = useState(scratch)
  const len = draft.length
  return jsxs('div', { className: 'flex h-full min-h-0 flex-col gap-2 p-2', 'data-hive-scratch': true, children: [
    jsxs('div', { className: 'flex items-center justify-between text-xs', children: [
      jsx('span', { className: 'font-medium', children: 'Shared scratchpad' }),
      jsx('span', { className: 'text-[10px] text-muted-foreground', children: `${len} chars · injected every turn · agents append with [scratchpad]` })
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
      jsx('div', { className: 'rounded-md border border-primary/30 bg-primary/5 p-1.5 text-[10px] text-muted-foreground', children: '✓ Scratchpad pointer is in this SOUL.' }),
    loaded
      ? jsx(Textarea, {
          value: draft,
          onChange: (e) => setDraft(e.target.value),
          className: 'min-h-0 w-full grow resize-none rounded-md border bg-background p-2 font-mono text-xs',
          placeholder: '(blank SOUL — add a persona here, then remember it to drive the room)'
        })
      : jsx('div', { className: 'p-4 text-xs text-muted-foreground', children: 'Loading…' }),
    error && jsx('div', { className: 'text-[11px] text-destructive', children: error }),
    jsxs('div', { className: 'flex items-center justify-between gap-1.5', children: [
      jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => { setDraft((d) => { const cur = d.trim() ? d + '\n\n' : ''; return cur + HIVE_SOUL_SCRATCH_HINT }); setHint(true) }, title: 'Adds a pointer to the shared scratchpad', children: 'Insert scratchpad pointer' }),
      jsx(Button, { size: 'sm', onClick: async () => { try { await hiveUpdateSoul(profile, draft); host.notify({ kind: 'success', message: `@${profile} SOUL saved.` }); $hiveView.set('timeline') } catch (e) { setError((e && e.message) || 'Save failed') } }, children: 'Save SOUL' })
    ] })
  ] })
}

function HivePane() {
  const members = useValue($hiveMembers)
  const title = useValue($hiveTitle)
  const view = useValue($hiveView)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)
  const commitTitle = () => { if (titleDraft.trim()) { $hiveTitle.set(titleDraft.trim().slice(0, 40)); hivePersist() } setEditingTitle(false) }
  const soulProfile = view.startsWith('soul:') ? view.slice(5) : null
  return jsxs('div', {
    'data-hive-pane': true,
    className: 'flex h-full flex-col bg-background',
    style: { minHeight: 0 },
    children: [
      jsxs('div', { className: 'flex items-center justify-between gap-2 border-b px-3 py-2', children: [
        jsxs('div', { className: 'flex min-w-0 items-center gap-2', children: [
          jsx('span', { className: 'text-sm font-semibold', children: 'Hive' }),
          editingTitle
            ? jsx(Input, { autoFocus: true, value: titleDraft, className: 'h-6 w-24 text-xs', onChange: (e) => setTitleDraft(e.target.value), onBlur: commitTitle, onKeyDown: (ev) => { if (ev.key === 'Enter') commitTitle() } })
            : jsx(Badge, { variant: 'secondary', className: 'cursor-pointer', onClick: () => { setTitleDraft(title); setEditingTitle(true) }, title: 'Rename room', children: title }),
          jsx(Badge, { variant: 'outline', children: members.length + 1 + '/11' })
        ] }),
        jsxs('div', { className: 'flex items-center gap-1', children: [
          jsx(Button, { variant: view === 'scratch' ? 'default' : 'ghost', size: 'sm', onClick: () => $hiveView.set(view === 'scratch' ? 'timeline' : 'scratch'), title: 'Shared team scratchpad', children: '📝' }),
          jsx(HiveAddMember, {}),
          jsx(HiveRoomMenu, {})
        ] })
      ] }),
      jsx('div', { className: 'flex flex-col gap-1.5 border-b p-2', 'data-hive-roster': true, children: [
        jsx('div', { className: 'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs select-none opacity-90', 'data-role': 'you', children: [
          jsx(StatusDot, { tone: 'good' }),
          jsx('span', { className: 'font-semibold', children: 'you' }),
          jsx('span', { className: 'text-[10px] text-muted-foreground', children: '(always delivers)' })
        ] }),
        members.map((m) => jsx(HiveRosterChip, { key: m.profile, m }))
      ] }),
      soulProfile
        ? jsx(HiveSoulEditor, { key: soulProfile, profile: soulProfile })
        : view === 'scratch'
          ? jsx(HiveScratchEditor, {})
          : jsxs('div', { className: 'flex min-h-0 grow flex-col', children: [jsx(HiveTimeline, {}), jsx(HiveComposer, {})] })
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
    disposers.push(ctx.register({
      id: 'pane', area: 'panes', title: 'hive',
      data: { placement: 'right', width: '380px', minWidth: '300px', maxWidth: '560px' },
      render: () => jsx(HivePane, {})
    }))
    disposers.push(ctx.register({
      id: 'palette-open', area: 'palette',
      data: {
        id: 'buzz-hive-open', label: 'Hive: open the agent room',
        keywords: ['hive', 'buzz', 'room', 'agents', 'multi'],
        run: () => host.notify({ kind: 'info', message: 'Hive room is the right-hand pane.' })
      }
    }))

    disposers.push(host.onEvent('message.start', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      console.log(`[buzz-hive] turn start @${m.profile} session=${e.session_id}`)
      hiveStreamReset(m.profile)
      hiveMarkStatus(e.session_id, e.profile, 'streaming')
    }))
    disposers.push(host.onEvent('message.delta', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      hiveStreamAppend(m.profile, (e.payload && e.payload.text) || '')
      hiveMarkStatus(e.session_id, e.profile, 'streaming')
    }))
    disposers.push(host.onEvent('thinking.delta', (e) => hiveMarkStatus(e.session_id, e.profile, 'streaming')))
    disposers.push(host.onEvent('reasoning.delta', (e) => hiveMarkStatus(e.session_id, e.profile, 'streaming')))
    disposers.push(host.onEvent('tool.start', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      hiveMarkStatus(e.session_id, e.profile, 'streaming')
      hiveStreamSetTool(m.profile, (e.payload && (e.payload.tool || e.payload.name)) || '')
    }))
    disposers.push(host.onEvent('message.complete', (e) => {
      const m = hiveMemberBySession(e.session_id, e.profile)
      if (!m) return
      const buffered = $hiveStreams.get()[hiveNormalize(m.profile)]?.text || ''
      console.log(`[buzz-hive] turn complete @${m.profile} chars=${buffered.length}`)
      void hiveHandleAssistantDone(e, buffered)
    }))
    disposers.push(host.onEvent('assistant.completed', hiveHandleFallbackCompleted))

    ctx.onDispose(() => disposers.forEach((d) => { try { d() } catch { /* noop */ } }))
  }
}
