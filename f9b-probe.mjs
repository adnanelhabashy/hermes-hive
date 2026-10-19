#!/usr/bin/env node
/**
 * f9b-probe.mjs — evidence for P1.5 F-9b (the `+ Add an agent` CTAs opened the
 * popover without ever starting the profile fetch).
 *
 * WHAT IT PROVES
 *  - The real plugin.js is imported UNMODIFIED, mounted in a real DOM (jsdom)
 *    with the real React runtime, and the popover is opened by CLICKING the
 *    two real CTA buttons the defect named:
 *        TsRoomEmpty  "This room is empty" / "+ Add an agent"
 *        Board empty  "No work items yet"  / "+ Add an agent"
 *    and, as a control, the dock's own "Add agent" button.
 *  - On that path `hiveFetchProfiles()` is actually invoked (the probe's
 *    /api/profiles bridge counts the calls), and while it is in flight the
 *    popover paints "Loading profiles…" — never "Every profile is already in
 *    the room.".
 *  - Once the fetch settles with rows, the rows are painted.
 *  - A genuinely all-present list still paints the empty copy (the fix did not
 *    delete the copy, it made it honest).
 *  - Reopening via the dock still refetches (the refresh-on-reopen behaviour
 *    `toggle()` used to own moved to the open effect; this keeps it).
 *
 * USAGE
 *   node f9b-probe.mjs                       # the working tree's plugin.js
 *   node f9b-probe.mjs --plugin <path>       # any copy (e.g. the pre-fix HEAD
 *                                            # revision — the probe must go RED)
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

const EMPTY_COPY = 'Every profile is already in the room.'
const LOADING_COPY = 'Loading profiles…'

/** One fresh copy of plugin.js + a fresh harness module, symlinked deps. */
function makeSandbox(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hive-f9b-${label}-`))
  const nm = path.join(dir, 'node_modules')
  fs.mkdirSync(path.join(nm, '@hermes/plugin-sdk'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  for (const pkg of ['react', 'react-dom', 'nanostores', 'jsdom']) {
    const from = path.join(MODULES, pkg)
    if (!fs.existsSync(from)) { console.error(`f9b-probe: missing ${from}`); process.exit(2) }
    fs.symlinkSync(from, path.join(nm, pkg), 'dir')
  }
  fs.writeFileSync(path.join(nm, '@hermes/plugin-sdk/package.json'),
    JSON.stringify({ name: '@hermes/plugin-sdk', type: 'module', main: 'index.mjs', exports: { '.': './index.mjs' } }))
  fs.writeFileSync(path.join(nm, '@hermes/plugin-sdk/index.mjs'), stubMatch[1])
  fs.writeFileSync(path.join(dir, 'plugin.js'), raw)
  // Bare specifiers resolve against this dir, so the harness and the plugin
  // share ONE React instance (same realpath, same loader cache entry).
  fs.writeFileSync(path.join(dir, 'harness.mjs'),
    `export * as React from 'react'\nexport { act } from 'react'\nexport { createRoot } from 'react-dom/client'\nexport { renderToString } from 'react-dom/server'\nexport { JSDOM } from 'jsdom'\n`)
  return { dir, nm }
}

/**
 * Mount the real plugin in jsdom and hand back the page plus a request log.
 * `/api/profiles` is served by a deferred the probe resolves by hand, so the
 * in-flight (loading) commit is observable instead of assumed.
 */
async function mount(label, opts = {}) {
  const { dir, nm } = makeSandbox(label)
  const harness = await import(pathToFileURL(path.join(dir, 'harness.mjs')).href)
  const { JSDOM, act, createRoot } = harness
  const React = harness.React

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

  const requests = []
  const inflight = []
  dom.window.hermesDesktop = {
    api: ({ path: p, method } = {}) => {
      requests.push({ path: p, method: method || 'GET' })
      if (p === '/api/profiles' && (!method || method === 'GET')) {
        return new Promise((resolve) => inflight.push(resolve))
      }
      return Promise.resolve({ runs: [], total: 0, profiles: [] })
    }
  }
  globalThis.__HIVE_ICONS__ = new Set(iconsMatch[1].split(/\s+/).filter(Boolean))
  const listeners = new Map()
  globalThis.__HIVE_HOST__ = {
    notify: () => {}, notifyError: () => {}, navigate: () => {}, revealPane: () => {},
    request: async (method) => {
      // `failMint` is how the probe reaches a genuinely EMPTY room: on a normal
      // boot the plugin mints @default and appends "@default joined the room", so
      // TsRoomEmpty never renders. A failed session.create leaves members [] and
      // timeline [] — the real state in which the UI says "This room is empty".
      if (method === 'session.create') {
        if (opts.failMint) throw new Error('session.create failed (probe: the room never starts)')
        return { session_id: 'live-1', stored_session_id: 'stored-1' }
      }
      if (method === 'projects.list') return { projects: [] }
      return {}
    },
    onEvent: (type, fn) => { listeners.set(type, fn); return () => listeners.delete(type) }
  }

  const mod = await import(pathToFileURL(path.join(dir, 'plugin.js')).href)
  const registered = []
  const ctx = {
    source: 'plugin:buzz-hive',
    storage: (() => { const m = new Map(); return { get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) } })(),
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

  const html = () => container.innerHTML
  const profileCalls = () => requests.filter((r) => r.path === '/api/profiles' && r.method === 'GET').length
  /** Click a real button by CSS selector; returns false when there is none. */
  const click = (selector) => {
    const el = dom.window.document.querySelector(selector)
    if (!el) return false
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    return true
  }
  const settle = async (profiles) => {
    const res = inflight.shift()
    // Returns false instead of throwing when nothing was in flight: on the
    // PRE-FIX plugin the CTA never starts a fetch, and the probe should report
    // that as the named check failing, not die before the later sections run.
    if (!res) return false
    await act(async () => { res({ profiles }); await new Promise((r) => setImmediate(r)) })
    return true
  }
  /**
   * Click the CTA inside the empty state carrying `marker`, INSIDE act(), so the
   * open transition and the effect it drives commit before the caller asserts.
   * (Clicking outside act() left the assertion one commit behind the click: the
   * popover had not opened yet and the fetch had not started, which read as a
   * failure of the fix when it was a failure of the probe's timing.)
   */
  const clickInEmpty = async (marker, selector = '.ts-linkcard') => {
    let hit = false
    await act(async () => {
      const block = [...dom.window.document.querySelectorAll('.ts-empty')]
        .find((d) => (d.textContent || '').includes(marker))
      const el = block && block.querySelector(selector)
      if (el) {
        el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
        hit = true
      }
      await new Promise((r) => setImmediate(r))
    })
    return hit
  }
  const flush = async () => { await act(async () => { await new Promise((r) => setImmediate(r)) }) }
  const close = async () => { await act(async () => { root.unmount() }); fs.rmSync(dir, { recursive: true, force: true }) }
  return { dom, container, html, requests, profileCalls, click, clickInEmpty, settle, flush, close, React, act }
}

// ── §A  the CTA sites are atom-only, and the fetch is open-driven ───────────
console.log('F-9b §A — both CTAs open the popover through the shared atom, and the popover owns its fetch')
const ctaRe = /onClick: \(\) => \$tsAddOpen\.set\(true\)/g
const ctaSites = (raw.match(ctaRe) || []).length
ok('the empty-room and Board CTAs carry the SAME atom-only handler', ctaSites === 2,
  { sites: ctaSites, want: 2 })
// Count real call sites, not the prose in the two comments that explain them.
const codeOnly = raw.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
const loadCalls = [...codeOnly.matchAll(/(?<![\w.])load\(\)/g)].length
ok('load() is no longer called from the dock button handler (only the open effect + Retry)',
  !/const toggle = \(\) => \{[^}]*load\(\)/.test(codeOnly) && loadCalls === 2,
  { loadCalls, toggleCallsLoad: /const toggle = \(\) => \{[^}]*load\(\)/.test(codeOnly) })

// ── §B  the empty-room CTA: real click, real fetch, real copy ───────────────
console.log('')
console.log('F-9b §B — "This room is empty" → "+ Add an agent" (TsRoomEmpty)')
const room = await mount('room', { failMint: true })
ok('the empty room teaches the CTA', room.html().includes('This room is empty'), {})
ok('no /api/profiles request before the CTA is used', room.profileCalls() === 0, { calls: room.profileCalls() })
const roomClicked = await room.clickInEmpty('This room is empty')
ok('the CTA click is dispatched', roomClicked, {})
ok('the popover opens', room.html().includes('ts-addpop'), {})
ok('the CTA path STARTS the profile fetch (hiveFetchProfiles invoked)', room.profileCalls() >= 1,
  { calls: room.profileCalls(), requests: room.requests })
await room.flush()
ok('while the fetch is in flight the popover paints "Loading profiles…"',
  room.html().includes(LOADING_COPY) && room.html().includes('data-ts-addpop-loading'),
  { loading: room.html().includes(LOADING_COPY), marked: room.html().includes('data-ts-addpop-loading') })
ok('the CTA path NEVER paints "Every profile is already in the room."',
  !room.html().includes(EMPTY_COPY), { emptyCopy: room.html().includes(EMPTY_COPY) })
const roomSettled = await room.settle([{ name: 'default', model: 'x' }, { name: 'scout', model: 'y' }])
ok('once the fetch settles the rows are painted',
  roomSettled && room.html().includes('@scout') && room.html().includes('ts-addpop-row'),
  { settled: roomSettled, rows: room.html().includes('ts-addpop-row') })
ok('the settled popover paints no loading copy', !room.html().includes(LOADING_COPY), {})
await room.close()

// ── §C  the Board empty-state CTA: the same defect, its own button ──────────
console.log('')
console.log('F-9b §C — Board empty state "No work items yet" → "+ Add an agent"')
const board = await mount('board', { failMint: true })
ok('the empty Board teaches its own CTA', board.html().includes('No work items yet'), {})
const boardCta = board.dom.window.document.querySelectorAll('.ts-empty .ts-linkcard')
ok('the Board CTA is a distinct button from the room CTA', boardCta.length === 2, { ctas: boardCta.length })
const boardClicked = await board.clickInEmpty('No work items yet')
ok('the Board CTA click is dispatched', boardClicked === true, {})
await board.flush()
ok('the Board CTA path STARTS the profile fetch (hiveFetchProfiles invoked)', board.profileCalls() >= 1,
  { calls: board.profileCalls() })
ok('the Board CTA path paints "Loading profiles…"', board.html().includes(LOADING_COPY), {})
ok('the Board CTA path NEVER paints "Every profile is already in the room."',
  !board.html().includes(EMPTY_COPY), { emptyCopy: board.html().includes(EMPTY_COPY) })
await board.settle([{ name: 'scout', model: 'y' }])
ok('the Board CTA path reaches the profile rows', board.html().includes('@scout'), {})
await board.close()

// ── §D  the copy is still reachable when it is TRUE ────────────────────────
console.log('')
console.log('F-9b §D — a genuinely all-present list still paints the empty copy')
const allPresent = await mount('allpresent', { failMint: true })
await allPresent.clickInEmpty('This room is empty')
await allPresent.flush()
await allPresent.settle([{ name: 'you', model: 'x' }])   // 'you' is always in the room
ok('an all-present list still says "Every profile is already in the room."',
  allPresent.html().includes(EMPTY_COPY), { emptyCopy: allPresent.html().includes(EMPTY_COPY) })
ok('an all-present list paints no loading copy', !allPresent.html().includes(LOADING_COPY), {})
await allPresent.close()

// ── §E  the dock button keeps the old contract: open fetches, reopen refetches
console.log('')
console.log('F-9b §E — the dock "Add agent" button still fetches on open and refetches on reopen')
const dock = await mount('dock')
const dockSel = 'button[aria-label="Add agent"]'
dock.click(dockSel)
await dock.flush()
ok('opening from the dock fetches', dock.profileCalls() === 1, { calls: dock.profileCalls() })
await dock.settle([{ name: 'scout', model: 'y' }])
dock.click(dockSel)                       // toggle closed
await dock.flush()
ok('closing paints no popover', !dock.html().includes('ts-addpop'), {})
dock.click(dockSel)                       // reopen
await dock.flush()
ok('reopening the dock refetches (the old refresh-on-reopen)', dock.profileCalls() === 2,
  { calls: dock.profileCalls() })
ok('the reopened popover paints loading, not the stale empty copy',
  dock.html().includes(LOADING_COPY) && !dock.html().includes(EMPTY_COPY), {})
await dock.close()

console.log('')
console.log(`plugin under test: ${PLUGIN}`)
console.log(fail ? `FAIL ${fail}/${pass + fail}` : `ALL PASS ${pass}/${pass + fail}`)
process.exit(fail ? 1 : 0)
