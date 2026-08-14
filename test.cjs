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

// HIVE_DIGEST_LEN is defined above the markers; inject it for the sliced scope.
const factory = new Function(
  `const HIVE_DIGEST_LEN = 12;\nconst HIVE_PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;\n${core}\nreturn { hiveParseCoordination, hiveBuildDigest, hiveBuildRoomBrief, hiveRouteUserPost, hiveExtractMentions, hiveNormalize, hiveIsValidProfileName, hiveExtractScratchEntries, hiveIsMemberSession, HIVE_WORKING_MODELS, hiveModelKey, hiveResolveModelEntry, hiveModelAssignmentBody, hiveCatalogToEntries, hiveMergeCatalogEntries, hiveGroupEntriesByProvider, hiveEntryDisplayLabel, hiveResolveModelLabel, hiveGroupTimeline, hiveToggleAgentExpanded, HIVE_TURN_OPEN, hiveTurnInit, hiveTurnPatch, hiveTurnAddTool, hiveTurnFinishTool, hiveTurnAppendText, hiveTurnFold, hiveTurnError, hiveTurnDigestBody, hiveLastOpenTurn, hiveActivityPreview, hiveGroupUnseen }`
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
  hiveGroupUnseen
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
  assert('Direct relays preserve queue intent', src.includes("queued: busy"))
  assert('Follow-scroll binds to the Radix viewport', src.includes("data-slot=\"scroll-area-viewport\""))
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

console.log('\n' + (fail ? `FAIL ${fail}/${pass + fail}` : `ALL PASS ${pass}/${pass + fail}`))
process.exit(fail ? 1 : 0)
