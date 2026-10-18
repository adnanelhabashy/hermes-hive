#!/usr/bin/env node
/* P1.5 render pipeline — drives ONE headless Chrome over CDP (no puppeteer) to
   render each harness variant at an exact viewport width + device scale, grab a
   PNG, and extract the measured geometry / typography / colour evidence for
   that exact capture. Measurements and screenshots come from the same page
   instance, so a finding can always be traced to its capture.

   Usage: node p15-render.cjs [--only=<substring>] [--dsf=2]
   Writes: p15-captures/p15-<w>-<state>-<theme>.png
           p15-captures/p15-measurements.json
*/
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9333
const DSF = Number((process.argv.find((a) => a.startsWith('--dsf=')) || '--dsf=2').slice(6))
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)
const HERE = __dirname
const OUTDIR = path.join(HERE, 'p15-captures')
const VIEW_H = 884 // app window height minus the host chrome the harness models

const HARNESS = path.join(HERE, 'p15-harness.cjs')
const CAPS = [
  { w: 1512, theme: 'dark', state: 'full', appW: 1456 },
  // live-parity: the live window is 1456 CSS px wide with the app's nav sidebar
  // open (~250px), so the real plugin surface is ~1206px. This capture is the
  // one to compare column-for-column against p15-1512-timeline-dark.png.
  { w: 1456, theme: 'dark', state: 'full', appW: 1206 },
  { w: 1200, theme: 'dark', state: 'full', appW: 1144 },
  { w: 1000, theme: 'dark', state: 'full', appW: 944 },
  { w: 700, theme: 'dark', state: 'full', appW: 644 },
  { w: 1280, theme: 'light', state: 'full', appW: 1224 },
  { w: 1512, theme: 'dark', state: 'empty', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'agent-detail', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'addpop', appW: 1456 },
  { w: 1280, theme: 'light', state: 'addpop', appW: 1224 },
  { w: 1512, theme: 'dark', state: 'mention', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'tab-activity', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'tab-files', appW: 1456 },
  { w: 1512, theme: 'dark', state: 'tab-workflow', appW: 1456 },
  { w: 1000, theme: 'dark', state: 'sheet-team', appW: 944 },
  { w: 1000, theme: 'dark', state: 'sheet-right', appW: 944 }
]

/* the measurement probe — runs inside the page, returns plain JSON */
const MEASURE = `(() => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const used = (el) => { const c = getComputedStyle(el)
    return { color: c.color, bg: c.backgroundColor, border: c.borderTopColor, borderW: c.borderTopWidth,
             fontSize: c.fontSize, lineHeight: c.lineHeight, fontWeight: c.fontWeight,
             padding: c.padding, gap: c.gap, radius: c.borderRadius, display: c.display,
             fontFamily: c.fontFamily.split(',')[0].replace(/"/g,'') } }
  const one = (sel) => { const el = document.querySelector(sel); return el ? { sel, rect: R(el), used: used(el),
      scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight } : { sel, missing: true } }
  const all = (sel) => [...document.querySelectorAll(sel)].map((el) => ({ sel, rect: R(el), used: used(el),
      text: (el.textContent||'').trim().slice(0, 40), scrollW: el.scrollWidth, clientW: el.clientWidth }))

  // host-window context: the harness page is the plugin surface; the real app
  // gives it window.innerWidth minus the app's own chrome.
  const tokens = {}
  const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;left:-9999px;top:0'
  document.body.appendChild(probe)
  for (const t of ['--ui-red','--ui-green','--ui-yellow','--ui-purple','--ui-orange','--ui-warm',
                   '--ui-accent','--ui-accent-secondary','--ui-bg-primary','--ui-bg-secondary',
                   '--ui-bg-tertiary','--ui-bg-card','--ui-bg-elevated','--ui-text-primary',
                   '--ui-text-secondary','--ui-text-quaternary','--ui-stroke-secondary',
                   '--ui-danger','--ui-warning','--ui-success','--dt-muted-foreground']) {
    probe.style.color = 'var(' + t + ', rgb(1,2,3))'
    tokens[t] = getComputedStyle(probe).color
  }
  probe.remove()

  // typography + spacing census over everything the plugin renders
  const fonts = {}, weights = {}, gaps = {}, pads = {}, radii = {}, lines = {}
  for (const el of document.querySelectorAll('.ts-workspace *')) {
    const c = getComputedStyle(el)
    if ((el.textContent||'').trim().length && el.children.length === 0) {
      fonts[c.fontSize] = (fonts[c.fontSize]||0)+1
      weights[c.fontWeight] = (weights[c.fontWeight]||0)+1
      lines[c.lineHeight] = (lines[c.lineHeight]||0)+1
    }
    if (c.gap && c.gap !== 'normal') gaps[c.gap] = (gaps[c.gap]||0)+1
    if (c.padding && c.padding !== '0px') pads[c.padding] = (pads[c.padding]||0)+1
    if (c.borderRadius && c.borderRadius !== '0px') radii[c.borderRadius] = (radii[c.borderRadius]||0)+1
  }
  // overflow / clipping census
  const clipped = []
  for (const el of document.querySelectorAll('.ts-workspace *')) {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
      clipped.push({ cls: el.className && el.className.toString().slice(0,60), sw: el.scrollWidth, cw: el.clientWidth,
                     text: (el.textContent||'').trim().slice(0,40) })
    const r = el.getBoundingClientRect()
    if (r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1))
      clipped.push({ offscreen: true, cls: el.className && el.className.toString().slice(0,60), rect: R(el),
                     text: (el.textContent||'').trim().slice(0,40) })
  }
  // truncation census: elements whose text is ellipsised
  const truncated = []
  for (const el of document.querySelectorAll('.ts-workspace *')) {
    if (el.children.length === 0 && (el.textContent||'').trim() &&
        el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === 'ellipsis')
      truncated.push({ text: (el.textContent||'').trim().slice(0,50), cls: el.className.toString().slice(0,40),
                       sw: el.scrollWidth, cw: el.clientWidth })
  }
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dsf: window.devicePixelRatio },
    tokens, fonts, weights, lineHeights: lines, gaps, paddings: pads, radii,
    key: {
      workspace: one('.ts-workspace'), team: one('.ts-col-team'), center: one('.ts-col-center'),
      right: one('.ts-col-right'), rail: one('.ts-rail'), toolbar: one('.ts-toolbar'),
      dock: one('.ts-dock'), strip: one('.ts-strip'), row: one('.ts-row'),
      card: one('.ts-card'), sheet: one('.ts-sheet[data-open="true"]'),
      addpop: one('.ts-addpop'), mentions: one('[data-hive-mentions]'),
      tabstrip: one('.ts-col-right .overflow-x-auto'),
      narrow: one('.ts-narrow-only'),
      composer: one('[data-hive-composer] textarea, [data-hive-composer] > div > div'),
      railbuttons: all('.ts-rail .ts-railbutton')
    },
    rows: all('.ts-row'), tabstripTabs: all('.ts-col-right .overflow-x-auto > *'),
    toolbarControls: all('.ts-toolbar > *'),
    clipped, truncated
  }
})()`

/* ── minimal CDP client over the DevTools WebSocket ───────────────────────── */
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

async function main () {
  fs.mkdirSync(OUTDIR, { recursive: true })
  const profile = '/Users/adnan/.hermes/profiles/sentry/cache/scratch/p15-chrome'
  fs.rmSync(profile, { recursive: true, force: true })

  const args = ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', '--force-color-profile=srgb', '--font-render-hinting=none',
    `--force-device-scale-factor=${DSF}`, 'about:blank']
  const chrome = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let started = null
  for (let i = 0; i < 60 && !started; i++) {
    await sleep(250)
    try { started = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json() } catch {}
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
    const name = `p15-${cap.w}-${cap.state}-${cap.theme}`
    if (ONLY && !name.includes(ONLY)) continue
    const htmlPath = path.join(OUTDIR, `h-${cap.w}-${cap.theme}-${cap.state}.html`)
    const gen = spawn(process.execPath, [HARNESS, `--width=${cap.w}`, `--theme=${cap.theme}`,
      `--state=${cap.state}`, `--app-w=${cap.appW}`, `--out=${htmlPath}`], { encoding: 'utf8' })
    await new Promise((res, rej) => { gen.on('exit', (c) => c === 0 ? res() : rej(new Error('harness exit ' + c))); gen.on('error', rej) })

    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: cap.w, height: VIEW_H, deviceScaleFactor: DSF, mobile: false }, sessionId)
    await cdp.send('Page.navigate', { url: 'file://' + htmlPath }, sessionId)
    await sleep(350)
    await cdp.send('Runtime.evaluate', { expression: 'new Promise(r=>setTimeout(r,120))', awaitPromise: true }, sessionId)

    const measured = await cdp.send('Runtime.evaluate',
      { expression: MEASURE, returnByValue: true }, sessionId)
    const shot = await cdp.send('Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false, fromSurface: true }, sessionId)
    const png = path.join(OUTDIR, name + '.png')
    fs.writeFileSync(png, Buffer.from(shot.data, 'base64'))
    const rec = { name, png, ...cap, measured: measured.result.value }
    results.push(rec)
    fs.writeFileSync(path.join(OUTDIR, 'p15-measurements.json'), JSON.stringify(results, null, 2))
    console.log(`ok ${name}  ${fs.statSync(png).size} bytes  sheet=${JSON.stringify(rec.measured.key.sheet && rec.measured.key.sheet.rect)}`)
  }
  ws.close(); chrome.kill('SIGTERM')
  console.log(`\ncaptured ${results.length}/${CAPS.length} (filter: ${ONLY || 'none'})`)
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
