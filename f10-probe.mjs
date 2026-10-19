#!/usr/bin/env node
/**
 * f10-probe.mjs — evidence for F-10 (the roster pin is exclusive, and the leader
 * reads as the lead through a crown icon).
 *
 * WHAT IT PROVES (real DOM, real React, the real plugin.js)
 *  - A room hydrated with a pinned member paints EXACTLY ONE crown, on that
 *    member's row, before the name, as an inline <svg> labelled "Team lead".
 *  - Clicking another member's row pin unpins the first in the SAME commit: one
 *    crown, moved to the second member's row, and the first row keeps its place
 *    (nothing is dropped) with data-on="false".
 *  - Clicking the pinned member's own toggle clears the room: no crown anywhere.
 *  - The mint path is exclusive too: pin a profile in the Add-agent popover and
 *    add it, and the leader that was pinned before is cleared in that write.
 *
 * USAGE
 *   node f10-probe.mjs                       # the working tree's plugin.js
 *   node f10-probe.mjs --plugin <path>       # any copy — e.g. the pre-fix HEAD
 *                                            # revision, where the probe goes RED
 * Deps: react/react-dom/nanostores/jsdom from $HERMES_DESKTOP_MODULES or
 *       ~/.hermes/hermes-agent/node_modules
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MODULES = process.env.HERMES_DESKTOP_MODULES || path.join(os.homedir(), '.hermes/hermes-agent/node_modules')
const argIdx = process.argv.indexOf('--plugin')
const PLUGIN = argIdx !== -1 ? path.resolve(process.argv[argIdx + 1]) : path.join(HERE, 'plugin.js')

const smoke = fs.readFileSync(path.join(HERE, 'smoke-render.mjs'), 'utf8')
const stubMatch = smoke.match(/const SDK_STUB = `([\s\S]*?)`\n/)
const iconsMatch = smoke.match(/const ICON_NAMES = new Set\(`([\s\S]*?)`\.split/)
if (!stubMatch || !iconsMatch) throw new Error('could not lift SDK_STUB / ICON_NAMES from smoke-render.mjs')

const raw = fs.readFileSync(PLUGIN, 'utf8')

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`) }
}

/** One fresh copy of plugin.js + a fresh harness module, symlinked deps. */
function makeSandbox(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hive-f10-${label}-`))
  const nm = path.join(dir, 'node_modules')
  fs.mkdirSync(path.join(nm, '@hermes/plugin-sdk'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  for (const pkg of ['react', 'react-dom', 'nanostores', 'jsdom']) {
    const from = path.join(MODULES, pkg)
    if (!fs.existsSync(from)) { console.error(`f10-probe: missing ${from}`); process.exit(2) }
    fs.symlinkSync(from, path.join(nm, pkg), 'dir')
  }
  fs.writeFileSync(path.join(nm, '@hermes/plugin-sdk/package.json'),
    JSON.stringify({ name: '@hermes/plugin-sdk', type: 'module', main: 'index.mjs', exports: { '.': './index.mjs' } }))
  fs.writeFileSync(path.join(nm, '@hermes/plugin-sdk/index.mjs'), stubMatch[1])
  fs.writeFileSync(path.join(dir, 'plugin.js'), raw)
  fs.writeFileSync(path.join(dir, 'harness.mjs'),
    `export * as React from 'react'\nexport { act } from 'react'\nexport { createRoot } from 'react-dom/client'\nexport { JSDOM } from 'jsdom'\n`)
  return { dir, nm }
}

/**
 * Mount the real plugin in jsdom. `seed` pre-loads the plugin's own storage, so
 * the room boots with a roster instead of minting @default — the only way to
 * reach a hydrated roster with a pinned leader without a live gateway.
 */
async function mount(label, opts = {}) {
  const { dir, nm } = makeSandbox(label)
  const harness = await import(pathToFileURL(path.join(dir, 'harness.mjs')).href)
  const { JSDOM, act, createRoot } = harness

  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',
    { url: 'http://localhost/', pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Node = dom.window.Node
  globalThis.MouseEvent = dom.window.MouseEvent
  globalThis.getComputedStyle = dom.window.getComputedStyle
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const inflight = []
  let minted = 0
  dom.window.hermesDesktop = {
    api: ({ path: p, method } = {}) => {
      if (p === '/api/profiles' && (!method || method === 'GET')) return new Promise((r) => inflight.push(r))
      return Promise.resolve({ runs: [], total: 0, profiles: [] })
    }
  }
  globalThis.__HIVE_ICONS__ = new Set(iconsMatch[1].split(/\s+/).filter(Boolean))
  const listeners = new Map()
  globalThis.__HIVE_HOST__ = {
    notify: () => {}, notifyError: () => {}, navigate: () => {}, revealPane: () => {},
    request: async (method) => {
      if (method === 'session.create') {
        minted += 1
        return { session_id: `live-${minted}`, stored_session_id: `stored-${minted}` }
      }
      if (method === 'projects.list') return { projects: [] }
      return {}
    },
    onEvent: (type, fn) => { listeners.set(type, fn); return () => listeners.delete(type) }
  }

  const mod = await import(pathToFileURL(path.join(dir, 'plugin.js')).href)
  const registered = []
  const storage = new Map(opts.seed || [])
  const ctx = {
    source: 'plugin:buzz-hive',
    storage: { get: (k, d) => (storage.has(k) ? storage.get(k) : d), set: (k, v) => storage.set(k, v), remove: (k) => storage.delete(k) },
    register: (c) => { registered.push(c); return () => {} },
    registerMany: () => () => {},
    onDispose: () => {},
    onEvent: (t, fn) => { listeners.set(t, fn); return () => listeners.delete(t) },
    setTimeout: () => () => {}, setInterval: () => () => {}, addEventListener: () => () => {},
    rest: async () => ({}), socket: () => () => {},
    os: { writeClipboard: async () => true, notify: () => {}, openExternal: async () => true, revealPath: async () => true, pickSavePath: async () => null, pickOpenPath: async () => null },
    runAction: () => ({ ok: true }), listActions: () => [], i18n: {}
  }
  mod.default.register(ctx)
  await new Promise((r) => setImmediate(r))
  const page = registered.find((c) => c.id === 'page')
  if (!page) throw new Error('page did not register')

  const container = dom.window.document.getElementById('root')
  const root = createRoot(container)
  await act(async () => { root.render(page.render()) })
  await act(async () => { await new Promise((r) => setImmediate(r)) })

  const doc = () => dom.window.document
  const html = () => container.innerHTML
  const rowSel = (agent) => `.ts-row[data-agent="${agent}"]`
  const rowEl = (agent) => doc().querySelector(rowSel(agent))
  const pinEl = (agent) => doc().querySelector(`${rowSel(agent)} .ts-row-pin`)
  const crowns = () => [...doc().querySelectorAll('.ts-lead-crown')]
  const crownIn = (agent) => doc().querySelector(`${rowSel(agent)} .ts-lead-crown`)
  const memberOrder = () => [...doc().querySelectorAll('.ts-row[data-agent]')].map((r) => r.getAttribute('data-agent'))
  const pinState = (agent) => {
    const el = pinEl(agent)
    return el ? { on: el.getAttribute('data-on'), pressed: el.getAttribute('aria-pressed'), label: (el.textContent || '').trim() } : null
  }
  /** Click a real element by selector, INSIDE act(), so the commit lands. */
  const clickIn = async (selector) => {
    let hit = null
    await act(async () => {
      const el = doc().querySelector(selector)
      if (el) { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); hit = el }
      await new Promise((r) => setImmediate(r))
    })
    return hit
  }
  const settle = async (profiles) => {
    const res = inflight.shift()
    if (!res) return false
    await act(async () => { res({ profiles }); await new Promise((r) => setImmediate(r)) })
    return true
  }
  const rowText = (agent) => doc().querySelector(`${rowSel(agent)} .ts-row-name`)
  /** 'before' when `a` precedes `b` in document order (siblings in the row). */
  const docOrder = (a, b) => {
    if (!a || !b) return 'missing'
    const pos = a.compareDocumentPosition(b)
    if (pos & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) return 'before'
    if (pos & dom.window.Node.DOCUMENT_POSITION_PRECEDING) return 'after'
    return 'nested'
  }
  const flush = async () => { await act(async () => { await new Promise((r) => setImmediate(r)) }) }
  const close = async () => { await act(async () => { root.unmount() }); fs.rmSync(dir, { recursive: true, force: true }) }
  return { html, crowns, crownIn, memberOrder, pinState, rowText, docOrder, clickIn, settle, flush, close, storage }
}

// ── §A  a hydrated roster with a pinned leader paints one crown, before the name
console.log('F-10 §A — a pinned member carries the crown, and only one member can')
const seed = [[
  'hive.v2',
  {
    members: [
      { profile: 'atlas', order: 0, leader: true, storedId: null },
      { profile: 'forge', order: 1, leader: false, storedId: null }
    ],
    timeline: []
  }
]]
const room = await mount('room', { seed })
ok('the hydrated roster renders both seeded members',
  room.memberOrder().join() === 'atlas,forge' && !!room.pinState('forge'),
  { agents: room.memberOrder() })
ok('the pinned member is crowned', !!room.crownIn('atlas'), { crowns: room.crowns().length })
ok('nobody else is crowned', room.crowns().length === 1 && !room.crownIn('forge'), { crowns: room.crowns().length })
const crown = room.crownIn('atlas')
ok('the crown is an inline SVG, not an emoji glyph',
  !!crown && crown.tagName.toLowerCase() === 'svg' && !!crown.querySelector('path'), { tag: crown ? crown.tagName : null })
ok('the crown is labelled "Team lead" for assistive tech',
  !!crown && crown.getAttribute('aria-label') === 'Team lead'
    && ((crown.querySelector('title') || {}).textContent === 'Team lead'),
  { label: crown ? crown.getAttribute('aria-label') : null, title: crown ? (crown.querySelector('title') || {}).textContent : null })
// Document order inside the row: the crown has to precede the name it marks.
const nameEl = room.rowText('atlas')
const order = room.docOrder(crown, nameEl)
ok('the crown sits BEFORE the member name on the row', order === 'before', { order: order })
ok('the leader sorts first and the other row keeps its place',
  room.memberOrder().join() === 'atlas,forge', { order: room.memberOrder() })
ok('the pinned row\'s toggle reads as the ACTION ("Unpin")',
  room.pinState('atlas').label === 'Unpin' && room.pinState('atlas').on === 'true',
  { atlas: room.pinState('atlas'), forge: room.pinState('forge') })

// ── §B  pinning another member unpins the first, in the same commit
console.log('')
console.log('F-10 §B — pinning B unpins A: one leader, one crown')
const pinClicked = await room.clickIn('.ts-row[data-agent="forge"] .ts-row-pin')
ok('the second member\'s row pin is a real, clickable button', !!pinClicked, {})
ok('exactly one crown remains in the room', room.crowns().length === 1, { crowns: room.crowns().length })
ok('the crown moved to B\'s row', !!room.crownIn('forge') && !room.crownIn('atlas'),
  { forge: !!room.crownIn('forge'), atlas: !!room.crownIn('atlas') })
ok('A is unpinned, not dropped from the room', room.memberOrder().includes('atlas') && room.pinState('atlas').on === 'false',
  { order: room.memberOrder(), atlas: room.pinState('atlas') })
ok('B now reads as the lead', room.pinState('forge').on === 'true' && room.pinState('forge').label === 'Unpin',
  { forge: room.pinState('forge') })
ok('the roster reads B first, A behind it', room.memberOrder().join() === 'forge,atlas', { order: room.memberOrder() })

// ── §C  unpinning the leader clears the room
console.log('')
console.log('F-10 §C — unpinning the leader leaves no crown at all')
await room.clickIn('.ts-row[data-agent="forge"] .ts-row-pin')
ok('no crown anywhere once the leader is unpinned', room.crowns().length === 0, { crowns: room.crowns().length })
ok('both rows read as unpinned',
  room.pinState('forge').on === 'false' && room.pinState('atlas').on === 'false',
  { forge: room.pinState('forge'), atlas: room.pinState('atlas') })
ok('both members are still in the room, back in stable order', room.memberOrder().join() === 'atlas,forge', { order: room.memberOrder() })
await room.close()

// ── §D  the mint path is exclusive too (Add-as-leader via the popover)
console.log('')
console.log('F-10 §D — a member added as leader clears the leader that was already there')
const mint = await mount('mint', { seed })
ok('the room boots with the seeded leader crowned', mint.crowns().length === 1 && !!mint.crownIn('atlas'), {})
// Open the popover from the dock's own Add-agent button.
const opened = await mint.clickIn('button[aria-label="Add agent"]')
ok('the dock opens the Add-agent popover', !!opened && mint.html().includes('ts-addpop'), { opened: !!opened })
ok('the popover starts its own profile fetch', await mint.settle([{ name: 'scout', model: 'demo' }]), {})
ok('the new profile is offered as a row', mint.html().includes('@scout') && mint.html().includes('ts-addpop-row'), {})
// Pin it AT ADD TIME (the popover row's own toggle), then add it.
const popPin = await mint.clickIn('.ts-addpop-row .ts-addpop-pin')
ok('the popover row toggle pins the profile before it is added',
  !!popPin && mint.html().includes('data-pin="true"'), { pinned: mint.html().includes('data-pin="true"') })
const added = await mint.clickIn('button[title="Add @scout to the room"]')
ok('the pinned profile is added to the room', !!added && !!mint.pinState('scout'), { order: mint.memberOrder() })
ok('exactly one crown in the room after the mint', mint.crowns().length === 1, { crowns: mint.crowns().length })
ok('the crown is the NEW member\'s', !!mint.crownIn('scout'), {})
ok('the previous leader is cleared by the mint itself',
  !mint.crownIn('atlas') && mint.pinState('atlas').on === 'false',
  { atlas: mint.pinState('atlas') })
ok('the new leader sorts first', mint.memberOrder()[0] === 'scout', { order: mint.memberOrder() })
await mint.close()

// ── §E  a room saved by the pre-fix build (two leads) hydrates with ONE crown
console.log('')
console.log('F-10 §E — a legacy room holding two pinned members collapses on boot')
// The old pin toggled only its target, so pinning A then B wrote `leader: true`
// on both. That is the reporter's own on-disk state after the upgrade, and boot
// must repair it rather than paint two crowns over the bug this card removes.
const legacySeed = [[
  'hive.v2',
  {
    members: [
      { profile: 'atlas', order: 0, leader: true, storedId: null },
      { profile: 'forge', order: 1, leader: true, storedId: null },
      { profile: 'scout', order: 2, leader: false, storedId: null }
    ],
    timeline: []
  }
]]
const legacy = await mount('legacy', { seed: legacySeed })
ok('the legacy room hydrates with every member', legacy.memberOrder().length === 3, { order: legacy.memberOrder() })
ok('exactly ONE crown survives the hydrate', legacy.crowns().length === 1, { crowns: legacy.crowns().length })
ok('the crown belongs to the lowest-`order` lead', !!legacy.crownIn('atlas'), { order: legacy.memberOrder() })
ok('the other pinned member is unpinned by the hydrate',
  !legacy.crownIn('forge') && legacy.pinState('forge').on === 'false', { forge: legacy.pinState('forge') })
ok('the roster reads one lead, then stable order', legacy.memberOrder().join() === 'atlas,forge,scout',
  { order: legacy.memberOrder() })
const persisted = legacy.storage.get('hive.v2')
const persistedLeads = ((persisted && persisted.members) || []).filter((m) => m && m.leader === true).map((m) => m.profile)
ok('the repair is WRITTEN BACK, not just held in memory', persistedLeads.join() === 'atlas', { persistedLeads })
await legacy.close()

console.log('')
console.log(fail ? `FAIL ${fail}/${pass + fail}` : `ALL PASS ${pass}/${pass + fail}`)
process.exit(fail ? 1 : 0)
