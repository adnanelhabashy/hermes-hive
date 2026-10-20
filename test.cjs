#!/usr/bin/env node
/**
 * Buzz-Hive logic harness. Slices the pure-function core out of plugin.js
 * (between the CORE markers) and asserts its contracts without loading the
 * Hermes desktop SDK. Run: node test.cjs
 */
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, 'plugin.js'), 'utf8')
const start = src.indexOf('// ── create-CORE-BEGIN')
const end = src.indexOf('// --CORE-END--')
if (start === -1 || end === -1) {
  console.error('FAIL: CORE markers not found in plugin.js')
  process.exit(1)
}
const core = src.slice(src.indexOf('\n', start) + 1, end)

// The slice is self-contained: every constant the pure core reads is declared
// inside the CORE markers, so nothing here re-declares (and silently drifts
// from) a real plugin value.
const factory = new Function(
  `${core}\nreturn { hiveParseCoordination, hiveBuildDigest, hiveBuildRoomBrief, hiveRouteUserPost, hiveExtractMentions, hiveNormalize, hiveIsValidProfileName, hiveExtractScratchEntries, hiveIsMemberSession, hiveNormalizeContextMode, hiveBuildHandoffCapsule, hiveBuildContextEnvelope, HIVE_WORKING_MODELS, hiveModelKey, hiveResolveModelEntry, hiveModelAssignmentBody, hiveCatalogToEntries, hiveMergeCatalogEntries, hiveGroupEntriesByProvider, hiveEntryDisplayLabel, hiveResolveModelLabel, hiveGroupTimeline, hiveToggleAgentExpanded, HIVE_TURN_OPEN, hiveTurnInit, hiveTurnPatch, hiveTurnAddTool, hiveTurnFinishTool, hiveTurnAppendText, hiveTurnFold, hiveTurnError, hiveTurnDigestBody, hiveLastOpenTurn, hiveActivityPreview, hiveGroupUnseen, hivePlanDeliveries, hiveParseWorkItems, hiveApplyWorkItems, hiveParseScratchOps, hiveScratchApply, hiveScratchSections, hiveScrubMarkers, hiveBuildStandingHeader, hiveFormatWorkItems, hiveClipHead, hiveTruncatePayload, hiveCapTimeline, hiveLastProfileEntry, hiveMemberStatus, hiveStatusTone, hiveStatusLabel, hiveStatusGlyph, hiveStatusBusy, hiveTaskStatusLabel, hiveTaskStatusTone, hiveSortTasks, hiveCardKind, hiveTimelineToCards, hiveActivityCards, hiveFilterCards, hiveBatchDeltas,  hiveCardTitle,  hiveOrderMembers, hiveApplyLeader, hiveCollapseLeaders, hiveLeaderBadge, hiveRosterSummary, hiveRoomStatus, hiveWorkSummary, hiveOpenItemCount, hiveLastActivityTs, hiveNeedsSession, HIVE_TIMELINE_MEM, HIVE_TIMELINE_KEEP, HIVE_PAYLOAD_MAX, HIVE_DELTA_WINDOW_MS, HIVE_ACTIVITY_KINDS }`
)
const {
  hiveParseCoordination,
  hiveBuildDigest,
  hiveBuildRoomBrief,
  hiveRouteUserPost,
  hiveExtractMentions,
  hiveNormalize,
  hiveIsValidProfileName,
  hiveExtractScratchEntries,
  hiveIsMemberSession,
  hiveNormalizeContextMode,
  hiveBuildHandoffCapsule,
  hiveBuildContextEnvelope,
  HIVE_WORKING_MODELS,
  hiveModelKey,
  hiveResolveModelEntry,
  hiveModelAssignmentBody,
  hiveCatalogToEntries,
  hiveMergeCatalogEntries,
  hiveGroupEntriesByProvider,
  hiveEntryDisplayLabel,
  hiveResolveModelLabel,
  hiveGroupTimeline,
  hiveToggleAgentExpanded,
  HIVE_TURN_OPEN,
  hiveTurnInit,
  hiveTurnPatch,
  hiveTurnAddTool,
  hiveTurnFinishTool,
  hiveTurnAppendText,
  hiveTurnFold,
  hiveTurnError,
  hiveTurnDigestBody,
  hiveLastOpenTurn,
  hiveActivityPreview,
  hiveGroupUnseen,
  hivePlanDeliveries,
  hiveParseWorkItems,
  hiveApplyWorkItems,
  hiveParseScratchOps,
  hiveScratchApply,
  hiveScratchSections,
  hiveScrubMarkers,
  hiveBuildStandingHeader,
  hiveFormatWorkItems,
  hiveClipHead,
  hiveTruncatePayload,
  hiveCapTimeline,
  hiveLastProfileEntry,
  hiveMemberStatus,
  hiveStatusTone,
  hiveStatusLabel,
  hiveStatusGlyph,
  hiveStatusBusy,
  hiveTaskStatusLabel,
  hiveTaskStatusTone,
  hiveSortTasks,
  hiveCardKind,
  hiveTimelineToCards,
  hiveActivityCards,
  hiveFilterCards,
  hiveBatchDeltas,
  hiveCardTitle,
  hiveOrderMembers,
  hiveApplyLeader,
  hiveCollapseLeaders,
  hiveLeaderBadge,
  hiveRosterSummary,
  hiveRoomStatus,
  hiveWorkSummary,
  hiveOpenItemCount,
  hiveLastActivityTs,
  hiveNeedsSession,
  HIVE_TIMELINE_MEM,
  HIVE_TIMELINE_KEEP,
  HIVE_PAYLOAD_MAX,
  HIVE_DELTA_WINDOW_MS,
  HIVE_ACTIVITY_KINDS
} = factory()

let pass = 0
let fail = 0
function assert(name, cond, extra) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✗ ${name}${extra ? ' — ' + JSON.stringify(extra) : ''}`)
  }
}
function deep(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  assert(name, a === e, { actual: a, expected: e })
}

console.log('desktop surface contract')
{
  assert('Hive registers a first-class route', src.includes("area: ROUTES_AREA") && src.includes("path: HIVE_ROUTE"))
  assert('Hive registers a native sidebar entry', src.includes("area: SIDEBAR_NAV_AREA") && src.includes("label: 'Hive'"))
  assert('Hive keeps a command-palette opener', src.includes("area: PALETTE_AREA") && src.includes('host.navigate(HIVE_ROUTE)'))
  assert('Hive is no longer a shared right pane', !src.includes("area: 'panes'") && !src.includes("placement: 'right'"))
  assert('Hive wraps long prose and tokens', src.includes("overflowWrap: 'anywhere'") && src.includes('break-words'))
  assert('Hive listens to the canonical tool completion event', src.includes("host.onEvent('tool.complete'") && !src.includes("host.onEvent('tool.completed'"))
  assert('Seeded turns close their activity spine', src.includes("hiveFoldTurn(member, '')"))
  // Queue intent + the ask bit used to be asserted by grepping this file for
  // `queued: busy` / `ask: r.ask`. That pins the implementation's spelling
  // rather than its behavior, and it broke the moment the routing moved behind
  // hivePlanDeliveries. Both are now covered behaviorally further down.
  assert('Follow-scroll binds to the Radix viewport', src.includes("data-slot=\"scroll-area-viewport\""))
  assert('Context policy persists in hive.v2', src.includes("const HIVE_STORAGE_KEY = 'hive.v2'") && src.includes('contextMode: hiveNormalizeContextMode(m.contextMode)'))
  assert('Legacy hive.v1 state is read for migration', src.includes("HIVE_LEGACY_STORAGE_KEY = 'hive.v1'") && src.includes('savedV2 || hiveStorageRef.get(HIVE_LEGACY_STORAGE_KEY'))
  assert('Every member exposes the context mode control', src.includes('data-hive-context-mode') && src.includes('Standard') && src.includes('Minimal'))
  assert('New profile form defaults to Minimal', src.includes("useState('minimal')") && src.includes('New clones default to Minimal.'))
  assert('Delivery uses the context envelope policy', src.includes('hiveBuildContextEnvelope({') && src.includes('mode: member.contextMode'))
  // F-10: the leader reads at a glance. The crown is inline SVG (never an emoji
  // glyph, which brings its own colour and its own font), it is wired to the
  // pure badge descriptor, and it is named for assistive tech.
  const crownSrc = src.slice(src.indexOf('function TsLeadCrown'), src.indexOf('function TsAgentRow'))
  assert('the leader row renders the crown from the badge descriptor',
    src.includes('lead ? jsx(TsLeadCrown, {}) : null') && src.includes('const lead = hiveLeaderBadge(m)'))
  assert('the crown is an inline SVG and carries no emoji',
    !!crownSrc && crownSrc.includes("jsxs('svg'") && crownSrc.includes("jsx('path'")
      && !/\p{Extended_Pictographic}/u.test(crownSrc))
  assert('the crown is labelled "Team lead" for assistive tech',
    src.includes("'aria-label': 'Team lead'") && src.includes("jsx('title', { children: 'Team lead' })"))
  assert('the crown takes its colour from the theme amber ramp, never a literal',
    src.includes('.ts-lead-crown{flex:0 0 auto;display:block;color:var(--ts-warn)}'))
  // The mint path runs the same exclusive rule as the row toggle (F-10).
  assert('add-as-leader clears the previous leader in the same write',
    src.includes('$hiveMembers.set(options.leader === true ? hiveApplyLeader(minted, key, true) : minted)'))
  // A room persisted by the pre-fix build can hold several leads; boot must
  // collapse them, or the upgrade re-paints the bug on the reporter's own room.
  assert('hydrating a saved room collapses it to one leader',
    src.includes('$hiveMembers.set(hiveCollapseLeaders(hydrated))'))
}

console.log('hiveParseCoordination')
{
  const roster = ['builder', 'frontier', 'default']
  deep('bracket relay after-bracket', hiveParseCoordination('[to @builder] sanity-check the CTA', roster), {
    relays: [{ target: 'builder', text: 'sanity-check the CTA', ask: false }],
    broadcast: ''
  })
  deep('ask short form inside brackets', hiveParseCoordination('[ask @frontier: what is the price?]', roster), {
    relays: [{ target: 'frontier', text: 'what is the price?', ask: true }],
    broadcast: ''
  })
  deep('ask long form after bracket', hiveParseCoordination('[ask @frontier] what is the price?', roster), {
    relays: [{ target: 'frontier', text: 'what is the price?', ask: true }],
    broadcast: ''
  })
  deep('broadcast all', hiveParseCoordination('[all] heads up, room status changed', roster), {
    relays: [],
    broadcast: 'heads up, room status changed'
  })
  deep('multiple relays in one message', hiveParseCoordination('[to @builder] check CTA [to @frontier] check pricing', roster), {
    relays: [
      { target: 'builder', text: 'check CTA', ask: false },
      { target: 'frontier', text: 'check pricing', ask: false }
    ],
    broadcast: ''
  })
  deep('unknown name stays broadcast', hiveParseCoordination('[to @ghost] hi there', roster), {
    relays: [],
    broadcast: 'hi there'
  })
  deep('prose with no directives is broadcast', hiveParseCoordination('just a normal message', roster), {
    relays: [],
    broadcast: 'just a normal message'
  })
  deep('relay + trailing prose', hiveParseCoordination('[to @builder] do it. Also tell everyone.', roster), {
    relays: [{ target: 'builder', text: 'do it. Also tell everyone.', ask: false }],
    broadcast: ''
  })
  deep('bracket relay with ask before', hiveParseCoordination('starting note [ask @frontier] price?', roster), {
    relays: [{ target: 'frontier', text: 'price?', ask: true }],
    broadcast: 'starting note'
  })
}

console.log('hiveExtractMentions')
{
  const roster = ['builder', 'frontier', 'default']
  deep('bare mention found', hiveExtractMentions('hey @builder check this', roster), ['builder'])
  deep('multiple bare mentions deduped', hiveExtractMentions('@builder and @builder and @frontier go', roster), ['builder', 'frontier'])
  deep('non-roster mention ignored', hiveExtractMentions('ping @ghost', roster), [])
  deep('mention inside word not matched', hiveExtractMentions('foo@builderbar', roster), [])
  deep('mention at start', hiveExtractMentions('@builder go now', roster), ['builder'])
}

console.log('hiveRouteUserPost')
{
  const members = [{ profile: 'builder' }, { profile: 'frontier' }, { profile: 'default' }]
  deep('bare mention routes to member, mention stripped', hiveRouteUserPost('@builder check the email', members), {
    relays: [{ target: 'builder', text: 'check the email', ask: false }],
    broadcast: ''
  })
  deep('no mention broadcasts', hiveRouteUserPost('anyone home?', members), {
    relays: [],
    broadcast: 'anyone home?'
  })
  deep('bracket directive wins over bare mention', hiveRouteUserPost('[to @frontier] plan it. cc @builder', members), {
    relays: [{ target: 'frontier', text: 'plan it. cc @builder', ask: false }],
    broadcast: ''
  })
}

console.log('hiveBuildDigest')
{
  const tl = [
    { from: 'you', text: 'draft the email' },
    { from: 'frontier', text: 'done' },
    { from: 'builder', text: 'checked', to: 'frontier' }
  ]
  const d = hiveBuildDigest(tl, 12)
  assert('digest contains authors', d.includes('@you') && d.includes('@frontier') && d.includes('@builder'))
  assert('digest truncates long bodies', hiveBuildDigest([{ from: 'x', text: 'a'.repeat(500) }], 12).length < 250)
  deep('empty digest fallback', hiveBuildDigest([], 12), '(room is quiet)')
}

console.log('hiveBuildRoomBrief')
{
  const members = [{ profile: 'builder' }, { profile: 'default' }]
  const b = hiveBuildRoomBrief({ profile: 'builder' }, members, 'hive', false, [])
  assert('brief names the member', b.includes('@builder'))
  assert('brief lists roster incl. you', b.includes('@default') && b.includes('@you'))
  assert('brief teaches grammar', b.includes('[to @name]') && b.includes('[ask @name]') && b.includes('[all]'))
  assert('non-browser brief omits browser role', !b.includes('BROWSER AGENT'))
  const bb = hiveBuildRoomBrief({ profile: 'builder' }, members, 'hive', true, [])
  assert('browser brief includes browser role', bb.includes('BROWSER AGENT') && bb.includes('browser_navigate'))
}

console.log('hive context policy envelopes')
{
  deep('missing context mode defaults to standard', hiveNormalizeContextMode(), 'standard')
  deep('invalid context mode defaults to standard', hiveNormalizeContextMode('verbose'), 'standard')
  deep('minimal context mode normalizes', hiveNormalizeContextMode('MINIMAL'), 'minimal')

  const member = { profile: 'builder', status: 'idle', contextMode: 'minimal' }
  const capsule = hiveBuildHandoffCapsule(member, 'you', 'Check the CTA', { ask: true })
  assert('minimal capsule names sender and target', capsule.includes('from: @you') && capsule.includes('to: @builder'))
  assert('minimal capsule carries ask and message', capsule.includes('ask: true') && capsule.endsWith('Check the CTA'))
  assert('minimal capsule does not contain digest marker', !capsule.includes('[room digest]'))

  const timeline = [{ from: 'frontier', text: 'keep this digest row' }]
  const standard = hiveBuildContextEnvelope({ mode: 'standard', member, sender: 'you', text: 'Do standard work', timeline, scratch: '# shared facts' })
  assert('standard envelope includes digest', standard.includes('[room digest]') && standard.includes('keep this digest row'))
  assert('standard envelope includes scratchpad', standard.includes('[team scratchpad — shared working memory, keep it current]'))

  const minimal = hiveBuildContextEnvelope({ mode: 'minimal', member, sender: 'you', text: 'Do minimal work', timeline, scratch: '# shared facts' })
  assert('minimal envelope includes handoff capsule', minimal.includes('[HIVE HANDOFF]') && minimal.includes('Do minimal work'))
  assert('minimal envelope omits digest, keeps scratchpad', !minimal.includes('[room digest]') && minimal.includes('[team scratchpad'))
  const system = hiveBuildContextEnvelope({ mode: 'minimal', member, sender: 'system', text: 'Seed room brief', timeline, scratch: '# shared facts', system: true })
  deep('system envelope remains the seeded brief', system, 'Seed room brief')
}

console.log('hiveNormalize + name validation')
{
  deep('normalize empty → default', hiveNormalize(''), 'default')
  deep('normalize trims + lower', hiveNormalize('  Builder '), 'builder')
  assert('valid name ok', hiveIsValidProfileName('builder-2_x'))
  assert('reject uppercase', !hiveIsValidProfileName('Builder'))
  assert('reject leading digit ok (allowed)', hiveIsValidProfileName('2build'))
  assert('reject space', !hiveIsValidProfileName('my profile'))
  assert('reject empty', !hiveIsValidProfileName(''))
  assert('reject >64 chars', !hiveIsValidProfileName('a'.repeat(70)))
  assert('reject leading dash', !hiveIsValidProfileName('-builder'))
}

console.log('hiveExtractScratchEntries')
{
  deep('single scratch entry', hiveExtractScratchEntries('doing work\n[scratchpad]\nProgress: shipped v1\n\nmore notes'), ['Progress: shipped v1\n\nmore notes'])
  deep('multiple entries', hiveExtractScratchEntries('[scratchpad] a [scratchpad] b'), ['a', 'b'])
  deep('no entry', hiveExtractScratchEntries('just a normal reply'), [])
  assert('relay stays out of scratch extraction', hiveExtractScratchEntries('[to @builder] check this').length === 0)
}

console.log('hiveIsMemberSession (strict session isolation)')
{
  const member = { profile: 'default', sessionId: 'hive-session-1' }
  assert('matches same session', hiveIsMemberSession(member, 'hive-session-1') === true)
  assert('REGRESSION: same profile, different session → must NOT match', hiveIsMemberSession(member, 'main-chat-session') === false)
  assert('different profile, different session → no match', hiveIsMemberSession({ ...member, profile: 'other' }, 'x') === false)
  assert('null session id → no match', hiveIsMemberSession(member, null) === false)
  assert('null member → no match', hiveIsMemberSession(null, 'hive-session-1') === false)
}

console.log('HIVE_WORKING_MODELS (curated manifest)')
{
  assert('manifest is a non-empty array', Array.isArray(HIVE_WORKING_MODELS) && HIVE_WORKING_MODELS.length >= 5)
  assert('every entry has provider + model + label', HIVE_WORKING_MODELS.every((e) => e.provider && e.model && e.label))
  const keys = new Set(HIVE_WORKING_MODELS.map((e) => hiveModelKey(e)))
  assert('no duplicate provider::model keys', keys.size === HIVE_WORKING_MODELS.length)
  assert('qwen-token-plan primary present', HIVE_WORKING_MODELS.some((e) => e.provider === 'custom:qwen-token-plan'))
  assert('no dead deepseek-v4-flash (bare) in manifest', !HIVE_WORKING_MODELS.some((e) => e.model === 'deepseek-v4-flash'))
}

console.log('hiveModelKey + hiveResolveModelEntry + hiveModelAssignmentBody')
{
  deep('key normalizes provider', hiveModelKey({ provider: 'Cline-Pass', model: 'cline-pass/qwen3.7-max' }), 'cline-pass::cline-pass/qwen3.7-max')
  deep('key empty on null', hiveModelKey(null), '')
  const match = hiveResolveModelEntry('custom:qwen-token-plan', 'qwen3.8-max-preview')
  assert('resolves known entry', !!match && match.label.includes('Qwen 3.8'))
  assert('unknown combo → undefined', hiveResolveModelEntry('nope', 'nope-model') === undefined)
  const body = hiveModelAssignmentBody(HIVE_WORKING_MODELS[0], 'frontend')
  deep('assignment body has scope main + profile + base_url', body, {
    provider: 'custom:qwen-token-plan',
    model: 'qwen3.8-max-preview',
    scope: 'main',
    base_url: 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic',
    profile: 'frontend'
  })
  assert('null entry → null body', hiveModelAssignmentBody(null, 'x') === null)
}

console.log('live catalog → picker entries (all providers/models)')
{
  const providers = [
    { slug: 'openrouter', name: 'OpenRouter', models: ['poolside/laguna-s-2.1:free', 'anthropic/claude-sonnet-4'] },
    { slug: 'nous', name: 'Nous', models: ['z-ai/glm-5.2'] },
    { slug: 'custom:qwen-token-plan', name: 'Qwen Token Plan', api_url: 'https://token-plan.example/anthropic', models: ['qwen3.8-max-preview'] },
    { slug: 'unconfigured', name: 'Unconfigured', models: [] },
    { slug: 'broken', name: 'Broken' } // no models key
  ]
  const flat = hiveCatalogToEntries(providers)
  deep('flattens each provider model', flat.map((e) => `${e.provider}::${e.model}`), [
    'openrouter::poolside/laguna-s-2.1:free',
    'openrouter::anthropic/claude-sonnet-4',
    'nous::z-ai/glm-5.2',
    'custom:qwen-token-plan::qwen3.8-max-preview'
  ])
  assert('skips empty/missing model arrays', flat.length === 4)
  assert('carries api_url as base_url for user-defined providers', flat.find((e) => e.provider === 'custom:qwen-token-plan').base_url === 'https://token-plan.example/anthropic')
  assert('null providers → empty', Array.isArray(hiveCatalogToEntries(null)) && hiveCatalogToEntries(null).length === 0)

  const merged = hiveMergeCatalogEntries(flat, HIVE_WORKING_MODELS)
  const keys = new Set(merged.map((e) => hiveModelKey(e)))
  assert('merge dedupes provider::model', keys.size === merged.length)
  assert('curated entry wins label for qwen-token-plan', merged.find((e) => e.provider === 'custom:qwen-token-plan' && e.model === 'qwen3.8-max-preview').label.includes('Qwen 3.8'))
  assert('catalog-only model is appended (openrouter sonnet)', merged.some((e) => e.provider === 'openrouter' && e.model === 'anthropic/claude-sonnet-4'))
  assert('every catalog model reachable', merged.some((e) => e.provider === 'nous' && e.model === 'z-ai/glm-5.2'))

  const groups = hiveGroupEntriesByProvider(merged)
  assert('groups contain every provider', groups.length >= 4)
  const openrouter = groups.find((g) => g.provider === 'openrouter')
  assert('group preserves catalog models', !!openrouter && openrouter.entries.length === 2)

  deep('display label prefers curated', hiveEntryDisplayLabel({ provider: 'x', model: 'm', label: 'Nice' }), 'Nice')
  deep('display label falls back to model', hiveEntryDisplayLabel({ provider: 'x', model: 'm' }), 'm')
  deep('curated label resolution', hiveResolveModelLabel('custom:qwen-token-plan', 'qwen3.8-max-preview', flat), 'Qwen 3.8 Max (token plan)')
  assert('catalog label resolution for uncurated model', hiveResolveModelLabel('openrouter', 'anthropic/claude-sonnet-4', providers) === 'anthropic/claude-sonnet-4')
  assert('unknown → empty label', hiveResolveModelLabel('nope', 'nope', providers) === '')
}

console.log('hiveGroupTimeline (grouped/expandable view)')
{
  const tl = [
    { id: 'a', from: 'you', text: 'draft the email' },
    { id: 'b', from: 'frontier', text: 'done' },
    { id: 'c', from: 'builder', text: 'checked', to: 'frontier' },
    { id: 'd', from: 'frontier', text: 'follow-up' },
    { id: 'e', from: 'system', text: 'reset', kind: 'system' }
  ]
  const g = hiveGroupTimeline(tl)
  deep('groups by agent preserving order', g.map((x) => x.profile), ['you', 'frontier', 'builder', 'system'])
  deep('intra-agent order preserved', g[1].messages.map((m) => m.id), ['b', 'd'])
  deep('system group is last, contains system msgs', g[3].messages.map((m) => m.id), ['e'])
  deep('empty timeline → no groups', hiveGroupTimeline([]), [])
  const g2 = hiveGroupTimeline([{ id: 'x', from: 'FRONTIER', text: 'hi' }])
  deep('profile normalized to lowercase', g2[0].profile, 'frontier')
}

console.log('hiveToggleAgentExpanded')
{
  deep('empty map expands a profile', hiveToggleAgentExpanded({}, 'frontier'), { frontier: true })
  deep('toggle off when already expanded', hiveToggleAgentExpanded({ frontier: true }, 'frontier'), { frontier: false })
  deep('force true', hiveToggleAgentExpanded({}, 'frontier', true), { frontier: true })
  deep('force false', hiveToggleAgentExpanded({ frontier: true }, 'frontier', false), { frontier: false })
  deep('normalizes profile key', hiveToggleAgentExpanded({}, 'Frontier'), { frontier: true })
}

console.log('turn-entry reducer (activity spine, SPEC B1-B4)')
{
  const T0 = 1000000000000
  const t = hiveTurnInit('Frontier', T0)
  deep('init kind/phase/from normalize', [t.kind, t.phase, t.from, t.ts], ['turn', 'thinking', 'frontier', T0])
  deep('init has empty text/tools/error', [t.text, t.tools.length, t.error, t.doneAt], ['', 0, '', 0])
  assert('init id unique-ish', typeof t.id === 'string' && t.id.length > 0)

  const withTool = hiveTurnAddTool(t, 'browser_navigate', T0)
  deep('tool start sets phase+tool and records open tool', [withTool.phase, withTool.tool, withTool.tools.length, withTool.tools[0].status], ['tool', 'browser_navigate', 1, 'run'])
  const dedup = hiveTurnAddTool(withTool, 'browser_navigate', T0 + 10)
  deep('tool dedup while running keeps one record', dedup.tools.length, 1)

  const fin = hiveTurnFinishTool(withTool, 'browser_navigate', T0 + 4000)
  deep('tool finish computes duration + returns to streaming', [fin.phase, fin.tool, fin.tools[0].dur, fin.tools[0].status], ['streaming', '', 4000, 'ok'])
  const er = hiveTurnFinishTool(withTool, 'browser_navigate', T0 + 1000, 'err')
  deep('tool finish can mark err', er.tools[0].status, 'err')

  const queued = hiveTurnPatch(t, { phase: 'queued', queuedSince: T0 })
  const app = hiveTurnAppendText(queued, 'hello')
  deep('text append while queued STAYS queued', app.phase, 'queued')
  deep('text appended', app.text, 'hello')
  const streaming = hiveTurnAppendText(hiveTurnPatch(t, { phase: 'streaming' }), 'hi ')
  deep('text append while streaming flips to streaming', streaming.phase, 'streaming')

  const folded = hiveTurnFold(withTool, 'final answer', T0 + 5000)
  deep('fold marks done, sets text, clears tool', [folded.phase, folded.text, folded.tool, folded.doneAt], ['done', 'final answer', '', T0 + 5000])
  deep('fold defaults to streamed text', hiveTurnFold(hiveTurnAppendText(t, 'streamed'), undefined, T0).text, 'streamed')

  const bad = hiveTurnError(withTool, 'boom', T0 + 5)
  deep('error marks phase+message', [bad.phase, bad.error, bad.tool], ['error', 'boom', ''])

  deep('open phases list', HIVE_TURN_OPEN, ['queued', 'thinking', 'tool', 'streaming'])
  deep('digest body: done text', hiveTurnDigestBody(folded).slice(0, 13), 'final answer')
  deep('digest body: error prefix', hiveTurnDigestBody(bad).startsWith('(error)'), true)
  deep('digest body: working', hiveTurnDigestBody(t).startsWith('(working'), true)
  deep('digest body: working mentions tool', hiveTurnDigestBody(withTool), '(working · browser_navigate)')

  const tl = [folded, hiveTurnAppendText(t, 'x'), hiveTurnPatch(hiveTurnAppendText(t, 'y'), { phase: 'streaming' }), { from: 'bob', text: 'msg' }]
  deep('lastOpenTurn finds latest open for profile', hiveLastOpenTurn(tl, 'FRONTIER').text, 'y')
  deep('lastOpenTurn ignores done/error', hiveLastOpenTurn([folded, bad, { from: 'frontier', kind: 'agent', text: 'z' }], 'frontier'), null)
  deep('lastOpenTurn no match → null', hiveLastOpenTurn([], 'x'), null)

  deep('activityPreview: live text clipped', hiveActivityPreview(hiveTurnAppendText(t, 'A'.repeat(120))).length, 90)
  deep('activityPreview: tool', hiveActivityPreview(withTool), 'using browser_navigate…')
  deep('activityPreview: error', hiveActivityPreview(bad), 'boom')
  deep('activityPreview: empty working', hiveActivityPreview(t), 'working…')
  deep('groupUnseen counts after ts', hiveGroupUnseen([{ from: 'frontier', ts: 100 }, { from: 'frontier', ts: 200 }, { from: 'bob', ts: 300 }], 'frontier', 150), 1)
}

console.log('hiveBuildDigest with turn entries')
{
  const tl = [
    { from: 'frontier', kind: 'turn', phase: 'streaming', text: 'in progress', tool: '' },
    { from: 'builder', kind: 'turn', phase: 'done', text: 'shipped it', tool: '' },
    { from: 'builder', kind: 'relay', text: 'check this', to: 'frontier' }
  ]
  const d = hiveBuildDigest(tl, 12)
  assert('digest shows live turn as working', d.includes('(working)'))
  assert('digest shows done turn text', d.includes('shipped it'))
  assert('digest keeps relay arrow', d.includes('→ @frontier'))
}

// ── structure, not substrings ──────────────────────────────────────────────
// The envelope shipped for months with its newlines written as `\\n` inside
// template literals — a literal backslash-n. Every assertion above passed
// because they all ask `.includes('[marker]')`, and a marker is still present
// in a mangled one-line blob. These assert the SHAPE of what an agent reads.
console.log('envelope structure (regression: literal \\n)')
{
  const member = { profile: 'builder', contextMode: 'standard' }
  const members = [{ profile: 'builder' }, { profile: 'frontier' }]
  const env = hiveBuildContextEnvelope({
    mode: 'standard', member, members, title: 'hive', mission: 'ship the audit',
    sender: 'frontier', text: 'please review', timeline: [{ from: 'you', text: 'kick off' }],
    scratch: '## Decisions\n- use Postgres'
  })
  assert('envelope contains real newlines', env.split('\n').length > 6)
  assert('envelope contains NO literal backslash-n', !env.includes('\\n'))
  assert('envelope pins the mission', env.includes('mission: ship the audit'))
  assert('envelope ships the roster every turn', env.includes('@builder') && env.includes('@frontier') && env.includes('@you'))
  assert('scratchpad body survives as its own line', env.split('\n').includes('- use Postgres'))
  assert('sender attribution is its own line', env.split('\n').includes('from @frontier:'))

  const capsule = hiveBuildHandoffCapsule({ profile: 'builder' }, 'you', 'do it', { ask: true })
  assert('capsule is fielded across lines', capsule.split('\n').length >= 7)
  assert('capsule has NO literal backslash-n', !capsule.includes('\\n'))

  const mini = hiveBuildContextEnvelope({
    mode: 'minimal', member: { profile: 'builder' }, members, title: 'hive',
    mission: 'ship the audit', sender: 'you', text: 'do it', scratch: '- shared fact'
  })
  assert('minimal still carries mission + roster', mini.includes('ship the audit') && mini.includes('@frontier'))
  assert('minimal still carries the scratchpad', mini.includes('- shared fact'))
  assert('minimal omits the digest', !mini.includes('[room digest]'))

  assert('clip keeps the HEAD of the doc', hiveClipHead('MISSION-FIRST then filler', 12).startsWith('MISSION-FIRS'))
}

console.log('hivePlanDeliveries (the routing seam)')
{
  const members = [{ profile: 'builder' }, { profile: 'frontier' }, { profile: 'quiet', muted: true }]
  const bare = { relays: [], broadcast: 'done, found three issues' }

  const self = hivePlanDeliveries({ from: 'builder', parsed: bare, members, swarm: true })
  assert('a broadcast never returns to its sender', !self.deliveries.some((d) => d.target === 'builder'))
  assert('sender exclusion is reported, not silent', self.dropped.some((d) => d.target === 'builder' && d.reason === 'self'))
  assert('a broadcast still reaches the other members', self.deliveries.some((d) => d.target === 'frontier'))
  assert('muted members are skipped for agent traffic', !self.deliveries.some((d) => d.target === 'quiet'))

  const off = hivePlanDeliveries({ from: 'builder', parsed: bare, members, swarm: false })
  deep('swarm off stops agent broadcasts too, not just relays', off.deliveries, [])

  const user = hivePlanDeliveries({ from: 'you', parsed: bare, members, swarm: false })
  assert('the user is never gated by the swarm toggle', user.deliveries.length > 0)
  assert('the user still reaches muted members', user.deliveries.some((d) => d.target === 'quiet'))

  const deep3 = hivePlanDeliveries({ from: 'builder', parsed: bare, members, swarm: true, hops: 3 })
  deep('hop budget stops a runaway chain', deep3.deliveries, [])
  assert('hop exhaustion is reported', deep3.dropped.some((d) => d.reason === 'hop-budget'))

  const hop = hivePlanDeliveries({ from: 'builder', parsed: bare, members, swarm: true, hops: 0 })
  assert('deliveries carry an incremented hop count', hop.deliveries.every((d) => d.hops === 1))

  const many = Array.from({ length: 9 }, (_, i) => ({ profile: 'm' + i }))
  const capped = hivePlanDeliveries({ from: 'you', parsed: bare, members: many, swarm: true, maxFanout: 4 })
  deep('fan-out is capped', capped.deliveries.length, 4)
  assert('the capped remainder is reported', capped.dropped.some((d) => d.reason === 'fanout-cap'))

  const ask = hivePlanDeliveries({
    from: 'you', members, swarm: true,
    parsed: { relays: [{ target: 'builder', text: 'check the CTA', ask: true }], broadcast: '' }
  })
  deep('the ask bit survives routing', ask.deliveries[0].ask, true)
  assert('unknown targets are dropped with a reason', hivePlanDeliveries({
    from: 'you', members, swarm: true,
    parsed: { relays: [{ target: 'ghost', text: 'hi' }], broadcast: '' }
  }).dropped.some((d) => d.reason === 'not-in-room'))
}

console.log('work items (the validation spine)')
{
  const p = hiveParseWorkItems('[task @builder] audit the payment flow')
  deep('task marker parses', p.tasks, [{ target: 'builder', title: 'audit the payment flow' }])

  let ids = 0
  const mkId = () => 'id' + ++ids
  const a = hiveApplyWorkItems([], { from: 'you', parsed: p, ts: 1, mkId })
  deep('task is assigned to its owner', a.tasks[0].owner, 'builder')
  deep('a new task is open', a.tasks[0].status, 'open')
  assert('the owner is told how to report done', a.routes[0].target === 'builder' && a.routes[0].text.includes('[done #id1]'))

  const r = hiveApplyWorkItems(a.tasks, { from: 'you', parsed: hiveParseWorkItems('[review @frontier #id1] check the maths'), ts: 2, mkId })
  deep('reviewer is recorded', r.tasks[0].reviewer, 'frontier')
  assert('the reviewer is told how to vote', r.routes[0].target === 'frontier' && r.routes[0].text.includes('[verdict #id1 pass]'))

  const d = hiveApplyWorkItems(r.tasks, { from: 'builder', parsed: hiveParseWorkItems('[done #id1] fixed the rounding'), ts: 3, mkId })
  deep('submitting moves the item to submitted', d.tasks[0].status, 'submitted')
  assert('submission routes to the reviewer, not the owner', d.routes[0].target === 'frontier')
  assert('the reviewer receives the actual work', d.routes[0].text.includes('fixed the rounding'))

  const v = hiveApplyWorkItems(d.tasks, { from: 'frontier', parsed: hiveParseWorkItems('[verdict #id1 fail] off by one'), ts: 4, mkId })
  deep('a failed verdict marks the item failed', v.tasks[0].status, 'failed')
  assert('a failure routes back to the owner to redo', v.routes[0].target === 'builder' && v.routes[0].text.includes('off by one'))

  const ok = hiveApplyWorkItems(d.tasks, { from: 'frontier', parsed: hiveParseWorkItems('[verdict #id1 pass] maths check out'), ts: 5, mkId })
  deep('a passing verdict marks the item passed', ok.tasks[0].status, 'passed')

  // Regression: an unreviewed submission read hiveNormalize('') -> 'default'
  // and was routed to whichever member is literally named `default`.
  const unassigned = hiveApplyWorkItems(
    [{ id: 'u1', title: 't', from: 'you', owner: 'builder', reviewer: '', status: 'open', artifact: '' }],
    { from: 'builder', parsed: hiveParseWorkItems('[done #u1] shipped'), ts: 7, mkId }
  )
  assert('an empty reviewer never resolves to @default', !unassigned.routes.some((r) => r.target === 'default'))
  deep('an unreviewed submission reports back to the requester', unassigned.routes.map((r) => r.target), ['you'])

  const solo = hiveApplyWorkItems(
    [{ id: 'x1', title: 't', from: 'builder', owner: 'builder', reviewer: '', status: 'submitted', artifact: '' }],
    { from: 'builder', parsed: hiveParseWorkItems('[verdict #x1 pass] looks good to me'), ts: 6, mkId }
  )
  deep('self-verdicts route nowhere (no self-approval loop)', solo.routes, [])

  assert('open items are surfaced to their owner', hiveFormatWorkItems(a.tasks, { profile: 'builder' }).includes('#id1'))
  deep('passed items stop nagging', hiveFormatWorkItems(ok.tasks, { profile: 'builder' }), '')
  deep('uninvolved members see no board', hiveFormatWorkItems(a.tasks, { profile: 'frontier' }), '')

  // Timeline cards (§3.5): every effect that ACTUALLY applied, and nothing else.
  deep('a task assignment emits one task card', a.cards.map((c) => c.kind), ['task'])
  deep('the task card carries its work id', a.cards[0].workId, 'id1')
  deep('the task card names the owner', a.cards[0].owner, 'builder')
  assert('the task card reads as prose (no bracket marker to re-parse)',
    !a.cards[0].text.includes('[') && a.cards[0].text.includes('audit the payment flow'))
  deep('a review request emits a review card', r.cards.map((c) => c.kind), ['review'])
  deep('the review card names the reviewer', r.cards[0].reviewer, 'frontier')
  deep('a submission emits a done card', d.cards.map((c) => c.kind), ['done'])
  deep('the done card carries the artifact', d.cards[0].artifact, 'fixed the rounding')
  deep('the done card is in review state', d.cards[0].status, 'submitted')
  deep('a failed verdict emits one review card', v.cards.map((c) => c.kind), ['review'])
  deep('the failure card records the verdict', v.cards[0].verdict, 'fail')
  deep('the failure card records the reason', v.cards[0].reason, 'off by one')
  deep('the failure card is FAILED', v.cards[0].status, 'failed')
  deep('a passing verdict emits a pass card', ok.cards[0].verdict, 'pass')
  deep('a passing verdict is PASSED', ok.cards[0].status, 'passed')
  // Unknown ids are ignored by the state machine, so they must emit nothing.
  const orphan = hiveApplyWorkItems(a.tasks, { from: 'builder', parsed: hiveParseWorkItems('[done #nope] ghost'), ts: 8, mkId })
  deep('an unknown work id emits no card', orphan.cards, [])
  deep('marker-free output emits no cards', hiveApplyWorkItems([], { from: 'you', parsed: hiveParseWorkItems('just talking'), ts: 9, mkId }).cards, [])
  const longDone = hiveApplyWorkItems(
    [{ id: 'l1', title: 't', from: 'you', owner: 'builder', reviewer: '', status: 'open', artifact: '' }],
    { from: 'builder', parsed: hiveParseWorkItems('[done #l1] ' + 'x'.repeat(900)), ts: 10, mkId })
  deep('a long card artifact is clipped with an ellipsis', longDone.cards[0].artifact.length, 401)
}

console.log('scratchpad sections + corrections')
{
  deep('plain scratchpad op lands in Notes', hiveParseScratchOps('[scratchpad] a fact')[0].section, 'Notes')
  deep('sectioned op keeps its section', hiveParseScratchOps('[scratchpad:Decisions] use pg')[0].section, 'Decisions')
  deep('bang form marks a replacement', hiveParseScratchOps('[scratchpad:Decisions!] use sqlite')[0].replace, true)
  assert('a scratchpad body stops at the next marker',
    !hiveParseScratchOps('[scratchpad] a fact [to @builder] go')[0].body.includes('@builder'))

  const one = hiveScratchApply('', { section: 'Decisions', body: 'use pg' }, 'builder', '10:00')
  assert('applying creates the section', one.includes('## Decisions') && one.includes('use pg'))
  assert('entries are attributed', one.includes('@builder'))

  const two = hiveScratchApply(one, { section: 'Decisions', body: 'add an index' }, 'frontier', '10:01')
  deep('appending keeps both facts', hiveScratchSections(two)[0].body.split('\n').length, 2)

  const fixed = hiveScratchApply(two, { section: 'Decisions', body: 'use sqlite', replace: true }, 'frontier', '10:02')
  assert('the bang form CORRECTS rather than accumulates', fixed.includes('use sqlite') && !fixed.includes('use pg'))
  deep('a correction leaves one line standing', hiveScratchSections(fixed)[0].body.split('\n').length, 1)

  const multi = hiveScratchApply(fixed, { section: 'Risks', body: 'cold start' }, 'builder', '10:03')
  deep('separate sections coexist', hiveScratchSections(multi).length, 2)
}

console.log('hiveScrubMarkers')
{
  const out = hiveScrubMarkers('Here is the result. [scratchpad] noted [task @builder] do it [verdict #a1 pass] fine')
  assert('prose survives scrubbing', out.includes('Here is the result.'))
  assert('markers are removed from the timeline text', !out.includes('[task') && !out.includes('[scratchpad') && !out.includes('[verdict'))
  deep('a marker-free reply is untouched', hiveScrubMarkers('just a normal reply'), 'just a normal reply')

  // Regression: only the bracket was stripped, so the task TITLE survived as
  // prose and got broadcast to the whole room on top of being assigned.
  deep('a pure task assignment leaves no prose to broadcast',
    hiveScrubMarkers('[task @builder] audit the payment flow'), '')
  deep('a pure verdict leaves no prose to broadcast',
    hiveScrubMarkers('[verdict #a1 fail] off-by-one on line 42'), '')
  assert('the submission summary is not re-broadcast',
    !hiveScrubMarkers('[done #a1] fixed the rounding error').includes('rounding'))
  deep('genuine prose alongside a marker still survives',
    hiveScrubMarkers('Handing this over.\n[task @builder] audit the flow'), 'Handing this over.')
}

// ── Phase 1 (Team Studio) pure logic ────────────────────────────────────────

console.log('hiveMemberStatus (derived — never stored)')
{
  const live = { profile: 'builder', sessionId: 's1' }
  deep('a live session with no turn is idle', hiveMemberStatus(live, []), 'idle')
  assert('a sessionless member is offline even with activity',
    hiveMemberStatus({ profile: 'builder', sessionId: null }, [{ kind: 'turn', from: 'builder', phase: 'streaming' }]) === 'offline')
  deep('a session with no turn is idle', hiveMemberStatus(live, []), 'idle')

  const start = hiveTurnInit('builder', 1000)
  deep('an open thinking turn reads thinking', hiveMemberStatus(live, [start]), 'thinking')
  deep('streaming reads busy', hiveMemberStatus(live, [hiveTurnAppendText(start, 'hi')]), 'busy')

  const withTool = hiveTurnAddTool(start, 'terminal', 1100)
  deep('a running tool reads working', hiveMemberStatus(live, [withTool]), 'working')
  deep('a finished tool returns to busy',
    hiveMemberStatus(live, [hiveTurnFinishTool(withTool, 'terminal', 1200, 'ok')]), 'busy')
  deep('thinking after a tool reads thinking',
    hiveMemberStatus(live, [{ ...hiveTurnFinishTool(withTool, 'terminal', 1200, 'ok'), phase: 'thinking' }]), 'thinking')

  const failed = hiveTurnError(start, 'boom', 1300)
  deep('a failed turn reads error', hiveMemberStatus(live, [failed]), 'error')
  deep('a new turn clears the error',
    hiveMemberStatus(live, [failed, hiveTurnInit('builder', 1400)]), 'thinking')
  // Only the member's OWN records count — never a teammate's.
  deep('another member\'s error does not mark this one',
    hiveMemberStatus(live, [hiveTurnError(hiveTurnInit('frontier', 1), 'boom', 2)]), 'idle')
}

console.log('status vocabulary + task labels')
{
  deep('busy maps to the good tone', hiveStatusTone('busy'), 'good')
  deep('error maps to the bad tone', hiveStatusTone('error'), 'bad')
  deep('an unknown status falls back to muted', hiveStatusTone('nonsense'), 'muted')
  deep('offline has a label', hiveStatusLabel('offline'), 'offline')
  deep('working has a glyph', hiveStatusGlyph('working'), '⚙')
  deep('idle has no glyph', hiveStatusGlyph('idle'), '')
  assert('busy/thinking/working are the mid-turn set',
    hiveStatusBusy('busy') && hiveStatusBusy('thinking') && hiveStatusBusy('working'))
  assert('idle/offline/error are not mid-turn',
    !hiveStatusBusy('idle') && !hiveStatusBusy('offline') && !hiveStatusBusy('error'))

  deep('open → OPEN', hiveTaskStatusLabel({ status: 'open' }), 'OPEN')
  deep('submitted → IN REVIEW', hiveTaskStatusLabel({ status: 'submitted' }), 'IN REVIEW')
  deep('passed → PASSED', hiveTaskStatusLabel({ status: 'passed' }), 'PASSED')
  deep('failed → FAILED', hiveTaskStatusLabel({ status: 'failed' }), 'FAILED')
  deep('an unknown task status still reads OPEN', hiveTaskStatusLabel({}), 'OPEN')
  assert('a failed task is toned by a theme var, never a literal',
    hiveTaskStatusTone({ status: 'failed' }).startsWith('var(--ts-'))
  assert('no task tone contains a color literal',
    ['open', 'submitted', 'passed', 'failed'].every((s) => /^var\(--ts-[a-z-]+\)$/.test(hiveTaskStatusTone({ status: s }))))

  const sorted = hiveSortTasks([
    { id: 'a', status: 'passed', ts: 5 },
    { id: 'b', status: 'open', ts: 9 },
    { id: 'c', status: 'submitted', ts: 7 },
    { id: 'd', status: 'failed', ts: 1 }
  ]).map((t) => t.id)
  deep('open work sorts first, settled last', sorted, ['b', 'c', 'd', 'a'])
}

console.log('hiveTimelineToCards / hiveActivityCards (event → card mapping)')
{
  const timeline = [
    { id: '1', kind: 'system', from: 'system', text: 'held a relay' },
    { id: '2', kind: 'turn', from: 'builder', phase: 'done', text: 'done', tools: [], ts: 1 },
    { id: '3', kind: 'turn', from: 'builder', phase: 'error', error: 'boom', tools: [], ts: 2 },
    { id: '4', kind: 'turn', from: 'builder', phase: 'streaming', text: '…', tools: [{ name: 'terminal', status: 'run' }], ts: 3 },
    { id: '5', kind: 'relay', from: 'builder', to: 'frontier', text: 'psst', ts: 4 },
    { id: '6', kind: 'user', from: 'you', text: 'hello', ts: 5 },
    { id: '7', kind: 'task', from: 'you', text: 'task #a1 → @builder', ts: 6 },
    { id: '8', kind: 'done', from: 'builder', text: 'submitted', ts: 7 },
    { id: '9', kind: 'review', from: 'you', text: 'verdict pass', ts: 8 }
  ]
  const cards = hiveTimelineToCards(timeline)
  deep('every entry maps to exactly one card', cards.length, timeline.length)
  deep('card order follows the timeline', cards.map((c) => c.kind),
    ['system', 'agent', 'error', 'tool', 'directed', 'user', 'task', 'done', 'review'])

  deep('a settled turn is an agent card', hiveCardKind({ kind: 'turn', phase: 'done', tools: [] }), 'agent')
  deep('a turn that used tools is a tool card', hiveCardKind({ kind: 'turn', phase: 'done', tools: [{ name: 'x' }] }), 'tool')
  deep('a relay without a target is not directed', hiveCardKind({ kind: 'relay', from: 'a', to: null }), 'agent')
  deep('an unknown kind falls back to a prose card', hiveCardKind({ kind: 'mystery' }), 'agent')
  deep('a missing entry is a system card', hiveCardKind(null), 'system')

  const activity = hiveActivityCards(timeline)
  deep('activity drops prose bubbles', activity.map((c) => c.kind),
    ['system', 'error', 'tool', 'task', 'done', 'review'])
  assert('activity never includes agent/user/directed prose',
    !activity.some((c) => c.kind === 'agent' || c.kind === 'user' || c.kind === 'directed'))
  deep('the activity kind list is the documented one',
    HIVE_ACTIVITY_KINDS.join(','), 'tool,task,done,review,error,system')

  deep('the timeline filter searches prose',
    hiveFilterCards(cards, 'psst').map((c) => c.kind), ['directed'])
  deep('the filter searches work ids',
    hiveFilterCards(cards, '#a1').map((c) => c.kind), ['task'])
  deep('the filter searches who spoke',
    hiveFilterCards(cards, 'frontier').map((c) => c.kind), ['directed'])
  deep('a blank filter keeps everything', hiveFilterCards(cards, '  ').length, cards.length)
  deep('a filter that matches nothing is empty', hiveFilterCards(cards, 'zzz').length, 0)
}

console.log('hiveBatchDeltas (stream coalescing)')
{
  const one = hiveBatchDeltas({ text: '', count: 0 }, 'Hel')
  const two = hiveBatchDeltas(one, 'lo')
  deep('chunks accumulate in order', two.text, 'Hello')
  deep('the batch counts real chunks', two.count, 2)
  const empty = hiveBatchDeltas(two, '')
  deep('an empty chunk does not change the text', empty.text, 'Hello')
  deep('an empty chunk does not count as a batch', empty.count, 2)
  const nullChunk = hiveBatchDeltas(two, null)
  deep('a null chunk does not count as a batch', nullChunk.count, 2)
  deep('a missing buffer starts clean', hiveBatchDeltas(undefined, 'x'), { text: 'x', count: 1 })
  deep('a non-object buffer is ignored', hiveBatchDeltas('nope', 'x'), { text: 'x', count: 1 })
  deep('the reducer never mutates the input buffer',
    (() => { const p = { text: 'a', count: 1 }; hiveBatchDeltas(p, 'b'); return p.text + p.count })(), 'a1')
  deep('batching is not a timer', typeof hiveBatchDeltas(undefined, 'x').handle, 'undefined')
}

console.log('payload clipping + timeline caps')
{
  deep('a short payload is untouched', hiveTruncatePayload('abc', 8), 'abc')
  deep('a long payload is clipped with an ellipsis', hiveTruncatePayload('abcdefghij', 4), 'abcd…')
  deep('an empty payload is empty', hiveTruncatePayload(null), '')
  deep('the default cap is the documented one', HIVE_PAYLOAD_MAX, 2048)
  deep('a payload exactly at the cap is untouched', hiveTruncatePayload('x'.repeat(2048)), 'x'.repeat(2048))

  const long = Array.from({ length: 600 }, (_, i) => ({ id: String(i) }))
  deep('the in-memory cap keeps the newest', hiveCapTimeline(long).length, HIVE_TIMELINE_MEM)
  deep('the cap keeps the TAIL', hiveCapTimeline(long)[HIVE_TIMELINE_MEM - 1].id, '599')
  deep('a short list is returned as a copy', hiveCapTimeline([{ id: 'a' }]).length, 1)
  deep('a non-array is an empty list', hiveCapTimeline(null).length, 0)
  assert('the persisted cap is below the in-memory cap', HIVE_TIMELINE_KEEP < HIVE_TIMELINE_MEM)
  deep('the delta window is the documented 50ms', HIVE_DELTA_WINDOW_MS, 50)

  const tl = [{ id: '1', kind: 'turn', from: 'builder', phase: 'done', tools: [] }]
  deep('the last entry for a member is found', hiveLastProfileEntry(tl, 'builder').id, '1')
  deep('a member with no entries has none', hiveLastProfileEntry(tl, 'nobody'), null)
  assert('profile lookup is case-insensitive', hiveLastProfileEntry(tl, 'BUILDER') !== null)
  deep('a card title is a single line',
    hiveCardTitle({ kind: 'user', text: 'a\n\nb   c' }), 'a b c')
  deep('a card title is clipped', hiveCardTitle({ kind: 'user', text: 'x'.repeat(400) }).length, 121)
}

console.log('hiveOrderMembers (team panel order)')
{
  // P-04.3: `leader` first, then the room's stable position (`order`, defaulting
  // to insertion order), then profile name. `browser` carries NO rank: granting
  // browser access used to silently reorder the roster (F-08/F-09).
  const room = [
    { profile: 'sentry' }, { profile: 'forge' }, { profile: 'atlas', leader: true }, { profile: 'arch', browser: true }
  ]
  deep('the pinned leader sorts first, then insertion order',
    hiveOrderMembers(room).map((m) => m.profile), ['atlas', 'sentry', 'forge', 'arch'])
  deep('browser access alone carries no rank',
    hiveOrderMembers([{ profile: 'b' }, { profile: 'a', browser: true }]).map((m) => m.profile), ['b', 'a'])
  deep('an explicit order beats insertion order',
    hiveOrderMembers([{ profile: 'a', order: 2 }, { profile: 'b', order: 1 }]).map((m) => m.profile), ['b', 'a'])
  deep('a leader keeps the top spot whatever its order',
    hiveOrderMembers([{ profile: 'a', order: 0 }, { profile: 'z', leader: true, order: 9 }]).map((m) => m.profile), ['z', 'a'])
  deep('equal ranks fall back to the profile name',
    hiveOrderMembers([{ profile: 'zed', order: 1 }, { profile: 'aaa', order: 1 }]).map((m) => m.profile), ['aaa', 'zed'])
  deep('the input array is not mutated',
    hiveOrderMembers(room).length === 4 && room[0].profile, 'sentry')
  deep('an empty roster is fine', hiveOrderMembers([]), [])
  deep('a malformed entry cannot throw', hiveOrderMembers([null, { profile: 'b' }, undefined]).length, 3)
  deep('ordering is team-agnostic (only the pin is special)',
    hiveOrderMembers([{ profile: 'zed' }, { profile: 'aaa' }]).map((m) => m.profile), ['zed', 'aaa'])
  deep('pinning the second member is enough to reorder',
    hiveOrderMembers([{ profile: 'zed' }, { profile: 'aaa', leader: true }]).map((m) => m.profile), ['aaa', 'zed'])
}

console.log('hiveApplyLeader (F-10: the room has exactly one team leader)')
{
  // The pin used to toggle only the target, so every member could be pinned at
  // once and the leader-first sort key was ambiguous. The room now has ONE
  // leader: pinning B unpins A in the same update.
  const you = { profile: 'you', order: 0 }

  // `you` is not a member: the team panel renders it as its own fixed first row
  // (data-role="you") and only the members go through hiveOrderMembers. So the
  // roster the user sees is `you` followed by the ordered members.
  const roster = (list) => ['you', ...hiveOrderMembers(list).map((m) => m.profile)]
  const members = [{ profile: 'atlas', order: 1, leader: true }, { profile: 'forge', order: 2 }]
  const room = [you, ...members]

  const pinB = hiveApplyLeader(room, 'forge', true)
  deep('pinning B leaves exactly one leader', pinB.filter((m) => m.leader === true).map((m) => m.profile), ['forge'])
  deep('the previous leader A is unpinned, not dropped', pinB.find((m) => m.profile === 'atlas'), { profile: 'atlas', order: 1, leader: false })
  deep('the roster reads you · B · …', roster(pinB.filter((m) => m.profile !== 'you')), ['you', 'forge', 'atlas'])

  const unpinB = hiveApplyLeader(pinB, 'forge', false)
  deep('unpinning B leaves the room with no leader', unpinB.filter((m) => m.leader === true), [])
  deep('unpinning B restores insertion order', roster(unpinB.filter((m) => m.profile !== 'you')), ['you', 'atlas', 'forge'])

  // "Always false" would pass the two cases above, so prove the flag actually
  // lands on the target: pinning A back re-pins A and clears nothing else.
  deep('pinning A after B clears B (the rule is not one-way)',
    hiveApplyLeader(pinB, 'atlas', true).filter((m) => m.leader === true).map((m) => m.profile), ['atlas'])

  deep('a profile name is matched case-insensitively',
    hiveApplyLeader(room, 'FORGE', true).filter((m) => m.leader === true).map((m) => m.profile), ['forge'])
  deep('the input array and its members are never mutated',
    [room[1].leader, room[2].leader === true], [true, false])
  deep('an empty roster is fine', hiveApplyLeader([], 'forge', true), [])
  deep('a malformed entry cannot throw', hiveApplyLeader([null, { profile: 'x' }], 'x', true).length, 2)
  deep('a member already off stays off', hiveApplyLeader(room, 'forge', false).filter((m) => m.leader === true).map((m) => m.profile), ['atlas'])

console.log('hiveNeedsSession (session recovery: the post-restart state is normal, not an error)')
{
  assert('a live member needs nothing', hiveNeedsSession({ profile: 'forge', sessionId: 's1' }) === false)
  assert('a null sessionId needs recovery', hiveNeedsSession({ profile: 'arch', sessionId: null }) === true)
  assert('a missing sessionId needs recovery', hiveNeedsSession({ profile: 'you' }) === true)
  assert('no member is not a recovery case', hiveNeedsSession(null) === false)
  assert('any truthy member without a sessionId counts (callers pass members)', hiveNeedsSession({ profile: 'forge' }) === true)
  assert('relay to a session-less member auto-recovers instead of warning',
    src.includes('hiveRecoverMember(member.profile)') && src.includes('had no live session — started a fresh one'))
  assert('Start-all recovers every session-less member and reports once',
    src.includes('async function hiveRecoverAll()') && src.includes('Started ${started} session(s) — room is live.'))
  assert('Start-all button exists and is honest when the room is live',
    src.includes('HiveStartAllButton') && src.includes('Every member already has a live session'))
  assert('detail card leads with a Start session action when session-less',
    src.includes("children: 'Start session'") && src.includes('data-ts-start-session'))
}

  // Mint-as-leader: the Add-agent popover can pin the new member as it lands.
  // Same rule, one write — the new member is appended first, then the exclusive
  // pin runs, so the room never shows two leaders behind the popover.
  const minted = [...room, { profile: 'sentry', order: 3, leader: true }]
  const afterMint = hiveApplyLeader(minted, 'sentry', true)
  deep('a member minted as leader clears the previous leader',
    afterMint.filter((m) => m.leader === true).map((m) => m.profile), ['sentry'])
  deep('and the minted leader sorts first too',
    hiveOrderMembers(afterMint).map((m) => m.profile), ['sentry', 'you', 'atlas', 'forge'])

  // A pin that names nobody must not wipe the room: the "on" branch unsets every
  // non-match, so an unknown name (a typo, or a member that left between the
  // click and the write) would otherwise clear the only leader standing.
  deep('pinning a name the room does not hold leaves the leader alone',
    hiveApplyLeader(room, 'ghost', true).filter((m) => m.leader === true).map((m) => m.profile), ['atlas'])
  deep('pinning nothing at all is a no-op too',
    hiveApplyLeader(room, '', true).filter((m) => m.leader === true).map((m) => m.profile), ['atlas'])
  deep('and a no-op write still keeps every member',
    hiveApplyLeader(room, 'ghost', true).length, room.length)
}

console.log('hiveCollapseLeaders (F-10: a room saved before the pin was exclusive)')
{
  // The pre-fix build persisted `leader: true` on EVERY member the user pinned,
  // so the reporter's own room hydrates with two leads and two crowns. Boot
  // keeps the lead the roster already showed first (lowest `order`) and clears
  // the rest, so the upgrade cannot re-paint the bug on an existing room.
  const legacy = [
    { profile: 'scout', order: 2 },
    { profile: 'atlas', order: 0, leader: true },
    { profile: 'forge', order: 1, leader: true }
  ]
  const collapsed = hiveCollapseLeaders(legacy)
  deep('a two-leader room hydrates with exactly one leader',
    collapsed.filter((m) => m.leader === true).map((m) => m.profile), ['atlas'])
  deep('the lower `order` wins, not the array position',
    collapsed.find((m) => m.profile === 'forge').leader, false)
  deep('nobody is dropped by the repair', collapsed.length, 3)
  deep('and the repair leaves the roster in the order the lead implies',
    hiveOrderMembers(collapsed).map((m) => m.profile), ['atlas', 'forge', 'scout'])

  deep('a missing `order` falls back to array position, as the sort key does',
    hiveCollapseLeaders([{ profile: 'a', leader: true }, { profile: 'b', leader: true }])
      .filter((m) => m.leader === true).map((m) => m.profile), ['a'])
  deep('equal orders fall back to the profile name (deterministic boot)',
    hiveCollapseLeaders([{ profile: 'zed', order: 1, leader: true }, { profile: 'aaa', order: 1, leader: true }])
      .filter((m) => m.leader === true).map((m) => m.profile), ['aaa'])

  const one = [{ profile: 'a', order: 0, leader: true }, { profile: 'b', order: 1 }]
  assert('a room that already has one leader is passed straight through', hiveCollapseLeaders(one) === one)
  deep('a room with no leader stays leaderless',
    hiveCollapseLeaders([{ profile: 'a' }, { profile: 'b' }]).filter((m) => m.leader === true), [])
  deep('the input array and its members are never mutated',
    [legacy[0].leader === true, legacy[1].leader, legacy[2].leader], [false, true, true])
  deep('an empty roster is fine', hiveCollapseLeaders([]), [])
  deep('a malformed entry cannot throw',
    hiveCollapseLeaders([null, { profile: 'x', leader: true }, undefined, { profile: 'y', leader: true }])
      .filter((m) => m && m.leader === true).map((m) => m.profile), ['x'])
  deep('a saved lead with no profile survives by position; the rest still clear',
    hiveCollapseLeaders([{ order: 0, leader: true }, { profile: 'b', order: 1, leader: true }])
      .filter((m) => m && m.leader === true).length, 1)
}

console.log('hiveLeaderBadge (F-10: the crown mark)')
{
  // The row renders a crown before the name from this descriptor — non-null means
  // "crown", null means "no crown" — so the badge is assertable without a DOM.
  deep('a leader carries the crown descriptor',
    hiveLeaderBadge({ profile: 'forge', leader: true }), { label: 'Team lead', title: 'Team lead' })
  deep('a member who was never pinned gets no crown', hiveLeaderBadge({ profile: 'atlas' }), null)
  deep('a member unpinned by B loses its crown', hiveLeaderBadge({ profile: 'atlas', leader: false }), null)
  deep('the crown disappears once B is unpinned too',
    hiveLeaderBadge(hiveApplyLeader([{ profile: 'b', leader: true }], 'b', false)[0]), null)
  deep('a malformed member cannot throw', hiveLeaderBadge(null), null)
  deep('a non-boolean flag is not a crown', hiveLeaderBadge({ profile: 'a', leader: 'yes' }), null)
}

console.log('turn-closing safety (R1: a buffered delta must not resurrect a closed turn)')
{
  // The delta window is 50 ms; a `message.delta` still inside it must land on
  // the turn being closed (or be dropped), never open a new one. These are the
  // pure invariants the guard and the flush-before-close both rest on.
  const streamed = hiveTurnAppendText(hiveTurnInit('default', 1000), 'the tail that streamed')
  deep('appending text keeps it on the open turn', streamed.text, 'the tail that streamed')
  assert('an open turn is discoverable while it streams', hiveLastOpenTurn([streamed], 'default') !== null)

  const failed = hiveTurnError(streamed, 'rate limit exceeded', 2000)
  deep('failing a turn keeps the text already folded into it', failed.text, 'the tail that streamed')
  deep('failing a turn surfaces the real reason', failed.error, 'rate limit exceeded')
  assert('the open-phase set excludes a failed turn', !HIVE_TURN_OPEN.includes(failed.phase))
  deep('a failed turn is no longer an open turn (the flush guard drops stale text)',
    hiveLastOpenTurn([failed], 'default'), null)

  const folded = hiveTurnFold(streamed, undefined, 3000)
  deep('folding a turn with no new text keeps the streamed text', folded.text, 'the tail that streamed')
  deep('a folded turn is no longer open either', hiveLastOpenTurn([folded], 'default'), null)

  deep('an empty error reason still reads as a failure',
    hiveTurnError(hiveTurnInit('default', 1000), '', 2000).error, 'turn failed')
}

console.log('room readouts (P-13 dock, P-18 Work header — data, never a sentence)')
{
  deep('the dock names the room, its agents and its open items',
    hiveRoomStatus(3, 2, ''), 'Room · 3 agents · 2 open items')
  deep('singular counts stay singular', hiveRoomStatus(1, 1, ''), 'Room · 1 agent · 1 open item')
  deep('last activity is appended only when there is a clock to read',
    hiveRoomStatus(0, 0, '11:56 PM'), 'Room · 0 agents · 0 open items · last activity 11:56 PM')
  assert('the dock never narrates panes or says "member(s)"',
    !/pane|member\(s\)/.test(hiveRoomStatus(2, 0, '')))

  deep('the Work header leads with the open count', hiveWorkSummary(2, ''), '2 open items')
  deep('and appends last activity when it has one', hiveWorkSummary(1, '11:56 PM'),
    '1 open item · last activity 11:56 PM')
  deep('no clock, no tail', hiveWorkSummary(0, ''), '0 open items')

  deep('a passed item is settled; everything else counts as open',
    hiveOpenItemCount([{ status: 'passed' }, { id: 2, status: 'in review' }]), 1)
  deep('a malformed task cannot inflate the count',
    hiveOpenItemCount([null, undefined, { status: 'passed' }, { id: 9, status: 'submitted' }]), 1)
  deep('no tasks is zero, not NaN', hiveOpenItemCount(undefined), 0)

  deep('last activity is the newest entry carrying a timestamp',
    hiveLastActivityTs([{ ts: 1 }, { text: 'no ts of its own' }, { ts: 7 }]), 7)
  deep('an untouched room has no last activity', hiveLastActivityTs([]), null)

  deep('the roster summary is an honest count, never the internal cap',
    hiveRosterSummary(3, 1), '3 agents · 1 working')
  deep('a quiet room reads as quiet', hiveRosterSummary(2, 0), '2 agents')
  deep('an empty room says so', hiveRosterSummary(0, 0), 'no agents yet')
}

console.log('\n' + (fail ? `FAIL ${fail}/${pass + fail}` : `ALL PASS ${pass}/${pass + fail}`))
process.exit(fail ? 1 : 0)
