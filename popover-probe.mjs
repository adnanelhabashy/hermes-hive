#!/usr/bin/env node
/**
 * popover-probe.mjs — measurement evidence for the "Add agent" roster popover
 * (kanban F-P1-R1). NOT a replica: it server-renders the REAL plugin.js with
 * React + the same @hermes/plugin-sdk stub `smoke-render.mjs` uses, applies the
 * REAL injected stylesheet plus the installed app stylesheet, and reads the
 * browser's own layout engine in headless Chrome.
 *
 * The only edit to the plugin is a harness-local copy: `HiveAddMember`'s `open`
 * state starts true and `$tsSheets` starts `{team:true,right:false}`, so the
 * popover mark-up for BOTH mount sites (team column + team overlay sheet) is in
 * the DOM without needing a click. plugin.js in the repo is never touched.
 *
 * For every rendered popover it reports the bounding box and the VISIBLE
 * rectangle after intersecting with every clipping ancestor (overflow != visible)
 * and the viewport — i.e. how much of it the user can actually see and read.
 *
 * USAGE: node popover-probe.mjs [--plugin=<path>] [--widths=1512,1200,1000,700,600,500]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const PLUGIN = path.resolve(arg('plugin', path.join(HERE, 'plugin.js')))
const WIDTHS = arg('widths', '1512,1200,1000,700,600,500').split(',').map(Number)
const MODULES = process.env.HERMES_DESKTOP_MODULES || path.join(os.homedir(), '.hermes/hermes-agent/node_modules')
const APP_CSS = process.env.HIVE_APP_CSS ||
  '/Applications/Hermes.app/Contents/Resources/app.asar.unpacked/dist/assets/index-B89n1Ils.css'
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/* ── lift the SDK stub + icon set verbatim out of smoke-render.mjs ─────────── */
const smoke = fs.readFileSync(path.join(HERE, 'smoke-render.mjs'), 'utf8')
const stubMatch = smoke.match(/const SDK_STUB = `([\s\S]*?)`\n/)
const iconsMatch = smoke.match(/const ICON_NAMES = new Set\(`([\s\S]*?)`\.split/)
if (!stubMatch || !iconsMatch) throw new Error('could not lift SDK_STUB / ICON_NAMES from smoke-render.mjs')
const SDK_STUB = stubMatch[1]
const ICON_NAMES = iconsMatch[1]

/* ── harness-local plugin copy: force the popover open, force the sheet mount ─ */
const raw = fs.readFileSync(PLUGIN, 'utf8')
const OPEN_FROM = "  const [open, setOpen] = useState(false)\n  const [loadState, setLoadState] = useState('idle')"
const OPEN_TO = "  const [open, setOpen] = useState(true)\n  const [loadState, setLoadState] = useState('idle')"
const SHEET_FROM = 'const $tsSheets = atom({ team: false, right: false })'
const SHEET_TO = 'const $tsSheets = atom({ team: true, right: false })'
const CREATE_FROM = '  const [creating, setCreating] = useState(false)\n  const rootRef = useRef(null)'
const CREATE_TO = '  const [creating, setCreating] = useState(true)\n  const rootRef = useRef(null)'
const WANT_CREATE = process.argv.includes('--creating')
if (!raw.includes(OPEN_FROM)) throw new Error('open-state patch site not found')
if (!raw.includes(SHEET_FROM)) throw new Error('$tsSheets patch site not found')
if (WANT_CREATE && !raw.includes(CREATE_FROM)) throw new Error('creating-state patch site not found')
let patched = raw.replace(OPEN_FROM, OPEN_TO).replace(SHEET_FROM, SHEET_TO)
if (WANT_CREATE) patched = patched.replace(CREATE_FROM, CREATE_TO)

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-popover-'))
const nm = path.join(dir, 'node_modules')
fs.mkdirSync(path.join(nm, '@hermes/plugin-sdk'), { recursive: true })
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
for (const pkg of ['react', 'react-dom', 'nanostores']) {
  const from = path.join(MODULES, pkg)
  if (!fs.existsSync(from)) { console.error(`popover-probe: missing ${from}`); process.exit(2) }
  fs.symlinkSync(from, path.join(nm, pkg), 'dir')
}
fs.writeFileSync(path.join(nm, '@hermes/plugin-sdk/package.json'),
  JSON.stringify({ name: '@hermes/plugin-sdk', type: 'module', main: 'index.mjs', exports: { '.': './index.mjs' } }))
fs.writeFileSync(path.join(nm, '@hermes/plugin-sdk/index.mjs'), SDK_STUB)
fs.writeFileSync(path.join(dir, 'plugin.js'), patched)

/* ── the renderer globals the plugin expects (mirrors smoke-render.mjs) ────── */
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
globalThis.__HIVE_ICONS__ = new Set(ICON_NAMES.split(/\s+/).filter(Boolean))
const listeners = new Map()
let created = 0
globalThis.__HIVE_HOST__ = {
  notify: () => {}, notifyError: () => {}, navigate: () => {}, revealPane: () => {},
  request: async (method, params) => {
    if (method === 'session.create') { created++; return { session_id: `live-${created}`, stored_session_id: `stored-${created}` } }
    if (method === 'projects.list') return { projects: [] }
    return {}
  },
  onEvent: (type, fn) => { listeners.set(type, fn); return () => listeners.delete(type) }
}

const mod = await import(pathToFileURL(path.join(dir, 'plugin.js')).href)
const plugin = mod.default
const registered = []
const ctx = {
  source: 'plugin:buzz-hive',
  storage: (() => { const m = new Map(); return { get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) } })(),
  register: (c) => { registered.push(c); return () => {} },
  registerMany: () => () => {},
  onDispose: () => {},
  onEvent: (t, fn) => { listeners.set(t, fn); return () => listeners.delete(t) },
  setTimeout: (fn) => { return () => {} },
  setInterval: () => () => {},
  addEventListener: () => () => {},
  rest: async () => ({}),
  socket: () => () => {},
  os: { writeClipboard: async () => true, notify: () => {}, openExternal: async () => true, revealPath: async () => true, pickSavePath: async () => null, pickOpenPath: async () => null },
  runAction: () => ({ ok: true }), listActions: () => [], i18n: {}
}
plugin.register(ctx)
await new Promise((r) => setImmediate(r))
const page = registered.find((c) => c.id === 'page')
if (!page) throw new Error('page component did not register')
const { renderToString } = await import(pathToFileURL(path.join(MODULES, 'react-dom/server.node.mjs')).href).catch(
  async () => await import(pathToFileURL(path.join(MODULES, 'react-dom/server.js')).href))
const html = renderToString(page.render()).replace(/\sautofocus(=("")?)?/g, '')
if (!html.includes('data-ts-workspace="true"')) throw new Error('workspace did not render')

const css = injected.get('buzz-hive-team-studio')
if (!css) throw new Error('stylesheet was not injected')

/* ── the measuring page ───────────────────────────────────────────────────── */
// The SDK stub renders Button/Input as bare elements, so the cva size classes
// the installed components add are missing and every control falls back to the
// browser default (a 300 px-wide button). These rules restore the resolved
// metrics from the installed source (button.tsx size 'sm' = px-2.5 py-1 text-xs
// leading-4 gap-1.5; control.ts size 'default' = px-2.5 py-1.5 text-xs
// leading-4) so the trigger geometry matches the app. Calibrated against
// SENTRY's live A1 anchor (`+ Add` occupies 62x24 px).
const harnessControls = `
button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:2.5px;background:transparent;color:var(--ui-text-secondary);padding:4px 10px;font-size:12px;line-height:16px;font-weight:500;white-space:nowrap;cursor:pointer}
button svg{width:14px;height:14px;flex:none}
input{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--ui-stroke-secondary);border-radius:2.5px;background:transparent;color:var(--ui-text-primary);padding:6px 10px;font-size:12px;line-height:16px;outline:none}
/* The stub's ScrollArea is a bare div; the installed ScrollArea root carries
   'relative overflow-hidden' around a 'size-full' viewport, so it contributes no
   intrinsic content height and its flex basis collapses — which is what puts the
   dock at the bottom of the column in the app (SENTRY's live read: the Add
   button sits at the column's bottom, y≈838). Emulate that here. */
.ts-scroll{position:relative;overflow:hidden;flex:1 1 0%;min-height:0}
`
const measure = `
<pre id="probe-out"></pre>
<script>
window.addEventListener('load', function () {
  requestAnimationFrame(function () {
   try {
    var out = { innerWidth: window.innerWidth, innerHeight: window.innerHeight, popovers: [] };
    var els = Array.prototype.slice.call(document.querySelectorAll('.ts-dock .ts-addpop, .ts-dock .z-20'));
    els.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var vis = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      var chain = [];
      for (var n = el.parentElement; n; n = n.parentElement) {
        var cs = getComputedStyle(n);
        var ox = cs.overflowX, oy = cs.overflowY;
        if (ox === 'visible' && oy === 'visible') continue;
        var b = n.getBoundingClientRect();
        chain.push({ cls: String(n.className).slice(0, 60), overflow: ox + '/' + oy,
                     rect: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)] });
        if (ox !== 'visible') { vis.l = Math.max(vis.l, b.left); vis.r = Math.min(vis.r, b.right); }
        if (oy !== 'visible') { vis.t = Math.max(vis.t, b.top); vis.b = Math.min(vis.b, b.bottom); }
      }
      vis.l = Math.max(vis.l, 0); vis.t = Math.max(vis.t, 0);
      vis.r = Math.min(vis.r, window.innerWidth); vis.b = Math.min(vis.b, window.innerHeight);
      var visW = Math.max(0, vis.r - vis.l), visH = Math.max(0, vis.b - vis.t);
      var area = Math.max(1, r.width * r.height);
      function textOf(sel) {
        var t = el.querySelector(sel);
        if (!t) return null;
        var tr = t.getBoundingClientRect();
        var fully = tr.left >= vis.l - 0.5 && tr.right <= vis.r + 0.5 && tr.top >= vis.t - 0.5 && tr.bottom <= vis.b + 0.5;
        return { sel: sel, text: (t.textContent || '').trim().slice(0, 40),
                 rect: [Math.round(tr.left), Math.round(tr.top), Math.round(tr.right), Math.round(tr.bottom)],
                 visible: t.offsetWidth > 0 && t.offsetHeight > 0 && fully };
      }
      // mount site: the nearest .ts-sheet ancestor means the overlay-sheet copy
      var site = 'column';
      var panel = null, dockEl = null;
      for (var a = el.parentElement; a; a = a.parentElement) {
        if (!panel && a.classList && a.classList.contains('ts-col-team')) panel = a;
        if (!dockEl && a.classList && a.classList.contains('ts-dock')) dockEl = a;
        if (a.classList && a.classList.contains('ts-sheet')) { site = 'sheet'; }
      }
      function rc(n) { if (!n) return null; var b = n.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }
      var addBtn = el.parentElement ? el.parentElement.lastElementChild : null;
      out.popovers.push({
        site: site,
        rendered: r.width > 0 && r.height > 0,
        addButton: rc(addBtn),
        wrapper: rc(el.parentElement),
        dock: rc(dockEl),
        panel: panel ? { rect: rc(panel), clientH: panel.clientHeight, scrollH: panel.scrollHeight,
          kids: Array.prototype.map.call(panel.children, function (k) { var cs = getComputedStyle(k); var b = k.getBoundingClientRect();
            return { cls: String(k.className).slice(0, 40), rect: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)],
                     flex: cs.flex, overflow: cs.overflow, display: cs.display } }) } : null,
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        size: [Math.round(r.width), Math.round(r.height)],
        clipChain: chain,
        visibleRect: [Math.round(vis.l), Math.round(vis.t), Math.round(vis.r), Math.round(vis.b)],
        visibleSize: [Math.round(visW), Math.round(visH)],
        visibleFraction: Math.round((visW * visH) / area * 1000) / 1000,
        heading: textOf('div.text-xs.font-medium'),
        search: textOf('input'),
        newProfile: textOf('div.flex > button, button:last-of-type')
      });
    });
    document.getElementById('probe-out').textContent = JSON.stringify(out);
   } catch (err) {
    document.getElementById('probe-out').textContent = JSON.stringify({ error: String(err && err.stack || err) });
   }
  });
});
</script>`

const pageHtml = `<!doctype html><html><head><meta charset="utf-8">` +
  (fs.existsSync(APP_CSS) ? `<link rel="stylesheet" href="file://${APP_CSS}">` : '') +
  `<style id="buzz-hive-team-studio">${css.textContent}</style>` +
  `<style id="hive-harness-controls">${harnessControls}</style></head><body>${html}${measure}</body></html>`
const file = path.join(dir, 'popover.html')
fs.writeFileSync(file, pageHtml)

console.log(`plugin : ${PLUGIN}`)
console.log(`harness: ${file}`)
console.log(`chrome : ${CHROME}\n`)

let bad = 0
for (const w of WIDTHS) {
  let out = null
  for (let a = 1; a <= 3 && !out; a++) {
    const dom = execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--force-device-scale-factor=1',
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
      `--user-data-dir=${path.join(dir, `p-${w}-${a}`)}`,
      `--window-size=${w},900`, '--virtual-time-budget=4000', '--dump-dom', `file://${file}`
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
    const hit = dom.match(/<pre id="probe-out">([\s\S]*?)<\/pre>/)
    if (hit && hit[1].trim()) {
      out = JSON.parse(hit[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'))
    }
  }
  if (!out) throw new Error(`no measurement payload at width ${w}`)
  if (out.error) { console.log(`── viewport ${w}: HARNESS ERROR\n   ${out.error}\n`); bad++; continue }
  console.log(`── viewport ${out.innerWidth}x${out.innerHeight}`)
  if (!out.popovers.length) { console.log('   (no popover in the DOM)'); bad++; console.log(''); continue }
  for (const p of out.popovers) {
    if (!p.rendered) { console.log(`   site=${p.site}: not rendered at this width (its mount site is display:none)`); continue }
    console.log(`   site=${p.site}`)
    console.log(`     addButton      ${JSON.stringify(p.addButton)}   wrapper ${JSON.stringify(p.wrapper)}`)
    console.log(`     dock           ${JSON.stringify(p.dock)}   panel ${JSON.stringify(p.panel)}`)
    console.log(`     box            ${JSON.stringify(p.rect)}  ${p.size[0]}x${p.size[1]}`)
    console.log(`     clip ancestors ${p.clipChain.length ? JSON.stringify(p.clipChain) : 'none'}`)
    console.log(`     visible        ${JSON.stringify(p.visibleRect)}  ${p.visibleSize[0]}x${p.visibleSize[1]}  = ${(p.visibleFraction * 100).toFixed(1)}% of the box`)
    for (const k of ['heading', 'search', 'newProfile']) {
      const t = p[k]
      if (t) console.log(`     ${k.padEnd(11)} "${t.text}" ${JSON.stringify(t.rect)} fully-visible=${t.visible}`)
    }
    if (p.visibleFraction < 0.999) bad++
  }
  console.log('')
}
console.log(bad === 0
  ? 'ALL POPOVERS FULLY VISIBLE — every roster popover measures inside its clip region and the viewport'
  : `CLIPPED — ${bad} popover(s) not fully visible`)
process.exitCode = bad === 0 ? 0 : 1
