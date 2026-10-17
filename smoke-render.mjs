#!/usr/bin/env node
/**
 * Buzz-Hive Phase 1 render + wiring smoke harness.
 *
 * WHAT IT PROVES (and what it does NOT):
 *  - plugin.js IMPORTS, REGISTERS and RENDERS the three-column workspace with
 *    the real React runtime and a faithful stub of @hermes/plugin-sdk, so a
 *    missing import, a bad hook call or a broken jsx() shape fails here.
 *  - the injected stylesheet has NO hardcoded color and reads only `--ui-*`
 *    props that exist in the installed app (plus the plugin's own `--ts-*`).
 *  - the real gateway event path drives the UI: a scripted two-agent exchange
 *    through the SAME listeners register() mounts produces derived status
 *    changes and Task/Done/Review cards, with markers scrubbed from the text.
 *  - delta coalescing is real: streamed text is INVISIBLE until the window
 *    elapses, and message.complete flushes synchronously.
 *  - ctx.onDispose releases the style sheet and every event subscription.
 *
 * It is NOT the desktop app: no CSS layout is applied, no native pane opens,
 * and host.request is stubbed (no real gateway/session is touched). Those
 * remain SENTRY's in-app checks.
 *
 * Run:  node smoke-render.mjs
 * Deps: react/react-dom/nanostores from $HERMES_DESKTOP_MODULES or
 *       ~/.hermes/hermes-agent/node_modules
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const IN_SANDBOX = process.argv.includes('--in-sandbox')

const argIdx = process.argv.indexOf('--modules')
const MODULES = path.resolve(
  argIdx !== -1 ? process.argv[argIdx + 1]
    : process.env.HERMES_DESKTOP_MODULES || path.join(os.homedir(), '.hermes/hermes-agent/node_modules')
)

// ── the canonical app CSS custom properties ─────────────────────────────────
// SOURCE: the installed app's apps/desktop/src/styles.css. Only these (and the
// plugin's own --ts-* props) may be referenced; anything else is a fabrication.
const UI_VARS = new Set(`--ui-base --ui-accent --ui-accent-secondary --ui-warm --ui-red --ui-orange --ui-yellow
--ui-green --ui-cyan --ui-blue --ui-purple --ui-bg-primary --ui-bg-secondary --ui-bg-tertiary --ui-bg-quaternary
--ui-bg-quinary --ui-bg-card --ui-bg-chrome --ui-bg-editor --ui-bg-elevated --ui-bg-input --ui-bg-sidebar
--ui-stroke-primary --ui-stroke-secondary --ui-stroke-tertiary --ui-stroke-quaternary
--ui-text-primary --ui-text-secondary --ui-text-tertiary --ui-text-quaternary
--ui-surface-background --ui-editor-surface-background --ui-terminal-surface-background
--ui-sidebar-surface-background --ui-widget-surface-background --ui-chat-surface-background
--ui-chat-bubble-background --ui-chat-bubble-opaque-background
--ui-row-hover-background --ui-row-active-background --ui-row-open-background
--ui-control-hover-background --ui-control-active-background --ui-selection-background
--ui-sash-hover-background --ui-sash-hover-border --ui-tab-hover-darken
--ui-inline-code-background --ui-inline-code-foreground`.split(/\s+/).filter(Boolean))

// ── real icon names ────────────────────────────────────────────────────────
// SOURCE: the installed app's apps/desktop/src/lib/icons.ts (re-export names).
const ICON_NAMES = new Set(`Activity AlertCircle AlertTriangle AppWindow Archive ArchiveOff ArrowBarToDown ArrowBarToUp
ArrowUp ArrowUpRight AtSign AudioLines BarChart3 Bell Book Bookmark BookmarkFilled Box Brain Bug Check CheckCircle2
CheckIcon ChevronDown ChevronDownIcon ChevronLeft ChevronLeftIcon ChevronRight ChevronRightIcon ChevronUp CircleIcon
CircleLetterA Clipboard Clock Cloud Command Copy CopyIcon CornerDownLeft Cpu CreditCard Download Ear EarOff Egg Eject
ExternalLink Eye EyeOff FileImage FileText FolderOpen GitBranch GitBranchIcon GitFork GitForkIcon Globe Hash HelpCircle
Info KeyRound Keyboard Layers3 LayoutDashboard Link Link2 LinkIcon Loader2 Loader2Icon Lock LogIn Mail Maximize
MessageCircle MessageCode MessageQuestion MessageSquareText Mic MicOff Monitor MonitorPlay Moon MoreHorizontal
MoreHorizontalIcon MoreVertical Network NotebookTabs Package Palette PanelBottom PanelLeftIcon PanelTop Pause PawPrint
Pencil PencilIcon PencilLine Pin Play Plug Plus Power QrCode RefreshCw RefreshCwIcon Save Search SearchIcon Send
Settings Settings2 ShieldLock SlidersHorizontal SmilePlusIcon Square Starmap SteeringWheel StopFilled Sun Terminal
Trash2 Upload Users Volume2 Volume2Icon VolumeX VolumeXIcon Wrench X XIcon Zap ZapFilled ZoomIn ZoomOut`.split(/\s+/).filter(Boolean))

const SDK_STUB = `
import * as React from 'react'
export { atom } from 'nanostores'
// getServerSnapshot is REQUIRED for server rendering — without it React throws.
export function useValue(a) { return React.useSyncExternalStore(a.subscribe.bind(a), a.get.bind(a), a.get.bind(a)) }
export function cn(...a) { return a.filter(Boolean).join(' ') }
export const PALETTE_AREA = 'palette'
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebar.nav'
export function haptic() {}
export function profileColor() { return 'hsl(210 70% 55%)' }
export function profileColorSoft() { return 'transparent' }
export function useQuery() { return { data: undefined, isLoading: false, error: null } }
export const queryClient = { invalidateQueries: async () => {}, removeQueries: () => {} }
export const host = globalThis.__HIVE_HOST__
const el = (tag) => ({ key, asChild, ...props }) => React.createElement(tag, { ...props, children: props && props.children })
export const Button = el('button')
export const Input = el('input')
export const Textarea = el('textarea')
export const ScrollArea = el('div')
export const Badge = el('span')
export const StatusDot = el('span')
export const Switch = el('span')
export const SegmentedControl = el('div')
export const DropdownMenu = el('div')
export const DropdownMenuContent = el('div')
export const DropdownMenuItem = el('div')
export const DropdownMenuSeparator = el('div')
export const DropdownMenuTrigger = el('div')
export const Select = el('div')
export const SelectContent = el('div')
export const SelectItem = el('div')
export const SelectTrigger = el('div')
export const SelectValue = el('div')
export const Tabs = el('div')
export const TabsList = el('div')
export const TabsTrigger = el('div')
const missing = new Set()
globalThis.__HIVE_MISSING_ICONS__ = missing
export const icons = new Proxy({}, {
  get(_t, name) {
    if (typeof name !== 'string') return undefined
    if (!globalThis.__HIVE_ICONS__.has(name)) { missing.add(name); return undefined }
    return (props) => React.createElement('svg', { ...props, 'data-icon': name })
  }
})
`

function buildSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-smoke-'))
  const nm = path.join(dir, 'node_modules')
  fs.mkdirSync(path.join(nm, '@hermes/plugin-sdk'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  for (const pkg of ['react', 'react-dom', 'nanostores']) {
    const from = path.join(MODULES, pkg)
    if (!fs.existsSync(from)) {
      console.error(`smoke-render: missing ${from} — pass --modules <dir>`)
      process.exit(2)
    }
    fs.symlinkSync(from, path.join(nm, pkg), 'dir')
  }
  fs.writeFileSync(path.join(nm, '@hermes/plugin-sdk/package.json'),
    JSON.stringify({ name: '@hermes/plugin-sdk', type: 'module', main: 'index.mjs', exports: { '.': './index.mjs' } }))
  fs.writeFileSync(path.join(nm, '@hermes/plugin-sdk/index.mjs'), SDK_STUB)
  fs.copyFileSync(path.join(HERE, 'plugin.js'), path.join(dir, 'plugin.js'))
  fs.copyFileSync(fileURLToPath(import.meta.url), path.join(dir, 'smoke-render.mjs'))
  return dir
}

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`) }
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected })
}

async function inSandbox() {
  // ── the renderer globals the plugin expects ──────────────────────────────
  const injected = new Map()
  const head = {
    appendChild(node) { node.parentNode = head; injected.set(node.id, node) },
    removeChild(node) { injected.delete(node.id); node.parentNode = null }
  }
  globalThis.document = {
    createElement: () => ({ id: '', textContent: '', parentNode: null }),
    getElementById: (id) => injected.get(id) || null,
    head
  }
  globalThis.window = globalThis
  globalThis.window.hermesDesktop = {
    api: async ({ path: p }) => (p === '/api/profiles' ? { profiles: [{ name: 'default' }] } : { runs: [], total: 0 })
  }
  globalThis.__HIVE_ICONS__ = ICON_NAMES
  const notifications = []
  const timers = []
  const listeners = new Map()
  const created = []
  globalThis.__HIVE_HOST__ = {
    notify: (n) => notifications.push(n),
    notifyError: (e, m) => notifications.push({ kind: 'error', message: m, err: String(e) }),
    navigate: (p) => notifications.push({ kind: 'nav', path: p }),
    revealPane: (p) => notifications.push({ kind: 'pane', pane: p }),
    request: async (method, params) => {
      if (method === 'session.create') {
        const id = `live-${created.length + 1}`
        created.push({ id, profile: params && params.profile })
        return { session_id: id, stored_session_id: 'stored-' + id }
      }
      if (method === 'projects.list') {
        return { projects: [{ id: 'p_1', slug: 'demo', name: 'demo', primary_path: '/tmp/demo', folders: [] }] }
      }
      return {}
    },
    onEvent: (type, fn) => { listeners.set(type, fn); return () => listeners.delete(type) }
  }

  const mod = await import(pathToFileURL(path.join(process.cwd(), 'plugin.js')).href)
  const plugin = mod.default

  const registered = []
  const disposers = []
  const ctx = {
    source: 'plugin:buzz-hive',
    storage: (() => {
      const m = new Map()
      return { get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) }
    })(),
    register: (c) => { registered.push(c); return () => {} },
    registerMany: () => () => {},
    onDispose: (fn) => disposers.push(fn),
    onEvent: (t, fn) => { listeners.set(t, fn); return () => listeners.delete(t) },
    setTimeout: (fn, ms) => { const h = { fn, ms, cancelled: false }; timers.push(h); return () => { h.cancelled = true } },
    setInterval: () => () => {},
    addEventListener: () => () => {},
    rest: async () => ({}),
    socket: () => () => {},
    os: {
      writeClipboard: async () => true, notify: () => {}, openExternal: async () => true,
      revealPath: async () => true, pickSavePath: async () => null, pickOpenPath: async () => null
    },
    runAction: () => ({ ok: true }),
    listActions: () => [],
    i18n: {}
  }
  const runTimers = () => { for (const h of timers.splice(0)) if (!h.cancelled) h.fn() }
  // A deterministic clock: the plugin's 1500 ms completion dedup would
  // otherwise swallow every turn after the first in a millisecond-fast script.
  let clock = Date.now()
  Date.now = () => clock
  const advance = (ms) => { clock += ms }
  const emit = (type, payload) => {
    const fn = listeners.get(type)
    if (!fn) throw new Error(`no listener registered for gateway event ${type}`)
    fn(payload)
  }
  const tick = () => new Promise((r) => setImmediate(r))
  const render = () => renderToString(page.render())

  console.log('register + first render')
  plugin.register(ctx)
  await tick(); await tick()
  ok('the plugin exports the shell contract', plugin.id === 'buzz-hive' && typeof plugin.register === 'function')
  ok('no unknown icon name was referenced', globalThis.__HIVE_MISSING_ICONS__.size === 0, [...globalThis.__HIVE_MISSING_ICONS__])
  const page = registered.find((c) => c.id === 'page')
  ok('the page still registers at ROUTES_AREA on /hive', !!page && page.data.path === '/hive')
  ok('the sidebar entry and palette opener still register',
    registered.some((c) => c.id === 'nav') && registered.some((c) => c.id === 'palette-open'))
  ok('boot minted a live session for the default member', created.length === 1 && created[0].profile === 'default', created)

  const css = injected.get('buzz-hive-team-studio')
  ok('exactly one <style> element is injected, under a namespaced id', !!css && injected.size === 1)
  const cssText = css ? css.textContent : ''
  ok('the stylesheet has no hex color literal', !/#[0-9a-fA-F]{3,8}\b/.test(cssText), cssText.match(/#[0-9a-fA-F]{3,8}\b/))
  ok('the stylesheet has no rgb()/hsl() literal', !/\b(rgb|rgba|hsl|hsla)\(/.test(cssText))
  const vars = [...new Set((cssText.match(/var\((--[a-z0-9-]+)/g) || []).map((s) => s.replace('var(', '')))]
  const unknown = vars.filter((v) => !UI_VARS.has(v) && !v.startsWith('--ts-'))
  ok('every custom property it reads is a real app var or its own --ts-* prop', unknown.length === 0, unknown)
  ok('at least one real theme var is used', vars.some((v) => UI_VARS.has(v)))
  ok('no selector leaks globally (all under .ts-*)',
    !/(^|})\s*(body|html|\*|:root)\s*[,{]/.test(cssText))
  ok('the three narrow-window breakpoints exist',
    /max-width:1100px/.test(cssText) && /max-width:860px/.test(cssText) && /max-width:600px/.test(cssText))

  let html = render()
  ok('the workspace root renders', html.includes('data-ts-workspace="true"'))
  ok('all three columns render',
    html.includes('data-ts-team="true"') && html.includes('data-ts-center="true"') && html.includes('data-ts-right="true"'))
  ok('the toolbar and the bottom dock render',
    html.includes('data-ts-toolbar="true"') && html.includes('data-ts-dock='))
  ok('the pinned `you` roster row renders', html.includes('data-role="you"'))
  ok('the right panel offers all five tabs',
    ['Tasks', 'Activity', 'Files', 'Approvals', 'Workflow'].every((t) => html.includes(t)))
  ok('the Tasks tab states the honest native-kanban gap', html.includes('Durable tasks live in native Kanban'))
  ok('the composer still renders', html.includes('data-testid="hive-composer"'))
  ok('the project selector reads the real projects.list payload', html.includes('demo'))

  console.log('scripted two-agent exchange through the real event path')
  const sid = created[0].id
  // Warm-up: a member's FIRST completed turn is the seeded room-brief ack and
  // is suppressed by design — spend it here so the scripted exchange is real.
  emit('message.start', { session_id: sid, profile: 'default' })
  advance(2000)
  emit('message.complete', { session_id: sid, profile: 'default' })
  await tick()
  const before = render()
  ok('the member starts idle', before.includes('idle') && !before.includes('thinking…'))
  ok('the seeded brief ack produced no card for real work', !before.includes('data-ts-work="'))
  ok('the workspace root is what the substring check was colliding with', before.includes('data-ts-workspace="true"'))
  emit('message.start', { session_id: sid, profile: 'default' })
  html = render()
  ok('message.start opens a turn and the row reads thinking',
    html.includes('data-agent="default"') && html.includes('thinking…'))
  emit('thinking.delta', { session_id: sid, profile: 'default' })
  ok('thinking.delta keeps it thinking', render().includes('thinking…'))

  emit('message.delta', { session_id: sid, profile: 'default', payload: { text: 'Look' } })
  emit('message.delta', { session_id: sid, profile: 'default', payload: { text: 'ing ' } })
  emit('message.delta', { session_id: sid, profile: 'default', payload: { text: 'now.' } })
  ok('streamed text is COALESCED — nothing is rendered before the window elapses',
    !render().includes('Looking now.'))
  ok('the delta timer is the only pending timer', timers.length === 1, timers.map((t) => t.ms))
  runTimers()
  html = render()
  ok('the coalesced batch lands once the window elapses', html.includes('Looking now.'))
  ok('a streaming member reads as answering', html.includes('answering…'))

  emit('tool.start', { session_id: sid, profile: 'default', payload: { tool: 'terminal' } })
  html = render()
  ok('tool.start shows the tool and the derived working status',
    html.includes('terminal') && html.includes('using a tool'))
  emit('tool.complete', { session_id: sid, profile: 'default', payload: { tool: 'terminal' } })

  // Finish the turn with a real marker so the work-item fold runs.
  emit('message.delta', { session_id: sid, profile: 'default', payload: { text: ' [task @builder] audit the payment flow' } })
  runTimers()
  advance(2000)
  emit('message.complete', { session_id: sid, profile: 'default' })
  await tick(); await tick()
  html = render()
  ok('message.complete folds the turn and clears the busy state', html.includes('✓ done'))
  const contextAround = (needle) => {
    const i = html.indexOf(needle)
    return i === -1 ? null : html.slice(Math.max(0, i - 120), i + 120)
  }
  ok('the assignment produced a TASK card', html.includes('data-ts-work="task"') && html.includes('TASK'),
    { task: html.includes('data-ts-work="task"'), label: html.includes('TASK'), feed: html.includes('data-ts-feed') })
  const idm = html.match(/font-mono[^>]*>#([a-z0-9]{4})</)
  ok('the task card shows its work id', !!idm, contextAround('TASK'))
  const tid = idm ? idm[1] : null

  // SUBMIT → IN REVIEW
  emit('message.start', { session_id: sid, profile: 'default' })
  emit('message.delta', { session_id: sid, profile: 'default', payload: { text: `[done #${tid}] shipped it` } })
  runTimers()
  advance(2000)
  emit('message.complete', { session_id: sid, profile: 'default' })
  await tick()
  html = render()
  ok('a [done] produced a SUBMITTED card', html.includes('data-ts-work="done"') && html.includes('SUBMITTED'))
  ok('the Tasks tab mirrors it as IN REVIEW', html.includes('IN REVIEW'))
  ok('no raw marker text survives into the rendered feed',
    !html.includes('[task @builder]') && !html.includes('[done #') && !html.includes('[verdict #'),
    { task: contextAround('[task @builder]'), done: contextAround('[done #') })

  // REVIEW REQUEST → then a FAILING VERDICT
  emit('message.start', { session_id: sid, profile: 'default' })
  emit('message.delta', { session_id: sid, profile: 'default', payload: { text: `[review @builder #${tid}] check the maths` } })
  runTimers()
  advance(2000)
  emit('message.complete', { session_id: sid, profile: 'default' })
  await tick()
  ok('a [review] produced a REVIEW card', render().includes('data-ts-work="review"'))
  emit('message.start', { session_id: sid, profile: 'default' })
  emit('message.delta', { session_id: sid, profile: 'default', payload: { text: `[verdict #${tid} fail] off by one` } })
  runTimers()
  advance(2000)
  emit('message.complete', { session_id: sid, profile: 'default' })
  await tick()
  html = render()
  ok('a failing verdict rendered a VERDICT card', html.includes('VERDICT'))
  ok('the verdict reason is shown', html.includes('off by one'))
  ok('the Tasks tab mirrors the failure', html.includes('FAILED'))
  ok('the failed reason surfaced in the tab too', html.includes('routed back to the owner'))
  ok('a settled member returns to idle', html.includes('idle'))

  // Scratchpad markers still land (A11) and surface as a SystemCard.
  emit('message.start', { session_id: sid, profile: 'default' })
  emit('message.delta', { session_id: sid, profile: 'default', payload: { text: '[scratchpad:Decisions] we ship on Friday' } })
  runTimers()
  advance(2000)
  emit('message.complete', { session_id: sid, profile: 'default' })
  await tick()
  html = render()
  ok('a scratchpad marker produced a system card', html.includes('updated the scratchpad'))
  ok('the raw scratchpad marker never reaches the feed', !html.includes('[scratchpad'))

  // A forced failure marks the row errored (A4's error state). The stub now
  // uses the REAL delivery shape: GatewayEvent.payload is the ErrorPayload
  // `{message}` (tui_gateway/contracts/events.py → gateway-events.ts).
  emit('message.start', { session_id: sid, profile: 'default' })
  emit('error', { session_id: sid, profile: 'default', payload: { message: 'boom' } })
  html = render()
  ok('an error event marks the member errored', html.includes('errored') && html.includes('✕'))
  ok('the real gateway error reason reaches the card (not the literal fallback)',
    html.includes('boom') && !html.includes('turn failed'))
  ok('the error card offers a retry', html.includes('Retry'))

  // Activity tab is a filtered mirror, not a second store.
  ok('the activity filter is exposed as data, not prose',
    !html.includes('data-ts-activity') || html.includes('Tools, work items and room events only'))

  // ── Phase-1 fix re-verification ──────────────────────────────────────────
  // F1: the overlay sheets used to mount their panels unconditionally, so every
  // column rendered twice and the approvals query had three observers.
  console.log('F1 — no duplicate column mounts')
  const countIn = (hay, needle) => hay.split(needle).length - 1
  ok('each column of the grid is mounted exactly once',
    countIn(html, 'data-ts-right="true"') === 1 && countIn(html, 'data-ts-team="true"') === 1 && countIn(html, 'data-ts-center="true"') === 1,
    { right: countIn(html, 'data-ts-right="true"'), team: countIn(html, 'data-ts-team="true"'), center: countIn(html, 'data-ts-center="true"') })
  ok('a closed overlay sheet does not mount its panel at all', !/class="ts-sheet/.test(html))

  // R2: the overlay sheets and the narrow-only toggles must be reachable in the
  // 601–1100 px band too, not only under 600 px.
  console.log('R2 — overlay reachability between 601 px and 1100 px')
  const mediaBlock = (px) => {
    const i = cssText.indexOf(`@media (max-width:${px}px){`)
    if (i === -1) return ''
    let depth = 0
    for (let j = i; j < cssText.length; j++) {
      if (cssText[j] === '{') depth++
      else if (cssText[j] === '}') { depth--; if (depth === 0) return cssText.slice(i, j + 1) }
    }
    return cssText.slice(i)
  }
  const block1100 = mediaBlock(1100)
  const block600 = mediaBlock(600)
  ok('the ≤1100px block can display the team/right overlay sheets',
    block1100.includes('.ts-sheet[data-open="true"]{display:block}'), block1100)
  ok('the ≤1100px block can display the narrow-only toolbar toggles',
    block1100.includes('.ts-narrow-only{display:inline-flex}'), block1100)
  ok('the ≤600px block still carries both rules for the single-column case',
    block600.includes('.ts-sheet[data-open="true"]{display:block}') && block600.includes('.ts-narrow-only{display:inline-flex}'), block600)

  // R2 (BLOCKING, second pass): reachability is a COMPUTED outcome, and this file
  // applies no CSS — so what it can honestly assert is the property that failed:
  // no hide rule inside a media block may match a descendant of the overlay sheet.
  // The sheet is a direct child of `.ts-workspace`, so a selector anchored with
  // `.ts-workspace > ` can never reach the panel copy rendered INSIDE it.
  console.log('R2 — the narrow-window hide rules cannot reach inside an overlay sheet')
  const mediaRules = (block) => {
    const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
    return inner.split('}').map((chunk) => {
      const i = chunk.indexOf('{')
      return i === -1 ? null : { sel: chunk.slice(0, i).trim(), decls: chunk.slice(i + 1).trim() }
    }).filter(Boolean)
  }
  const anchored = (sel) => sel.split(',').every((one) => /^\.ts-workspace\s*>\s/.test(one.trim()))
  const hideRules = (block) => mediaRules(block).filter((r) => /display\s*:\s*none/.test(r.decls))
  for (const [px, block] of [[1100, block1100], [860, mediaBlock(860)], [600, block600]]) {
    const hides = hideRules(block)
    ok(`every ≤${px}px hide rule is anchored to the workspace (cannot match inside .ts-sheet)`,
      hides.length > 0 && hides.every((r) => anchored(r.sel)),
      hides.filter((r) => !anchored(r.sel)).map((r) => r.sel))
  }
  ok('the ≤1100px rule still hides the right column\'s own body (the rail replaces it)',
    hideRules(block1100).some((r) => r.sel === '.ts-workspace > .ts-col-right > .ts-right-body'), hideRules(block1100).map((r) => r.sel))
  ok('the ≤860px rule still hides the team rows\' text (the column is avatar-only there)',
    hideRules(mediaBlock(860)).some((r) => r.sel === '.ts-workspace > .ts-col-team .ts-team-body'), hideRules(mediaBlock(860)).map((r) => r.sel))
  ok('the ≤600px rule still hides the two side columns for the single-column grid',
    hideRules(block600).some((r) => r.sel === '.ts-workspace > .ts-col-team,.ts-workspace > .ts-col-right'), hideRules(block600).map((r) => r.sel))
  ok('no unanchored display:none survives for a class the overlay sheet also renders',
    !/(^|[},])\s*\.(ts-right-body|ts-team-body|ts-col-team|ts-col-right)\s*\{[^}]*display\s*:\s*none/.test(cssText),
    (cssText.match(/(^|[},])\s*\.(ts-right-body|ts-team-body|ts-col-team|ts-col-right)\s*\{[^}]*display\s*:\s*none/g) || []))
  // ...and the part a text assertion cannot decide is measured in a real browser:
  //   node css-layout-probe.cjs     (headless Chrome, getComputedStyle + rects)
  console.log('     (layout truth is measured by css-layout-probe.cjs, not by this file)')

  // R1 (BLOCKING): a delta still inside the 50 ms window must NEVER resurrect a
  // turn that already ended. The old smoke emitted `error` with no pending
  // delta, so it could not see this.
  console.log('R1 — delta-window turn resurrection regression')
  emit('message.start', { session_id: sid, profile: 'default' })
  emit('message.delta', { session_id: sid, profile: 'default', payload: { text: 'stale partial output' } })
  ok('a mid-window delta is buffered, not rendered', !render().includes('stale partial output'))
  emit('error', { session_id: sid, profile: 'default', payload: { message: 'rate limit exceeded' } })
  html = render()
  ok('the error reason from the real payload shape reaches the card', html.includes('rate limit exceeded'))
  ok('immediately after error the member reads errored', html.includes('errored') && html.includes('✕'))
  const turnRowsAtError = countIn(html, 'data-hive-turn="')
  ok('folding the tail cancelled the pending window (no live delta timer survives)',
    timers.filter((t) => !t.cancelled).length === 0, timers.map((t) => `${t.ms}${t.cancelled ? '(cancelled)' : '(LIVE)'}`))
  runTimers() // the window the plugin would have fired on its own
  const afterWindow = render()
  ok('the member STILL reads errored once the window would have elapsed',
    afterWindow.includes('errored') && afterWindow.includes('✕'))
  ok('the stale flush opened no new turn and left nothing streaming',
    countIn(afterWindow, 'data-hive-turn="') === turnRowsAtError && !afterWindow.includes('answering…') && !afterWindow.includes('thinking…'),
    { turnRowsBefore: turnRowsAtError, turnRowsAfter: countIn(afterWindow, 'data-hive-turn="'), answering: afterWindow.includes('answering…'), thinking: afterWindow.includes('thinking…') })
  ok('the last turn row is still the error row',
    afterWindow.slice(afterWindow.lastIndexOf('data-hive-turn="')).startsWith('data-hive-turn="error"'))
  ok('the stale streamed text was not replayed onto any surface',
    !afterWindow.replace(/<[^>]*>/g, ' ').includes('stale partial output'))

  console.log('R1b — the assistant.completed fallback folds the tail before closing')
  emit('message.start', { session_id: sid, profile: 'default' })
  emit('message.delta', { session_id: sid, profile: 'default', payload: { text: 'the tail the fold must keep' } })
  advance(2000)
  emit('assistant.completed', { session_id: sid, profile: 'default', content: '' })
  await tick(); await tick()
  html = render()
  ok('the fallback folded the buffered tail into the closed turn',
    html.includes('the tail the fold must keep') && html.includes('data-hive-turn="done"'))

  // Stop is an A4 click, and a server-rendered string cannot be clicked here —
  // so assert the SOURCE ORDER the same fix requires (flush before the fold).
  const srcText = fs.readFileSync(path.join(process.cwd(), 'plugin.js'), 'utf8')
  const stopBody = srcText.slice(srcText.indexOf('async function hiveStopMember'), srcText.indexOf('async function hiveResetRoom'))
  ok('hiveStopMember flushes the pending window BEFORE folding the turn closed',
    stopBody.indexOf('hiveFlushDelta') !== -1 && stopBody.indexOf('hiveFlushDelta') < stopBody.indexOf('hiveFoldTurn'))
  ok('hiveFlushDelta refuses to write into a turn that already ended',
    /if \(hiveOpenTurnIndex\(member\) === -1\) return/.test(srcText))
  // F6: Stop must CLOSE a turn, never mint one. If the `error` lands while
  // hiveStopMember awaits session.interrupt, an unguarded fold falls into
  // hiveFoldTurn's no-open-turn fallback and appends an empty `done` row beside
  // the real error row. Reproducer: sentry-probe/stop-race.mjs.
  ok('hiveStopMember folds only a turn that is still open (never materializes one)',
    /if \(hiveOpenTurnIndex\(m\) !== -1\) hiveFoldTurn\(m, undefined\)/.test(stopBody))
  ok('no --ui-danger/--ui-warning fallback literal survives in the plugin',
    !/--ui-(danger|warning)/.test(srcText))

  console.log('A7 — resubmission returns the row to IN REVIEW (DESIGN §10 A7 corrected)')
  emit('message.start', { session_id: sid, profile: 'default' })
  emit('message.delta', { session_id: sid, profile: 'default', payload: { text: `[done #${tid}] fixed it` } })
  runTimers()
  advance(2000)
  emit('message.complete', { session_id: sid, profile: 'default' })
  await tick()
  const t7 = render()
  const taskRegion = (() => { const i = t7.indexOf('data-ts-tasks'); return i === -1 ? '' : t7.slice(i, i + 4000) })()
  ok('after resubmission the row reads IN REVIEW', /IN REVIEW/.test(taskRegion),
    { readsInReview: /IN REVIEW/.test(taskRegion), readsOpen: />\s*OPEN\s*</.test(taskRegion) })
  ok('no row in the Tasks tab reads a bare OPEN during IN REVIEW', !/>\s*OPEN\s*</.test(taskRegion))
  ok('work cards carry the one-line drawer title as their tooltip',
    /data-ts-work="task"[^>]*title="task #/.test(t7), t7.match(/<[^>]*data-ts-work="task"[^>]*>/))

  console.log('cleanup on unload')
  const listenersBefore = listeners.size
  ok('event subscriptions were actually mounted', listenersBefore >= 9, listenersBefore)
  for (const d of disposers) d()
  ok('onDispose removed every event subscription', listeners.size === 0, [...listeners.keys()])
  ok('onDispose removed the injected style sheet', injected.size === 0, [...injected.keys()])
  ok('onDispose flushed the workspace prefs to storage', ctx.storage.get('hive.v2', null) !== null)

  console.log('')
  console.log(fail ? `FAIL ${fail}/${pass + fail}` : `ALL PASS ${pass}/${pass + fail}`)
  return fail ? 1 : 0
}

let renderToString
if (IN_SANDBOX) {
  ;({ renderToString } = await import('react-dom/server'))
  const code = await inSandbox()
  process.exit(code)
} else {
  const dir = buildSandbox()
  // NODE_ENV=production matches the shipped app (apps/desktop build env is
  // production), so React's development-only warnings (e.g. the key-in-props
  // advisory every jsx() list in the plugin triggers in dev) do not mask the
  // real signal here.
  const res = spawnSync(process.execPath, ['smoke-render.mjs', '--in-sandbox'], {
    cwd: dir, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' }
  })
  fs.rmSync(dir, { recursive: true, force: true })
  process.exit(res.status === null ? 1 : res.status)
}
