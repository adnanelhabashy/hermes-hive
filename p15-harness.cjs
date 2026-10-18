#!/usr/bin/env node
/* P1.5 SENTRY harness — renders the Team Studio workspace as a static page so
   the WIDTH/THEME regimes can be captured deterministically.

   FIDELITY CONTRACT (state this in the critique):
     - HIVE_TS_CSS is extracted VERBATIM from the plugin under test  -> the
       plugin's own layer (.ts-*) is exact.
     - the real Hermes desktop stylesheet is linked              -> every
       --ui-* / --theme-* token, every Tailwind utility the plugin uses, and
       the light (`:root`) vs dark (`.dark`) token sets are exact.
     - the DOM is a hand-built replica of the render tree at HEAD. The .ts-*
       STRUCTURE (columns, strips, rows, rail, sheets, dock) is exact; the
       SDK primitives inside it (Button/Tabs/Input/Badge/StatusDot/ScrollArea,
       which live in the app bundle, not in this repo) are approximated.
       => trustworthy for grid/rail/sheet/width behaviour and for token
          colour, NOT for judging SDK-primitive chrome.

   Usage: node p15-harness.cjs --width=1512 --theme=dark --state=full --out=FILE
          --width   viewport width  == app WINDOW width (media queries evaluate
                    on the viewport, so this must be the window width)
          --theme   dark | light
          --state   full | empty | sheet-team | sheet-right | agent-detail
                    | addpop | mention | tab-activity | tab-files
                    | tab-approvals | tab-workflow
          --app-w   the plugin surface width; defaults to width-56 (what the
                    real app gives a route page with both rails collapsed)
*/
'use strict'
const fs = require('fs')
const path = require('path')

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.slice(n.length + 3) : d
}
const WIDTH = parseInt(arg('width', '1512'), 10)
const THEME = arg('theme', 'dark')
const STATE = arg('state', 'full')
const APPW = parseInt(arg('app-w', String(WIDTH - 56)), 10)
const OUT = path.resolve(arg('out', path.join(__dirname, `p15-harness-${WIDTH}-${THEME}-${STATE}.html`)))
const PLUGIN = path.resolve(arg('plugin', path.join(process.env.HOME, 'Developer/hive-team-studio/worktree/plugin.js')))
const APP_CSS = '/Applications/Hermes.app/Contents/Resources/app.asar.unpacked/dist/assets/index-B89n1Ils.css'

const src = fs.readFileSync(PLUGIN, 'utf8')
const css = src.match(/const HIVE_TS_CSS = `([\s\S]*?)`\n/)[1]

const T = (sz) => `style="font-size:${sz}px;line-height:${sz + 4}px"`
const dot = '<span style="width:6px;height:6px;border-radius:999px;flex-shrink:0;display:inline-block;background:var(--ui-green)"></span>'
const dotIdle = '<span style="width:6px;height:6px;border-radius:999px;flex-shrink:0;display:inline-block;background:var(--ui-text-quaternary)"></span>'
const avatar = (ch, hue) => `<span class="ts-avatar" style="background:${hue};color:#fff">${ch}</span>`

const MEMBERS = [
  { p: 'default', ch: 'D', hue: 'hsl(210 70% 45%)', meta: 'no model' },
  { p: 'arch', ch: 'A', hue: 'hsl(265 60% 50%)', meta: 'no model' },
  { p: 'forge', ch: 'F', hue: 'hsl(150 55% 38%)', meta: 'no model' }
]

const strip = (label, right = '') => `<div class="ts-strip"><span class="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">${label}</span><span class="flex-1"></span>${right}</div>`

const youRow = () => `<div class="ts-row" data-role="you" title="You are always in the room">
  ${avatar('y', 'hsl(330 65% 52%)')}
  <span class="ts-team-body flex min-w-0 flex-1 items-center gap-1.5">${dot}<span class="text-xs font-semibold">you</span><span class="truncate text-muted-foreground" ${T(10)}>always delivers</span></span>
</div>`

const agentRow = (m, selected) => `<div class="ts-row" data-selected="${selected ? 'true' : 'false'}" data-agent="${m.p}" title="@${m.p}">
  ${avatar(m.ch, m.hue)}
  <span class="ts-team-body flex min-w-0 flex-1 flex-col gap-0.5">
    <span class="flex min-w-0 items-center gap-1.5">${dotIdle}<span class="truncate text-xs font-semibold">@${m.p}</span></span>
    <span class="truncate text-muted-foreground" ${T(10)}>${m.meta}</span>
  </span>
  <span class="ts-team-body shrink-0 text-muted-foreground" ${T(10)}>${selected ? '&#9662;' : '&#9656;'}</span>
</div>`

/* TsAgentDetail, verbatim structure (plugin.js:3217) */
const agentDetail = (p) => `<div class="ts-card m-1 flex flex-col gap-1.5" data-ts-agent-detail="${p}">
  <div class="flex flex-col gap-0.5" ${T(10)}>
    <span class="text-muted-foreground">model: <span class="text-(--ui-text-primary)">inherits the profile default</span></span>
    <span class="text-muted-foreground">context: <span class="text-(--ui-text-primary)">shared</span></span>
    <span class="text-muted-foreground">session: <span class="text-(--ui-text-primary)">live-3</span></span>
    <span class="text-muted-foreground">status: <span class="text-(--ui-text-primary)">idle</span></span>
  </div>
  <div class="flex flex-col gap-0.5">
    <span class="font-medium text-muted-foreground" ${T(10)}>Open work items</span>
    <div class="flex items-center gap-1.5" ${T(10)}><span class="font-mono text-muted-foreground">#a41f9c</span><span class="font-semibold" style="color:var(--ui-yellow)">IN REVIEW</span><span class="min-w-0 flex-1 truncate">Semicolon essay: verify the 1494 date</span></div>
  </div>
  <div class="flex flex-wrap items-center gap-1">
    ${['Stop', 'View session', 'Mute', 'Grant browser', 'Mark leader', 'Fresh context', 'Remove'].map((l) => `<button type="button" style="font-size:11px;line-height:15px;padding:2px 8px;border:1px solid var(--ui-stroke-secondary);border-radius:6px;background:transparent;color:var(--ui-text-primary)">${l}</button>`).join('')}
  </div>
  <div class="flex items-center gap-2" ${T(10)}><span class="text-muted-foreground">context</span><span class="text-(--ui-text-primary)">shared</span></div>
  <div class="flex items-center gap-2" ${T(10)}><span class="text-muted-foreground">model</span><span class="text-(--ui-text-primary)">inherit</span></div>
</div>`

/* HiveAddMember popover, real classes (plugin.js:2705). The open state always
   carries a fresh profile list (load() runs on open), so a cold-cache empty
   list is not the state under review. */
const ADDPOP = `<div class="ts-addpop w-64 rounded-lg border bg-background p-2 shadow-lg">
  <div class="mb-1 flex items-center justify-between">
    <div class="text-xs font-medium">Add agent</div>
    <button type="button" aria-label="Close" style="font-size:13px;opacity:.7">&#10005;</button>
  </div>
  <div class="flex flex-col gap-1.5">
    <input class="mb-1 text-xs" placeholder="Search profiles…" style="height:26px;padding:0 6px;border:1px solid var(--ui-stroke-secondary);border-radius:6px;background:transparent;color:var(--ui-text-primary)">
    <div class="flex flex-col" style="gap:2px;max-height:220px;overflow-y:auto">
      ${[['toddy', 'hsl(210 70% 45%)', 'deepseek-v4.1-flash'], ['writer', 'hsl(150 55% 38%)', 'deepseek-v3'], ['atlas', 'hsl(20 65% 50%)', 'no model']].map(([n, c, m]) => `<button type="button" class="justify-start text-xs" style="display:flex;align-items:center;gap:6px;text-align:left;width:100%;font-size:11px;padding:3px 6px;border-radius:6px"><span class="rounded-full" style="width:6px;height:6px;background:${c}"></span><span style="color:${c}">@${n}</span><span class="text-muted-foreground" ${T(10)}>${m}</span></button>`).join('')}
    </div>
    <div class="mt-1 border-t pt-1"></div>
    <button type="button" class="justify-start text-xs" style="text-align:left;width:100%;font-size:11px;padding:3px 6px;border-radius:6px">+ New profile…</button>
  </div>
</div>`

const teamPanel = (opts) => `<div class="ts-col ts-col-team" data-ts-team="true">
  ${strip('Team', `<span class="text-muted-foreground" ${T(10)}>${opts.bare ? '1/11' : '4/11'}</span>`)}
  <div class="ts-scroll"><div class="flex flex-col">
    ${youRow()}
    ${opts.bare ? '' : MEMBERS.map((m) => agentRow(m, opts.expanded === m.p) + (opts.expanded === m.p ? agentDetail(m.p) : '')).join('')}
  </div></div>
  <div class="ts-dock">
    <div class="relative">${opts.addpop ? ADDPOP : ''}<button type="button" style="font-size:11px;line-height:15px;padding:2px 10px;border:1px solid var(--ui-stroke-secondary);border-radius:6px"><span>+ Add</span></button></div>
    <span class="text-muted-foreground" ${T(10)}>${opts.bare ? '0 member(s)' : '3 member(s)'}</span>
  </div>
</div>`

/* ---- center column ---- */
const cardUser = (text, who, time) => `<div class="ts-entrygroup px-2 py-1">
  <div class="flex items-center gap-1.5 mb-1"><span class="text-xs font-semibold">@${who}</span><span class="text-muted-foreground" ${T(10)}>${time}</span></div>
  <div class="ts-card" style="border-left:2px solid var(--ui-accent)" ${T(11)}>${text}</div>
</div>`

const cardAgent = (who, time, dur, body) => `<div class="ts-entrygroup px-2 py-1">
  <div class="flex items-center gap-1.5 mb-1">${dot}<span class="text-xs font-semibold">@${who}</span><span class="text-muted-foreground" ${T(10)}>✓ done · ${time} · ${dur}</span><button type="button" class="ml-auto" style="font-size:10px;opacity:0">copy</button></div>
  <div class="ts-card" ${T(11)}>${body}</div>
</div>`

const relayRow = (a, b, time) => `<div class="px-2 py-0.5" ${T(10)}><span class="font-mono text-muted-foreground">@YOU → @${b}</span> <span style="color:var(--ui-purple)">⤷ RELAY</span> <span class="text-muted-foreground">${time}</span></div>`

const taskCard = (label, id, status, tone, title) => `<div class="ts-linkcard m-1" ${T(10)}>
  <span class="font-semibold" style="color:${tone}">${label}</span>
  <span class="font-mono text-muted-foreground ml-1">#${id}</span>
  <span class="ml-1 truncate">${title}</span></div>`

const ESSAY = `<h3 style="margin:0 0 4px">The Semicolon: A History</h3>
<p style="margin:0 0 4px">The semicolon was born in 1494, in the workshop of the Venetian printer Aldus Manutius. It was a humanist's punctuation: a pause between the comma's breath and the period's full stop.</p>
<p style="margin:0">For over a century the mark struggled for acceptance. English printers treated it as an Italian affectation, and it only settled into the trade once the great eighteenth-century houses set it as a house rule rather than a scholar's preference.</p>`

/* HiveComposer + the @-mention picker, real classes (plugin.js:2546). The
   picker opens UPWARD from the composer (bottom-full) and the active row is a
   filled `default` Button. */
const MENTION = `<div class="absolute bottom-full left-2 right-2 z-20 max-h-48 overflow-y-auto rounded-md border bg-background p-1 shadow-lg" data-hive-mentions="true">
  ${['@default', '@arch', '@forge', '@you'].map((n, i) => `<button type="button" class="w-full justify-start text-xs" style="display:block;text-align:left;width:100%;font-size:12px;padding:4px 8px;border-radius:6px;${i === 1 ? 'background:var(--ui-accent);color:var(--ui-bg-primary);font-weight:500' : ''}">${n}</button>`).join('')}
</div>`

const center = (opts) => `<div class="ts-col ts-col-center" data-ts-center="true">
  <div class="flex min-h-0 min-w-0 grow flex-col">
    <div class="mx-2 mt-1 flex items-center gap-1">
      <button type="button" class="ts-railbutton" data-active="true" style="width:auto;padding:0 8px;font-size:11px" title="Feed"><span>Work</span></button>
      <button type="button" class="ts-railbutton" style="width:auto;padding:0 8px;font-size:11px" title="By agent"><span>By agent</span></button>
      <button type="button" class="ts-railbutton" style="width:auto;padding:0 8px;font-size:11px" title="Feed"><span>Feed</span></button>
      <span class="flex-1"></span>
      <input class="h-6 w-40 text-xs" style="border:1px solid var(--ui-stroke-secondary);border-radius:6px;background:transparent;padding:0 6px" placeholder="Filter the feed…" aria-label="Filter the conversation feed">
    </div>
    <div class="ts-scroll flex-col" style="display:flex">
      ${opts.empty
        ? `<div class="p-6 text-center text-muted-foreground" style="font-size:11px">No activity yet. Message @default or add agents to start the crew.</div>`
        : `${cardUser('write a detailed 400-word essay on the history of the semicolon, with at least one quote from a real source.', 'you', '11:54 PM')}
           ${relayRow('you', 'ARCH', '11:54 PM')}
           ${cardAgent('ARCH', '11:54 PM', '1m 20s', ESSAY)}
           ${taskCard('TASK', 'a41f9c', 'submitted', 'var(--ui-yellow)', 'Verify the 1494 attribution against sources')}
           ${cardAgent('ARCH', '11:56 PM', '2m 4s', '<p style="margin:0">Verdict: the 1494 date does not hold up. The earliest attested printing is the February 1495 Venetian calendar; the text traces back to <i>De Aetna</i> (September 1494). Fix the citation or drop the year.</p>')}
           <div class="px-2 py-1" ${T(10)}><span style="color:var(--ui-red)">⛔ held 1 relay(s) from @arch — relay chain reached its depth limit</span></div>
           ${cardUser('use skills like ✦ omh-frontend ✦ omh-design-quality-gate — i want it premium and polished and appealing and fully functional', 'you', '1:58 PM')}`}
    </div>
    <div class="relative border-t p-2 flex flex-col gap-1.5" data-hive-composer="true">
      ${opts.mention ? MENTION : ''}
      <div class="flex items-center gap-1 flex-wrap mb-1">
        <span ${T(10)} class="text-muted-foreground">Route:</span>
        ${['[to @name]', '[ask @name]', '[all]'].map((c) => `<button type="button" class="ts-linkcard" ${T(10)}>${c}</button>`).join('')}
      </div>
      <div class="flex items-start gap-1">
        <div style="flex:1;min-height:56px;border:1px solid var(--ui-stroke-secondary);border-radius:6px;padding:6px 8px" ${T(14)} class="text-muted-foreground">${opts.mention ? '@' : '@name to direct · [all] to broadcast – or just talk to the room…'}</div>
        <button type="button" style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--ui-stroke-secondary)">Send</button>
      </div>
      <div class="mt-1 text-muted-foreground" ${T(10)}>Enter ↵ send · Shift+↵ newline · @ tag · ↑↓ pick</div>
    </div>
  </div>
</div>`

/* ---- right column: tabs ---- */
const TABS = ['Tasks', 'Activity', 'Files', 'Approvals', 'Workflow']
const dash = (msg) => `<div style="margin:8px;border:1px dashed var(--ui-stroke-secondary);border-radius:8px;padding:16px;text-align:center" class="text-muted-foreground" ${T(11)}>${msg}</div>`
const rightBody = (tab) => {
  if (tab === 'tasks') return `<div class="flex flex-col gap-1 p-2" ${T(11)}>
      <div class="ts-card flex flex-col gap-0.5"><span class="font-medium text-xs">Board</span>
        <span class="text-muted-foreground" ${T(10)}>Durable tasks live in native Kanban (board \`team\`) — no desktop surface exists for it, so ask an agent: @atlas show the board.</span>
        <span class="text-muted-foreground" ${T(10)}>These rows are this room's work items. Dependencies, branch/worktree links and error reasons arrive with the Phase 4 kanban adapter.</span></div>
      <div class="ts-card flex flex-col gap-1" style="border-left:2px solid var(--ui-yellow)">
        <div class="flex items-center gap-2" ${T(10)}><span class="font-mono text-muted-foreground">#a41f9c</span><span class="font-semibold uppercase tracking-wide" style="color:var(--ui-yellow)">IN REVIEW</span><span class="ml-auto truncate text-muted-foreground">@arch → @forge</span></div>
        <div class="min-w-0 break-words text-xs">Verify the 1494 attribution against sources</div></div>
    </div>`
  if (tab === 'activity') return `<div class="flex flex-col gap-1 p-2" ${T(11)}>
      <span class="text-muted-foreground" ${T(10)}>Tools, work items and room events only — no prose. Read-only.</span>
      <div class="ts-card" ${T(10)}><span class="font-mono text-muted-foreground">web_search</span> · @arch · ok</div>
      <div class="ts-card" ${T(10)}><span class="font-mono text-muted-foreground">file_read</span> · @arch · ok</div>
    </div>`
  if (tab === 'files') return `<div class="flex flex-col gap-1.5 p-2" ${T(11)}>
      <span class="text-muted-foreground" ${T(10)}>No project selected — pick one in the toolbar to list its folders.</span>
      <button type="button" class="ts-linkcard"><span class="flex items-center gap-1.5" ${T(10)}>Open the native Files pane</span></button>
      <span class="break-words text-muted-foreground" ${T(10)}>no room folder set</span>
    </div>`
  if (tab === 'approvals') return `<div class="flex flex-col gap-1 p-2" ${T(11)}>
      <span class="text-muted-foreground" ${T(10)}>A convenience mirror — the app's own modal still owns live approval prompts. Choices come from the server verbatim.</span>
      ${dash('No pending approvals.')}
    </div>`
  return `<div class="flex flex-col gap-1 p-2" ${T(11)}>
      <span class="text-muted-foreground" ${T(10)}>Read-only mirror. Gate release and run creation stay on the Workflows page (the workflow engine owns them).</span>
      ${dash('No workflow runs yet.')}
    </div>`
}
const rightPanel = (tab) => `<div class="ts-col ts-col-right" data-ts-right="true">
  <div class="ts-right-body flex min-h-0 grow flex-col">
    ${strip('Work', '')}
    <div class="gap-0">
      <div class="mx-2 mt-1 h-7 w-auto max-w-[calc(100%-1rem)] justify-start gap-0.5 overflow-x-auto p-0.5 flex items-center" style="background:var(--ui-bg-tertiary);border-radius:8px">
        ${TABS.map((t) => `<span style="font-size:11px;line-height:24px;padding:0 6px;border-radius:6px;${t === tab ? 'background:var(--ui-bg-primary);color:var(--ui-text-primary);font-weight:500' : 'color:var(--ui-text-secondary)'}">${t}</span>`).join('')}
      </div>
    </div>
    <div class="flex min-h-0 grow flex-col">${rightBody(tab)}</div>
  </div>
  <div class="ts-rail" data-ts-rail="true">
    ${TABS.map((t, i) => `<button type="button" class="ts-railbutton" data-active="${i === TABS.indexOf(tab) ? 'true' : 'false'}" title="${t}" aria-label="${t}"><span style="font-size:10px">${t.slice(0, 2)}</span></button>`).join('')}
  </div>
</div>`

const toolbar = (opts) => `<div class="ts-toolbar" data-ts-toolbar="true">
  <span class="text-xs font-semibold">hive</span>
  <span class="text-muted-foreground" ${T(10)}>Projects unavailable</span>
  <span class="flex-1"></span>
  <button type="button" class="ts-railbutton" style="width:auto;padding:0 8px;font-size:11px">Teams</button>
  <button type="button" class="ts-railbutton" style="width:auto;padding:0 8px;font-size:11px">Stop all</button>
  <button type="button" class="ts-railbutton" style="width:auto;padding:0 8px;font-size:11px">Reset</button>
  <span class="text-muted-foreground" ${T(10)}>ready</span>
  <button type="button" class="ts-railbutton" style="width:auto;padding:0 8px;font-size:11px">Settings</button>
  <button type="button" class="ts-narrow-only ts-railbutton" title="Team panel" aria-label="Team panel">T</button>
  <button type="button" class="ts-narrow-only ts-railbutton" title="Work panel" aria-label="Work panel">W</button>
</div>`

const dock = () => `<div class="ts-dock" data-ts-dock="closed">
  <button type="button" style="font-size:11px;padding:2px 8px;border-radius:6px">Dock</button>
  <span class="text-muted-foreground" ${T(10)}>Native terminal / logs / sessions / review live in their own panes — open them from here.</span>
</div>`

const sheet = (side, inner) => `<div class="ts-sheet" data-side="${side}" data-open="true">${inner}</div>`

const states = {
  full: () => ({ expanded: null, sheet: null, rightTab: 'tasks', empty: false, bare: false }),
  empty: () => ({ expanded: null, sheet: null, rightTab: 'tasks', empty: true, bare: true }),
  'agent-detail': () => ({ expanded: 'arch', sheet: null, rightTab: 'tasks', empty: false, bare: false }),
  addpop: () => ({ expanded: null, sheet: null, rightTab: 'tasks', empty: false, bare: false, addpop: true }),
  mention: () => ({ expanded: null, sheet: null, rightTab: 'tasks', empty: false, bare: false, mention: true }),
  'sheet-team': () => ({ expanded: null, sheet: 'team', rightTab: 'tasks', empty: false, bare: false }),
  'sheet-right': () => ({ expanded: null, sheet: 'right', rightTab: 'tasks', empty: false, bare: false }),
  'tab-activity': () => ({ expanded: null, sheet: null, rightTab: 'activity', empty: false, bare: false }),
  'tab-files': () => ({ expanded: null, sheet: null, rightTab: 'files', empty: false, bare: false }),
  'tab-approvals': () => ({ expanded: null, sheet: null, rightTab: 'approvals', empty: false, bare: false }),
  'tab-workflow': () => ({ expanded: null, sheet: null, rightTab: 'workflow', empty: false, bare: false })
}
const opts = (states[STATE] || states.full)()

const body = `<div class="ts-workspace" data-ts-workspace="true">
  ${toolbar(opts)}
  ${teamPanel(opts)}
  ${center(opts)}
  ${rightPanel(opts.rightTab)}
  ${dock()}
  ${opts.sheet === 'team' ? sheet('team', teamPanel(opts)) : ''}
  ${opts.sheet === 'right' ? sheet('right', rightPanel(opts.rightTab)) : ''}
</div>`

/* ── pinned runtime palette ─────────────────────────────────────────────────
   The app sets --theme-* on <html> at RUNTIME from the active skin (see
   context-BRCtUBSa.js `en()`), so the frozen stylesheet alone cannot reproduce
   the palette: every --ui-bg-* is a color-mix of a seed this repo does not own.
   These values are SAMPLED FROM THE LIVE APP RENDER (p15-1512-timeline-dark,
   dsf=1) so the captures look like the app instead of like an unpainted shell.
   Sampled: panel #2b243b (43,36,59 measured in the team AND right columns),
   feed/canvas #0e0f13 (14,15,19), selected row #44345b (68,52,91), accent
   #a34bff (163,75,255, the Send button). Light mode has no live capture to
   sample (this machine runs dark only) and uses the app's own static :root
   values over a neutral canvas. Structure, type, spacing and media queries stay
   exact in every capture; absolute colour is pinned here, not invented. */
const PALETTE = {
  dark: {
    '--ui-bg-primary': '#0e0f13', '--ui-bg-secondary': '#2b243b', '--ui-bg-tertiary': '#38304d',
    '--ui-bg-quaternary': '#241d33', '--ui-bg-quinary': '#1c1728',
    '--ui-bg-card': '#241d33', '--ui-bg-elevated': '#2b243b', '--ui-bg-input': '#14161c',
    '--ui-text-primary': '#e0e6ee', '--ui-text-secondary': '#b7b2c4', '--ui-text-tertiary': '#8d8899',
    '--ui-text-quaternary': '#6d6879',
    '--ui-stroke-secondary': '#3a3348', '--ui-stroke-tertiary': '#2f2a3a',
    '--ui-row-hover-background': '#352d47', '--ui-row-active-background': '#44345b',
    '--ui-control-hover-background': '#352d47', '--ui-control-active-background': '#44345b',
    '--ui-accent': '#a34bff', '--ui-accent-secondary': '#a34bff',
    '--ui-red': '#e75e78', '--ui-green': '#55a583', '--ui-yellow': '#c08532',
    '--ui-purple': '#9e94d5', '--ui-orange': '#db704b', '--ui-warm': '#cf806d',
    '--dt-muted-foreground': '#8d8899'
  },
  light: {
    '--ui-bg-primary': '#fbfbfd', '--ui-bg-secondary': '#f2f0f6', '--ui-bg-tertiary': '#e9e6f0',
    '--ui-bg-quaternary': '#ffffff', '--ui-bg-quinary': '#faf9fc',
    '--ui-bg-card': '#ffffff', '--ui-bg-elevated': '#ffffff', '--ui-bg-input': '#ffffff',
    '--ui-text-primary': '#17171a', '--ui-text-secondary': '#4a4750', '--ui-text-tertiary': '#6b6875',
    '--ui-text-quaternary': '#8c8995',
    '--ui-stroke-secondary': '#dcd8e4', '--ui-stroke-tertiary': '#e6e3ec',
    '--ui-row-hover-background': '#eeebf5', '--ui-row-active-background': '#e4e0ee',
    '--ui-control-hover-background': '#eeebf5', '--ui-control-active-background': '#e4e0ee',
    '--ui-accent': '#0053fd', '--ui-accent-secondary': '#0053fd',
    '--ui-red': '#cf2d56', '--ui-green': '#1f8a65', '--ui-yellow': '#c08532',
    '--ui-purple': '#9e94d5', '--ui-orange': '#db704b', '--ui-warm': '#cf806d',
    '--dt-muted-foreground': '#6b6875'
  }
}
const PAL = arg('palette', 'live')
const palCss = PAL === 'off' ? '' : ':root{' + Object.entries(PALETTE[THEME] || {})
  .map(([k, v]) => `${k}:${v}`).join(';') + '}'

const html = `<!doctype html><html class="${THEME === 'dark' ? 'dark' : ''}" style="height:100%"><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${APP_CSS}">
<style>${palCss}</style>
<style id="buzz-hive-team-studio">${css}</style>
<style>
  /* The plugin's own layer (.ts-*) is exact and the app stylesheet is the real
     one, but the app sets --theme-* at RUNTIME from the active skin and paints
     them over an opaque window backdrop. A static page has no such backdrop, so
     a translucent --ui-bg-* token would composite over the browser's white
     canvas and wash every capture. Paint the opaque backdrop the layers expect:
     a near-black sampled from the live dark capture (#080810/#0c0f15) for dark,
     and near-white for light. Absolute colour values in these captures are
     therefore harness-constructed; relative/structural colour, geometry, type
     and spacing are faithful. */
  html,body{margin:0;height:100%;background:${THEME === 'dark' ? '#0b0d12' : '#fbfbfd'};color:var(--ui-text-primary);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  #surface{width:${APPW}px;height:${Math.max(400, 918 - 34)}px;display:block}
</style></head>
<body><div id="surface">${body}</div></body></html>`

fs.writeFileSync(OUT, html)
console.log(`plugin css : ${css.length} bytes`)
console.log(`viewport   : ${WIDTH}px  plugin surface: ${APPW}px  theme: ${THEME}  state: ${STATE}`)
console.log(`wrote      : ${OUT}`)
