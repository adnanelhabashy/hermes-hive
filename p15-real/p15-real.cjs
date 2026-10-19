#!/usr/bin/env node
/* SENTRY P1.5 real-DOM capture driver.
 *
 * Renders the plugin under test THROUGH ITS OWN COMPONENTS: the module is
 * imported verbatim behind an import map that substitutes only react /
 * react-dom runtime / @hermes/plugin-sdk (see ./stub.js), the plugin registers
 * itself, hiveBootHydrate() reads the seed blob from ctx.storage, and the
 * capture mounts the entry the plugin registered at ROUTES_AREA.
 *
 * Usage:
 *   node p15-real.mjs --plugin=<abs path to plugin.js> --prefix=after [--only=..] [--dsf=2]
 *
 * Writes <out>/<prefix>-<w>-<state>-<theme>.png and one measurements JSON.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9441
const DBG = 9334
const HERE = __dirname
const arg = (n, d) => { const p = process.argv.find((a) => a.startsWith('--' + n + '=')); return p ? p.slice(n.length + 3) : d }
const PLUGIN = path.resolve(arg('plugin', path.join(process.env.HOME, 'Developer/hive-team-studio/worktree/plugin.js')))
const PREFIX = arg('prefix', 'after')
const ONLY = arg('only', '')
const DSF = Number(arg('dsf', '2'))
const OUT = path.resolve(arg('out', path.join(process.env.HOME, 'Developer/hive-team-studio/sentry-probe/p15-captures')))
const APP_CSS = '/Applications/Hermes.app/Contents/Resources/app.asar.unpacked/dist/assets/index-B89n1Ils.css'
const VIEW_H = 884

/* the pinned runtime palette: extracted from the BEFORE harness so both capture
   sets paint the same palette and a side-by-side diff shows only what changed. */
const beforeSrc = fs.readFileSync(path.join(process.env.HOME, 'Developer/hive-team-studio/worktree/p15-harness.cjs'), 'utf8')
const PALETTE = new Function('return ' + beforeSrc.match(/const PALETTE = (\{[\s\S]*?\n\})/)[1])()

/* ── the room under review (same cast as the before captures) ─────────────── */
const T0 = new Date('2026-10-18T20:54:00+03:00').getTime()
const ESSAY = '## The Semicolon: A History\n\nThe semicolon was born in 1494, in the workshop of the Venetian printer Aldus Manutius. It was a humanist\u2019s punctuation: a pause between the comma\u2019s breath and the period\u2019s full stop.\n\nFor over a century the mark struggled for acceptance. English printers treated it as an Italian affectation, and it only settled into the trade once the great eighteenth-century houses set it as a house rule rather than a scholar\u2019s preference.'
const CORRECTION = 'Verdict: the 1494 date does not hold up. The earliest attested printing is the February 1495 Venetian calendar; the text traces back to `De Aetna` (September 1494). Fix the citation or drop the year.'
const KOREAN = '\uc138\ubbf8\ucf5c\ub860\uc740 \ubcc4\uc790\ub85c \ub9cc\ub4e4\uc5b4\uc9c4 \uc774\ud6c4 \ub2e4\uc11c \ub144\uc758 \uc138\uc6d4\uc744 \uac78\uccd0 \uc11c\uc591 \uc778\uc1c4\uc220\uc5d0 \uc790\ub9ac\uc7a1\uc558\uc2b5\ub2c8\ub2e4. \uadf8 \uc0ac\uc774\uc5d0 \uc774\ud0c8\ub9ac\uc544\uc758 \uc7a5\uc778\ub4e4\uc740 \uc774 \uae30\ud638\ub97c \uc790\uc2e0\ub4e4\uc758 \uad00\uc2b5\uc73c\ub85c \ubc1b\uc544\ub4e4\uc600\uace0, \uc601\uad6d\uc758 \ucd9c\ud310\uc778\ub4e4\uc740 \ud55c\ub3d9\uc548 \uc774\ud0c8\ub9ac\uc544\uc758 \ud5c8\uc0c1\uc73c\ub85c \uce58\ubd80\ud588\uc2b5\ub2c8\ub2e4.'

const MEMBERS = [
  { profile: 'default', storedId: 'stored-default', browser: true, muted: false, leader: false, order: 0, contextMode: 'shared', model: null, provider: null, modelLabel: null },
  { profile: 'arch', storedId: 'stored-arch', browser: false, muted: false, leader: false, order: 1, contextMode: 'shared', model: 'deepseek-v4.1-flash', provider: 'opencode-go', modelLabel: 'v4.1-flash' },
  { profile: 'forge', storedId: 'stored-forge', browser: false, muted: false, leader: true, order: 2, contextMode: 'minimal', model: null, provider: null, modelLabel: null }
]
const TIMELINE = [
  { id: 'm1', ts: T0, from: 'you', kind: 'user', text: 'write a detailed 400-word essay on the history of the semicolon, with at least one quote from a real source.', to: null },
  { id: 'm2', ts: T0 + 60000, from: 'you', kind: 'relay', text: 'essay on the semicolon', to: 'arch' },
  { id: 'm3', ts: T0 + 120000, from: 'arch', kind: 'turn', phase: 'done', text: ESSAY, tool: '', tools: [{ name: 'websearch', ts: T0 + 90000, dur: 3100, status: 'ok' }], startedAt: T0 + 90000, doneAt: T0 + 200000, error: '', to: null, queuedSince: 0 },
  { id: 'm4', ts: T0 + 300000, from: 'you', kind: 'user', text: '[task @arch] verify the 1494 attribution against sources', to: null },
  { id: 'm5', ts: T0 + 360000, from: 'arch', kind: 'turn', phase: 'done', text: CORRECTION, tool: '', tools: [], startedAt: T0 + 330000, doneAt: T0 + 420000, error: '', to: null, queuedSince: 0 },
  { id: 'm6', ts: T0 + 480000, from: 'system', kind: 'system', text: 'held 1 relay(s) from @arch \u2014 relay chain reached its depth limit', to: null },
  { id: 'm7', ts: T0 + 600000, from: 'you', kind: 'user', text: 'use skills like \u2726 omh-frontend \u2726 omh-design-quality-gate \u2014 i want it premium and polished and appealing and fully functional', to: null }
]
const TASKS = [
  { id: 'a41f9c', title: 'Verify the 1494 attribution against sources', status: 'submitted', owner: 'arch', reviewer: 'you', ts: T0 + 300000 },
  { id: 'b7c210', title: 'Rewrite the citation block to the February 1495 printing', status: 'open', owner: 'arch', reviewer: 'forge', ts: T0 + 420000 }
]
const PROFILES = [
  { name: 'toddy' }, { name: 'writer' }, { name: 'atlas' }, { name: 'reviewer' }, { name: 'scout' }
]

const blob = (over = {}) => Object.assign({
  title: 'hive', cwd: '/Users/adnan/Developer/hive-team-studio', swarm: true, scratch: '', mission: '',
  tasks: TASKS, timelineMode: 'flat', agentExpanded: {}, rightTab: 'tasks', dockOpen: false,
  agentDetailExpanded: {}, activeProject: null, teams: [], members: MEMBERS, timeline: TIMELINE
}, over)

const HOST = {
  'session.info': { session_id: 'live-session', stored_session_id: 'stored-session' },
  'session.create': { session_id: 'live-default-1', stored_session_id: 'stored-default-1' },
  'projects.list': { projects: [{ id: 'p1', slug: 'hive-team-studio', name: 'hive-team-studio', primaryPath: '/Users/adnan/Developer/hive-team-studio', branch: 'team-studio' }] },
  'profiles.list': { profiles: PROFILES },
  'approval.pending': {},
  'projects.get': { project: { id: 'p1', name: 'hive-team-studio', folders: [{ path: '/Users/adnan/Developer/hive-team-studio/worktree', label: 'worktree', is_primary: true }, { path: '/Users/adnan/Developer/hive-team-studio/sentry-probe', label: 'sentry-probe', is_primary: false }] } },
  'context.preview': { text: 'room brief' }
}

/* Every state is a seed + an optional drive script run after mount. Nothing is
   hand-placed in the markup: the plugin builds all of it from these seeds. */
const STATES = {
  full: { blob: blob(), drive: [] },
  empty: { blob: blob({ members: MEMBERS, timeline: [] }), drive: [] },
  'agent-detail': { blob: blob({ agentDetailExpanded: { arch: true, forge: true }, tasks: TASKS }), drive: [] },
  addpop: { blob: blob(), host: { 'profiles.list': { profiles: PROFILES } }, drive: [{ click: '[data-ts-team] button[aria-haspopup="dialog"]' }] },
  mention: { blob: blob(), drive: [{ type: '@' }] },
  'tab-activity': { blob: blob({ rightTab: 'activity' }), drive: [] },
  'tab-files': { blob: blob({ rightTab: 'files' }), drive: [] },
  'tab-approvals': { blob: blob({ rightTab: 'approvals' }), drive: [] },
  'tab-workflow': { blob: blob({ rightTab: 'workflow' }), queries: { 'buzz-hive:workflows': { runs: [{ id: 'wf_18f2', name: 'p15-verify', status: 'running', nodes_done: 3, nodes_total: 7, owner_profile: 'sentry' }, { id: 'wf_11a0', name: 'release-cut', status: 'held', nodes_done: 5, nodes_total: 6, held_gate: true, owner_profile: 'atlas' }] } }, drive: [] },
  cjk: { blob: blob({ title: 'hive \ud83c\udf10 \ud55c\uad6d\uc5b4', timeline: TIMELINE.concat([{ id: 'k1', ts: T0 + 900000, from: 'you', kind: 'user', text: KOREAN, to: null }, { id: 'k2', ts: T0 + 960000, from: 'arch', kind: 'turn', phase: 'done', text: KOREAN, tools: [], startedAt: T0 + 930000, doneAt: T0 + 990000, error: '', to: null, tool: '' }]) }), drive: [] },
  hover: { blob: blob(), drive: [{ hover: '[data-ts-team] .ts-row[data-agent="arch"]' }] },
  focus: { blob: blob(), drive: [{ focus: '[data-testid="hive-composer"]' }] },
  'sheet-team': { blob: blob(), drive: [{ click: '[aria-label="Team panel"]' }] },
  'sheet-right': { blob: blob(), drive: [{ click: '[aria-label="Work panel"]' }] },
  'light-full': { blob: blob(), theme: 'light', drive: [] },
  'light-addpop': { blob: blob(), theme: 'light', drive: [{ click: '[data-ts-team] button[aria-haspopup="dialog"]' }] },
  /* ── owed-evidence states (round 2) ──────────────────────────────────────
     addpop-pin : profiles now come back through window.hermesDesktop.api, then
                  the row's own pin toggle is clicked. Proves P-22/F-1 evidence.
     roster-pin : F-8's pin/unpin from the row that shows the state.
     motion-*   : P-19. One transition (the roster pin reveal, --ts-dur:160ms)
                  read before / during / after. `hold` is the wait after each
                  drive step, `post` the wait before the frame is measured. */
  'addpop-pin': { blob: blob(), host: { 'profiles.list': { profiles: PROFILES } },
    drive: [{ click: '[data-ts-team] button[aria-haspopup="dialog"]' }, { click: '.ts-addpop-row .ts-addpop-pin' }] },
  'addpop-nopin': { blob: blob(), host: { 'profiles.list': { profiles: PROFILES } },
    drive: [{ click: '[data-ts-team] button[aria-haspopup="dialog"]' }] },
  'roster-pin': { blob: blob(), drive: [
    { hover: '[data-ts-team] .ts-row[data-agent="arch"]' },
    { click: '[data-ts-team] .ts-row[data-agent="arch"] .ts-row-pin' }] },
  'motion-before': { blob: blob(), drive: [], hold: 0, post: 60 },
  'motion-during': { blob: blob(), drive: [{ hover: '[data-ts-team] .ts-row[data-agent="arch"]' }], hold: 0, post: 70 },
  'motion-after': { blob: blob(), drive: [{ hover: '[data-ts-team] .ts-row[data-agent="arch"]' }], hold: 0, post: 420 },
  /* instrument self-check: what the /api/profiles bridge actually answers */
  apiprobe: { blob: blob(), drive: [{ probeApi: '/api/profiles' }], hold: 0, post: 200 }
}

const CAPS = [
  { w: 1512, theme: 'dark', state: 'full', appW: 1456 },
  { w: 1456, theme: 'dark', state: 'full', appW: 1206 },
  { w: 1200, theme: 'dark', state: 'full', appW: 1144 },
  { w: 1000, theme: 'dark', state: 'full', appW: 944 },
  { w: 700, theme: 'dark', state: 'full', appW: 644 },
  { w: 1280, theme: 'light', state: 'light-full', appW: 1224 },
  { w: 1280, theme: 'light', state: 'light-addpop', appW: 1224 },
  { w: 1512, theme: 'dark', state: 'empty', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'agent-detail', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'addpop', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'mention', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'tab-activity', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'tab-files', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'tab-approvals', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'tab-workflow', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'cjk', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'focus', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'hover', appW: 1456 },
  { w: 1000, theme: 'dark', state: 'sheet-team', appW: 944 },
  { w: 1000, theme: 'dark', state: 'sheet-right', appW: 944 },
  /* round 2: the owed-evidence captures */
  { w: 1512, theme: 'dark', state: 'addpop-nopin', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'addpop-pin', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'roster-pin', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'motion-before', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'motion-during', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'motion-after', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'apiprobe', appW: 1456 }
]

/* ── the measurement probe (runs in the page) ─────────────────────────────── */
const MEASURE = `(() => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) } }
  const used = (el) => { if (!el) return null; const c = getComputedStyle(el)
    return { color: c.color, bg: c.backgroundColor, borderColor: c.borderTopColor, borderW: c.borderTopWidth,
             fontSize: c.fontSize, lineHeight: c.lineHeight, fontWeight: c.fontWeight, padding: c.padding,
             gap: c.gap, radius: c.borderRadius, display: c.display, outline: c.outlineStyle + ' ' + c.outlineWidth + ' ' + c.outlineColor,
             boxShadow: c.boxShadow, fontFamily: c.fontFamily.split(',')[0].replace(/"/g,'') } }
  const one = (sel) => { const el = document.querySelector(sel); if (!el) return { sel, missing: true }
    return { sel, rect: R(el), used: used(el), scrollW: el.scrollWidth, clientW: el.clientWidth,
             scrollH: el.scrollHeight, clientH: el.clientHeight, text: (el.textContent||'').trim().slice(0,60) } }
  const all = (sel) => [...document.querySelectorAll(sel)].map((el) => ({ sel, rect: R(el), used: used(el),
    text: (el.textContent||'').trim().slice(0, 60), scrollW: el.scrollWidth, clientW: el.clientWidth }))

  const tokens = {}
  const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;left:-9999px;top:0'
  document.body.appendChild(probe)
  for (const t of ['--ui-accent','--ui-bg-primary','--ui-bg-secondary','--ui-bg-elevated','--ui-text-primary',
                   '--ui-text-secondary','--ui-text-quaternary','--ui-stroke-secondary','--ui-yellow','--ui-red',
                   '--ui-green','--ts-warn','--ts-info','--ts-ok','--ts-bad','--ts-idle','--ts-elev','--ts-hairline','--dt-muted-foreground']) {
    probe.style.color = 'var(' + t + ', rgb(1,2,3))'
    tokens[t] = getComputedStyle(probe).color
  }
  probe.remove()

  const scope = document.querySelector('.ts-workspace')
  const fonts = {}, weights = {}, lines = {}, gaps = {}, pads = {}, radii = {}, fams = {}, byFont = {}
  const clipped = [], truncated = []
  const nodes = scope ? scope.querySelectorAll('*') : []
  for (const el of nodes) {
    const c = getComputedStyle(el)
    if ((el.textContent||'').trim().length && el.children.length === 0) {
      fonts[c.fontSize] = (fonts[c.fontSize]||0)+1
      weights[c.fontWeight] = (weights[c.fontWeight]||0)+1
      lines[c.lineHeight] = (lines[c.lineHeight]||0)+1
      fams[c.fontFamily.split(',')[0].replace(/"/g,'')] = (fams[c.fontFamily.split(',')[0].replace(/"/g,'')]||0)+1
      const bucket = byFont[c.fontSize] = byFont[c.fontSize] || []
      if (bucket.length < 8) bucket.push(el.tagName.toLowerCase() + '.' + String(el.className||'').split(' ').slice(0,2).join('.') + ' \u2192 "' + (el.textContent||'').trim().slice(0,26) + '"')
    }
    if (c.gap && c.gap !== 'normal') gaps[c.gap] = (gaps[c.gap]||0)+1
    if (c.padding && c.padding !== '0px') pads[c.padding] = (pads[c.padding]||0)+1
    if (c.borderRadius && c.borderRadius !== '0px') radii[c.borderRadius] = (radii[c.borderRadius]||0)+1
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
      clipped.push({ cls: String(el.className).slice(0,60), sw: el.scrollWidth, cw: el.clientWidth, text: (el.textContent||'').trim().slice(0,40) })
    const r = el.getBoundingClientRect()
    if (r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1))
      clipped.push({ offscreen: true, cls: String(el.className).slice(0,60), rect: R(el), text: (el.textContent||'').trim().slice(0,40) })
    if (el.children.length === 0 && (el.textContent||'').trim() && el.scrollWidth > el.clientWidth + 1 &&
        c.textOverflow === 'ellipsis')
      truncated.push({ text: (el.textContent||'').trim().slice(0,50), cls: String(el.className).slice(0,40), sw: el.scrollWidth, cw: el.clientWidth })
  }

  // class census: which ts-* classes the REAL component tree actually rendered
  const tsClasses = {}
  for (const el of nodes) for (const cl of String(el.className || '').split(/\\s+/)) if (cl.startsWith('ts-')) tsClasses[cl] = (tsClasses[cl]||0)+1

  // team / right column flat-share: how much of the column's vertical band is a
  // single flat surface (no card, hairline, or colour change)
  const flatShare = (colSel) => {
    const col = document.querySelector(colSel)
    if (!col) return null
    const rows = [...col.querySelectorAll('.ts-row, .ts-card, .ts-strip, .ts-empty')]
    const area = col.getBoundingClientRect()
    const total = Math.max(1, area.width * area.height)
    let painted = 0
    for (const r of rows) { const b = r.getBoundingClientRect(); painted += Math.max(0, b.width) * Math.max(0, b.height) }
    return { column: Math.round(area.width) + 'x' + Math.round(area.height), painted: Math.round(painted), ratio: +(painted / total).toFixed(3) }
  }

  const addpop = document.querySelector('.ts-addpop')
  const teamCol = document.querySelector('.ts-col-team')
  const inReview = [...document.querySelectorAll('.ts-linkcard, .ts-card, span')]
    .find((el) => (el.textContent||'').trim() === 'IN REVIEW')

  // CJK metrics: the tallest line box and whether any glyph run is clipped
  const cjkRe = /[\\u3000-\\u9fff\\uac00-\\ud7af]/
  const cjkNodes = [...nodes].filter((el) => el.children.length === 0 && cjkRe.test(el.textContent||''))
  const cjkSample = cjkNodes.slice(0, 3).map((el) => { const c = getComputedStyle(el)
    return { text: (el.textContent||'').trim().slice(0,24), fontSize: c.fontSize, lineHeight: c.lineHeight,
             h: Math.round(el.getBoundingClientRect().height), clipped: el.scrollHeight > el.clientHeight + 1 } })

  const active = document.activeElement
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dsf: window.devicePixelRatio },
    ready: !!(window.__HIVE_READY__ && window.__HIVE_READY__.mounted),
    rerenders: (window.__HIVE_RENDER__ && window.__HIVE_RENDER__.rerenders) || 0,
    registrations: (window.__HIVE_READY__ && window.__HIVE_READY__.entries) || [],
    errors: window.__HIVE_ERRORS__ || [],
    scopePresent: !!scope,
    scopeChildren: nodes.length,
    tsClasses, tokens, fonts, weights, lineHeights: lines, fontFamilies: fams, byFont, gaps, paddings: pads, radii,
    key: { workspace: one('.ts-workspace'), toolbar: one('.ts-toolbar'), team: one('.ts-col-team'),
           center: one('.ts-col-center'), right: one('.ts-col-right'), rail: one('.ts-rail'),
           dock: one('.ts-dock'), strip: one('.ts-strip'), row: one('.ts-row'), card: one('.ts-card'),
           addpop: one('.ts-addpop'), mentions: one('[data-hive-mentions]'), mentionRow: one('.ts-mention-row'),
           emptyTitle: one('.ts-empty-title'), tbChip: one('.ts-toolbar-chip'), rowName: one('.ts-row-name'),
           rowMeta: one('.ts-row-meta'), stripLabel: one('.ts-strip-label'), stripCount: one('.ts-strip-count'),
           tabEmpty: one('.ts-tab-empty'), skel: one('.ts-skel'), sheet: one('.ts-sheet[data-open="true"]'),
           narrow: one('.ts-narrow-only'), copy: one('.ts-copy') },
    rows: all('.ts-row'), stripLabels: all('.ts-strip-label'), tabs: all('.ts-tabstrip > *'),
    toolbarControls: all('.ts-toolbar > *'), railbuttons: all('.ts-rail .ts-railbutton'),
    addpopInsideColumn: addpop && teamCol ? { right: Math.round(addpop.getBoundingClientRect().right),
      colRight: Math.round(teamCol.getBoundingClientRect().right),
      inside: addpop.getBoundingClientRect().right <= teamCol.getBoundingClientRect().right + 0.5 } : null,
    /* P-22 / F-1 owed evidence: the add-agent rows themselves and the state their
       own pin toggle reports. Read from the live DOM, never inferred. */
    addpopRows: [...document.querySelectorAll('.ts-addpop-row')].map((el) => {
      const pin = el.querySelector('.ts-addpop-pin')
      const c = pin ? getComputedStyle(pin) : null
      return { text: (el.textContent||'').trim().slice(0,40), dataPin: el.getAttribute('data-pin'),
        pinText: pin ? (pin.textContent||'').trim() : null, pinDataOn: pin ? pin.getAttribute('data-on') : null,
        pinAriaPressed: pin ? pin.getAttribute('aria-pressed') : null, pinColor: c ? c.color : null } }),
    /* F-8 owed evidence: the roster row's own pin toggle. */
    rosterPins: [...document.querySelectorAll('.ts-row-pin')].map((el) => {
      const c = getComputedStyle(el); const row = el.closest('.ts-row')
      return { agent: row ? row.getAttribute('data-agent') : null, text: (el.textContent||'').trim(),
        dataOn: el.getAttribute('data-on'), ariaPressed: el.getAttribute('aria-pressed'),
        opacity: c.opacity, color: c.color, dur: c.transitionDuration + ' ' + c.transitionTimingFunction,
        hovered: row ? row.getAttribute('data-hovered') : null } }),
    /* P-19 owed evidence: the one live transition under measurement (the roster
       pin reveal). opacity is read mid-flight, so the triple proves the motion
       exists and is the declared duration, not a guess. */
    motion: (() => { const el = document.querySelector('.ts-row[data-agent="arch"] .ts-row-pin')
      if (!el) return null
      const c = getComputedStyle(el)
      return { sel: '.ts-row[data-agent=arch] .ts-row-pin', opacity: c.opacity, dur: c.transitionDuration,
               ease: c.transitionTimingFunction, props: c.transitionProperty,
               rowHovered: (el.closest('.ts-row')||el).getAttribute('data-hovered') } })(),
    addpopText: addpop ? (addpop.innerText || '').replace(/\\n{2,}/g, '\\n').slice(0, 500) : '',
    commits: (window.__HIVE_COMMITS__ || []).slice(-8),
    setTrace: (window.__HIVE_SET_TRACE__ || []).slice(-14),
    bridge: { present: !!window.hermesDesktop, apiType: typeof (window.hermesDesktop || {}).api,
              calls: (window.__HIVE_API_CALLS__ || []).slice(0, 6), probe: window.__HIVE_PROBE__ || null,
              now: Math.round(performance.now()),
              seededProfiles: (() => { const h = globalThis.__HIVE_HARNESS__ || {}
                const pl = (h.host || {})['profiles.list']
                return { hostKeys: Object.keys(h.host || {}), apiKeys: Object.keys(h.api || {}),
                         profiles: pl && pl.profiles ? pl.profiles.map((p) => p.name) : null } })() },
    rosterNames: [...document.querySelectorAll('.ts-team-body .ts-row-name')].map((el) => (el.textContent||'').trim()).slice(0, 12),
    flatShareTeam: flatShare('.ts-col-team'), flatShareRight: flatShare('.ts-col-right'),
    inReview: inReview ? { color: getComputedStyle(inReview).color, tag: inReview.tagName, cls: String(inReview.className).slice(0,40) } : null,
    focus: active ? { tag: active.tagName, testid: active.getAttribute && active.getAttribute('data-testid'),
      cls: String(active.className || '').slice(0,60), outline: getComputedStyle(active).outlineStyle + ' ' + getComputedStyle(active).outlineWidth,
      shadow: getComputedStyle(active).boxShadow } : null,
    hoverRow: (() => { const r = document.querySelector('.ts-row[data-hovered="true"]'); return r ? { text: (r.textContent||'').trim().slice(0,30), bg: getComputedStyle(r).backgroundColor } : null })(),
    cjkSample,
    text: scope ? (scope.innerText || '').replace(/\\n{2,}/g, '\\n').slice(0, 2200) : '',
    clipped, truncated
  }
})()`

class CDP {
  constructor (ws) {
    this.ws = ws; this.id = 0; this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id)
        m.error ? reject(new Error(m.error.message)) : resolve(m.result)
      }
    })
  }
  send (method, params = {}, sessionId) {
    const id = ++this.id
    const msg = { id, method, params }
    if (sessionId) msg.sessionId = sessionId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(msg))
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)) } }, 30000)
    })
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── static server: the plugin verbatim, the doubles, the app stylesheet ─── */
function serve () {
  const pluginSrc = fs.readFileSync(PLUGIN, 'utf8')
  const stubSrc = fs.readFileSync(path.join(HERE, 'stub.js'), 'utf8')
  const bootSrc = fs.readFileSync(path.join(HERE, 'boot.js'), 'utf8')
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/plugin.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(pluginSrc) }
    if (url.pathname === '/stub.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(stubSrc) }
    if (url.pathname === '/boot.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(bootSrc) }
    if (url.pathname === '/app.css') { res.writeHead(200, { 'content-type': 'text/css' }); return res.end(fs.readFileSync(APP_CSS)) }
    if (url.pathname === '/page.html') {
      const q = url.searchParams
      const theme = q.get('theme') || 'dark'
      const state = STATES[q.get('state')] || STATES.full
      const appW = Number(q.get('appW') || 1456)
      const cfg = {
        storage: { 'hive.v2': state.blob },
        host: Object.assign({}, HOST, state.host || {}),
        queries: state.queries || {},
        theme,
        state: q.get('state') || 'full'
      }
      const palCss = ':root{' + Object.entries(PALETTE[theme] || {}).map(([k, v]) => `${k}:${v}`).join(';') + '}'
      const html = `<!doctype html><html class="${theme}" style="height:100%"><head><meta charset="utf-8">
<link rel="stylesheet" href="/app.css">
<style>${palCss}</style>
<style>
  /* same opaque backdrop the BEFORE harness painted, so the two sets composited
     identically (the app paints --theme-* over an opaque window backdrop). */
  html,body{margin:0;height:100%;background:${theme === 'dark' ? '#0b0d12' : '#fbfbfd'};color:var(--ui-text-primary);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  #surface{width:${appW}px;height:${Math.max(400, 918 - 34)}px;display:block;position:relative;overflow:hidden}
</style></head>
<body><div id="surface"></div>
<script>window.__HIVE_HARNESS__ = ${JSON.stringify(cfg)};
window.__HIVE_ERRORS__ = [];
window.__HIVE_SET_TRACE__ = [];
window.addEventListener('error', (e) => window.__HIVE_ERRORS__.push(String(e.message).slice(0,140)));
window.addEventListener('unhandledrejection', (e) => window.__HIVE_ERRORS__.push('rejection: ' + String(e.reason && e.reason.message || e.reason).slice(0,140)));
</script>
<script type="importmap">{"imports":{"react":"/stub.js","react/jsx-runtime":"/stub.js","@hermes/plugin-sdk":"/stub.js"}}</script>
<script type="module" src="/boot.js"></script>
</body></html>`
      res.writeHead(200, { 'content-type': 'text/html' }); return res.end(html)
    }
    res.writeHead(404); res.end('no')
  })
  return new Promise((r) => srv.listen(PORT, '127.0.0.1', () => r(srv)))
}

const DRIVE = {
  click: (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'missing:' + ${JSON.stringify(sel)}; el.click(); return 'clicked' })()`,
  /* diagnostic: call the desktop bridge double the way the plugin does and
     stash the settled answer on the page, so a capture can report what the
     plugin actually received rather than what the seed intended. */
  probeApi: (p) => `(() => { window.__HIVE_PROBE__ = 'pending'; const r = window.hermesDesktop && window.hermesDesktop.api({ path: ${JSON.stringify(p)} });
     Promise.resolve(r).then((v) => { window.__HIVE_PROBE__ = 'ok ' + JSON.stringify(v).slice(0, 400) },
       (e) => { window.__HIVE_PROBE__ = 'err ' + (e && e.message) }); return 'probed' })()`,
  hover: (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'missing'
     el.setAttribute('data-hovered','true'); el.dispatchEvent(new MouseEvent('mouseover', {bubbles:true}))
     el.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true})); return 'hovered' })()`,
  /* :hover and @media (hover:hover) cannot be reached by synthetic events; this
     returns the element's centre so the driver can send a real mouse move. */
  hoverPoint: (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null
     const r = el.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }) })()`,
  focus: (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'missing'; el.focus(); return 'focused' })()`,
  type: (text) => `(() => { const el = document.querySelector('[data-testid="hive-composer"]'); if (!el) return 'missing'
     el.focus()
     const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set
     setter.call(el, ${JSON.stringify(text)})
     try { el.selectionStart = el.selectionEnd = el.value.length } catch (e) {}
     el.dispatchEvent(new Event('input', { bubbles: true }))
     el.dispatchEvent(new Event('change', { bubbles: true }))
     return 'typed(' + el.value + ')' })()`
}

async function main () {
  fs.mkdirSync(OUT, { recursive: true })
  const server = await serve()
  const profile = '/Users/adnan/.hermes/profiles/sentry/cache/scratch/p15-real-chrome'
  fs.rmSync(profile, { recursive: true, force: true })
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`,
    '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--force-color-profile=srgb', '--font-render-hinting=none',
    `--force-device-scale-factor=${DSF}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  let started = null
  for (let i = 0; i < 80 && !started; i++) {
    await sleep(250)
    try { started = await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json() } catch {}
  }
  if (!started) throw new Error('chrome did not expose a DevTools endpoint')
  const ws = new WebSocket(started.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  const cdp = new CDP(ws)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)

  const results = []
  for (const cap of CAPS) {
    const name = `${PREFIX}-${cap.w}-${cap.state}-${cap.theme}`
    if (ONLY && !name.includes(ONLY)) continue
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: cap.w, height: VIEW_H, deviceScaleFactor: DSF, mobile: false }, sessionId)
    await cdp.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/page.html?theme=${cap.theme}&state=${cap.state}&appW=${cap.appW}` }, sessionId)
    // wait for the plugin to register + hydrate + mount
    let ready = false
    for (let i = 0; i < 40 && !ready; i++) {
      await sleep(120)
      const r = await cdp.send('Runtime.evaluate', { expression: '!!(window.__HIVE_READY__ && window.__HIVE_READY__.mounted)', returnByValue: true }, sessionId)
      ready = !!(r.result && r.result.value)
    }
    const driveLog = []
    const st = STATES[cap.state] || STATES.full
    for (const step of (st.drive || [])) {
      const [op, param] = Object.entries(step)[0]
      const r = await cdp.send('Runtime.evaluate', { expression: DRIVE[op](param), returnByValue: true }, sessionId)
      driveLog.push(op + '(' + String(param).slice(0, 40) + ') -> ' + (r.result && r.result.value))
      if (op === 'hover') {
        /* a real pointer is the only way to reach :hover / @media (hover:hover) */
        const pt = await cdp.send('Runtime.evaluate', { expression: DRIVE.hoverPoint(param), returnByValue: true }, sessionId)
        const val = pt.result && pt.result.value
        if (val) {
          const p = JSON.parse(val)
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, buttons: 0 }, sessionId)
          driveLog.push('mouseMoved(' + p.x + ',' + p.y + ')')
        } else driveLog.push('mouseMoved(point missing)')
      }
      await sleep(st.hold === undefined ? 220 : st.hold)
    }
    await sleep(st.post === undefined ? 260 : st.post)
    const measured = await cdp.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true }, sessionId)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true }, sessionId)
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(shot.data, 'base64'))
    const rec = Object.assign({ name, w: cap.w, theme: cap.theme, state: cap.state, appW: cap.appW, dsf: DSF, driveLog, ready },
      (measured.result && measured.result.value) || { measureError: measured })
    results.push(rec)
    console.log(`${name.padEnd(34)} ready=${ready} tsClasses=${Object.keys(rec.tsClasses || {}).length} scopeNodes=${rec.scopeChildren} clipped=${(rec.clipped || []).length} errors=${(rec.errors || []).length}`)
    if (rec.errors && rec.errors.length) console.log('   errors: ' + rec.errors.slice(0, 3).join(' | '))
  }
  fs.writeFileSync(path.join(OUT, `${PREFIX}-real-measurements.json`), JSON.stringify({ plugin: PLUGIN, prefix: PREFIX, dsf: DSF, captures: results }, null, 1))
  console.log('wrote ' + path.join(OUT, `${PREFIX}-real-measurements.json`))
  chrome.kill(); server.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
