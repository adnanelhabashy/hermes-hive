#!/usr/bin/env node
/**
 * f9-probe.mjs — evidence for P1.5 F-9 (add-agent popover loading state).
 *
 * Renders the REAL plugin.js with the same SDK stub smoke-render.mjs uses. The
 * harness forces the popover open and sets `loadState` to each of its three
 * values, then asserts what the popover actually paints in each:
 *
 *   loading -> "Loading profiles…" + skeleton rows, and NEVER the empty copy
 *   idle    -> the profile rows
 *   idle + genuinely empty list -> "Every profile is already in the room."
 *   error   -> "Couldn't load profiles." + Retry
 *
 * P1.5 F-9b split the render input in two: `loadState` (the fetch's state) and
 * `loaded` (whether a fetch has ever settled). The settled fixtures below force
 * BOTH, because "idle with rows" only means anything once a fetch has settled —
 * before that the popover deliberately paints loading (the CTA bug). The
 * never-settled case is f9b-probe.mjs §B/§C.
 *
 * The three states are the ones `load()` produces; this proves the RENDER is
 * branch-correct. That `load()` enters 'loading' before awaiting the fetch is
 * asserted separately from the source (the click is not reachable in SSR).
 *
 * USAGE: node f9-probe.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MODULES = process.env.HERMES_DESKTOP_MODULES || path.join(os.homedir(), '.hermes/hermes-agent/node_modules')
const PLUGIN = path.join(HERE, 'plugin.js')

const smoke = fs.readFileSync(path.join(HERE, 'smoke-render.mjs'), 'utf8')
const stubMatch = smoke.match(/const SDK_STUB = `([\s\S]*?)`\n/)
const iconsMatch = smoke.match(/const ICON_NAMES = new Set\(`([\s\S]*?)`\.split/)
if (!stubMatch || !iconsMatch) throw new Error('could not lift SDK_STUB / ICON_NAMES from smoke-render.mjs')

const raw = fs.readFileSync(PLUGIN, 'utf8')
const OPEN_FROM = 'const $tsAddOpen = atom(false)'
const OPEN_TO = 'const $tsAddOpen = atom(true)'
const LOAD_FROM = "const [loadState, setLoadState] = useState('idle')"
const LOADED_FROM = 'const [loaded, setLoaded] = useState(false)'
const PROFILES_FROM = 'const [profiles, setProfiles] = useState([])'
if (!raw.includes(OPEN_FROM)) throw new Error('$tsAddOpen patch site not found')
if (!raw.includes(LOAD_FROM)) throw new Error('loadState patch site not found')
if (!raw.includes(LOADED_FROM)) throw new Error('loaded patch site not found')
if (!raw.includes(PROFILES_FROM)) throw new Error('profiles patch site not found')

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`) }
}

/** Render the real plugin with the popover open and `loadState` forced. */
async function paintWith(loadState, profiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-f9-'))
  const nm = path.join(dir, 'node_modules')
  fs.mkdirSync(path.join(nm, '@hermes/plugin-sdk'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  for (const pkg of ['react', 'react-dom', 'nanostores']) {
    const from = path.join(MODULES, pkg)
    if (!fs.existsSync(from)) { console.error(`f9-probe: missing ${from}`); process.exit(2) }
    fs.symlinkSync(from, path.join(nm, pkg), 'dir')
  }
  fs.writeFileSync(path.join(nm, '@hermes/plugin-sdk/package.json'),
    JSON.stringify({ name: '@hermes/plugin-sdk', type: 'module', main: 'index.mjs', exports: { '.': './index.mjs' } }))
  fs.writeFileSync(path.join(nm, '@hermes/plugin-sdk/index.mjs'), stubMatch[1])
  fs.writeFileSync(path.join(dir, 'plugin.js'), raw
    .replace(OPEN_FROM, OPEN_TO)
    .replace(LOAD_FROM, `const [loadState, setLoadState] = useState('${loadState}')`)
    // F-9b: every fixture here models a fetch that has SETTLED (the phase reads
    // `loaded`); the never-settled popover is f9b-probe's subject, not this one.
    .replace(LOADED_FROM, 'const [loaded, setLoaded] = useState(true)')
    .replace(PROFILES_FROM, `const [profiles, setProfiles] = useState(${JSON.stringify(profiles)})`))

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
    api: async ({ path: p }) => (p === '/api/profiles' ? { profiles } : { runs: [], total: 0 })
  }
  globalThis.__HIVE_ICONS__ = new Set(iconsMatch[1].split(/\s+/).filter(Boolean))
  const listeners = new Map()
  let created = 0
  globalThis.__HIVE_HOST__ = {
    notify: () => {}, notifyError: () => {}, navigate: () => {}, revealPane: () => {},
    request: async (method) => {
      if (method === 'session.create') { created++; return { session_id: `live-${created}`, stored_session_id: `stored-${created}` } }
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
  const { renderToString } = await import(pathToFileURL(path.join(MODULES, 'react-dom/server.node.mjs')).href)
    .catch(async () => await import(pathToFileURL(path.join(MODULES, 'react-dom/server.js')).href))
  const html = renderToString(page.render())
  fs.rmSync(dir, { recursive: true, force: true })
  return html
}

const EMPTY_COPY = 'Every profile is already in the room.'
const LOADING_COPY = 'Loading profiles…'

console.log('F-9 — the add-agent popover has its own loading state')

const loading = await paintWith('loading', [{ name: 'default' }, { name: 'scout' }])
ok('loading paints its own copy', loading.includes(LOADING_COPY), { has: loading.includes(LOADING_COPY) })
ok('loading paints skeleton rows', loading.includes('data-ts-addpop-loading') && loading.includes('ts-skel-row'),
  { marked: loading.includes('data-ts-addpop-loading'), skel: loading.includes('ts-skel-row') })
ok('loading is announced as busy status, not an empty result',
  /role="status"/.test(loading) && /aria-busy="true"/.test(loading),
  { status: /role="status"/.test(loading), busy: /aria-busy="true"/.test(loading) })
ok('loading NEVER reads "Every profile is already in the room."', !loading.includes(EMPTY_COPY),
  { emptyCopy: loading.includes(EMPTY_COPY) })
ok('loading paints no profile rows yet', !loading.includes('@scout'), { rows: loading.includes('@scout') })

const idle = await paintWith('idle', [{ name: 'default' }, { name: 'scout' }])
ok('idle with profiles paints the rows', idle.includes('@scout') && idle.includes('ts-addpop-row'),
  { rows: idle.includes('ts-addpop-row') })
ok('idle with profiles paints no loading copy', !idle.includes(LOADING_COPY) && !idle.includes('data-ts-addpop-loading'))

const empty = await paintWith('idle', [])
ok('a genuinely empty list still says "Every profile is already in the room."',
  empty.includes(EMPTY_COPY), { emptyCopy: empty.includes(EMPTY_COPY) })
ok('a genuinely empty list paints no loading copy', !empty.includes(LOADING_COPY) && !empty.includes('data-ts-addpop-loading'))

const error = await paintWith('error', [])
ok('error keeps its own copy and a Retry action',
  error.includes('Couldn’t load profiles.') && />\s*Retry\s*</.test(error),
  { copy: error.includes('Couldn’t load profiles.'), retry: />\s*Retry\s*</.test(error) })
ok('error paints no loading copy', !error.includes(LOADING_COPY) && !error.includes('data-ts-addpop-loading'))

// The click path: `load()` must set 'loading' BEFORE awaiting the fetch, or the
// loading branch is unreachable no matter how correct the render is.
console.log('F-9 — the click path enters loading before it awaits')
const loadBody = raw.slice(raw.indexOf('const load = () =>'), raw.indexOf('const toggle = () =>'))
ok('load() sets loadState loading before calling hiveFetchProfiles',
  loadBody.indexOf("setLoadState('loading')") !== -1
    && loadBody.indexOf("setLoadState('loading')") < loadBody.indexOf('hiveFetchProfiles'),
  loadBody.trim())
ok('load() leaves loading for idle-or-error once the fetch settles',
  /setLoadState\(p\.length \? 'idle' : 'error'\)/.test(loadBody), loadBody.trim())

console.log('')
console.log(fail ? `FAIL ${fail}/${pass + fail}` : `ALL PASS ${pass}/${pass + fail}`)
process.exit(fail ? 1 : 0)
