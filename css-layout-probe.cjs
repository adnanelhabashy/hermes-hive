/* css-layout-probe.cjs — computed-layout evidence for the Team Studio narrow-window rules.
 *
 * WHY: `smoke-render.mjs` applies no CSS, so a row that greps the stylesheet text
 * cannot tell whether a hide rule also matches INSIDE an overlay sheet. This probe
 * answers that with the browser's own cascade + layout engine.
 *
 * HOW:
 *   - HIVE_TS_CSS is extracted VERBATIM from plugin.js (no copy drift)
 *   - the harness DOM is the exact element/class structure `TsWorkspace` renders,
 *     including both lazily-mounted overlay sheets (`data-open="true"` as the
 *     lazy mount passes it) and the row bodies the roster renders
 *   - headless Chrome runs once per viewport width and reports
 *     getComputedStyle(el).display + getBoundingClientRect() from the live page
 *
 * USAGE:  node css-layout-probe.cjs [--plugin=<path/to/plugin.js>] [--widths=1200,1000,700,600,500]
 * EXIT:   0 only when every reachability expectation below holds.
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const HERE = __dirname
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const PLUGIN = path.resolve(arg('plugin', path.join(HERE, 'plugin.js')))
const WIDTHS = arg('widths', '1200,1000,700,600,500').split(',').map(Number)
const APP_CSS = process.env.HIVE_APP_CSS ||
  '/Applications/Hermes.app/Contents/Resources/app.asar.unpacked/dist/assets/index-B89n1Ils.css'

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean)
  for (const c of candidates) if (fs.existsSync(c)) return c
  throw new Error('no Chrome/Chromium found; set CHROME_BIN')
}

/* ── harness ───────────────────────────────────────────────────────────────── */

const src = fs.readFileSync(PLUGIN, 'utf8')
const m = src.match(/const HIVE_TS_CSS = `([\s\S]*?)`\n/)
if (!m) throw new Error(`HIVE_TS_CSS not found in ${PLUGIN}`)
const css = m[1]

// The popover's own class list, lifted from the component so the replica below
// cannot drift from the real markup: whatever `HiveAddMember` renders when open
// is what gets measured (the defect was anchored in this exact string).
const popMatch = src.match(/open && jsxs\('div', \{ className: '([^']+)'/)
if (!popMatch) throw new Error(`HiveAddMember popover markup not found in ${PLUGIN}`)
const POPOVER_CLASS = popMatch[1]

// Replica of TsAgentRow / TsTeamPanel: every roster row carries `.ts-team-body`,
// and the dock carries the Add-agent popover in its OPEN state (F-P1-R1): the
// `.relative` wrapper + `.ts-addpop` box + the Add button, exactly as
// `HiveAddMember` renders it. The popover is what the "shown" expectations below
// measure — anchoring it off the column's left/bottom edge is the defect this
// replica guards.
const teamPanel = `<div class="ts-col ts-col-team" data-ts-team="true">
  <div class="ts-strip"><span class="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Team</span><span class="flex-1"></span><span class="text-muted-foreground">1/11</span></div>
  <div class="ts-scroll">
    <div class="flex flex-col">
      <div class="ts-row" data-role="you"><span class="ts-avatar">y</span><span class="ts-team-body flex min-w-0 flex-1 items-center gap-1.5"><span class="text-xs font-semibold">you</span></span></div>
      <div class="ts-row" data-agent="default"><span class="ts-avatar">d</span><span class="ts-team-body flex min-w-0 flex-1 flex-col gap-0.5"><span class="truncate text-xs font-semibold">@default</span><span class="truncate text-muted-foreground">no model</span></span><span class="ts-team-body shrink-0 text-muted-foreground">&#9656;</span></div>
    </div>
  </div>
  <div class="ts-dock"><div class="relative"><div class="${POPOVER_CLASS}" data-addpop="1"><div class="text-xs font-medium">Add agent</div><input placeholder="Search profiles…"><button type="button">New profile…</button></div><button type="button">Add</button></div><span class="text-muted-foreground">0 member(s)</span></div>
</div>`

// Replica of TsRightPanel: `.ts-right-body` is a direct child of `.ts-col-right`,
// the tab body is the last `div` of that body, the rail is its sibling.
const rightPanel = `<div class="ts-col ts-col-right" data-ts-right="true">
  <div class="ts-right-body flex min-h-0 grow flex-col">
    <div class="ts-strip"><span class="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Work</span></div>
    <div id="right-tabs">TabsList</div>
    <div class="flex min-h-0 grow flex-col" id="right-tab-body">TAB BODY CONTENT</div>
  </div>
  <div class="ts-rail" data-ts-rail="true"><button type="button" class="ts-railbutton" data-active="true"><span>Ta</span></button><button type="button" class="ts-railbutton"><span>Ac</span></button></div>
</div>`

const body = `<div class="ts-workspace" data-ts-workspace="true">
  <div class="ts-toolbar" data-ts-toolbar="true"><span class="flex-1"></span><button type="button" class="ts-narrow-only ts-railbutton" id="tb-team" aria-label="Team panel">T</button><button type="button" class="ts-narrow-only ts-railbutton" id="tb-right" aria-label="Work panel">W</button></div>
  ${teamPanel}
  <div class="ts-col ts-col-center" data-ts-center="true"><div id="center-body">conversation</div></div>
  ${rightPanel}
  <div class="ts-dock">dock</div>
  <div class="ts-sheet" data-side="team" data-open="true">${teamPanel}</div>
  <div class="ts-sheet" data-side="right" data-open="true">${rightPanel}</div>
</div>`

const TARGETS = [
  ['workspace', '.ts-workspace'],
  ['toolbar', '.ts-toolbar'],
  ['col_team', '.ts-workspace > .ts-col-team'],
  ['col_center', '.ts-workspace > .ts-col-center'],
  ['col_right', '.ts-workspace > .ts-col-right'],
  ['col_team_row_body', '.ts-workspace > .ts-col-team .ts-team-body'],
  ['col_right_body', '.ts-workspace > .ts-col-right > .ts-right-body'],
  ['col_right_rail', '.ts-workspace > .ts-col-right > .ts-rail'],
  ['sheet_team', '.ts-sheet[data-side="team"]'],
  ['sheet_team_root', '.ts-sheet[data-side="team"] > .ts-col-team'],
  ['sheet_team_row_body', '.ts-sheet[data-side="team"] .ts-team-body'],
  ['sheet_right', '.ts-sheet[data-side="right"]'],
  ['sheet_right_root', '.ts-sheet[data-side="right"] > .ts-col-right'],
  ['sheet_right_body', '.ts-sheet[data-side="right"] > .ts-col-right > .ts-right-body'],
  ['sheet_right_tabbody', '.ts-sheet[data-side="right"] #right-tab-body'],
  ['sheet_right_rail', '.ts-sheet[data-side="right"] .ts-rail'],
  ['narrow_only_btn', '.ts-toolbar .ts-narrow-only'],
  // F-P1-R1: the roster popover (class list lifted from plugin.js above), in each
  // mount site, must be fully inside its clipping ancestors and the viewport
  // (see the 'shown' verdict). `[data-addpop]` is a targeting hook the replica
  // adds; the real component carries no extra attribute.
  ['col_addpop', '.ts-workspace > .ts-col-team [data-addpop]'],
  ['sheet_addpop', '.ts-sheet[data-side="team"] [data-addpop]']
]

const measureScript = `
<pre id="probe-out"></pre>
<script>
window.addEventListener('load', function () {
  requestAnimationFrame(function () {
    const targets = TARGETS_JSON;
    const out = {
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      mq: {
        mq1100: window.matchMedia('(max-width:1100px)').matches,
        mq880: window.matchMedia('(max-width:880px)').matches,
        mq600: window.matchMedia('(max-width:600px)').matches
      },
      nodes: {}
    };
    for (const [name, sel] of targets) {
      const el = document.querySelector(sel);
      if (!el) { out.nodes[name] = null; continue; }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // Visible rect = the element's box intersected with every ancestor that
      // clips (overflow != visible) and with the viewport. 'inside' is true only
      // when nothing is subtracted — i.e. the user can see the whole box.
      let l = r.left, t = r.top, rr = r.right, b = r.bottom;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const ncs = getComputedStyle(n);
        const ox = ncs.overflowX, oy = ncs.overflowY;
        if (ox === 'visible' && oy === 'visible') continue;
        const nr = n.getBoundingClientRect();
        if (ox !== 'visible') { l = Math.max(l, nr.left); rr = Math.min(rr, nr.right) }
        if (oy !== 'visible') { t = Math.max(t, nr.top); b = Math.min(b, nr.bottom) }
      }
      l = Math.max(l, 0); t = Math.max(t, 0);
      rr = Math.min(rr, window.innerWidth); b = Math.min(b, window.innerHeight);
      out.nodes[name] = {
        display: cs.display, position: cs.position, overflow: cs.overflow,
        w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100,
        visibleW: Math.round(Math.max(0, rr - l) * 100) / 100,
        visibleH: Math.round(Math.max(0, b - t) * 100) / 100,
        inside: rr - l >= r.width - 0.5 && b - t >= r.height - 0.5
      };
    }
    document.getElementById('probe-out').textContent = JSON.stringify(out);
  });
});
</script>`

function harnessHtml() {
  const link = fs.existsSync(APP_CSS) ? `<link rel="stylesheet" href="file://${APP_CSS}">` : ''
  const hive = `<style id="buzz-hive-team-studio">${css}</style>`
  const script = measureScript.replace('TARGETS_JSON', JSON.stringify(TARGETS))
  return `<!doctype html><html><head><meta charset="utf-8">${link}${hive}</head><body>${body}${script}</body></html>`
}

/* ── expectations ──────────────────────────────────────────────────────────── */

// 'vis'  = the element itself is not display:none and has a non-zero box
// 'hid'  = the element itself is display:none
// P1.5 (P-01/P-07/P-09/P-23) re-cut the ladder: the ROSTER degrades first (≤1100,
// to avatars), the right column hands over to the 44px rail at ≤880, and under
// 600 both columns leave the grid so the sheets are the only access. The
// reachability property this probe guards is unchanged — only the widths moved.
const EXPECT = {
  // the right column's own body is replaced by the rail in the 601–880 px band
  col_right_body: (w) => (w <= 880 ? 'hid' : 'vis'),
  // the team column shows avatars only once it is 56 px wide (≤1100)
  col_team_row_body: (w) => (w <= 1100 ? 'hid' : 'vis'),
  // under 600 px both columns leave the grid — the sheets are the only access
  col_team: (w) => (w <= 600 ? 'hid' : 'vis'),
  col_right: (w) => (w <= 600 ? 'hid' : 'vis'),
  // the rail only exists in the 601–880 px band
  col_right_rail: (w) => (w <= 880 && w > 600 ? 'vis' : 'noassert'),
  // the toolbar toggles are the single-column fallback only
  narrow_only_btn: (w) => (w <= 600 ? 'vis' : 'hid'),
  // and the sheets must actually deliver CONTENT wherever they are mounted: a
  // mounted sheet is displayed at every width (P-09 moved the display rule out of
  // the media blocks so the 1000 px captures can show both sheets).
  sheet_right_body: () => 'vis',
  sheet_right_tabbody: () => 'vis',
  sheet_right_root: () => 'vis',
  sheet_team_root: () => 'vis',
  // P-23: the team sheet mirrors the avatar-only column it stands in for.
  sheet_team_row_body: (w) => (w <= 880 ? 'hid' : 'vis'),
  // F-P1-R1 — the roster popover must render fully INSIDE its mount site and the
  // window. Anchored off the dock's left/bottom edge it measured a 69x28 px
  // sliver (4.9%); 'shown' requires the whole box to survive every clipping
  // ancestor. The site that is display:none at that width is not asserted.
  col_addpop: (w) => (w <= 600 ? 'noassert' : 'shown'),
  sheet_addpop: () => 'shown'
}

function verdict(node, want) {
  if (want === 'noassert') return 'skip'
  if (!node) return 'MISSING'
  const shown = node.display !== 'none' && node.w > 0 && node.h > 0
  if (want === 'vis') return shown ? 'ok' : 'FAIL'
  if (want === 'shown') return shown && node.inside ? 'ok' : 'FAIL'
  return node.display === 'none' ? 'ok' : 'FAIL'
}

/* ── run ───────────────────────────────────────────────────────────────────── */

const chrome = findChrome()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-css-probe-'))
const file = path.join(tmp, 'harness.html')
fs.writeFileSync(file, harnessHtml())

console.log(`plugin : ${PLUGIN}`)
console.log(`css    : ${css.length} bytes ${fs.existsSync(APP_CSS) ? `+ app stylesheet ${path.basename(APP_CSS)}` : '(app stylesheet NOT found — plugin CSS only)'}`)
console.log(`chrome : ${chrome}`)
console.log(`harness: ${file}\n`)

let failures = 0
const perWidth = []
function dumpOnce(w) {
  const dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--force-device-scale-factor=1',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    `--user-data-dir=${path.join(tmp, `profile-${w}`)}`,
    `--window-size=${w},900`, '--virtual-time-budget=4000', '--dump-dom', `file://${file}`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  // Read the payload out of <pre id="probe-out"> — the dumped DOM also contains
  // the measuring script's own source, so scanning for a literal marker would
  // match that source first.
  const hit = dom.match(/<pre id="probe-out">([\s\S]*?)<\/pre>/)
  if (!hit || !hit[1].trim()) return null
  return JSON.parse(hit[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'))
}
for (const w of WIDTHS) {
  // A cold headless start occasionally dumps the DOM before the measuring
  // script has run; that is a harness flake, not a layout result — retry.
  let out = null
  for (let attempt = 1; attempt <= 3 && !out; attempt++) {
    out = dumpOnce(w)
    if (!out) console.log(`   (no measurement payload at width ${w}, attempt ${attempt}/3 — retrying)`)
  }
  if (!out) throw new Error(`no measurement payload at width ${w} after 3 attempts`)
  perWidth.push({ want: w, out })
}

for (const { want, out } of perWidth) {
  const w = out.innerWidth
  console.log(`── viewport ${w}px (requested ${want})  mq1100=${out.mq.mq1100} mq880=${out.mq.mq880} mq600=${out.mq.mq600}`)
  console.log('   ' + ['target'.padEnd(20), 'display'.padEnd(10), 'w x h'.padEnd(14), 'expect', 'verdict'].join(' '))
  for (const [name] of TARGETS) {
    const node = out.nodes[name]
    const want2 = EXPECT[name] ? EXPECT[name](w) : 'noassert'
    const v = verdict(node, want2)
    if (v === 'FAIL' || v === 'MISSING') failures++
    console.log('   ' + [
      name.padEnd(20),
      (node ? node.display : '—').padEnd(10),
      (node ? `${node.w}x${node.h} vis ${node.visibleW}x${node.visibleH}` : '—').padEnd(30),
      want2.padEnd(6),
      v
    ].join(' '))
  }
  console.log('')
}

console.log(failures === 0
  ? `ALL PASS — every reachability expectation holds across ${WIDTHS.join('/')} px`
  : `FAIL — ${failures} unsatisfied expectation(s)`)
process.exitCode = failures === 0 ? 0 : 1
