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
  `${core}\nreturn { hiveParseCoordination, hiveBuildDigest, hiveBuildRoomBrief, hiveRouteUserPost, hiveExtractMentions, hiveNormalize, hiveIsValidProfileName, hiveExtractScratchEntries, hiveIsMemberSession, hiveNormalizeContextMode, hiveBuildHandoffCapsule, hiveBuildContextEnvelope, HIVE_WORKING_MODELS, hiveModelKey, hiveResolveModelEntry, hiveModelAssignmentBody, hiveCatalogToEntries, hiveMergeCatalogEntries, hiveGroupEntriesByProvider, hiveEntryDisplayLabel, hiveResolveModelLabel, hiveGroupTimeline, hiveToggleAgentExpanded, HIVE_TURN_OPEN, hiveTurnInit, hiveTurnPatch, hiveTurnAddTool, hiveTurnFinishTool, hiveTurnAppendText, hiveTurnFold, hiveTurnError, hiveTurnDigestBody, hiveLastOpenTurn, hiveActivityPreview, hiveGroupUnseen, hivePlanDeliveries, hiveParseWorkItems, hiveApplyWorkItems, hiveParseScratchOps, hiveScratchApply, hiveScratchSections, hiveScrubMarkers, hiveBuildStandingHeader, hiveFormatWorkItems, hiveClipHead }`
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
  hiveClipHead
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

console.log('\n' + (fail ? `FAIL ${fail}/${pass + fail}` : `ALL PASS ${pass}/${pass + fail}`))
process.exit(fail ? 1 : 0)
